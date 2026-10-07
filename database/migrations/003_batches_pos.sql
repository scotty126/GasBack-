-- ============================================================
-- GasBack — Migration 003: carbon batches + merchant POS cross-validation
-- Run AFTER 001 and 002. Non-destructive. Safe to re-run.
--
--   * carbon_batches        ~1 tCO2e bundles of VERIFIED receipts (the unit sold to buyers /
--                           later anchored on-chain). Service role only.
--   * receipts.batch_id     which batch a receipt belongs to. NOTE: receipt status stays
--                           'VERIFIED' (we do NOT add a BATCHED status): the reserve cap and
--                           the duplicate indexes key on status = 'VERIFIED', and a batched
--                           receipt must keep counting against both.
--   * create_carbon_batch() ATOMIC: picks the oldest unbatched VERIFIED receipts until the
--                           target is reached, writes a batch with a digest of their image hashes.
--   * merchants.vendor_key  maps the parser's vendor slug (e.g. 'seegas') to a merchant.
--   * merchant_pos          per-merchant POS endpoint + credentials. SEPARATE table with no
--                           policies (service role only): merchants is publicly readable, and
--                           endpoint/secret/key-hash must never be.
--   * receipts.pos_*        result of the POS cross-check, recorded by mark_receipt_pos().
-- ============================================================

-- ── 1. Carbon batches ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS carbon_batches (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  total_co2e_kg   NUMERIC(14,4) NOT NULL CHECK (total_co2e_kg > 0),
  total_tco2e     NUMERIC(14,6) NOT NULL CHECK (total_tco2e > 0),
  receipt_count   INTEGER       NOT NULL CHECK (receipt_count > 0),
  receipts_digest TEXT          NOT NULL,          -- sha256 over the sorted image hashes (anchor payload)
  status          TEXT          NOT NULL DEFAULT 'SEALED'
                  CHECK (status IN ('SEALED','MINTED','SOLD','RETIRED')),
  onchain_tx_hash TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  CHECK (status <> 'MINTED' OR onchain_tx_hash IS NOT NULL)
);
ALTER TABLE carbon_batches ENABLE ROW LEVEL SECURITY;   -- no policies: service role only

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS batch_id BIGINT REFERENCES carbon_batches(id);
CREATE INDEX IF NOT EXISTS idx_receipts_batch ON receipts(batch_id);
CREATE INDEX IF NOT EXISTS idx_receipts_unbatched ON receipts(processed_at)
  WHERE status = 'VERIFIED' AND batch_id IS NULL AND co2e_kg IS NOT NULL;

CREATE OR REPLACE FUNCTION public.create_carbon_batch(p_target_tco2e NUMERIC DEFAULT 1)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_target  NUMERIC;
  v_ids     UUID[] := '{}';
  v_hashes  TEXT[] := '{}';
  v_total   NUMERIC := 0;
  r         RECORD;
  v_batch   BIGINT;
BEGIN
  IF p_target_tco2e IS NULL OR p_target_tco2e <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'INVALID_TARGET');
  END IF;
  v_target := p_target_tco2e * 1000;                       -- kg

  -- Same lock as awards: a receipt cannot be awarded and batched at the same moment.
  PERFORM pg_advisory_xact_lock(hashtext('gasback:award'));

  FOR r IN
    SELECT id, co2e_kg, image_sha256 FROM receipts
     WHERE status = 'VERIFIED' AND batch_id IS NULL AND co2e_kg IS NOT NULL
     ORDER BY processed_at, id
     FOR UPDATE
  LOOP
    v_ids := v_ids || r.id;
    v_hashes := v_hashes || COALESCE(r.image_sha256, r.id::TEXT);
    v_total := v_total + r.co2e_kg;
    EXIT WHEN v_total >= v_target;
  END LOOP;

  IF v_total < v_target THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_ENOUGH_RECEIPTS',
                              'available_co2e_kg', v_total, 'needed_co2e_kg', v_target);
  END IF;

  INSERT INTO carbon_batches (total_co2e_kg, total_tco2e, receipt_count, receipts_digest)
  VALUES (v_total, ROUND(v_total / 1000, 6), array_length(v_ids, 1),
          encode(sha256(convert_to((SELECT string_agg(h, ',' ORDER BY h) FROM unnest(v_hashes) h), 'UTF8')), 'hex'))
  RETURNING id INTO v_batch;

  UPDATE receipts SET batch_id = v_batch WHERE id = ANY (v_ids);

  RETURN jsonb_build_object('ok', true, 'batch_id', v_batch, 'receipt_count', array_length(v_ids, 1),
                            'total_co2e_kg', v_total, 'total_tco2e', ROUND(v_total / 1000, 6));
END;
$$;

-- ── 2. Merchant POS cross-validation ────────────────────────
ALTER TABLE merchants ADD COLUMN IF NOT EXISTS vendor_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_merchants_vendor_key ON merchants(vendor_key) WHERE vendor_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS merchant_pos (
  merchant_id      UUID PRIMARY KEY REFERENCES merchants(id) ON DELETE CASCADE,
  endpoint_url     TEXT NOT NULL CHECK (endpoint_url ~ '^https://'),   -- vendor's verify-receipt URL
  outbound_secret  TEXT NOT NULL,        -- bearer token WE send to the vendor
  api_key_hash     TEXT,                 -- sha256 of a key the vendor sends US (future inbound API)
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE merchant_pos ENABLE ROW LEVEL SECURITY;     -- no policies: service role only

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS pos_status     TEXT
  CHECK (pos_status IN ('CONFIRMED','NOT_CHECKED'));
ALTER TABLE receipts ADD COLUMN IF NOT EXISTS pos_checked_at TIMESTAMPTZ;

-- Called by the scan route right after award_receipt. Only ever sets a flag on a VERIFIED receipt.
CREATE OR REPLACE FUNCTION public.mark_receipt_pos(p_receipt_id UUID, p_status TEXT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  UPDATE receipts
     SET pos_status = p_status, pos_checked_at = NOW()
   WHERE id = p_receipt_id AND status = 'VERIFIED' AND p_status IN ('CONFIRMED','NOT_CHECKED');
$$;

-- ── 3. Lock the functions to the service role ───────────────
REVOKE ALL ON FUNCTION public.create_carbon_batch(NUMERIC) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_receipt_pos(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_carbon_batch(NUMERIC) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_receipt_pos(UUID, TEXT) TO service_role;
