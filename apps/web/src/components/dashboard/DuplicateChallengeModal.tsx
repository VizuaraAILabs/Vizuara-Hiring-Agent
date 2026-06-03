'use client';

import { useEffect, useState } from 'react';
import ConfirmationModal from '@/components/ConfirmationModal';

interface DuplicateChallengeSource {
  id: string;
  title: string;
  hasStarterFiles?: boolean;
  hasAllowedEmails?: boolean;
  hasAccessWindow?: boolean;
  hasCohortLabel?: boolean;
}

interface DuplicateChallengeModalProps {
  open: boolean;
  source: DuplicateChallengeSource | null;
  onClose: () => void;
  onDuplicated: (challengeId: string) => void;
}

export default function DuplicateChallengeModal({
  open,
  source,
  onClose,
  onDuplicated,
}: DuplicateChallengeModalProps) {
  const [title, setTitle] = useState('');
  const [copyStarterFiles, setCopyStarterFiles] = useState(true);
  const [copyAllowedEmails, setCopyAllowedEmails] = useState(false);
  const [copyAccessWindow, setCopyAccessWindow] = useState(false);
  const [copyCohortLabel, setCopyCohortLabel] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !source) return;
    setTitle(`Copy of ${source.title}`);
    setCopyStarterFiles(source.hasStarterFiles !== false);
    setCopyAllowedEmails(false);
    setCopyAccessWindow(false);
    setCopyCohortLabel(source.hasCohortLabel !== false);
    setSaving(false);
    setError('');
  }, [open, source]);

  if (!open || !source) return null;

  async function handleDuplicate() {
    if (!source || saving) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/challenges/${source.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: trimmedTitle,
          copy_starter_files: copyStarterFiles,
          copy_allowed_emails: copyAllowedEmails,
          copy_access_window: copyAccessWindow,
          copy_cohort_label: copyCohortLabel,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.id) {
        throw new Error(data?.error || 'Failed to duplicate assessment.');
      }

      onDuplicated(data.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate assessment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConfirmationModal
      open={open}
      title="Duplicate Assessment"
      description="Candidate access settings are reset. Set session limits, dates, and sharing after reviewing the copy."
      confirmLabel="Duplicate Assessment"
      cancelLabel="Cancel"
      isLoading={saving}
      error={error || null}
      onConfirm={handleDuplicate}
      onClose={onClose}
    >
      <div className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-600">
            New Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={160}
            disabled={saving}
            className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
          />
        </div>

        <div className="rounded-xl border border-white/5 bg-[#0a0a0a] p-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.16em] text-neutral-600">
            Copy Options
          </p>
          <div className="space-y-3">
            <label className="flex items-start gap-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={copyStarterFiles}
                onChange={(event) => setCopyStarterFiles(event.target.checked)}
                disabled={saving || source.hasStarterFiles === false}
                className="mt-1"
              />
              <span>
                Starter files
                {source.hasStarterFiles === false && <span className="text-neutral-600"> - none configured</span>}
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={copyCohortLabel}
                onChange={(event) => setCopyCohortLabel(event.target.checked)}
                disabled={saving || source.hasCohortLabel === false}
                className="mt-1"
              />
              <span>
                Cohort label
                {source.hasCohortLabel === false && <span className="text-neutral-600"> - none set</span>}
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={copyAllowedEmails}
                onChange={(event) => setCopyAllowedEmails(event.target.checked)}
                disabled={saving || source.hasAllowedEmails === false}
                className="mt-1"
              />
              <span>
                Allowed email list
                {source.hasAllowedEmails === false && <span className="text-neutral-600"> - none configured</span>}
              </span>
            </label>
            <label className="flex items-start gap-3 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={copyAccessWindow}
                onChange={(event) => setCopyAccessWindow(event.target.checked)}
                disabled={saving || source.hasAccessWindow === false}
                className="mt-1"
              />
              <span>
                Start/end window
                {source.hasAccessWindow === false && <span className="text-neutral-600"> - none configured</span>}
              </span>
            </label>
          </div>
        </div>
      </div>
    </ConfirmationModal>
  );
}
