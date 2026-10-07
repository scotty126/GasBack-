import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (p) => fs.readFileSync(`${ROOT}${p}`, 'utf8');

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; console.log('  FAIL', name, extra); }
};

const db = new PGlite();

// ── Supabase stubs (roles, auth.uid(), storage) ──────────────────────────────
await db.exec(`
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
    $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION uuid_generate_v4() RETURNS uuid LANGUAGE sql AS $$ SELECT gen_random_uuid() $$;
  CREATE SCHEMA storage;
  CREATE TABLE storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  CREATE TABLE storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
  CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;
`);

console.log('Apply schema.sql + 001 + 002 + 003');
const schema = read('database/schema.sql').replace(/CREATE EXTENSION[^;]*;/i, '');
try {
  await db.exec(schema);
  await db.exec(read('database/migrations/001_hardening.sql'));
  await db.exec(read('database/migrations/002_storage.sql'));
  await db.exec(read('database/migrations/003_batches_pos.sql'));
  await db.exec(read('database/migrations/004_partner_portal.sql'));
  ok(true, 'schema + 001–004 apply cleanly');
  await db.exec(read('database/migrations/001_hardening.sql'));
  await db.exec(read('database/migrations/002_storage.sql'));
  await db.exec(read('database/migrations/003_batches_pos.sql'));
  await db.exec(read('database/migrations/004_partner_portal.sql'));
  ok(true, '001–004 are re-runnable (idempotent)');
} catch (e) { ok(false, 'migrations apply', e.message); process.exit(1); }

// Mimic Supabase default table grants for client roles so RLS (not GRANTs) is what's tested.
await db.exec(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;`);

const q = async (sql, params) => (await db.query(sql, params)).rows;
const uid = async () => (await q(`INSERT INTO users (email_address) VALUES ($1) RETURNING id`, [`u${Math.random()}@t.io`]))[0].id;
const bits = (ones, offset = 0) => { // 256-char bit string with `ones` flipped bits
  const a = Array(256).fill('0'); for (let i = 0; i < ones; i++) a[(i + offset) % 256] = '1'; return a.join('');
};
const award = (o) => q(
  `SELECT award_receipt($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS r`,
  [o.user, o.path ?? 'p/x.jpg', o.vendor ?? 'seegas', o.invoice, o.kg ?? 12.5, o.amount ?? 18000,
   o.at ?? '2026-10-01T09:00:00+01:00', o.sha, o.exif ?? true, o.device ?? 'dev-1']
).then((r) => r[0].r);

const u1 = await uid();
console.log('Not configured → refuses');
let r = await award({ user: u1, invoice: 'INV1', sha: 'a1' });
ok(r.ok === false && r.code === 'NOT_CONFIGURED', 'award with no carbon_params → NOT_CONFIGURED', JSON.stringify(r));

await db.exec(`INSERT INTO carbon_params (kg_co2e_per_kg_lpg, price_usd_per_tco2e, price_as_of, price_source, user_share, fx_ngn_per_usd, fx_as_of, min_redeem_points)
  VALUES (5.017, 15.00, '2026-05-26', 'test', 0.5, 1600, '2026-10-04', 500)`);

console.log('Reserve unfunded → refuses, writes nothing');
r = await award({ user: u1, invoice: 'INV1', sha: 'a1' });
ok(r.ok === false && r.code === 'RESERVE_EXHAUSTED', 'unfunded reserve → RESERVE_EXHAUSTED', JSON.stringify(r));
ok((await q(`SELECT count(*)::int c FROM receipts`))[0].c === 0, 'no receipt row written on RESERVE_EXHAUSTED');

await db.exec(`INSERT INTO reserve_funding (amount_ngn, note) VALUES (1000, 'test')`);

console.log('Award math (12.5 kg @ 5.017, $15/t, 50%, ₦1600) ');
r = await award({ user: u1, invoice: 'INV1', sha: 'a1' });
ok(r.ok === true, 'award succeeds', JSON.stringify(r));
ok(Number(r.co2e_kg) === 62.7125, 'co2e_kg = 62.7125', String(r.co2e_kg));
ok(Number(r.points) === 752, 'points = 752 (₦752)', String(r.points));
const w = (await q(`SELECT points_balance FROM wallets WHERE user_id=$1`, [u1]))[0];
ok(Number(w.points_balance) === 752, 'wallet credited 752');
const tx = await q(`SELECT amount_awarded, tx_type FROM transactions`);
ok(tx.length === 1 && Number(tx[0].amount_awarded) === 752 && tx[0].tx_type === 'CREDIT_REWARD', 'ledger row written');
const rc = (await q(`SELECT co2e_kg, gross_value_usd, points_awarded, params_id FROM receipts`))[0];
ok(Number(rc.gross_value_usd) > 0.94 && Number(rc.gross_value_usd) < 0.941 && rc.params_id != null, 'receipt stores gross USD + params_id', JSON.stringify(rc));

console.log('Reserve cap: 1000 funded, 752 issued, next 752 must fail');
const u2 = await uid();
r = await award({ user: u2, invoice: 'INV2', sha: 'b2' });
ok(r.ok === false && r.code === 'RESERVE_EXHAUSTED', 'second award exceeds reserve → RESERVE_EXHAUSTED', JSON.stringify(r));
ok(Number((await q(`SELECT points_balance FROM wallets WHERE user_id=$1`, [u2]))[0].points_balance) === 0, 'balance unchanged after refusal');
await db.exec(`INSERT INTO reserve_funding (amount_ngn, note) VALUES (100000, 'top-up')`);

console.log('Duplicate detection');
r = await award({ user: u2, invoice: 'INV1', sha: 'zz' });
ok(r.ok === false && r.code === 'DUPLICATE_RECEIPT', 'same invoice+vendor by another user → DUPLICATE', JSON.stringify(r));
ok((await q(`SELECT count(*)::int c FROM receipts WHERE status='FLAGGED'`))[0].c === 1, 'FLAGGED audit row IS written (old unique index silently blocked this)');
r = await award({ user: u2, invoice: 'INV9', sha: 'a1' });
ok(r.ok === false && r.code === 'DUPLICATE_RECEIPT', 'same image sha256 → DUPLICATE', JSON.stringify(r));
r = await award({ user: u2, invoice: 'INV11', sha: 'q11' });
ok(r.ok === true, 'clearly different photo + new invoice → awarded', JSON.stringify(r));

console.log('Unknown vendor: same invoice number is only a duplicate on the same date');
r = await award({ user: u2, vendor: 'unknown_vendor', invoice: '000123', sha: 'u1', at: '2026-09-30T10:00:00+01:00' });
ok(r.ok === true, 'unknown_vendor invoice 000123 on 30 Sep → awarded', JSON.stringify(r));
r = await award({ user: u2, vendor: 'unknown_vendor', invoice: '000123', sha: 'u2', at: '2026-10-02T10:00:00+01:00' });
ok(r.ok === true, 'unknown_vendor invoice 000123 on 2 Oct (different station, plausibly) → awarded', JSON.stringify(r));
r = await award({ user: u2, vendor: 'unknown_vendor', invoice: '000123', sha: 'u3', at: '2026-10-02T15:00:00+01:00' });
ok(r.ok === false && r.code === 'DUPLICATE_RECEIPT', 'unknown_vendor invoice 000123 same date → DUPLICATE', JSON.stringify(r));

console.log('Redeem');
await db.exec(`INSERT INTO merchants (name, city) VALUES ('Test Station', 'Lagos')`);
await db.exec(`INSERT INTO merchants (name, city, active) VALUES ('Closed Station', 'Lagos', false)`);
const m = (await q(`SELECT id FROM merchants WHERE name='Test Station'`))[0].id;
const mClosed = (await q(`SELECT id FROM merchants WHERE name='Closed Station'`))[0].id;
const redeem = (user, pts, merch) => q(`SELECT redeem_points($1,$2,$3) AS r`, [user, pts, merch]).then((x) => x[0].r);
const bal = async (user) => Number((await q(`SELECT points_balance FROM wallets WHERE user_id=$1`, [user]))[0].points_balance);
const b0 = await bal(u2);
ok(b0 >= 1504, 'u2 has balance to spend', String(b0));
r = await redeem(u2, 100, m);      ok(r.code === 'BELOW_MINIMUM', 'below min_redeem_points (500) → BELOW_MINIMUM', JSON.stringify(r));
r = await redeem(u2, 500.5, m);    ok(r.code === 'INVALID_AMOUNT', 'fractional points → INVALID_AMOUNT', JSON.stringify(r));
r = await redeem(u2, -5, m);       ok(r.code === 'INVALID_AMOUNT', 'negative → INVALID_AMOUNT', JSON.stringify(r));
r = await redeem(u2, 500, mClosed);ok(r.code === 'MERCHANT_UNAVAILABLE', 'inactive merchant → MERCHANT_UNAVAILABLE', JSON.stringify(r));
r = await redeem(u2, b0 + 1, m);   ok(r.code === 'INSUFFICIENT_BALANCE', 'more than balance → INSUFFICIENT_BALANCE', JSON.stringify(r));
ok((await bal(u2)) === b0, 'balance untouched by all refused redemptions');
r = await redeem(u2, 500, m);
ok(r.ok === true && /^GASBACK-[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/.test(r.voucher_code), 'redeem 500 → voucher in GASBACK-XXXXX-XXXXX format', JSON.stringify(r));
ok((await bal(u2)) === b0 - 500, 'wallet debited by 500');
ok(Number(r.naira_value) === 500, '500 pts = ₦500 (1 pt = ₦1)');
const v = await q(`SELECT code, status, merchant_id FROM vouchers`);
ok(v.length === 1 && v[0].code === r.voucher_code && v[0].status === 'ISSUED' && v[0].merchant_id === m, 'voucher row persisted, ISSUED, bound to merchant');
const dtx = await q(`SELECT amount_awarded, voucher_code FROM transactions WHERE tx_type='DEBIT_REDEMPTION'`);
ok(dtx.length === 1 && Number(dtx[0].amount_awarded) === -500 && dtx[0].voucher_code === r.voucher_code, 'debit ledger row written with voucher code');

console.log('Voucher code quality (200 vouchers)');
await db.exec(`INSERT INTO reserve_funding (amount_ngn) VALUES (10000000)`);
const u3 = await uid();
await db.exec(`UPDATE wallets SET points_balance = 1000000 WHERE user_id='${u3}'`);
const codes = new Set(); const freq = {};
for (let i = 0; i < 200; i++) {
  const x = await redeem(u3, 500, m); codes.add(x.voucher_code);
  for (const ch of x.voucher_code.slice(8).replace('-', '')) freq[ch] = (freq[ch] || 0) + 1;
}
ok(codes.size === 200, '200 vouchers → 200 distinct codes');
const counts = Object.values(freq);
ok(Object.keys(freq).length === 32 && Math.min(...counts) > 20 && Math.max(...counts) < 100, 'all 32 symbols used, no gross bias', `${Object.keys(freq).length} symbols, min ${Math.min(...counts)} max ${Math.max(...counts)}`);

console.log('Wallet cannot go negative (CHECK constraint backstop)');
try { await db.exec(`UPDATE wallets SET points_balance = -1 WHERE user_id='${u3}'`); ok(false, 'negative balance rejected'); }
catch { ok(true, 'negative balance rejected by CHECK'); }

console.log('Permissions / RLS as a browser user (authenticated role)');
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
try { await q(`SELECT award_receipt($1,'p','seegas','HACK',12.5,1,now(),'h',true,'d')`, [u1]); ok(false, 'authenticated cannot call award_receipt'); }
catch (e) { ok(/permission denied/i.test(e.message), 'authenticated cannot call award_receipt', e.message); }
try { await q(`SELECT redeem_points($1,500,$2)`, [u1, m]); ok(false, 'authenticated cannot call redeem_points'); }
catch (e) { ok(/permission denied/i.test(e.message), 'authenticated cannot call redeem_points', e.message); }
try { await q(`INSERT INTO receipts (user_id,image_url,status) VALUES ($1,'x','VERIFIED')`, [u1]); ok(false, 'browser cannot insert a VERIFIED receipt'); }
catch (e) { ok(/row-level security/i.test(e.message), 'browser cannot insert a receipt (RLS)', e.message); }
const upd = await db.query(`UPDATE receipts SET status='REJECTED' WHERE user_id=$1`, [u1]);
ok(upd.affectedRows === 0, 'browser cannot update its own receipt status (RLS, 0 rows)', String(upd.affectedRows));
const upw = await db.query(`UPDATE wallets SET points_balance = 999999 WHERE user_id=$1`, [u1]);
ok(upw.affectedRows === 0, 'browser cannot edit its wallet (RLS, 0 rows)', String(upw.affectedRows));
ok((await q(`SELECT count(*)::int c FROM receipts`))[0].c >= 1, 'browser can read its own receipts');
ok((await q(`SELECT count(*)::int c FROM receipts WHERE user_id <> $1`, [u1]))[0].c === 0, 'browser cannot read other users receipts');
ok((await q(`SELECT count(*)::int c FROM carbon_params`))[0].c === 1, 'browser can read carbon_params');
ok((await q(`SELECT count(*)::int c FROM merchants`))[0].c === 1, 'browser sees only ACTIVE merchants');
ok((await q(`SELECT count(*)::int c FROM reserve_funding`))[0].c === 0, 'browser cannot read reserve_funding');
ok((await q(`SELECT count(*)::int c FROM scan_attempts`))[0].c === 0, 'browser cannot read scan_attempts');
await db.exec(`RESET ROLE`);

console.log('Service role can run both functions');
await db.exec(`SET ROLE service_role`);
r = await award({ user: u1, invoice: 'SVC1', sha: 'svc1' });
ok(r.ok === true, 'service_role can call award_receipt', JSON.stringify(r));
await db.exec(`RESET ROLE`);

console.log('Carbon batches (migration 003)');
const batch = (t) => q(`SELECT create_carbon_batch($1) AS r`, [t]).then((x) => x[0].r);
const unb = async () => (await q(`SELECT count(*)::int c FROM receipts WHERE status='VERIFIED' AND batch_id IS NULL`))[0].c;
const beforeUnb = await unb();
r = await batch(1);
ok(r.ok === false && r.code === 'NOT_ENOUGH_RECEIPTS', 'few receipts → NOT_ENOUGH_RECEIPTS', JSON.stringify(r));
ok((await unb()) === beforeUnb && (await q(`SELECT count(*)::int c FROM carbon_batches`))[0].c === 0, 'refusal batched/wrote nothing');
r = await batch(0); ok(r.code === 'INVALID_TARGET', 'target 0 → INVALID_TARGET');
// 62.7125 kg per 12.5 kg refill → 16 receipts ≥ 1 t.
const ub = await uid();
for (let i = 0; i < 20; i++) {
  const a = await award({ user: ub, invoice: `B${i}`, sha: `bsha${i}` });
  if (!a.ok) { ok(false, 'setup award for batch test', JSON.stringify(a)); break; }
}
const pre = await unb();
r = await batch(1);
ok(r.ok === true, 'enough receipts → batch created', JSON.stringify(r));
ok(Number(r.total_co2e_kg) >= 1000 && Number(r.total_co2e_kg) < 1063, 'batch is ≥1 t and stops at the receipt that crosses it', JSON.stringify(r));
ok(r.receipt_count === pre - (await unb()), 'batched receipts are exactly the ones now linked');
ok((await q(`SELECT count(*)::int c FROM receipts WHERE batch_id=$1 AND status='VERIFIED'`, [r.batch_id]))[0].c === r.receipt_count, 'batched receipts remain VERIFIED (still count against reserve)');
const cb = (await q(`SELECT receipts_digest, status FROM carbon_batches WHERE id=$1`, [r.batch_id]))[0];
ok(/^[0-9a-f]{64}$/.test(cb.receipts_digest) && cb.status === 'SEALED', 'digest is sha256 hex, status SEALED');
const again = await batch(1);
ok(again.ok === false, 'second call cannot re-batch the same receipts', JSON.stringify(again));
try { await db.exec(`UPDATE carbon_batches SET status='MINTED' WHERE id=${r.batch_id}`); ok(false, 'MINTED without tx hash rejected'); }
catch { ok(true, 'MINTED requires an on-chain tx hash (CHECK)'); }

console.log('Merchant POS (migration 003)');
await db.exec(`UPDATE merchants SET vendor_key='seegas' WHERE name='Test Station'`);
try { await db.exec(`INSERT INTO merchants (name, city, vendor_key) VALUES ('Dup','Abuja','seegas')`); ok(false, 'vendor_key unique'); }
catch { ok(true, 'vendor_key is unique'); }
try { await db.exec(`INSERT INTO merchant_pos (merchant_id, endpoint_url, outbound_secret) VALUES ('${m}', 'http://x.test/v', 's')`); ok(false, 'http endpoint rejected'); }
catch { ok(true, 'POS endpoint must be https (CHECK)'); }
await db.exec(`INSERT INTO merchant_pos (merchant_id, endpoint_url, outbound_secret) VALUES ('${m}', 'https://pos.test/verify', 'secret')`);
const rid = (await q(`SELECT id FROM receipts WHERE status='VERIFIED' LIMIT 1`))[0].id;
await q(`SELECT mark_receipt_pos($1,'CONFIRMED')`, [rid]);
ok((await q(`SELECT pos_status FROM receipts WHERE id=$1`, [rid]))[0].pos_status === 'CONFIRMED', 'mark_receipt_pos sets CONFIRMED');
try { await q(`SELECT mark_receipt_pos($1,'BOGUS')`, [rid]); } catch {}
ok((await q(`SELECT pos_status FROM receipts WHERE id=$1`, [rid]))[0].pos_status === 'CONFIRMED', 'invalid status leaves it unchanged');
const flaggedId = (await q(`SELECT id FROM receipts WHERE status='FLAGGED' LIMIT 1`))[0].id;
await q(`SELECT mark_receipt_pos($1,'CONFIRMED')`, [flaggedId]);
ok((await q(`SELECT pos_status FROM receipts WHERE id=$1`, [flaggedId]))[0].pos_status === null, 'cannot mark a FLAGGED receipt');

console.log('003 permissions as a browser user');
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${u1}', false);`);
ok((await q(`SELECT count(*)::int c FROM merchant_pos`))[0].c === 0, 'browser cannot read merchant_pos (secret stays private)');
ok((await q(`SELECT count(*)::int c FROM carbon_batches`))[0].c === 0, 'browser cannot read carbon_batches');
for (const [name, sql] of [['create_carbon_batch', `SELECT create_carbon_batch(1)`], ['mark_receipt_pos', `SELECT mark_receipt_pos('${rid}','CONFIRMED')`]]) {
  try { await q(sql); ok(false, `authenticated cannot call ${name}`); }
  catch (e) { ok(/permission denied/i.test(e.message), `authenticated cannot call ${name}`, e.message); }
}
await db.exec(`RESET ROLE`);

console.log('Partner portal (migration 004)');
await db.exec(`INSERT INTO merchants (name, city) VALUES ('Other Station', 'Abuja')`);
const mOther = (await q(`SELECT id FROM merchants WHERE name='Other Station'`))[0].id;
const staff = await uid();
await db.exec(`INSERT INTO merchant_staff (user_id, merchant_id, role) VALUES ('${staff}', '${m}', 'CASHIER')`);
const rv = (merchant, code, who = staff) => q(`SELECT redeem_voucher($1,$2,$3) AS r`, [merchant, code, who]).then((x) => x[0].r);
const stats = (merchant) => q(`SELECT partner_stats($1) AS s`, [merchant]).then((x) => x[0].s);
const vcode = (await q(`SELECT code FROM vouchers WHERE merchant_id=$1 AND status='ISSUED' ORDER BY created_at LIMIT 1`, [m]))[0].code;
const st0 = await stats(m);
ok(Number(st0.redeemed_count) === 0 && Number(st0.outstanding_count) > 200, 'stats before: nothing redeemed, 200+ outstanding', JSON.stringify(st0));
r = await rv(m, 'GASBACK-AAAAA-AAAAA');            ok(r.code === 'NOT_FOUND', 'unknown code → NOT_FOUND', JSON.stringify(r));
r = await rv(mOther, vcode);                        ok(r.code === 'NOT_FOUND', 'voucher for another station → NOT_FOUND (same answer as unknown)', JSON.stringify(r));
ok((await q(`SELECT status FROM vouchers WHERE code=$1`, [vcode]))[0].status === 'ISSUED', 'refusals changed nothing');
r = await rv(m, vcode);
ok(r.ok === true && Number(r.naira_value) === 500, 'right station redeems → ok, ₦500', JSON.stringify(r));
const vr = (await q(`SELECT status, redeemed_at, redeemed_by FROM vouchers WHERE code=$1`, [vcode]))[0];
ok(vr.status === 'REDEEMED' && vr.redeemed_at && vr.redeemed_by === staff, 'voucher REDEEMED with time and staff id');
r = await rv(m, vcode);                             ok(r.ok === false && r.code === 'ALREADY_REDEEMED' && r.redeemed_at, 'second redeem → ALREADY_REDEEMED', JSON.stringify(r));
await db.exec(`UPDATE vouchers SET status='CANCELLED' WHERE id = (SELECT id FROM vouchers WHERE merchant_id='${m}' AND status='ISSUED' LIMIT 1)`);
const cancelled = (await q(`SELECT code FROM vouchers WHERE status='CANCELLED'`))[0].code;
r = await rv(m, cancelled);                         ok(r.code === 'NOT_VALID', 'cancelled voucher → NOT_VALID', JSON.stringify(r));
const st1 = await stats(m);
ok(Number(st1.redeemed_count) === 1 && Number(st1.redeemed_naira) === 500 && Number(st1.redeemed_today_count) === 1 && Number(st1.redeemed_today_naira) === 500, 'stats after: 1 redeemed, ₦500, counted today', JSON.stringify(st1));
ok(Number(st1.outstanding_count) === Number(st0.outstanding_count) - 2, 'outstanding dropped by the redeemed + cancelled one');
const stO = await stats(mOther);                    ok(Number(stO.redeemed_count) === 0 && Number(stO.outstanding_count) === 0, 'other station stats are separate');
try { await db.exec(`INSERT INTO merchant_staff (user_id, merchant_id, role) VALUES ('${staff}', '${mOther}', 'CASHIER')`); ok(false, 'one station per account'); }
catch { ok(true, 'an account can be staff of only one station (PK)'); }
try { await db.exec(`INSERT INTO merchant_staff (user_id, merchant_id, role) VALUES ('${await uid()}', '${m}', 'ROOT')`); ok(false, 'role CHECK'); }
catch { ok(true, 'unknown staff role rejected'); }

console.log('004 permissions as a browser user');
await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${staff}', false);`);
ok((await q(`SELECT count(*)::int c FROM merchant_staff`))[0].c === 0, 'browser cannot read merchant_staff');
for (const [name, sql] of [['redeem_voucher', `SELECT redeem_voucher('${m}','GASBACK-AAAAA-AAAAA','${staff}')`], ['partner_stats', `SELECT partner_stats('${m}')`]]) {
  try { await q(sql); ok(false, `authenticated cannot call ${name}`); }
  catch (e) { ok(/permission denied/i.test(e.message), `authenticated cannot call ${name}`, e.message); }
}
const uv = await db.query(`UPDATE vouchers SET status='REDEEMED' WHERE status='ISSUED'`);
ok(uv.affectedRows === 0, 'browser cannot mark vouchers redeemed directly (RLS, 0 rows)', String(uv.affectedRows));
await db.exec(`RESET ROLE`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
