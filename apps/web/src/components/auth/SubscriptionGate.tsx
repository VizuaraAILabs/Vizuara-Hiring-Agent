'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';

const VIZUARA_URL = process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai';

interface SubscriptionGateProps {
  children: React.ReactNode;
}

export default function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { user, loading: authLoading } = useAuth();
  const { enrolled, loading: subLoading } = useSubscription();
  const pathname = usePathname();

  const loading = authLoading || subLoading;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.href = `/api/auth/redirect?returnTo=${encodeURIComponent(pathname)}`;
    } else if (!enrolled) {
      window.location.href = `${VIZUARA_URL}/pricing`;
    }
  }, [user, enrolled, loading, pathname]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (!user || !enrolled) return null;

  return <>{children}</>;
}
