import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabaseClient';
import { requirePartner } from '@/lib/partnerAuth';
import { normalizeVoucherCode } from '@/lib/voucherCode';

export const runtime = 'nodejs';

const fail = (status: number, error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

/** Look a voucher up (no changes). Only vouchers made for the caller's own station are visible. */
export async function POST(request: NextRequest) {
  let db;
  try {
    db = createServiceClient();
  } catch {
    return fail(503, 'The service is not configured yet.', 'NOT_CONFIGURED');
  }
  const p = await requirePartner(request, db);
  if (!p.ok) return p.response;

  let code: string | null;
  try {
    const body = (await request.json()) as { code?: unknown };
    code = normalizeVoucherCode(typeof body.code === 'string' ? body.code : '');
  } catch {
    return fail(400, 'Invalid request.');
  }
  if (!code) return fail(400, 'That is not a valid GasBack code. Codes look like GASBACK-ABCDE-FGH23.', 'BAD_CODE');

  const { data, error } = await db.from('vouchers')
    .select('code, naira_value, points, status, created_at, redeemed_at')
    .eq('code', code).eq('merchant_id', p.merchantId).maybeSingle();
  if (error) {
    console.error('[partner/voucher]', error.message);
    return fail(500, 'Could not check the voucher. Please try again.');
  }
  if (!data) return fail(404, 'No voucher with that code for this station.', 'NOT_FOUND');

  return NextResponse.json({
    voucher: {
      code: data.code, nairaValue: Number(data.naira_value), status: data.status,
      createdAt: data.created_at, redeemedAt: data.redeemed_at,
    },
  });
}
