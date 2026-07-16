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

interface TreeResponse {
  tree?: FileNode[];
}

interface CreateFileResponse extends TreeResponse {
  file?: FileContent;
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
  const [fileSaving, setFileSaving] = useState(false);
  const [fileSaveError, setFileSaveError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const selectRequestRef = useRef(0);
  const selectedFileRef = useRef<string | null>(null);

  useEffect(() => {
    selectedFileRef.current = selectedFile;
  }, [selectedFile]);

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
      setOperationError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch file tree');
    } finally {
      setLoading(false);
    }
  }, [apiUrl]);

  const selectFile = useCallback(async (filePath: string) => {
    const requestId = ++selectRequestRef.current;
    selectedFileRef.current = filePath;
    setSelectedFile(filePath);
    setFileContent(null);
    setFileLoading(true);
    setFileError(null);
    setFileSaveError(null);
    setOperationError(null);

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
    selectedFileRef.current = null;
    setSelectedFile(null);
    setFileContent(null);
    setFileError(null);
    setFileSaveError(null);
    setOperationError(null);
    setFileLoading(false);
  }, []);

  const saveFile = useCallback(async (filePath: string, content: string): Promise<FileContent | null> => {
    setFileSaving(true);
    setFileSaveError(null);

    try {
      setOperationError(null);
      const res = await fetch(
        `${terminalHttpUrl}/api/files/write?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: filePath, content }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'Failed to save file' }));
        throw new Error(data.error);
      }

      const data: FileContent = await res.json();
      if (selectedFileRef.current === filePath) {
        setFileContent(data);
        setFileError(null);
        setFileSaveError(null);
      }
      return data;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save file';
      if (selectedFileRef.current === filePath) {
        setFileSaveError(message);
      }
      return null;
    } finally {
      setFileSaving(false);
    }
  }, [terminalHttpUrl, token]);

  const postFileMutation = useCallback(async <T extends TreeResponse>(
    endpoint: string,
    body: Record<string, unknown>,
  ): Promise<{ data: T | null; error: string | null }> => {
    try {
      const res = await fetch(
        `${terminalHttpUrl}/api/files/${endpoint}?token=${encodeURIComponent(token)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: 'File operation failed' }));
        throw new Error(data.error);
      }

      const data: T = await res.json();
      setTree(data.tree ?? []);
      setOperationError(null);
      return { data, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'File operation failed';
      setOperationError(message);
      return { data: null, error: message };
    }
  }, [terminalHttpUrl, token]);

  const createFile = useCallback(async (filePath: string): Promise<{ file: FileContent | null; error: string | null }> => {
    const { data, error } = await postFileMutation<CreateFileResponse>('create', {
      path: filePath,
      content: '',
    });
    if (!data?.file) return { file: null, error };
    selectedFileRef.current = data.file.path;
    setSelectedFile(data.file.path);
    setFileContent(data.file);
    setFileError(null);
    setFileSaveError(null);
    setFileLoading(false);
    return { file: data.file, error: null };
  }, [postFileMutation]);

  const renamePath = useCallback(async (
    oldPath: string,
    newPath: string,
  ): Promise<{ result: { oldPath: string; newPath: string } | null; error: string | null }> => {
    const { data, error } = await postFileMutation<TreeResponse & { oldPath: string; newPath: string }>('rename', {
      oldPath,
      newPath,
    });
    if (!data) return { result: null, error };

    const current = selectedFileRef.current;
    if (current === oldPath || current?.startsWith(`${oldPath}/`)) {
      const renamedSelection = current === oldPath
        ? newPath
        : `${newPath}/${current.slice(oldPath.length + 1)}`;
      selectedFileRef.current = renamedSelection;
      await selectFile(renamedSelection);
    }

    return { result: { oldPath: data.oldPath, newPath: data.newPath }, error: null };
  }, [postFileMutation, selectFile]);

  const deletePath = useCallback(async (filePath: string): Promise<{ ok: boolean; error: string | null }> => {
    const { data, error } = await postFileMutation<TreeResponse & { deletedPath: string }>('delete', {
      path: filePath,
    });
    if (!data) return { ok: false, error };

    const current = selectedFileRef.current;
    if (current === filePath || current?.startsWith(`${filePath}/`)) {
      closeFile();
    }

    return { ok: true, error: null };
  }, [closeFile, postFileMutation]);

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
    fileSaving,
    fileSaveError,
    operationError,
    selectFile,
    closeFile,
    saveFile,
    createFile,
    renamePath,
    deletePath,
    refresh,
  };
}
