'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendEmailVerification,
  signInWithPopup,
  signOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { ArrowRight, Building2, CheckCircle2, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import FPLLogo from '@/components/FPLLogo';
import { useAuth } from '@/context/AuthContext';
import { getClientAuth, hasFirebaseClientConfig } from '@/lib/firebase-client';

function getSafeReturnTo(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/dashboard';
  return value;
}

function getRegisterErrorMessage(code: string | undefined): string {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account already exists for this email. Sign in instead.';
    case 'auth/invalid-email':
      return 'Enter a valid work email.';
    case 'auth/weak-password':
      return 'Use a stronger password with at least 6 characters.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your connection.';
    case 'auth/popup-closed-by-user':
      return 'Google sign-up was closed before it finished.';
    default:
      return 'Unable to create your account. Please try again.';
  }
}

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const [companyName, setCompanyName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loadingMethod, setLoadingMethod] = useState<'email' | 'google' | null>(null);
  const [error, setError] = useState('');
  const [verificationEmail, setVerificationEmail] = useState('');

  const returnTo = useMemo(
    () => getSafeReturnTo(searchParams.get('returnTo')),
    [searchParams]
  );

  useEffect(() => {
    const errorCode = searchParams.get('error');
    if (errorCode) setError(getRegisterErrorMessage(errorCode));
  }, [searchParams]);

  const getVerificationContinueUrl = () => {
    const loginUrl = new URL('/login', window.location.origin);
    loginUrl.searchParams.set('verified', '1');
    loginUrl.searchParams.set('returnTo', returnTo);
    return loginUrl.toString();
  };

  const createLocalSession = async (user: User, localCompanyName: string) => {
    const token = await user.getIdToken(true);
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        returnTo,
        companyName: localCompanyName.trim(),
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Unable to create your session.');
    }

    await refreshUser();
    router.replace(getSafeReturnTo(data.redirectTo || returnTo));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setVerificationEmail('');

    if (!hasFirebaseClientConfig()) {
      setError('Firebase signup is not configured for this environment.');
      return;
    }

    const trimmedCompanyName = companyName.trim();
    if (!trimmedCompanyName) {
      setError('Enter your company name.');
      return;
    }

    setLoadingMethod('email');
    try {
      const clientAuth = getClientAuth();
      const credential = await createUserWithEmailAndPassword(clientAuth, email.trim(), password);
      await updateProfile(credential.user, { displayName: trimmedCompanyName });
      await sendEmailVerification(credential.user, {
        url: getVerificationContinueUrl(),
        handleCodeInApp: false,
      });
      setVerificationEmail(email.trim());
      await signOut(clientAuth);
      setPassword('');
    } catch (err) {
      await signOut(getClientAuth()).catch(() => undefined);
      const code = typeof err === 'object' && err && 'code' in err
        ? String((err as { code?: string }).code)
        : undefined;
      setError(err instanceof Error && !code ? err.message : getRegisterErrorMessage(code));
    } finally {
      setLoadingMethod(null);
    }
  };

  const handleGoogleSignUp = async () => {
    setError('');
    setVerificationEmail('');

    if (!hasFirebaseClientConfig()) {
      setError('Firebase signup is not configured for this environment.');
      return;
    }

    const trimmedCompanyName = companyName.trim();
    if (!trimmedCompanyName) {
      setError('Enter your company name before continuing with Google.');
      return;
    }

    setLoadingMethod('google');
    try {
      const clientAuth = getClientAuth();
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const credential = await signInWithPopup(clientAuth, provider);
      await createLocalSession(credential.user, trimmedCompanyName);
    } catch (err) {
      await signOut(getClientAuth()).catch(() => undefined);
      const code = typeof err === 'object' && err && 'code' in err
        ? String((err as { code?: string }).code)
        : undefined;
      setError(err instanceof Error && !code ? err.message : getRegisterErrorMessage(code));
    } finally {
      setLoadingMethod(null);
    }
  };

  if (verificationEmail) {
    return (
      <main className="min-h-screen bg-[#090909] pt-16.25 text-white">
        <div className="min-h-[calc(100vh-65px)] grid lg:grid-cols-[1.05fr_0.95fr]">
          <section className="relative hidden lg:grid overflow-hidden border-r border-white/10 px-12 py-10">
            <div className="login-ambient absolute inset-0" />
            <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] bg-size-[44px_44px]" />
            <div className="relative grid place-items-center">
              <div className="max-w-xl text-center">
                <p className="text-sm uppercase tracking-[0.32em] text-primary mb-5">Verify email</p>
                <h1 className="text-5xl font-serif italic leading-tight text-balance">
                  One quick check before the workspace opens.
                </h1>
                <p className="mt-6 text-neutral-400 text-lg leading-8">
                  Verification keeps company workspaces tied to real inboxes before any assessment data is created.
                </p>
              </div>
            </div>
          </section>

          <section className="flex items-center justify-center px-5 py-12">
            <div className="w-full max-w-md">
              <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                <CheckCircle2 className="h-6 w-6" />
              </div>
              <p className="text-xs uppercase tracking-[0.28em] text-neutral-500 mb-3">Check your inbox</p>
              <h2 className="text-3xl font-semibold">Verify your email</h2>
              <p className="mt-3 text-sm leading-6 text-neutral-500">
                We sent a verification link to <span className="text-neutral-300">{verificationEmail}</span>.
                After verification, it will continue back to the ArcEval login page.
              </p>
              <Link
                href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                className="mt-8 inline-flex h-12 w-full items-center justify-center rounded-lg bg-primary px-5 text-sm font-semibold text-black transition-all hover:bg-primary-light"
              >
                Back to login
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#090909] pt-16.25 text-white">
      <div className="min-h-[calc(100vh-65px)] grid lg:grid-cols-[1.05fr_0.95fr]">
        <section className="relative hidden lg:grid overflow-hidden border-r border-white/10 px-12 py-10">
          <div className="login-ambient absolute inset-0" />
          <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(255,255,255,0.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.8)_1px,transparent_1px)] bg-size-[44px_44px]" />
          <div className="relative grid place-items-center">
            <div className="max-w-xl text-center">
              <p className="text-sm uppercase tracking-[0.32em] text-primary mb-5">Company signup</p>
              <h1 className="text-5xl font-serif italic leading-tight text-balance">
                Create the workspace before the first challenge.
              </h1>
              <p className="mt-6 text-neutral-400 text-lg leading-8">
                Start a verified company account for assessments, candidate sessions, and scored reports.
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
              <p className="text-xs uppercase tracking-[0.28em] text-neutral-500 mb-3">Start ArcEval</p>
              <h2 className="text-3xl font-semibold">Create your account</h2>
              <p className="mt-2 text-sm text-neutral-500">
                Use a work email so your company workspace is easy to recognize.
              </p>
            </div>

            <div className="space-y-5">
              <button
                type="button"
                onClick={handleGoogleSignUp}
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
                <span>{loadingMethod === 'google' ? 'Signing up with Google...' : 'Continue with Google'}</span>
              </button>

              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-xs uppercase tracking-wider text-neutral-600">or</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>
            </div>

            <form onSubmit={handleSubmit} className="mt-5 space-y-5">
              <div className="space-y-2">
                <label htmlFor="companyName" className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                  Company name
                </label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
                  <input
                    id="companyName"
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    autoComplete="organization"
                    required
                    className="h-12 w-full rounded-lg border border-white/10 bg-white/3 pl-10 pr-4 text-sm text-white outline-none transition-colors placeholder:text-neutral-700 focus:border-primary"
                    placeholder="Acme Inc."
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="email" className="text-xs font-medium uppercase tracking-wider text-neutral-400">
                  Work email
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
                    autoComplete="new-password"
                    required
                    minLength={6}
                    className="h-12 w-full rounded-lg border border-white/10 bg-white/3 pl-10 pr-12 text-sm text-white outline-none transition-colors placeholder:text-neutral-700 focus:border-primary"
                    placeholder="Create a password"
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

              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loadingMethod !== null}
                className="group flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-black transition-all hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingMethod === 'email' ? 'Creating account...' : 'Create account'}
                {loadingMethod !== 'email' && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-neutral-500">
              Already have an account?{' '}
              <Link
                href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
                className="font-medium text-neutral-300 transition-colors hover:text-primary"
              >
                Sign in
              </Link>
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-[#090909] pt-16.25 text-white grid place-items-center">
          <p className="text-sm text-neutral-500">Loading signup...</p>
        </main>
      }
    >
      <RegisterPageContent />
    </Suspense>
  );
}
