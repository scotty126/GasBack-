'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getDeviceId } from '@/lib/deviceId';
import { formatPoints } from '@/lib/rewards';
import { BottomNav } from '@/components/BottomNav';
import {
  Camera, Gift, Loader2, CheckCircle, AlertTriangle, XCircle, ChevronRight, Trees,
} from 'lucide-react';

interface ReceiptRow {
  id: string;
  vendor_name: string;
  volume_kg: number;
  processed_at: string;
  points_awarded: number | null;
}
type ScanPhase = 'idle' | 'uploading' | 'scanning' | 'success' | 'duplicate' | 'error';

const VENDOR_COLOURS = ['#16a34a', '#0891b2', '#7c3aed', '#c2410c', '#0284c7'];
const vendorColour = (name: string) => VENDOR_COLOURS[name.charCodeAt(0) % VENDOR_COLOURS.length];

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
};

export default function DashboardPage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [userId,    setUserId]    = useState<string | null>(null);
  const [balance,   setBalance]   = useState<number | null>(null);
  const [receipts,  setReceipts]  = useState<ReceiptRow[]>([]);
  const [totals,    setTotals]    = useState<{ count: number; co2eKg: number } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [phase,     setPhase]     = useState<ScanPhase>('idle');
  const [feedback,  setFeedback]  = useState<{ msg: string; pts?: number } | null>(null);

  const loadData = useCallback(async (uid: string) => {
    const [w, recent, all] = await Promise.all([
      supabase.from('wallets').select('points_balance').eq('user_id', uid).maybeSingle(),
      supabase
        .from('receipts')
        .select('id,vendor_name,volume_kg,processed_at,points_awarded')
        .eq('user_id', uid).eq('status', 'VERIFIED')
        .order('processed_at', { ascending: false }).limit(4),
      supabase.from('receipts').select('co2e_kg').eq('user_id', uid).eq('status', 'VERIFIED'),
    ]);
    if (w.error || recent.error || all.error) { setLoadError(true); return; }
    setLoadError(false);
    setBalance(parseFloat(String(w.data?.points_balance ?? 0)));
    setReceipts((recent.data ?? []) as ReceiptRow[]);
    const rows = all.data ?? [];
    setTotals({
      count: rows.length,
      co2eKg: rows.reduce((s, r) => s + parseFloat(String(r.co2e_kg ?? 0)), 0),
    });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { router.replace('/login'); return; }
      await supabase.from('users').upsert(
        { id: session.user.id, email_address: session.user.email ?? null },
        { onConflict: 'id' }
      );
      setUserId(session.user.id);
      loadData(session.user.id);
    });
  }, [router, loadData]);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    setPhase('uploading'); setFeedback(null);
    try {
      const ext = EXT_BY_TYPE[file.type];
      if (!ext) throw new Error('Please use a JPEG, PNG or WebP photo.');
      if (file.size > 10 * 1024 * 1024) throw new Error('The photo is too large (max 10 MB).');

      const path = `${userId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
      const { error: upErr } = await supabase.storage.from('receipt-uploads').upload(path, file, { contentType: file.type });
      if (upErr) throw new Error('Could not upload the photo. Check your connection and try again.');

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace('/login'); return; }

      setPhase('scanning');
      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          'x-gb-device-id': getDeviceId(),
        },
        body: JSON.stringify({ imagePath: path }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 409 && json.code === 'DUPLICATE_RECEIPT') {
        setPhase('duplicate'); setFeedback({ msg: json.error });
      } else if (!res.ok) {
        setPhase('error'); setFeedback({ msg: json.error ?? 'Scan failed. Please try again.' });
      } else {
        setPhase('success');
        setFeedback({ msg: json.message, pts: json.data.points });
        await loadData(userId);
      }
    } catch (err: unknown) {
      setPhase('error');
      setFeedback({ msg: err instanceof Error ? err.message : 'Unexpected error.' });
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
  const busy = phase === 'uploading' || phase === 'scanning';

  return (
    <div className="flex flex-col min-h-screen bg-gb-bg text-white">

      {/* Top bar */}
      <div className="flex items-center px-5 pt-10 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gb-green flex items-center justify-center">
            <span className="text-white text-[10px] font-black">G</span>
          </div>
          <span className="font-extrabold text-sm tracking-tight text-white">GasBack</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 px-4 space-y-3">

        {/* Balance card — 1 point = ₦1 of refill discount */}
        <div
          className="rounded-3xl p-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#14532d 0%,#16a34a 60%,#22c55e 100%)' }}
        >
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
          <p className="text-green-200 text-xs font-semibold uppercase tracking-widest mb-1">Your Points</p>
          {loadError ? (
            <p className="text-sm text-white/90 mt-2">Couldn&apos;t load your balance. Check your connection and reopen the app.</p>
          ) : (
            <>
              <p className="text-5xl font-black tabular-nums leading-none">
                {balance === null ? '—' : formatPoints(balance)}
              </p>
              <p className="text-green-200 text-sm mt-2">
                1 point = ₦1 off your next refill at a partner station
              </p>
            </>
          )}
        </div>

        {/* Snap Receipt card */}
        <div className="card">
          <input
            ref={fileRef}
            type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
            className="hidden"
            onChange={handleCapture}
            disabled={busy}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy || !userId}
            className="w-full flex items-center gap-4 text-left disabled:opacity-60"
          >
            <div className="w-12 h-12 rounded-2xl bg-gb-green flex items-center justify-center flex-shrink-0 shadow-lg shadow-green-900/40">
              {busy ? <Loader2 className="w-6 h-6 text-white animate-spin" /> : <Camera className="w-6 h-6 text-white" />}
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">Snap Receipt</p>
              <p className="text-gray-400 text-xs mt-0.5">Photograph your LPG receipt to earn points</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600 flex-shrink-0" />
          </button>

          {busy && (
            <div className="mt-4">
              <p className="text-xs text-gray-400 mb-1.5">
                {phase === 'uploading' ? 'Uploading photo…' : 'Reading your receipt…'}
              </p>
              <div className="w-full h-1.5 bg-gb-elevated rounded-full overflow-hidden">
                <div className="h-full w-full rounded-full progress-shimmer animate-pulse" />
              </div>
            </div>
          )}

          {(phase === 'success' || phase === 'duplicate' || phase === 'error') && feedback && (
            <div className={`mt-4 rounded-xl p-3 flex items-start gap-2.5 border ${
              phase === 'success'   ? 'bg-gb-green/10 border-gb-green/20' :
              phase === 'duplicate' ? 'bg-orange-500/10 border-orange-500/20' :
                                      'bg-red-500/10 border-red-500/20'
            }`}>
              {phase === 'success'   ? <CheckCircle  className="w-4 h-4 text-gb-green flex-shrink-0 mt-0.5" /> :
               phase === 'duplicate' ? <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0 mt-0.5" /> :
                                       <XCircle       className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />}
              <div className="flex-1">
                <p className={`text-xs font-semibold ${phase === 'success' ? 'text-gb-green' : phase === 'duplicate' ? 'text-orange-400' : 'text-red-400'}`}>
                  {phase === 'success' ? `+${formatPoints(feedback.pts ?? 0)} points added!` : phase === 'duplicate' ? 'Duplicate Receipt' : 'Scan Failed'}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{feedback.msg}</p>
              </div>
              <button onClick={() => setPhase('idle')} aria-label="Dismiss">
                <XCircle className="w-3.5 h-3.5 text-gray-600" />
              </button>
            </div>
          )}
        </div>

        {/* Metric cards — real totals across ALL verified receipts */}
        <div className="grid grid-cols-2 gap-3">
          <div className="card">
            <div className="w-8 h-8 rounded-xl bg-gb-green/10 flex items-center justify-center mb-3">
              <Trees className="w-4 h-4 text-gb-green" />
            </div>
            <p className="text-2xl font-black tabular-nums">{totals ? totals.co2eKg.toFixed(1) : '—'}</p>
            <p className="text-xs text-gray-400 mt-0.5">kg CO₂e avoided</p>
          </div>
          <div className="card">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center mb-3">
              <Gift className="w-4 h-4 text-purple-400" />
            </div>
            <p className="text-2xl font-black tabular-nums">{totals ? totals.count : '—'}</p>
            <p className="text-xs text-gray-400 mt-0.5">Receipts verified</p>
          </div>
        </div>

        {/* Recent receipts */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <p className="font-bold text-sm">Recent Activity</p>
            <button
              onClick={() => router.push('/history')}
              className="text-xs text-gb-green font-semibold flex items-center gap-1"
            >
              View All <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          {receipts.length === 0 ? (
            <div className="flex flex-col items-center py-6 text-center">
              <Camera className="w-8 h-8 text-gray-700 mb-2" />
              <p className="text-xs text-gray-500">No receipts yet — snap one above!</p>
            </div>
          ) : (
            <div className="space-y-3">
              {receipts.map((r) => (
                <div key={r.id} className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-xs font-bold"
                    style={{ backgroundColor: vendorColour(r.vendor_name) }}
                  >
                    {r.vendor_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate capitalize">{r.vendor_name.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-gray-400">{fmtDate(r.processed_at)} · {r.volume_kg} kg</p>
                  </div>
                  <span className="badge-verified">
                    {r.points_awarded != null ? `+${formatPoints(Number(r.points_awarded))} pts` : 'Verified'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Redeem CTA */}
        <button
          onClick={() => router.push('/redeem')}
          className="w-full rounded-2xl p-4 border border-gb-green/20 flex gap-4 items-center text-left active:scale-[0.98] transition-transform"
          style={{ background: 'linear-gradient(135deg,#052e16 0%,#0d4a25 100%)' }}
        >
          <div className="w-12 h-12 rounded-2xl bg-gb-green/20 flex items-center justify-center flex-shrink-0">
            <Gift className="w-6 h-6 text-gb-green" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-sm text-white">Redeem Points</p>
            <p className="text-xs text-green-400/70 mt-0.5 leading-relaxed">
              Turn your points into a discount voucher at a partner station.
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-gb-green flex-shrink-0" />
        </button>

      </div>

      <BottomNav />
    </div>
  );
}
