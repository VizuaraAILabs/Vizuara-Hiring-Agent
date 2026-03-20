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

  const apiUrl = (endpoint: string) =>
    `${TERMINAL_HTTP_URL}/api/files/${endpoint}?token=${encodeURIComponent(token)}`;

  const postApi = useCallback(async (endpoint: string, body: Record<string, string>) => {
    const res = await fetch(apiUrl(endpoint), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(data.error);
    }
    return res.json();
  }, [token]);

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

  // --- File mutation operations ---

  const createNewFile = useCallback(async (filePath: string) => {
    await postApi('create', { path: filePath });
    await fetchTree();
  }, [postApi, fetchTree]);

  const createNewDirectory = useCallback(async (dirPath: string) => {
    await postApi('mkdir', { path: dirPath });
    await fetchTree();
  }, [postApi, fetchTree]);

  const renameItem = useCallback(async (oldPath: string, newPath: string) => {
    await postApi('rename', { oldPath, newPath });
    if (selectedFile === oldPath) {
      setSelectedFile(newPath);
    }
    await fetchTree();
  }, [postApi, fetchTree, selectedFile]);

  const deleteItem = useCallback(async (filePath: string) => {
    await postApi('delete', { path: filePath });
    if (selectedFile === filePath) {
      closeFile();
    }
    await fetchTree();
  }, [postApi, fetchTree, selectedFile, closeFile]);

  const moveItem = useCallback(async (srcPath: string, destPath: string) => {
    await postApi('move', { srcPath, destPath });
    if (selectedFile === srcPath) {
      setSelectedFile(destPath);
    }
    await fetchTree();
  }, [postApi, fetchTree, selectedFile]);

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
    createNewFile,
    createNewDirectory,
    renameItem,
    deleteItem,
    moveItem,
  };
}
