'use client';

import { useEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { codeToHtml } from 'shiki';
import ArcSpinner from '@/components/ArcSpinner';
import type { FileContent } from '@/hooks/useFileExplorer';

interface CodeViewerProps {
  selectedFile: string | null;
  fileContent: FileContent | null;
  fileLoading: boolean;
  fileError: string | null;
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
}: CodeViewerProps) {
  const highlightedRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [highlighted, setHighlighted] = useState<{ key: string; html: string | null } | null>(null);

  const isViewingLoadedFile = Boolean(fileContent && selectedFile === fileContent.path && !fileLoading);
  const displayedContent = isViewingLoadedFile ? fileContent?.content ?? '' : '';
  const highlightKey = isViewingLoadedFile && selectedFile
    ? `${selectedFile}:${displayedContent.length}:${displayedContent.slice(0, 64)}`
    : null;

  useEffect(() => {
    if (!selectedFile || !highlightKey) return;

    let cancelled = false;
    const timer = window.setTimeout(() => {
      codeToHtml(displayedContent || ' ', {
        lang: getLanguage(selectedFile),
        theme: 'vitesse-dark',
      })
        .then((html) => {
          if (!cancelled) setHighlighted({ key: highlightKey, html });
        })
        .catch(() => {
          if (!cancelled) setHighlighted({ key: highlightKey, html: null });
        });
    }, 80);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [selectedFile, displayedContent, highlightKey]);

  useEffect(() => {
    const target = textareaRef.current;
    const highlightedEl = highlightedRef.current;
    if (!target || !highlightedEl) return;
    highlightedEl.scrollTop = target.scrollTop;
    highlightedEl.scrollLeft = target.scrollLeft;
  }, [highlighted]);

  if (!selectedFile) return null;

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
      <div className="shrink-0 border-b border-white/5 bg-[#0d0d0d] px-3 py-2">
        <div className="min-w-0">
          <p className="text-[11px] text-neutral-500">
            {fileContent.truncated ? 'Large file preview is read-only' : 'Workspace file preview'}
          </p>
        </div>
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
          className="code-editor-highlight pointer-events-none absolute inset-0 overflow-hidden whitespace-pre p-2 font-mono text-xs leading-5 [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!font-mono [&_pre]:!text-xs [&_pre]:!leading-5 [&_pre]:!whitespace-pre"
          style={{ tabSize: 2 }}
        >
          {highlighted?.key === highlightKey && highlighted.html ? (
            <div dangerouslySetInnerHTML={{ __html: highlighted.html }} />
          ) : (
            <pre className="whitespace-pre text-neutral-300">{displayedContent}</pre>
          )}
        </div>
        <textarea
          ref={textareaRef}
          value={displayedContent}
          onScroll={handleEditorScroll}
          readOnly
          wrap="off"
          className="code-editor-input absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent p-2 font-mono text-xs leading-5 text-transparent caret-white selection:bg-primary/30 focus:outline-none disabled:cursor-default"
          style={{ tabSize: 2 }}
          spellCheck={false}
          aria-label={`${selectedFile} source preview`}
        />
      </div>
    </div>
  );
}
