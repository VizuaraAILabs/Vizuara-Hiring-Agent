'use client';

import type { FileNode } from '@/hooks/useFileExplorer';
import FileTreeNode from './FileTreeNode';

interface FileTreeProps {
  tree: FileNode[];
  selectedFile: string | null;
  onSelectFile: (path: string) => void;
}

export default function FileTree({ tree, selectedFile, onSelectFile }: FileTreeProps) {
  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-xs">
        No files yet
      </div>
    );
  }

  return (
    <div className="file-tree-scroll overflow-y-auto py-1">
      {tree.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedFile={selectedFile}
          onSelectFile={onSelectFile}
        />
      ))}
    </div>
  );
}
