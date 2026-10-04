import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { computeReward, formatPoints, type CarbonParams } from '@/lib/rewards';

export const metadata = {
  title: 'Methodology — GasBack',
  description: 'How GasBack turns a verified LPG receipt into avoided emissions and reward points.',
};

// Parameters are read live so this page can never drift from what the app actually pays.
export const dynamic = 'force-dynamic';

async function loadParams(): Promise<CarbonParams | null> {
  try {
    const { data, error } = await supabase
      .from('carbon_params')
      .select('*')
      .order('effective_from', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: Number(data.id),
      kg_co2e_per_kg_lpg: Number(data.kg_co2e_per_kg_lpg),
      price_usd_per_tco2e: Number(data.price_usd_per_tco2e),
      price_as_of: String(data.price_as_of),
      price_source: String(data.price_source),
      user_share: Number(data.user_share),
      fx_ngn_per_usd: Number(data.fx_ngn_per_usd),
      fx_as_of: String(data.fx_as_of),
      min_redeem_points: Number(data.min_redeem_points),
      effective_from: String(data.effective_from),
    };
  } catch {
    return null;
  }
}

function MarketingHeader() {
  return (
    <header className="border-b border-white/10 px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gb-green flex items-center justify-center">
            <span className="text-white text-xs font-black">G</span>
          </div>
          <span className="font-extrabold text-base tracking-tight text-white">GasBack</span>
        </Link>
        <nav className="hidden md:flex items-center gap-6 text-sm text-gray-400">
          <Link href="/methodology" className="text-white font-semibold">Methodology</Link>
          <Link href="/partners"    className="hover:text-white transition-colors">Partners</Link>
          <Link href="/privacy"     className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms"       className="hover:text-white transition-colors">Terms</Link>
        </nav>
        <Link href="/register" className="bg-gb-green text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-green-500 transition-colors">
          Get Started
        </Link>
      </div>
    </header>
  );
}

export default async function MethodologyPage() {
  const params = await loadParams();
  const example = params ? computeReward(12.5, params) : null;

  return (
    <div className="w-full min-h-screen bg-gb-bg text-white">
      <MarketingHeader />

      <main className="max-w-3xl mx-auto px-6 py-16">

        {/* Hero */}
        <div className="mb-14">
          <span className="inline-block bg-amber-500/10 text-amber-400 text-xs font-bold px-3 py-1 rounded-full border border-amber-500/20 mb-4">
            Pilot methodology · not yet third-party verified
          </span>
          <h1 className="text-4xl font-extrabold leading-tight mb-4">How GasBack counts emissions</h1>
          <p className="text-gray-400 text-lg leading-relaxed">
            This page shows exactly how a verified LPG receipt becomes avoided emissions and reward
            points. The numbers below are read live from the app&apos;s settings, so they are always the
            ones currently in use.
          </p>
        </div>

        {/* Idea */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4 text-gb-green">The idea</h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            Many households still cook with charcoal or firewood. When a household uses LPG instead,
            cooking emissions fall. GasBack measures that switch from real purchases: each verified
            LPG receipt is one measured unit of fuel that replaced a dirtier one.
          </p>
          <p className="text-gray-300 leading-relaxed">
            Our aim is to pool these small reductions from many households and, in future, offer them
            as carbon credits. That has not started — see &ldquo;What is not done yet&rdquo; below.
          </p>
        </section>

        {/* Formula */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6 text-gb-green">The calculation</h2>

          {params && example ? (
            <>
              <div className="bg-gb-surface rounded-2xl border border-gb-border p-6 mb-6 font-mono text-sm space-y-3">
                <div className="text-gray-400 text-xs uppercase tracking-widest mb-2">Per verified receipt</div>
                <p className="text-gray-300">Avoided emissions (kg CO₂e) = LPG kg × {params.kg_co2e_per_kg_lpg}</p>
                <p className="text-gray-300">Carbon value (US$) = kg CO₂e ÷ 1000 × ${params.price_usd_per_tco2e.toFixed(2)}</p>
                <p className="text-gray-300">Your share = value × {Math.round(params.user_share * 100)}%</p>
                <p className="text-gb-green font-bold">Points = your share × ₦{params.fx_ngn_per_usd.toLocaleString('en-NG')} per US$, rounded down</p>
                <p className="text-gray-400 text-xs pt-2 border-t border-gb-border">
                  1 point is always worth ₦1 of refill discount. When prices or exchange rates change,
                  the number of points earned per kg changes — the value of a point you already hold does not.
                </p>
              </div>

              <div className="bg-gb-surface rounded-2xl border border-gb-border p-5 mb-6">
                <p className="text-xs text-gray-500 uppercase tracking-widest mb-3">Example · one 12.5 kg refill</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div><p className="text-lg font-black text-gb-green">{example.co2eKg.toFixed(2)}</p><p className="text-xs text-gray-400">kg CO₂e avoided</p></div>
                  <div><p className="text-lg font-black">${example.grossUsd.toFixed(3)}</p><p className="text-xs text-gray-400">carbon value</p></div>
                  <div><p className="text-lg font-black">${example.userUsd.toFixed(2)}</p><p className="text-xs text-gray-400">your share</p></div>
                  <div><p className="text-lg font-black text-gb-green">{formatPoints(example.points)}</p><p className="text-xs text-gray-400">points (₦{formatPoints(example.points)})</p></div>
                </div>
              </div>

              <ul className="space-y-2 text-sm text-gray-400 leading-relaxed">
                <li>
                  <span className="text-white font-semibold">Emission factor ({params.kg_co2e_per_kg_lpg} kg CO₂e per kg LPG):</span>{' '}
                  a planning assumption that every kg of LPG replaces charcoal or firewood. A registered
                  cookstove methodology may use a lower figure; if so, this number will change.
                </li>
                <li>
                  <span className="text-white font-semibold">Carbon price (${params.price_usd_per_tco2e.toFixed(2)} per tonne):</span>{' '}
                  {params.price_source}, as of {params.price_as_of}. Prices move; this is not a guaranteed sale price.
                </li>
                <li>
                  <span className="text-white font-semibold">Exchange rate (₦{params.fx_ngn_per_usd.toLocaleString('en-NG')} per US$):</span>{' '}
                  set by GasBack as of {params.fx_as_of}.
                </li>
              </ul>
            </>
          ) : (
            <div className="bg-gb-surface rounded-2xl border border-gb-border p-6 text-sm text-gray-400">
              The live calculation settings are not available right now, or have not been set yet.
              Please check back shortly.
            </div>
          )}
        </section>

        {/* Verification Process */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4 text-gb-green">How a receipt is checked</h2>
          <div className="space-y-4">
            {[
              { step: '01', title: 'Photo checks', desc: 'The photo must be readable, not made in an image editor, and (when the phone records it) taken recently. The exact same image cannot be used twice.' },
              { step: '02', title: 'Receipt reading', desc: 'An OCR service (OCR.space or Google Cloud Vision) reads the text. We extract the cylinder size, invoice number, date and total, and require that the amount paid is plausible for the weight.' },
              { step: '03', title: 'Duplicate check', desc: 'The same invoice at the same vendor cannot earn twice, across all users.' },
              { step: '04', title: 'Award', desc: 'In one database step we re-check for duplicates, confirm the reward reserve can cover the points, record the receipt, credit your points and log the transaction.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-4 p-4 bg-gb-surface rounded-xl border border-gb-border">
                <span className="text-gb-green font-black text-lg flex-shrink-0 w-8">{step}</span>
                <div>
                  <p className="font-bold text-sm mb-1">{title}</p>
                  <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Honesty */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4 text-gb-green">What is not done yet</h2>
          <ul className="space-y-3 text-gray-300 text-sm leading-relaxed">
            {[
              'No carbon credits have been issued or sold. GasBack is not registered with Gold Standard, Verra or any other registry, and no third party has verified this methodology.',
              'During the pilot, points are paid from a reward reserve that GasBack has set aside in advance — not from carbon-credit sales. If the reserve is full, rewards pause.',
              'We check receipts automatically but cannot yet confirm a purchase with the station’s own sales records, so a receipt altered before photographing could still pass.',
              'Our plan is to seek verification under a recognised cookstove methodology and a carbon registry. Until that happens, treat the emission figures as our estimate, not a certified result.',
            ].map((t) => (
              <li key={t} className="flex gap-2">
                <span className="text-amber-400 flex-shrink-0">•</span> {t}
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <div className="bg-gb-green/10 border border-gb-green/20 rounded-2xl p-8 text-center">
          <h3 className="text-xl font-bold mb-2">Questions about the method?</h3>
          <p className="text-gray-400 text-sm mb-6 leading-relaxed">
            Funders, researchers and carbon-market partners are welcome to ask for the detail behind these numbers.
          </p>
          <a
            href="mailto:credits@gasback.ng"
            className="inline-block bg-gb-green text-white font-bold px-6 py-3 rounded-xl hover:bg-green-500 transition-colors"
          >
            Contact the credits team
          </a>
        </div>

      </main>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-gray-600">
        © {new Date().getFullYear()} GasBack · <Link href="/privacy" className="hover:text-gray-400">Privacy</Link> · <Link href="/terms" className="hover:text-gray-400">Terms</Link>
      </footer>
    </div>
  );
}
