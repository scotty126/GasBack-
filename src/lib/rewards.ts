// Reward maths — display/preview only. The AUTHORITATIVE calculation is the
// award_receipt() Postgres function (database/migrations/001_hardening.sql);
// tests/rewards.test.mjs checks that this mirror agrees with it.

/** 1 point is worth ₦1 of refill discount, fixed. Only the earn rate moves. */
export const NAIRA_PER_POINT = 1;

export interface CarbonParams {
  id: number;
  kg_co2e_per_kg_lpg: number;
  price_usd_per_tco2e: number;
  price_as_of: string;
  price_source: string;
  user_share: number;
  fx_ngn_per_usd: number;
  fx_as_of: string;
  min_redeem_points: number;
  effective_from: string;
}

export interface Reward {
  co2eKg: number;
  grossUsd: number;
  userUsd: number;
  platformUsd: number;
  points: number;
}

export function computeReward(volumeKg: number, p: CarbonParams): Reward {
  const co2eKg = Math.round(volumeKg * p.kg_co2e_per_kg_lpg * 1e4) / 1e4;
  const grossUsd = (co2eKg / 1000) * p.price_usd_per_tco2e;
  const userUsd = grossUsd * p.user_share;
  const points = Math.floor(userUsd * p.fx_ngn_per_usd + 1e-9);
  return { co2eKg, grossUsd, userUsd, platformUsd: grossUsd - userUsd, points };
}

export const formatPoints = (n: number) =>
  n.toLocaleString('en-NG', { maximumFractionDigits: 0 });

export const formatNaira = (n: number) => `₦${Math.floor(n).toLocaleString('en-NG')}`;
