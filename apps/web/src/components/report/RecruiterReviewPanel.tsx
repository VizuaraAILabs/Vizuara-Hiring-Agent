'use client';

import { MessageSquareText, Pencil, Save, StickyNote, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import Dropdown from '@/components/Dropdown';
import { formatDateTime, getDecisionColor, getDecisionLabel } from '@/lib/utils';
import type { DecisionLabel, Session } from '@/types';

interface RecruiterReviewPanelProps {
  session: Session;
  onSessionUpdated: (session: Session) => void;
}

const decisionOptions: { value: '' | DecisionLabel; label: string }[] = [
  { value: '', label: 'No decision' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'hold', label: 'Hold' },
  { value: 'reject', label: 'Reject' },
  { value: 'hired', label: 'Hired' },
];

export default function RecruiterReviewPanel({ session, onSessionUpdated }: RecruiterReviewPanelProps) {
  const [decisionLabel, setDecisionLabel] = useState<'' | DecisionLabel>(session.decision_label ?? '');
  const [notes, setNotes] = useState(session.recruiter_notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [reviewModalOpen, setReviewModalOpen] = useState(false);

  useEffect(() => {
    setDecisionLabel(session.decision_label ?? '');
    setNotes(session.recruiter_notes ?? '');
  }, [session.decision_label, session.recruiter_notes]);

  const hasChanges = useMemo(
    () => decisionLabel !== (session.decision_label ?? '') || notes !== (session.recruiter_notes ?? ''),
    [decisionLabel, notes, session.decision_label, session.recruiter_notes]
  );
  const hasSavedNotes = Boolean(session.recruiter_notes?.trim());

  async function handleSave() {
    if (!hasChanges || saving) return;

    setSaving(true);
    setSaved(false);
    setError('');

    try {
      const res = await fetch(`/api/session-reviews/${session.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decision_label: decisionLabel || null,
          recruiter_notes: notes,
        }),
      });

      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        throw new Error(data?.error || 'Review could not be saved.');
      }

      onSessionUpdated(data);
      setSaved(true);
      setReviewModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  function openReviewModal() {
    setDecisionLabel(session.decision_label ?? '');
    setNotes(session.recruiter_notes ?? '');
    setSaved(false);
    setError('');
    setReviewModalOpen(true);
  }

  function closeReviewModal() {
    if (saving) return;
    setDecisionLabel(session.decision_label ?? '');
    setNotes(session.recruiter_notes ?? '');
    setError('');
    setReviewModalOpen(false);
  }

  return (
    <div className="mt-6 rounded-2xl border border-white/5 bg-surface p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <StickyNote className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-sm font-semibold text-white">Recruiter Review</h2>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getDecisionColor(session.decision_label)}`}>
              {getDecisionLabel(session.decision_label)}
            </span>
            {hasSavedNotes && (
              <span
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary"
                title="Reviewer notes saved"
                aria-label="Reviewer notes saved"
              >
                <MessageSquareText className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-600">
            {session.reviewed_at
              ? `Last saved by ${session.reviewed_by_name || session.reviewed_by_email || 'reviewer'} on ${formatDateTime(session.reviewed_at)}`
              : 'No recruiter review saved yet'}
          </p>
        </div>

        <button
          type="button"
          onClick={openReviewModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-primary-light"
        >
          <Pencil className="h-4 w-4" aria-hidden="true" />
          {session.reviewed_at ? 'Edit Review' : 'Add Review'}
        </button>
      </div>

      {reviewModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeReviewModal();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="recruiter-review-title"
            className="w-full max-w-3xl rounded-2xl border border-white/10 bg-surface shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/5 px-6 py-5">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StickyNote className="h-4 w-4 text-primary" aria-hidden="true" />
                  <h2 id="recruiter-review-title" className="text-base font-semibold text-white">Recruiter Review</h2>
                  <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${getDecisionColor(decisionLabel)}`}>
                    {getDecisionLabel(decisionLabel)}
                  </span>
                </div>
                <p className="mt-2 text-xs text-neutral-600">
                  {session.reviewed_at
                    ? `Last saved by ${session.reviewed_by_name || session.reviewed_by_email || 'reviewer'} on ${formatDateTime(session.reviewed_at)}`
                    : 'No recruiter review saved yet'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeReviewModal}
                disabled={saving}
                className="rounded-lg p-2 text-neutral-500 transition-colors hover:bg-white/5 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Close recruiter review"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4 px-6 py-5 lg:grid-cols-[minmax(300px,360px)_1fr]">
              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-600">
                  Decision
                </label>
                <Dropdown
                  value={decisionLabel}
                  options={decisionOptions}
                  onValueChange={(value) => {
                    setDecisionLabel(value as '' | DecisionLabel);
                    setSaved(false);
                  }}
                  triggerClassName="h-10 bg-[#0a0a0a] border-white/10"
                />
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium uppercase tracking-[0.16em] text-neutral-600">
                  Private Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    setSaved(false);
                  }}
                  maxLength={5000}
                  rows={8}
                  className="w-full resize-y rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-3 text-sm leading-relaxed text-white outline-none transition-colors placeholder:text-neutral-700 focus:border-primary/60"
                  placeholder="Add context for the hiring team..."
                />
                <div className="mt-2 flex min-h-5 items-center justify-between text-xs">
                  <span className={error ? 'text-red-300' : 'text-neutral-700'}>{error}</span>
                  <span className="text-neutral-700">{notes.length}/5000</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-white/5 px-6 py-4">
              <button
                type="button"
                onClick={closeReviewModal}
                disabled={saving}
                className="h-10 rounded-xl px-4 text-sm font-medium text-neutral-400 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasChanges || saving}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-black transition-colors hover:bg-primary-light disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
              >
                <Save className="h-4 w-4" aria-hidden="true" />
                {saving ? 'Saving' : saved ? 'Saved' : 'Save Review'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
