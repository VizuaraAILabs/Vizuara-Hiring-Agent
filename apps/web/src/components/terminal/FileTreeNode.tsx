'use client';

import { useState, useRef, useEffect } from 'react';
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
  onRename: (oldPath: string, newPath: string) => Promise<void>;
  onDelete: (path: string) => Promise<void>;
  onMove: (srcPath: string, destPath: string) => Promise<void>;
  onCreateFile: (parentDir: string) => void;
  onCreateFolder: (parentDir: string) => void;
}

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
  selectedFile: string | null;
  actions: FileTreeActions;
}

export default function FileTreeNode({ node, depth, selectedFile, actions }: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(node.name);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const isDir = node.type === 'directory';
  const isSelected = node.path === selectedFile;
  const paddingLeft = depth * 16 + 8;

  useEffect(() => {
    if (renaming && renameRef.current) {
      renameRef.current.focus();
      renameRef.current.select();
    }
  }, [renaming]);

  // Close context menu on outside click
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [contextMenu]);

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }

  async function handleRenameSubmit() {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === node.name) {
      setRenaming(false);
      setRenameValue(node.name);
      return;
    }
    const parentDir = node.path.includes('/') ? node.path.substring(0, node.path.lastIndexOf('/')) : '';
    const newPath = parentDir ? `${parentDir}/${trimmed}` : trimmed;
    try {
      await actions.onRename(node.path, newPath);
    } catch {
      // Revert on error
      setRenameValue(node.name);
    }
    setRenaming(false);
  }

  function handleRenameKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleRenameSubmit();
    if (e.key === 'Escape') {
      setRenaming(false);
      setRenameValue(node.name);
    }
  }

  // Drag handlers
  function handleDragStart(e: React.DragEvent) {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.setData('application/x-file-path', node.path);
  }

  function handleDragOver(e: React.DragEvent) {
    if (!isDir) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  }

  async function handleDrop(e: React.DragEvent) {
    if (!isDir) return;
    e.preventDefault();
    e.stopPropagation();
    const srcPath = e.dataTransfer.getData('application/x-file-path');
    if (!srcPath || srcPath === node.path) return;
    // Prevent dropping parent into child
    if (node.path.startsWith(srcPath + '/')) return;
    const fileName = srcPath.split('/').pop()!;
    const destPath = `${node.path}/${fileName}`;
    if (srcPath === destPath) return;
    try {
      await actions.onMove(srcPath, destPath);
      setExpanded(true);
    } catch {
      // ignore
    }
  }

  const contextMenuItems = isDir
    ? [
        { label: 'New File', action: () => { actions.onCreateFile(node.path); setContextMenu(null); } },
        { label: 'New Folder', action: () => { actions.onCreateFolder(node.path); setContextMenu(null); } },
        { label: 'Rename', action: () => { setRenaming(true); setContextMenu(null); } },
        { label: 'Delete', action: () => { actions.onDelete(node.path); setContextMenu(null); }, danger: true },
      ]
    : [
        { label: 'Rename', action: () => { setRenaming(true); setContextMenu(null); } },
        { label: 'Delete', action: () => { actions.onDelete(node.path); setContextMenu(null); }, danger: true },
      ];

  // Rename input inline
  const nameContent = renaming ? (
    <input
      ref={renameRef}
      value={renameValue}
      onChange={(e) => setRenameValue(e.target.value)}
      onBlur={handleRenameSubmit}
      onKeyDown={handleRenameKeyDown}
      className="bg-[#1a1a1a] border border-[#00a854]/50 rounded px-1 text-xs text-white outline-none w-full min-w-0"
      onClick={(e) => e.stopPropagation()}
    />
  ) : (
    <span className="truncate">{node.name}</span>
  );

  if (isDir) {
    return (
      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <button
          draggable={!renaming}
          onDragStart={handleDragStart}
          onClick={() => setExpanded(!expanded)}
          onContextMenu={handleContextMenu}
          className={`w-full text-left flex items-center gap-1 py-0.5 hover:bg-white/5 text-xs ${
            isSelected ? 'bg-[#00a854]/10 text-[#00a854]' : 'text-neutral-300'
          }`}
          style={{ paddingLeft }}
        >
          <svg className="w-3 h-3 text-neutral-600 shrink-0" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {expanded
              ? <polyline points="6,8 10,12 14,8" />
              : <polyline points="8,6 12,10 8,14" />
            }
          </svg>
          {nameContent}
        </button>
        {expanded && node.children?.map((child) => (
          <FileTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            actions={actions}
          />
        ))}
        {contextMenu && (
          <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} />
        )}
      </div>
    );
  }

  const extLabel = getExtLabel(node.name);

  return (
    <div>
      <button
        draggable={!renaming}
        onDragStart={handleDragStart}
        onClick={() => !renaming && actions.onSelectFile(node.path)}
        onContextMenu={handleContextMenu}
        className={`w-full text-left flex items-center gap-1 py-0.5 text-xs ${
          isSelected
            ? 'bg-[#00a854]/10 text-[#00a854]'
            : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
        }`}
        style={{ paddingLeft }}
      >
        {extLabel ? (
          <span className="text-[9px] font-bold text-neutral-600 w-5 text-center flex-shrink-0">{extLabel}</span>
        ) : (
          <span className="w-5 flex-shrink-0" />
        )}
        {nameContent}
      </button>
      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenuItems} />
      )}
    </div>
  );
}

// Context menu component
function ContextMenu({ x, y, items }: {
  x: number;
  y: number;
  items: { label: string; action: () => void; danger?: boolean }[];
}) {
  return (
    <div
      className="fixed z-50 bg-[#1a1a1a] border border-white/10 rounded-lg py-1 shadow-2xl min-w-[140px]"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item) => (
        <button
          key={item.label}
          onClick={item.action}
          className={`w-full text-left px-3 py-1.5 text-xs hover:bg-white/5 ${
            item.danger ? 'text-red-400 hover:text-red-300' : 'text-neutral-300 hover:text-white'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
