'use client';

import { useAuth } from '@/context/AuthContext';
import EmojiRating from './EmojiRating';
import ThumbsRating from './ThumbsRating';

interface InlineFeedbackProps {
  courseSlug?: string;
  podSlug?: string;
  contentType: 'article' | 'notebook';
  notebookOrder?: number;
}

export default function InlineFeedback({ courseSlug, podSlug, contentType, notebookOrder }: InlineFeedbackProps) {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <div className="mt-8 border border-border rounded-xl p-5 bg-surface">
      <p className="text-sm text-neutral-300 mb-4">
        How was this {contentType === 'notebook' ? 'notebook' : 'article'}?
      </p>
      <div className="flex flex-col sm:flex-row gap-6 sm:items-start">
        <EmojiRating
          courseSlug={courseSlug}
          podSlug={podSlug}
          contentType={contentType}
          notebookOrder={notebookOrder}
        />
        <div className="hidden sm:block w-px bg-border self-stretch" />
        <ThumbsRating
          courseSlug={courseSlug}
          podSlug={podSlug}
          contentType={contentType}
          notebookOrder={notebookOrder}
        />
      </div>
    </div>
  );
}
