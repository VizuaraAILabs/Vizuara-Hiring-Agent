import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import postgres from 'postgres';
import path from 'path';
import dotenv from 'dotenv';
import os from 'os';
import { DockerManager } from './docker-manager';
import { InteractionLogger } from './interaction-logger';
import { validateSessionToken } from './auth-middleware';
import * as fs from 'fs';
import { buildFileTree, readFileContent, createFile, updateFileContent, createDirectory, renameFile, deleteFile, moveFile, FileNode } from './file-service';
import { CostTracker } from './cost-tracker';
import { ActivityMonitor } from './activity-monitor';

// Load env from root — __dirname is apps/terminal-server/src, root is ../../..
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });

const PORT = parseInt(process.env.TERMINAL_PORT || '3001');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://hiring:hiring@localhost:5432/hiring_agent';
const NEXT_APP_URL = process.env.NEXT_APP_URL || 'http://localhost:3000';
const TERMINAL_SERVER_ID = process.env.TERMINAL_SERVER_ID || `${os.hostname()}:${PORT}`;
const TERMINAL_RUNTIME_LEASE_SECONDS = parseInt(process.env.TERMINAL_RUNTIME_LEASE_SECONDS || '90');
const TERMINAL_RUNTIME_HEARTBEAT_MS = Math.max(5_000, Math.floor((TERMINAL_RUNTIME_LEASE_SECONDS * 1000) / 3));
const CUSTOMER_SAFE_TERMINAL_ERROR =
  'We could not open your assessment workspace. Please refresh and try again. If the problem continues, contact your assessment administrator.';

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
const runtimeHeartbeatTimers: Map<string, NodeJS.Timeout> = new Map();

// Per-session activity monitors for the AI interviewer
const activityMonitors: Map<string, ActivityMonitor> = new Map();
const finalizingSessions = new Set<string>();
const SUBMITTED_STATUSES = new Set(['completed', 'queued', 'analyzing', 'analyzed', 'analysis failed']);
const ARCHIVE_RETRY_DELAYS_MS = [0, 500, 1500];

type ArchiveFailureStage = 'missing_workdir' | 'read_workspace' | 'db_write';

interface TerminalRuntimeRow {
  session_id: string;
  container_id: string;
  host_work_dir: string;
  assigned_terminal_server_id: string;
  runtime_status: 'starting' | 'active' | 'terminating' | 'terminated' | 'orphaned';
  lease_expires_at: Date | string;
}

class WorkspaceArchiveError extends Error {
  stage: ArchiveFailureStage;
  originalError?: unknown;

  constructor(stage: ArchiveFailureStage, message: string, originalError?: unknown) {
    super(message);
    this.name = 'WorkspaceArchiveError';
    this.stage = stage;
    this.originalError = originalError;
  }
}

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
      if (SUBMITTED_STATUSES.has(row.status)) {
        console.log(`[Terminal] Periodic check: finalizing submitted session ${row.id}`);
        await cleanupSubmittedSession(row.id);
      }
    }
  } catch (err) {
    console.error('[Terminal] Periodic session check failed:', err);
  }
}, 30_000);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isDbArchiveFailure(err: unknown): boolean {
  return err instanceof WorkspaceArchiveError && err.stage === 'db_write';
}

function runtimeLeaseMs(row: TerminalRuntimeRow): number {
  const expiresAt = row.lease_expires_at instanceof Date
    ? row.lease_expires_at.getTime()
    : new Date(row.lease_expires_at).getTime();
  return expiresAt - Date.now();
}

async function reserveRuntimeSession(sessionId: string): Promise<boolean> {
  const [runtime] = await sql<{ session_id: string }[]>`
    INSERT INTO terminal_runtime_sessions (
      session_id,
      container_id,
      host_work_dir,
      assigned_terminal_server_id,
      runtime_status,
      last_seen_at,
      lease_expires_at
    ) VALUES (
      ${sessionId},
      '',
      '',
      ${TERMINAL_SERVER_ID},
      'starting',
      NOW(),
      NOW() + (${TERMINAL_RUNTIME_LEASE_SECONDS} * INTERVAL '1 second')
    )
    ON CONFLICT (session_id) DO UPDATE
    SET assigned_terminal_server_id = EXCLUDED.assigned_terminal_server_id,
        runtime_status = 'starting',
        last_seen_at = NOW(),
        lease_expires_at = NOW() + (${TERMINAL_RUNTIME_LEASE_SECONDS} * INTERVAL '1 second'),
        updated_at = NOW()
    WHERE terminal_runtime_sessions.runtime_status IN ('terminated', 'orphaned')
       OR terminal_runtime_sessions.assigned_terminal_server_id = ${TERMINAL_SERVER_ID}
       OR terminal_runtime_sessions.lease_expires_at <= NOW()
    RETURNING session_id
  `;
  return Boolean(runtime);
}

async function upsertRuntimeSession(sessionId: string, containerId: string, workDir: string): Promise<boolean> {
  const [runtime] = await sql<{ session_id: string }[]>`
    INSERT INTO terminal_runtime_sessions (
      session_id,
      container_id,
      host_work_dir,
      assigned_terminal_server_id,
      runtime_status,
      last_seen_at,
      lease_expires_at
    ) VALUES (
      ${sessionId},
      ${containerId},
      ${workDir},
      ${TERMINAL_SERVER_ID},
      'active',
      NOW(),
      NOW() + (${TERMINAL_RUNTIME_LEASE_SECONDS} * INTERVAL '1 second')
    )
    ON CONFLICT (session_id) DO UPDATE
    SET container_id = EXCLUDED.container_id,
        host_work_dir = EXCLUDED.host_work_dir,
        assigned_terminal_server_id = EXCLUDED.assigned_terminal_server_id,
        runtime_status = 'active',
        last_seen_at = NOW(),
        lease_expires_at = NOW() + (${TERMINAL_RUNTIME_LEASE_SECONDS} * INTERVAL '1 second'),
        updated_at = NOW()
    WHERE terminal_runtime_sessions.assigned_terminal_server_id = ${TERMINAL_SERVER_ID}
       OR terminal_runtime_sessions.lease_expires_at <= NOW()
    RETURNING session_id
  `;
  return Boolean(runtime);
}

async function heartbeatRuntimeSession(sessionId: string): Promise<void> {
  await sql`
    UPDATE terminal_runtime_sessions
    SET last_seen_at = NOW(),
        lease_expires_at = NOW() + (${TERMINAL_RUNTIME_LEASE_SECONDS} * INTERVAL '1 second'),
        updated_at = NOW()
    WHERE session_id = ${sessionId}
      AND assigned_terminal_server_id = ${TERMINAL_SERVER_ID}
      AND runtime_status = 'active'
  `;
}

function startRuntimeHeartbeat(sessionId: string): void {
  if (runtimeHeartbeatTimers.has(sessionId)) return;

  const timer = setInterval(() => {
    heartbeatRuntimeSession(sessionId).catch((err) => {
      console.error(`[Terminal] Runtime heartbeat failed for ${sessionId}:`, err);
    });
  }, TERMINAL_RUNTIME_HEARTBEAT_MS);
  runtimeHeartbeatTimers.set(sessionId, timer);
}

function stopRuntimeHeartbeat(sessionId: string): void {
  const timer = runtimeHeartbeatTimers.get(sessionId);
  if (!timer) return;
  clearInterval(timer);
  runtimeHeartbeatTimers.delete(sessionId);
}

async function markRuntimeTerminated(sessionId: string): Promise<void> {
  stopRuntimeHeartbeat(sessionId);
  await sql`
    UPDATE terminal_runtime_sessions
    SET runtime_status = 'terminated',
        lease_expires_at = NOW(),
        updated_at = NOW()
    WHERE session_id = ${sessionId}
  `;
}

async function markRuntimeOrphaned(sessionId: string): Promise<void> {
  stopRuntimeHeartbeat(sessionId);
  await sql`
    UPDATE terminal_runtime_sessions
    SET runtime_status = 'orphaned',
        lease_expires_at = NOW(),
        updated_at = NOW()
    WHERE session_id = ${sessionId}
  `;
}

async function findRuntimeSession(sessionId: string): Promise<TerminalRuntimeRow | null> {
  const [runtime] = await sql<TerminalRuntimeRow[]>`
    SELECT session_id, container_id, host_work_dir, assigned_terminal_server_id, runtime_status, lease_expires_at
    FROM terminal_runtime_sessions
    WHERE session_id = ${sessionId}
      AND runtime_status = 'active'
  `;
  return runtime ?? null;
}

async function findAnyRuntimeSession(sessionId: string): Promise<TerminalRuntimeRow | null> {
  const [runtime] = await sql<TerminalRuntimeRow[]>`
    SELECT session_id, container_id, host_work_dir, assigned_terminal_server_id, runtime_status, lease_expires_at
    FROM terminal_runtime_sessions
    WHERE session_id = ${sessionId}
      AND runtime_status IN ('active', 'orphaned')
      AND container_id <> ''
      AND host_work_dir <> ''
  `;
  return runtime ?? null;
}

async function claimRuntimeSession(sessionId: string): Promise<TerminalRuntimeRow | null> {
  const [runtime] = await sql<TerminalRuntimeRow[]>`
    UPDATE terminal_runtime_sessions
    SET assigned_terminal_server_id = ${TERMINAL_SERVER_ID},
        last_seen_at = NOW(),
        lease_expires_at = NOW() + (${TERMINAL_RUNTIME_LEASE_SECONDS} * INTERVAL '1 second'),
        updated_at = NOW()
    WHERE session_id = ${sessionId}
      AND runtime_status = 'active'
      AND (
        assigned_terminal_server_id = ${TERMINAL_SERVER_ID}
        OR lease_expires_at <= NOW()
      )
    RETURNING session_id, container_id, host_work_dir, assigned_terminal_server_id, runtime_status, lease_expires_at
  `;
  return runtime ?? null;
}

async function tryRecoverRuntimeSession(sessionId: string): Promise<'recovered' | 'busy' | 'missing'> {
  const runtime = await findRuntimeSession(sessionId);
  if (!runtime) return 'missing';

  if (runtime.assigned_terminal_server_id !== TERMINAL_SERVER_ID && runtimeLeaseMs(runtime) > 0) {
    return 'busy';
  }

  const claimed = await claimRuntimeSession(sessionId);
  if (!claimed) return 'busy';

  let recovered = null;
  try {
    recovered = await dockerManager.recover(sessionId, claimed.container_id, claimed.host_work_dir);
  } catch (err) {
    console.warn(`[Terminal] Failed to recover runtime session ${sessionId}:`, err);
  }

  if (!recovered) {
    await markRuntimeOrphaned(sessionId);
    return 'missing';
  }

  startRuntimeHeartbeat(sessionId);
  return 'recovered';
}

async function recordArtifactFailure(
  sessionId: string,
  errorCode: string,
  err: unknown,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  try {
    const archiveError = err instanceof WorkspaceArchiveError ? err : null;
    const failureMetadata = {
      ...metadata,
      stage: archiveError?.stage ?? 'unknown',
      exception_type: err instanceof Error ? err.constructor.name : typeof err,
    };
    await sql`
      INSERT INTO session_artifact_failures (
        session_id,
        error_code,
        error_message,
        error_metadata
      ) VALUES (
        ${sessionId},
        ${errorCode},
        ${errorMessage(err)},
        ${sql.json(failureMetadata as Parameters<typeof sql.json>[0])}
      )
    `;
  } catch (recordErr) {
    console.error(`[Artifacts] Failed to record artifact failure for ${sessionId}:`, recordErr);
  }
}

// Archive all workspace files to PostgreSQL when a session ends.
async function archiveWorkspaceOnce(sessionId: string, workDir: string): Promise<number> {
  if (!fs.existsSync(workDir)) {
    throw new WorkspaceArchiveError('missing_workdir', `Workspace directory does not exist: ${workDir}`);
  }

  let tree: FileNode[];
  try {
    tree = buildFileTree(workDir);
  } catch (err) {
    throw new WorkspaceArchiveError('read_workspace', `Failed to read workspace tree: ${errorMessage(err)}`, err);
  }

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
  const snapshotJson = snapshot as unknown as Parameters<typeof sql.json>[0];
  try {
    await sql`
      UPDATE sessions
      SET workspace_snapshot = ${sql.json(snapshotJson)}
      WHERE id = ${sessionId}
    `;
  } catch (err) {
    throw new WorkspaceArchiveError('db_write', `Failed to save workspace snapshot: ${errorMessage(err)}`, err);
  }

  return files.length;
}

async function archiveWorkspaceWithRetries(sessionId: string, workDir: string): Promise<boolean> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < ARCHIVE_RETRY_DELAYS_MS.length; attempt++) {
    const delay = ARCHIVE_RETRY_DELAYS_MS[attempt];
    if (delay > 0) await sleep(delay);

    try {
      const fileCount = await archiveWorkspaceOnce(sessionId, workDir);
      console.log(`[Archive] Saved ${fileCount} file(s) for session ${sessionId}`);
      return true;
    } catch (err) {
      lastError = err;
      const finalAttempt = attempt === ARCHIVE_RETRY_DELAYS_MS.length - 1;
      console.error(
        `[Archive] Attempt ${attempt + 1}/${ARCHIVE_RETRY_DELAYS_MS.length} failed for session ${sessionId}:`,
        err,
      );

      if (err instanceof WorkspaceArchiveError && err.stage === 'missing_workdir') {
        break;
      }

      if (finalAttempt) break;
    }
  }

  const errorCode = isDbArchiveFailure(lastError)
    ? 'workspace_archive_db_failed'
    : 'workspace_archive_failed';
  await recordArtifactFailure(sessionId, errorCode, lastError ?? new Error('Unknown workspace archive failure'), {
    attempts: ARCHIVE_RETRY_DELAYS_MS.length,
  });

  return !isDbArchiveFailure(lastError);
}

async function finalizeSessionArtifacts(sessionId: string, workDir?: string): Promise<boolean> {
  await logger.flushSession(sessionId);

  if (!workDir) {
    await recordArtifactFailure(
      sessionId,
      'workspace_archive_failed',
      new WorkspaceArchiveError('missing_workdir', 'No Docker session found during cleanup'),
    );
    return true;
  }

  return await archiveWorkspaceWithRetries(sessionId, workDir);
}

async function cleanupSubmittedSession(sessionId: string): Promise<void> {
  if (finalizingSessions.has(sessionId)) {
    console.log(`[Terminal] Session ${sessionId} cleanup already in progress`);
    return;
  }

  finalizingSessions.add(sessionId);
  try {
    const dyingSession = dockerManager.getSession(sessionId);
    const runtimeSession = dyingSession ? null : await findAnyRuntimeSession(sessionId);
    const workDir = dyingSession?.workDir ?? runtimeSession?.host_work_dir;
    const canKill = await finalizeSessionArtifacts(sessionId, workDir);

    if (!canKill) {
      console.warn(`[Terminal] Deferring container cleanup for ${sessionId}; workspace archive DB write failed`);
      return;
    }

    try {
      await costTracker.endSession(sessionId);
    } catch (err) {
      console.error(`[Terminal] Failed to end cost tracking for ${sessionId}:`, err);
    }

    const monitor = activityMonitors.get(sessionId);
    monitor?.destroy();
    activityMonitors.delete(sessionId);

    if (dyingSession) {
      await dockerManager.kill(sessionId);
    } else if (runtimeSession) {
      await dockerManager.killContainer(runtimeSession.container_id, sessionId);
    }
    await markRuntimeTerminated(sessionId);
  } finally {
    finalizingSessions.delete(sessionId);
  }
}

async function startSessionRuntimeServices(sessionId: string, challengeId: string, token: string): Promise<void> {
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

  if (!activityMonitors.has(sessionId)) {
    const monitor = new ActivityMonitor({
      sessionToken: token,
      nextAppUrl: NEXT_APP_URL,
    });
    activityMonitors.set(sessionId, monitor);
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
  const FILE_API_ROUTES = ['/api/files/tree', '/api/files/read', '/api/files/create', '/api/files/update', '/api/files/mkdir', '/api/files/rename', '/api/files/delete', '/api/files/move'];
  if (FILE_API_ROUTES.includes(pathname)) {
    const token = url.searchParams.get('token');
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'This assessment link is missing required access information.' }));
      return;
    }

    const sessionInfo = await validateSessionToken(token, sql);
    if (!sessionInfo) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'This assessment link is invalid or expired.' }));
      return;
    }

    const session = dockerManager.getSession(sessionInfo.sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Workspace files are not available yet. Please refresh and try again.' }));
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

    if (pathname === '/api/files/update' && req.method === 'POST') {
      try {
        const body = await readBody();
        if (!body.path) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Missing path' })); return; }
        updateFileContent(workDir, body.path, body.content || '');
        logger.logFileEdit(sessionInfo.sessionId, body.path, body.content || '');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err: any) {
        const status = err.message === 'Path traversal detected' ? 403 : err.message === 'File not found' ? 404 : 400;
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
    ws.send(JSON.stringify({
      type: 'error',
      message: 'This assessment link is missing required access information. Please reopen the link from your invitation.',
    }));
    ws.close();
    return;
  }

  // Validate session token
  const sessionInfo = await validateSessionToken(token, sql);
  if (!sessionInfo) {
    ws.send(JSON.stringify({
      type: 'error',
      message: 'This assessment link is invalid or expired. Please request a new link from your assessment administrator.',
    }));
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
    const recoveryStatus = await tryRecoverRuntimeSession(sessionId);
    if (recoveryStatus === 'recovered') {
      dockerSession = dockerManager.getSession(sessionId);
      ws.send(JSON.stringify({ type: 'connected', sessionId, reconnected: true }));
      await startSessionRuntimeServices(sessionId, challengeId, token);
      console.log(`[Terminal] Recovered container from runtime registry for session ${sessionId}`);
    } else if (recoveryStatus === 'busy') {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'This workspace is already active elsewhere. Please reconnect in a moment.',
      }));
      ws.close();
      return;
    }
  }

  if (!dockerSession) {
    // Fresh connection — spawn a new container
    let reserved = false;
    try {
      reserved = await reserveRuntimeSession(sessionId);
    } catch (err) {
      console.error(`[Terminal] Failed to reserve runtime for session ${sessionId}:`, err);
      ws.send(JSON.stringify({
        type: 'error',
        message: CUSTOMER_SAFE_TERMINAL_ERROR,
      }));
      ws.close();
      return;
    }

    if (!reserved) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'This workspace is already starting elsewhere. Please reconnect in a moment.',
      }));
      ws.close();
      return;
    }

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
      const runtimeRecorded = await upsertRuntimeSession(sessionId, dockerSession.containerId, dockerSession.workDir);
      if (!runtimeRecorded) {
        throw new Error('Failed to claim terminal runtime after spawning container');
      }
      startRuntimeHeartbeat(sessionId);
    } catch (err: any) {
      const isQueueTimeout = err?.message === 'QUEUE_TIMEOUT';
      const isDockerUnavailable = err?.code === 'ENOENT' || err?.code === 'ECONNREFUSED';
      const isSandboxExited = typeof err?.message === 'string' && err.message.includes('Sandbox container stopped');
      console.error(`[Terminal] Failed to spawn container for session ${sessionId}:`, err);
      stopRuntimeHeartbeat(sessionId);
      if (dockerSession) {
        await dockerManager.kill(sessionId).catch((killErr) => {
          console.error(`[Terminal] Failed to clean up partially started container for ${sessionId}:`, killErr);
        });
        await markRuntimeOrphaned(sessionId).catch(() => { });
      }
      ws.send(JSON.stringify({
        type: 'error',
        message: isQueueTimeout
          ? 'Workspaces are busy right now. Please try again in a few minutes.'
          : isDockerUnavailable
            ? CUSTOMER_SAFE_TERMINAL_ERROR
          : isSandboxExited
            ? CUSTOMER_SAFE_TERMINAL_ERROR
          : CUSTOMER_SAFE_TERMINAL_ERROR,
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
    if (!finalizingSessions.has(sessionId)) {
      markRuntimeOrphaned(sessionId).catch((err) => {
        console.error(`[Terminal] Failed to mark runtime orphaned for ${sessionId}:`, err);
      });
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
      isCompleted = SUBMITTED_STATUSES.has(row?.status ?? '');
    } catch (err) {
      console.error(`[Terminal] Failed to check session status for ${sessionId}:`, err);
    }

    if (!isCompleted) {
      console.log(`[Terminal] Session ${sessionId} still active — keeping container alive for reconnection`);
      return;
    }

    console.log(`[Terminal] Session ${sessionId} is completed — terminating container`);

    await cleanupSubmittedSession(sessionId);
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
  for (const [, timer] of runtimeHeartbeatTimers) {
    clearInterval(timer);
  }
  runtimeHeartbeatTimers.clear();
  for (const monitor of activityMonitors.values()) monitor.destroy();
  activityMonitors.clear();
  await costTracker.destroy();
  await logger.destroy();
  await dockerManager.killAll({ preserveActiveContainers: true });
  wss.close();
  server.close();
  await sql.end();
  process.exit(0);
}

server.listen(PORT, () => {
  console.log(`[Terminal] Server listening on port ${PORT}`);
});
