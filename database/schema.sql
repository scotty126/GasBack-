-- ============================================================
-- GasBack — Full Reset Schema
-- Safe to run multiple times. Drops everything and rebuilds.
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- ============================================================

-- 1. Drop old objects (reverse dependency order)
DROP FUNCTION IF EXISTS public.create_wallet_for_new_user() CASCADE;
DROP TABLE    IF EXISTS transactions  CASCADE;
DROP TABLE    IF EXISTS wallets       CASCADE;
DROP TABLE    IF EXISTS receipts      CASCADE;
DROP TABLE    IF EXISTS users         CASCADE;
DROP TYPE     IF EXISTS transaction_type CASCADE;
DROP TYPE     IF EXISTS receipt_status   CASCADE;

-- 2. Extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 3. Enum types
CREATE TYPE receipt_status AS ENUM (
  'PENDING',   -- uploaded, not yet processed
  'VERIFIED',  -- OCR passed, points awarded
  'REJECTED',  -- failed validation
  'FLAGGED'    -- duplicate attempt
);

CREATE TYPE transaction_type AS ENUM (
  'CREDIT_REWARD',    -- points earned
  'DEBIT_REDEMPTION'  -- points spent
);

-- 4. users
CREATE TABLE users (
  id            UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  phone_number  VARCHAR(20)  UNIQUE,
  email_address VARCHAR(255) UNIQUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 5. receipts
CREATE TABLE receipts (
  id               UUID           PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID           NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url        TEXT           NOT NULL,
  vendor_name      VARCHAR(255),
  invoice_num      VARCHAR(100),
  volume_kg        DECIMAL(10,2),
  status           receipt_status NOT NULL DEFAULT 'PENDING',
  rejection_reason TEXT,
  processed_at     TIMESTAMPTZ    DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_receipts_invoice_vendor
  ON receipts(invoice_num, vendor_name)
  WHERE status IN ('VERIFIED', 'FLAGGED');

CREATE INDEX idx_receipts_user_id ON receipts(user_id);
CREATE INDEX idx_receipts_status   ON receipts(status);

-- 6. wallets
CREATE TABLE wallets (
  id             UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id        UUID          NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  points_balance DECIMAL(12,4) NOT NULL DEFAULT 0 CHECK (points_balance >= 0),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);

-- 7. transactions
CREATE TABLE transactions (
  id             UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  wallet_id      UUID             NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
  receipt_id     UUID             REFERENCES receipts(id) ON DELETE SET NULL,
  amount_awarded DECIMAL(12,4)    NOT NULL,
  tx_type        transaction_type NOT NULL,
  voucher_code   VARCHAR(50),
  created_at     TIMESTAMPTZ      NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_transactions_wallet_id  ON transactions(wallet_id);
CREATE INDEX idx_transactions_receipt_id ON transactions(receipt_id);

-- 8. Row Level Security
ALTER TABLE users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE receipts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- users: own row (read + write)
CREATE POLICY "users_select" ON users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert" ON users FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update" ON users FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- receipts: own rows (read + write)
CREATE POLICY "receipts_select" ON receipts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "receipts_insert" ON receipts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "receipts_update" ON receipts FOR UPDATE USING (auth.uid() = user_id);

-- wallets: own row (read only — writes go through service role in API routes)
CREATE POLICY "wallets_select" ON wallets FOR SELECT USING (auth.uid() = user_id);

-- transactions: own rows (read only)
CREATE POLICY "transactions_select" ON transactions FOR SELECT
  USING (wallet_id IN (SELECT id FROM wallets WHERE user_id = auth.uid()));

-- 9. Trigger: auto-create wallet when a user row is inserted
CREATE OR REPLACE FUNCTION public.create_wallet_for_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.wallets (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_gasback_user_created
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.create_wallet_for_new_user();
