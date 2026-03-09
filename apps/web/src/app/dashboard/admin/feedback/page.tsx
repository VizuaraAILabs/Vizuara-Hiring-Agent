'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import type { FeedbackRecord, FeedbackReply, FeedbackStats, FeedbackType } from '@/types/feedback';

const TYPE_BADGE: Record<string, string> = {
  emoji: 'bg-amber-500/20 text-amber-400',
  nps: 'bg-blue-500/20 text-blue-400',
  thumbs: 'bg-green-500/20 text-green-400',
  survey: 'bg-purple-500/20 text-purple-400',
  general: 'bg-neutral-500/20 text-neutral-400',
};

function StatCard({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="bg-surface-light border border-border rounded-xl p-4">
      <p className="text-xs text-neutral-400 mb-1">{label}</p>
      <p className="text-xl font-semibold text-white">{value ?? '—'}</p>
    </div>
  );
}

export default function AdminFeedbackDashboard() {
  const { user } = useAuth();
  const router = useRouter();

  const [feedback, setFeedback] = useState<FeedbackRecord[]>([]);
  const [stats, setStats] = useState<FeedbackStats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);

  const [typeFilter, setTypeFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draftTexts, setDraftTexts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  function updateFeedbackReplies(feedbackId: string, updater: (replies: FeedbackReply[]) => FeedbackReply[]) {
    setFeedback((prev) =>
      prev.map((f) => (f.id === feedbackId ? { ...f, replies: updater(f.replies || []) } : f))
    );
  }

  async function handleSaveDraft(feedbackId: string) {
    const text = (draftTexts[feedbackId] || '').trim();
    if (!text) return;
    setSavingId(feedbackId);
    const res = await fetch(`/api/admin/feedback/${feedbackId}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyText: text }),
    });
    if (res.ok) {
      const reply = await res.json();
      updateFeedbackReplies(feedbackId, (replies) => [...replies, reply]);
      setDraftTexts((prev) => ({ ...prev, [feedbackId]: '' }));
    }
    setSavingId(null);
  }

  async function handleSend(feedbackId: string, replyId: string) {
    setSendingId(replyId);
    const res = await fetch(`/api/admin/feedback/${feedbackId}/reply`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyId }),
    });
    if (res.ok) {
      updateFeedbackReplies(feedbackId, (replies) =>
        replies.map((r) =>
          r.id === replyId ? { ...r, status: 'sent', sentAt: new Date().toISOString() } : r
        )
      );
    }
    setSendingId(null);
  }

  const fetchData = useCallback(async (p: number) => {
    setLoading(true);
    const params = new URLSearchParams({ page: String(p) });
    if (typeFilter) params.set('type', typeFilter);
    if (courseFilter) params.set('courseSlug', courseFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);

    const res = await fetch(`/api/admin/feedback?${params}`);
    if (res.ok) {
      const data = await res.json();
      setFeedback(data.feedback);
      setStats(data.stats);
      setTotal(data.total);
      setTotalPages(data.totalPages);
    }
    setLoading(false);
  }, [typeFilter, courseFilter, dateFrom, dateTo]);

  useEffect(() => {
    if (!user) return;
    if (!user.isAdmin) { router.push('/dashboard'); return; }
    fetchData(page);
  }, [user, router, page, fetchData]);

  const handleExport = () => {
    const params = new URLSearchParams();
    if (typeFilter) params.set('type', typeFilter);
    if (courseFilter) params.set('courseSlug', courseFilter);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    window.open(`/api/admin/feedback/export?${params}`, '_blank');
  };

  const handleFilter = () => { setPage(1); fetchData(1); };

  if (!user || !user.isAdmin) return null;

  const maxNpsCount = stats ? Math.max(...Object.values(stats.npsDistribution), 1) : 1;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-semibold text-white mb-6">Feedback Dashboard</h1>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          <StatCard label="Total Feedback" value={stats.totalCount} />
          <StatCard label="Avg NPS" value={stats.avgNps !== null ? stats.avgNps.toFixed(1) : null} />
          <StatCard label="Avg Emoji" value={stats.avgEmoji !== null ? stats.avgEmoji.toFixed(1) : null} />
          <StatCard label="Thumbs Up %" value={stats.thumbsUpPercent !== null ? `${stats.thumbsUpPercent.toFixed(0)}%` : null} />
          <StatCard label="Last 7 Days" value={stats.last7DaysCount} />
        </div>
      )}

      {/* NPS Distribution */}
      {stats && (
        <div className="bg-surface-light border border-border rounded-xl p-5 mb-6">
          <h2 className="text-sm font-medium text-neutral-300 mb-4">NPS Distribution</h2>
          <div className="flex flex-col gap-1.5">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
              const count = stats.npsDistribution[n] ?? 0;
              const pct = Math.round((count / maxNpsCount) * 100);
              const color = n <= 6 ? 'bg-red-500' : n <= 8 ? 'bg-amber-500' : 'bg-primary';
              return (
                <div key={n} className="flex items-center gap-2">
                  <span className="text-xs text-neutral-400 w-4 text-right">{n}</span>
                  <div className="flex-1 bg-border rounded-full h-3">
                    <div className={`${color} h-3 rounded-full transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-neutral-500 w-6 text-right">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tag Breakdown */}
      {stats && Object.keys(stats.tagBreakdown).length > 0 && (
        <div className="bg-surface-light border border-border rounded-xl p-5 mb-6">
          <h2 className="text-sm font-medium text-neutral-300 mb-3">Tag Breakdown</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.tagBreakdown).map(([tag, count]) => (
              <span key={tag} className="text-xs bg-accent/10 text-accent border border-accent/20 px-2.5 py-1 rounded-full">
                {tag.replace(/_/g, ' ')} · {count}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-surface-light border border-border rounded-xl p-4 mb-5 flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-400">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="">All</option>
            {(['emoji', 'nps', 'thumbs', 'survey', 'general'] as FeedbackType[]).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-400">Course slug</label>
          <input
            value={courseFilter}
            onChange={(e) => setCourseFilter(e.target.value)}
            placeholder="e.g. intro-to-ml"
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-400">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-neutral-400">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-surface border border-border rounded-lg px-3 py-2 text-sm text-neutral-200 focus:outline-none focus:border-primary"
          />
        </div>
        <button
          onClick={handleFilter}
          className="bg-primary hover:bg-primary-light text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer"
        >
          Filter
        </button>
        <button
          onClick={handleExport}
          className="border border-border hover:border-border-light text-neutral-300 hover:text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors cursor-pointer ml-auto"
        >
          Export CSV
        </button>
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-light">
                <th className="text-left text-xs text-neutral-400 font-medium px-4 py-3">Date</th>
                <th className="text-left text-xs text-neutral-400 font-medium px-4 py-3">User</th>
                <th className="text-left text-xs text-neutral-400 font-medium px-4 py-3">Type</th>
                <th className="text-left text-xs text-neutral-400 font-medium px-4 py-3">Course / Pod</th>
                <th className="text-left text-xs text-neutral-400 font-medium px-4 py-3">Rating</th>
                <th className="text-left text-xs text-neutral-400 font-medium px-4 py-3">Details</th>
                <th className="text-left text-xs text-neutral-400 font-medium px-4 py-3">Reply</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center text-neutral-500 py-10">Loading...</td>
                </tr>
              ) : feedback.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-neutral-500 py-10">No feedback found.</td>
                </tr>
              ) : (
                feedback.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr className="border-b border-border hover:bg-surface-light/50 transition-colors">
                      <td className="px-4 py-3 text-neutral-400 whitespace-nowrap">
                        {new Date(row.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-neutral-200">{row.userName || '—'}</div>
                        <div className="text-xs text-neutral-500">{row.userEmail || ''}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_BADGE[row.type] || ''}`}>
                          {row.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-neutral-400">
                        {row.courseSlug && <div>{row.courseSlug}</div>}
                        {row.podSlug && <div className="text-xs text-neutral-500">{row.podSlug}</div>}
                      </td>
                      <td className="px-4 py-3 text-neutral-200">
                        {row.rating !== null ? row.rating : '—'}
                      </td>
                      <td className="px-4 py-3 max-w-sm">
                        {row.comment && <p className="text-neutral-300 text-xs mb-1">{row.comment}</p>}
                        {row.tags && row.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {row.tags.map((tag) => (
                              <span key={tag} className="text-xs bg-border text-neutral-400 px-1.5 py-0.5 rounded">
                                {tag.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        )}
                        {row.category && (
                          <span className="text-xs text-neutral-500">cat: {row.category}</span>
                        )}
                        {row.surveyData && (
                          <details className="text-xs text-neutral-500 cursor-pointer">
                            <summary>Survey data</summary>
                            <pre className="text-xs mt-1 text-neutral-400">{JSON.stringify(row.surveyData, null, 2)}</pre>
                          </details>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setExpandedId(expandedId === row.id ? null : row.id)}
                          className="text-xs px-2.5 py-1 rounded-lg border border-border text-neutral-400 hover:text-white hover:border-border-light transition-colors cursor-pointer whitespace-nowrap"
                        >
                          {expandedId === row.id ? 'Close' : `↩ Reply${(row.replies?.length ?? 0) > 0 ? ` (${row.replies!.length})` : ''}`}
                        </button>
                      </td>
                    </tr>
                    {expandedId === row.id && (
                      <tr key={`${row.id}-reply`} className="border-b border-border bg-surface-light/30">
                        <td colSpan={7} className="px-6 py-4">
                          {/* Existing replies */}
                          {(row.replies?.length ?? 0) > 0 && (
                            <div className="mb-4 flex flex-col gap-2">
                              {row.replies!.map((reply) => (
                                <div key={reply.id} className="flex items-start gap-3 text-xs">
                                  <span className={`shrink-0 px-2 py-0.5 rounded-full font-medium ${reply.status === 'sent' ? 'bg-primary/20 text-primary' : 'bg-neutral-500/20 text-neutral-400'}`}>
                                    {reply.status === 'sent' ? '✓ Sent' : 'Draft'}
                                  </span>
                                  <div className="flex-1">
                                    <span className="text-neutral-400">{reply.repliedBy}</span>
                                    {reply.sentAt && <span className="text-neutral-600 ml-2">{new Date(reply.sentAt).toLocaleDateString()}</span>}
                                    <p className="text-neutral-300 mt-0.5 whitespace-pre-wrap">{reply.replyText}</p>
                                  </div>
                                  {reply.status === 'draft' && (
                                    <button
                                      onClick={() => handleSend(row.id, reply.id)}
                                      disabled={sendingId === reply.id}
                                      className="shrink-0 text-xs px-2.5 py-1 rounded-lg bg-primary hover:bg-primary-light disabled:opacity-50 text-black font-medium transition-colors cursor-pointer disabled:cursor-not-allowed"
                                    >
                                      {sendingId === reply.id ? 'Sending…' : 'Send →'}
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                          {/* Compose area */}
                          <div className="flex gap-2 items-end">
                            <textarea
                              value={draftTexts[row.id] || ''}
                              onChange={(e) => setDraftTexts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                              placeholder="Write a reply…"
                              rows={2}
                              className="flex-1 bg-surface border border-border rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 focus:outline-none focus:border-primary resize-none"
                            />
                            <button
                              onClick={() => handleSaveDraft(row.id)}
                              disabled={savingId === row.id || !(draftTexts[row.id] || '').trim()}
                              className="shrink-0 text-xs px-3 py-2 rounded-lg border border-border text-neutral-300 hover:text-white hover:border-border-light disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
                            >
                              {savingId === row.id ? 'Saving…' : 'Save Draft'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-light">
            <span className="text-xs text-neutral-500">
              Page {page} of {totalPages} · {total} total
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-neutral-400 hover:text-white hover:border-border-light disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-neutral-400 hover:text-white hover:border-border-light disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
