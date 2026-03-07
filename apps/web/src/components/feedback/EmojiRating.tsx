'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/hooks/useFeedback';
import type { ContentType } from '@/types/feedback';

const EMOJI_SCALE = [
  { value: 1, emoji: '😕', label: 'Confused' },
  { value: 2, emoji: '😐', label: 'Meh' },
  { value: 3, emoji: '🙂', label: 'Okay' },
  { value: 4, emoji: '😊', label: 'Good' },
  { value: 5, emoji: '🤩', label: 'Amazing' },
];

interface EmojiRatingProps {
  courseSlug?: string;
  podSlug?: string;
  contentType: 'article' | 'notebook';
  notebookOrder?: number;
}

export default function EmojiRating({ courseSlug, podSlug, contentType, notebookOrder }: EmojiRatingProps) {
  const { user } = useAuth();
  const { submit, checkExisting } = useFeedback();
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    checkExisting({ type: 'emoji', courseSlug, podSlug, contentType, notebookOrder }).then((rec) => {
      if (rec?.rating != null) setSelected(rec.rating);
    });
  }, [user, courseSlug, podSlug, contentType, notebookOrder, checkExisting]);

  if (!user) return null;

  const handleClick = async (value: number) => {
    setSelected(value);
    await submit({ type: 'emoji', courseSlug, podSlug, contentType: contentType as ContentType, notebookOrder, rating: value });
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-neutral-400 uppercase tracking-wider">Rate this</p>
      <div className="flex gap-2">
        {EMOJI_SCALE.map(({ value, emoji, label }) => (
          <button
            key={value}
            onClick={() => handleClick(value)}
            title={label}
            className={`text-2xl transition-all duration-150 cursor-pointer rounded-lg p-1.5 ${
              selected === value
                ? 'bg-amber-500/20 scale-110'
                : 'opacity-60 hover:opacity-100 hover:scale-105'
            }`}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
