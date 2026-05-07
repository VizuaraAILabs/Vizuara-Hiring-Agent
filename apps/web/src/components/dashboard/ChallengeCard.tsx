'use client';

import Link from 'next/link';
import { formatDate } from '@/lib/utils';

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
  is_active: number;
  created_at: string;
}

export default function ChallengeCard({
  id,
  title,
  description,
  time_limit_min,
  candidate_count,
  is_active,
  created_at,
}: ChallengeCardProps) {
  return (
    <Link
      href={`/dashboard/challenges/${id}`}
      className="group block bg-surface border border-white/5 rounded-2xl p-6 hover:border-primary/20 transition-all duration-300"
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="text-lg font-semibold text-white group-hover:text-primary transition-colors">
          {title}
        </h3>
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
            is_active ? 'bg-primary/10 text-primary' : 'bg-neutral-800 text-neutral-500'
          }`}
        >
          {is_active ? 'Active' : 'Inactive'}
        </span>
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
