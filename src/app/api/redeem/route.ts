import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabaseClient';
import { requireUser } from '@/lib/serverAuth';

export const runtime = 'nodejs';

const fail = (status: number, error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  let db;
  try {
    db = createServiceClient();
  } catch (e) {
    console.error('[redeem] server not configured:', e instanceof Error ? e.message : e);
    return fail(503, 'The service is not configured yet. Please try again later.', 'NOT_CONFIGURED');
  }

  // The user comes from the verified token, never from the body.
  const auth = await requireUser(request, db);
  if (!auth.ok) return auth.response;

  let points: number;
  let merchantId: string;
  try {
    const body = (await request.json()) as { pointsToRedeem?: unknown; merchantId?: unknown };
    points = Number(body.pointsToRedeem);
    merchantId = typeof body.merchantId === 'string' ? body.merchantId : '';
  } catch {
    return fail(400, 'Invalid request.');
  }
  if (!Number.isFinite(points) || points <= 0 || !Number.isInteger(points)) {
    return fail(400, 'Enter a whole number of points.', 'INVALID_AMOUNT');
  }
  if (!UUID.test(merchantId)) return fail(400, 'Choose a partner station.', 'MERCHANT_UNAVAILABLE');

  try {
    // One atomic DB transaction: balance check, voucher, wallet debit, ledger row.
    const { data, error } = await db.rpc('redeem_points', {
      p_user_id: auth.userId,
      p_points: points,
      p_merchant_id: merchantId,
    });
    if (error || !data) {
      console.error('[redeem] redeem_points failed:', error?.message);
      return fail(500, 'An internal error occurred during redemption. Please try again.');
    }
    if (!data.ok) {
      switch (data.code) {
        case 'BELOW_MINIMUM':
          return fail(400, `Minimum redemption is ${Number(data.min).toLocaleString('en-NG')} points.`, data.code);
        case 'INSUFFICIENT_BALANCE':
          return fail(400, `Insufficient balance. You have ${Number(data.balance).toLocaleString('en-NG')} points.`, data.code);
        case 'MERCHANT_UNAVAILABLE':
          return fail(400, 'That station is not available. Please choose another.', data.code);
        case 'INVALID_AMOUNT':
          return fail(400, 'Enter a whole number of points.', data.code);
        case 'NOT_CONFIGURED':
          return fail(503, 'Redemption is not switched on yet. Please try again later.', data.code);
        case 'NO_WALLET':
          return fail(409, 'Your account is still being set up. Reload the app and try again.', data.code);
        default:
          return fail(500, 'An internal error occurred during redemption. Please try again.');
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Voucher created. Show the code at the partner station before you pay.',
      data: {
        voucherCode: data.voucher_code,
        pointsRedeemed: Number(data.points),
        nairaValue: Number(data.naira_value), // 1 point = ₦1
        merchantName: data.merchant_name,
        remainingBalance: Number(data.remaining_balance),
      },
    });
  } catch (error: unknown) {
    console.error('[GasBack /api/redeem]', error instanceof Error ? error.message : error);
    return fail(500, 'An internal error occurred during redemption. Please try again.');
  }
}
