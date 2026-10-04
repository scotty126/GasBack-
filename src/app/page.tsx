'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { ArrowRight, ScanLine, TrendingUp, Banknote } from 'lucide-react';

const HOW_IT_WORKS = [
  { Icon: ScanLine,   title: 'Snap Receipt',   desc: 'Take a photo of your LPG refill receipt.' },
  { Icon: TrendingUp, title: 'Earn Points',     desc: 'Each verified refill earns points. 1 point is worth ₦1 off.' },
  { Icon: Banknote,   title: 'Redeem Discounts', desc: 'Turn points into a discount voucher at a partner station.' },
];

export default function SplashPage() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) router.replace('/dashboard');
    });
  }, [router]);

  return (
    <div className="flex flex-col min-h-screen bg-gb-bg text-white overflow-y-auto">

      {/* Top bar */}
      <div className="flex items-center justify-between px-5 pt-10 pb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gb-green flex items-center justify-center">
            <span className="text-white text-xs font-black">G</span>
          </div>
          <span className="font-extrabold text-base tracking-tight">GasBack</span>
        </div>
      </div>

      {/* Hero image */}
      <div className="mx-4 rounded-3xl overflow-hidden relative" style={{ height: 260 }}>
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(160deg, #0d4a25 0%, #16a34a 35%, #166534 60%, #052e16 100%)' }}
        />
        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full bg-gb-green/30 blur-2xl" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-24 h-16 bg-[#052e16] rounded-t-full" />
        <svg className="absolute bottom-0 left-1/2 -translate-x-1/2" width="100" height="130" viewBox="0 0 100 130" fill="none">
          <ellipse cx="50" cy="55" rx="38" ry="48" fill="#16a34a" opacity="0.9" />
          <ellipse cx="35" cy="70" rx="22" ry="32" fill="#15803d" opacity="0.7" />
          <ellipse cx="65" cy="68" rx="20" ry="28" fill="#166534" opacity="0.6" />
          <rect x="44" y="98" width="12" height="32" fill="#854d0e" rx="3" />
        </svg>
        <div className="absolute inset-0 bg-gradient-to-t from-gb-bg/80 via-transparent to-transparent" />
      </div>

      {/* Headline */}
      <div className="px-5 mt-6">
        <h1 className="text-3xl font-extrabold leading-tight tracking-tight">
          Earn Rewards on{' '}
          <span className="text-gb-green">Every Gas Refill</span>
        </h1>
        <p className="mt-3 text-gray-400 text-sm leading-relaxed">
          Scan your LPG receipt, earn points, and use them as discounts on your next refill.
          Every refill that replaces charcoal or firewood also cuts cooking emissions.
        </p>
      </div>

      {/* CTAs */}
      <div className="px-5 mt-6 space-y-3">
        <button onClick={() => router.push('/register')} className="btn-primary text-base font-bold">
          Get Started <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={() => router.push('/login')} className="btn-outline text-base">
          I already have an account
        </button>
      </div>

      {/* How it works */}
      <div className="px-5 mt-8 pb-10">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
          How It Works
        </p>
        <div className="space-y-3">
          {HOW_IT_WORKS.map(({ Icon, title, desc }) => (
            <div key={title} className="card flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-gb-green/10 flex items-center justify-center flex-shrink-0">
                <Icon className="w-5 h-5 text-gb-green" />
              </div>
              <div>
                <p className="font-bold text-sm text-white">{title}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
