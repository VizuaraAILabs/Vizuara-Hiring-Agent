'use client';

import { useEffect, useState } from 'react';
import ConfirmationModal from '@/components/ConfirmationModal';

interface RenameChallengeSource {
  id: string;
  title: string;
}

interface RenameChallengeModalProps {
  open: boolean;
  source: RenameChallengeSource | null;
  onClose: () => void;
  onRenamed: (challengeId: string, title: string) => void;
}

export default function RenameChallengeModal({
  open,
  source,
  onClose,
  onRenamed,
}: RenameChallengeModalProps) {
  const [title, setTitle] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open || !source) return;
    setTitle(source.title);
    setSaving(false);
    setError('');
  }, [open, source]);

  if (!open || !source) return null;

  async function handleRename() {
    if (!source || saving) return;

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError('Title is required.');
      return;
    }
    if (trimmedTitle === source.title) {
      onClose();
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/challenges/${source.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmedTitle }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || 'Failed to rename assessment.');
      }

      onRenamed(source.id, data.title ?? trimmedTitle);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename assessment.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ConfirmationModal
      open={open}
      title="Rename Assessment"
      description="Update the title shown to your team and on the candidate invite page."
      confirmLabel="Save"
      cancelLabel="Cancel"
      isLoading={saving}
      error={error || null}
      onConfirm={handleRename}
      onClose={onClose}
    >
      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-600">
          Title
        </label>
        <input
          type="text"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={160}
          disabled={saving}
          autoFocus
          className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-primary/50 disabled:opacity-60"
        />
      </div>
    </ConfirmationModal>
  );
}
