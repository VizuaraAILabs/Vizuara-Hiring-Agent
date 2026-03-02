'use client';

import { useState, useMemo } from 'react';
import type { StarterFile } from '@/types';

interface StarterFilesEditorProps {
  files: StarterFile[];
  onChange: (files: StarterFile[]) => void;
  challengeTitle: string;
  challengeDescription: string;
}

// Build a nested tree structure from the flat file list
interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

function buildTree(files: StarterFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.path.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const pathSoFar = parts.slice(0, i + 1).join('/');

      const existing = current.find((n) => n.name === part);
      if (existing) {
        if (existing.type === 'directory' && existing.children) {
          current = existing.children;
        }
      } else {
        const node: TreeNode = {
          name: part,
          path: pathSoFar,
          type: isFile ? 'file' : 'directory',
          ...(isFile ? {} : { children: [] }),
        };
        current.push(node);
        if (!isFile && node.children) {
          current = node.children;
        }
      }
    }
  }

  // Sort: directories first, then alphabetical
  function sortNodes(nodes: TreeNode[]) {
    nodes.sort((a, b) => {
      if (a.type === 'directory' && b.type === 'file') return -1;
      if (a.type === 'file' && b.type === 'directory') return 1;
      return a.name.localeCompare(b.name);
    });
    for (const n of nodes) {
      if (n.children) sortNodes(n.children);
    }
  }
  sortNodes(root);
  return root;
}

const EXTENSION_LABELS: Record<string, string> = {
  '.js': 'JS', '.jsx': 'JSX', '.ts': 'TS', '.tsx': 'TSX',
  '.py': 'PY', '.go': 'GO', '.rs': 'RS', '.java': 'JV',
  '.json': '{}', '.md': 'MD', '.css': 'CSS', '.html': 'HTM',
  '.yml': 'YML', '.yaml': 'YML', '.sh': 'SH', '.sql': 'SQL',
  '.txt': 'TXT', '.toml': 'TML', '.xml': 'XML',
};

function getExtLabel(name: string): string | null {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return null;
  return EXTENSION_LABELS[name.slice(idx).toLowerCase()] || null;
}

// Tree node component for the left panel
function EditorTreeNode({
  node,
  depth,
  selectedFile,
  onSelect,
  onDelete,
  expandedDirs,
  toggleDir,
}: {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  onDelete: (path: string) => void;
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
}) {
  const isDir = node.type === 'directory';
  const isSelected = !isDir && node.path === selectedFile;
  const isExpanded = expandedDirs.has(node.path);
  const paddingLeft = depth * 16 + 8;

  if (isDir) {
    return (
      <div>
        <button
          onClick={() => toggleDir(node.path)}
          className="w-full text-left flex items-center gap-1 py-0.5 hover:bg-white/5 text-neutral-300 text-xs group"
          style={{ paddingLeft }}
        >
          <span className="text-neutral-600 w-3 text-center flex-shrink-0">
            {isExpanded ? '▼' : '▶'}
          </span>
          <span className="truncate">{node.name}</span>
        </button>
        {isExpanded && node.children?.map((child) => (
          <EditorTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelect={onSelect}
            onDelete={onDelete}
            expandedDirs={expandedDirs}
            toggleDir={toggleDir}
          />
        ))}
      </div>
    );
  }

  const extLabel = getExtLabel(node.name);

  return (
    <div
      className={`w-full flex items-center gap-1 py-0.5 text-xs group cursor-pointer ${
        isSelected
          ? 'bg-[#00a854]/10 text-[#00a854]'
          : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
      }`}
      style={{ paddingLeft }}
      onClick={() => onSelect(node.path)}
    >
      {extLabel ? (
        <span className="text-[9px] font-bold text-neutral-600 w-5 text-center flex-shrink-0">{extLabel}</span>
      ) : (
        <span className="w-5 flex-shrink-0" />
      )}
      <span className="truncate flex-1">{node.name}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(node.path); }}
        className="opacity-0 group-hover:opacity-100 text-neutral-600 hover:text-red-400 px-1 flex-shrink-0 transition-opacity"
        title="Delete file"
      >
        ✕
      </button>
    </div>
  );
}

export default function StarterFilesEditor({
  files,
  onChange,
  challengeTitle,
  challengeDescription,
}: StarterFilesEditorProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [showAddFile, setShowAddFile] = useState(false);
  const [newFilePath, setNewFilePath] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildTree(files), [files]);

  // Auto-expand all directories when tree changes
  useMemo(() => {
    const dirs = new Set<string>();
    function collectDirs(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.type === 'directory') {
          dirs.add(n.path);
          if (n.children) collectDirs(n.children);
        }
      }
    }
    collectDirs(tree);
    setExpandedDirs(dirs);
  }, [tree]);

  const selectedFileData = files.find((f) => f.path === selectedFile);

  function toggleDir(path: string) {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function handleContentChange(content: string) {
    if (!selectedFile) return;
    onChange(files.map((f) => (f.path === selectedFile ? { ...f, content } : f)));
  }

  function handlePathChange(oldPath: string, newPath: string) {
    if (!newPath || newPath === oldPath) return;
    // Don't allow duplicates
    if (files.some((f) => f.path === newPath)) return;
    onChange(files.map((f) => (f.path === oldPath ? { ...f, path: newPath } : f)));
    setSelectedFile(newPath);
  }

  function handleDelete(path: string) {
    onChange(files.filter((f) => f.path !== path));
    if (selectedFile === path) {
      setSelectedFile(null);
    }
  }

  function handleAddFile() {
    const trimmed = newFilePath.trim();
    if (!trimmed) return;
    // Normalize: remove leading slash
    const normalized = trimmed.replace(/^\/+/, '');
    if (files.some((f) => f.path === normalized)) return;
    onChange([...files, { path: normalized, content: '' }]);
    setSelectedFile(normalized);
    setNewFilePath('');
    setShowAddFile(false);
  }

  async function handleGenerate() {
    if (!challengeTitle || !challengeDescription) {
      setGenError('Title and description are required to generate files.');
      return;
    }

    if (files.length > 0) {
      const confirmed = window.confirm(
        'This will replace all existing starter files. Continue?'
      );
      if (!confirmed) return;
    }

    setGenerating(true);
    setGenError('');

    try {
      const res = await fetch('/api/challenges/generate-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: challengeTitle, description: challengeDescription }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Generation failed' }));
        throw new Error(data.error || 'Generation failed');
      }

      const data = await res.json();
      if (data.files && Array.isArray(data.files)) {
        onChange(data.files);
        if (data.files.length > 0) {
          setSelectedFile(data.files[0].path);
        }
      }
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#111]">
        <span className="text-sm font-medium text-neutral-400">
          Starter Files
          {files.length > 0 && (
            <span className="text-neutral-600 ml-2">({files.length} file{files.length !== 1 ? 's' : ''})</span>
          )}
        </span>
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="text-xs bg-[#00a854]/10 text-[#00a854] hover:bg-[#00a854]/20 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded-lg transition-all flex items-center gap-2"
        >
          {generating ? (
            <>
              <span className="animate-spin h-3 w-3 border-2 border-[#00a854] border-t-transparent rounded-full" />
              Generating...
            </>
          ) : (
            'Generate with AI'
          )}
        </button>
      </div>

      {genError && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs">
          {genError}
        </div>
      )}

      {/* Two-panel layout */}
      <div className="flex" style={{ height: '400px' }}>
        {/* Left panel: file tree */}
        <div className="w-52 flex-shrink-0 flex flex-col border-r border-white/10 bg-[#0a0a0a]">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
            <span className="text-xs text-neutral-600">Explorer</span>
            <button
              onClick={() => setShowAddFile(true)}
              className="text-neutral-600 hover:text-[#00a854] text-sm"
              title="Add file"
            >
              +
            </button>
          </div>

          {/* Add file inline input */}
          {showAddFile && (
            <div className="px-2 py-1 border-b border-white/5">
              <input
                type="text"
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddFile();
                  if (e.key === 'Escape') { setShowAddFile(false); setNewFilePath(''); }
                }}
                className="w-full bg-[#0a0a0a] border border-white/10 rounded px-2 py-0.5 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-[#00a854]/50 font-mono"
                placeholder="path/to/file.ext"
                autoFocus
              />
            </div>
          )}

          {/* File tree */}
          <div className="flex-1 min-h-0 overflow-auto">
            {files.length === 0 ? (
              <div className="flex items-center justify-center h-full px-3">
                <p className="text-neutral-600 text-xs text-center">
                  No starter files yet. Add files manually or generate them with AI.
                </p>
              </div>
            ) : (
              <div className="py-1">
                {tree.map((node) => (
                  <EditorTreeNode
                    key={node.path}
                    node={node}
                    depth={0}
                    selectedFile={selectedFile}
                    onSelect={setSelectedFile}
                    onDelete={handleDelete}
                    expandedDirs={expandedDirs}
                    toggleDir={toggleDir}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right panel: file editor */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a]">
          {selectedFileData ? (
            <>
              {/* File path input */}
              <div className="px-3 py-1.5 border-b border-white/5">
                <input
                  type="text"
                  value={selectedFileData.path}
                  onChange={(e) => handlePathChange(selectedFileData.path, e.target.value)}
                  className="w-full bg-transparent text-xs text-neutral-400 font-mono focus:outline-none focus:text-white"
                />
              </div>
              {/* Content editor */}
              <textarea
                value={selectedFileData.content}
                onChange={(e) => handleContentChange(e.target.value)}
                className="flex-1 w-full bg-transparent text-white font-mono text-sm p-3 resize-none focus:outline-none leading-relaxed"
                spellCheck={false}
              />
            </>
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-neutral-600 text-xs">
                {files.length === 0
                  ? 'Generate or add starter files to get started'
                  : 'Select a file to edit'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
