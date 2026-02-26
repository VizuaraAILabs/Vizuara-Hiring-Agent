'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import FPLLogo from '@/components/FPLLogo';

const VIZUARA_URL = process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai';
const APP_CALLBACK_URL = process.env.NEXT_PUBLIC_APP_CALLBACK_URL || 'https://hire.vizuara.ai/api/auth/session';

const LOGIN_URL = `${VIZUARA_URL}/auth/login?redirect=${encodeURIComponent(APP_CALLBACK_URL)}`;
const SIGNUP_URL = `${VIZUARA_URL}/auth/signup?redirect=${encodeURIComponent(APP_CALLBACK_URL)}`;

export default function Header() {
  const { user, loading, logout } = useAuth();
  const pathname = usePathname();

  // Don't render Header on dashboard pages — the Sidebar handles navigation there
  if (pathname.startsWith('/dashboard')) return null;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-6 py-4">
        <Link href="/" className="flex items-center gap-2.5">
          <FPLLogo size={30} />
          <span className="text-lg font-semibold text-white">
            Arc<span className="text-primary">Eval</span>
          </span>
        </Link>

        <div className="hidden md:flex items-center gap-8 text-sm text-neutral-400">
          <a href="/#how-it-works" className="hover:text-white transition-colors">How it works</a>
          <a href="/#templates" className="hover:text-white transition-colors">Templates</a>
          <a href="/#pricing" className="hover:text-white transition-colors">Pricing</a>
          <a href="/#faq" className="hover:text-white transition-colors">FAQ</a>
          <Link href="/about" className="hover:text-white transition-colors">About Us</Link>
        </div>

        <div className="flex items-center gap-3">
          {loading ? (
            <div className="w-20" />
          ) : user ? (
            <>
              <Link
                href="/dashboard"
                className="text-neutral-400 hover:text-white text-sm transition-colors px-4 py-2"
              >
                Dashboard
              </Link>
              <button
                onClick={logout}
                className="text-neutral-400 hover:text-white text-sm transition-colors px-4 py-2"
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <a
                href={LOGIN_URL}
                className="text-neutral-400 hover:text-white text-sm transition-colors px-4 py-2"
              >
                Sign in
              </a>
              <a
                href={SIGNUP_URL}
                className="bg-primary hover:bg-primary-light text-black font-medium px-5 py-2 rounded-lg text-sm transition-all btn-glow"
              >
                Get Started
              </a>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
