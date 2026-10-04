'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Mail, Lock, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

type Step = 'form' | 'confirm' | 'success';

export default function RegisterPage() {
  const router = useRouter();

  const [step, setStep] = useState<Step>('form');
  const [identifier, setIdentifier] = useState(''); // email or phone
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [showCf, setShowCf]         = useState(false);
  const [loading, setLoading]       = useState<string | null>(null);
  const [error, setError]           = useState('');

  // Detect if identifier is a phone number (Nigerian format) or email
  const isPhone = /^(\+?234|0)\d{9,10}$/.test(identifier.replace(/\s/g, ''));
  const isEmail = identifier.includes('@');

  // For Supabase auth we always need an email. For phone-only users we
  // generate a synthetic email they never see — they log in with their phone.
  const toE164 = (raw: string) =>
    raw.startsWith('+') ? raw : `+234${raw.replace(/\s/g, '').replace(/^0/, '')}`;

  const syntheticEmail = isPhone
    ? `${toE164(identifier).replace('+', '')}@gasback.app`
    : identifier.trim().toLowerCase();

  const canSubmit =
    (isEmail || isPhone) &&
    password.length >= 6 &&
    password === confirm;

  const signInWithOAuth = async (provider: 'google' | 'apple') => {
    setError('');
    setLoading(provider);
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) { setError(error.message); setLoading(null); }
  };

  const handleSignUp = async () => {
    setError('');
    setLoading('signup');
    try {
      const { data, error } = await supabase.auth.signUp({
        email: syntheticEmail,
        password,
      });
      if (error) throw error;

      // If the user is immediately active (email confirmation disabled in Supabase)
      if (data.session) {
        await supabase.from('users').upsert(
          {
            id: data.user!.id,
            email_address: isEmail ? identifier.trim().toLowerCase() : null,
            phone_number: isPhone ? toE164(identifier) : null,
          },
          { onConflict: 'id' }
        );
        setStep('success');
        setTimeout(() => router.replace('/dashboard'), 1400);
      } else {
        // Email confirmation required — tell user to check inbox
        setStep('confirm');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign up failed. Try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gb-bg text-white overflow-y-auto">

      {/* Logo bar */}
      <div className="flex items-center gap-2 px-5 pt-10 pb-6">
        <div className="w-7 h-7 rounded-lg bg-gb-green flex items-center justify-center">
          <span className="text-white text-xs font-black">G</span>
        </div>
        <span className="font-extrabold text-base tracking-tight">GasBack</span>
      </div>

      <div className="flex-1 px-5 pb-10">

        {/* ── SUCCESS ── */}
        {step === 'success' && (
          <div className="flex flex-col items-center justify-center h-60 gap-4">
            <CheckCircle className="w-14 h-14 text-gb-green" />
            <p className="font-bold text-lg">Account created!</p>
            <p className="text-gray-400 text-sm">Opening your dashboard…</p>
          </div>
        )}

        {/* ── CONFIRM EMAIL ── */}
        {step === 'confirm' && (
          <div className="flex flex-col items-center justify-center h-60 gap-4 text-center">
            <Mail className="w-14 h-14 text-gb-green" />
            <p className="font-bold text-lg">Check your inbox</p>
            <p className="text-gray-400 text-sm leading-relaxed">
              We sent a confirmation link to{' '}
              <span className="text-white font-semibold">{isEmail ? identifier : syntheticEmail}</span>.
              Click it to activate your account, then come back to sign in.
            </p>
            <button
              className="text-gb-green font-semibold text-sm mt-2"
              onClick={() => router.push('/login')}
            >
              Go to Sign In →
            </button>
          </div>
        )}

        {/* ── SIGN UP FORM ── */}
        {step === 'form' && (
          <>
            <h2 className="text-3xl font-extrabold leading-snug mb-2">
              Go Green,{' '}<span className="text-gb-green">Get Rewarded</span>
            </h2>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              Create your account and start earning carbon credits on every LPG refill.
            </p>

            {/* OAuth */}
            <div className="space-y-3 mb-6">
              <button
                onClick={() => signInWithOAuth('google')}
                disabled={!!loading}
                className="w-full flex items-center justify-center gap-3 bg-white text-gray-800 font-semibold
                           py-3.5 rounded-xl active:scale-95 transition-all disabled:opacity-50 text-sm"
              >
                {loading === 'google'
                  ? <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                  : <GoogleIcon />}
                Continue with Google
              </button>

              <button
                onClick={() => signInWithOAuth('apple')}
                disabled={!!loading}
                className="w-full flex items-center justify-center gap-3 bg-[#1a1a1a] text-white font-semibold
                           py-3.5 rounded-xl border border-white/10 active:scale-95 transition-all disabled:opacity-50 text-sm"
              >
                {loading === 'apple'
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <AppleIcon />}
                Continue with Apple
              </button>
            </div>

            <div className="divider-text mb-6">or sign up with email / phone</div>

            {/* Identifier field */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">
                Phone Number or Email
              </label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <input
                  className="input-dark pl-11"
                  type="text"
                  inputMode="email"
                  autoComplete="username"
                  placeholder="08012345678 or email@example.com"
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value.trim())}
                />
              </div>
            </div>

            {/* Password */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <input
                  className="input-dark pl-11 pr-11"
                  type={showPw ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500"
                  onClick={() => setShowPw(v => !v)}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm password */}
            <div className="mb-6">
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <input
                  className="input-dark pl-11 pr-11"
                  type={showCf ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="Re-enter password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && canSubmit && handleSignUp()}
                />
                <button
                  type="button"
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500"
                  onClick={() => setShowCf(v => !v)}
                >
                  {showCf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirm && password !== confirm && (
                <p className="text-red-400 text-xs mt-1.5">Passwords don't match</p>
              )}
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button
              className="btn-primary mb-5"
              onClick={handleSignUp}
              disabled={!!loading || !canSubmit}
            >
              {loading === 'signup'
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <CheckCircle className="w-4 h-4" />}
              {loading === 'signup' ? 'Creating account…' : 'Create Account'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Already have an account?{' '}
              <button className="text-gb-green font-semibold" onClick={() => router.push('/login')}>
                Sign in
              </button>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
