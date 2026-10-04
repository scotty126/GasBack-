import type { Metadata, Viewport } from 'next';
import './globals.css';
import { MobileFrame } from '@/components/MobileFrame';
import { ThemeProvider } from '@/components/ThemeProvider';

export const metadata: Metadata = {
  title: 'GasBack — Earn Rewards on Every Gas Refill',
  description:
    'Scan your LPG receipt, earn points, and redeem them for discount vouchers at partner gas stations. Built for Nigeria.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GasBack',
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: '#0b0f13',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" suppressHydrationWarning>
      <body
        className="min-h-screen flex items-start justify-center sm:items-center sm:py-8"
        style={{ backgroundColor: 'var(--outer-bg)', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif" }}
      >
        <ThemeProvider>
          <MobileFrame>{children}</MobileFrame>
        </ThemeProvider>
      </body>
    </html>
  );
}
