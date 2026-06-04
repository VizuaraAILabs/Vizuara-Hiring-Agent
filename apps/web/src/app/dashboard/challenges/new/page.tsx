'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import CreateChallengeForm from '@/components/dashboard/CreateChallengeForm';
import WizardContainer from '@/components/dashboard/wizard/WizardContainer';
import TemplateGallery from '@/components/dashboard/TemplateGallery';
import { useAuth } from '@/context/AuthContext';

type Tab = 'ai' | 'manual' | 'template';

export default function NewChallengePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>(
    searchParams.get('tab') === 'manual' ? 'manual' : 'ai'
  );
  const canCreateChallenge = Boolean(user?.isAdmin || user?.role === 'owner' || user?.role === 'recruiter');

  useEffect(() => {
    if (authLoading || canCreateChallenge) return;
    router.replace('/dashboard');
  }, [authLoading, canCreateChallenge, router]);

  if (authLoading || !canCreateChallenge) return null;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-serif italic text-white">New Challenge</h1>
        <p className="text-neutral-500 mt-1">Create an AI-collaboration assessment for candidates</p>
      </div>

      {/* Tab toggle */}
      <div className="inline-flex bg-surface border border-white/10 rounded-xl p-1 mb-8">
        <button
          onClick={() => setActiveTab('ai')}
          className={`cursor-pointer px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'ai'
              ? 'bg-primary text-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          AI-Assisted
        </button>
        <button
          onClick={() => setActiveTab('template')}
          className={`cursor-pointer px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'template'
              ? 'bg-primary text-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          From Template
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`cursor-pointer px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'manual'
              ? 'bg-primary text-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Create Manually
        </button>
      </div>

      {activeTab === 'ai' && <WizardContainer />}
      {activeTab === 'template' && <TemplateGallery />}
      {activeTab === 'manual' && <CreateChallengeForm />}
    </div>
  );
}
