'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import StarterFilesEditor from '@/components/dashboard/StarterFilesEditor';
import type { StarterFile } from '@/types';

export default function StarterFilesPage() {
  const params = useParams();
  const id = params.id as string;

  const [files, setFiles] = useState<StarterFile[]>([]);
  const [savedFiles, setSavedFiles] = useState<StarterFile[]>([]);
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeDescription, setChallengeDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);

  const hasUnsavedChanges = JSON.stringify(files) !== JSON.stringify(savedFiles);

  useEffect(() => {
    async function fetchChallenge() {
      try {
        const res = await fetch(`/api/challenges/${id}`);
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Failed to load challenge (${res.status})`);
        }
        const data = await res.json();
        const starterFiles = (data.starter_files || []).filter((f: { path?: string }) => f.path);
        setFiles(starterFiles);
        setSavedFiles(starterFiles);
        setChallengeTitle(data.title || '');
        setChallengeDescription(data.description || '');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load challenge');
      } finally {
        setLoading(false);
      }
    }
    fetchChallenge();
  }, [id]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    setSaveSuccess(false);

    try {
      const res = await fetch(`/api/challenges/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ starter_files: files }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save');
      }

      setSavedFiles([...files]);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }, [id, files]);

  // Ctrl+S / Cmd+S to save
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (hasUnsavedChanges && !saving) handleSave();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, hasUnsavedChanges, saving]);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      if (hasUnsavedChanges) {
        e.preventDefault();
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-4rem)]">
        <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/challenges/${id}`}
            className="text-neutral-500 hover:text-white text-sm transition-colors"
          >
            &larr; Back to challenge
          </Link>
          <span className="text-white font-medium text-sm truncate max-w-md">
            {challengeTitle}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <span className="text-xs text-yellow-500">Unsaved changes</span>
          )}
          {saveSuccess && (
            <span className="text-xs text-primary">Saved!</span>
          )}
          {error && (
            <span className="text-xs text-red-400">{error}</span>
          )}
          <button
            onClick={handleSave}
            disabled={saving || !hasUnsavedChanges}
            className="bg-primary hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed text-black font-semibold px-5 py-2 rounded-lg text-sm transition-all"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Editor fills remaining space */}
      <div className="flex-1 min-h-0">
        <StarterFilesEditor
          files={files}
          onChange={setFiles}
          challengeTitle={challengeTitle}
          challengeDescription={challengeDescription}
          mode="full"
        />
      </div>
    </div>
  );
}
