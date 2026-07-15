'use client';

import { useEffect, useCallback, useState } from 'react';
import { FilePlus, RefreshCw, X } from 'lucide-react';
import { useFileExplorer } from '@/hooks/useFileExplorer';
import FileTree from './FileTree';
import CodeViewer from './CodeViewer';
import type { FileTreeActions } from './FileTreeNode';
import ArcSpinner from '@/components/ArcSpinner';

interface FileExplorerProps {
  token: string;
  onReadyChange?: (ready: boolean, error?: string | null) => void;
}

function pathInScope(path: string | null, scope: string) {
  return Boolean(path && (path === scope || path.startsWith(`${scope}/`)));
}

function parentPath(path: string) {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? '' : path.slice(0, idx);
}

function leafName(path: string) {
  const idx = path.lastIndexOf('/');
  return idx === -1 ? path : path.slice(idx + 1);
}

export default function FileExplorer({ token, onReadyChange }: FileExplorerProps) {
  const {
    tree,
    loading,
    error,
    selectedFile,
    fileContent,
    fileLoading,
    fileError,
    fileSaving,
    fileSaveError,
    operationError,
    selectFile,
    closeFile,
    saveFile,
    createFile,
    renamePath,
    deletePath,
    refresh,
  } = useFileExplorer(token);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const confirmDiscardUnsaved = useCallback((message: string) => {
    if (!hasUnsavedChanges) return true;
    return window.confirm(message);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    onReadyChange?.(!loading && !error, error);
  }, [loading, error, onReadyChange]);

  const handleSelectFile = useCallback((filePath: string) => {
    if (filePath === selectedFile) return;
    if (
      hasUnsavedChanges
      && !window.confirm('Discard unsaved changes and open another file?')
    ) {
      return;
    }
    setHasUnsavedChanges(false);
    void selectFile(filePath);
  }, [hasUnsavedChanges, selectFile, selectedFile]);

  const handleCloseFile = useCallback(() => {
    if (
      hasUnsavedChanges
      && !window.confirm('Discard unsaved changes and close this file?')
    ) {
      return;
    }
    setHasUnsavedChanges(false);
    closeFile();
  }, [closeFile, hasUnsavedChanges]);

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const handleCreateFile = useCallback(async (parent: string | null) => {
    if (!confirmDiscardUnsaved('Discard unsaved changes and create a new file?')) return;

    const prefix = parent ? `${parent}/` : '';
    const requested = window.prompt('New file path', `${prefix}new-file.txt`);
    const filePath = requested?.trim();
    if (!filePath) return;

    const created = await createFile(filePath);
    if (!created) return;
    setHasUnsavedChanges(false);
  }, [confirmDiscardUnsaved, createFile]);

  const handleRenamePath = useCallback(async (path: string, type: 'file' | 'directory') => {
    const affectsOpenFile = pathInScope(selectedFile, path);
    if (
      affectsOpenFile
      && !confirmDiscardUnsaved(`Discard unsaved changes and rename this ${type}?`)
    ) {
      return;
    }

    const base = parentPath(path);
    const requestedName = window.prompt(`Rename ${type}`, leafName(path));
    const nextName = requestedName?.trim();
    if (!nextName || nextName === leafName(path)) return;

    const nextPath = base ? `${base}/${nextName}` : nextName;
    const renamed = await renamePath(path, nextPath);
    if (!renamed) return;
    if (affectsOpenFile) setHasUnsavedChanges(false);
  }, [confirmDiscardUnsaved, renamePath, selectedFile]);

  const handleDeletePath = useCallback(async (path: string, type: 'file' | 'directory') => {
    const affectsOpenFile = pathInScope(selectedFile, path);
    if (
      affectsOpenFile
      && !confirmDiscardUnsaved(`Discard unsaved changes and delete this ${type}?`)
    ) {
      return;
    }

    const label = type === 'directory'
      ? `Delete folder "${path}" and everything inside it?`
      : `Delete file "${path}"?`;
    if (!window.confirm(label)) return;

    const deleted = await deletePath(path);
    if (!deleted) return;
    if (affectsOpenFile) setHasUnsavedChanges(false);
  }, [confirmDiscardUnsaved, deletePath, selectedFile]);

  const actions: FileTreeActions = {
    onSelectFile: handleSelectFile,
    onCreateFile: handleCreateFile,
    onRenamePath: handleRenamePath,
    onDeletePath: handleDeletePath,
  };

  return (
    <>
      <div className="w-56 shrink-0 flex flex-col border-r border-white/5 bg-[#0a0a0a]">
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <span className="text-xs font-medium text-neutral-400">Files</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => void handleCreateFile(null)}
              className="rounded p-1 text-neutral-600 hover:bg-white/5 hover:text-neutral-300"
              title="New file"
            >
              <FilePlus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleRefresh}
              className="rounded p-1 text-neutral-600 hover:bg-white/5 hover:text-neutral-300"
              title="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto file-tree-scroll">
          {operationError && (
            <div className="border-b border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {operationError}
            </div>
          )}
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <ArcSpinner label="Loading files" sizeClassName="h-5 w-5" />
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

      {selectedFile && (
        <div className="w-[45%] max-w-2xl shrink-0 flex flex-col border-r border-white/5 bg-[#0d0d0d]">
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-surface">
            <span className="text-xs text-neutral-400 truncate font-mono">
              {fileContent?.path || selectedFile}
            </span>
            <button
              onClick={handleCloseFile}
              className="ml-3 rounded p-1 text-neutral-600 hover:bg-white/5 hover:text-white"
              title="Close file viewer"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-hidden">
            <CodeViewer
              selectedFile={selectedFile}
              fileContent={fileContent}
              fileLoading={fileLoading}
              fileError={fileError}
              fileSaving={fileSaving}
              fileSaveError={fileSaveError}
              onSave={saveFile}
              onDirtyChange={setHasUnsavedChanges}
            />
          </div>
        </div>
      )}
    </>
  );
}
