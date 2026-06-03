'use client';

import ArcSpinner from '@/components/ArcSpinner';
import type { ReportShareLink } from '@/types';
import { Copy, FileDown, Link2, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

type ReportExportActionsProps = {
  sessionId: string;
};

const durationOptions = [
  { value: '1', label: '1 day' },
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
];

export default function ReportExportActions({ sessionId }: ReportExportActionsProps) {
  const [shareLink, setShareLink] = useState<ReportShareLink | null>(null);
  const [durationDays, setDurationDays] = useState('7');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'create' | 'revoke' | 'copy' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const actionBusy = busy !== null;

  const publicUrl = useMemo(() => {
    if (!shareLink || typeof window === 'undefined') return '';
    return `${window.location.origin}/reports/shared/${shareLink.token}`;
  }, [shareLink]);

  useEffect(() => {
    let cancelled = false;

    async function loadShareLink() {
      try {
        const res = await fetch(`/api/report-shares/${sessionId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setShareLink(data.shareLink ?? null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadShareLink();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  async function createShareLink() {
    setBusy('create');
    setMessage(null);
    try {
      const res = await fetch(`/api/report-shares/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_days: Number(durationDays) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Unable to create report link.');
      setShareLink(data.shareLink);
      setMessage('Read-only link is ready.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create report link.');
    } finally {
      setBusy(null);
    }
  }

  async function revokeShareLink() {
    setBusy('revoke');
    setMessage(null);
    try {
      const res = await fetch(`/api/report-shares/${sessionId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Unable to revoke report link.');
      setShareLink(null);
      setMessage('Read-only link revoked.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to revoke report link.');
    } finally {
      setBusy(null);
    }
  }

  async function copyShareLink() {
    if (!publicUrl) return;
    setBusy('copy');
    setMessage(null);
    try {
      await navigator.clipboard.writeText(publicUrl);
      setMessage('Link copied.');
    } catch {
      setMessage('Unable to copy link.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="screen-only">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-end">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-primary/40 hover:text-primary"
          >
            <FileDown className="h-4 w-4" aria-hidden="true" />
            Export PDF
          </button>

          <select
            value={durationDays}
            onChange={(event) => setDurationDays(event.target.value)}
            className="rounded-full border border-white/10 bg-transparent px-3 py-2 text-sm font-semibold text-neutral-300 outline-none transition-colors hover:border-primary/40 focus:border-primary"
            aria-label="Report link expiry"
          >
            {durationOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          <button
            type="button"
            disabled={actionBusy}
            onClick={createShareLink}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:text-neutral-600"
          >
            {busy === 'create' ? (
              <>
                <ArcSpinner label="Creating report link" sizeClassName="h-4 w-4" />
                Creating...
              </>
            ) : (
              <>
                {shareLink ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Link2 className="h-4 w-4" aria-hidden="true" />}
                {shareLink ? 'Replace report link' : 'Create report link'}
              </>
            )}
          </button>

          {shareLink && (
            <>
              <button
                type="button"
                disabled={actionBusy}
                onClick={copyShareLink}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-primary/40 hover:text-primary disabled:cursor-not-allowed disabled:text-neutral-600"
              >
                {busy === 'copy' ? (
                  <>
                    <ArcSpinner label="Copying report link" sizeClassName="h-4 w-4" />
                    Copying...
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" aria-hidden="true" />
                    Copy link
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={actionBusy}
                onClick={revokeShareLink}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/10 px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:border-red-400/40 hover:text-red-300 disabled:cursor-not-allowed disabled:text-neutral-600"
              >
                {busy === 'revoke' ? (
                  <>
                    <ArcSpinner label="Revoking report link" sizeClassName="h-4 w-4" />
                    Revoking...
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4" aria-hidden="true" />
                    Revoke link
                  </>
                )}
              </button>
            </>
          )}
        </div>

        <div className="min-h-5 text-xs text-neutral-500 lg:text-right">
          {loading ? 'Checking link access...' : shareLink ? `Expires ${new Date(shareLink.expires_at).toLocaleString()}` : 'No public report link active.'}
          {message && <span className="ml-2 text-primary">{message}</span>}
        </div>
      </div>
    </div>
  );
}
