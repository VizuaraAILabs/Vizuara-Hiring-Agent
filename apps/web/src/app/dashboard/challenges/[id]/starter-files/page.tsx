'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import StarterFilesEditor from '@/components/dashboard/StarterFilesEditor';
import type { StarterFile } from '@/types';

export default function StarterFilesPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [files, setFiles] = useState<StarterFile[]>([]);
  const [savedFiles, setSavedFiles] = useState<StarterFile[]>([]);
  const [challengeTitle, setChallengeTitle] = useState('');
  const [challengeDescription, setChallengeDescription] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);

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
        const raw = data.starter_files;
        const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
        const starterFiles = (parsed || []).filter((f: { path?: string }) => f.path);
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

  function handleBack() {
    if (hasUnsavedChanges) {
      setShowLeaveModal(true);
    } else {
      router.push(`/dashboard/challenges/${id}`);
    }
  }

  function handleLeaveWithoutSaving() {
    setShowLeaveModal(false);
    router.push(`/dashboard/challenges/${id}`);
  }

  async function handleSaveAndLeave() {
    setShowLeaveModal(false);
    await handleSave();
    router.push(`/dashboard/challenges/${id}`);
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Top bar */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={handleBack}
            className="text-neutral-500 hover:text-white text-sm transition-colors"
          >
            &larr; Back to challenge
          </button>
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

      {/* Unsaved changes modal */}
      {showLeaveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-surface border border-white/10 rounded-2xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-white font-semibold text-lg mb-2">Unsaved Changes</h3>
            <p className="text-neutral-400 text-sm mb-6">
              You have unsaved changes. Would you like to save before leaving?
            </p>
            <div className="flex gap-3">
              <button
                onClick={handleLeaveWithoutSaving}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-neutral-400 border border-white/10 hover:bg-white/5 transition-colors"
              >
                Discard
              </button>
              <button
                onClick={() => setShowLeaveModal(false)}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white border border-white/10 hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAndLeave}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-black bg-primary hover:bg-primary-light transition-colors"
              >
                Save & Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
