'use client';

import { useEffect, useCallback } from 'react';
import { useFileExplorer } from '@/hooks/useFileExplorer';
import FileTree from './FileTree';
import CodeViewer from './CodeViewer';
import type { FileTreeActions } from './FileTreeNode';
import ArcSpinner from '@/components/ArcSpinner';

interface FileExplorerProps {
  token: string;
  onReadyChange?: (ready: boolean, error?: string | null) => void;
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
    selectFile,
    closeFile,
    refresh,
  } = useFileExplorer(token);

  useEffect(() => {
    onReadyChange?.(!loading && !error, error);
  }, [loading, error, onReadyChange]);

  const handleSelectFile = useCallback((filePath: string) => {
    void selectFile(filePath);
  }, [selectFile]);

  const handleCloseFile = useCallback(() => {
    closeFile();
  }, [closeFile]);

  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const actions: FileTreeActions = {
    onSelectFile: handleSelectFile,
  };

  return (
    <>
      {/* Sidebar: file tree */}
      <div className="w-56 shrink-0 flex flex-col border-r border-white/5 bg-[#0a0a0a]">
        {/* Header with actions */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
          <span className="text-xs font-medium text-neutral-400">Files</span>
          <div className="flex items-center gap-1">
            <button
              onClick={handleRefresh}
              className="text-neutral-600 hover:text-neutral-300 text-sm px-1"
              title="Refresh"
            >
              ↻
            </button>
          </div>
        </div>

        {/* File tree */}
        <div className="flex-1 min-h-0 overflow-auto file-tree-scroll">
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

      {/* Slide-over code viewer panel */}
      {selectedFile && (
        <div className="w-[45%] max-w-2xl shrink-0 flex flex-col border-r border-white/5 bg-[#0d0d0d]">
          {/* Panel header with close button */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-surface">
            <span className="text-xs text-neutral-400 truncate font-mono">
              {fileContent?.path || selectedFile}
            </span>
            <button
              onClick={handleCloseFile}
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
