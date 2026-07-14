'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

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
  const terminalHttpUrl = useMemo(() => getTerminalHttpUrl(), []);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<FileContent | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectRequestRef = useRef(0);

  const apiUrl = useCallback((endpoint: string) =>
    `${terminalHttpUrl}/api/files/${endpoint}?token=${encodeURIComponent(token)}`,
  [terminalHttpUrl, token]);

  const fetchTree = useCallback(async () => {
    try {
      const res = await fetch(apiUrl('tree'));
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to fetch file tree' }));
        throw new Error(data.error);
      }
      const data = await res.json();
      setTree(data.tree ?? []);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch file tree');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  const selectFile = useCallback(async (filePath: string) => {
    const requestId = ++selectRequestRef.current;
    setSelectedFile(filePath);
    setFileLoading(true);
    setFileError(null);

    try {
      const res = await fetch(
        `${terminalHttpUrl}/api/files/read?token=${encodeURIComponent(token)}&path=${encodeURIComponent(filePath)}`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to read file' }));
        throw new Error(data.error);
      }
      const data: FileContent = await res.json();
      if (requestId !== selectRequestRef.current) return;
      setFileContent(data);
      setFileError(null);
    } catch (err: unknown) {
      if (requestId !== selectRequestRef.current) return;
      setFileError(err instanceof Error ? err.message : 'Failed to read file');
      setFileContent(null);
    } finally {
      if (requestId === selectRequestRef.current) {
        setFileLoading(false);
      }
    }
  }, [terminalHttpUrl, token]);

  const closeFile = useCallback(() => {
    selectRequestRef.current++;
    setSelectedFile(null);
    setFileContent(null);
    setFileError(null);
    setFileLoading(false);
  }, []);

  const refresh = useCallback(async () => {
    await fetchTree();
  }, [fetchTree]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${terminalHttpUrl}/api/editor/context?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeFile: selectedFile }),
      signal: controller.signal,
    }).catch((err: unknown) => {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      console.warn('[FileExplorer] Failed to sync active editor file:', err);
    });

    return () => controller.abort();
  }, [selectedFile, terminalHttpUrl, token]);

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
