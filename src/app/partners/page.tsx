import Link from 'next/link';

export const metadata = {
  title: 'Partner Stations — GasBack',
  description: 'GasBack is recruiting LPG stations for its pilot. Customers redeem GasBack vouchers as discounts at partner stations.',
};

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
          <Link href="/methodology" className="hover:text-white transition-colors">Methodology</Link>
          <Link href="/partners"    className="text-white font-semibold">Partners</Link>
          <Link href="/privacy"     className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms"       className="hover:text-white transition-colors">Terms</Link>
        </nav>
        <a href="mailto:partners@gasback.ng" className="bg-gb-green text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-green-500 transition-colors">
          Become a Partner
        </a>
      </div>
    </header>
  );
}

const STEPS = [
  { n: '01', title: 'Get in touch',        desc: 'Email us your station details. We are recruiting a small group of stations for the pilot.' },
  { n: '02', title: 'Agree the terms',     desc: 'We agree how and when vouchers you honour are reimbursed before you start. Nothing is assumed.' },
  { n: '03', title: 'Customers redeem',    desc: 'A customer shows a GASBACK-XXXXX-XXXXX code from their phone at your counter.' },
  { n: '04', title: 'Apply the discount',  desc: 'You take the voucher amount off their bill. 1 point on the voucher is ₦1.' },
];

const NOT_YET = [
  'A partner dashboard and a tool to validate and mark codes as used. Today the code is checked by your attendant and settled with us directly.',
  'Sales analytics for stations.',
  'Automated reimbursement. Settlement is agreed and handled with each partner during the pilot.',
];

export default function PartnersPage() {
  return (
    <div className="w-full min-h-screen bg-gb-bg text-white">
      <MarketingHeader />

      <main className="max-w-3xl mx-auto px-6 py-16">

        <div className="mb-14">
          <span className="inline-block bg-gb-green/10 text-gb-green text-xs font-bold px-3 py-1 rounded-full border border-gb-green/20 mb-4">
            Pilot partner stations
          </span>
          <h1 className="text-4xl font-extrabold leading-tight mb-4">Partner with GasBack</h1>
          <p className="text-gray-400 text-lg leading-relaxed mb-8">
            GasBack rewards households for refilling with LPG. Customers earn points from their
            receipts and spend them as discount vouchers at partner stations. We are looking for
            stations to join the pilot.
          </p>
          <a
            href="mailto:partners@gasback.ng?subject=Partner%20Application"
            className="inline-block bg-gb-green text-white font-bold px-8 py-4 rounded-xl hover:bg-green-500 transition-colors"
          >
            Email partners@gasback.ng →
          </a>
        </div>

        <section className="mb-14">
          <h2 className="text-2xl font-bold mb-6">How it works</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            {STEPS.map(({ n, title, desc }) => (
              <div key={n} className="bg-gb-surface rounded-2xl border border-gb-border p-5">
                <div className="w-9 h-9 rounded-full bg-gb-green/10 border border-gb-green/20 text-gb-green font-black text-xs flex items-center justify-center mb-3">
                  {n}
                </div>
                <p className="font-bold text-sm mb-1">{title}</p>
                <p className="text-gray-400 text-xs leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-14">
          <div className="bg-gb-surface rounded-2xl border border-gb-border p-6">
            <h2 className="text-xl font-bold mb-3">Who we are looking for</h2>
            <p className="text-sm text-gray-300 leading-relaxed">
              Licensed LPG retail stations. We will confirm any further requirements when we speak.
              There is no POS integration to set up.
            </p>
          </div>
        </section>

        <section className="mb-14">
          <h2 className="text-xl font-bold mb-3">Not available yet</h2>
          <p className="text-sm text-gray-400 mb-4">We would rather be clear about what the pilot does not include:</p>
          <ul className="space-y-3 text-sm text-gray-300 leading-relaxed">
            {NOT_YET.map((t) => (
              <li key={t} className="flex gap-2"><span className="text-amber-400 flex-shrink-0">•</span> {t}</li>
            ))}
          </ul>
        </section>

      </main>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-gray-600">
        © {new Date().getFullYear()} GasBack · <Link href="/privacy" className="hover:text-gray-400">Privacy</Link> · <Link href="/terms" className="hover:text-gray-400">Terms</Link> · <Link href="/methodology" className="hover:text-gray-400">Methodology</Link>
      </footer>
    </div>
  );
}
