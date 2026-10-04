import { NextRequest, NextResponse } from 'next/server';
import vision from '@google-cloud/vision';
import { createServiceClient } from '@/lib/supabaseClient';
import { requireUser, readDeviceId } from '@/lib/serverAuth';
import { parseReceipt } from '@/lib/receiptParser';
import { analyseImage, judgeImage } from '@/lib/imageChecks';

export const runtime = 'nodejs';
export const maxDuration = 30;

const BUCKET = 'receipt-uploads';
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** Scan attempts count whether or not they succeed — OCR costs money either way. */
const MAX_ATTEMPTS_PER_USER_HOUR = 10;
const MAX_ATTEMPTS_PER_DEVICE_HOUR = 20;
/** Distinct other accounts that may scan from one device within 24 h. */
const MAX_OTHER_ACCOUNTS_PER_DEVICE_DAY = 2;

const fail = (status: number, error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

export async function POST(request: NextRequest) {
  let db;
  try {
    db = createServiceClient();
  } catch (e) {
    console.error('[scan] server not configured:', e instanceof Error ? e.message : e);
    return fail(503, 'The service is not configured yet. Please try again later.', 'NOT_CONFIGURED');
  }

  // 1. Who is calling? Taken from the verified token, never from the body.
  const auth = await requireUser(request, db);
  if (!auth.ok) return auth.response;
  const userId = auth.userId;

  // 2. Which file? A path inside the caller's own folder of the private bucket.
  let imagePath = '';
  try {
    const body = (await request.json()) as { imagePath?: unknown };
    imagePath = typeof body.imagePath === 'string' ? body.imagePath : '';
  } catch {
    return fail(400, 'Invalid request.');
  }
  if (
    !imagePath || imagePath.length > 200 || imagePath.includes('..') ||
    !imagePath.startsWith(`${userId}/`) || !/^[\w./-]+$/.test(imagePath)
  ) {
    return fail(400, 'Invalid image path.');
  }

  const credsJson = process.env.GOOGLE_CREDENTIALS_JSON;
  if (!credsJson) {
    return fail(503, 'Receipt reading is not configured yet. Please try again later.', 'NOT_CONFIGURED');
  }

  const deviceId = readDeviceId(request);
  let attemptId: number | null = null;
  const finish = async (outcome: string) => {
    if (attemptId != null) await db.from('scan_attempts').update({ outcome }).eq('id', attemptId);
  };

  try {
    // 3. Rate limits (cost control + abuse signals).
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const dayAgo = new Date(Date.now() - 86_400_000).toISOString();

    const userAttempts = await db.from('scan_attempts').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).gte('created_at', hourAgo);
    if (userAttempts.error) {
      console.error('[scan] scan_attempts unavailable (migration 001 applied?):', userAttempts.error.message);
      return fail(503, 'The service is not ready yet. Please try again later.', 'NOT_CONFIGURED');
    }
    if ((userAttempts.count ?? 0) >= MAX_ATTEMPTS_PER_USER_HOUR) {
      return fail(429, 'Too many scan attempts. Please wait a while and try again.', 'RATE_LIMITED');
    }

    if (deviceId) {
      const devHour = await db.from('scan_attempts').select('id', { count: 'exact', head: true })
        .eq('device_id', deviceId).gte('created_at', hourAgo);
      if ((devHour.count ?? 0) >= MAX_ATTEMPTS_PER_DEVICE_HOUR) {
        return fail(429, 'Too many scan attempts from this device. Please wait a while.', 'RATE_LIMITED');
      }
      const devUsers = await db.from('scan_attempts').select('user_id')
        .eq('device_id', deviceId).gte('created_at', dayAgo).limit(500);
      const others = new Set((devUsers.data ?? []).map((r) => r.user_id as string));
      others.delete(userId);
      if (others.size > MAX_OTHER_ACCOUNTS_PER_DEVICE_DAY) {
        return fail(403, 'Too many accounts have used this device. Please contact support.', 'DEVICE_LIMIT');
      }
    }

    const attempt = await db.from('scan_attempts').insert({ user_id: userId, device_id: deviceId })
      .select('id').single();
    attemptId = attempt.data?.id ?? null;

    // 4. Fetch the photo from the private bucket (service role) and run image checks.
    const dl = await db.storage.from(BUCKET).download(imagePath);
    if (dl.error || !dl.data) {
      await finish('NO_UPLOAD');
      return fail(404, 'We could not find your uploaded photo. Please try again.', 'UPLOAD_NOT_FOUND');
    }
    if (dl.data.size > MAX_IMAGE_BYTES) {
      await finish('TOO_LARGE');
      return fail(413, 'The photo is too large (max 10 MB).', 'IMAGE_TOO_LARGE');
    }
    const buf = Buffer.from(await dl.data.arrayBuffer());

    let analysis;
    try {
      analysis = await analyseImage(buf);
    } catch {
      await finish('NOT_AN_IMAGE');
      return fail(422, 'That file could not be read as a photo.', 'NOT_AN_IMAGE');
    }
    const verdict = judgeImage(analysis);
    if (!verdict.ok) {
      await finish(verdict.code);
      return fail(422, verdict.message, verdict.code);
    }

    // 5. Cheap duplicate check on the exact image BEFORE paying for OCR.
    const sameImage = await db.from('receipts').select('id').eq('image_sha256', analysis.sha256)
      .eq('status', 'VERIFIED').limit(1).maybeSingle();
    if (sameImage.data) {
      await finish('DUPLICATE_IMAGE');
      return fail(409, 'This receipt has already been submitted and rewarded. Each receipt can only be scanned once.', 'DUPLICATE_RECEIPT');
    }

    // 6. OCR on the bytes we already hold (no URL is ever fetched by Vision).
    let rawText = '';
    try {
      const client = new vision.ImageAnnotatorClient({ credentials: JSON.parse(credsJson) });
      const [result] = await client.textDetection({ image: { content: buf } });
      rawText = result.fullTextAnnotation?.text ?? '';
    } catch (e) {
      console.error('[scan] vision failed:', e instanceof Error ? e.message : e);
      await finish('OCR_ERROR');
      return fail(503, 'Receipt reading is temporarily unavailable. Please try again shortly.', 'OCR_UNAVAILABLE');
    }
    if (rawText.trim().length < 10) {
      await finish('NO_TEXT');
      return fail(422, 'Could not read any text. Make sure the receipt is flat, well lit and fully in frame.', 'NO_TEXT');
    }

    // 7. Extract + validate fields (volume, invoice, date, amount, price plausibility).
    const parsed = parseReceipt(rawText);
    if (!parsed.ok) {
      await finish(parsed.code);
      return fail(422, `Receipt rejected: ${parsed.message}`, parsed.code);
    }
    const { volumeKg, invoiceNum, vendor, amountNgn, receiptAt } = parsed.data;

    // 8. Atomic award: dedupe + reserve check + receipt + wallet + ledger in one DB transaction.
    const { data: award, error: rpcError } = await db.rpc('award_receipt', {
      p_user_id: userId,
      p_image_path: imagePath,
      p_vendor: vendor,
      p_invoice: invoiceNum,
      p_volume_kg: volumeKg,
      p_amount_ngn: amountNgn,
      p_receipt_at: receiptAt.toISOString(),
      p_sha256: analysis.sha256,
      p_exif_present: analysis.exifPresent,
      p_device_id: deviceId,
    });
    if (rpcError || !award) {
      console.error('[scan] award_receipt failed:', rpcError?.message);
      await finish('DB_ERROR');
      return fail(500, 'Something went wrong while crediting your points. Please try again.');
    }

    if (!award.ok) {
      await finish(award.code);
      switch (award.code) {
        case 'DUPLICATE_RECEIPT':
          return fail(409, 'This receipt has already been submitted and rewarded. Each receipt can only be scanned once.', 'DUPLICATE_RECEIPT');
        case 'RESERVE_EXHAUSTED':
          return fail(503, 'Rewards are temporarily paused. Your receipt was not used — please try again later.', 'RESERVE_EXHAUSTED');
        case 'NOT_CONFIGURED':
          return fail(503, 'Rewards are not switched on yet. Your receipt was not used — please try again later.', 'NOT_CONFIGURED');
        case 'REWARD_TOO_SMALL':
          return fail(422, 'This receipt is too small to earn a reward.', 'REWARD_TOO_SMALL');
        case 'NO_WALLET':
          return fail(409, 'Your account is still being set up. Reload the app and try again.', 'NO_WALLET');
        default:
          return fail(500, 'Something went wrong. Please try again.');
      }
    }

    await finish('VERIFIED');
    const points = Number(award.points);
    return NextResponse.json({
      success: true,
      message: `Receipt verified! You earned ${points.toLocaleString('en-NG')} points (₦${points.toLocaleString('en-NG')} off your next refill).`,
      data: {
        points,
        valueNgn: points, // 1 point = ₦1
        co2eKg: Number(award.co2e_kg),
        newBalance: Number(award.new_balance),
        vendorName: vendor,
        volumeKg,
        invoiceNum,
        amountNgn,
        receiptId: award.receipt_id,
      },
    });
  } catch (error: unknown) {
    console.error('[GasBack /api/scan]', error instanceof Error ? error.message : error);
    await finish('ERROR').catch(() => {});
    return fail(500, 'Something went wrong. Please try again.');
  }
}
