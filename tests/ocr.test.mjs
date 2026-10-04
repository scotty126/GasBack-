import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import sharp from 'sharp';
import { chooseProvider, shrinkForUpload, readText } from '../src/lib/ocr.ts';

// A fake OCR.space: records what it was sent and replies as scripted. Not the real service.
function fakeOcrSpace(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const server = http.createServer(async (req, res) => {
      const chunks = []; for await (const c of req) chunks.push(c);
      const body = Buffer.concat(chunks);
      seen.push({ method: req.method, apikey: req.headers.apikey, bodyBytes: body.length, body: body.toString('latin1') });
      handler(req, res, seen.at(-1));
    }).listen(0, () => resolve({ server, seen, url: `http://127.0.0.1:${server.address().port}/parse/image` }));
  });
}
const reply = (res, obj, code = 200) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
const noisy = (w, h) => sharp(Buffer.from(Array.from({ length: w * h * 3 }, () => Math.floor(Math.random() * 256))), { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
const env = (url, extra = {}) => ({ OCR_PROVIDER: 'ocrspace', OCR_SPACE_API_KEY: 'test-key', OCR_SPACE_ENDPOINT: url, ...extra });

test('provider selection', () => {
  assert.equal(chooseProvider({}), null);
  assert.equal(chooseProvider({ OCR_SPACE_API_KEY: 'k' }), 'ocrspace');
  assert.equal(chooseProvider({ GOOGLE_CREDENTIALS_JSON: '{}' }), 'google');
  assert.equal(chooseProvider({ GOOGLE_CREDENTIALS_JSON: '{}', OCR_SPACE_API_KEY: 'k' }), 'google');            // default prefers google
  assert.equal(chooseProvider({ GOOGLE_CREDENTIALS_JSON: '{}', OCR_SPACE_API_KEY: 'k', OCR_PROVIDER: 'ocrspace' }), 'ocrspace');
  assert.equal(chooseProvider({ OCR_PROVIDER: 'ocrspace' }), null);                                           // chosen but no key
  assert.equal(chooseProvider({ OCR_PROVIDER: 'google', OCR_SPACE_API_KEY: 'k' }), null);                     // chosen but no creds
});

test('shrinkForUpload brings a big photo under the 1 MB free-tier limit and stays a readable image', async () => {
  const big = await noisy(2400, 3000);                      // multi-MB PNG of pure noise (worst case)
  assert.ok(big.length > 5_000_000, `test image should be large, was ${big.length}`);
  const out = await shrinkForUpload(big);
  assert.ok(out.length <= 900 * 1024, `shrunk to ${out.length}`);
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, 'jpeg');
  assert.ok(Math.max(meta.width, meta.height) <= 1800);
});

test('success: sends apikey header + multipart image under 1 MB, returns parsed text', async () => {
  const { server, seen, url } = await fakeOcrSpace((req, res) => reply(res, { OCRExitCode: 1, IsErroredOnProcessing: false, ParsedResults: [{ ParsedText: 'INVOICE NO: 123456\nTotal: N18,750' }] }));
  try {
    const r = await readText(await noisy(2000, 2600), env(url));
    assert.equal(r.ok, true);
    assert.equal(r.provider, 'ocrspace');
    assert.match(r.text, /INVOICE NO: 123456/);
    const s = seen[0];
    assert.equal(s.method, 'POST');
    assert.equal(s.apikey, 'test-key');
    assert.ok(s.bodyBytes < 1024 * 1024, `request body ${s.bodyBytes} bytes must stay under 1 MB`);
    for (const f of ['name="file"', 'name="language"', 'name="OCREngine"', 'name="isTable"']) assert.ok(s.body.includes(f), `missing form field ${f}`);
  } finally { server.close(); }
});

test('provider errors become OCR_UNAVAILABLE (never a crash, never a fake success)', async () => {
  const png = await noisy(900, 900);
  for (const [label, handler] of [
    ['processing error', (q, res) => reply(res, { IsErroredOnProcessing: true, ErrorMessage: ['Invalid API key'] })],
    ['HTTP 500', (q, res) => reply(res, { error: 'x' }, 500)],
    ['HTTP 403 (key rejected)', (q, res) => reply(res, {}, 403)],
    ['not JSON', (q, res) => { res.writeHead(200); res.end('<html>oops</html>'); }],
  ]) {
    const { server, url } = await fakeOcrSpace(handler);
    try {
      const r = await readText(png, env(url));
      assert.equal(r.ok, false, label);
      assert.equal(r.code, 'OCR_UNAVAILABLE', label);
    } finally { server.close(); }
  }
});

test('a hanging provider is cut off by the timeout', async () => {
  const { server, url } = await fakeOcrSpace(() => { /* never answers */ });
  try {
    const t0 = Date.now();
    const r = await readText(await noisy(900, 900), env(url, { OCR_TIMEOUT_MS: '600' }));
    assert.equal(r.ok, false);
    assert.equal(r.code, 'OCR_UNAVAILABLE');
    assert.ok(Date.now() - t0 < 5000, 'returned promptly');
  } finally { server.closeAllConnections?.(); server.close(); }
});

test('no provider configured → OCR_NOT_CONFIGURED', async () => {
  const r = await readText(await noisy(500, 500), {});
  assert.equal(r.ok, false);
  assert.equal(r.code, 'OCR_NOT_CONFIGURED');
});
