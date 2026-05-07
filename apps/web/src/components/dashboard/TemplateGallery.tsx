'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import type { TemplateConfig } from '@/lib/templates';

const difficultyColors: Record<string, string> = {
  beginner: 'bg-green-500/10 text-green-400 border-green-500/20',
  intermediate: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  advanced: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  expert: 'bg-red-500/10 text-red-400 border-red-500/20',
};

export default function TemplateGallery() {
  const router = useRouter();
  const [templates, setTemplates] = useState<TemplateConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/templates')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load templates');
        return res.json();
      })
      .then(setTemplates)
      .catch(() => setError('Failed to load templates'))
      .finally(() => setLoading(false));
  }, []);

  async function handleUseTemplate(slug: string) {
    setLoadingSlug(slug);
    setError('');

    try {
      const res = await fetch(`/api/templates/${slug}`);
      if (!res.ok) throw new Error('Failed to load template');

      const data = await res.json();

      sessionStorage.setItem(
        'prefill_challenge',
        JSON.stringify({
          title: data.title,
          description: data.full_description || data.description,
          timeLimit: data.time_limit_min,
          starterFiles: data.files,
        })
      );

      router.push(`/dashboard/challenges/new?tab=manual&prefill=true&t=${Date.now()}`);
    } catch {
      setError('Failed to load template files. Please try again.');
    } finally {
      setLoadingSlug(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-white mb-2">Challenge Templates</h2>
        <p className="text-neutral-500">
          Pre-built challenges ready to use. Pick a template to customize it before creating.
        </p>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm mb-6">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {templates.map((template) => {
          const colorClass = difficultyColors[template.difficulty] || difficultyColors.intermediate;
          const isLoading = loadingSlug === template.slug;

          return (
            <div
              key={template.slug}
              className="bg-surface border border-white/10 rounded-xl p-5 hover:border-white/15 transition-all flex flex-col"
            >
              <div className="flex items-start gap-2 mb-3">
                <h3 className="text-base font-semibold text-white flex-1 leading-tight">
                  {template.title}
                </h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${colorClass}`}>
                  {template.difficulty}
                </span>
              </div>

              <p className="text-neutral-500 text-sm leading-relaxed mb-4 flex-1">
                {template.description}
              </p>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {template.tags.map((tag) => (
                  <span
                    key={tag}
                    className="px-2 py-0.5 bg-white/5 text-neutral-500 rounded text-xs"
                  >
                    {tag}
                  </span>
                ))}
                <span className="px-2 py-0.5 bg-white/5 text-neutral-600 rounded text-xs">
                  {template.time_limit_min} min
                </span>
              </div>

              <button
                onClick={() => handleUseTemplate(template.slug)}
                disabled={loadingSlug !== null}
                className="w-full bg-primary hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold py-2.5 rounded-lg text-sm transition-all"
              >
                {isLoading ? 'Loading...' : 'Use Template'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
