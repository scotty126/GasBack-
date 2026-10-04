'use client';

import { usePathname } from 'next/navigation';

const MARKETING = ['/methodology', '/partners', '/privacy', '/terms'];

export function MobileFrame({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const isMarketing = MARKETING.some(r => path.startsWith(r));

  if (isMarketing) {
    return (
      <div className="w-full min-h-screen bg-gb-bg text-white">
        {children}
      </div>
    );
  }

  return (
    <div
      className="relative w-full bg-gb-bg overflow-hidden
                 min-h-screen
                 sm:min-h-0 sm:h-[812px] sm:max-w-[390px]
                 sm:rounded-[2.75rem] sm:shadow-[0_0_0_8px_#1a1f26,0_32px_80px_rgba(0,0,0,0.8)]
                 sm:border sm:border-white/[0.06]"
    >
      <div className="hidden sm:flex justify-center pt-3 pb-1">
        <div className="w-28 h-[18px] bg-black rounded-full" />
      </div>
      <div className="h-full overflow-y-auto sm:h-[calc(812px-34px)]">
        {children}
      </div>
    </div>
  );
}
