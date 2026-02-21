'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

interface UseTerminalOptions {
  token: string;
  onExit?: () => void;
}

export function useTerminal({ token, onExit }: UseTerminalOptions) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    const wsUrl = process.env.NEXT_PUBLIC_TERMINAL_WS_URL || 'ws://localhost:3001';
    const ws = new WebSocket(`${wsUrl}?token=${token}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Terminal] WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'connected':
            setConnected(true);
            break;
          case 'output':
            terminalRef.current?.write(msg.data);
            break;
          case 'exit':
            onExit?.();
            break;
          case 'error':
            console.error('[Terminal]', msg.message);
            break;
        }
      } catch {
        // Raw data fallback
        terminalRef.current?.write(event.data);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      // Attempt reconnection after 2 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          console.log('[Terminal] Attempting reconnection...');
          connect();
        }
      }, 2000);
    };

    ws.onerror = (err) => {
      console.error('[Terminal] WebSocket error:', err);
    };
  }, [token, onExit]);

  const initTerminal = useCallback((container: HTMLDivElement) => {
    if (terminalRef.current) return;

    containerRef.current = container;

    const terminal = new Terminal({
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#22d3ee',
        cursorAccent: '#0f172a',
        selectionBackground: '#334155',
        black: '#0f172a',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e2e8f0',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Menlo, monospace',
      fontSize: 14,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminal.open(container);
    fitAddon.fit();
    terminal.focus();
    terminal.write('Connecting to terminal...\r\n');

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    // Handle user input
    terminal.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows })
        );
      }
    });
    resizeObserver.observe(container);

    // Connect WebSocket
    connect();

    return () => {
      resizeObserver.disconnect();
    };
  }, [connect]);

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
      terminalRef.current?.dispose();
      terminalRef.current = null;
    };
  }, []);

  return {
    initTerminal,
    connected,
    terminal: terminalRef.current,
  };
}
