'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

export interface FileContent {
  path: string;
  content: string;
  language: string;
  truncated: boolean;
  size: number;
}

const POLL_INTERVAL = 10_000;

function getTerminalHttpUrl(): string {
  if (process.env.NEXT_PUBLIC_TERMINAL_HTTP_URL) {
    return process.env.NEXT_PUBLIC_TERMINAL_HTTP_URL;
  }
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/terminal`;
  }
  return 'http://localhost:3001';
}

export function useFileExplorer(token: string) {
  const TERMINAL_HTTP_URL = getTerminalHttpUrl();
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch(`${TERMINAL_HTTP_URL}/api/files/tree?token=${encodeURIComponent(token)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to fetch file tree' }));
        throw new Error(data.error);
      }
      const data = await res.json();
      setTree(data.tree);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [token]);

  const selectFile = useCallback(async (filePath: string) => {
    setSelectedFile(filePath);
    setFileLoading(true);
    setFileError(null);

    try {
      const res = await fetch(
        `${TERMINAL_HTTP_URL}/api/files/read?token=${encodeURIComponent(token)}&path=${encodeURIComponent(filePath)}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to read file' }));
        throw new Error(data.error);
      }
      const data: FileContent = await res.json();
      setFileContent(data);
      setFileError(null);
    } catch (err: any) {
      setFileError(err.message);
      setFileContent(null);
    } finally {
      setFileLoading(false);
    }
  }, [token]);

  const closeFile = useCallback(() => {
    setSelectedFile(null);
    setFileContent(null);
    setFileError(null);
  }, []);

  const refresh = useCallback(async () => {
    await fetchTree();
    if (selectedFile) {
      await selectFile(selectedFile);
    }
  }, [fetchTree, selectedFile, selectFile]);

  // Initial fetch + polling
  useEffect(() => {
    fetchTree();

    intervalRef.current = setInterval(fetchTree, POLL_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchTree]);

  return {
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
  };
}
