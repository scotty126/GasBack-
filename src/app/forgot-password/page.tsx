'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Mail, ArrowLeft, Loader2, CheckCircle } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router  = useRouter();
  const [email,   setEmail]   = useState('');
  const [loading, setLoading] = useState(false);
  const [sent,    setSent]    = useState(false);
  const [error,   setError]   = useState('');

  const handleReset = async () => {
    if (!email.includes('@')) return;
    setLoading(true); setError('');
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/callback`,
      });
      if (error) throw error;
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to send reset link.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-gb-bg text-white">
      <div className="flex items-center gap-3 px-5 pt-10 pb-6">
        <button
          onClick={() => router.push('/login')}
          className="w-9 h-9 rounded-full bg-gb-surface border border-gb-border flex items-center justify-center"
        >
          <ArrowLeft className="w-4 h-4 text-gray-400" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gb-green flex items-center justify-center">
            <span className="text-white text-xs font-black">G</span>
          </div>
          <span className="font-extrabold text-base tracking-tight">GasBack</span>
        </div>
      </div>

      <div className="flex-1 px-5 pb-10">
        {sent ? (
          <div className="flex flex-col items-center justify-center h-60 gap-4 text-center">
            <CheckCircle className="w-14 h-14 text-gb-green" />
            <p className="font-bold text-lg">Check your inbox</p>
            <p className="text-gray-400 text-sm leading-relaxed">
              A password reset link has been sent to{' '}
              <span className="text-white font-semibold">{email}</span>.
            </p>
            <button className="text-gb-green font-semibold text-sm mt-2" onClick={() => router.push('/login')}>
              Back to Sign In
            </button>
          </div>
        ) : (
          <>
            <h2 className="text-3xl font-extrabold leading-snug mb-2">Reset Password</h2>
            <p className="text-gray-400 text-sm mb-8 leading-relaxed">
              Enter the email you registered with. We will send you a link to reset your password.
            </p>

            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-400 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
                <input
                  className="input-dark pl-11"
                  type="email" inputMode="email" autoComplete="email"
                  placeholder="example@gmail.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value.trim())}
                  onKeyDown={(e) => e.key === 'Enter' && handleReset()}
                />
              </div>
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 mb-4">
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}

            <button className="btn-primary" onClick={handleReset} disabled={loading || !email.includes('@')}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              {loading ? 'Sending…' : 'Send Reset Link'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
