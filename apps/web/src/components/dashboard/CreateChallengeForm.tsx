'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CreateChallengeForm() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [timeLimit, setTimeLimit] = useState(60);
  const [starterFilesDir, setStarterFilesDir] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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
          starter_files_dir: starterFilesDir || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to create challenge');
        return;
      }

      const challenge = await res.json();
      router.push(`/dashboard/challenges/${challenge.id}`);
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
        <label className="block text-sm font-medium text-slate-300 mb-2">Challenge Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
          placeholder="e.g., Build a REST API with Claude"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Description</label>
        <p className="text-xs text-slate-500 mb-2">
          Describe the challenge in detail. This will be shown to candidates before they start. Supports markdown.
        </p>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={10}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent font-mono text-sm"
          placeholder={"## Objective\nBuild a...\n\n## Requirements\n- ...\n- ...\n\n## Evaluation Criteria\n- How you break down the problem\n- How you collaborate with the AI assistant"}
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Time Limit (minutes)</label>
        <input
          type="number"
          value={timeLimit}
          onChange={(e) => setTimeLimit(parseInt(e.target.value) || 60)}
          min={15}
          max={180}
          className="w-32 bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-300 mb-2">Starter Files Directory <span className="text-slate-500">(optional)</span></label>
        <p className="text-xs text-slate-500 mb-2">
          Path to a directory (relative to project root) containing files to pre-populate the candidate&apos;s workspace.
        </p>
        <input
          type="text"
          value={starterFilesDir}
          onChange={(e) => setStarterFilesDir(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-3 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent font-mono text-sm"
          placeholder="e.g., challenges/fix-the-pipeline"
        />
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-cyan-600 hover:bg-cyan-500 disabled:bg-cyan-800 disabled:cursor-not-allowed text-white font-medium px-6 py-3 rounded-lg transition-colors"
      >
        {loading ? 'Creating...' : 'Create Challenge'}
      </button>
    </form>
  );
}
