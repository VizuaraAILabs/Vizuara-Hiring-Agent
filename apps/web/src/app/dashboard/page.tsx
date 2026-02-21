'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import ChallengeCard from '@/components/dashboard/ChallengeCard';

interface ChallengeWithCount {
  id: string;
  title: string;
  description: string;
  time_limit_min: number;
  is_active: number;
  created_at: string;
  candidate_count: number;
}

export default function DashboardPage() {
  const [challenges, setChallenges] = useState<ChallengeWithCount[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/challenges')
      .then((res) => res.json())
      .then((data) => setChallenges(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-serif italic text-white">Challenges</h1>
          <p className="text-neutral-500 mt-1">Manage your AI-collaboration assessments</p>
        </div>
        <Link
          href="/dashboard/challenges/new"
          className="bg-[#00a854] hover:bg-[#00c96b] text-black px-5 py-2.5 rounded-xl text-sm font-semibold transition-all btn-glow"
        >
          New Challenge
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-[#111] border border-white/5 rounded-2xl p-6 animate-pulse">
              <div className="h-5 bg-white/5 rounded w-2/3 mb-3" />
              <div className="h-4 bg-white/5 rounded w-full mb-2" />
              <div className="h-4 bg-white/5 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : challenges.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-neutral-600 text-lg mb-4">No challenges yet</p>
          <Link
            href="/dashboard/challenges/new"
            className="text-[#00a854] hover:text-[#00c96b] text-sm"
          >
            Create your first challenge
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {challenges.map((challenge) => (
            <ChallengeCard key={challenge.id} {...challenge} />
          ))}
        </div>
      )}
    </div>
  );
}
