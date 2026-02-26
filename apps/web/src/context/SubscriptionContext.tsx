'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import type { EnrollmentStatus, EnrollmentStatusResponse } from '@/types/subscription';
import type { PlanStatus } from '@/types';

interface SubscriptionContextValue {
  enrolled: boolean;
  loading: boolean;
  status: EnrollmentStatus | null;
  planStatus: PlanStatus | null;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [enrolled, setEnrolled] = useState(false);
  const [status, setStatus] = useState<EnrollmentStatus | null>(null);
  const [planStatus, setPlanStatus] = useState<PlanStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSubscription = useCallback(async () => {
    try {
      const [subRes, planRes] = await Promise.all([
        fetch('/api/subscription/status'),
        fetch('/api/plan'),
      ]);

      if (subRes.ok) {
        const data: EnrollmentStatusResponse = await subRes.json();
        setEnrolled(data.enrolled);
        setStatus(data.status);
      } else {
        setEnrolled(false);
        setStatus(null);
      }

      if (planRes.ok) {
        const data: PlanStatus = await planRes.json();
        setPlanStatus(data);
      } else {
        setPlanStatus(null);
      }
    } catch {
      setEnrolled(false);
      setStatus(null);
      setPlanStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setEnrolled(false);
      setStatus(null);
      setPlanStatus(null);
      setLoading(false);
      return;
    }
    refreshSubscription();
  }, [user, authLoading, refreshSubscription]);

  return (
    <SubscriptionContext.Provider
      value={{ enrolled, loading: authLoading || loading, status, planStatus, refreshSubscription }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
