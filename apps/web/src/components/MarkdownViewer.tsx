'use client';

import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

const components: Components = {
  h1: ({ children }) => (
    <h1 className="text-xl font-semibold text-white mt-6 mb-3 first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-lg font-semibold text-white mt-5 mb-2 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-base font-medium text-white mt-4 mb-2 first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="text-sm font-medium text-white mt-3 mb-1 first:mt-0">{children}</h4>
  ),
  p: ({ children }) => (
    <p className="text-neutral-400 text-sm leading-relaxed mb-3 last:mb-0">{children}</p>
  ),
  ul: ({ children }) => (
    <ul className="list-disc list-outside pl-5 mb-3 space-y-1 text-neutral-400 text-sm">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="list-decimal list-outside pl-5 mb-3 space-y-1 text-neutral-400 text-sm">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-neutral-400 text-sm leading-relaxed">{children}</li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-white">{children}</strong>
  ),
  em: ({ children }) => (
    <em className="italic text-neutral-300">{children}</em>
  ),
  a: ({ href, children }) => (
    <a href={href} className="text-primary hover:text-primary-light underline underline-offset-2" target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  code: ({ className, children }) => {
    const isBlock = className?.includes('language-');
    if (isBlock) {
      return (
        <code className="block bg-[#0a0a0a] border border-white/5 rounded-lg p-4 font-mono text-xs text-neutral-300 overflow-x-auto mb-3">
          {children}
        </code>
      );
    }
    return (
      <code className="bg-white/5 border border-white/5 rounded px-1.5 py-0.5 font-mono text-xs text-primary">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="bg-[#0a0a0a] border border-white/5 rounded-lg p-4 overflow-x-auto mb-3 text-xs">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-primary/30 pl-4 my-3 text-neutral-500 italic">
      {children}
    </blockquote>
  ),
  hr: () => (
    <hr className="border-white/5 my-4" />
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-3">
      <table className="w-full text-sm text-neutral-400 border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-white/10 text-white text-xs">{children}</thead>
  ),
  th: ({ children }) => (
    <th className="text-left px-3 py-2 font-medium">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 border-b border-white/5">{children}</td>
  ),
};

interface MarkdownViewerProps {
  content: string;
  className?: string;
}

export default function MarkdownViewer({ content, className }: MarkdownViewerProps) {
  return (
    <div className={className}>
      <ReactMarkdown components={components}>{content}</ReactMarkdown>
    </div>
  );
}
