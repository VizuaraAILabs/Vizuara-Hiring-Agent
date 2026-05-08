'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signOut, type User } from 'firebase/auth';
import { ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import FPLLogo from '@/components/FPLLogo';
import { getClientAuth, hasFirebaseClientConfig } from '@/lib/firebase-client';
import { useAuth } from '@/context/AuthContext';

const VIZUARA_URL = process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai';

function getSafeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

function getAuthErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/user-not-found':
    case 'auth/wrong-password':
      return 'Invalid email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-in was closed before it finished.';
    case 'email-not-verified':
      return 'Please verify your email through the link we sent before signing in.';
    default:
      return 'Unable to sign in. Please try again.';
  }
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loadingMethod, setLoadingMethod] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const returnTo = useMemo(
    () => getSafeReturnTo(searchParams.get('returnTo')),
    [searchParams]
  );
  const forgotPasswordUrl = `${VIZUARA_URL}/auth/forgot-password`;

  useEffect(() => {
    const errorCode = searchParams.get('error');
    if (errorCode) setError(getAuthErrorMessage(errorCode));

    if (searchParams.get('verified') === '1') {
      setNotice('Email verified. Sign in to continue to ArcEval.');
    }
  }, [searchParams]);

  const createLocalSession = async (user: User) => {
    const token = await user.getIdToken(true);
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, returnTo }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (data.code === 'signup_required' && typeof data.redirectTo === 'string') {
        await signOut(getClientAuth()).catch(() => undefined);
        router.replace(data.redirectTo);
        return;
      }
      throw new Error(data.error || 'Unable to create your session.');
    }

    await refreshUser();
    router.replace(getSafeReturnTo(data.redirectTo || returnTo));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setNotice('');

    if (!hasFirebaseClientConfig()) {
      setError('Firebase login is not configured for this environment.');
      return;
    }

    setLoadingMethod('email');
    try {
      const clientAuth = getClientAuth();
      const credential = await signInWithEmailAndPassword(clientAuth, email.trim(), password);

      if (!credential.user.emailVerified) {
        await signOut(clientAuth);
        setError(getAuthErrorMessage('email-not-verified'));
        return;
      }

      await createLocalSession(credential.user);
    } catch (err) {
      await signOut(getClientAuth()).catch(() => undefined);
      const code = typeof err === 'object' && err && 'code' in err
        ? String((err as { code?: string }).code)
        : undefined;
      setError(err instanceof Error && !code ? err.message : getAuthErrorMessage(code));
    } finally {
      setLoadingMethod(null);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setNotice('');

    if (!hasFirebaseClientConfig()) {
      setError('Firebase login is not configured for this environment.');
      return;
    }

    setLoadingMethod('google');
    try {
      const clientAuth = getClientAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(clientAuth, provider);
      await createLocalSession(credential.user);
    } catch (err) {
      await signOut(getClientAuth()).catch(() => undefined);
      const code = typeof err === 'object' && err && 'code' in err
        ? String((err as { code?: string }).code)
        : undefined;
      setError(err instanceof Error && !code ? err.message : getAuthErrorMessage(code));
    } finally {
      setLoadingMethod(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#090909] pt-16.25 text-white">
      <div className="min-h-[calc(100vh-65px)] grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden lg:grid overflow-hidden border-r border-white/10 px-12 py-10">
          <div className="login-ambient absolute inset-0" />
          <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] bg-size-[44px_44px]" />
          <div className="relative grid place-items-center">
            <div className="max-w-xl text-center">
              <p className="text-sm uppercase tracking-[0.32em] text-primary mb-5">Hiring intelligence</p>
              <h1 className="text-5xl font-serif italic leading-tight text-balance">
                Sign in where the work actually happens.
              </h1>
              <p className="mt-6 text-neutral-400 text-lg leading-8">
                Access your challenges, candidate sessions, reports, and company workspace from one focused console.
              </p>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-12">
          <div className="w-full max-w-md">
            <Link href="/" className="lg:hidden inline-flex items-center gap-3 mb-10">
              <FPLLogo size={32} />
              <span className="text-xl font-semibold">
                Arc<span className="text-primary">Eval</span>
              </span>
            </Link>

            <div className="mb-8">
              <p className="text-xs uppercase tracking-[0.28em] text-neutral-500 mb-3">Company Login</p>
              <h2 className="text-3xl font-semibold">Welcome back</h2>
              <p className="mt-2 text-sm text-neutral-500">
                Use your verified ArcEval account to continue.
              </p>
            </div>

            <div className="space-y-5">
              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loadingMethod !== null}
                className="group flex h-12 w-full items-center justify-center gap-3 rounded-lg border border-white/10 bg-black text-sm font-bold text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-all hover:border-white/20 hover:bg-neutral-950 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Image
                  src="/google-logo.svg"
                  alt=""
                  width={24}
                  height={24}
                  className="h-6 w-6 shrink-0 transition-transform group-hover:scale-105"
                  aria-hidden="true"
                />
                <span>{loadingMethod === 'google' ? 'Signing in with Google...' : 'Continue with Google'}</span>
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs uppercase tracking-wider text-neutral-600">or</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-5">
              <div className="space-y-2">
                <label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                  Email
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    required
                    className="h-12 w-full rounded-lg border border-white/10 bg-white/3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-neutral-700 focus:border-primary"
                    placeholder="you@company.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                  Password
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                    className="h-12 w-full rounded-lg border border-white/10 bg-white/3 pl-10 pr-12 text-sm text-white outline-none transition-colors placeholder:text-neutral-700 focus:border-primary"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-white/5 hover:text-white"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <a href={forgotPasswordUrl} className="text-sm text-neutral-500 transition-colors hover:text-primary">
                  Forgot password?
                </a>
              </div>

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              {notice && (
                <div className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary">
                  {notice}
                </div>
              )}

              <button
                type="submit"
                disabled={loadingMethod !== null}
                className="group flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-black transition-all hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMethod === 'email' ? 'Signing in...' : 'Sign in'}
                {loadingMethod !== 'email' && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-neutral-500">
              Need a new account?{' '}
              <Link
                href="/register"
                className="font-medium text-neutral-300 transition-colors hover:text-primary"
              >
                Create an ArcEval account
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#090909] text-white grid place-items-center">
          <p className="text-sm text-neutral-500">Loading login...</p>
        </main>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
