'use client';

import { useState, useCallback } from 'react';
import { useFileExplorer } from '@/hooks/useFileExplorer';
import FileTree from './FileTree';
import CodeViewer from './CodeViewer';
import type { FileTreeActions } from './FileTreeNode';

interface FileExplorerProps {
  token: string;
}

export default function FileExplorer({ token }: FileExplorerProps) {
  const {
    tree,
    loading,
    error,
    selectedFile,
    fileContent,
    fileLoading,
    fileError,
    selectFile,
    closeFile,
    refresh,
    createNewFile,
    createNewDirectory,
    renameItem,
    deleteItem,
    moveItem,
  } = useFileExplorer(token);

  const [creating, setCreating] = useState<{ type: 'file' | 'folder'; parentDir: string } | null>(null);
  const [createName, setCreateName] = useState('');
  const [createError, setCreateError] = useState('');

  const handleCreateFile = useCallback((parentDir: string) => {
    setCreating({ type: 'file', parentDir });
    setCreateName('');
    setCreateError('');
  }, []);

  const handleCreateFolder = useCallback((parentDir: string) => {
    setCreating({ type: 'folder', parentDir });
    setCreateName('');
    setCreateError('');
  }, []);

  async function handleCreateSubmit() {
    if (!creating || !createName.trim()) return;
    const fullPath = creating.parentDir ? `${creating.parentDir}/${createName.trim()}` : createName.trim();
    try {
      if (creating.type === 'file') {
        await createNewFile(fullPath);
      } else {
        await createNewDirectory(fullPath);
      }
      setCreating(null);
    } catch (err: any) {
      setCreateError(err.message);
    }
  }

  function handleCreateKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleCreateSubmit();
    if (e.key === 'Escape') setCreating(null);
  }

  const handleDelete = useCallback(async (filePath: string) => {
    const confirmed = window.confirm(`Delete "${filePath}"?`);
    if (!confirmed) return;
    await deleteItem(filePath);
  }, [deleteItem]);

  const actions: FileTreeActions = {
    onSelectFile: selectFile,
    onRename: renameItem,
    onDelete: handleDelete,
    onMove: moveItem,
    onCreateFile: handleCreateFile,
    onCreateFolder: handleCreateFolder,
  };

  return (
    <>
      {/* Sidebar: file tree */}
      <div className="w-56 flex-shrink-0 flex flex-col border-r border-white/5 bg-[#0a0a0a]">
        {/* Header with actions */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <span className="text-xs font-medium text-neutral-400">Files</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleCreateFile('')}
              className="text-neutral-600 hover:text-neutral-300 text-xs px-1"
              title="New File"
            >
              +F
            </button>
            <button
              onClick={() => handleCreateFolder('')}
              className="text-neutral-600 hover:text-neutral-300 text-xs px-1"
              title="New Folder"
            >
              +D
            </button>
            <button
              onClick={refresh}
              className="text-neutral-600 hover:text-neutral-300 text-sm px-1"
              title="Refresh"
            >
              ↻
            </button>
          </div>
        </div>

        {/* Inline create input */}
        {creating && (
          <div className="px-2 py-1.5 border-b border-white/5 bg-white/[0.02]">
            <div className="text-[10px] text-neutral-500 mb-1">
              New {creating.type}{creating.parentDir ? ` in ${creating.parentDir}` : ''}
            </div>
            <input
              autoFocus
              value={createName}
              onChange={(e) => { setCreateName(e.target.value); setCreateError(''); }}
              onKeyDown={handleCreateKeyDown}
              onBlur={() => setCreating(null)}
              placeholder={creating.type === 'file' ? 'filename.ext' : 'folder-name'}
              className="w-full bg-[#111] border border-white/10 rounded px-2 py-1 text-xs text-white outline-none focus:border-primary/50"
            />
            {createError && <div className="text-[10px] text-red-400 mt-0.5">{createError}</div>}
          </div>
        )}

        {/* File tree */}
        <div className="flex-1 min-h-0 overflow-auto file-tree-scroll">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin h-5 w-5 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-32 px-3">
              <p className="text-red-400 text-xs text-center">{error}</p>
            </div>
          ) : (
            <FileTree tree={tree} selectedFile={selectedFile} actions={actions} />
          )}
        </div>
      </div>

      {/* Slide-over code viewer panel */}
      {selectedFile && (
        <div className="w-[45%] max-w-2xl flex-shrink-0 flex flex-col border-r border-white/5 bg-[#0d0d0d]">
          {/* Panel header with close button */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-[#111]">
            <span className="text-xs text-neutral-400 truncate font-mono">
              {fileContent?.path || selectedFile}
            </span>
            <button
              onClick={closeFile}
              className="text-neutral-600 hover:text-white text-lg leading-none ml-3 px-1"
              title="Close file viewer"
            >
              ✕
            </button>
          </div>

          {/* Code content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <CodeViewer
              selectedFile={selectedFile}
              fileContent={fileContent}
              fileLoading={fileLoading}
              fileError={fileError}
            />
          </div>
        </div>
      )}
    </>
  );
}
