'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/hooks/useFeedback';
import type { ContentType, FeedbackTag } from '@/types/feedback';

const TAG_OPTIONS: { value: FeedbackTag; label: string }[] = [
  { value: 'great_examples', label: 'Great examples' },
  { value: 'needs_more_code', label: 'Needs more code' },
  { value: 'too_easy', label: 'Too easy' },
  { value: 'too_hard', label: 'Too hard' },
  { value: 'confusing', label: 'Confusing' },
];

interface ThumbsRatingProps {
  courseSlug?: string;
  podSlug?: string;
  contentType: 'article' | 'notebook';
  notebookOrder?: number;
}

export default function ThumbsRating({ courseSlug, podSlug, contentType, notebookOrder }: ThumbsRatingProps) {
  const { user } = useAuth();
  const { submit, checkExisting } = useFeedback();
  const [thumb, setThumb] = useState<0 | 1 | null>(null); // 1=up, 0=down
  const [tags, setTags] = useState<FeedbackTag[]>([]);
  const [showTags, setShowTags] = useState(false);

  useEffect(() => {
    if (!user) return;
    checkExisting({ type: 'thumbs', courseSlug, podSlug, contentType, notebookOrder }).then((rec) => {
      if (rec?.rating != null) {
        setThumb(rec.rating as 0 | 1);
        setTags((rec.tags ?? []) as FeedbackTag[]);
        setShowTags(true);
      }
    });
  }, [user, courseSlug, podSlug, contentType, notebookOrder, checkExisting]);

  if (!user) return null;

  const handleThumb = async (value: 0 | 1) => {
    setThumb(value);
    setShowTags(true);
    await submit({
      type: 'thumbs',
      courseSlug,
      podSlug,
      contentType: contentType as ContentType,
      notebookOrder,
      rating: value,
      tags,
    });
  };

  const toggleTag = async (tag: FeedbackTag) => {
    const newTags = tags.includes(tag) ? tags.filter((t) => t !== tag) : [...tags, tag];
    setTags(newTags);
    await submit({
      type: 'thumbs',
      courseSlug,
      podSlug,
      contentType: contentType as ContentType,
      notebookOrder,
      rating: thumb ?? 1,
      tags: newTags,
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-neutral-400 uppercase tracking-wider">Helpful?</p>
      <div className="flex gap-2">
        <button
          onClick={() => handleThumb(1)}
          className={`text-xl px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
            thumb === 1 ? 'bg-green-500/20 text-green-400' : 'text-neutral-400 hover:text-white hover:bg-surface-light'
          }`}
        >
          👍
        </button>
        <button
          onClick={() => handleThumb(0)}
          className={`text-xl px-3 py-1.5 rounded-lg transition-all duration-150 cursor-pointer ${
            thumb === 0 ? 'bg-red-500/20 text-red-400' : 'text-neutral-400 hover:text-white hover:bg-surface-light'
          }`}
        >
          👎
        </button>
      </div>

      {showTags && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {TAG_OPTIONS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => toggleTag(value)}
              className={`text-xs px-2.5 py-1 rounded-full transition-all duration-150 cursor-pointer ${
                tags.includes(value)
                  ? 'bg-accent/20 text-accent border border-accent/40'
                  : 'border border-border text-neutral-400 hover:border-border-light hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
