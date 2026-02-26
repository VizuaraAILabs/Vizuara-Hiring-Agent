'use client';

import { useEffect } from 'react';

const VIZUARA_URL = process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai';
const APP_CALLBACK_URL = process.env.NEXT_PUBLIC_APP_CALLBACK_URL || 'https://hire.vizuara.ai/api/auth/session';

export default function RegisterPage() {
  useEffect(() => {
    window.location.href = `${VIZUARA_URL}/auth/signup?redirect=${encodeURIComponent(APP_CALLBACK_URL)}`;
  }, []);

  return (
    <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center">
      <p className="text-neutral-500">Redirecting to sign up...</p>
    </div>
  );
}
