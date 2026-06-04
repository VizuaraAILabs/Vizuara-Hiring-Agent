'use client';

import Link from 'next/link';
import { Archive, Copy, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import { formatDate } from '@/lib/utils';
import { useAuth } from '@/context/AuthContext';

function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, '')        // headings
    .replace(/\*\*(.+?)\*\*/g, '$1')    // bold
    .replace(/\*(.+?)\*/g, '$1')        // italic
    .replace(/__(.+?)__/g, '$1')        // bold alt
    .replace(/_(.+?)_/g, '$1')          // italic alt
    .replace(/~~(.+?)~~/g, '$1')        // strikethrough
    .replace(/`(.+?)`/g, '$1')          // inline code
    .replace(/^\s*[-*+]\s+/gm, '')      // unordered list markers
    .replace(/^\s*\d+\.\s+/gm, '')      // ordered list markers
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/!\[.*?\]\(.+?\)/g, '')    // images
    .replace(/^\s*>\s+/gm, '')          // blockquotes
    .replace(/\n{2,}/g, ' ')            // collapse multiple newlines
    .replace(/\n/g, ' ')                // remaining newlines to spaces
    .trim();
}

interface ChallengeCardProps {
  id: string;
  title: string;
  description: string;
  time_limit_min: number;
  candidate_count: number;
  is_active: boolean | number;
  ends_at?: string | null;
  archived_at?: string | null;
  cohort_label?: string | null;
  has_starter_files?: boolean;
  has_allowed_emails?: boolean;
  has_access_window?: boolean;
  created_at: string;
  onArchiveToggle?: (challenge: {
    id: string;
    title: string;
    isActive: boolean;
    isArchived: boolean;
  }) => void;
  onDuplicate?: (challenge: {
    id: string;
    title: string;
    hasStarterFiles: boolean;
    hasAllowedEmails: boolean;
    hasAccessWindow: boolean;
    hasCohortLabel: boolean;
  }) => void;
}

export default function ChallengeCard({
  id,
  title,
  description,
  time_limit_min,
  candidate_count,
  is_active,
  ends_at,
  archived_at,
  cohort_label,
  has_starter_files = false,
  has_allowed_emails = false,
  has_access_window = false,
  created_at,
  onArchiveToggle,
  onDuplicate,
}: ChallengeCardProps) {
  const { user } = useAuth();
  const [now] = useState(() => Date.now());
  const isActive = Boolean(is_active);
  const isArchived = Boolean(archived_at);
  const canManageActions = Boolean(user?.isAdmin || user?.role === 'owner' || user?.role === 'recruiter');
  const isExpired = !isArchived && Boolean(ends_at) && new Date(ends_at as string).getTime() <= now;
  const statusLabel = isArchived ? 'Archived' : isExpired ? 'Expired' : isActive ? 'Active' : 'Closed';
  const statusClass = isArchived
    ? 'bg-neutral-800 text-neutral-500'
    : isExpired
      ? 'bg-amber-500/10 text-amber-300'
      : isActive
        ? 'bg-primary/10 text-primary'
        : 'bg-neutral-800 text-neutral-500';

  return (
    <Link
      href={`/dashboard/challenges/${id}`}
      className="group block bg-surface border border-white/5 rounded-2xl p-6 hover:border-primary/20 transition-all duration-300"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white group-hover:text-primary transition-colors">
            {title}
          </h3>
          {cohort_label && (
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-neutral-600">
              {cohort_label}
            </p>
          )}
        </div>
        <div className="ml-4 flex shrink-0 items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusClass}`}>
            {statusLabel}
          </span>
          {canManageActions && onArchiveToggle && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onArchiveToggle({ id, title, isActive, isArchived });
              }}
              className="rounded-lg border border-white/10 bg-[#0a0a0a] p-1.5 text-neutral-500 transition-colors hover:border-white/20 hover:text-white"
              title={isArchived ? 'Unarchive assessment' : 'Archive assessment'}
              aria-label={isArchived ? 'Unarchive assessment' : 'Archive assessment'}
            >
              {isArchived ? <RotateCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
            </button>
          )}
          {canManageActions && onDuplicate && (
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onDuplicate({
                  id,
                  title,
                  hasStarterFiles: has_starter_files,
                  hasAllowedEmails: has_allowed_emails,
                  hasAccessWindow: has_access_window,
                  hasCohortLabel: Boolean(cohort_label),
                });
              }}
              className="rounded-lg border border-white/10 bg-[#0a0a0a] p-1.5 text-neutral-500 transition-colors hover:border-white/20 hover:text-white"
              title="Duplicate assessment"
              aria-label="Duplicate assessment"
            >
              <Copy className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <p className="text-neutral-500 text-sm line-clamp-2 mb-4">{stripMarkdown(description)}</p>

      <div className="flex items-center gap-4 text-xs text-neutral-600">
        <span>{time_limit_min} min</span>
        <span>{candidate_count} candidate{candidate_count !== 1 ? 's' : ''}</span>
        <span>{formatDate(created_at)}</span>
      </div>
    </Link>
  );
}
