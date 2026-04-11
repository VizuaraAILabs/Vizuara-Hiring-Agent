import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import postgres from 'postgres';
import path from 'path';
import dotenv from 'dotenv';
import { DockerManager } from './docker-manager';
import { InteractionLogger } from './interaction-logger';
import { validateSessionToken } from './auth-middleware';
import * as fs from 'fs';
import { buildFileTree, readFileContent, createFile, createDirectory, renameFile, deleteFile, moveFile, FileNode } from './file-service';
import { CostTracker } from './cost-tracker';
import { ActivityMonitor } from './activity-monitor';

// Load env from root — __dirname is apps/terminal-server/src, root is ../../..
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });

const PORT = parseInt(process.env.TERMINAL_PORT || '3001');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://hiring:hiring@localhost:5432/hiring_agent';
const NEXT_APP_URL = process.env.NEXT_APP_URL || 'http://localhost:3000';

// Initialize postgres connection
const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

const dockerManager = new DockerManager();
const logger = new InteractionLogger(sql);
const costTracker = new CostTracker(sql);

// Route aggregated, classified interactions to the per-session activity monitor.
// This fires after the debounce window collapses keystrokes into complete commands.
logger.onFlush((sessionId, content, contentType) => {
  activityMonitors.get(sessionId)?.observe(content, contentType);
});

const disconnectTimers: Map<string, NodeJS.Timeout> = new Map();

// Per-session activity monitors for the AI interviewer
const activityMonitors: Map<string, ActivityMonitor> = new Map();

// Periodically kill containers for sessions that have been ended (by button or timer expiry)
// but whose WebSocket was already disconnected so the close handler couldn't clean up.
setInterval(async () => {
  const activeSessionIds = dockerManager.sessionIds;
  if (activeSessionIds.length === 0) return;

  try {
    const rows = await sql<{ id: string; status: string }[]>`
      SELECT id, status FROM sessions WHERE id = ANY(${activeSessionIds})
    `;
    for (const row of rows) {
      if (row.status === 'completed' || row.status === 'analyzed') {
        console.log(`[Terminal] Periodic check: killing container for completed session ${row.id}`);
        await costTracker.endSession(row.id);
        activityMonitors.get(row.id)?.destroy();
        activityMonitors.delete(row.id);
        const dyingSession = dockerManager.getSession(row.id);
        if (dyingSession) await archiveWorkspace(row.id, dyingSession.workDir);
        await dockerManager.kill(row.id);
      }
    }
  } catch (err) {
    console.error('[Terminal] Periodic session check failed:', err);
  }
}, 30_000);

// Archive all workspace files to PostgreSQL when a session ends.
// Non-fatal: errors are logged but never block session completion.
async function archiveWorkspace(sessionId: string, workDir: string): Promise<void> {
  if (!fs.existsSync(workDir)) {
    console.log(`[Archive] No workspace dir for ${sessionId}, skipping`);
    return;
  }
  try {
    const tree = buildFileTree(workDir);
    const filePaths: string[] = [];
    function collect(nodes: FileNode[]) {
      for (const n of nodes) {
        if (n.type === 'file') filePaths.push(n.path);
        else if (n.children) collect(n.children);
      }
    }
    collect(tree);

    const files = [];
    for (const p of filePaths) {
      try {
        files.push(readFileContent(workDir, p));
      } catch {
        // skip binary / unreadable files
      }
    }

    const snapshot = { archived_at: new Date().toISOString(), tree, files };
    await sql`
      UPDATE sessions
      SET workspace_snapshot = ${JSON.stringify(snapshot)}::jsonb
      WHERE id = ${sessionId}
    `;
    console.log(`[Archive] Saved ${files.length} file(s) for session ${sessionId}`);
  } catch (err) {
    console.error(`[Archive] Failed for session ${sessionId}:`, err);
  }
}

// HTTP server for health checks and file API
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  const pathname = url.pathname;

  // CORS headers for all responses
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  // File API endpoints
  const FILE_API_ROUTES = ['/api/files/tree', '/api/files/read', '/api/files/create', '/api/files/mkdir', '/api/files/rename', '/api/files/delete', '/api/files/move'];
  if (FILE_API_ROUTES.includes(pathname)) {
    const token = url.searchParams.get('token');
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'No token provided' }));
      return;
    }

    const sessionInfo = await validateSessionToken(token, sql);
    if (!sessionInfo) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid or expired session token' }));
      return;
    }

    const session = dockerManager.getSession(sessionInfo.sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Session not found — terminal may not be started yet' }));
      return;
    }

    const workDir = session.workDir;

    if (pathname === '/api/files/tree') {
      try {
        const tree = buildFileTree(workDir);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tree }));
      } catch (err: any) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message || 'Failed to read file tree' }));
      }
      return;
    }

    if (pathname === '/api/files/read') {
      const filePath = url.searchParams.get('path');
      if (!filePath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing path parameter' }));
        return;
      }

      try {
        const result = readFileContent(workDir, filePath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        const message = err.message || 'Failed to read file';
        const status = message === 'File not found' ? 404
          : message === 'Path traversal detected' ? 403
          : 400;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: message }));
      }
      return;
    }

    // --- Mutation endpoints (POST/DELETE) ---

    // Helper to read JSON body
    const readBody = (): Promise<Record<string, string>> =>
      new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: Buffer) => { data += chunk; });
        req.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { reject(new Error('Invalid JSON')); }
        });
        req.on('error', reject);
      });

    if (pathname === '/api/files/create' && req.method === 'POST') {
      try {
        const body = await readBody();
        if (!body.path) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing path' })); return; }
        createFile(workDir, body.path, body.content || '');
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err: any) {
        const status = err.message === 'Path traversal detected' ? 403 : 400;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/files/mkdir' && req.method === 'POST') {
      try {
        const body = await readBody();
        if (!body.path) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing path' })); return; }
        createDirectory(workDir, body.path);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err: any) {
        const status = err.message === 'Path traversal detected' ? 403 : 400;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/files/rename' && req.method === 'POST') {
      try {
        const body = await readBody();
        if (!body.oldPath || !body.newPath) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing oldPath or newPath' })); return; }
        renameFile(workDir, body.oldPath, body.newPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err: any) {
        const status = err.message === 'Path traversal detected' ? 403 : 400;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/files/delete' && req.method === 'POST') {
      try {
        const body = await readBody();
        if (!body.path) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing path' })); return; }
        deleteFile(workDir, body.path);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err: any) {
        const status = err.message === 'Path traversal detected' ? 403 : err.message === 'File not found' ? 404 : 400;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (pathname === '/api/files/move' && req.method === 'POST') {
      try {
        const body = await readBody();
        if (!body.srcPath || !body.destPath) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing srcPath or destPath' })); return; }
        moveFile(workDir, body.srcPath, body.destPath);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err: any) {
        const status = err.message === 'Path traversal detected' ? 403 : err.message === 'Source not found' ? 404 : 400;
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }
  }

  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({ server });

wss.on('connection', async (ws: WebSocket, req) => {
  // Extract token from URL query parameter
  const url = new URL(req.url || '', `http://localhost:${PORT}`);
  const token = url.searchParams.get('token');

  if (!token) {
    ws.send(JSON.stringify({ type: 'error', message: 'No session token provided' }));
    ws.close();
    return;
  }

  // Validate session token
  const sessionInfo = await validateSessionToken(token, sql);
  if (!sessionInfo) {
    ws.send(JSON.stringify({ type: 'error', message: 'Invalid or expired session token' }));
    ws.close();
    return;
  }

  const { sessionId, challengeId } = sessionInfo;

  console.log(`[Terminal] Session connected: ${sessionId}`);

  // Check if this session has an existing container (reconnection after refresh/disconnect)
  const existingSession = dockerManager.getSession(sessionId);
  let dockerSession: typeof existingSession;

  if (existingSession) {
    // Cancel the pending disconnect timer — candidate is reconnecting
    const pendingTimer = disconnectTimers.get(sessionId);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      disconnectTimers.delete(sessionId);
      console.log(`[Terminal] Reconnection: cancelled disconnect timer for ${sessionId}`);
    }

    dockerSession = existingSession;
    ws.send(JSON.stringify({ type: 'connected', sessionId, reconnected: true }));
    console.log(`[Terminal] Reattached to existing container for session ${sessionId}`);
  } else {
    // Fresh connection — spawn a new container

    // Look up starter files for this challenge (JSONB column + legacy dir)
    let starterFilesDir: string | undefined;
    let starterFiles: { path: string; content: string }[] | undefined;
    try {
      const [challenge] = await sql<{ starter_files_dir: string | null; starter_files: { path: string; content: string }[] | null }[]>`
        SELECT starter_files_dir, starter_files FROM challenges WHERE id = ${challengeId}
      `;
      // Parse JSONB — postgres may return it as a string
      const rawFiles = challenge?.starter_files;
      const parsedFiles = typeof rawFiles === 'string' ? JSON.parse(rawFiles) : rawFiles;
      if (parsedFiles && Array.isArray(parsedFiles) && parsedFiles.length > 0) {
        starterFiles = parsedFiles;
      } else if (challenge?.starter_files_dir) {
        starterFilesDir = challenge.starter_files_dir;
      }
    } catch (err) {
      console.warn(`[Terminal] Failed to query starter files for challenge ${challengeId}:`, err);
    }

    // Spawn Docker container (may queue if at capacity)
    try {
      // Notify client if they'll be queued
      if (dockerManager.activeCount >= dockerManager.maxConcurrent) {
        ws.send(JSON.stringify({
          type: 'queued',
          position: dockerManager.queueLength + 1,
          message: 'Server is at capacity. You are in the queue...',
        }));
      } else {
        ws.send(JSON.stringify({ type: 'spawning' }));
      }
      dockerSession = await dockerManager.spawn(sessionId, starterFilesDir, starterFiles);
    } catch (err: any) {
      const isQueueTimeout = err?.message === 'QUEUE_TIMEOUT';
      console.error(`[Terminal] Failed to spawn container for session ${sessionId}:`, err);
      ws.send(JSON.stringify({
        type: 'error',
        message: isQueueTimeout
          ? 'Server is busy, please try again in a few minutes'
          : 'Failed to start terminal',
      }));
      ws.close();
      return;
    }

    // Start cost tracking for this session
    try {
      const [challengeRow] = await sql<{ company_id: string }[]>`
        SELECT company_id FROM challenges WHERE id = ${challengeId}
      `;
      if (challengeRow) {
        costTracker.startSession(sessionId, challengeRow.company_id);
      }
    } catch (err) {
      console.warn(`[Terminal] Failed to start cost tracking for session ${sessionId}:`, err);
    }

    // Send initial message
    ws.send(JSON.stringify({ type: 'connected', sessionId }));

    // Spin up activity monitor for this session (new connection only).
    // It subscribes to the logger's flush events so it sees aggregated,
    // classified interactions rather than raw PTY bytes.
    if (!activityMonitors.has(sessionId)) {
      const monitor = new ActivityMonitor({
        sessionToken: token,
        nextAppUrl: NEXT_APP_URL,
      });
      activityMonitors.set(sessionId, monitor);
    }
  }

  // Reattach container output → this WebSocket + Logger + CostTracker
  dockerSession!.onData = (data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'output', data }));
    }
    logger.logOutput(sessionId, data);
    costTracker.processOutput(sessionId, data);
  };

  // Trigger a resize so the shell redraws its prompt — the initial prompt is
  // output during exec.start() before onData is set, so it gets lost without this.
  setTimeout(() => dockerManager.resize(sessionId, 220, 50), 150);

  dockerSession!.onExit = (exitCode: number) => {
    console.log(`[Terminal] Container exited for session ${sessionId} with code ${exitCode}`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode }));
    }
  };

  // WebSocket messages → Container + Logger
  ws.on('message', (rawMessage) => {
    try {
      const message = JSON.parse(rawMessage.toString());

      switch (message.type) {
        case 'input':
          dockerManager.write(sessionId, message.data);
          logger.logInput(sessionId, message.data);
          costTracker.processInput(sessionId, message.data);
          break;

        case 'resize':
          if (message.cols && message.rows) {
            dockerManager.resize(sessionId, message.cols, message.rows);
          }
          break;

        case 'ping':
          ws.send(JSON.stringify({ type: 'pong' }));
          break;

        default:
          console.warn(`[Terminal] Unknown message type: ${message.type}`);
      }
    } catch (err) {
      console.error('[Terminal] Failed to parse message:', err);
    }
  });

  ws.on('close', async () => {
    console.log(`[Terminal] Session disconnected: ${sessionId}`);

    // Check if the session has already been ended (by the candidate or timer expiry).
    // If so, clean up immediately. Otherwise, keep the container alive so the
    // candidate can reconnect (page refresh, network drop, etc.).
    let isCompleted = false;
    try {
      const [row] = await sql<{ status: string }[]>`SELECT status FROM sessions WHERE id = ${sessionId}`;
      isCompleted = row?.status === 'completed' || row?.status === 'analyzed';
    } catch (err) {
      console.error(`[Terminal] Failed to check session status for ${sessionId}:`, err);
    }

    if (!isCompleted) {
      console.log(`[Terminal] Session ${sessionId} still active — keeping container alive for reconnection`);
      return;
    }

    console.log(`[Terminal] Session ${sessionId} is completed — terminating container`);

    await costTracker.endSession(sessionId);
    await logger.flush();

    activityMonitors.get(sessionId)?.destroy();
    activityMonitors.delete(sessionId);

    const dyingSession = dockerManager.getSession(sessionId);
    if (dyingSession) {
      await archiveWorkspace(sessionId, dyingSession.workDir);
    }

    await dockerManager.kill(sessionId);
  });

  ws.on('error', (err) => {
    console.error(`[Terminal] WebSocket error for session ${sessionId}:`, err);
  });
});

// Graceful shutdown
process.on('SIGTERM', () => shutdown());
process.on('SIGINT', () => shutdown());

async function shutdown() {
  console.log('[Terminal] Shutting down...');
  // Clear all pending disconnect timers
  for (const [, timer] of disconnectTimers) {
    clearTimeout(timer);
  }
  disconnectTimers.clear();
  for (const monitor of activityMonitors.values()) monitor.destroy();
  activityMonitors.clear();
  await costTracker.destroy();
  await logger.destroy();
  await dockerManager.killAll();
  wss.close();
  server.close();
  await sql.end();
  process.exit(0);
}

server.listen(PORT, () => {
  console.log(`[Terminal] Server listening on port ${PORT}`);
});
