import { createClient } from '@supabase/supabase-js';

// No fallback keys, ever: credentials come only from the environment
// (.env.local in dev, Vercel project env vars in production).
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Set them in .env.local (dev) or the Vercel project settings (production).'
  );
}

// Browser/client-side Supabase client — anon key (public by design), respects RLS.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Server-side client with the service-role key — bypasses RLS.
 * Call ONLY inside API route handlers (route.ts), never in components.
 */
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY (server-only environment variable).');
  }
  return createClient(supabaseUrl as string, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Next.js caches server-side fetches by default; a cached Supabase answer means stale
    // balances, rate-limit counts and portal totals. Never cache anything the service client reads.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }) },
  });
}
