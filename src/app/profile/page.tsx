'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { supabase } from '@/lib/supabaseClient';
import { BottomNav } from '@/components/BottomNav';
import {
  Phone, Mail, LogOut, ChevronRight,
  Trees, Receipt, Star, Loader2, CheckCircle, Edit2,
  Sun, Moon, Monitor,
} from 'lucide-react';

interface Profile {
  email: string;
  phone_number: string | null;
  email_address: string | null;
  created_at: string;
}

interface Stats {
  points: number;
  receipts: number;
  co2: number;
}

export default function ProfilePage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const [profile,  setProfile]  = useState<Profile | null>(null);
  const [stats,    setStats]    = useState<Stats>({ points: 0, receipts: 0, co2: 0 });
  const [phone,    setPhone]    = useState('');
  const [editing,  setEditing]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState(false);
  const [userId,   setUserId]   = useState<string | null>(null);

  const load = useCallback(async (uid: string) => {
    const [sessionRes, userRow, walletRow, receiptRows] = await Promise.all([
      supabase.auth.getUser(),
      supabase.from('users').select('phone_number,email_address,created_at').eq('id', uid).single(),
      supabase.from('wallets').select('points_balance').eq('user_id', uid).single(),
      supabase.from('receipts').select('co2e_kg').eq('user_id', uid).eq('status', 'VERIFIED'),
    ]);

    const authEmail = sessionRes.data.user?.email ?? '';
    const p = userRow.data;
    if (p) {
      setProfile({ email: authEmail, ...p });
      setPhone(p.phone_number ?? '');
    }

    const bal  = parseFloat(String(walletRow.data?.points_balance ?? 0));
    const recs = receiptRows.data ?? [];
    const co2  = recs.reduce((s, r) => s + parseFloat(String(r.co2e_kg ?? 0)), 0);
    setStats({ points: bal, receipts: recs.length, co2 });
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return; }
      setUserId(session.user.id);
      load(session.user.id);
    });
  }, [router, load]);

  const savePhone = async () => {
    if (!userId) return;
    setSaving(true);
    const formatted = phone.startsWith('+') ? phone : `+234${phone.replace(/^0/, '')}`;
    await supabase.from('users').update({ phone_number: formatted }).eq('id', userId);
    setSaving(false);
    setSaved(true);
    setEditing(false);
    setTimeout(() => setSaved(false), 2500);
    load(userId);
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  const initials = (profile?.email_address ?? profile?.email ?? 'U')
    .split('@')[0].slice(0, 2).toUpperCase();

  const joinDate = profile?.created_at
    ? new Date(profile.created_at).toLocaleDateString('en-NG', { month: 'long', year: 'numeric' })
    : '';

  return (
    <div className="flex flex-col min-h-screen bg-gb-bg text-white">

      {/* Header */}
      <div className="px-5 pt-10 pb-4">
        <h1 className="font-extrabold text-base">Profile</h1>
      </div>

      <div className="flex-1 overflow-y-auto pb-24 px-4 space-y-3">

        {/* Avatar + identity card */}
        <div
          className="rounded-3xl p-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg,#14532d 0%,#16a34a 60%,#22c55e 100%)' }}
        >
          <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full bg-white/10 blur-2xl" />
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xl font-black">{initials}</span>
            </div>
            <div>
              <p className="font-extrabold text-lg leading-tight">
                {profile?.email_address?.split('@')[0] ?? profile?.email?.split('@')[0] ?? 'User'}
              </p>
              <p className="text-green-200 text-xs mt-0.5">{profile?.email ?? ''}</p>
            </div>
          </div>
          <p className="text-green-300/60 text-xs mt-4">Member since {joinDate}</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { Icon: Star,    value: stats.points.toLocaleString('en-NG', { maximumFractionDigits: 0 }), label: 'Points' },
            { Icon: Receipt, value: String(stats.receipts), label: 'Receipts' },
            { Icon: Trees,   value: `${stats.co2.toFixed(1)}`, label: 'kg CO₂e' },
          ].map(({ Icon, value, label }) => (
            <div key={label} className="card text-center py-4">
              <Icon className="w-4 h-4 text-gb-green mx-auto mb-1.5" />
              <p className="text-lg font-black tabular-nums">{value}</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Theme switcher */}
        <div className="card space-y-3">
          <p className="font-bold text-sm">Appearance</p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'light',  label: 'Light', Icon: Sun    },
              { value: 'dark',   label: 'Dark',  Icon: Moon   },
              { value: 'system', label: 'Auto',  Icon: Monitor },
            ].map(({ value, label, Icon }) => (
              <button
                key={value}
                onClick={() => setTheme(value)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-xl border text-xs font-semibold transition-all ${
                  theme === value
                    ? 'bg-gb-green/10 border-gb-green text-gb-green'
                    : 'bg-gb-elevated border-gb-border text-gb-text-muted'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px]" style={{ color: 'var(--gb-text-dim)' }}>
            Auto follows your phone&apos;s system setting.
          </p>
        </div>

        {/* Contact info */}
        <div className="card space-y-4">
          <p className="font-bold text-sm">Account Details</p>

          {/* Email (read-only) */}
          <div>
            <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email Address</label>
            <div className="flex items-center gap-3 bg-gb-elevated rounded-xl px-4 py-3 border border-gb-border">
              <Mail className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <span className="text-sm text-gray-300 flex-1 truncate">{profile?.email ?? '—'}</span>
              <span className="text-[10px] text-gray-600 bg-gb-surface px-2 py-0.5 rounded-full">Read-only</span>
            </div>
          </div>

          {/* Phone (editable) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-gray-500">Phone Number</label>
              {!editing && (
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1 text-xs text-gb-green font-semibold"
                >
                  <Edit2 className="w-3 h-3" /> Edit
                </button>
              )}
            </div>

            {editing ? (
              <div className="space-y-2">
                <div className="flex items-center gap-3 bg-gb-elevated rounded-xl px-4 py-3 border border-gb-green">
                  <Phone className="w-4 h-4 text-gb-green flex-shrink-0" />
                  <input
                    className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-gray-600"
                    type="tel"
                    inputMode="numeric"
                    placeholder="08012345678"
                    value={phone}
                    onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={savePhone}
                    disabled={saving}
                    className="flex-1 bg-gb-green text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-2"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    Save
                  </button>
                  <button
                    onClick={() => { setEditing(false); setPhone(profile?.phone_number ?? ''); }}
                    className="flex-1 bg-gb-elevated border border-gb-border text-gray-400 text-xs font-bold py-2.5 rounded-xl"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 bg-gb-elevated rounded-xl px-4 py-3 border border-gb-border">
                <Phone className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span className="text-sm text-gray-300 flex-1">
                  {profile?.phone_number ?? <span className="text-gray-600">Not set</span>}
                </span>
              </div>
            )}

            {saved && (
              <p className="text-xs text-gb-green mt-1.5 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Phone number saved
              </p>
            )}
          </div>
        </div>

        {/* Links */}
        <div className="card divide-y divide-gb-border">
          {[
            { label: 'About & Methodology', href: '/methodology' },
            { label: 'Partner Portal',       href: '/partners'    },
            { label: 'Privacy Policy',        href: '/privacy'     },
            { label: 'Terms of Service',      href: '/terms'       },
          ].map(({ label, href }) => (
            <button
              key={href}
              onClick={() => router.push(href)}
              className="w-full flex items-center justify-between py-3.5 first:pt-0 last:pb-0 text-sm font-medium transition-colors"
              style={{ color: 'var(--gb-text)' }}
            >
              {label}
              <ChevronRight className="w-4 h-4" style={{ color: 'var(--gb-text-muted)' }} />
            </button>
          ))}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          className="w-full flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/20 text-red-400 font-semibold text-sm py-4 rounded-2xl active:scale-[0.98] transition-transform"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </button>

        <p className="text-center text-[10px] pb-2" style={{ color: 'var(--gb-text-dim)' }}>© {new Date().getFullYear()} GasBack</p>

      </div>

      <BottomNav />
    </div>
  );
}
