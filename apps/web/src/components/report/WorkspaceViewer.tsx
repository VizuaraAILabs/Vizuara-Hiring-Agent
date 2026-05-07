'use client';

import { useState } from 'react';
import type { FileNode, WorkspaceSnapshot, WorkspaceFile } from '@/types';

interface WorkspaceViewerProps {
  snapshot: WorkspaceSnapshot | null;
  loading: boolean;
  error: string | null;
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
          <span className="text-neutral-600 shrink-0">{expanded ? '▾' : '▸'}</span>
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
      <span className="text-neutral-700 shrink-0">·</span>
      <span className="truncate">{node.name}</span>
    </button>
  );
}

export default function WorkspaceViewer({ snapshot, loading, error }: WorkspaceViewerProps) {
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="bg-surface border border-white/5 rounded-2xl p-12 flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-neutral-500 text-sm">Loading workspace files…</p>
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

  const files = snapshot.files ?? [];
  const tree = snapshot.tree ?? [];

  const selectedFile: WorkspaceFile | undefined = selectedPath
    ? files.find((f) => f.path === selectedPath)
    : undefined;

  return (
    <div className="bg-surface border border-white/5 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
        <div>
          <h3 className="text-lg font-semibold text-white">Workspace Files</h3>
          <p className="text-xs text-neutral-600 mt-0.5">
            {files.length} file{files.length !== 1 ? 's' : ''} archived
            {' · '}
            {new Date(snapshot.archived_at).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Two-panel layout */}
      <div className="flex h-150">
        {/* File tree sidebar */}
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

        {/* File content panel */}
        <div className="flex-1 overflow-auto">
          {!selectedFile ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-neutral-600 text-sm">Select a file to view its contents</p>
            </div>
          ) : (
            <div className="p-4">
              <p className="text-xs text-neutral-600 font-mono mb-3 px-1">{selectedFile.path}</p>
              {selectedFile.truncated && (
                <div className="mb-3 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-xs text-yellow-400">
                  File was truncated at 500KB — only the first portion is shown.
                </div>
              )}
              <pre className="text-xs text-neutral-300 font-mono leading-relaxed bg-white/5 rounded-xl p-4 overflow-auto whitespace-pre-wrap break-all">
                {selectedFile.content}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
