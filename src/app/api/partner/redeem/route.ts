import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabaseClient';
import { requirePartner } from '@/lib/partnerAuth';
import { normalizeVoucherCode } from '@/lib/voucherCode';

export const runtime = 'nodejs';

const fail = (status: number, error: string, code?: string) =>
  NextResponse.json({ error, ...(code ? { code } : {}) }, { status });

/** Mark a voucher used. Atomic in the database: it can only succeed once. */
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
  if (!code) return fail(400, 'That is not a valid GasBack code.', 'BAD_CODE');

  const { data, error } = await db.rpc('redeem_voucher', {
    p_merchant_id: p.merchantId, p_code: code, p_staff_id: p.userId,
  });
  if (error || !data) {
    console.error('[partner/redeem]', error?.message);
    return fail(500, 'Could not redeem the voucher. Please check its status and try again.');
  }
  if (!data.ok) {
    switch (data.code) {
      case 'NOT_FOUND':
        return fail(404, 'No voucher with that code for this station.', 'NOT_FOUND');
      case 'ALREADY_REDEEMED':
        return fail(409, 'This voucher has already been used.', 'ALREADY_REDEEMED');
      default:
        return fail(409, 'This voucher can no longer be used.', 'NOT_VALID');
    }
  }
  return NextResponse.json({
    success: true,
    message: 'Voucher accepted. Apply the discount to the customer’s bill.',
    data: { code: data.voucher_code, nairaValue: Number(data.naira_value), redeemedAt: data.redeemed_at },
  });
}
