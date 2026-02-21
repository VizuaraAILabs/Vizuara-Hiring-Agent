'use client';

import { useFileExplorer } from '@/hooks/useFileExplorer';
import FileTree from './FileTree';
import CodeViewer from './CodeViewer';

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
    refresh,
  } = useFileExplorer(token);

  return (
    <div className="w-80 flex-shrink-0 flex flex-col border-r border-white/5 bg-[#0a0a0a]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
        <span className="text-xs font-medium text-neutral-400">Files</span>
        <button
          onClick={refresh}
          className="text-neutral-600 hover:text-neutral-300 text-sm"
          title="Refresh"
        >
          ↻
        </button>
      </div>

      {/* File tree (top half) */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin h-5 w-5 border-2 border-[#00a854] border-t-transparent rounded-full" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full px-3">
            <p className="text-red-400 text-xs text-center">{error}</p>
          </div>
        ) : (
          <FileTree tree={tree} selectedFile={selectedFile} onSelectFile={selectFile} />
        )}
      </div>

      {/* Divider */}
      <div className="border-t border-white/5" />

      {/* Code viewer (bottom half) */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <CodeViewer
          selectedFile={selectedFile}
          fileContent={fileContent}
          fileLoading={fileLoading}
          fileError={fileError}
        />
      </div>
    </div>
  );
}
