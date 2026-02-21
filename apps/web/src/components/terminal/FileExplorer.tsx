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
    closeFile,
    refresh,
  } = useFileExplorer(token);

  return (
    <>
      {/* Sidebar: file tree only (full height) */}
      <div className="w-56 flex-shrink-0 flex flex-col border-r border-white/5 bg-[#0a0a0a]">
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

        {/* File tree */}
        <div className="flex-1 min-h-0 overflow-auto file-tree-scroll">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin h-5 w-5 border-2 border-[#00a854] border-t-transparent rounded-full" />
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-32 px-3">
              <p className="text-red-400 text-xs text-center">{error}</p>
            </div>
          ) : (
            <FileTree tree={tree} selectedFile={selectedFile} onSelectFile={selectFile} />
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
