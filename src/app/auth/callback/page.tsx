'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Loader2 } from 'lucide-react';

/**
 * OAuth callback landing page.
 * Supabase redirects here after Google / Apple login completes.
 * We exchange the session code, upsert the user record so the
 * wallet-creation trigger fires, then forward to /dashboard.
 */
export default function AuthCallbackPage() {
  const router  = useRouter();
  const [label, setLabel] = useState('Completing sign-in…');

  useEffect(() => {
    const run = async () => {
      // Give Supabase a tick to exchange the code in the URL hash / search
      await new Promise((r) => setTimeout(r, 400));

      const { data: { session }, error } = await supabase.auth.getSession();

      if (error || !session?.user) {
        // Listen for the auth state change in case the exchange is still pending
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          async (event, s) => {
            if (event === 'SIGNED_IN' && s?.user) {
              subscription.unsubscribe();
              await upsertUser(s.user.id, s.user.email ?? null, s.user.phone ?? null);
              router.replace('/dashboard');
            }
          }
        );
        // Bail out after 8 s if nothing arrives
        setTimeout(() => router.replace('/login?error=timeout'), 8000);
        return;
      }

      setLabel('Setting up your account…');
      await upsertUser(session.user.id, session.user.email ?? null, session.user.phone ?? null);
      router.replace('/dashboard');
    };

    run();
  }, [router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gb-bg text-white gap-4">
      <div className="w-14 h-14 rounded-full bg-gb-green/10 flex items-center justify-center">
        <Loader2 className="w-7 h-7 text-gb-green animate-spin" />
      </div>
      <p className="text-sm text-gray-400">{label}</p>
    </div>
  );
}

async function upsertUser(id: string, email: string | null, phone: string | null) {
  // Insert into our custom users table — the DB trigger auto-creates the wallet
  await supabase.from('users').upsert(
    { id, email_address: email, phone_number: phone },
    { onConflict: 'id' }
  );
}
