import test from 'node:test';
import assert from 'node:assert/strict';
import { computeReward } from '../src/lib/rewards.ts';

// Same parameters as the plan's unit-economics table, with the placeholder FX of ₦1,600/$.
const P = {
  id: 1, kg_co2e_per_kg_lpg: 5.017, price_usd_per_tco2e: 15, price_as_of: '2026-05-26',
  price_source: 'test', user_share: 0.5, fx_ngn_per_usd: 1600, fx_as_of: '2026-10-04',
  min_redeem_points: 500, effective_from: '2026-10-04',
};

test('12.5 kg refill matches the business plan table', () => {
  const r = computeReward(12.5, P);
  assert.equal(r.co2eKg, 62.7125);                                   // plan: 62.71 kg CO2e
  assert.ok(Math.abs(r.grossUsd - 0.9407) < 0.0001);                 // plan: $0.941
  assert.ok(Math.abs(r.userUsd - 0.4703) < 0.0001);                  // plan: $0.47
  assert.ok(Math.abs(r.platformUsd - r.userUsd) < 1e-12);            // 50/50
  assert.equal(r.points, 752);                                       // ₦752 at ₦1,600/$ — inside the plan's ₦750–800
});

test('points scale with volume, price and FX; share of 0 gives nothing', () => {
  assert.equal(computeReward(25, P).points, 1505);
  assert.equal(computeReward(12.5, { ...P, price_usd_per_tco2e: 10.55 }).points, 529);
  assert.equal(computeReward(12.5, { ...P, user_share: 0 }).points, 0);
});
