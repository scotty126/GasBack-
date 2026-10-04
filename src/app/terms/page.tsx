import Link from 'next/link';

export const metadata = {
  title: 'Terms of Service — GasBack',
  description: 'Rules of the GasBack ecosystem including anti-fraud policies and automatic device ban procedures.',
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
          <Link href="/privacy"     className="hover:text-white transition-colors">Privacy</Link>
          <Link href="/terms"       className="text-white font-semibold">Terms</Link>
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

export default function TermsPage() {
  return (
    <div className="w-full min-h-screen bg-gb-bg text-white">
      <MarketingHeader />

      <main className="max-w-3xl mx-auto px-6 py-16">
        <div className="mb-12">
          <span className="inline-block bg-red-500/10 text-red-400 text-xs font-bold px-3 py-1 rounded-full border border-red-500/20 mb-4">
            Anti-Fraud Enforced
          </span>
          <h1 className="text-4xl font-extrabold leading-tight mb-4">Terms of Service</h1>
          <p className="text-gray-400">Effective date: 1 June 2025 · Last updated: 1 June 2025</p>
        </div>

        <Section title="1. Acceptance">
          <p>
            By creating a GasBack account or using any GasBack service, you agree to be bound by
            these Terms of Service and our <Link href="/privacy" className="text-gb-green hover:underline">Privacy Policy</Link>.
            If you do not agree, you must not use the platform.
          </p>
          <p>
            GasBack is operated by GasBack Technologies Ltd, a company incorporated under Nigerian law.
            These terms are governed by the laws of the Federal Republic of Nigeria.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p>To use GasBack you must:</p>
          <ul className="space-y-1.5 mt-2">
            {[
              'Be at least 18 years of age',
              'Be resident in Nigeria',
              'Provide accurate, truthful registration information',
              'Hold a valid phone number or email address that you control',
              'Not have been previously banned from GasBack for fraud or abuse',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-gb-green flex-shrink-0">→</span> {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="3. Carbon Credit Points">
          <p>
            Carbon credit points ("Points") are earned by uploading valid LPG purchase receipts from
            licensed LPG vendors. Points have no cash value and cannot be transferred between accounts.
            Points expire 24 months after the date they were awarded if unused.
          </p>
          <p>
            Each Point is worth ₦1 of discount at a partner station. GasBack may change the number of
            Points earned per kilogram of LPG with 30 days' notice; the current method is published on
            our <Link href="/methodology" className="text-gb-green hover:underline">Methodology</Link> page.
            Points you have already earned keep their value of ₦1 each.
          </p>
          <p>
            Points awarded in error due to system bugs may be reclaimed by GasBack. Users will be
            notified before any correction is applied.
          </p>
        </Section>

        <Section title="4. Receipt Submission Rules">
          <p>Each receipt upload must meet all of the following conditions:</p>
          <ul className="space-y-1.5 mt-2">
            {[
              'Receipt must be an original, unaltered thermal printout from a licensed LPG vendor',
              'Receipt must clearly show vendor name, date, gas volume (kg), total amount, and invoice number',
              'Receipt must be from a purchase made within the last 30 days of the upload date',
              'Each unique receipt (identified by invoice number + vendor name) may only be submitted once across the entire GasBack platform',
              'The submitting account must be the purchaser of record on the receipt',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-gb-green flex-shrink-0">→</span> {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="5. Anti-Fraud Policy">
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 mb-4">
            <p className="text-red-400 font-semibold text-sm mb-1">Zero-Tolerance Fraud Policy</p>
            <p className="text-red-300/80 text-xs">
              GasBack operates automated and human fraud detection systems. Fraud results in immediate,
              permanent account termination with no right of appeal.
            </p>
          </div>
          <p>The following acts constitute fraud under these Terms:</p>
          <ul className="space-y-2 mt-2">
            {[
              ['Duplicate Submission', 'Uploading the same receipt more than once, including receipts submitted by other users on the same device network.'],
              ['Receipt Forgery', 'Uploading digitally created, edited, or printed-simulation receipts not issued by a real LPG vendor.'],
              ['Receipt Cropping', 'Deliberately obscuring the invoice number, date, vendor name, or gas volume to bypass duplicate detection.'],
              ['Account Farming', 'Creating multiple GasBack accounts to submit the same receipt across accounts.'],
              ['Vendor Impersonation', 'Submitting receipts with false vendor names that match our approved list.'],
              ['Voucher Resale', 'Selling, auctioning, or transferring generated voucher codes for cash or goods.'],
            ].map(([type, desc]) => (
              <li key={String(type)} className="bg-gb-surface rounded-xl border border-gb-border p-3">
                <p className="text-red-400 font-semibold text-xs mb-1">{type}</p>
                <p className="text-gray-300 text-xs">{desc}</p>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="6. Enforcement Actions">
          <p>Upon detection of fraud, GasBack will take one or more of the following actions:</p>
          <ul className="space-y-1.5 mt-2">
            {[
              'Immediate suspension of the account pending investigation',
              'Permanent ban of the account and all associated email addresses, phone numbers, and device fingerprints',
              'Forfeiture of all Points balance with no compensation',
              'Invalidation of all outstanding voucher codes generated by the account',
              'Referral to the Nigeria Police Force Cybercrime Unit (EFCC Act 2004, Section 22) for receipts involving significant financial fraud',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-red-400 flex-shrink-0">✕</span> {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="7. Voucher Terms">
          <p>Gas voucher codes generated through GasBack are subject to the following rules:</p>
          <ul className="space-y-1.5 mt-2">
            {[
              'Valid only at the specific GasBack partner station selected at time of generation',
              'Valid for 30 days from the date of generation',
              'Single use — redeemed codes are immediately invalidated',
              'Non-transferable and non-refundable',
              'GasBack is not liable for station staff errors in applying the discount',
            ].map((item) => (
              <li key={item} className="flex gap-2">
                <span className="text-gb-green flex-shrink-0">→</span> {item}
              </li>
            ))}
          </ul>
        </Section>

        <Section title="8. Intellectual Property">
          <p>
            All content on GasBack — including the GasBack name, logo, carbon credit methodology,
            software, and application design — is the exclusive intellectual property of GasBack
            Technologies Ltd and is protected under Nigerian and international copyright law.
          </p>
          <p>
            You may not copy, reproduce, distribute, or create derivative works from any GasBack
            content without express written permission.
          </p>
        </Section>

        <Section title="9. Limitation of Liability">
          <p>
            GasBack provides the platform "as is." We are not liable for: receipt OCR errors that
            result in incorrect point awards (we will correct these upon report); station staff
            refusals to honour valid vouchers (report to support for reimbursement review);
            loss of Points due to account deletion initiated by the user; or any indirect,
            incidental, or consequential damages arising from use of the platform.
          </p>
          <p>
            Our total liability to you in any 12-month period shall not exceed the Naira value of
            Points redeemed by you in that period.
          </p>
        </Section>

        <Section title="10. Changes to Terms">
          <p>
            We will notify users of material changes 30 days in advance via in-app notification and
            email. Continued use of GasBack after the effective date constitutes acceptance.
          </p>
          <p>
            For questions about these Terms, contact{' '}
            <a href="mailto:legal@gasback.ng" className="text-gb-green hover:underline">legal@gasback.ng</a>.
          </p>
        </Section>

      </main>

      <footer className="border-t border-white/10 px-6 py-8 text-center text-xs text-gray-600">
        © 2025 GasBack · <Link href="/privacy" className="hover:text-gray-400">Privacy Policy</Link> · <Link href="/methodology" className="hover:text-gray-400">Methodology</Link> · <Link href="/partners" className="hover:text-gray-400">Partners</Link>
      </footer>
    </div>
  );
}
