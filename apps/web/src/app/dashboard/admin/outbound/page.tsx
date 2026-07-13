'use client';

import ConcentricArcLoader from '@/components/dashboard/ConcentricArcLoader';
import { useAuth } from '@/context/AuthContext';
import { Ban, CheckCircle2, ExternalLink, FileText, RefreshCw, Save, Search, Send, ShieldCheck, UserPlus, XCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';

interface OutboundRun {
  id: string;
  mode: string;
  status: string;
  started_by_email: string | null;
  started_at: string | null;
  completed_at: string | null;
  error: string | null;
  stats: {
    prospectsFound?: number;
    evidenceFound?: number;
    contactsFound?: number;
    draftsFound?: number;
    rejected?: number;
  } | null;
  created_at: string;
}

interface OutboundProspect {
  id: string;
  company_name: string;
  domain: string | null;
  status: string;
  fit_score: number | null;
  signals: string[] | null;
  metadata: {
    industry?: string | null;
    region?: string | null;
    employeeCountEstimate?: string | null;
  } | null;
  evidence: Array<{
    id: string;
    sourceType: string;
    sourceUrl: string;
    signalType: string;
    summary: string;
    quotedText: string | null;
    confidence: number | null;
  }>;
  contacts: Array<{
    id: string;
    fullName: string | null;
    roleTitle: string | null;
    email: string | null;
    emailStatus: string;
    linkedinUrl: string | null;
    source: string | null;
    confidence: number | null;
    metadata: {
      department?: string | null;
    } | null;
  }>;
  drafts: Array<{
    id: string;
    contactId: string | null;
    channel: string;
    sequenceStep: number;
    subject: string | null;
    body: string;
    status: string;
  }>;
  evidence_count: number;
  contact_count: number;
  draft_count: number;
  created_at: string;
}

function fmtDate(value?: string | null) {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function StatusPill({ status }: { status: string }) {
  const cls: Record<string, string> = {
    completed: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    approved: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    running: 'border-blue-500/20 bg-blue-500/10 text-blue-300',
    failed: 'border-red-500/20 bg-red-500/10 text-red-300',
    rejected: 'border-red-500/20 bg-red-500/10 text-red-300',
    disqualified: 'border-neutral-500/20 bg-neutral-500/10 text-neutral-300',
    enriched: 'border-cyan-500/20 bg-cyan-500/10 text-cyan-300',
    enrichment_requested: 'border-blue-500/20 bg-blue-500/10 text-blue-300',
    drafted: 'border-violet-500/20 bg-violet-500/10 text-violet-300',
    draft_requested: 'border-blue-500/20 bg-blue-500/10 text-blue-300',
    contacted: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    sent: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    reviewed: 'border-amber-500/20 bg-amber-500/10 text-amber-300',
    new: 'border-primary/20 bg-primary/10 text-primary',
  };
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${cls[status] || 'border-white/10 bg-white/5 text-neutral-400'}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-white/5 bg-surface p-5">
      <p className="text-xs text-neutral-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="mt-1 text-xs text-neutral-600">{sub}</p>}
    </div>
  );
}

export default function OutboundAdminPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [runs, setRuns] = useState<OutboundRun[]>([]);
  const [prospects, setProspects] = useState<OutboundProspect[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [draftingId, setDraftingId] = useState<string | null>(null);
  const [savingDraftId, setSavingDraftId] = useState<string | null>(null);
  const [sendingDraftId, setSendingDraftId] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<Record<string, { subject: string; body: string }>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && (!user || !user.isAdmin)) {
      router.replace('/dashboard');
    }
  }, [authLoading, router, user]);

  async function load() {
    setError(null);
    try {
      const res = await fetch('/api/admin/outbound/runs');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load outbound runs');
      setRuns(data.runs ?? []);
      setProspects(data.prospects ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load outbound data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user?.isAdmin) void load();
  }, [user?.isAdmin]);

  async function startDiscovery() {
    setStarting(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/outbound/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to start discovery');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start discovery');
    } finally {
      setStarting(false);
    }
  }

  async function reviewProspect(prospectId: string, status: 'approved' | 'rejected' | 'disqualified') {
    setReviewingId(prospectId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/outbound/prospects/${prospectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to review prospect');
      setProspects((current) => current.map((prospect) => (
        prospect.id === prospectId ? { ...prospect, status } : prospect
      )));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to review prospect');
    } finally {
      setReviewingId(null);
    }
  }

  async function enrichProspect(prospectId: string) {
    setEnrichingId(prospectId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/outbound/prospects/${prospectId}/enrich`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to enrich prospect');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enrich prospect');
    } finally {
      setEnrichingId(null);
    }
  }

  async function draftProspect(prospectId: string) {
    setDraftingId(prospectId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/outbound/prospects/${prospectId}/drafts`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to draft outreach');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to draft outreach');
    } finally {
      setDraftingId(null);
    }
  }

  async function updateDraft(draftId: string, status?: 'approved' | 'rejected') {
    const edit = draftEdits[draftId];
    setSavingDraftId(draftId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/outbound/drafts/${draftId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...edit, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update draft');
      setDraftEdits((current) => {
        const next = { ...current };
        delete next[draftId];
        return next;
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update draft');
    } finally {
      setSavingDraftId(null);
    }
  }

  async function sendDraft(draftId: string) {
    setSendingDraftId(draftId);
    setError(null);
    try {
      const res = await fetch(`/api/admin/outbound/drafts/${draftId}/send`, {
        method: 'POST',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send draft');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to send draft');
    } finally {
      setSendingDraftId(null);
    }
  }

  function updateDraftEdit(draft: OutboundProspect['drafts'][number], changes: Partial<{ subject: string; body: string }>) {
    setDraftEdits((current) => {
      const existing = current[draft.id] ?? { subject: draft.subject ?? '', body: draft.body };
      return {
        ...current,
        [draft.id]: { ...existing, ...changes },
      };
    });
  }

  const totals = useMemo(() => {
    const completed = runs.filter((run) => run.status === 'completed').length;
    const evidence = prospects.reduce((sum, prospect) => sum + Number(prospect.evidence_count || 0), 0);
    const contacts = prospects.reduce((sum, prospect) => sum + Number(prospect.contact_count || 0), 0);
    const drafts = prospects.reduce((sum, prospect) => sum + Number(prospect.draft_count || 0), 0);
    return { completed, evidence, contacts, drafts };
  }, [prospects, runs]);

  if (authLoading || !user?.isAdmin) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Admin controlled
          </div>
          <h1 className="font-serif text-3xl italic text-white">Outbound</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-500">
            Discovery runs find companies with hiring signals, store evidence, and wait for review before enrichment or outreach.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 px-4 text-xs font-semibold text-neutral-300 transition-colors hover:border-white/20 hover:text-white"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
          <button
            type="button"
            onClick={startDiscovery}
            disabled={starting}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-primary px-4 text-xs font-semibold text-black transition-all hover:bg-primary-light disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Search className="h-3.5 w-3.5" />
            {starting ? 'Running...' : 'Run discovery'}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="Runs" value={String(runs.length)} sub={`${totals.completed} completed`} />
        <MetricCard label="Prospects" value={String(prospects.length)} sub="stored companies" />
        <MetricCard label="Evidence" value={String(totals.evidence)} sub="source-backed signals" />
        <MetricCard label="Contacts" value={String(totals.contacts)} sub={`${totals.drafts} drafts`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.1fr_1.4fr]">
        <section className="overflow-hidden rounded-2xl border border-white/5 bg-surface">
          <div className="border-b border-white/5 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">Runs</h2>
            <p className="mt-1 text-xs text-neutral-500">Latest agent executions</p>
          </div>
          {loading ? (
            <div className="p-6">
              <ConcentricArcLoader label="Loading runs" />
            </div>
          ) : runs.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-neutral-600">No runs yet</p>
          ) : (
            <div className="divide-y divide-white/5">
              {runs.map((run) => (
                <div key={run.id} className="px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs text-neutral-400">{run.id}</p>
                      <p className="mt-1 text-sm font-medium text-white">{run.mode.replace(/_/g, ' ')}</p>
                    </div>
                    <StatusPill status={run.status} />
                  </div>
                  <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-neutral-600">Output</p>
                      <p className="mt-0.5 text-neutral-300">{run.stats?.prospectsFound ?? run.stats?.contactsFound ?? run.stats?.draftsFound ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-neutral-600">Evidence</p>
                      <p className="mt-0.5 text-neutral-300">{run.stats?.evidenceFound ?? '-'}</p>
                    </div>
                    <div>
                      <p className="text-neutral-600">Started</p>
                      <p className="mt-0.5 text-neutral-300">{fmtDate(run.started_at || run.created_at)}</p>
                    </div>
                  </div>
                  {run.error && <p className="mt-3 text-xs text-red-300">{run.error}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-white/5 bg-surface">
          <div className="border-b border-white/5 px-5 py-4">
            <h2 className="text-sm font-semibold text-white">Prospects</h2>
            <p className="mt-1 text-xs text-neutral-500">Companies discovered by outbound runs</p>
          </div>
          {loading ? (
            <div className="p-6">
              <ConcentricArcLoader label="Loading prospects" />
            </div>
          ) : prospects.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-neutral-600">No prospects yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/5 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-neutral-500">Company</th>
                    <th className="px-5 py-3 text-xs font-medium text-neutral-500">Signals</th>
                    <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Fit</th>
                    <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Evidence</th>
                    <th className="px-5 py-3 text-xs font-medium text-neutral-500">Status</th>
                    <th className="px-5 py-3 text-xs font-medium text-neutral-500 text-right">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {prospects.map((prospect) => (
                    <Fragment key={prospect.id}>
                      <tr className="border-b border-white/5">
                        <td className="px-5 py-4">
                          <p className="font-medium text-white">{prospect.company_name}</p>
                          <p className="mt-1 text-xs text-neutral-500">{prospect.domain || 'No domain'}{prospect.metadata?.region ? ` - ${prospect.metadata.region}` : ''}</p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex max-w-md flex-wrap gap-1.5">
                            {(prospect.signals ?? []).slice(0, 3).map((signal) => (
                              <span key={signal} className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-neutral-300">
                                {signal.replace(/_/g, ' ')}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right font-mono text-neutral-200">{prospect.fit_score ?? '-'}</td>
                        <td className="px-5 py-4 text-right text-neutral-300">{prospect.evidence_count}</td>
                        <td className="px-5 py-4">
                          <StatusPill status={prospect.status} />
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => void reviewProspect(prospect.id, 'approved')}
                              disabled={reviewingId === prospect.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/20 text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
                              title="Approve"
                            >
                              <CheckCircle2 className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void reviewProspect(prospect.id, 'rejected')}
                              disabled={reviewingId === prospect.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-500/20 text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                              title="Reject"
                            >
                              <XCircle className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void reviewProspect(prospect.id, 'disqualified')}
                              disabled={reviewingId === prospect.id}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 text-neutral-400 transition-colors hover:bg-white/5 hover:text-white disabled:opacity-40"
                              title="Disqualify"
                            >
                              <Ban className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void enrichProspect(prospect.id)}
                              disabled={enrichingId === prospect.id || !['approved', 'enriched'].includes(prospect.status)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-cyan-500/20 text-cyan-300 transition-colors hover:bg-cyan-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                              title="Enrich"
                            >
                              <UserPlus className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => void draftProspect(prospect.id)}
                              disabled={draftingId === prospect.id || !['enriched', 'drafted'].includes(prospect.status)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-violet-500/20 text-violet-300 transition-colors hover:bg-violet-500/10 disabled:cursor-not-allowed disabled:opacity-30"
                              title="Draft outreach"
                            >
                              <FileText className="h-4 w-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                      <tr className="border-b border-white/5 last:border-0">
                        <td colSpan={6} className="px-5 pb-5 pt-0">
                          <div className="grid gap-2 xl:grid-cols-3">
                            <div className="space-y-2">
                              {(prospect.evidence ?? []).slice(0, 2).map((evidence) => (
                                <div key={evidence.id} className="rounded-xl border border-white/5 bg-black/20 px-3 py-2.5">
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="text-xs font-medium text-neutral-300">{evidence.signalType.replace(/_/g, ' ')}</p>
                                    <a
                                      href={evidence.sourceUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-primary hover:text-primary-light"
                                    >
                                      Source
                                      <ExternalLink className="h-3 w-3" />
                                    </a>
                                  </div>
                                  <p className="mt-1.5 text-xs leading-5 text-neutral-500">{evidence.summary}</p>
                                  {evidence.quotedText && (
                                    <p className="mt-2 border-l border-white/10 pl-2 text-xs italic leading-5 text-neutral-400">
                                      {evidence.quotedText}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                            <div className="space-y-2">
                              {(prospect.contacts ?? []).slice(0, 3).map((contact) => (
                                <div key={contact.id} className="rounded-xl border border-cyan-500/10 bg-cyan-500/[0.04] px-3 py-2.5">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-medium text-neutral-200">
                                        {contact.fullName || contact.roleTitle || 'Unnamed contact'}
                                      </p>
                                      <p className="mt-0.5 truncate text-xs text-neutral-500">
                                        {contact.roleTitle || 'Role unknown'}{contact.metadata?.department ? ` - ${contact.metadata.department}` : ''}
                                      </p>
                                    </div>
                                    <span className="rounded-md border border-white/10 px-2 py-1 text-[11px] text-neutral-400">
                                      {contact.emailStatus}
                                    </span>
                                  </div>
                                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-neutral-500">
                                    {contact.email && <span>{contact.email}</span>}
                                    {contact.linkedinUrl && (
                                      <a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="text-primary hover:text-primary-light">
                                        LinkedIn
                                      </a>
                                    )}
                                  </div>
                                </div>
                              ))}
                              {(prospect.contacts ?? []).length === 0 && (
                                <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-4 text-center text-xs text-neutral-600">
                                  No contacts yet
                                </div>
                              )}
                            </div>
                            <div className="space-y-2">
                              {(prospect.drafts ?? []).map((draft) => {
                                const edit = draftEdits[draft.id];
                                const subject = edit?.subject ?? draft.subject ?? '';
                                const body = edit?.body ?? draft.body;
                                const contact = prospect.contacts.find((item) => item.id === draft.contactId);
                                return (
                                  <div key={draft.id} className="rounded-xl border border-violet-500/10 bg-violet-500/[0.04] px-3 py-2.5">
                                    <div className="flex items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate text-xs font-medium text-neutral-200">
                                          {draft.channel.replace(/_/g, ' ')} step {draft.sequenceStep}
                                        </p>
                                        <p className="mt-0.5 truncate text-xs text-neutral-500">
                                          {contact?.fullName || contact?.roleTitle || 'Company level'}
                                        </p>
                                      </div>
                                      <StatusPill status={draft.status} />
                                    </div>
                                    {draft.channel === 'email' && (
                                      <input
                                        value={subject}
                                        onChange={(event) => updateDraftEdit(draft, { subject: event.target.value })}
                                        className="mt-2 h-9 w-full rounded-lg border border-white/10 bg-black/20 px-3 text-xs text-neutral-200 outline-none transition-colors focus:border-violet-400/50"
                                        placeholder="Subject"
                                      />
                                    )}
                                    <textarea
                                      value={body}
                                      onChange={(event) => updateDraftEdit(draft, { body: event.target.value })}
                                      rows={6}
                                      className="mt-2 w-full resize-y rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs leading-5 text-neutral-300 outline-none transition-colors focus:border-violet-400/50"
                                    />
                                    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
                                      <button
                                        type="button"
                                        onClick={() => void updateDraft(draft.id)}
                                        disabled={savingDraftId === draft.id || draft.status === 'sent'}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 text-xs text-neutral-300 transition-colors hover:bg-white/5 disabled:opacity-40"
                                      >
                                        <Save className="h-3.5 w-3.5" />
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void updateDraft(draft.id, 'approved')}
                                        disabled={savingDraftId === draft.id || draft.status === 'sent'}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-emerald-500/20 px-2.5 text-xs text-emerald-300 transition-colors hover:bg-emerald-500/10 disabled:opacity-40"
                                      >
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Approve
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void updateDraft(draft.id, 'rejected')}
                                        disabled={savingDraftId === draft.id || draft.status === 'sent'}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-500/20 px-2.5 text-xs text-red-300 transition-colors hover:bg-red-500/10 disabled:opacity-40"
                                      >
                                        <XCircle className="h-3.5 w-3.5" />
                                        Reject
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void sendDraft(draft.id)}
                                        disabled={sendingDraftId === draft.id || draft.status !== 'approved'}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-primary/20 px-2.5 text-xs text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-30"
                                      >
                                        <Send className="h-3.5 w-3.5" />
                                        {draft.channel === 'email' ? 'Send' : 'Mark sent'}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                              {(prospect.drafts ?? []).length === 0 && (
                                <div className="rounded-xl border border-white/5 bg-black/20 px-3 py-4 text-center text-xs text-neutral-600">
                                  No drafts yet
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
