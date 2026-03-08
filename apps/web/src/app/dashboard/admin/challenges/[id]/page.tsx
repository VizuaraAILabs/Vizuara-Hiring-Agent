'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';
import MarkdownViewer from '@/components/MarkdownViewer';
import { useAuth } from '@/context/AuthContext';
import type { Challenge, Session } from '@/types';

interface ChallengeDetail extends Challenge {
  sessions: Session[];
}

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-400',
  active: 'bg-blue-500/10 text-blue-400',
  completed: 'bg-neutral-800 text-neutral-400',
  analyzed: 'bg-primary/10 text-primary',
};

export default function AdminChallengeViewPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [descriptionOpen, setDescriptionOpen] = useState(true);
  const [openFileIndex, setOpenFileIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      router.push('/dashboard');
    }
  }, [authLoading, user, router]);

  useEffect(() => {
    fetch(`/api/challenges/${params.id}`)
      .then((res) => res.json())
      .then((data) => setChallenge(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  if (authLoading || !user?.isAdmin) return null;

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-white/5 rounded w-1/3" />
        <div className="h-4 bg-white/5 rounded w-2/3" />
      </div>
    );
  }

  if (!challenge || 'error' in challenge) {
    return <p className="text-neutral-500">Challenge not found.</p>;
  }

  const starterFiles = Array.isArray(challenge.starter_files) ? challenge.starter_files : [];

  return (
    <div>
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <Link href="/dashboard/admin" className="text-xs text-neutral-500 hover:text-neutral-300 transition-colors mb-3 inline-block">
            ← Back to Admin
          </Link>
          <h1 className="text-2xl font-serif italic text-white">{challenge.title}</h1>
          <p className="text-neutral-500 mt-1">{challenge.time_limit_min} minute time limit</p>
        </div>
        <span className="text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-medium">View Only</span>
      </div>

      {/* Description */}
      {challenge.description && (
        <div className="bg-[#111] border border-white/5 rounded-2xl mb-8 overflow-hidden">
          <button
            onClick={() => setDescriptionOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/2 transition-colors cursor-pointer"
          >
            <span className="text-sm font-medium text-white">Description</span>
            <svg
              className={`w-4 h-4 text-neutral-500 transition-transform duration-200 ${descriptionOpen ? 'rotate-180' : ''}`}
              viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round"
            >
              <polyline points="6,8 10,12 14,8" />
            </svg>
          </button>
          {descriptionOpen && (
            <div className="px-5 pb-5 border-t border-white/5 pt-4">
              <MarkdownViewer content={challenge.description} />
            </div>
          )}
        </div>
      )}

      {/* Starter Files */}
      <div className="bg-[#111] border border-white/5 rounded-2xl mb-8 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Starter Files</p>
            <p className="text-xs text-neutral-500 mt-0.5">
              {starterFiles.length > 0
                ? `${starterFiles.length} file${starterFiles.length !== 1 ? 's' : ''}`
                : 'No starter files configured'}
            </p>
          </div>
        </div>

        {starterFiles.length > 0 && (
          <div>
            {/* File tabs */}
            <div className="flex gap-1 px-3 pt-3 border-b border-white/5 overflow-x-auto">
              {starterFiles.map((file, i) => (
                <button
                  key={i}
                  onClick={() => setOpenFileIndex(openFileIndex === i ? null : i)}
                  className={`px-3 py-1.5 text-xs rounded-t-lg whitespace-nowrap transition-colors cursor-pointer ${
                    openFileIndex === i
                      ? 'bg-white/10 text-white'
                      : 'text-neutral-500 hover:text-neutral-300'
                  }`}
                >
                  {file.path}
                </button>
              ))}
            </div>

            {openFileIndex !== null && starterFiles[openFileIndex] && (
              <div className="p-4">
                <pre className="text-xs text-neutral-300 overflow-x-auto whitespace-pre font-mono leading-relaxed bg-[#0a0a0a] rounded-xl p-4 border border-white/5 max-h-96 overflow-y-auto">
                  {starterFiles[openFileIndex].content}
                </pre>
              </div>
            )}

            {openFileIndex === null && (
              <p className="text-xs text-neutral-600 px-5 py-4">Click a file tab to view its contents.</p>
            )}
          </div>
        )}
      </div>

      {/* Candidates */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">
          Candidates ({challenge.sessions.length})
        </h2>

        {challenge.sessions.length === 0 ? (
          <div className="bg-[#111] border border-white/5 rounded-2xl p-8 text-center">
            <p className="text-neutral-600">No candidates yet</p>
          </div>
        ) : (
          <div className="space-y-3">
            {challenge.sessions.map((session) => (
              <div
                key={session.id}
                className="bg-[#111] border border-white/5 rounded-2xl p-5 flex items-center justify-between"
              >
                <div>
                  <p className="text-white font-medium">{session.candidate_name}</p>
                  <p className="text-neutral-600 text-sm">{session.candidate_email}</p>
                  {session.started_at && (
                    <p className="text-neutral-700 text-xs mt-1">
                      Started {formatDateTime(session.started_at)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[session.status] ?? ''}`}>
                    {session.status}
                  </span>
                  {session.status === 'analyzed' && (
                    <Link
                      href={`/dashboard/challenges/${challenge.id}/submissions/${session.id}`}
                      className="text-primary hover:text-primary-light text-sm font-medium transition-colors"
                    >
                      View Report
                    </Link>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
