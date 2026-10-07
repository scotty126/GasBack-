import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireUser } from '@/lib/serverAuth';

export type PartnerResult =
  | { ok: true; userId: string; merchantId: string; merchantName: string; role: 'CASHIER' | 'MANAGER' }
  | { ok: false; response: NextResponse };

/**
 * The caller must be signed in (verified token) AND be an active staff member of a station
 * (merchant_staff). The station comes from that row — never from the request.
 */
export async function requirePartner(request: Request, db: SupabaseClient): Promise<PartnerResult> {
  const auth = await requireUser(request, db);
  if (!auth.ok) return auth;

  const { data, error } = await db
    .from('merchant_staff')
    .select('merchant_id, role, is_active, merchants(name, active)')
    .eq('user_id', auth.userId)
    .maybeSingle();

  if (error) {
    console.error('[partner] merchant_staff unavailable (migration 004 applied?):', error.message);
    return { ok: false, response: NextResponse.json({ error: 'The partner portal is not ready yet. Please try again later.', code: 'NOT_CONFIGURED' }, { status: 503 }) };
  }
  const m = Array.isArray(data?.merchants) ? data?.merchants[0] : data?.merchants;
  if (!data || !data.is_active || !m || !m.active) {
    return { ok: false, response: NextResponse.json({ error: 'This account is not linked to a partner station.', code: 'NOT_PARTNER' }, { status: 403 }) };
  }
  return { ok: true, userId: auth.userId, merchantId: data.merchant_id as string, merchantName: m.name as string, role: data.role as 'CASHIER' | 'MANAGER' };
}
