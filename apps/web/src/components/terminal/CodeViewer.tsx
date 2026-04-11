'use client';

import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';
import type { FileContent } from '@/hooks/useFileExplorer';

interface CodeViewerProps {
  selectedFile: string | null;
  fileContent: FileContent | null;
  fileLoading: boolean;
  fileError: string | null;
}

function getLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
    c: 'c', cpp: 'cpp', cs: 'csharp', php: 'php', swift: 'swift',
    kt: 'kotlin', sh: 'bash', bash: 'bash', zsh: 'bash',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'toml',
    html: 'html', css: 'css', scss: 'scss', md: 'markdown',
    sql: 'sql', dockerfile: 'dockerfile', xml: 'xml',
  };
  if (filename.toLowerCase() === 'dockerfile') return 'dockerfile';
  return map[ext] ?? 'text';
}

export default function CodeViewer({ selectedFile, fileContent, fileLoading, fileError }: CodeViewerProps) {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [hlLoading, setHlLoading] = useState(false);

  useEffect(() => {
    if (!fileContent || !selectedFile) {
      setHighlighted(null);
      return;
    }

    let cancelled = false;
    setHlLoading(true);

    const lang = getLanguage(selectedFile);
    codeToHtml(fileContent.content, {
      lang,
      theme: 'vitesse-dark',
    })
      .then((html) => { if (!cancelled) setHighlighted(html); })
      .catch(() => { if (!cancelled) setHighlighted(null); })
      .finally(() => { if (!cancelled) setHlLoading(false); });

    return () => { cancelled = true; };
  }, [selectedFile, fileContent]);

  if (!selectedFile) return null;

  if (fileLoading || hlLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin h-5 w-5 border-2 border-[#00a854] border-t-transparent rounded-full" />
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

  return (
    <div className="flex flex-col h-full">
      {fileContent.truncated && (
        <div className="shrink-0 px-3 py-1 bg-amber-900/30 border-b border-amber-700/30">
          <span className="text-xs text-amber-400">
            File truncated — showing first 500KB of {(fileContent.size / 1024).toFixed(0)}KB
          </span>
        </div>
      )}
      <div className="code-viewer-scroll flex-1 overflow-auto">
        {highlighted ? (
          <div
            className="text-xs leading-relaxed [&>pre]:bg-transparent! [&>pre]:p-2 [&>pre]:m-0"
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <pre className="text-xs leading-relaxed font-mono py-2">
            <table className="border-collapse w-full">
              <tbody>
                {fileContent.content.split('\n').map((line, i) => (
                  <tr key={i} className="hover:bg-white/2">
                    <td className="text-right pr-4 pl-3 text-neutral-700 select-none align-top sticky left-0 bg-[#0d0d0d]" style={{ minWidth: '3.5rem' }}>
                      {i + 1}
                    </td>
                    <td className="text-neutral-300 pr-4 whitespace-pre">{line}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </pre>
        )}
      </div>
    </div>
  );
}
