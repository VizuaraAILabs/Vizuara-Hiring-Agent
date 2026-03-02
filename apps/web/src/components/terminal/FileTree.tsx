'use client';

import type { FileNode } from '@/hooks/useFileExplorer';
import FileTreeNode, { type FileTreeActions } from './FileTreeNode';

interface FileTreeProps {
  tree: FileNode[];
  selectedFile: string | null;
  actions: FileTreeActions;
}

export default function FileTree({ tree, selectedFile, actions }: FileTreeProps) {
  function handleRootDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  async function handleRootDrop(e: React.DragEvent) {
    e.preventDefault();
    const srcPath = e.dataTransfer.getData('application/x-file-path');
    if (!srcPath) return;
    const fileName = srcPath.split('/').pop()!;
    // Already at root
    if (!srcPath.includes('/')) return;
    try {
      await actions.onMove(srcPath, fileName);
    } catch {
      // ignore
    }
  }

  if (tree.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-500 text-xs">
        No files yet
      </div>
    );
  }

  return (
    <div
      className="file-tree-scroll overflow-y-auto py-1"
      onDragOver={handleRootDragOver}
      onDrop={handleRootDrop}
    >
      {tree.map((node) => (
        <FileTreeNode
          key={node.path}
          node={node}
          depth={0}
          selectedFile={selectedFile}
          actions={actions}
        />
      ))}
    </div>
  );
}
