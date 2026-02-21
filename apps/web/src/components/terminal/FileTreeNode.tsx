'use client';

import { useState } from 'react';
import type { FileNode } from '@/hooks/useFileExplorer';

const EXTENSION_LABELS: Record<string, string> = {
  '.js': 'JS',
  '.jsx': 'JSX',
  '.ts': 'TS',
  '.tsx': 'TSX',
  '.py': 'PY',
  '.rb': 'RB',
  '.go': 'GO',
  '.rs': 'RS',
  '.java': 'JV',
  '.json': '{}',
  '.md': 'MD',
  '.css': 'CSS',
  '.html': 'HTM',
  '.yml': 'YML',
  '.yaml': 'YML',
  '.sh': 'SH',
  '.sql': 'SQL',
  '.toml': 'TML',
};

function getExtLabel(name: string): string | null {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return null;
  const ext = name.slice(idx).toLowerCase();
  return EXTENSION_LABELS[ext] || null;
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}

export default function FileTreeNode({ node, depth, selectedFile, onSelectFile }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const isDir = node.type === 'directory';
  const isSelected = !isDir && node.path === selectedFile;
  const paddingLeft = depth * 16 + 8;

  if (isDir) {
    return (
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full text-left flex items-center gap-1 py-0.5 hover:bg-slate-800/50 text-slate-300 text-xs"
          style={{ paddingLeft }}
        >
          <span className="text-slate-500 w-3 text-center flex-shrink-0">
            {expanded ? '▼' : '▶'}
          </span>
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    );
  }

  const extLabel = getExtLabel(node.name);

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={`w-full text-left flex items-center gap-1 py-0.5 text-xs ${
        isSelected
          ? 'bg-cyan-900/30 text-cyan-300'
          : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
      }`}
      style={{ paddingLeft }}
    >
      {extLabel ? (
        <span className="text-[9px] font-bold text-slate-500 w-5 text-center flex-shrink-0">{extLabel}</span>
      ) : (
        <span className="w-5 flex-shrink-0" />
      )}
      <span className="truncate">{node.name}</span>
    </button>
  );
}
