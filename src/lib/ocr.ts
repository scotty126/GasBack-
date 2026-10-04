import sharp from 'sharp';

// Server-only. Text extraction from a receipt photo, with a switchable provider:
//   OCR_PROVIDER=ocrspace  → OCR.space (free key, no card)   needs OCR_SPACE_API_KEY
//   OCR_PROVIDER=google    → Google Cloud Vision             needs GOOGLE_CREDENTIALS_JSON (billing)
// If OCR_PROVIDER is unset: Google when its credentials exist, else OCR.space when its key exists.

export type OcrProvider = 'google' | 'ocrspace';

export type OcrResult =
  | { ok: true; text: string; provider: OcrProvider }
  | { ok: false; code: 'OCR_NOT_CONFIGURED' | 'OCR_UNAVAILABLE'; message: string };

/** OCR.space's free tier rejects files over 1 MB; stay safely under it. */
const OCRSPACE_MAX_BYTES = 900 * 1024;
const OCRSPACE_TIMEOUT_MS = 20_000;
const OCRSPACE_DEFAULT_ENDPOINT = 'https://api.ocr.space/parse/image';

export function chooseProvider(env: NodeJS.ProcessEnv = process.env): OcrProvider | null {
  const want = env.OCR_PROVIDER?.trim().toLowerCase();
  if (want === 'google') return env.GOOGLE_CREDENTIALS_JSON ? 'google' : null;
  if (want === 'ocrspace') return env.OCR_SPACE_API_KEY ? 'ocrspace' : null;
  if (env.GOOGLE_CREDENTIALS_JSON) return 'google';
  if (env.OCR_SPACE_API_KEY) return 'ocrspace';
  return null;
}

/** Shrink a photo until it fits the provider's size limit (original bytes are untouched elsewhere). */
export async function shrinkForUpload(buf: Buffer, maxBytes = OCRSPACE_MAX_BYTES): Promise<Buffer> {
  let width = 1800;
  let quality = 82;
  for (let i = 0; i < 6; i++) {
    const out = await sharp(buf)
      .rotate() // apply EXIF orientation so text is upright
      .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality })
      .toBuffer();
    if (out.length <= maxBytes) return out;
    width = Math.round(width * 0.8);
    quality = Math.max(55, quality - 6);
  }
  throw new Error('Could not shrink the image under the size limit');
}

async function readWithOcrSpace(buf: Buffer, env: NodeJS.ProcessEnv): Promise<OcrResult> {
  const unavailable = (message: string): OcrResult => ({ ok: false, code: 'OCR_UNAVAILABLE', message });
  try {
    const jpeg = await shrinkForUpload(buf);
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(jpeg)], { type: 'image/jpeg' }), 'receipt.jpg');
    form.append('language', 'eng');
    form.append('OCREngine', '2');       // engine 2: better on photos / noisy backgrounds
    form.append('isTable', 'true');      // keep label and value on the same line (receipts)
    form.append('scale', 'true');
    form.append('isOverlayRequired', 'false');

    const res = await fetch(env.OCR_SPACE_ENDPOINT || OCRSPACE_DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: { apikey: env.OCR_SPACE_API_KEY as string },
      body: form,
      signal: AbortSignal.timeout(Number(env.OCR_TIMEOUT_MS) || OCRSPACE_TIMEOUT_MS),
    });
    if (!res.ok) return unavailable(`OCR.space HTTP ${res.status}`);

    const json = (await res.json()) as {
      IsErroredOnProcessing?: boolean;
      ErrorMessage?: string | string[];
      ParsedResults?: { ParsedText?: string }[];
    };
    if (json.IsErroredOnProcessing) {
      const msg = Array.isArray(json.ErrorMessage) ? json.ErrorMessage.join('; ') : json.ErrorMessage;
      return unavailable(`OCR.space: ${msg ?? 'processing error'}`);
    }
    const text = (json.ParsedResults ?? []).map((r) => r.ParsedText ?? '').join('\n');
    return { ok: true, text, provider: 'ocrspace' };
  } catch (e) {
    return unavailable(e instanceof Error ? e.message : 'OCR.space request failed');
  }
}

async function readWithGoogle(buf: Buffer, env: NodeJS.ProcessEnv): Promise<OcrResult> {
  try {
    const vision = (await import('@google-cloud/vision')).default;
    const client = new vision.ImageAnnotatorClient({ credentials: JSON.parse(env.GOOGLE_CREDENTIALS_JSON as string) });
    const [result] = await client.textDetection({ image: { content: buf } });
    return { ok: true, text: result.fullTextAnnotation?.text ?? '', provider: 'google' };
  } catch (e) {
    return { ok: false, code: 'OCR_UNAVAILABLE', message: e instanceof Error ? e.message : 'Google Vision failed' };
  }
}

export async function readText(buf: Buffer, env: NodeJS.ProcessEnv = process.env): Promise<OcrResult> {
  const provider = chooseProvider(env);
  if (!provider) {
    return { ok: false, code: 'OCR_NOT_CONFIGURED', message: 'No OCR provider is configured (set OCR_SPACE_API_KEY or GOOGLE_CREDENTIALS_JSON).' };
  }
  return provider === 'ocrspace' ? readWithOcrSpace(buf, env) : readWithGoogle(buf, env);
}
