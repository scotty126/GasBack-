-- ============================================================
-- GasBack — Migration 001: hardening + real reward formula
-- Run AFTER database/schema.sql. Non-destructive. Safe to re-run.
--
-- What this does
--   * carbon_params      dated, append-only reward/carbon parameters (latest row wins)
--   * reserve_funding    pre-funded reward reserve; points issued may never exceed it
--   * merchants          real partner stations (replaces the hardcoded list in the UI)
--   * vouchers           one row per issued voucher (unique code, status)
--   * scan_attempts      per-user / per-device rate limiting + abuse signals
--   * receipts           new verification columns (hashes, EXIF flag, price, date, CO2e)
--   * award_receipt()    ATOMIC: dedupe + reserve check + receipt + wallet + ledger
--   * redeem_points()    ATOMIC: balance check + voucher + wallet + ledger
--   * RLS               browsers can no longer insert/update receipts; money writes
--                        happen only through the two functions, via the service role
--
-- Duplicate detection: exact image SHA-256 + OCR identity (invoice+vendor[+date]).
-- A perceptual image hash was tried and rejected: on receipts (thin text on uniform paper)
-- it could not separate re-photos of one receipt (13–36 bits apart) from different receipts on
-- the same template (2–18 bits apart).
--
-- Unit: 1 point = ₦1 of refill discount (fixed). Points per refill come from
-- carbon_params: co2e × price/1000 × user_share × fx, rounded down.
-- ============================================================

-- ── 1. Parameters ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS carbon_params (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  effective_from      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  kg_co2e_per_kg_lpg  NUMERIC(8,4)  NOT NULL CHECK (kg_co2e_per_kg_lpg > 0),
  price_usd_per_tco2e NUMERIC(10,2) NOT NULL CHECK (price_usd_per_tco2e > 0),
  price_as_of         DATE          NOT NULL,
  price_source        TEXT          NOT NULL,
  user_share          NUMERIC(4,3)  NOT NULL CHECK (user_share >= 0 AND user_share <= 1),
  fx_ngn_per_usd      NUMERIC(10,2) NOT NULL CHECK (fx_ngn_per_usd > 0),
  fx_as_of            DATE          NOT NULL,
  min_redeem_points   INTEGER       NOT NULL CHECK (min_redeem_points > 0),
  note                TEXT,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
ALTER TABLE carbon_params ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "carbon_params_public_read" ON carbon_params;
-- Parameters are public by design: the methodology page shows them.
CREATE POLICY "carbon_params_public_read" ON carbon_params FOR SELECT USING (true);

-- ── 2. Reward reserve (service role only; no policies = no client access) ──
CREATE TABLE IF NOT EXISTS reserve_funding (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  amount_ngn  NUMERIC(14,2) NOT NULL CHECK (amount_ngn > 0),
  note        TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
ALTER TABLE reserve_funding ENABLE ROW LEVEL SECURITY;

-- ── 3. Merchants ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchants (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  city        TEXT        NOT NULL,
  address     TEXT,
  active      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, city)
);
ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "merchants_read_active" ON merchants;
CREATE POLICY "merchants_read_active" ON merchants FOR SELECT USING (active);

-- ── 4. Vouchers ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vouchers (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT          NOT NULL UNIQUE,
  user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_id  UUID          NOT NULL REFERENCES merchants(id),
  points       NUMERIC(12,4) NOT NULL CHECK (points > 0),
  naira_value  NUMERIC(12,2) NOT NULL CHECK (naira_value > 0),
  status       TEXT          NOT NULL DEFAULT 'ISSUED' CHECK (status IN ('ISSUED','REDEEMED','CANCELLED')),
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  redeemed_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_vouchers_user ON vouchers(user_id, created_at DESC);
ALTER TABLE vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "vouchers_select_own" ON vouchers;
CREATE POLICY "vouchers_select_own" ON vouchers FOR SELECT USING (auth.uid() = user_id);

-- ── 5. Scan attempts (rate limiting / abuse signals; service role only) ──
CREATE TABLE IF NOT EXISTS scan_attempts (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     UUID        NOT NULL,
  device_id   TEXT,
  outcome     TEXT        NOT NULL DEFAULT 'STARTED',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_scan_attempts_user   ON scan_attempts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_scan_attempts_device ON scan_attempts(device_id, created_at DESC);
ALTER TABLE scan_attempts ENABLE ROW LEVEL SECURITY;

-- ── 6. Receipt columns ──────────────────────────────────────
-- image_url now holds the private-bucket object path ("<user_id>/<file>"), not a public URL.
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS amount_ngn       NUMERIC(12,2);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS receipt_at       TIMESTAMPTZ;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS co2e_kg          NUMERIC(12,4);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS gross_value_usd  NUMERIC(12,6);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS points_awarded   NUMERIC(12,4);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS params_id        BIGINT REFERENCES carbon_params(id);
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS image_sha256     TEXT;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS exif_present     BOOLEAN;
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS device_id        TEXT;

-- The old unique index covered FLAGGED rows too, so recording a fraudulent
-- duplicate attempt (same invoice+vendor, status FLAGGED) violated it and the
-- audit row was silently never written. Uniqueness is now enforced on VERIFIED only.
DROP INDEX IF EXISTS idx_receipts_invoice_vendor;
-- Known vendor: invoice numbers are unique per vendor.
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_verified_invoice_vendor
  ON receipts (invoice_num, vendor_name)
  WHERE status = 'VERIFIED' AND vendor_name <> 'unknown_vendor';
-- Unknown vendor: invoice numbers repeat across stations, so also key on the receipt date.
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_verified_invoice_unknown
  ON receipts (invoice_num, ((receipt_at AT TIME ZONE 'UTC')::date))
  WHERE status = 'VERIFIED' AND vendor_name = 'unknown_vendor';
CREATE UNIQUE INDEX IF NOT EXISTS idx_receipts_verified_sha256
  ON receipts (image_sha256)
  WHERE status = 'VERIFIED' AND image_sha256 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_device ON receipts(device_id);

-- ── 7. RLS: no browser writes to receipts, wallets or ledger ──
DROP POLICY IF EXISTS "receipts_insert" ON receipts;
DROP POLICY IF EXISTS "receipts_update" ON receipts;

-- ── 8. award_receipt: the only way points are created ───────
CREATE OR REPLACE FUNCTION public.award_receipt(
  p_user_id        UUID,
  p_image_path     TEXT,
  p_vendor         TEXT,
  p_invoice        TEXT,
  p_volume_kg      NUMERIC,
  p_amount_ngn     NUMERIC,
  p_receipt_at     TIMESTAMPTZ,
  p_sha256         TEXT,
  p_exif_present   BOOLEAN,
  p_device_id      TEXT
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_params   carbon_params%ROWTYPE;
  v_wallet   wallets%ROWTYPE;
  v_dup      receipts%ROWTYPE;
  v_co2e     NUMERIC;
  v_gross    NUMERIC;
  v_points   NUMERIC;
  v_funded   NUMERIC;
  v_issued   NUMERIC;
  v_receipt  UUID;
  v_balance  NUMERIC;
BEGIN
  -- Serialise all awards: dedupe + reserve accounting must see a consistent view.
  -- Fine at pilot scale (one short transaction); revisit if award rate gets high.
  PERFORM pg_advisory_xact_lock(hashtext('gasback:award'));

  SELECT * INTO v_params FROM carbon_params ORDER BY effective_from DESC, id DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_CONFIGURED');
  END IF;

  SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_WALLET');
  END IF;

  -- Duplicate checks (any user): same invoice+vendor, or the exact same image bytes.
  SELECT * INTO v_dup FROM receipts
   WHERE status = 'VERIFIED'
     AND ( (invoice_num = p_invoice AND vendor_name = p_vendor
            AND (p_vendor <> 'unknown_vendor'
                 OR (receipt_at AT TIME ZONE 'UTC')::date = (p_receipt_at AT TIME ZONE 'UTC')::date))
        OR image_sha256 = p_sha256 )
   LIMIT 1;

  IF FOUND THEN
    INSERT INTO receipts (user_id, image_url, vendor_name, invoice_num, volume_kg, amount_ngn,
                          receipt_at, status, rejection_reason, image_sha256,
                          exif_present, device_id, processed_at)
    VALUES (p_user_id, p_image_path, p_vendor, p_invoice, p_volume_kg, p_amount_ngn,
            p_receipt_at, 'FLAGGED',
            'Duplicate of receipt ' || v_dup.id || ' (submitted by user ' || v_dup.user_id || ')',
            p_sha256, p_exif_present, p_device_id, NOW());
    RETURN jsonb_build_object('ok', false, 'code', 'DUPLICATE_RECEIPT');
  END IF;

  -- Reward from the current dated parameters.
  v_co2e   := ROUND(p_volume_kg * v_params.kg_co2e_per_kg_lpg, 4);
  v_gross  := (v_co2e / 1000) * v_params.price_usd_per_tco2e;
  v_points := FLOOR(v_gross * v_params.user_share * v_params.fx_ngn_per_usd);

  IF v_points < 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'REWARD_TOO_SMALL');
  END IF;

  -- Pre-funded reserve: lifetime points issued may never exceed lifetime funding (1 pt = ₦1).
  SELECT COALESCE(SUM(amount_ngn), 0) INTO v_funded FROM reserve_funding;
  SELECT COALESCE(SUM(points_awarded), 0) INTO v_issued FROM receipts WHERE status = 'VERIFIED';
  IF v_issued + v_points > v_funded THEN
    RETURN jsonb_build_object('ok', false, 'code', 'RESERVE_EXHAUSTED');
  END IF;

  INSERT INTO receipts (user_id, image_url, vendor_name, invoice_num, volume_kg, amount_ngn,
                        receipt_at, status, co2e_kg, gross_value_usd, points_awarded, params_id,
                        image_sha256, exif_present, device_id, processed_at)
  VALUES (p_user_id, p_image_path, p_vendor, p_invoice, p_volume_kg, p_amount_ngn,
          p_receipt_at, 'VERIFIED', v_co2e, v_gross, v_points, v_params.id,
          p_sha256, p_exif_present, p_device_id, NOW())
  RETURNING id INTO v_receipt;

  v_balance := v_wallet.points_balance + v_points;
  UPDATE wallets SET points_balance = v_balance, updated_at = NOW() WHERE id = v_wallet.id;

  INSERT INTO transactions (wallet_id, receipt_id, amount_awarded, tx_type)
  VALUES (v_wallet.id, v_receipt, v_points, 'CREDIT_REWARD');

  RETURN jsonb_build_object(
    'ok', true,
    'receipt_id', v_receipt,
    'points', v_points,
    'co2e_kg', v_co2e,
    'new_balance', v_balance
  );
END;
$$;

-- ── 9. redeem_points: the only way points are spent ─────────
CREATE OR REPLACE FUNCTION public.redeem_points(
  p_user_id     UUID,
  p_points      NUMERIC,
  p_merchant_id UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_params   carbon_params%ROWTYPE;
  v_wallet   wallets%ROWTYPE;
  v_merchant merchants%ROWTYPE;
  v_alphabet CONSTANT TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';  -- 32 chars, no 0/O/1/I
  v_bytes    BYTEA;
  v_code     TEXT;
  v_i        INTEGER;
  v_try      INTEGER := 0;
  v_balance  NUMERIC;
BEGIN
  IF p_points IS NULL OR p_points <= 0 OR p_points <> FLOOR(p_points) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_AMOUNT');
  END IF;

  SELECT * INTO v_params FROM carbon_params ORDER BY effective_from DESC, id DESC LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_CONFIGURED');
  END IF;
  IF p_points < v_params.min_redeem_points THEN
    RETURN jsonb_build_object('ok', false, 'code', 'BELOW_MINIMUM', 'min', v_params.min_redeem_points);
  END IF;

  SELECT * INTO v_merchant FROM merchants WHERE id = p_merchant_id AND active;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'MERCHANT_UNAVAILABLE');
  END IF;

  SELECT * INTO v_wallet FROM wallets WHERE user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NO_WALLET');
  END IF;
  IF v_wallet.points_balance < p_points THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INSUFFICIENT_BALANCE', 'balance', v_wallet.points_balance);
  END IF;

  -- Voucher code: GASBACK-XXXXX-XXXXX from a CSPRNG (gen_random_uuid, version/variant
  -- bytes skipped), 32-symbol alphabet → 50 bits. UNIQUE constraint + retry on collision.
  LOOP
    v_try := v_try + 1;
    v_bytes := decode(replace(gen_random_uuid()::TEXT, '-', ''), 'hex');
    v_code := '';
    FOR v_i IN 0..9 LOOP
      v_code := v_code || substr(v_alphabet,
        (get_byte(v_bytes, CASE WHEN v_i < 6 THEN v_i WHEN v_i = 6 THEN 7 ELSE v_i + 2 END) % 32) + 1, 1);
    END LOOP;
    v_code := 'GASBACK-' || substr(v_code, 1, 5) || '-' || substr(v_code, 6, 5);
    BEGIN
      INSERT INTO vouchers (code, user_id, merchant_id, points, naira_value)
      VALUES (v_code, p_user_id, p_merchant_id, p_points, p_points);   -- 1 pt = ₦1
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      IF v_try >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  v_balance := v_wallet.points_balance - p_points;
  UPDATE wallets SET points_balance = v_balance, updated_at = NOW() WHERE id = v_wallet.id;

  INSERT INTO transactions (wallet_id, receipt_id, amount_awarded, tx_type, voucher_code)
  VALUES (v_wallet.id, NULL, -p_points, 'DEBIT_REDEMPTION', v_code);

  RETURN jsonb_build_object(
    'ok', true,
    'voucher_code', v_code,
    'points', p_points,
    'naira_value', p_points,
    'merchant_name', v_merchant.name,
    'remaining_balance', v_balance
  );
END;
$$;

-- ── 10. Lock the functions to the service role ──────────────
REVOKE ALL ON FUNCTION public.award_receipt(UUID,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TIMESTAMPTZ,TEXT,BOOLEAN,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.redeem_points(UUID,NUMERIC,UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_receipt(UUID,TEXT,TEXT,TEXT,NUMERIC,NUMERIC,TIMESTAMPTZ,TEXT,BOOLEAN,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.redeem_points(UUID,NUMERIC,UUID) TO service_role;
