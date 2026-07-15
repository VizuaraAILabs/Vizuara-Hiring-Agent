'use client';

import { FilePlus, Pencil, Trash2 } from 'lucide-react';
import type { FileNode } from '@/hooks/useFileExplorer';

const EXTENSION_LABELS: Record<string, string> = {
  '.js': 'JS', '.jsx': 'JSX', '.ts': 'TS', '.tsx': 'TSX',
  '.py': 'PY', '.rb': 'RB', '.go': 'GO', '.rs': 'RS',
  '.java': 'JV', '.json': '{}', '.md': 'MD', '.css': 'CSS',
  '.html': 'HTM', '.yml': 'YML', '.yaml': 'YML', '.sh': 'SH',
  '.sql': 'SQL', '.toml': 'TML',
};

function getExtLabel(name: string): string | null {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return null;
  const ext = name.slice(idx).toLowerCase();
  return EXTENSION_LABELS[ext] || null;
}

export interface FileTreeActions {
  onSelectFile: (path: string) => void;
  onCreateFile: (parentPath: string | null) => void;
  onRenamePath: (path: string, type: FileNode['type']) => void;
  onDeletePath: (path: string, type: FileNode['type']) => void;
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  selectedFile: string | null;
  actions: FileTreeActions;
}

export default function FileTreeNode({ node, depth, selectedFile, actions }: FileTreeNodeProps) {
  const isDir = node.type === 'directory';
  const isSelected = node.path === selectedFile;
  const paddingLeft = depth * 16 + 8;

  if (isDir) {
    return (
      <div>
        <div
          className="group w-full text-left flex items-center gap-1 py-0.5 text-xs text-neutral-300"
          style={{ paddingLeft }}
        >
          <svg className="w-3 h-3 text-neutral-600 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="6,8 10,12 14,8" />
          </svg>
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          <div className="mr-1 hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex">
            <button
              type="button"
              onClick={() => actions.onCreateFile(node.path)}
              className="rounded p-0.5 text-neutral-600 hover:bg-white/10 hover:text-neutral-300"
              title={`New file in ${node.name}`}
            >
              <FilePlus className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => actions.onRenamePath(node.path, node.type)}
              className="rounded p-0.5 text-neutral-600 hover:bg-white/10 hover:text-neutral-300"
              title={`Rename ${node.name}`}
            >
              <Pencil className="h-3 w-3" />
            </button>
            <button
              type="button"
              onClick={() => actions.onDeletePath(node.path, node.type)}
              className="rounded p-0.5 text-neutral-600 hover:bg-red-500/10 hover:text-red-300"
              title={`Delete ${node.name}`}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        {node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            actions={actions}
          />
        ))}
      </div>
    );
  }

  const extLabel = getExtLabel(node.name);

  return (
    <div
      className={`group flex w-full items-center gap-1 py-0.5 text-xs ${
        isSelected ? 'bg-primary/10 text-primary' : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
      }`}
      style={{ paddingLeft }}
    >
      <button
        type="button"
        onClick={() => actions.onSelectFile(node.path)}
        className="flex min-w-0 flex-1 items-center gap-1 text-left"
      >
        {extLabel ? (
          <span className="text-[9px] font-bold text-neutral-600 w-5 text-center shrink-0">{extLabel}</span>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
      </button>
      <span className="mr-1 hidden shrink-0 items-center gap-0.5 group-hover:flex group-focus-within:flex">
        <button
          type="button"
          onClick={() => actions.onRenamePath(node.path, node.type)}
          className="rounded p-0.5 text-neutral-600 hover:bg-white/10 hover:text-neutral-300"
          title={`Rename ${node.name}`}
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={() => actions.onDeletePath(node.path, node.type)}
          className="rounded p-0.5 text-neutral-600 hover:bg-red-500/10 hover:text-red-300"
          title={`Delete ${node.name}`}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </span>
    </div>
  );
}
