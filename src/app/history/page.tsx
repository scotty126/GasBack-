'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { BottomNav } from '@/components/BottomNav';
import { History, CheckCircle, Clock, AlertTriangle, XCircle, ArrowLeft } from 'lucide-react';

interface ReceiptRow {
  id: string;
  vendor_name: string;
  volume_kg: number;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'FLAGGED';
  processed_at: string;
  rejection_reason: string | null;
  points_awarded: number | null;
}

const VENDOR_COLOURS = ['#16a34a', '#0891b2', '#7c3aed', '#c2410c', '#0284c7'];
const vendorColour = (name: string) => VENDOR_COLOURS[name.charCodeAt(0) % VENDOR_COLOURS.length];

const STATUS_CONFIG = {
  VERIFIED: { label: 'Verified',      bg: 'bg-gb-green/10',      text: 'text-gb-green',     border: 'border-gb-green/20',      Icon: CheckCircle  },
  PENDING:  { label: 'Pending Audit', bg: 'bg-amber-500/10',     text: 'text-amber-400',    border: 'border-amber-500/20',     Icon: Clock        },
  FLAGGED:  { label: 'Flagged',       bg: 'bg-orange-500/10',    text: 'text-orange-400',   border: 'border-orange-500/20',    Icon: AlertTriangle },
  REJECTED: { label: 'Rejected',      bg: 'bg-red-500/10',       text: 'text-red-400',      border: 'border-red-500/20',       Icon: XCircle      },
};

export default function HistoryPage() {
  const router   = useRouter();
  const [receipts, setReceipts] = useState<ReceiptRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async (uid: string) => {
    const res = await supabase
      .from('receipts')
      .select('id,vendor_name,volume_kg,status,processed_at,rejection_reason,points_awarded')
      .eq('user_id', uid)
      .order('processed_at', { ascending: false });
    const { data, error } = res;
    if (error) setLoadError(true);
    else if (data) setReceipts(data as ReceiptRow[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return; }
      load(session.user.id);
    });
  }, [router, load]);

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });

  const pts = (r: ReceiptRow) =>
    r.points_awarded != null ? Number(r.points_awarded).toLocaleString('en-NG', { maximumFractionDigits: 0 }) : '—';

  const counts = {
    VERIFIED: receipts.filter(r => r.status === 'VERIFIED').length,
    PENDING:  receipts.filter(r => r.status === 'PENDING').length,
    FLAGGED:  receipts.filter(r => r.status === 'FLAGGED' || r.status === 'REJECTED').length,
  };

  return (
    <div className="flex flex-col min-h-screen bg-gb-bg text-white">

      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-10 pb-4">
        <button
          onClick={() => router.push('/dashboard')}
          className="w-9 h-9 rounded-full bg-gb-surface border border-gb-border flex items-center justify-center flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </button>
        <div>
          <h1 className="font-extrabold text-base">Receipt History</h1>
          <p className="text-xs text-gray-500">{receipts.length} receipt{receipts.length !== 1 ? 's' : ''} uploaded</p>
        </div>
      </div>

      {/* Status summary chips */}
      <div className="flex gap-2 px-5 pb-4 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 bg-gb-green/10 border border-gb-green/20 rounded-full px-3 py-1.5 text-xs font-semibold text-gb-green flex-shrink-0">
          <CheckCircle className="w-3 h-3" /> {counts.VERIFIED} Verified
        </div>
        <div className="flex items-center gap-1.5 bg-amber-500/10 border border-amber-500/20 rounded-full px-3 py-1.5 text-xs font-semibold text-amber-400 flex-shrink-0">
          <Clock className="w-3 h-3" /> {counts.PENDING} Pending
        </div>
        <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-full px-3 py-1.5 text-xs font-semibold text-red-400 flex-shrink-0">
          <XCircle className="w-3 h-3" /> {counts.FLAGGED} Flagged
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto pb-24 px-4 space-y-2.5">
        {loadError ? (
          <div className="card flex flex-col items-center py-12 text-center">
            <XCircle className="w-10 h-10 text-red-400 mb-3" />
            <p className="font-semibold text-gray-300">Couldn&apos;t load your history</p>
            <p className="text-xs text-gray-500 mt-1">Check your connection and reopen the app.</p>
          </div>
        ) : loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-gb-green border-t-transparent animate-spin" />
            <p className="text-xs text-gray-500">Loading history…</p>
          </div>
        ) : receipts.length === 0 ? (
          <div className="card flex flex-col items-center py-16 text-center">
            <History className="w-12 h-12 text-gray-700 mb-3" />
            <p className="font-semibold text-gray-500">No receipts yet</p>
            <p className="text-xs text-gray-600 mt-1">Snap your first gas receipt to get started</p>
          </div>
        ) : (
          receipts.map((r) => {
            const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.PENDING;
            const StatusIcon = cfg.Icon;
            return (
              <div key={r.id} className={`rounded-2xl p-4 border ${cfg.bg} ${cfg.border}`}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-white text-sm font-bold"
                    style={{ backgroundColor: vendorColour(r.vendor_name) }}
                  >
                    {r.vendor_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold capitalize truncate">{r.vendor_name.replace(/_/g, ' ')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{fmtDate(r.processed_at)} · {r.volume_kg} kg</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {r.status === 'VERIFIED' && (
                      <p className="text-sm font-bold text-gb-green">+{pts(r)} pts</p>
                    )}
                    <div className={`flex items-center gap-1 mt-0.5 ${cfg.text}`}>
                      <StatusIcon className="w-3 h-3" />
                      <span className="text-[10px] font-semibold">{cfg.label}</span>
                    </div>
                  </div>
                </div>
                {r.rejection_reason && (
                  <p className="text-xs text-red-400/80 mt-2 pl-[52px] leading-relaxed">
                    {r.rejection_reason}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      <BottomNav />
    </div>
  );
}
