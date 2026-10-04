'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { formatPoints, formatNaira } from '@/lib/rewards';
import { BottomNav } from '@/components/BottomNav';
import { Gift, MapPin, CheckCircle, XCircle, Loader2, ChevronDown, ArrowLeft, Ticket } from 'lucide-react';

interface Merchant { id: string; name: string; city: string; address: string | null }
interface VoucherRow {
  id: string; code: string; points: number; naira_value: number;
  status: 'ISSUED' | 'REDEEMED' | 'CANCELLED'; created_at: string;
  merchants: { name: string } | { name: string }[] | null;
}

const merchantName = (v: VoucherRow) =>
  Array.isArray(v.merchants) ? v.merchants[0]?.name : v.merchants?.name;

export default function RedeemPage() {
  const router = useRouter();

  const [balance,    setBalance]    = useState<number | null>(null);
  const [minRedeem,  setMinRedeem]  = useState<number | null>(null);
  const [merchants,  setMerchants]  = useState<Merchant[] | null>(null);
  const [vouchers,   setVouchers]   = useState<VoucherRow[]>([]);
  const [loadError,  setLoadError]  = useState(false);
  const [city,       setCity]       = useState('');
  const [merchantId, setMerchantId] = useState('');
  const [points,     setPoints]     = useState('');
  const [busy,       setBusy]       = useState(false);
  const [result,     setResult]     = useState<{ code?: string; naira?: number; station?: string; err?: string } | null>(null);

  const load = useCallback(async (uid: string) => {
    const [w, p, m, v] = await Promise.all([
      supabase.from('wallets').select('points_balance').eq('user_id', uid).maybeSingle(),
      supabase.from('carbon_params').select('min_redeem_points').order('effective_from', { ascending: false }).order('id', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('merchants').select('id,name,city,address').order('city').order('name'),
      supabase.from('vouchers').select('id,code,points,naira_value,status,created_at,merchants(name)').eq('user_id', uid).order('created_at', { ascending: false }).limit(20),
    ]);
    if (w.error || p.error || m.error || v.error) { setLoadError(true); return; }
    setLoadError(false);
    setBalance(parseFloat(String(w.data?.points_balance ?? 0)));
    setMinRedeem(p.data ? Number(p.data.min_redeem_points) : null);
    const list = (m.data ?? []) as Merchant[];
    setMerchants(list);
    setVouchers((v.data ?? []) as unknown as VoucherRow[]);
    if (list.length > 0) {
      setCity((c) => c || list[0].city);
      setMerchantId((id) => id || list[0].id);
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return; }
      load(session.user.id);
    });
  }, [router, load]);

  const cities = Array.from(new Set((merchants ?? []).map((m) => m.city)));
  const stations = (merchants ?? []).filter((m) => m.city === city);

  const handleCityChange = (c: string) => {
    setCity(c);
    setMerchantId((merchants ?? []).find((m) => m.city === c)?.id ?? '');
    setResult(null);
  };

  const ptVal     = parseInt(points, 10) || 0;
  const canRedeem = !busy && minRedeem !== null && balance !== null && !!merchantId &&
                    ptVal >= minRedeem && ptVal <= balance;

  const handleRedeem = async () => {
    if (!canRedeem) return;
    setBusy(true); setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }
      const res = await fetch('/api/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ pointsToRedeem: ptVal, merchantId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setResult({ err: json.error ?? 'Redemption failed. Please try again.' });
      } else {
        setResult({ code: json.data.voucherCode, naira: json.data.nairaValue, station: json.data.merchantName });
        setPoints('');
        await load(session.user.id);
      }
    } catch {
      setResult({ err: 'Network error. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const selected = (merchants ?? []).find((m) => m.id === merchantId);

  return (
    <div className="flex flex-col min-h-screen bg-gb-bg text-white">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-10 pb-4">
        <button
          onClick={() => router.push('/dashboard')}
          aria-label="Back"
          className="w-9 h-9 rounded-full bg-gb-surface border border-gb-border flex items-center justify-center flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </button>
        <div>
          <h1 className="font-extrabold text-base">Redeem Points</h1>
          <p className="text-xs text-gray-500">Turn points into a discount voucher</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 px-4 space-y-3">

        {/* Balance card */}
        <div
          className="rounded-3xl p-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#14532d 0%,#16a34a 80%)' }}
        >
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/10 blur-2xl" />
          <p className="text-green-200 text-xs font-semibold uppercase tracking-widest mb-1">Available to Redeem</p>
          <p className="text-4xl font-black tabular-nums">{balance === null ? '—' : `${formatPoints(balance)} pts`}</p>
          <p className="text-green-300/80 text-xs mt-1">1 point = ₦1 off at a partner station</p>
        </div>

        {loadError && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-2">
            <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-red-400">Couldn&apos;t load your account. Check your connection and reopen the app.</p>
          </div>
        )}

        {merchants !== null && merchants.length === 0 && (
          <div className="card text-center py-8">
            <MapPin className="w-8 h-8 text-gray-700 mx-auto mb-2" />
            <p className="font-semibold text-sm">No partner stations are live yet</p>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">
              Your points are safe. Vouchers can be created as soon as the first partner stations join.
            </p>
          </div>
        )}

        {merchants !== null && merchants.length > 0 && (
          <>
            {/* Station selector */}
            <div className="card space-y-4">
              <div>
                <p className="font-bold text-sm mb-1">Choose a Partner Station</p>
                <p className="text-xs text-gray-500">The voucher is only valid at the station you pick</p>
              </div>

              {cities.length > 1 && (
                <div className="grid grid-cols-2 gap-2">
                  {cities.map((c) => (
                    <button
                      key={c}
                      onClick={() => handleCityChange(c)}
                      className={`flex items-center justify-center gap-2 py-3 rounded-xl border font-semibold text-sm transition-all ${
                        city === c ? 'bg-gb-green/15 border-gb-green text-gb-green' : 'bg-gb-elevated border-gb-border text-gray-400'
                      }`}
                    >
                      <MapPin className="w-3.5 h-3.5" /> {c}
                    </button>
                  ))}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-400 mb-1.5">Station{cities.length === 1 ? ` · ${city}` : ''}</label>
                <div className="relative">
                  <select
                    value={merchantId}
                    onChange={(e) => { setMerchantId(e.target.value); setResult(null); }}
                    className="input-dark appearance-none pr-10"
                  >
                    {stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                </div>
                {selected?.address && <p className="text-xs text-gray-500 mt-1.5">{selected.address}</p>}
              </div>
            </div>

            {/* Redemption form */}
            <div className="card space-y-4">
              <div>
                <p className="font-bold text-sm">Points to Redeem</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {minRedeem === null ? 'Redemption is not switched on yet' : `Minimum ${formatPoints(minRedeem)} points`}
                </p>
              </div>

              <div>
                <input
                  type="number" inputMode="numeric" step={1}
                  className="input-dark text-lg font-bold"
                  placeholder={minRedeem === null ? '—' : `Min ${formatPoints(minRedeem)}`}
                  value={points}
                  disabled={minRedeem === null}
                  onChange={(e) => { setPoints(e.target.value.replace(/\D/g, '')); setResult(null); }}
                />
                {minRedeem !== null && ptVal >= minRedeem && balance !== null && ptVal <= balance && (
                  <p className="text-xs text-gb-green mt-1.5 font-semibold">
                    = {formatNaira(ptVal)} off at {selected?.name}
                  </p>
                )}
                {balance !== null && ptVal > balance && (
                  <p className="text-xs text-red-400 mt-1.5">Exceeds your balance of {formatPoints(balance)} points</p>
                )}
              </div>

              {result?.err && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex gap-2">
                  <XCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-400">{result.err}</p>
                </div>
              )}

              {result?.code && (
                <div className="bg-gb-green/10 border border-gb-green/20 rounded-2xl p-5 text-center">
                  <CheckCircle className="w-8 h-8 text-gb-green mx-auto mb-2" />
                  <p className="text-xs text-gray-400 mb-1">Your voucher code</p>
                  <p className="text-xl font-black tracking-[0.12em] font-mono text-gb-green break-all">{result.code}</p>
                  <p className="text-xs text-gray-500 mt-2">
                    {formatNaira(result.naira ?? 0)} off · valid at <span className="text-white">{result.station}</span>
                  </p>
                  <p className="text-xs text-gray-500 mt-1.5">You can find this code again under Your Vouchers below.</p>
                </div>
              )}

              <button className="btn-primary" onClick={handleRedeem} disabled={!canRedeem}>
                {busy
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Creating voucher…</>
                  : <><Gift className="w-4 h-4" /> Create Voucher</>}
              </button>
            </div>
          </>
        )}

        {/* Existing vouchers */}
        {vouchers.length > 0 && (
          <div className="card space-y-3">
            <p className="font-bold text-sm flex items-center gap-2"><Ticket className="w-4 h-4 text-gb-green" /> Your Vouchers</p>
            {vouchers.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-3 border-t border-gb-border pt-3 first:border-0 first:pt-0">
                <div className="min-w-0">
                  <p className="font-mono text-sm font-bold tracking-wider">{v.code}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {merchantName(v) ?? 'Partner station'} · {new Date(v.created_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-gb-green">{formatNaira(Number(v.naira_value))}</p>
                  <p className="text-[10px] text-gray-500 capitalize">{v.status.toLowerCase()}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* How it works */}
        <div className="card space-y-3">
          <p className="font-bold text-sm">How to Use Your Voucher</p>
          {[
            'Pick the partner station where you will refill',
            'Enter how many points to spend — 1 point is ₦1 off',
            'A unique GASBACK code is created and saved to your account',
            'Show the code at the station before you pay',
            'The attendant applies your discount at checkout',
          ].map((txt, i) => (
            <div key={i} className="flex gap-3 items-start">
              <div className="w-5 h-5 rounded-full bg-gb-green/10 text-gb-green text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                {i + 1}
              </div>
              <p className="text-xs text-gray-400 leading-relaxed">{txt}</p>
            </div>
          ))}
        </div>

      </div>

      <BottomNav />
    </div>
  );
}
