'use client';

import { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import type { StarterFile } from '@/types';

interface StarterFilesEditorProps {
  files: StarterFile[];
  onChange: (files: StarterFile[]) => void;
  challengeTitle?: string;
  challengeDescription?: string;
  mode?: 'inline' | 'full';
}

// --- Tree helpers ---

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
}

const GITKEEP = '.gitkeep';

function buildTree(files: StarterFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    if (!file.path) continue;
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

// --- Context Menu ---

interface ContextMenuState {
  x: number;
  y: number;
  nodePath: string;
  nodeType: 'file' | 'directory' | 'root';
}

function ContextMenu({
  menu,
  onClose,
  onNewFile,
  onNewFolder,
  onRename,
  onDelete,
}: {
  menu: ContextMenuState;
  onClose: () => void;
  onNewFile: (dirPath: string) => void;
  onNewFolder: (dirPath: string) => void;
  onRename: (path: string) => void;
  onDelete: (path: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const dirPath = menu.nodeType === 'file'
    ? menu.nodePath.substring(0, menu.nodePath.lastIndexOf('/')) || ''
    : menu.nodeType === 'root'
    ? ''
    : menu.nodePath;

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-surface-light border border-white/10 rounded-lg shadow-xl py-1 min-w-40"
      style={{ top: menu.y, left: menu.x }}
    >
      <button
        onClick={() => { onNewFile(dirPath); onClose(); }}
        className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5 hover:text-white"
      >
        New File
      </button>
      <button
        onClick={() => { onNewFolder(dirPath); onClose(); }}
        className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5 hover:text-white"
      >
        New Folder
      </button>
      {menu.nodeType !== 'root' && (
        <>
          <div className="border-t border-white/5 my-1" />
          <button
            onClick={() => { onRename(menu.nodePath); onClose(); }}
            className="w-full text-left px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/5 hover:text-white"
          >
            Rename
          </button>
          <button
            onClick={() => { onDelete(menu.nodePath); onClose(); }}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/10"
          >
            Delete
          </button>
        </>
      )}
    </div>
  );
}

// --- Tree Node ---

function EditorTreeNode({
  node,
  depth,
  selectedFile,
  onSelect,
  expandedDirs,
  toggleDir,
  onContextMenu,
  renamingPath,
  renameValue,
  onRenameChange,
  onRenameSubmit,
  onRenameCancel,
  inlineInput,
  onDragStart,
  onDragOver,
  onDrop,
  dragOverPath,
}: {
  node: TreeNode;
  depth: number;
  selectedFile: string | null;
  onSelect: (path: string) => void;
  expandedDirs: Set<string>;
  toggleDir: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, path: string, type: 'file' | 'directory') => void;
  renamingPath: string | null;
  renameValue: string;
  onRenameChange: (v: string) => void;
  onRenameSubmit: () => void;
  onRenameCancel: () => void;
  inlineInput: { dirPath: string; type: 'file' | 'folder' } | null;
  onDragStart: (e: React.DragEvent, path: string) => void;
  onDragOver: (e: React.DragEvent, path: string) => void;
  onDrop: (e: React.DragEvent, targetDir: string) => void;
  dragOverPath: string | null;
}) {
  const isDir = node.type === 'directory';
  const isSelected = !isDir && node.path === selectedFile;
  const isExpanded = expandedDirs.has(node.path);
  const paddingLeft = depth * 16 + 8;
  const isRenaming = renamingPath === node.path;
  const isDragOver = dragOverPath === node.path;
  // Hide .gitkeep files (used for empty directories)
  if (!isDir && node.name === GITKEEP) return null;

  if (isDir) {
    return (
      <div>
        <div
          className={`w-full text-left flex items-center gap-1 py-1 hover:bg-white/5 text-neutral-300 text-xs group cursor-pointer ${
            isDragOver ? 'bg-primary/10 border-l-2 border-primary' : ''
          }`}
          style={{ paddingLeft }}
          onClick={() => toggleDir(node.path)}
          onContextMenu={(e) => onContextMenu(e, node.path, 'directory')}
          onDragOver={(e) => onDragOver(e, node.path)}
          onDrop={(e) => onDrop(e, node.path)}
        >
          <span className="text-neutral-600 w-3 text-center shrink-0">
            {isExpanded ? '▼' : '▶'}
          </span>
          {isRenaming ? (
            <input
              type="text"
              value={renameValue}
              onChange={(e) => onRenameChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') onRenameSubmit(); if (e.key === 'Escape') onRenameCancel(); }}
              onBlur={onRenameSubmit}
              className="bg-[#0a0a0a] border border-primary/50 rounded px-1 py-0 text-xs text-white font-mono focus:outline-none w-full"
              autoFocus
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="truncate">{node.name}</span>
          )}
        </div>
        {isExpanded && node.children?.map((child) => (
          <EditorTreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedFile={selectedFile}
            onSelect={onSelect}
            expandedDirs={expandedDirs}
            toggleDir={toggleDir}
            onContextMenu={onContextMenu}
            renamingPath={renamingPath}
            renameValue={renameValue}
            onRenameChange={onRenameChange}
            onRenameSubmit={onRenameSubmit}
            onRenameCancel={onRenameCancel}
            inlineInput={inlineInput}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDrop={onDrop}
            dragOverPath={dragOverPath}
          />
        ))}
        {/* Inline input for new file/folder inside this directory */}
        {inlineInput && inlineInput.dirPath === node.path && isExpanded && (
          <InlineNewInput depth={depth + 1} type={inlineInput.type} />
        )}
      </div>
    );
  }

  const extLabel = getExtLabel(node.name);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, node.path)}
      className={`w-full flex items-center gap-1 py-1 text-xs group cursor-pointer ${
        isSelected
          ? 'bg-primary/10 text-primary'
          : 'text-neutral-500 hover:bg-white/5 hover:text-neutral-300'
      }`}
      style={{ paddingLeft }}
      onClick={() => onSelect(node.path)}
      onContextMenu={(e) => onContextMenu(e, node.path, 'file')}
    >
      {extLabel ? (
        <span className="text-[9px] font-bold text-neutral-600 w-5 text-center shrink-0">{extLabel}</span>
      ) : (
        <span className="w-5 shrink-0" />
      )}
      {isRenaming ? (
        <input
          type="text"
          value={renameValue}
          onChange={(e) => onRenameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') onRenameSubmit(); if (e.key === 'Escape') onRenameCancel(); }}
          onBlur={onRenameSubmit}
          className="bg-[#0a0a0a] border border-primary/50 rounded px-1 py-0 text-xs text-white font-mono focus:outline-none w-full"
          autoFocus
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <span className="truncate flex-1">{node.name}</span>
      )}
    </div>
  );
}

// Placeholder for the inline input — rendered by the parent StarterFilesEditor
function InlineNewInput({ depth, type }: { depth: number; type: 'file' | 'folder' }) {
  // This is just a visual placeholder — the actual input is managed from the parent
  return (
    <div style={{ paddingLeft: depth * 16 + 8 }} className="flex items-center gap-1 py-0.5">
      <span className="text-neutral-600 w-3 text-center shrink-0 text-[9px]">
        {type === 'folder' ? '▶' : '·'}
      </span>
      <span id="inline-new-input-anchor" />
    </div>
  );
}

// --- Main Component ---

export default function StarterFilesEditor({
  files,
  onChange,
  challengeTitle,
  challengeDescription,
  mode = 'inline',
}: StarterFilesEditorProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [inlineInput, setInlineInput] = useState<{ dirPath: string; type: 'file' | 'folder' } | null>(null);
  const [inlineInputValue, setInlineInputValue] = useState('');
  const [dragOverPath, setDragOverPath] = useState<string | null>(null);
  const [draggedPath, setDraggedPath] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropZoneRef = useRef<HTMLDivElement>(null);

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
  const isFull = mode === 'full';

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

  // --- Context menu actions ---

  function handleContextMenu(e: React.MouseEvent, path: string, type: 'file' | 'directory') {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, nodePath: path, nodeType: type });
  }

  function handleRootContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, nodePath: '', nodeType: 'root' });
  }

  function startNewFile(dirPath: string) {
    setInlineInput({ dirPath, type: 'file' });
    setInlineInputValue('');
    // Expand the directory
    if (dirPath) {
      setExpandedDirs((prev) => new Set([...prev, dirPath]));
    }
  }

  function startNewFolder(dirPath: string) {
    setInlineInput({ dirPath, type: 'folder' });
    setInlineInputValue('');
    if (dirPath) {
      setExpandedDirs((prev) => new Set([...prev, dirPath]));
    }
  }

  function submitInlineInput() {
    const name = inlineInputValue.trim();
    if (!name || !inlineInput) { setInlineInput(null); return; }

    const fullPath = inlineInput.dirPath ? `${inlineInput.dirPath}/${name}` : name;

    if (inlineInput.type === 'folder') {
      // Add .gitkeep to represent the empty dir
      const gitkeepPath = `${fullPath}/${GITKEEP}`;
      if (!files.some((f) => f.path === gitkeepPath)) {
        onChange([...files, { path: gitkeepPath, content: '' }]);
      }
    } else {
      if (!files.some((f) => f.path === fullPath)) {
        onChange([...files, { path: fullPath, content: '' }]);
        setSelectedFile(fullPath);
      }
    }
    setInlineInput(null);
    setInlineInputValue('');
  }

  function startRename(path: string) {
    const name = path.split('/').pop() || '';
    setRenamingPath(path);
    setRenameValue(name);
  }

  function submitRename() {
    if (!renamingPath || !renameValue.trim()) { setRenamingPath(null); return; }

    const parts = renamingPath.split('/');
    const oldName = parts.pop()!;
    const newName = renameValue.trim();

    if (newName === oldName) { setRenamingPath(null); return; }

    const parentPath = parts.join('/');
    const isDir = !files.some((f) => f.path === renamingPath);

    if (isDir) {
      // Rename directory: update all file paths under this dir
      const oldPrefix = renamingPath + '/';
      const newPrefix = (parentPath ? parentPath + '/' : '') + newName + '/';
      onChange(files.map((f) => {
        if (f.path.startsWith(oldPrefix)) {
          return { ...f, path: newPrefix + f.path.slice(oldPrefix.length) };
        }
        return f;
      }));
    } else {
      // Rename file
      const newPath = (parentPath ? parentPath + '/' : '') + newName;
      if (files.some((f) => f.path === newPath)) { setRenamingPath(null); return; }
      onChange(files.map((f) => (f.path === renamingPath ? { ...f, path: newPath } : f)));
      if (selectedFile === renamingPath) setSelectedFile(newPath);
    }
    setRenamingPath(null);
  }

  function handleDelete(path: string) {
    // Check if it's a directory (no direct file match)
    const isFile = files.some((f) => f.path === path);
    if (isFile) {
      onChange(files.filter((f) => f.path !== path));
      if (selectedFile === path) setSelectedFile(null);
    } else {
      // Delete all files under this directory
      const prefix = path + '/';
      onChange(files.filter((f) => !f.path.startsWith(prefix)));
      if (selectedFile?.startsWith(prefix)) setSelectedFile(null);
    }
  }

  // --- Drag and drop (internal) ---

  function handleDragStart(e: React.DragEvent, path: string) {
    setDraggedPath(path);
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, dirPath: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPath(dirPath);
  }

  function handleDrop(e: React.DragEvent, targetDir: string) {
    e.preventDefault();
    setDragOverPath(null);

    // Handle external file drops
    if (e.dataTransfer.files.length > 0) {
      handleExternalFileDrop(e.dataTransfer.files, targetDir);
      return;
    }

    if (!draggedPath) return;

    const fileName = draggedPath.split('/').pop()!;
    const newPath = targetDir ? `${targetDir}/${fileName}` : fileName;

    if (newPath === draggedPath) return;
    if (files.some((f) => f.path === newPath)) return;

    onChange(files.map((f) => (f.path === draggedPath ? { ...f, path: newPath } : f)));
    if (selectedFile === draggedPath) setSelectedFile(newPath);
    setDraggedPath(null);
  }

  // --- External file drop ---

  const handleExternalFileDrop = useCallback((fileList: FileList, targetDir: string) => {
    const newFiles: StarterFile[] = [...files];

    Array.from(fileList).forEach((file) => {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const filePath = targetDir ? `${targetDir}/${file.name}` : file.name;
        if (!newFiles.some((f) => f.path === filePath)) {
          newFiles.push({ path: filePath, content });
          onChange([...newFiles]);
          setSelectedFile(filePath);
        }
      };
      reader.readAsText(file);
    });
  }, [files, onChange]);

  function handleEditorDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  }

  function handleEditorDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOverPath(null);
    if (e.dataTransfer.files.length > 0) {
      handleExternalFileDrop(e.dataTransfer.files, '');
    }
  }

  // --- Upload via button ---

  function handleUpload() {
    fileInputRef.current?.click();
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList) return;
    handleExternalFileDrop(fileList, '');
    e.target.value = '';
  }

  // --- Generate with AI ---

  async function handleGenerate() {
    if (!challengeTitle || !challengeDescription) {
      setGenError('Title and description are required to generate files.');
      return;
    }

    if (files.length > 0) {
      const confirmed = window.confirm('This will replace all existing starter files. Continue?');
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
        if (data.files.length > 0) setSelectedFile(data.files[0].path);
      }
    } catch (err: unknown) {
      setGenError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  // --- Tab key inserts spaces ---

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const value = ta.value;
      const newValue = value.substring(0, start) + '  ' + value.substring(end);
      handleContentChange(newValue);
      // Set cursor position after React re-render
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
  }

  // --- Breadcrumb for selected file ---

  function renderBreadcrumb(filePath: string) {
    const parts = filePath.split('/');
    return (
      <div className="px-3 py-1.5 border-b border-white/5 flex items-center gap-1 text-xs font-mono text-neutral-500">
        {parts.map((part, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-neutral-700">/</span>}
            <span className={i === parts.length - 1 ? 'text-neutral-300' : ''}>{part}</span>
          </span>
        ))}
      </div>
    );
  }

  const editorHeight = isFull ? 'h-full' : 'h-[400px]';
  const treeWidth = isFull ? 'w-64' : 'w-52';

  return (
    <div
      ref={dropZoneRef}
      className={`border border-white/10 rounded-xl overflow-hidden flex flex-col ${isFull ? 'h-full' : ''}`}
      onDragOver={handleEditorDragOver}
      onDrop={handleEditorDrop}
    >
      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      {/* Top toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-[#111] shrink-0">
        <span className="text-sm font-medium text-neutral-400">
          Starter Files
          {files.length > 0 && (
            <span className="text-neutral-600 ml-2">
              ({files.filter(f => f.path && f.path.split('/').pop() !== GITKEEP).length} file{files.filter(f => f.path && f.path.split('/').pop() !== GITKEEP).length !== 1 ? 's' : ''})
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => startNewFile('')}
            className="text-xs text-neutral-400 hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors"
            title="New File"
          >
            + File
          </button>
          <button
            onClick={() => startNewFolder('')}
            className="text-xs text-neutral-400 hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors"
            title="New Folder"
          >
            + Folder
          </button>
          <button
            onClick={handleUpload}
            className="text-xs text-neutral-400 hover:text-white px-2 py-1 rounded hover:bg-white/5 transition-colors"
            title="Upload Files"
          >
            Upload
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="text-xs bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 disabled:cursor-not-allowed px-3 py-1 rounded-lg transition-all flex items-center gap-2"
          >
            {generating ? (
              <>
                <span className="animate-spin h-3 w-3 border-2 border-primary border-t-transparent rounded-full" />
                Generating...
              </>
            ) : (
              'Generate with AI'
            )}
          </button>
        </div>
      </div>

      {genError && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs shrink-0">
          {genError}
        </div>
      )}

      {/* Two-panel layout */}
      <div className={`flex flex-1 min-h-0 ${!isFull ? editorHeight : ''}`}>
        {/* Left panel: file tree */}
        <div
          className={`${treeWidth} shrink-0 flex flex-col border-r border-white/10 bg-[#0a0a0a]`}
          onContextMenu={handleRootContextMenu}
        >
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
            <span className="text-xs text-neutral-600">Explorer</span>
          </div>

          {/* File tree */}
          <div className="flex-1 min-h-0 overflow-auto">
            {files.length === 0 && !inlineInput ? (
              <div className="flex items-center justify-center h-full px-3">
                <p className="text-neutral-600 text-xs text-center">
                  No starter files yet.<br />
                  Use toolbar buttons, right-click, or drop files here.
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
                    expandedDirs={expandedDirs}
                    toggleDir={toggleDir}
                    onContextMenu={handleContextMenu}
                    renamingPath={renamingPath}
                    renameValue={renameValue}
                    onRenameChange={setRenameValue}
                    onRenameSubmit={submitRename}
                    onRenameCancel={() => setRenamingPath(null)}
                    inlineInput={inlineInput}
                    onDragStart={handleDragStart}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    dragOverPath={dragOverPath}
                  />
                ))}
                {/* Inline input at root level */}
                {inlineInput && inlineInput.dirPath === '' && (
                  <div className="px-2 py-1">
                    <input
                      type="text"
                      value={inlineInputValue}
                      onChange={(e) => setInlineInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitInlineInput();
                        if (e.key === 'Escape') { setInlineInput(null); setInlineInputValue(''); }
                      }}
                      onBlur={submitInlineInput}
                      className="w-full bg-[#0a0a0a] border border-primary/50 rounded px-2 py-0.5 text-xs text-white placeholder-neutral-600 focus:outline-none font-mono"
                      placeholder={inlineInput.type === 'folder' ? 'folder name' : 'filename.ext'}
                      autoFocus
                    />
                  </div>
                )}
                {/* Inline input inside a directory */}
                {inlineInput && inlineInput.dirPath !== '' && (
                  <div style={{ paddingLeft: (inlineInput.dirPath.split('/').length) * 16 + 8 }} className="py-1">
                    <input
                      type="text"
                      value={inlineInputValue}
                      onChange={(e) => setInlineInputValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') submitInlineInput();
                        if (e.key === 'Escape') { setInlineInput(null); setInlineInputValue(''); }
                      }}
                      onBlur={submitInlineInput}
                      className="w-full bg-[#0a0a0a] border border-primary/50 rounded px-2 py-0.5 text-xs text-white placeholder-neutral-600 focus:outline-none font-mono"
                      placeholder={inlineInput.type === 'folder' ? 'folder name' : 'filename.ext'}
                      autoFocus
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right panel: file editor */}
        <div className="flex-1 flex flex-col bg-[#0a0a0a]">
          {selectedFileData ? (
            <>
              {renderBreadcrumb(selectedFileData.path)}
              <textarea
                value={selectedFileData.content}
                onChange={(e) => handleContentChange(e.target.value)}
                onKeyDown={handleTextareaKeyDown}
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

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
          onNewFile={startNewFile}
          onNewFolder={startNewFolder}
          onRename={startRename}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
