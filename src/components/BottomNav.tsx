'use client';

import { usePathname, useRouter } from 'next/navigation';
import { LayoutDashboard, History, Gift, User } from 'lucide-react';

const TABS = [
  { label: 'Dashboard', Icon: LayoutDashboard, href: '/dashboard' },
  { label: 'History',   Icon: History,         href: '/history'   },
  { label: 'Redeem',    Icon: Gift,             href: '/redeem'    },
  { label: 'Profile',   Icon: User,             href: '/profile'   },
];

export function BottomNav() {
  const pathname = usePathname();
  const router   = useRouter();

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[390px] bg-gb-surface/95 backdrop-blur-sm border-t border-gb-border flex px-2 py-2 z-30">
      {TABS.map(({ label, Icon, href }) => {
        const active = pathname === href;
        return (
          <button
            key={href}
            onClick={() => router.push(href)}
            className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-xl transition-all active:scale-95 ${
              active
                ? 'text-gb-green bg-gb-green/10'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-semibold">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
