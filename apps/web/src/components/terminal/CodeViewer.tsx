'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import type { OnChange, OnMount } from '@monaco-editor/react';
import ArcSpinner from '@/components/ArcSpinner';
import type { FileContent } from '@/hooks/useFileExplorer';

interface CodeViewerProps {
  selectedFile: string | null;
  fileContent: FileContent | null;
  fileLoading: boolean;
  fileError: string | null;
  fileSaving: boolean;
  fileSaveError: string | null;
  onSave: (filePath: string, content: string) => Promise<FileContent | null>;
  onDirtyChange?: (dirty: boolean) => void;
}

let monacoConfigPromise: Promise<void> | null = null;

function configureMonaco() {
  monacoConfigPromise ??= import('monaco-editor').then((monaco) => {
    loader.config({ monaco });
  });
  return monacoConfigPromise;
}

function getLanguage(filename: string, fallback?: string): string {
  if (fallback && fallback !== 'plaintext') return fallback;
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rb: 'ruby', rs: 'rust', go: 'go', java: 'java',
    c: 'c', h: 'c', cpp: 'cpp', hpp: 'cpp', cs: 'csharp',
    php: 'php', swift: 'swift', kt: 'kotlin',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini',
    html: 'html', css: 'css', scss: 'scss', md: 'markdown',
    sql: 'sql', xml: 'xml',
  };
  if (filename.toLowerCase() === 'dockerfile') return 'dockerfile';
  return map[ext] ?? fallback ?? 'plaintext';
}

export default function CodeViewer({
  selectedFile,
  fileContent,
  fileLoading,
  fileError,
  fileSaving,
  fileSaveError,
  onSave,
  onDirtyChange,
}: CodeViewerProps) {
  const [monacoReady, setMonacoReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    configureMonaco()
      .then(() => {
        if (!cancelled) setMonacoReady(true);
      })
      .catch((err: unknown) => {
        console.warn('[CodeViewer] Failed to configure Monaco:', err);
        if (!cancelled) setMonacoReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!selectedFile) return null;

  if (fileLoading || !monacoReady) {
    return (
      <div className="flex items-center justify-center h-full">
        <ArcSpinner label={fileLoading ? 'Loading file' : 'Opening editor'} sizeClassName="h-8 w-8" />
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
    <SingleFileEditor
      key={fileContent.path}
      selectedFile={selectedFile}
      fileContent={fileContent}
      fileSaving={fileSaving}
      fileSaveError={fileSaveError}
      onSave={onSave}
      onDirtyChange={onDirtyChange}
    />
  );
}

function SingleFileEditor({
  selectedFile,
  fileContent,
  fileSaving,
  fileSaveError,
  onSave,
  onDirtyChange,
}: {
  selectedFile: string;
  fileContent: FileContent;
  fileSaving: boolean;
  fileSaveError: string | null;
  onSave: (filePath: string, content: string) => Promise<FileContent | null>;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);
  const saveRef = useRef<() => void>(() => {});
  const saveInFlightRef = useRef(false);
  const [draftContent, setDraftContent] = useState(fileContent.content);
  const [savedContent, setSavedContent] = useState(fileContent.content);

  const isDirty = draftContent !== savedContent;
  const canEdit = !fileContent.truncated;
  const language = getLanguage(selectedFile, fileContent.language);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      if (cancelled) return;
      setDraftContent(fileContent.content);
      setSavedContent(fileContent.content);
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [fileContent.content]);

  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  const handleSave = useCallback(async () => {
    if (!selectedFile || !canEdit || !isDirty || fileSaving || saveInFlightRef.current) return;
    saveInFlightRef.current = true;
    try {
      const saved = await onSave(selectedFile, draftContent);
      if (!saved) return;
      setDraftContent(saved.content);
      setSavedContent(saved.content);
      onDirtyChange?.(false);
    } finally {
      saveInFlightRef.current = false;
    }
  }, [
    canEdit,
    draftContent,
    fileSaving,
    isDirty,
    onDirtyChange,
    onSave,
    selectedFile,
  ]);

  useEffect(() => {
    saveRef.current = () => {
      void handleSave();
    };
  }, [handleSave]);

  const handleEditorMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
      saveRef.current();
    });
    editor.onDidBlurEditorText(() => {
      saveRef.current();
    });
    editor.focus();
  };

  const handleChange: OnChange = (value) => {
    setDraftContent(value ?? '');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-white/5 bg-[#0d0d0d] px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] text-neutral-500">
              {fileContent.truncated
                ? 'Large file preview is read-only'
                : isDirty
                  ? 'Unsaved changes'
                  : 'Saved'}
            </p>
          </div>
          {!fileContent.truncated && (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={!isDirty || fileSaving}
              className="rounded border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[11px] font-medium text-neutral-200 transition hover:bg-white/[0.1] disabled:cursor-default disabled:border-white/5 disabled:bg-transparent disabled:text-neutral-600"
            >
              {fileSaving ? 'Saving...' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {fileSaveError && (
        <div className="shrink-0 px-3 py-1 bg-red-900/30 border-b border-red-700/30">
          <span className="text-xs text-red-300">{fileSaveError}</span>
        </div>
      )}

      {fileContent.truncated && (
        <div className="shrink-0 px-3 py-1 bg-amber-900/30 border-b border-amber-700/30">
          <span className="text-xs text-amber-400">
            File truncated - showing first 500KB of {(fileContent.size / 1024).toFixed(0)}KB
          </span>
        </div>
      )}

      <div className="relative flex-1 min-h-0 bg-[#0d0d0d]">
        <Editor
          height="100%"
          path={selectedFile}
          value={draftContent}
          language={language}
          theme="vs-dark"
          loading={<ArcSpinner label="Opening editor" sizeClassName="h-8 w-8" />}
          onMount={handleEditorMount}
          onChange={handleChange}
          options={{
            readOnly: !canEdit,
            minimap: { enabled: false },
            fontSize: 12,
            lineHeight: 20,
            tabSize: 2,
            insertSpaces: true,
            wordWrap: 'off',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            renderWhitespace: 'selection',
            bracketPairColorization: { enabled: true },
            padding: { top: 8, bottom: 8 },
            overviewRulerBorder: false,
          }}
        />
      </div>
    </div>
  );
}
