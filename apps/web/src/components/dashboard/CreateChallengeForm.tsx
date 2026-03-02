'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import StarterFilesEditor from './StarterFilesEditor';
import type { StarterFile } from '@/types';

export default function CreateChallengeForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimit, setTimeLimit] = useState(60);
  const [starterFiles, setStarterFiles] = useState<StarterFile[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const prefill = sessionStorage.getItem('prefill_challenge');
    if (prefill) {
      try {
        const data = JSON.parse(prefill);
        if (data.title) setTitle(data.title);
        if (data.description) setDescription(data.description);
        if (data.timeLimit) setTimeLimit(data.timeLimit);
        if (data.starterFiles) setStarterFiles(data.starterFiles);
      } catch {
        // ignore invalid JSON
      }
      sessionStorage.removeItem('prefill_challenge');
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          time_limit_min: timeLimit,
          starter_files: starterFiles.length > 0 ? starterFiles : undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create challenge');
        return;
      }

      const challenge = await res.json();
      router.push(`/dashboard/challenges/${challenge.id}/starter-files`);
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-2">Challenge Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 focus:border-[#00a854]/50 transition-all"
          placeholder="e.g., Build a REST API with Claude"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-2">Description</label>
        <p className="text-xs text-neutral-600 mb-2">
          Describe the challenge in detail. This will be shown to candidates before they start. Supports markdown.
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={10}
          className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-neutral-600 focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 focus:border-[#00a854]/50 font-mono text-sm transition-all"
          placeholder={"## Objective\nBuild a...\n\n## Requirements\n- ...\n- ...\n\n## Evaluation Criteria\n- How you break down the problem\n- How you collaborate with the AI assistant"}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-2">Time Limit (minutes)</label>
        <input
          type="number"
          value={timeLimit}
          onChange={(e) => setTimeLimit(parseInt(e.target.value) || 60)}
          min={15}
          max={180}
          className="w-32 bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-[#00a854]/50 focus:border-[#00a854]/50 transition-all"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-neutral-400 mb-2">
          Starter Files <span className="text-neutral-600">(optional)</span>
        </label>
        <p className="text-xs text-neutral-600 mb-2">
          Files to pre-populate the candidate&apos;s workspace. Generate them with AI or add manually.
        </p>
        <StarterFilesEditor
          files={starterFiles}
          onChange={setStarterFiles}
          challengeTitle={title}
          challengeDescription={description}
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-[#00a854] hover:bg-[#00c96b] disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold px-6 py-3 rounded-xl transition-all btn-glow"
      >
        {loading ? 'Creating...' : 'Create Challenge'}
      </button>
    </form>
  );
}
