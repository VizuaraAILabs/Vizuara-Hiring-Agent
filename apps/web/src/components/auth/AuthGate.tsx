'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = `/api/auth/redirect?returnTo=${encodeURIComponent(pathname)}`;
    }
  }, [user, loading, pathname]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-neutral-500">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
