'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/hooks/useFeedback';
import type { ContentType } from '@/types/feedback';

interface NpsPromptProps {
  courseSlug?: string;
  podSlug?: string;
  contentType: 'pod' | 'course';
}

function npsButtonColor(score: number, selected: number | null) {
  if (selected !== score) return 'bg-surface-light border border-border hover:border-border-light text-neutral-300';
  if (score <= 6) return 'bg-red-500 text-white border border-red-500';
  if (score <= 8) return 'bg-amber-500 text-white border border-amber-500';
  return 'bg-primary text-white border border-primary';
}

export default function NpsPrompt({ courseSlug, podSlug, contentType }: NpsPromptProps) {
  const { user } = useAuth();
  const { submit, checkExisting } = useFeedback();
  const [score, setScore] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [done, setDone] = useState(false);
  const [showComment, setShowComment] = useState(false);

  useEffect(() => {
    if (!user) return;
    checkExisting({ type: 'nps', courseSlug, podSlug, contentType }).then((rec) => {
      if (rec?.rating != null) {
        setScore(rec.rating);
        setComment(rec.comment ?? '');
        setShowComment(true);
        setDone(true);
      }
    });
  }, [user, courseSlug, podSlug, contentType, checkExisting]);

  if (!user) return null;

  const handleScore = async (value: number) => {
    setScore(value);
    setShowComment(true);
    await submit({ type: 'nps', courseSlug, podSlug, contentType: contentType as ContentType, rating: value });
  };

  const handleSubmit = async () => {
    if (score === null) return;
    await submit({ type: 'nps', courseSlug, podSlug, contentType: contentType as ContentType, rating: score, comment });
    setDone(true);
  };

  return (
    <div className="border border-border rounded-xl p-5 bg-surface">
      <h3 className="text-sm font-medium text-neutral-200 mb-1">How likely are you to recommend this?</h3>
      <p className="text-xs text-neutral-500 mb-4">On a scale of 1–10</p>

      <div className="flex gap-1.5 flex-wrap mb-2">
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            onClick={() => !done && handleScore(n)}
            disabled={done}
            className={`w-9 h-9 rounded-lg text-sm font-medium transition-all duration-150 cursor-pointer disabled:cursor-default ${npsButtonColor(n, score)}`}
          >
            {n}
          </button>
        ))}
      </div>

      <div className="flex justify-between text-xs text-neutral-500 mb-4 px-0.5">
        <span>Not likely</span>
        <span>Very likely</span>
      </div>

      {showComment && (
        <div className="mt-3 flex flex-col gap-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            disabled={done}
            placeholder="Any additional thoughts? (optional)"
            rows={3}
            className="w-full bg-surface-light border border-border rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:border-primary disabled:opacity-60 disabled:cursor-default"
          />
          {done ? (
            <p className="text-xs text-primary">Thank you for your feedback!</p>
          ) : (
            <button
              onClick={handleSubmit}
              className="self-start bg-primary hover:bg-primary-light text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors duration-150 cursor-pointer"
            >
              Submit
            </button>
          )}
        </div>
      )}
    </div>
  );
}
