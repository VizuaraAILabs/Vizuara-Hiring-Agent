'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import CreateChallengeForm from '@/components/dashboard/CreateChallengeForm';
import WizardContainer from '@/components/dashboard/wizard/WizardContainer';

type Tab = 'ai' | 'manual';

export default function NewChallengePage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('ai');

  useEffect(() => {
    if (searchParams.get('tab') === 'manual') {
      setActiveTab('manual');
    }
  }, [searchParams]);

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-serif italic text-white">New Challenge</h1>
        <p className="text-neutral-500 mt-1">Create an AI-collaboration assessment for candidates</p>
      </div>

      {/* Tab toggle */}
      <div className="inline-flex bg-[#111] border border-white/10 rounded-xl p-1 mb-8">
        <button
          onClick={() => setActiveTab('ai')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'ai'
              ? 'bg-[#00a854] text-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          AI-Assisted
        </button>
        <button
          onClick={() => setActiveTab('manual')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
            activeTab === 'manual'
              ? 'bg-[#00a854] text-black'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          Create Manually
        </button>
      </div>

      {activeTab === 'ai' ? <WizardContainer /> : <CreateChallengeForm />}
    </div>
  );
}
