'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { GeneratedChallenge } from './types';

const difficultyColors: Record<string, string> = {
  beginner: 'bg-green-500/10 text-green-400 border-green-500/20',
  intermediate: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  advanced: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  expert: 'bg-red-500/10 text-red-400 border-red-500/20',
};

interface StepResultsProps {
  challenges: GeneratedChallenge[];
  onRegenerate: () => void;
  onBack: () => void;
}

export default function StepResults({ challenges, onRegenerate, onBack }: StepResultsProps) {
  const router = useRouter();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [expandedWhy, setExpandedWhy] = useState<number | null>(null);
  const [creatingIndex, setCreatingIndex] = useState<number | null>(null);
  const [error, setError] = useState('');

  async function handleUseChallenge(challenge: GeneratedChallenge, index: number) {
    setCreatingIndex(index);
    setError('');

    try {
      // Auto-generate starter files (non-fatal if it fails)
      let starterFiles;
      try {
        setError('Generating starter files...');
        const genRes = await fetch('/api/challenges/generate-files', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: challenge.title, description: challenge.description }),
        });
        if (genRes.ok) {
          const genData = await genRes.json();
          if (genData.files?.length > 0) starterFiles = genData.files;
        }
      } catch {
        // Non-fatal: continue without starter files
      }
      setError('');

      const res = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: challenge.title,
          description: challenge.description,
          time_limit_min: challenge.duration_minutes,
          starter_files: starterFiles,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create challenge');
        return;
      }

      const created = await res.json();
      router.push(`/dashboard/challenges/${created.id}`);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setCreatingIndex(null);
    }
  }

  async function handleCustomize(challenge: GeneratedChallenge) {
    // Try to pre-generate starter files for the customize form
    let starterFiles;
    try {
      const genRes = await fetch('/api/challenges/generate-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: challenge.title, description: challenge.description }),
      });
      if (genRes.ok) {
        const genData = await genRes.json();
        if (genData.files?.length > 0) starterFiles = genData.files;
      }
    } catch {
      // Non-fatal
    }

    sessionStorage.setItem(
      'prefill_challenge',
      JSON.stringify({
        title: challenge.title,
        description: challenge.description,
        timeLimit: challenge.duration_minutes,
        starterFiles,
      })
    );
    router.push('/dashboard/challenges/new?tab=manual&prefill=true');
  }

  function getDescriptionPreview(description: string) {
    const lines = description.split('\n').filter((l) => l.trim());
    return lines.slice(0, 4).join('\n');
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white mb-2">Generated Challenges</h2>
        <p className="text-neutral-500">
          {challenges.length} challenges tailored to your requirements. Use one directly or customize it first.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      <div className="space-y-4 mb-8">
        {challenges.map((challenge, i) => {
          const isExpanded = expandedIndex === i;
          const isWhyExpanded = expandedWhy === i;
          const colorClass = difficultyColors[challenge.difficulty] || difficultyColors.intermediate;

          return (
            <div
              key={i}
              className="bg-[#111] border border-white/10 rounded-xl p-6 hover:border-white/15 transition-all"
            >
              {/* Header */}
              <div className="flex flex-wrap items-start gap-3 mb-3">
                <h3 className="text-lg font-semibold text-white flex-1">{challenge.title}</h3>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${colorClass}`}>
                  {challenge.difficulty}
                </span>
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-white/5 text-neutral-400 border border-white/10">
                  {challenge.duration_minutes} min
                </span>
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {challenge.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-white/5 text-neutral-500 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              {/* Description */}
              <div className="mb-4">
                <pre className="text-neutral-400 text-sm whitespace-pre-wrap font-sans leading-relaxed">
                  {isExpanded ? challenge.description : getDescriptionPreview(challenge.description)}
                </pre>
                <button
                  type="button"
                  onClick={() => setExpandedIndex(isExpanded ? null : i)}
                  className="text-[#00a854] text-sm mt-2 hover:underline"
                >
                  {isExpanded ? 'Show less' : 'Show full description'}
                </button>
              </div>

              {/* Why iterative */}
              {challenge.why_iterative && (
                <div className="mb-4">
                  <button
                    type="button"
                    onClick={() => setExpandedWhy(isWhyExpanded ? null : i)}
                    className="text-sm text-neutral-500 hover:text-neutral-300 transition-colors flex items-center gap-1"
                  >
                    <span className={`inline-block transition-transform ${isWhyExpanded ? 'rotate-90' : ''}`}>
                      &#9656;
                    </span>
                    Why this tests AI collaboration
                  </button>
                  {isWhyExpanded && (
                    <p className="text-sm text-neutral-500 mt-2 pl-4 border-l border-white/10">
                      {challenge.why_iterative}
                    </p>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2 border-t border-white/5">
                <button
                  onClick={() => handleUseChallenge(challenge, i)}
                  disabled={creatingIndex !== null}
                  className="bg-[#00a854] hover:bg-[#00c96b] disabled:opacity-50 text-black font-semibold px-5 py-2.5 rounded-lg text-sm transition-all"
                >
                  {creatingIndex === i ? 'Creating...' : 'Use This Challenge'}
                </button>
                <button
                  onClick={() => handleCustomize(challenge)}
                  disabled={creatingIndex !== null}
                  className="px-5 py-2.5 border border-white/10 text-neutral-400 rounded-lg text-sm hover:text-white hover:border-white/20 transition-all"
                >
                  Customize First
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom controls */}
      <div className="flex items-center gap-4">
        <button
          onClick={onRegenerate}
          className="px-5 py-3 bg-[#111] border border-white/10 text-neutral-400 rounded-xl hover:text-white hover:border-white/20 transition-all"
        >
          Regenerate
        </button>
        <button
          onClick={onBack}
          className="text-neutral-500 hover:text-neutral-300 text-sm transition-colors"
        >
          Back to Settings
        </button>
      </div>
    </div>
  );
}
