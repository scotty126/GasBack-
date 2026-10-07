import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabaseClient';
import { requirePartner } from '@/lib/partnerAuth';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  let db;
  try {
    db = createServiceClient();
  } catch {
    return NextResponse.json({ error: 'The service is not configured yet.', code: 'NOT_CONFIGURED' }, { status: 503 });
  }
  const p = await requirePartner(request, db);
  if (!p.ok) return p.response;

  const [stats, recent] = await Promise.all([
    db.rpc('partner_stats', { p_merchant_id: p.merchantId }),
    db.from('vouchers').select('code, naira_value, redeemed_at')
      .eq('merchant_id', p.merchantId).eq('status', 'REDEEMED')
      .order('redeemed_at', { ascending: false }).limit(20),
  ]);
  if (stats.error || recent.error) {
    console.error('[partner/me]', stats.error?.message ?? recent.error?.message);
    return NextResponse.json({ error: 'Could not load station data. Please try again.' }, { status: 500 });
  }
  const s = stats.data as Record<string, number>;
  return NextResponse.json({
    merchant: { id: p.merchantId, name: p.merchantName },
    role: p.role,
    stats: {
      redeemedCount: Number(s.redeemed_count), redeemedNaira: Number(s.redeemed_naira),
      todayCount: Number(s.redeemed_today_count), todayNaira: Number(s.redeemed_today_naira),
      outstandingCount: Number(s.outstanding_count), outstandingNaira: Number(s.outstanding_naira),
    },
    recent: (recent.data ?? []).map((r) => ({ code: r.code, nairaValue: Number(r.naira_value), redeemedAt: r.redeemed_at })),
  });
}
