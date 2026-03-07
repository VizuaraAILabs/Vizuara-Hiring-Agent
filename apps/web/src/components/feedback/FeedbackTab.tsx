'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useFeedback } from '@/hooks/useFeedback';
import type { FeedbackCategory } from '@/types/feedback';

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'bug', label: 'Bug Report' },
  { value: 'content', label: 'Content Issue' },
  { value: 'other', label: 'Other' },
];

export default function FeedbackTab() {
  const { user } = useAuth();
  const { submit } = useFeedback();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('suggestion');
  const [comment, setComment] = useState('');
  const [thanking, setThanking] = useState(false);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!user) return null;

  const handleSubmit = async () => {
    if (!comment.trim()) return;
    await submit({ type: 'general', category, comment, pageUrl: window.location.href });
    setThanking(true);
    setTimeout(() => {
      setThanking(false);
      setOpen(false);
      setComment('');
      setCategory('suggestion');
    }, 2000);
  };

  return (
    <>
      {/* Fixed tab */}
      <button
        onClick={() => setOpen(true)}
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 cursor-pointer"
        aria-label="Open feedback"
      >
        <span
          className="block bg-surface border border-border text-neutral-300 text-xs font-medium px-3 py-2 rounded-l-lg hover:bg-surface-light hover:text-white transition-colors duration-150"
          style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
        >
          Feedback
        </span>
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Slide-out panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-sm z-50 bg-surface border-l border-border flex flex-col transition-transform duration-300 ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-sm font-semibold text-white">Send Feedback</h2>
          <button
            onClick={() => setOpen(false)}
            className="text-neutral-400 hover:text-white transition-colors cursor-pointer text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5">
          {thanking ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
              <span className="text-3xl">🎉</span>
              <p className="text-sm font-medium text-white">Thanks for your feedback!</p>
            </div>
          ) : (
            <>
              {/* Category selector */}
              <div>
                <p className="text-xs text-neutral-400 mb-2 uppercase tracking-wider">Category</p>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map(({ value, label }) => (
                    <button
                      key={value}
                      onClick={() => setCategory(value)}
                      className={`text-sm px-3 py-1.5 rounded-lg border transition-all duration-150 cursor-pointer ${
                        category === value
                          ? 'bg-primary/20 border-primary text-primary'
                          : 'border-border text-neutral-400 hover:border-border-light hover:text-neutral-200'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Comment textarea */}
              <div className="flex flex-col gap-2">
                <p className="text-xs text-neutral-400 uppercase tracking-wider">Your feedback</p>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us what you think..."
                  rows={6}
                  className="w-full bg-surface-light border border-border rounded-lg px-3 py-2.5 text-sm text-neutral-200 placeholder:text-neutral-600 resize-none focus:outline-none focus:border-primary"
                />
              </div>

              <button
                onClick={handleSubmit}
                disabled={!comment.trim()}
                className="w-full bg-primary hover:bg-primary-light disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium py-2.5 rounded-lg transition-colors duration-150 cursor-pointer"
              >
                Submit Feedback
              </button>
            </>
          )}
        </div>
      </div>
    </>
  );
}
