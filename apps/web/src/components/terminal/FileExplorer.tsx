'use client';

import { useEffect, useCallback, useRef, useState } from 'react';
import { FilePlus, RefreshCw, X } from 'lucide-react';
import { useFileExplorer } from '@/hooks/useFileExplorer';
import FileTree from './FileTree';
import CodeViewer from './CodeViewer';
import type { FileTreeActions } from './FileTreeNode';
import ArcSpinner from '@/components/ArcSpinner';
import ConfirmationModal from '@/components/ConfirmationModal';

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
  const [renameTarget, setRenameTarget] = useState<{
    path: string;
    type: 'file' | 'directory';
    affectsOpenFile: boolean;
  } | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    path: string;
    type: 'file' | 'directory';
    affectsOpenFile: boolean;
  } | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [createTarget, setCreateTarget] = useState<{ parent: string | null } | null>(null);
  const [createValue, setCreateValue] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const [discardTarget, setDiscardTarget] = useState<
    { action: 'select'; filePath: string } | { action: 'close' } | null
  >(null);

  useEffect(() => {
    onReadyChange?.(!loading && !error, error);
  }, [loading, error, onReadyChange]);

  useEffect(() => {
    if (!renameTarget) return;
    const timer = window.setTimeout(() => {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [renameTarget]);

  useEffect(() => {
    if (!createTarget) return;
    const timer = window.setTimeout(() => {
      createInputRef.current?.focus();
      createInputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [createTarget]);

  const handleSelectFile = useCallback((filePath: string) => {
    if (filePath === selectedFile) return;
    if (hasUnsavedChanges) {
      setDiscardTarget({ action: 'select', filePath });
      return;
    }
    setHasUnsavedChanges(false);
    void selectFile(filePath);
  }, [hasUnsavedChanges, selectFile, selectedFile]);

  const handleCloseFile = useCallback(() => {
    if (hasUnsavedChanges) {
      setDiscardTarget({ action: 'close' });
      return;
    }
    setHasUnsavedChanges(false);
    closeFile();
  }, [closeFile, hasUnsavedChanges]);

  const closeDiscardModal = useCallback(() => {
    setDiscardTarget(null);
  }, []);

  const confirmDiscard = useCallback(() => {
    if (!discardTarget) return;

    setHasUnsavedChanges(false);
    if (discardTarget.action === 'select') {
      void selectFile(discardTarget.filePath);
    } else {
      closeFile();
    }
    setDiscardTarget(null);
  }, [closeFile, discardTarget, selectFile]);

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const handleCreateFile = useCallback((parent: string | null) => {
    setCreateTarget({ parent });
    setCreateValue('new-file.txt');
    setCreateError(null);
  }, []);

  const closeCreateModal = useCallback(() => {
    if (createSubmitting) return;
    setCreateTarget(null);
    setCreateValue('');
    setCreateError(null);
  }, [createSubmitting]);

  const confirmCreate = useCallback(() => {
    if (!createTarget || createSubmitting) return;

    const nextName = createValue.trim();
    if (!nextName) {
      setCreateError('Enter a file name.');
      return;
    }
    if (createTarget.parent && (nextName.includes('/') || nextName.includes('\\'))) {
      setCreateError('Enter only a name. This file will be created in the selected folder.');
      return;
    }

    const filePath = createTarget.parent ? `${createTarget.parent}/${nextName}` : nextName;
    setCreateSubmitting(true);
    setCreateError(null);

    void createFile(filePath)
      .then(({ file, error }) => {
        if (!file) {
          setCreateError(error || 'File creation failed. Please try again.');
          return;
        }
        setHasUnsavedChanges(false);
        setCreateTarget(null);
        setCreateValue('');
      })
      .finally(() => setCreateSubmitting(false));
  }, [createFile, createSubmitting, createTarget, createValue]);

  const handleRenamePath = useCallback((path: string, type: 'file' | 'directory') => {
    const affectsOpenFile = pathInScope(selectedFile, path);
    setRenameTarget({ path, type, affectsOpenFile });
    setRenameValue(leafName(path));
    setRenameError(null);
  }, [selectedFile]);

  const closeRenameModal = useCallback(() => {
    if (renameSubmitting) return;
    setRenameTarget(null);
    setRenameValue('');
    setRenameError(null);
  }, [renameSubmitting]);

  const confirmRename = useCallback(() => {
    if (!renameTarget || renameSubmitting) return;

    const nextName = renameValue.trim();
    if (!nextName) {
      setRenameError('Enter a file or folder name.');
      return;
    }
    if (nextName.includes('/') || nextName.includes('\\')) {
      setRenameError('Enter only a name. Move files from the terminal if you need to change folders.');
      return;
    }
    if (nextName === leafName(renameTarget.path)) {
      closeRenameModal();
      return;
    }

    setRenameSubmitting(true);
    setRenameError(null);
    const base = parentPath(renameTarget.path);
    const nextPath = base ? `${base}/${nextName}` : nextName;

    void renamePath(renameTarget.path, nextPath)
      .then(({ result, error }) => {
        if (!result) {
          setRenameError(error || 'Rename failed. Please try again.');
          return;
        }
        if (renameTarget.affectsOpenFile) setHasUnsavedChanges(false);
        setRenameTarget(null);
        setRenameValue('');
      })
      .finally(() => setRenameSubmitting(false));
  }, [closeRenameModal, renamePath, renameSubmitting, renameTarget, renameValue]);

  const handleDeletePath = useCallback((path: string, type: 'file' | 'directory') => {
    const affectsOpenFile = pathInScope(selectedFile, path);
    setDeleteTarget({ path, type, affectsOpenFile });
    setDeleteError(null);
  }, [selectedFile]);

  const closeDeleteModal = useCallback(() => {
    if (deleteSubmitting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }, [deleteSubmitting]);

  const confirmDelete = useCallback(() => {
    if (!deleteTarget || deleteSubmitting) return;

    setDeleteSubmitting(true);
    setDeleteError(null);

    void deletePath(deleteTarget.path)
      .then(({ ok, error }) => {
        if (!ok) {
          setDeleteError(error || 'Delete failed. Please try again.');
          return;
        }
        if (deleteTarget.affectsOpenFile) setHasUnsavedChanges(false);
        setDeleteTarget(null);
      })
      .finally(() => setDeleteSubmitting(false));
  }, [deletePath, deleteSubmitting, deleteTarget]);

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

      <ConfirmationModal
        open={Boolean(createTarget)}
        title="Create file"
        description={
          createTarget?.parent
            ? `Create a new file in "${createTarget.parent}".`
            : 'Create a new file in the workspace.'
        }
        confirmLabel="Create"
        cancelLabel="Cancel"
        isLoading={createSubmitting}
        error={createError}
        onConfirm={confirmCreate}
        onClose={closeCreateModal}
      >
        <label htmlFor="createPathValue" className="block text-xs text-neutral-500 mb-1.5">
          {createTarget?.parent ? 'Name' : 'Path'}
        </label>
        <input
          ref={createInputRef}
          id="createPathValue"
          type="text"
          value={createValue}
          onChange={(event) => {
            setCreateValue(event.target.value);
            setCreateError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              confirmCreate();
            }
          }}
          disabled={createSubmitting}
          className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-primary disabled:opacity-60"
          autoComplete="off"
        />
        {hasUnsavedChanges && (
          <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
            Creating this file will open it and discard unsaved edits in the current file.
          </div>
        )}
      </ConfirmationModal>

      <ConfirmationModal
        open={Boolean(renameTarget)}
        title={`Rename ${renameTarget?.type ?? 'file'}`}
        description={
          renameTarget?.affectsOpenFile && hasUnsavedChanges
            ? 'This item is open with unsaved changes. Renaming it will discard those unsaved edits.'
            : 'Enter a new name for this workspace item.'
        }
        confirmLabel="Rename"
        cancelLabel="Cancel"
        isLoading={renameSubmitting}
        error={renameError}
        onConfirm={confirmRename}
        onClose={closeRenameModal}
      >
        <label htmlFor="renamePathValue" className="block text-xs text-neutral-500 mb-1.5">
          Name
        </label>
        <input
          ref={renameInputRef}
          id="renamePathValue"
          type="text"
          value={renameValue}
          onChange={(event) => {
            setRenameValue(event.target.value);
            setRenameError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              confirmRename();
            }
          }}
          disabled={renameSubmitting}
          className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-primary disabled:opacity-60"
          autoComplete="off"
        />
      </ConfirmationModal>

      <ConfirmationModal
        open={Boolean(deleteTarget)}
        title={`Delete ${deleteTarget?.type ?? 'file'}`}
        description={
          deleteTarget?.type === 'directory'
            ? `Delete folder "${deleteTarget.path}" and everything inside it?`
            : `Delete file "${deleteTarget?.path ?? ''}"?`
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deleteSubmitting}
        error={deleteError}
        onConfirm={confirmDelete}
        onClose={closeDeleteModal}
      >
        {deleteTarget?.affectsOpenFile && hasUnsavedChanges && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-200">
            This item is open with unsaved changes. Deleting it will discard those unsaved edits.
          </div>
        )}
      </ConfirmationModal>

      <ConfirmationModal
        open={Boolean(discardTarget)}
        title="Discard unsaved changes?"
        description={
          discardTarget?.action === 'select'
            ? 'Opening another file will discard the unsaved edits in the current file.'
            : 'Closing this file will discard its unsaved edits.'
        }
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        variant="danger"
        onConfirm={confirmDiscard}
        onClose={closeDiscardModal}
      />
    </>
  );
}
