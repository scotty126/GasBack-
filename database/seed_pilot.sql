-- ============================================================
-- GasBack — Pilot seed (EDIT THE VALUES, then run once in the SQL editor)
-- Run after migrations/001_hardening.sql.
--
-- Nothing here is run automatically. Until the parameters row and a reserve
-- funding row exist, the API awards nothing (by design).
-- Append a new carbon_params row whenever price or FX changes; the latest wins
-- and old rows stay as the audit trail (each receipt records the params_id it used).
-- ============================================================

-- 1. Reward parameters  ← REVIEW EVERY VALUE
INSERT INTO carbon_params
  (kg_co2e_per_kg_lpg, price_usd_per_tco2e, price_as_of, price_source,
   user_share, fx_ngn_per_usd, fx_as_of, min_redeem_points, note)
VALUES
  (5.017,                       -- business plan: kg CO2e avoided per kg LPG (upper bound until a methodology is chosen)
   15.00,                       -- business plan benchmark; Fastmarkets CCP cookstove SSA was $15.00 on 2026-05-26 (CORSIA-eligible: $10.55)
   DATE '2026-05-26',
   'Fastmarkets cookstove CCP, Sub-Saharan Africa',
   0.500,                       -- 50/50 split: user share
   1600.00,                     -- !! PLACEHOLDER: replace with the current NGN per USD rate you want to use
   DATE '2026-10-04',           -- !! set to the date of the rate you enter
   500,                         -- minimum redemption, in points (₦). Suggestion only.
   'Initial pilot parameters. fx is a placeholder implied by the plan (₦750–800 ≈ $0.47 per 12.5 kg).');

-- 2. Fund the reward reserve  ← the maximum ₦ of points the pilot may issue.
--    Example: ₦5,000,000 = 5,000,000 points. Add more rows to top up.
INSERT INTO reserve_funding (amount_ngn, note)
VALUES (0.01 /* !! EDIT: amount in naira you have actually set aside */, 'Pilot reserve — initial funding');

-- 3. Partner stations  ← only stations that have actually agreed to honour vouchers.
-- INSERT INTO merchants (name, city, address) VALUES
--   ('Station name', 'Lagos', 'Street address');
