import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { analyseImage, judgeImage } from '../src/lib/imageChecks.ts';

const base = (w = 800, h = 1000) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#f4f1ea' } });
const exifDate = (d) => d.toISOString().slice(0, 19).replace('T', ' ').replace(/-/g, ':');
const NOW = new Date();

test('hash is the exact SHA-256 of the bytes and stable', async () => {
  const buf = await base().png().toBuffer();
  const a = await analyseImage(buf), b = await analyseImage(buf);
  assert.equal(a.sha256, b.sha256);
  assert.match(a.sha256, /^[0-9a-f]{64}$/);
  assert.notEqual((await analyseImage(await base(801).png().toBuffer())).sha256, a.sha256);
});

test('image without EXIF is allowed but recorded as exifPresent=false', async () => {
  const a = await analyseImage(await base().png().toBuffer());
  assert.equal(a.exifPresent, false);
  assert.equal(judgeImage(a, NOW).ok, true);
});

test('recent EXIF capture time passes and is parsed', async () => {
  const taken = new Date(NOW.getTime() - 5 * 60_000);
  const buf = await base().withExif({ IFD2: { DateTimeOriginal: exifDate(taken) } }).jpeg().toBuffer();
  const a = await analyseImage(buf);
  assert.equal(a.exifPresent, true);
  assert.ok(a.exifCapturedAt instanceof Date, 'DateTimeOriginal was read');
  assert.equal(judgeImage(a, NOW).ok, true);
});

test('old EXIF capture time (photo reused from earlier) is rejected', async () => {
  const buf = await base().withExif({ IFD2: { DateTimeOriginal: '2020:01:01 10:00:00' } }).jpeg().toBuffer();
  const v = judgeImage(await analyseImage(buf), NOW);
  assert.equal(v.ok, false);
  assert.equal(v.code, 'IMAGE_NOT_RECENT');
});

test('EXIF capture time in the future is rejected', async () => {
  const buf = await base().withExif({ IFD2: { DateTimeOriginal: exifDate(new Date(NOW.getTime() + 6 * 3_600_000)) } }).jpeg().toBuffer();
  assert.equal(judgeImage(await analyseImage(buf), NOW).code, 'IMAGE_NOT_RECENT');
});

test('image-editor Software tag is rejected; a phone camera tag is not', async () => {
  const edited = await base().withExif({ IFD0: { Software: 'Adobe Photoshop 25.1' } }).jpeg().toBuffer();
  assert.equal(judgeImage(await analyseImage(edited), NOW).code, 'IMAGE_EDITED');
  const phone = await base().withExif({ IFD0: { Software: 'SM-A135F', Make: 'samsung' } }).jpeg().toBuffer();
  assert.equal(judgeImage(await analyseImage(phone), NOW).ok, true);
});

test('too-small image is rejected; non-image bytes throw', async () => {
  const tiny = await analyseImage(await base(200, 200).png().toBuffer());
  assert.equal(judgeImage(tiny, NOW).code, 'IMAGE_TOO_SMALL');
  await assert.rejects(analyseImage(Buffer.from('this is not an image')));
});
