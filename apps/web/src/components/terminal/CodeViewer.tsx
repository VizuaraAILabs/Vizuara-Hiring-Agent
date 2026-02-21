'use client';

import type { FileContent } from '@/hooks/useFileExplorer';

interface CodeViewerProps {
  selectedFile: string | null;
  fileContent: FileContent | null;
  fileLoading: boolean;
  fileError: string | null;
}

export default function CodeViewer({ selectedFile, fileContent, fileLoading, fileError }: CodeViewerProps) {
  if (!selectedFile) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-xs">
        Select a file to view
      </div>
    );
  }

  if (fileLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-5 w-5 border-2 border-cyan-400 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (fileError) {
    return (
      <div className="flex items-center justify-center h-full px-3">
        <p className="text-red-400 text-xs text-center">{fileError}</p>
      </div>
    );
  }

  if (!fileContent) return null;

  const lines = fileContent.content.split('\n');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex-shrink-0 px-3 py-1.5 border-b border-slate-700/50 bg-slate-900/50">
        <span className="text-xs text-slate-400 truncate block">{fileContent.path}</span>
      </div>

      {/* Truncation warning */}
      {fileContent.truncated && (
        <div className="flex-shrink-0 px-3 py-1 bg-amber-900/30 border-b border-amber-700/30">
          <span className="text-xs text-amber-400">
            File truncated — showing first 500KB of {(fileContent.size / 1024).toFixed(0)}KB
          </span>
        </div>
      )}

      {/* Code */}
      <div className="code-viewer-scroll flex-1 overflow-auto">
        <pre className="text-xs leading-relaxed font-mono">
          <table className="border-collapse">
            <tbody>
              {lines.map((line, i) => (
                <tr key={i}>
                  <td className="text-right pr-3 pl-2 text-slate-600 select-none align-top" style={{ minWidth: '3rem' }}>
                    {i + 1}
                  </td>
                  <td className="text-slate-300 pr-3 whitespace-pre">{line}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </pre>
      </div>
    </div>
  );
}
