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

  const spawnAckedRef = useRef(false);

  const connect = useCallback(() => {
    // NEXT_PUBLIC_* vars are inlined at build time. In production Docker builds
    // they may be absent, so derive from the current page URL (Caddy routes
    // /terminal to the terminal service).
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = process.env.NEXT_PUBLIC_TERMINAL_WS_URL || `${protocol}//${window.location.host}/terminal`;
    const ws = new WebSocket(`${wsUrl}?token=${token}`);
    wsRef.current = ws;
    spawnAckedRef.current = false;

    ws.onopen = () => {
      console.log('[Terminal] WebSocket connected');
      // Send a ping every 30s to keep the connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        } else {
          clearInterval(pingInterval);
        }
      }, 30_000);
      ws.addEventListener('close', () => clearInterval(pingInterval));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        switch (msg.type) {
          case 'spawning':
            spawnAckedRef.current = true;
            console.log('[Terminal] Container spawning...');
            break;
          case 'connected':
            spawnAckedRef.current = true;
            setConnected(true);
            if (msg.reconnected) {
              console.log('[Terminal] Reconnected to existing session');
            }
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
      // If the server acked a spawn but hasn't sent 'connected' yet, wait longer
      // before reconnecting so we don't interrupt an in-progress container spawn.
      const delay = spawnAckedRef.current ? 5000 : 2000;
      reconnectTimeoutRef.current = setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          console.log('[Terminal] Attempting reconnection...');
          connect();
        }
      }, delay);
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
