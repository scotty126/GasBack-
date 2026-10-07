'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { formatNaira } from '@/lib/rewards';
import { normalizeVoucherCode } from '@/lib/voucherCode';
import { Store, Search, CheckCircle, XCircle, Loader2, LogOut, Ticket, ArrowLeft } from 'lucide-react';

interface Me {
  merchant: { id: string; name: string };
  role: 'CASHIER' | 'MANAGER';
  stats: {
    redeemedCount: number; redeemedNaira: number; todayCount: number; todayNaira: number;
    outstandingCount: number; outstandingNaira: number;
  };
  recent: { code: string; nairaValue: number; redeemedAt: string }[];
}
interface Found { code: string; nairaValue: number; status: 'ISSUED' | 'REDEEMED' | 'CANCELLED'; redeemedAt: string | null }

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-NG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Africa/Lagos' });

export default function PartnerPage() {
  const router = useRouter();
  const [state, setState] = useState<'loading' | 'ok' | 'not_partner' | 'error'>('loading');
  const [me, setMe] = useState<Me | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<Found | null>(null);
  const [done, setDone] = useState<{ code: string; nairaValue: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const token = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace('/login'); return null; }
    return session.access_token;
  }, [router]);

  const api = useCallback(async (path: string, body?: unknown) => {
    const t = await token();
    if (!t) return null;
    const res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${t}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return { status: res.status, json: await res.json().catch(() => ({})) };
  }, [token]);

  const load = useCallback(async () => {
    try {
      const r = await api('/api/partner/me');
      if (!r) return;
      if (r.status === 403) { setState('not_partner'); return; }
      if (r.status !== 200) { setState('error'); return; }
      setMe(r.json as Me); setState('ok');
    } catch { setState('error'); }
  }, [api]);

  useEffect(() => { load(); }, [load]);

  const reset = () => { setInput(''); setFound(null); setDone(null); setErr(null); };

  const check = async () => {
    setErr(null); setFound(null); setDone(null);
    const code = normalizeVoucherCode(input);
    if (!code) { setErr('That is not a valid GasBack code. Codes look like GASBACK-ABCDE-FGH23.'); return; }
    setBusy(true);
    try {
      const r = await api('/api/partner/voucher', { code });
      if (!r) return;
      if (r.status === 200) setFound(r.json.voucher as Found);
      else setErr(r.json.error ?? 'Could not check the voucher.');
    } catch { setErr('Network error. Please try again.'); }
    finally { setBusy(false); }
  };

  const redeem = async () => {
    if (!found) return;
    setBusy(true); setErr(null);
    try {
      const r = await api('/api/partner/redeem', { code: found.code });
      if (!r) return;
      if (r.status === 200) {
        setDone({ code: r.json.data.code, nairaValue: r.json.data.nairaValue });
        setFound(null); setInput(''); setBusy(false);
        void load();                      // refresh totals without holding the button in "busy"
      } else {
        setErr(r.json.error ?? 'Could not redeem the voucher.');
        if (r.status === 409) setFound(null);
      }
    } catch { setErr('Network error. Please check and try again.'); }
    finally { setBusy(false); }
  };

  const signOut = async () => { await supabase.auth.signOut(); router.replace('/login'); };

  if (state === 'loading') {
    return <div className="min-h-screen bg-gb-bg text-white flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-gb-green" /></div>;
  }

  if (state !== 'ok' || !me) {
    return (
      <div className="min-h-screen bg-gb-bg text-white px-5 pt-16 text-center">
        <Store className="w-10 h-10 text-gray-600 mx-auto mb-3" />
        <h1 className="font-extrabold text-lg mb-2">{state === 'not_partner' ? 'Not a partner account' : 'Something went wrong'}</h1>
        <p className="text-sm text-gray-400 leading-relaxed mb-6">
          {state === 'not_partner'
            ? 'This account is not linked to a GasBack partner station. If you work at a partner station, ask GasBack to link your sign-in email.'
            : 'We could not load the partner portal. Check your connection and try again.'}
        </p>
        <button className="btn-primary" onClick={() => router.push('/dashboard')}>Back to the app</button>
      </div>
    );
  }

  const s = me.stats;
  return (
    <div className="flex flex-col min-h-screen bg-gb-bg text-white">
      <div className="flex items-center gap-3 px-5 pt-10 pb-4">
        <button onClick={() => router.push('/dashboard')} aria-label="Back to the app"
          className="w-9 h-9 rounded-full bg-gb-surface border border-gb-border flex items-center justify-center flex-shrink-0">
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="font-extrabold text-base truncate">{me.merchant.name}</h1>
          <p className="text-xs text-gray-500">Partner portal · {me.role.toLowerCase()}</p>
        </div>
        <button onClick={signOut} aria-label="Sign out"
          className="w-9 h-9 rounded-full bg-gb-surface border border-gb-border flex items-center justify-center flex-shrink-0">
          <LogOut className="w-4 h-4 text-gray-400" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto pb-10 px-4 space-y-3">
        {/* Validate */}
        <div className="card space-y-3">
          <p className="font-bold text-sm">Customer voucher</p>
          <p className="text-xs text-gray-500">Ask the customer for their code, check it, then apply the discount and confirm.</p>
          <input
            className="input-dark font-mono text-lg font-bold tracking-wider uppercase"
            placeholder="GASBACK-XXXXX-XXXXX"
            autoCapitalize="characters" autoCorrect="off" spellCheck={false}
            value={input}
            onChange={(e) => { setInput(e.target.value); setErr(null); setFound(null); setDone(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) check(); }}
          />
          <button className="btn-primary" onClick={check} disabled={busy || input.trim().length < 5}>
            {busy && !found ? <><Loader2 className="w-4 h-4 animate-spin" /> Checking…</> : <><Search className="w-4 h-4" /> Check code</>}
          </button>

          {err && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-2">
              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">{err}</p>
            </div>
          )}

          {found && found.status === 'ISSUED' && (
            <div className="bg-gb-green/10 border border-gb-green/20 rounded-2xl p-5 text-center space-y-3">
              <p className="text-xs text-gray-400">Valid voucher</p>
              <p className="text-3xl font-black text-gb-green">{formatNaira(found.nairaValue)} off</p>
              <p className="font-mono text-sm tracking-wider text-gray-400">{found.code}</p>
              <button className="btn-primary" onClick={redeem} disabled={busy}>
                {busy ? <><Loader2 className="w-4 h-4 animate-spin" /> Confirming…</> : <><CheckCircle className="w-4 h-4" /> Discount applied — mark as used</>}
              </button>
              <p className="text-[11px] text-gray-500">Only confirm once you have taken {formatNaira(found.nairaValue)} off the bill. This cannot be undone.</p>
            </div>
          )}

          {found && found.status !== 'ISSUED' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-2">
              <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-400">
                {found.status === 'REDEEMED'
                  ? `Already used${found.redeemedAt ? ` on ${when(found.redeemedAt)}` : ''}. Do not give another discount.`
                  : 'This voucher was cancelled and cannot be used.'}
              </p>
            </div>
          )}

          {done && (
            <div className="bg-gb-green/10 border border-gb-green/20 rounded-2xl p-5 text-center">
              <CheckCircle className="w-8 h-8 text-gb-green mx-auto mb-2" />
              <p className="font-bold">Voucher used</p>
              <p className="text-xs text-gray-400 mt-1">Apply {formatNaira(done.nairaValue)} off this customer&apos;s bill.</p>
              <button className="text-xs text-gb-green font-semibold mt-3" onClick={reset}>Next customer</button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">Today</p>
            <p className="text-xl font-black mt-1">{formatNaira(s.todayNaira)}</p>
            <p className="text-xs text-gray-500">{s.todayCount} voucher{s.todayCount === 1 ? '' : 's'}</p>
          </div>
          <div className="card">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">All time</p>
            <p className="text-xl font-black mt-1">{formatNaira(s.redeemedNaira)}</p>
            <p className="text-xs text-gray-500">{s.redeemedCount} voucher{s.redeemedCount === 1 ? '' : 's'}</p>
          </div>
        </div>
        <div className="card">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Issued, not yet used at this station</p>
          <p className="text-lg font-black mt-1">{formatNaira(s.outstandingNaira)} <span className="text-xs font-normal text-gray-500">· {s.outstandingCount} voucher{s.outstandingCount === 1 ? '' : 's'}</span></p>
        </div>

        {/* Recent */}
        <div className="card space-y-3">
          <p className="font-bold text-sm flex items-center gap-2"><Ticket className="w-4 h-4 text-gb-green" /> Recently used</p>
          {me.recent.length === 0 && <p className="text-xs text-gray-500">No vouchers used yet.</p>}
          {me.recent.map((r) => (
            <div key={r.code} className="flex items-center justify-between gap-3 border-t border-gb-border pt-3 first:border-0 first:pt-0">
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold tracking-wider">{r.code}</p>
                <p className="text-xs text-gray-500">{when(r.redeemedAt)}</p>
              </div>
              <p className="text-sm font-bold text-gb-green flex-shrink-0">{formatNaira(r.nairaValue)}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
