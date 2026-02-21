'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatDateTime } from '@/lib/utils';
import type { Challenge, Session } from '@/types';

interface ChallengeDetail extends Challenge {
  sessions: Session[];
}

export default function ChallengeDetailPage() {
  const params = useParams();
  const [challenge, setChallenge] = useState<ChallengeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteForm, setInviteForm] = useState({ name: '', email: '' });
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/challenges/${params.id}`)
      .then((res) => res.json())
      .then((data) => setChallenge(data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [params.id]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setInviteLoading(true);

    try {
      const res = await fetch(`/api/challenges/${params.id}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidate_name: inviteForm.name,
          candidate_email: inviteForm.email,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setInviteLink(`${window.location.origin}${data.invite_url}`);
        setInviteForm({ name: '', email: '' });
        const refreshed = await fetch(`/api/challenges/${params.id}`).then((r) => r.json());
        setChallenge(refreshed);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setInviteLoading(false);
    }
  }

  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-400',
    active: 'bg-blue-500/10 text-blue-400',
    completed: 'bg-neutral-800 text-neutral-400',
    analyzed: 'bg-[#00a854]/10 text-[#00a854]',
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-white/5 rounded w-1/3" />
        <div className="h-4 bg-white/5 rounded w-2/3" />
      </div>
    );
  }

  if (!challenge) return <p className="text-neutral-500">Challenge not found</p>;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-serif italic text-white">{challenge.title}</h1>
        <p className="text-neutral-500 mt-1">{challenge.time_limit_min} minute time limit</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Candidates List */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-white mb-4">
            Candidates ({challenge.sessions.length})
          </h2>

          {challenge.sessions.length === 0 ? (
            <div className="bg-[#111] border border-white/5 rounded-2xl p-8 text-center">
              <p className="text-neutral-600">No candidates invited yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {challenge.sessions.map((session) => (
                <div
                  key={session.id}
                  className="bg-[#111] border border-white/5 rounded-2xl p-5 flex items-center justify-between hover:border-white/10 transition-colors"
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
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[session.status]}`}>
                      {session.status}
                    </span>
                    {session.status === 'analyzed' && (
                      <Link
                        href={`/dashboard/challenges/${challenge.id}/submissions/${session.id}`}
                        className="text-[#00a854] hover:text-[#00c96b] text-sm font-medium transition-colors"
                      >
                        View Report
                      </Link>
                    )}
                    {session.status === 'completed' && (
                      <button
                        disabled={analyzingId === session.id}
                        onClick={async () => {
                          setAnalyzingId(session.id);
                          try {
                            const res = await fetch(`/api/analysis/${session.id}`, { method: 'POST' });
                            if (!res.ok) {
                              const err = await res.json().catch(() => ({ error: 'Analysis failed' }));
                              alert(err.error || 'Analysis failed. Check console for details.');
                            }
                            const refreshed = await fetch(`/api/challenges/${params.id}`).then((r) => r.json());
                            setChallenge(refreshed);
                          } catch (err) {
                            console.error('Analysis error:', err);
                            alert('Failed to connect to analysis engine.');
                          } finally {
                            setAnalyzingId(null);
                          }
                        }}
                        className="text-violet-400 hover:text-violet-300 disabled:text-violet-600 text-sm font-medium flex items-center gap-2"
                      >
                        {analyzingId === session.id ? (
                          <>
                            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Analyzing...
                          </>
                        ) : (
                          'Analyze'
                        )}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Invite Form */}
        <div>
          <h2 className="text-lg font-semibold text-white mb-4">Invite Candidate</h2>
          <form
            onSubmit={handleInvite}
            className="bg-[#111] border border-white/5 rounded-2xl p-6 space-y-4"
          >
            <div>
              <label className="block text-sm text-neutral-500 mb-1">Name</label>
              <input
                type="text"
                value={inviteForm.name}
                onChange={(e) => setInviteForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-neutral-500 mb-1">Email</label>
              <input
                type="email"
                value={inviteForm.email}
                onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 transition-all"
                required
              />
            </div>
            <button
              type="submit"
              disabled={inviteLoading}
              className="w-full bg-[#00a854] hover:bg-[#00c96b] disabled:opacity-50 text-black py-2.5 rounded-xl text-sm font-semibold transition-all btn-glow"
            >
              {inviteLoading ? 'Sending...' : 'Generate Invite Link'}
            </button>
          </form>

          {inviteLink && (
            <div className="mt-4 bg-[#111] border border-[#00a854]/20 rounded-2xl p-4 glow-green">
              <p className="text-xs text-neutral-500 mb-2">Share this link with the candidate:</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="flex-1 bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2 text-[#00a854] text-xs font-mono"
                />
                <button
                  onClick={() => navigator.clipboard.writeText(inviteLink)}
                  className="bg-white/5 hover:bg-white/10 text-neutral-400 px-3 py-2 rounded-xl text-xs transition-colors"
                >
                  Copy
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
