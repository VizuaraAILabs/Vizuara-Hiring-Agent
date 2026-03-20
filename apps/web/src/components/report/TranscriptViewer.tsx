'use client';

import { useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import type { Interaction } from '@/types';

interface TranscriptViewerProps {
  interactions: Interaction[];
  highlightIndex?: number;
  narrative?: string | null;
  narrativeLoading?: boolean;
  candidateName?: string;
}

function handleDownloadPDF(narrative: string, candidateName: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  // Minimal markdown renderer for the print window (no external deps)
  const escaped = narrative
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const html = escaped
    // Fenced code blocks
    .replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>')
    // Headings
    .replace(/^#### (.+)$/gm, '<h4>$1</h4>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold + italic
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Inline code
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // Unordered list items
    .replace(/^[-*] (.+)$/gm, '<li>$1</li>')
    // Ordered list items
    .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
    // Horizontal rules
    .replace(/^---$/gm, '<hr/>')
    // Wrap consecutive <li> runs in <ul>
    .replace(/(<li>.*<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`)
    // Double newlines → paragraph breaks
    .replace(/\n\n/g, '</p><p>')
    // Remaining single newlines
    .replace(/\n/g, '<br/>');

  const htmlContent = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Session Narrative — ${candidateName}</title>
    <style>
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
      body {
        font-family: Georgia, 'Times New Roman', serif;
        font-size: 14px;
        line-height: 1.8;
        color: #111;
        max-width: 780px;
        margin: 48px auto;
        padding: 0 32px;
      }
      h1 { font-size: 22px; margin-top: 32px; margin-bottom: 8px; }
      h2 { font-size: 18px; margin-top: 28px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
      h3 { font-size: 15px; margin-top: 20px; margin-bottom: 6px; }
      h4 { font-size: 14px; margin-top: 16px; margin-bottom: 4px; }
      p { margin: 10px 0; }
      ul, ol { margin: 8px 0 8px 24px; }
      li { margin: 5px 0; }
      code {
        background: #f3f3f3;
        border: 1px solid #ddd;
        border-radius: 3px;
        padding: 1px 5px;
        font-family: 'Courier New', monospace;
        font-size: 12.5px;
      }
      pre {
        background: #f3f3f3;
        border: 1px solid #ddd;
        border-radius: 5px;
        padding: 14px;
        overflow: auto;
        margin: 14px 0;
      }
      pre code { background: none; border: none; padding: 0; font-size: 12px; }
      hr { border: none; border-top: 1px solid #ddd; margin: 20px 0; }
      @media print { body { margin: 24px auto; } }
    </style>
  </head>
  <body>
    <p>${html}</p>
    <script>window.onload = function () { window.print(); };</script>
  </body>
</html>`;

  const blob = new Blob([htmlContent], { type: 'text/html; charset=utf-8' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  // Revoke after a short delay — enough time for the browser to load the blob
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export default function TranscriptViewer({
  interactions: _interactions,
  highlightIndex: _highlightIndex,
  narrative,
  narrativeLoading,
  candidateName = 'Candidate',
}: TranscriptViewerProps) {
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (narrative && topRef.current) {
      topRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [narrative]);

  if (narrativeLoading) {
    return (
      <div className="bg-[#111] border border-white/5 rounded-2xl p-12 flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-neutral-500 text-sm">Generating session narrative…</p>
        <p className="text-neutral-700 text-xs">This may take up to 30 seconds</p>
      </div>
    );
  }

  if (!narrative) {
    return (
      <div className="bg-[#111] border border-white/5 rounded-2xl p-12 flex flex-col items-center gap-3">
        <p className="text-neutral-500 text-sm">No narrative available for this session.</p>
      </div>
    );
  }

  return (
    <div ref={topRef} className="bg-[#111] border border-white/5 rounded-2xl p-6">
      {/* Header row */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-white">Session Narrative</h3>
          <p className="text-xs text-neutral-600 mt-0.5">
            AI-generated documentation of what the candidate did
          </p>
        </div>
        <button
          onClick={() => handleDownloadPDF(narrative, candidateName)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white/5 hover:bg-white/10 text-neutral-300 hover:text-white transition-colors cursor-pointer border border-white/5 shrink-0"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Download PDF
        </button>
      </div>

      {/* Rendered markdown */}
      <div
        className="
          prose prose-invert prose-sm max-w-none
          prose-headings:font-semibold prose-headings:text-white prose-headings:tracking-tight
          prose-h1:text-xl prose-h1:mt-8 prose-h1:mb-3
          prose-h2:text-lg prose-h2:mt-7 prose-h2:mb-2 prose-h2:border-b prose-h2:border-white/10 prose-h2:pb-2
          prose-h3:text-base prose-h3:mt-5 prose-h3:mb-1.5
          prose-p:text-neutral-300 prose-p:leading-7
          prose-li:text-neutral-300 prose-li:leading-relaxed
          prose-ul:my-3 prose-ol:my-3
          prose-code:text-primary prose-code:bg-primary/10 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
          prose-pre:bg-white/5 prose-pre:border prose-pre:border-white/10 prose-pre:rounded-xl
          prose-strong:text-white prose-strong:font-semibold
          prose-a:text-primary prose-a:no-underline hover:prose-a:underline
          prose-hr:border-white/10
          prose-blockquote:border-l-primary prose-blockquote:text-neutral-400
        "
      >
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{narrative}</ReactMarkdown>
      </div>
    </div>
  );
}
