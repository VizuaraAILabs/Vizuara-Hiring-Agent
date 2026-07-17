'use client';

import { useEffect, useRef, useState } from 'react';
import type { UIEvent } from 'react';
import { Download } from 'lucide-react';
import { codeToHtml } from 'shiki';
import ArcSpinner from '@/components/ArcSpinner';
import type { FileNode, WorkspaceSnapshot, WorkspaceFile } from '@/types';

interface WorkspaceViewerProps {
  snapshot: WorkspaceSnapshot | null;
  loading: boolean;
  error: string | null;
  sessionId: string;
}

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript',
    tsx: 'tsx',
    js: 'javascript',
    jsx: 'jsx',
    py: 'python',
    rb: 'ruby',
    rs: 'rust',
    go: 'go',
    java: 'java',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    php: 'php',
    swift: 'swift',
    kt: 'kotlin',
    sh: 'bash',
    bash: 'bash',
    zsh: 'bash',
    json: 'json',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    html: 'html',
    css: 'css',
    scss: 'scss',
    md: 'markdown',
    sql: 'sql',
    dockerfile: 'dockerfile',
    xml: 'xml',
  };
  if (filename.toLowerCase() === 'dockerfile') return 'dockerfile';
  return map[ext] ?? 'text';
}

function TreeNode({
  node,
  selectedPath,
  onSelect,
  depth,
}: {
  node: FileNode;
  selectedPath: string | null;
  onSelect: (path: string) => void;
  depth: number;
}) {
  const [expanded, setExpanded] = useState(depth === 0);
  const indent = 8 + depth * 12;

  if (node.type === 'directory') {
    return (
      <div>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1.5 w-full text-left py-1 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 text-xs cursor-pointer transition-colors"
          style={{ paddingLeft: `${indent}px`, paddingRight: '8px' }}
        >
          <span className="text-neutral-600 shrink-0">{expanded ? 'v' : '>'}</span>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded &&
          node.children?.map((child) => (
            <TreeNode
              key={child.path}
              node={child}
              selectedPath={selectedPath}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={`flex items-center gap-1.5 w-full text-left py-1 rounded-lg text-xs cursor-pointer transition-colors ${
        selectedPath === node.path
          ? 'bg-white/10 text-white'
          : 'text-neutral-400 hover:text-white hover:bg-white/5'
      }`}
      style={{ paddingLeft: `${indent}px`, paddingRight: '8px' }}
    >
      <span className="text-neutral-700 shrink-0">.</span>
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export default function WorkspaceViewer({ snapshot, loading, error, sessionId }: WorkspaceViewerProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [zipDownloading, setZipDownloading] = useState(false);
  const [zipError, setZipError] = useState<string | null>(null);
  const highlightedViewerRef = useRef<HTMLDivElement>(null);
  const viewerTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [highlightedCode, setHighlightedCode] = useState<{ key: string; html: string | null } | null>(null);

  const files = snapshot?.files ?? [];
  const tree = snapshot?.tree ?? [];
  const archivedAt = new Date(snapshot?.archived_at ?? '');
  const archivedAtLabel = Number.isNaN(archivedAt.getTime())
    ? 'Archive date unavailable'
    : archivedAt.toLocaleString();

  const selectedFile: WorkspaceFile | undefined = selectedPath
    ? files.find((f) => f.path === selectedPath)
    : undefined;
  const highlightKey = selectedFile
    ? `${selectedFile.path}:${selectedFile.content.length}:${selectedFile.content.slice(0, 64)}`
    : null;

  useEffect(() => {
    if (!selectedFile || !highlightKey) {
      return;
    }

    let cancelled = false;
    codeToHtml(selectedFile.content || ' ', {
      lang: getLanguage(selectedFile.path),
      theme: 'vitesse-dark',
    })
      .then((html) => {
        if (!cancelled) setHighlightedCode({ key: highlightKey, html });
      })
      .catch(() => {
        if (!cancelled) setHighlightedCode({ key: highlightKey, html: null });
      });

    return () => {
      cancelled = true;
    };
  }, [highlightKey, selectedFile]);

  useEffect(() => {
    const target = viewerTextareaRef.current;
    const highlightedEl = highlightedViewerRef.current;
    if (!target || !highlightedEl) return;
    highlightedEl.scrollTop = target.scrollTop;
    highlightedEl.scrollLeft = target.scrollLeft;
  }, [highlightedCode]);

  const handleCodeScroll = (event: UIEvent<HTMLTextAreaElement>) => {
    if (!highlightedViewerRef.current) return;
    highlightedViewerRef.current.scrollTop = event.currentTarget.scrollTop;
    highlightedViewerRef.current.scrollLeft = event.currentTarget.scrollLeft;
  };

  const handleDownloadZip = async () => {
    if (files.length === 0 || zipDownloading) return;

    setZipDownloading(true);
    setZipError(null);
    try {
      const response = await fetch(`/api/analysis/${sessionId}/workspace/download`);
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Failed to download workspace files.');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `workspace-${sessionId}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setZipError(err instanceof Error ? err.message : 'Failed to download workspace files.');
    } finally {
      setZipDownloading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-surface border border-white/5 rounded-2xl p-12 flex flex-col items-center gap-4">
        <ArcSpinner label="Loading workspace files" sizeClassName="h-10 w-10" />
        <p className="text-neutral-500 text-sm">Loading workspace files...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface border border-white/5 rounded-2xl p-12 flex flex-col items-center gap-3">
        <p className="text-neutral-500 text-sm">{error}</p>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="bg-surface border border-white/5 rounded-2xl p-12 flex flex-col items-center gap-3">
        <p className="text-neutral-500 text-sm">No workspace files available for this session.</p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-white/5 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div>
          <h3 className="text-lg font-semibold text-white">Workspace Files</h3>
          <p className="text-xs text-neutral-600 mt-0.5">
            {files.length} file{files.length !== 1 ? 's' : ''} archived
            {' · '}
            {archivedAtLabel}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <button
            type="button"
            onClick={handleDownloadZip}
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium transition-colors ${
              files.length === 0 || zipDownloading
                ? 'cursor-not-allowed border-white/5 bg-white/2 text-neutral-700'
                : 'border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10 hover:text-white'
            }`}
            disabled={files.length === 0 || zipDownloading}
          >
            {zipDownloading ? (
              <ArcSpinner label="Downloading ZIP" sizeClassName="h-4 w-4" />
            ) : (
              <Download size={16} />
            )}
            {zipDownloading ? 'Downloading...' : 'Download ZIP'}
          </button>
          {zipDownloading && (
            <p className="text-xs text-neutral-600 text-right">This may take a few minutes</p>
          )}
          {zipError && (
            <p className="text-xs text-amber-300 text-right max-w-55">{zipError}</p>
          )}
        </div>
      </div>

      <div className="flex h-150">
        <div className="w-56 shrink-0 border-r border-white/5 overflow-y-auto p-2">
          {tree.length === 0 ? (
            <p className="text-neutral-700 text-xs px-2 py-3">No files</p>
          ) : (
            tree.map((node) => (
              <TreeNode
                key={node.path}
                node={node}
                selectedPath={selectedPath}
                onSelect={setSelectedPath}
                depth={0}
              />
            ))
          )}
        </div>

        <div className="flex-1 min-w-0">
          {!selectedFile ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-neutral-600 text-sm">Select a file to view its contents</p>
            </div>
          ) : (
            <div className="flex h-full min-w-0 flex-col">
              <div className="shrink-0 border-b border-white/5 px-4 py-3">
                <p className="text-xs text-neutral-600 font-mono">{selectedFile.path}</p>
              </div>
              {selectedFile.truncated && (
                <div className="shrink-0 px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-400">
                  File was truncated at 500KB - only the first portion is shown.
                </div>
              )}
              <div className="relative flex-1 min-h-0 bg-[#0a0a0a]">
                <div
                  ref={highlightedViewerRef}
                  aria-hidden="true"
                  className="code-editor-highlight pointer-events-none absolute inset-0 overflow-hidden whitespace-pre p-4 font-mono text-xs leading-5 [&_pre]:!m-0 [&_pre]:!bg-transparent [&_pre]:!p-0 [&_pre]:!font-mono [&_pre]:!text-xs [&_pre]:!leading-5 [&_pre]:!whitespace-pre"
                  style={{ tabSize: 2 }}
                >
                  {highlightedCode?.key === highlightKey && highlightedCode.html ? (
                    <div dangerouslySetInnerHTML={{ __html: highlightedCode.html }} />
                  ) : (
                    <pre className="whitespace-pre text-neutral-300">{selectedFile.content}</pre>
                  )}
                </div>
                <textarea
                  ref={viewerTextareaRef}
                  value={selectedFile.content}
                  onChange={() => undefined}
                  onScroll={handleCodeScroll}
                  readOnly
                  wrap="off"
                  className="code-editor-input absolute inset-0 h-full w-full resize-none overflow-auto whitespace-pre bg-transparent p-4 font-mono text-xs leading-5 text-transparent caret-white selection:bg-primary/30 focus:outline-none"
                  style={{ tabSize: 2 }}
                  spellCheck={false}
                  aria-label={`${selectedFile.path} read-only source`}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
