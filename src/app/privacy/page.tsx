import Link from 'next/link';

export const metadata = {
  title: 'Privacy Policy — GasBack',
  description: 'How GasBack collects, uses, and protects your personal data in compliance with the Nigeria Data Protection Regulation (NDPR).',
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
          <Link href="/partners"    className="hover:text-white transition-colors">Partners</Link>
          <Link href="/privacy"     className="text-white font-semibold">Privacy</Link>
          <Link href="/terms"       className="hover:text-white transition-colors">Terms</Link>
        </nav>
        <Link href="/register" className="bg-gb-green text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-green-500 transition-colors">
          Get Started
        </Link>
      </div>
    </header>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold text-white mb-3">{title}</h2>
      <div className="text-gray-300 text-sm leading-relaxed space-y-3">{children}</div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="w-full min-h-screen bg-gb-bg text-white">
      <MarketingHeader />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-12">
          <span className="inline-block bg-gb-green/10 text-gb-green text-xs font-bold px-3 py-1 rounded-full border border-gb-green/20 mb-4">
            NDPR Compliant
          </span>
          <h1 className="text-4xl font-extrabold leading-tight mb-4">Privacy Policy</h1>
          <p className="text-gray-400">Effective date: 1 June 2025 · Last updated: 1 June 2025</p>
        </div>

        <Section title="1. Who We Are">
          <p>
            GasBack (operated by GasBack Technologies Ltd, Lagos, Nigeria) is a mobile-first
            carbon loyalty platform that rewards Nigerian households for switching from solid biomass
            fuels to liquefied petroleum gas (LPG). We are committed to protecting your personal
            information in accordance with the Nigeria Data Protection Regulation 2019 (NDPR) and the
            Nigeria Data Protection Act 2023 (NDPA).
          </p>
        </Section>

        <Section title="2. Data We Collect">
          <p>We collect only the minimum data required to operate the service:</p>
          <ul className="list-none space-y-2 mt-2">
            {[
              ['Identity', 'Email address and phone number'],
              ['Authentication', 'Hashed password or OAuth token (Google/Apple). We never store plaintext passwords.'],
              ['Receipt Images', 'Photos of LPG purchase receipts uploaded for carbon credit processing. Images are stored encrypted at rest.'],
              ['Transaction Data', 'Points earned, vouchers redeemed, timestamps, vendor names, gas volumes.'],
              ['Device & Usage', 'IP address, browser type, app version, and feature interaction logs for security and debugging. A random device identifier stored in your browser, used to limit abuse (for example, many accounts on one device). Technical details embedded in receipt photos by your phone, such as capture time and phone model, if your phone records them.'],
            ].map(([type, desc]) => (
              <li key={String(type)} className="flex gap-3 text-sm">
                <span className="text-gb-green font-semibold flex-shrink-0 w-32">{type}</span>
                <span className="text-gray-300">{desc}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="3. How We Use Your Data">
          <p>Your data is used exclusively for:</p>
          <ul className="space-y-1.5 mt-2">
            {[
              'Authenticating your account securely',
              'Processing receipt OCR and awarding carbon credit points',
              'Detecting and preventing duplicate or fraudulent receipt submissions',
              'Generating and validating gas voucher redemption codes',
              'Sending transactional notifications (receipt status, voucher codes)',
              'Compiling anonymised, aggregated emissions data for carbon credit reporting',
              'Complying with applicable Nigerian laws and regulations',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-gb-green flex-shrink-0">→</span> {item}
              </li>
            ))}
          </ul>
          <p className="mt-4">
            We do not sell, rent, or trade your personal data to third parties for marketing purposes.
          </p>
        </Section>

        <Section title="4. Receipt Image Handling">
          <p>
            Receipt images are uploaded to encrypted cloud storage (Supabase Storage, in a private bucket that only you and our servers can read)
            solely for OCR text extraction by the service named in Section 6. After text extraction is complete, images are retained for 12 months
            for fraud audit purposes and then permanently deleted. You may request earlier deletion at any time
            (see Section 8).
          </p>
          <p>
            Extracted data (vendor name, invoice number, gas volume) is pseudonymised — your identity
            is referenced only by a system-generated UUID, not by your name or contact details, in the
            carbon credit reporting pipeline.
          </p>
        </Section>

        <Section title="5. Data Storage & Security">
          <p>
            All data is stored in Supabase (PostgreSQL), with row-level security policies ensuring that
            each user can only access their own records. Data in transit is encrypted via TLS 1.3.
            Data at rest is encrypted via AES-256.
          </p>
          <p>
            We maintain a written Data Protection Policy reviewed quarterly, and we appoint a Data
            Protection Officer (DPO) as required by the NDPA 2023. To contact our DPO:{' '}
            <a href="mailto:dpo@gasback.ng" className="text-gb-green hover:underline">dpo@gasback.ng</a>.
          </p>
        </Section>

        <Section title="6. Third-Party Processors">
          <p>We share limited data with the following processors, each bound by NDPR-compliant Data Processing Agreements:</p>
          <ul className="space-y-2 mt-2">
            {[
              ['Supabase Inc.', 'Authentication, database, file storage'],
              ['OCR.space or Google Cloud', 'Reading the text on your receipt photo (OCR). Your receipt photo is sent to whichever of these two services GasBack has switched on. Receipt photos can show shop names and other details printed on the receipt.'],
              ['Vercel Inc.',  'Application hosting and edge delivery'],
            ].map(([name, purpose]) => (
              <li key={String(name)} className="flex gap-3 text-sm">
                <span className="text-white font-semibold w-36 flex-shrink-0">{name}</span>
                <span className="text-gray-400">{purpose}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="7. Data Retention">
          <p>
            Account data is retained for the lifetime of your account plus 6 months after deletion.
            Transaction records are retained for 7 years for financial compliance purposes.
            Receipt images are deleted after 12 months. Anonymised emissions data is retained
            indefinitely for carbon credit audit trails.
          </p>
        </Section>

        <Section title="8. Your Rights">
          <p>Under the NDPR and NDPA, you have the right to:</p>
          <ul className="space-y-1.5 mt-2">
            {[
              'Access a copy of all personal data we hold about you',
              'Correct inaccurate personal data',
              'Delete your account and associated personal data',
              'Object to or restrict processing of your data',
              'Receive your data in a portable, machine-readable format',
              'Lodge a complaint with the Nigeria Data Protection Commission (NDPC)',
            ].map((r) => (
              <li key={r} className="flex gap-2">
                <span className="text-gb-green flex-shrink-0">→</span> {r}
              </li>
            ))}
          </ul>
          <p className="mt-4">
            To exercise any right, email{' '}
            <a href="mailto:privacy@gasback.ng" className="text-gb-green hover:underline">privacy@gasback.ng</a>.
            We will respond within 30 days as required by law.
          </p>
        </Section>

        <Section title="9. Changes to This Policy">
          <p>
            We will notify you of material changes to this policy via in-app notification and email at
            least 30 days before the changes take effect. Continued use of GasBack after that date
            constitutes acceptance of the updated policy.
          </p>
        </Section>

        <div className="bg-gb-surface rounded-2xl border border-gb-border p-6 text-sm text-gray-400">
          <p className="font-semibold text-white mb-2">Contact</p>
          <p>GasBack Technologies Ltd · 14 Marina Street, Lagos Island, Lagos, Nigeria</p>
          <p>Email: <a href="mailto:privacy@gasback.ng" className="text-gb-green hover:underline">privacy@gasback.ng</a></p>
          <p>DPO: <a href="mailto:dpo@gasback.ng" className="text-gb-green hover:underline">dpo@gasback.ng</a></p>
        </div>

      </main>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-gray-600">
        © 2025 GasBack · <Link href="/terms" className="hover:text-gray-400">Terms of Service</Link> · <Link href="/methodology" className="hover:text-gray-400">Methodology</Link>
      </footer>
    </div>
  );
}
