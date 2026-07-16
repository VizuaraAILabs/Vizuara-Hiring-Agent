'use client';

import { useEffect, useRef, useCallback } from 'react';
import '@xterm/xterm/css/xterm.css';
import { useTerminal } from '@/hooks/useTerminal';
import ArcSpinner from '@/components/ArcSpinner';

interface TerminalProps {
  token: string;
  onExit?: () => void;
  onConnectionChange?: (connected: boolean) => void;
  onStatusChange?: (status: string) => void;
  onErrorChange?: (error: string | null) => void;
  onClaudeGatewayUnavailable?: () => void;
}

export default function TerminalComponent({
  token,
  onExit,
  onConnectionChange,
  onStatusChange,
  onErrorChange,
  onClaudeGatewayUnavailable,
}: TerminalProps) {
  const { initTerminal, connected, statusMessage, terminalError, claudeGatewayUnavailable } = useTerminal({ token, onExit });
  const initializedRef = useRef(false);

  useEffect(() => {
    onConnectionChange?.(connected);
  }, [connected, onConnectionChange]);

  useEffect(() => {
    onStatusChange?.(statusMessage);
  }, [statusMessage, onStatusChange]);

  useEffect(() => {
    onErrorChange?.(terminalError);
  }, [terminalError, onErrorChange]);

  useEffect(() => {
    if (claudeGatewayUnavailable) onClaudeGatewayUnavailable?.();
  }, [claudeGatewayUnavailable, onClaudeGatewayUnavailable]);

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
          <div className="max-w-md rounded-2xl border border-white/10 bg-surface px-6 py-5 text-center shadow-2xl">
            {terminalError ? (
              <>
                <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-red-500/25 bg-red-500/10 text-red-300">
                  !
                </div>
                <p className="text-sm font-semibold text-white">Workspace could not start</p>
                <p className="mt-2 text-sm leading-6 text-neutral-400">{terminalError}</p>
              </>
            ) : (
              <>
                <ArcSpinner label={statusMessage || 'Connecting to terminal'} sizeClassName="mx-auto h-10 w-10" />
                <p className="mt-3 text-neutral-500 text-sm">{statusMessage || 'Connecting to terminal...'}</p>
              </>
            )}
          </div>
        </div>
      )}
      <div
        style={{
          height: '100%',
          width: '100%',
          minHeight: '400px',
          padding: '8px 24px 8px 8px',
          boxSizing: 'border-box',
        }}
      >
        <div
          ref={setRef}
          style={{ height: '100%', width: '100%', minHeight: '384px' }}
        />
      </div>
    </div>
  );
}
