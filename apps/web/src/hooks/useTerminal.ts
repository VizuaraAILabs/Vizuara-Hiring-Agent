'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

interface UseTerminalOptions {
  token: string;
  onExit?: () => void;
}

const CUSTOMER_SAFE_TERMINAL_ERROR =
  'We could not open your assessment workspace. Please refresh and try again. If the problem continues, contact your assessment administrator.';

function toCustomerSafeTerminalError(message: unknown): string {
  if (typeof message !== 'string' || !message.trim()) {
    return CUSTOMER_SAFE_TERMINAL_ERROR;
  }

  const lowerMessage = message.toLowerCase();
  const containsInternalDetail = [
    'docker',
    'container',
    'sandbox',
    'terminal server',
    'image',
    'logs',
    'session token',
  ].some((term) => lowerMessage.includes(term));

  return containsInternalDetail ? CUSTOMER_SAFE_TERMINAL_ERROR : message;
}

export function useTerminal({ token, onExit }: UseTerminalOptions) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [connected, setConnected] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Connecting to terminal...');
  const [terminalError, setTerminalError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const spawnAckedRef = useRef(false);
  const fatalErrorRef = useRef(false);
  const connectRef = useRef<() => void>(() => {});

  const sendResize = useCallback(() => {
    const terminal = terminalRef.current;
    const ws = wsRef.current;
    if (!terminal || ws?.readyState !== WebSocket.OPEN) return;

    ws.send(JSON.stringify({ type: 'resize', cols: terminal.cols, rows: terminal.rows }));
  }, []);

  const refitTerminal = useCallback(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    fitAddon.fit();
    terminal.refresh(0, terminal.rows - 1);
    sendResize();
  }, [sendResize]);

  const connect = useCallback(() => {
    // NEXT_PUBLIC_* vars are inlined at build time. In production Docker builds
    // they may be absent, so derive from the current page URL (Caddy routes
    // /terminal to the terminal service).
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = process.env.NEXT_PUBLIC_TERMINAL_WS_URL || `${protocol}//${window.location.host}/terminal`;
    const ws = new WebSocket(`${wsUrl}?token=${token}`);
    wsRef.current = ws;
    spawnAckedRef.current = false;
    fatalErrorRef.current = false;
    setTerminalError(null);
    setStatusMessage('Connecting to terminal...');

    ws.onopen = () => {
      console.log('[Terminal] WebSocket connected');
      refitTerminal();
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
            setStatusMessage('Starting workspace...');
            console.log('[Terminal] Container spawning...');
            break;
          case 'queued':
            spawnAckedRef.current = true;
            setStatusMessage(msg.message || 'Server is at capacity. You are in the queue...');
            terminalRef.current?.write(`\r\n${msg.message || 'Server is at capacity. You are in the queue...'}\r\n`);
            break;
          case 'connected':
            spawnAckedRef.current = true;
            setConnected(true);
            setStatusMessage('');
            refitTerminal();
            requestAnimationFrame(refitTerminal);
            window.setTimeout(refitTerminal, 150);
            window.setTimeout(refitTerminal, 500);
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
            fatalErrorRef.current = true;
            const safeMessage = toCustomerSafeTerminalError(msg.message);
            setTerminalError(safeMessage);
            terminalRef.current?.write(`\r\nError: ${safeMessage}\r\n`);
            console.error('[Terminal] Workspace startup failed');
            break;
        }
      } catch {
        // Raw data fallback
        terminalRef.current?.write(event.data);
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (fatalErrorRef.current) return;
      // If the server acked a spawn but hasn't sent 'connected' yet, wait longer
      // before reconnecting so we don't interrupt an in-progress container spawn.
      const delay = spawnAckedRef.current ? 5000 : 2000;
      reconnectTimeoutRef.current = setTimeout(() => {
        if (wsRef.current?.readyState === WebSocket.CLOSED) {
          console.log('[Terminal] Attempting reconnection...');
          connectRef.current();
        }
      }, delay);
    };

    ws.onerror = (err) => {
      console.error('[Terminal] WebSocket error:', err);
    };
  }, [token, onExit, refitTerminal]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

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
      fontFamily: '"Cascadia Mono", Consolas, "Liberation Mono", "Courier New", monospace',
      fontSize: 14,
      fontWeight: 400,
      fontWeightBold: 400,
      lineHeight: 1.25,
      letterSpacing: 0,
      cursorBlink: true,
      cursorStyle: 'bar',
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    terminal.open(container);
    refitTerminal();
    terminal.focus();
    terminal.write('Connecting to terminal...\r\n');

    requestAnimationFrame(refitTerminal);
    window.setTimeout(refitTerminal, 250);
    window.setTimeout(refitTerminal, 1000);
    document.fonts?.ready.then(refitTerminal).catch(() => {});

    // Handle user input
    terminal.onData((data) => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      }
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      refitTerminal();
    });
    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    // Connect WebSocket
    connect();

    return () => {
      resizeObserver.disconnect();
      resizeObserverRef.current = null;
    };
  }, [connect, refitTerminal]);

  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      wsRef.current?.close();
      terminalRef.current?.dispose();
      terminalRef.current = null;
    };
  }, []);

  return {
    initTerminal,
    connected,
    statusMessage,
    terminalError,
  };
}
