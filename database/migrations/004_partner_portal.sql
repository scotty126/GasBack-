-- ============================================================
-- GasBack — Migration 004: partner (vendor) portal
-- Run AFTER 001–003. Non-destructive. Safe to re-run.
--
--   * merchant_staff     which user accounts may validate vouchers for which station.
--                        One station per account (user_id is the primary key). Service role
--                        only; the portal API reads it with the service key.
--   * vouchers.redeemed_by   the staff account that marked the voucher used.
--   * redeem_voucher()   ATOMIC: locks the voucher row, checks it belongs to THIS station and is
--                        still ISSUED, marks it REDEEMED. A second call cannot redeem it again.
--   * partner_stats()    totals for a station's dashboard.
--
-- Add a staff member (run as the project owner in the SQL editor; the person must already have
-- signed up in the app):
--   INSERT INTO merchant_staff (user_id, merchant_id, role)
--   SELECT u.id, m.id, 'MANAGER'
--     FROM users u, merchants m
--    WHERE u.email_address = 'attendant@example.com' AND m.name = 'Station name' AND m.city = 'Lagos';
--
-- NOT enforced here: the 30-day voucher validity promised in /terms (no expiry rule decided yet).
-- ============================================================

CREATE TABLE IF NOT EXISTS merchant_staff (
  user_id      UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  merchant_id  UUID        NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'CASHIER' CHECK (role IN ('CASHIER','MANAGER')),
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_merchant_staff_merchant ON merchant_staff(merchant_id);
ALTER TABLE merchant_staff ENABLE ROW LEVEL SECURITY;     -- no policies: service role only

ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS redeemed_by UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_vouchers_merchant ON vouchers(merchant_id, status, redeemed_at DESC);

CREATE OR REPLACE FUNCTION public.redeem_voucher(
  p_merchant_id UUID,
  p_code        TEXT,
  p_staff_id    UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v vouchers%ROWTYPE;
BEGIN
  SELECT * INTO v FROM vouchers WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;
  -- A voucher is only good at the station the customer chose. Answer exactly like "not found"
  -- so a station cannot probe which codes exist elsewhere.
  IF v.merchant_id <> p_merchant_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_FOUND');
  END IF;
  IF v.status = 'REDEEMED' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'ALREADY_REDEEMED', 'redeemed_at', v.redeemed_at);
  END IF;
  IF v.status <> 'ISSUED' THEN
    RETURN jsonb_build_object('ok', false, 'code', 'NOT_VALID', 'status', v.status);
  END IF;

  UPDATE vouchers SET status = 'REDEEMED', redeemed_at = NOW(), redeemed_by = p_staff_id WHERE id = v.id;

  RETURN jsonb_build_object('ok', true, 'voucher_code', v.code, 'points', v.points,
                            'naira_value', v.naira_value, 'redeemed_at', NOW());
END;
$$;

CREATE OR REPLACE FUNCTION public.partner_stats(p_merchant_id UUID)
RETURNS JSONB
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'redeemed_count',        COUNT(*) FILTER (WHERE status = 'REDEEMED'),
    'redeemed_naira',        COALESCE(SUM(naira_value) FILTER (WHERE status = 'REDEEMED'), 0),
    'redeemed_today_count',  COUNT(*) FILTER (WHERE status = 'REDEEMED' AND redeemed_at >= date_trunc('day', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'),
    'redeemed_today_naira',  COALESCE(SUM(naira_value) FILTER (WHERE status = 'REDEEMED' AND redeemed_at >= date_trunc('day', NOW() AT TIME ZONE 'Africa/Lagos') AT TIME ZONE 'Africa/Lagos'), 0),
    'outstanding_count',     COUNT(*) FILTER (WHERE status = 'ISSUED'),
    'outstanding_naira',     COALESCE(SUM(naira_value) FILTER (WHERE status = 'ISSUED'), 0)
  ) FROM vouchers WHERE merchant_id = p_merchant_id;
$$;

REVOKE ALL ON FUNCTION public.redeem_voucher(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.partner_stats(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_voucher(UUID, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.partner_stats(UUID) TO service_role;
