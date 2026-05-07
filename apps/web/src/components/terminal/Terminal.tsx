'use client';

import { useRef, useCallback } from 'react';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from '@/hooks/useTerminal';

interface TerminalProps {
  token: string;
  onExit?: () => void;
}

export default function TerminalComponent({ token, onExit }: TerminalProps) {
  const { initTerminal, connected } = useTerminal({ token, onExit });
  const initializedRef = useRef(false);

  const setRef = useCallback((el: HTMLDivElement | null) => {
    if (el && !initializedRef.current) {
      initializedRef.current = true;
      // Small delay to ensure container has dimensions
      setTimeout(() => {
        initTerminal(el);
      }, 100);
    }
  }, [initTerminal]);

  return (
    <div className="relative" style={{ height: '100%', minHeight: '400px' }}>
      {!connected && (
        <div className="absolute inset-0 bg-[#0a0a0a]/80 flex items-center justify-center z-10">
          <div className="text-center">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-neutral-500 text-sm">Connecting to terminal...</p>
          </div>
        </div>
      )}
      <div
        ref={setRef}
        style={{ height: '100%', width: '100%', padding: '8px', minHeight: '400px' }}
      />
    </div>
  );
}
