import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse };

/**
 * Resolve the caller from the `Authorization: Bearer <supabase access token>` header.
 * The userId is NEVER taken from the request body — it comes from the verified token.
 */
export async function requireUser(request: Request, db: SupabaseClient): Promise<AuthResult> {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) {
    return { ok: false, response: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) };
  }
  try {
    const { data, error } = await db.auth.getUser(match[1].trim());
    if (error || !data.user) {
      // A bad/disabled SERVER key ("Legacy API keys are disabled", "Invalid API key") is our
      // misconfiguration, not the user's expired session — don't bounce users to login for it.
      if (error && /api key/i.test(error.message)) {
        console.error('[auth] server API key rejected by Supabase:', error.message);
        return { ok: false, response: NextResponse.json({ error: 'The service is not configured correctly. Please try again later.', code: 'NOT_CONFIGURED' }, { status: 503 }) };
      }
      // Distinguish a rejected token from Supabase being unreachable.
      const status = error && 'status' in error && typeof error.status === 'number' ? error.status : 0;
      if (status >= 500 || status === 0) {
        return { ok: false, response: NextResponse.json({ error: 'Authentication service unavailable. Please try again.' }, { status: 503 }) };
      }
      return { ok: false, response: NextResponse.json({ error: 'Session expired. Please sign in again.' }, { status: 401 }) };
    }
    return { ok: true, userId: data.user.id };
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Authentication service unavailable. Please try again.' }, { status: 503 }) };
  }
}

/** Device id header: a random UUID the app keeps in localStorage. Optional; never trusted for auth. */
export function readDeviceId(request: Request): string | null {
  const v = request.headers.get('x-gb-device-id');
  return v && /^[0-9a-fA-F-]{36}$/.test(v) ? v.toLowerCase() : null;
}
