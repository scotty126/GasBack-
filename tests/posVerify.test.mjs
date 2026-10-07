import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { verifyWithPos } from '../src/lib/posVerify.ts';

// A fake vendor POS: records the request and replies as scripted. Not a real vendor.
function fakePos(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const server = http.createServer(async (req, res) => {
      const chunks = []; for await (const c of req) chunks.push(c);
      seen.push({ method: req.method, auth: req.headers.authorization, body: JSON.parse(Buffer.concat(chunks).toString() || 'null') });
      handler(req, res);
    }).listen(0, () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}/verify` }));
  });
}
const json = (res, obj, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const rec = { invoiceNum: '0045231', volumeKg: 12.5, amountNgn: 18750, receiptAt: new Date('2026-10-01T08:00:00Z') };
const run = async (handler, extra = {}) => {
  const f = await fakePos(handler);
  try { return { out: await verifyWithPos({ endpointUrl: f.url, secret: 'sek' }, rec, { allowInsecure: true, ...extra }), seen: f.seen }; }
  finally { f.server.closeAllConnections?.(); f.server.close(); }
};

test('confirmed: sends bearer secret + the sale, accepts a matching reply', async () => {
  const { out, seen } = await run((_, res) => json(res, { found: true, volume_kg: 12.5, amount_ngn: 18750 }));
  assert.equal(out.status, 'confirmed');
  assert.equal(seen[0].method, 'POST'); assert.equal(seen[0].auth, 'Bearer sek');
  assert.deepEqual(seen[0].body, { invoice_number: '0045231', volume_kg: 12.5, amount_ngn: 18750, receipt_at: '2026-10-01T08:00:00.000Z' });
});
test('found with no extra fields is confirmed', async () => assert.equal((await run((_, res) => json(res, { found: true }))).out.status, 'confirmed'));
test('not found', async () => assert.equal((await run((_, res) => json(res, { found: false }))).out.status, 'not_found'));
test('volume or amount mismatch', async () => {
  assert.equal((await run((_, res) => json(res, { found: true, volume_kg: 6, amount_ngn: 18750 }))).out.status, 'mismatch');
  assert.equal((await run((_, res) => json(res, { found: true, volume_kg: 12.5, amount_ngn: 9000 }))).out.status, 'mismatch');
  assert.equal((await run((_, res) => json(res, { found: true, amount_ngn: '18750' }))).out.status, 'mismatch');
});
test('HTTP error, garbage, redirect and hang are "unavailable", never confirmed', async () => {
  assert.equal((await run((_, res) => json(res, {}, 500))).out.status, 'unavailable');
  assert.equal((await run((_, res) => { res.writeHead(200); res.end('<html>'); })).out.status, 'unavailable');
  assert.equal((await run((_, res) => json(res, { ok: true }))).out.status, 'unavailable');
  assert.equal((await run((_, res) => { res.writeHead(302, { location: 'http://127.0.0.1:1/x' }); res.end(); })).out.status, 'unavailable');
  assert.equal((await run(() => {}, { timeoutMs: 300 })).out.status, 'unavailable');
});
test('http endpoint refused unless explicitly allowed', async () => {
  const out = await verifyWithPos({ endpointUrl: 'http://example.com/v', secret: 's' }, rec);
  assert.equal(out.status, 'unavailable');
});
