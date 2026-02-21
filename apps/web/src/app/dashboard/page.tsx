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
          <h1 className="text-2xl font-bold text-white">Challenges</h1>
          <p className="text-slate-400 mt-1">Manage your AI-collaboration assessments</p>
        </div>
        <Link
          href="/dashboard/challenges/new"
          className="bg-cyan-600 hover:bg-cyan-500 text-white px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
        >
          New Challenge
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-6 animate-pulse">
              <div className="h-5 bg-slate-800 rounded w-2/3 mb-3" />
              <div className="h-4 bg-slate-800 rounded w-full mb-2" />
              <div className="h-4 bg-slate-800 rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : challenges.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-slate-500 text-lg mb-4">No challenges yet</p>
          <Link
            href="/dashboard/challenges/new"
            className="text-cyan-400 hover:text-cyan-300 text-sm"
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
