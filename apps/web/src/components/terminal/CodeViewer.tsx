'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, UIEvent } from 'react';
import { codeToHtml } from 'shiki';
import ArcSpinner from '@/components/ArcSpinner';
import type { FileContent } from '@/hooks/useFileExplorer';

interface CodeViewerProps {
  selectedFile: string | null;
  fileContent: FileContent | null;
  fileLoading: boolean;
  fileError: string | null;
  onSave: (filePath: string, content: string) => Promise<void>;
}

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
    c: 'c', cpp: 'cpp', cs: 'csharp', php: 'php', swift: 'swift',
    kt: 'kotlin', sh: 'bash', bash: 'bash', zsh: 'bash',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    html: 'html', css: 'css', scss: 'scss', md: 'markdown',
    sql: 'sql', dockerfile: 'dockerfile', xml: 'xml',
  };
  if (filename.toLowerCase() === 'dockerfile') return 'dockerfile';
  return map[ext] ?? 'text';
}

export default function CodeViewer({
  selectedFile,
  fileContent,
  fileLoading,
  fileError,
  onSave,
}: CodeViewerProps) {
  const highlightedRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState('');
  const [highlighted, setHighlighted] = useState<{ key: string; html: string | null } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const originalContent = fileContent?.content ?? '';
  const isDirty = Boolean(fileContent && draft !== originalContent);
  const canEdit = Boolean(fileContent && !fileContent.truncated);
  const highlightKey = selectedFile ? `${selectedFile}:${draft.length}:${draft.slice(0, 64)}` : null;

  useEffect(() => {
    setDraft(fileContent?.content ?? '');
    setSaveError(null);
  }, [fileContent?.path, fileContent?.content]);

  useEffect(() => {
    if (!selectedFile || !highlightKey) return;

    let cancelled = false;
    codeToHtml(draft || ' ', {
      lang: getLanguage(selectedFile),
      theme: 'vitesse-dark',
    })
      .then((html) => {
        if (!cancelled) setHighlighted({ key: highlightKey, html });
      })
      .catch(() => {
        if (!cancelled) setHighlighted({ key: highlightKey, html: null });
      });

    return () => {
      cancelled = true;
    };
  }, [selectedFile, draft, highlightKey]);

  if (!selectedFile) return null;

  async function handleSave() {
    if (!selectedFile || !canEdit || !isDirty || saving) return;

    setSaving(true);
    setSaveError(null);
    try {
      await onSave(selectedFile, draft);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      void handleSave();
      return;
    }

    if (event.key !== 'Tab') return;
    event.preventDefault();
    const target = event.currentTarget;
    const start = target.selectionStart;
    const end = target.selectionEnd;
    const nextDraft = `${draft.slice(0, start)}  ${draft.slice(end)}`;
    setDraft(nextDraft);
    requestAnimationFrame(() => {
      target.selectionStart = start + 2;
      target.selectionEnd = start + 2;
    });
  }

  function handleEditorScroll(event: UIEvent<HTMLTextAreaElement>) {
    if (!highlightedRef.current) return;
    highlightedRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightedRef.current.scrollLeft = event.currentTarget.scrollLeft;
  }

  if (fileLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <ArcSpinner label="Rendering file" sizeClassName="h-8 w-8" />
      </div>
    );
  }

  if (fileError) {
    return (
      <div className="flex items-center justify-center h-full px-3">
        <p className="text-red-400 text-xs text-center">{fileError}</p>
      </div>
    );
  }

  if (!fileContent) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between gap-3 border-b border-white/5 bg-[#0d0d0d] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] text-neutral-500">
            {canEdit ? 'Editable workspace file' : 'Large file preview is read-only'}
          </p>
          {saveError && <p className="mt-0.5 text-[11px] text-red-400">{saveError}</p>}
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canEdit || !isDirty || saving}
          className="shrink-0 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/15 hover:text-primary-light disabled:cursor-not-allowed disabled:border-white/5 disabled:bg-white/2 disabled:text-neutral-700"
        >
          {saving ? 'Saving...' : isDirty ? 'Save' : 'Saved'}
        </button>
      </div>

      {fileContent.truncated && (
        <div className="shrink-0 px-3 py-1 bg-amber-900/30 border-b border-amber-700/30">
          <span className="text-xs text-amber-400">
            File truncated - showing first 500KB of {(fileContent.size / 1024).toFixed(0)}KB
          </span>
        </div>
      )}

      <div className="relative flex-1 min-h-0 bg-[#0d0d0d]">
        <div
          ref={highlightedRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-auto p-2 font-mono text-xs leading-relaxed [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!font-mono [&_pre]:!text-xs [&_pre]:!leading-relaxed"
        >
          {highlighted?.key === highlightKey && highlighted.html ? (
            <div dangerouslySetInnerHTML={{ __html: highlighted.html }} />
          ) : (
            <pre className="whitespace-pre text-neutral-300">{draft}</pre>
          )}
        </div>
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onScroll={handleEditorScroll}
          readOnly={!canEdit}
          className="absolute inset-0 h-full w-full resize-none overflow-auto bg-transparent p-2 font-mono text-xs leading-relaxed text-transparent caret-white selection:bg-primary/30 focus:outline-none disabled:cursor-default"
          spellCheck={false}
          aria-label={`${selectedFile} source editor`}
        />
      </div>
    </div>
  );
}
