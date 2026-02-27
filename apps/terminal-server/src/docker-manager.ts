import Docker from 'dockerode';
import * as fs from 'fs';
import * as path from 'path';
import { Readable, Writable, Duplex } from 'stream';

const SANDBOX_IMAGE = process.env.SANDBOX_IMAGE || 'hiring-sandbox';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
// Force Claude Code to use Haiku (fastest, most cost-efficient model) inside sandbox containers
const CLAUDE_MODEL = process.env.SANDBOX_CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

// Resource management constants
const MAX_CONCURRENT_SANDBOXES = parseInt(process.env.SANDBOX_MAX_CONCURRENT || '5');
const SANDBOX_IDLE_TTL_MS = parseInt(process.env.SANDBOX_IDLE_TTL_MS || String(15 * 60 * 1000)); // 15 min
const QUEUE_TIMEOUT_MS = parseInt(process.env.SANDBOX_QUEUE_TIMEOUT_MS || '60000'); // 60s

export interface DockerSession {
  containerId: string;
  sessionId: string;
  workDir: string;
  stream: Duplex;
  exec: Docker.Exec;
  onData: ((data: string) => void) | null;
  onExit: ((code: number) => void) | null;
}

export interface StarterFile {
  path: string;
  content: string;
}

interface QueueEntry {
  sessionId: string;
  starterFilesDir?: string;
  starterFiles?: StarterFile[];
  resolve: (session: DockerSession) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class DockerManager {
  private docker: Docker;
  private sessions: Map<string, DockerSession> = new Map();
  private lastActivity: Map<string, number> = new Map();
  private queue: QueueEntry[] = [];
  private idleCleanupInterval: ReturnType<typeof setInterval>;

  constructor() {
    this.docker = new Docker({ socketPath: '/var/run/docker.sock' });

    // Periodically check for idle sandboxes
    this.idleCleanupInterval = setInterval(() => this.cleanupIdleSessions(), 60_000);
  }

  /** Number of items waiting in the spawn queue */
  get queueLength(): number {
    return this.queue.length;
  }

  /** Number of active sandbox containers */
  get activeCount(): number {
    return this.sessions.size;
  }

  /** Maximum concurrent sandboxes allowed */
  get maxConcurrent(): number {
    return MAX_CONCURRENT_SANDBOXES;
  }

  async spawn(sessionId: string, starterFilesDir?: string, starterFiles?: StarterFile[]): Promise<DockerSession> {
    // If at capacity, queue the request and wait
    if (this.sessions.size >= MAX_CONCURRENT_SANDBOXES) {
      console.log(`[Docker] At capacity (${this.sessions.size}/${MAX_CONCURRENT_SANDBOXES}), queuing session ${sessionId}`);
      return new Promise<DockerSession>((resolve, reject) => {
        const timer = setTimeout(() => {
          const idx = this.queue.findIndex(e => e.sessionId === sessionId);
          if (idx !== -1) this.queue.splice(idx, 1);
          reject(new Error('QUEUE_TIMEOUT'));
        }, QUEUE_TIMEOUT_MS);

        this.queue.push({ sessionId, starterFilesDir, starterFiles, resolve, reject, timer });
      });
    }

    return this.spawnContainer(sessionId, starterFilesDir, starterFiles);
  }

  private async spawnContainer(sessionId: string, starterFilesDir?: string, starterFiles?: StarterFile[]): Promise<DockerSession> {
    // Create a temporary host directory with starter files
    const hostWorkDir = path.join('/tmp', 'sessions', sessionId);
    fs.mkdirSync(hostWorkDir, { recursive: true });

    // Seed workspace with starter files from JSONB (AI-generated)
    if (starterFiles && starterFiles.length > 0) {
      const workDirContents = fs.readdirSync(hostWorkDir);
      if (workDirContents.length === 0) {
        for (const file of starterFiles) {
          const filePath = path.join(hostWorkDir, file.path);
          fs.mkdirSync(path.dirname(filePath), { recursive: true });
          fs.writeFileSync(filePath, file.content, 'utf-8');
        }
        console.log(`[Docker] Seeded workspace for ${sessionId} with ${starterFiles.length} generated files`);
      }
    }
    // Fall back to directory-based starter files
    else if (starterFilesDir) {
      const workDirContents = fs.readdirSync(hostWorkDir);
      if (workDirContents.length === 0) {
        const resolvedSrc = path.isAbsolute(starterFilesDir)
          ? starterFilesDir
          : path.resolve(__dirname, '..', '..', '..', starterFilesDir);
        if (fs.existsSync(resolvedSrc)) {
          this.copyDirRecursive(resolvedSrc, hostWorkDir);
          console.log(`[Docker] Seeded workspace for ${sessionId} from ${resolvedSrc}`);
        } else {
          // Try looking in /challenges (Docker volume mount)
          const challengePath = path.join('/challenges', starterFilesDir);
          if (fs.existsSync(challengePath)) {
            this.copyDirRecursive(challengePath, hostWorkDir);
            console.log(`[Docker] Seeded workspace for ${sessionId} from ${challengePath}`);
          } else {
            console.warn(`[Docker] Starter files dir not found: ${resolvedSrc}`);
          }
        }
      }
    }

    // Create container
    const container = await this.docker.createContainer({
      Image: SANDBOX_IMAGE,
      name: `session-${sessionId}`,
      Env: [
        // Use _SANDBOX_API_KEY so Claude Code doesn't detect it as an env var
        // and show the "Do you want to use this API key?" prompt.
        // The entrypoint script writes it to ~/.claude.json as primaryApiKey.
        `_SANDBOX_API_KEY=${ANTHROPIC_API_KEY}`,
        `CLAUDE_MODEL=${CLAUDE_MODEL}`,
        'TERM=xterm-256color',
        `SESSION_ID=${sessionId}`,
      ],
      HostConfig: {
        Binds: [`${hostWorkDir}:/workspace`],
        Memory: 1 * 1024 * 1024 * 1024, // 1GB
        NanoCpus: 1 * 1e9, // 1 CPU (leave headroom for 3 concurrent on 2-4 core host)
        NetworkMode: 'bridge',
        AutoRemove: false,
      },
      Tty: true,
      OpenStdin: true,
      WorkingDir: '/workspace',
    });

    await container.start();
    console.log(`[Docker] Container started for session ${sessionId}: ${container.id.substring(0, 12)}`);
    console.log(`[Docker] ANTHROPIC_API_KEY present: ${ANTHROPIC_API_KEY ? 'yes (' + ANTHROPIC_API_KEY.substring(0, 10) + '...)' : 'NO - MISSING'}`);

    // Wait for entrypoint to write the API key file before attaching exec
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Create an exec instance for interactive bash as the candidate user
    // (non-root required for --dangerously-skip-permissions)
    const exec = await container.exec({
      Cmd: ['/bin/bash', '-l'],
      Env: [
        `_SANDBOX_API_KEY=${ANTHROPIC_API_KEY}`,
        `CLAUDE_MODEL=${CLAUDE_MODEL}`,
        'TERM=xterm-256color',
      ],
      User: 'candidate',
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
      Tty: true,
    });

    const stream = await exec.start({
      hijack: true,
      stdin: true,
      Tty: true,
    });

    const session: DockerSession = {
      containerId: container.id,
      sessionId,
      workDir: hostWorkDir,
      stream,
      exec,
      onData: null,
      onExit: null,
    };

    // Stream output → callback
    stream.on('data', (chunk: Buffer) => {
      session.onData?.(chunk.toString('utf-8'));
    });

    stream.on('end', () => {
      console.log(`[Docker] Exec stream ended for session ${sessionId}`);
      session.onExit?.(0);
      this.sessions.delete(sessionId);
    });

    stream.on('error', (err: Error) => {
      console.error(`[Docker] Stream error for session ${sessionId}:`, err);
    });

    this.sessions.set(sessionId, session);
    this.lastActivity.set(sessionId, Date.now());
    return session;
  }

  getSession(sessionId: string): DockerSession | undefined {
    return this.sessions.get(sessionId);
  }

  write(sessionId: string, data: string) {
    const session = this.sessions.get(sessionId);
    if (session && session.stream.writable) {
      session.stream.write(data);
      this.lastActivity.set(sessionId, Date.now());
    }
  }

  resize(sessionId: string, cols: number, rows: number) {
    const session = this.sessions.get(sessionId);
    if (session) {
      // Resize the exec TTY
      session.exec.resize({ h: rows, w: cols }).catch((err: Error) => {
        console.warn(`[Docker] Resize failed for session ${sessionId}:`, err.message);
      });
    }
  }

  async kill(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      try {
        const container = this.docker.getContainer(session.containerId);
        await container.stop({ t: 5 }).catch(() => {});
        await container.remove({ force: true }).catch(() => {});
        console.log(`[Docker] Container removed for session ${sessionId}`);
      } catch (err: any) {
        console.warn(`[Docker] Failed to cleanup container for ${sessionId}:`, err.message);
      }
      this.sessions.delete(sessionId);
      this.lastActivity.delete(sessionId);

      // Drain the next queued request now that a slot is free
      this.drainQueue();
    }
  }

  async killAll() {
    clearInterval(this.idleCleanupInterval);

    // Reject all queued requests
    for (const entry of this.queue) {
      clearTimeout(entry.timer);
      entry.reject(new Error('Server shutting down'));
    }
    this.queue = [];

    const promises = [];
    for (const [id] of this.sessions) {
      promises.push(this.kill(id));
    }
    await Promise.all(promises);
  }

  private drainQueue() {
    if (this.queue.length === 0 || this.sessions.size >= MAX_CONCURRENT_SANDBOXES) return;

    const next = this.queue.shift()!;
    clearTimeout(next.timer);

    console.log(`[Docker] Draining queue: spawning session ${next.sessionId} (${this.queue.length} still queued)`);
    this.spawnContainer(next.sessionId, next.starterFilesDir, next.starterFiles)
      .then(next.resolve)
      .catch(next.reject);
  }

  private async cleanupIdleSessions() {
    const now = Date.now();
    for (const [sessionId, lastTime] of this.lastActivity) {
      if (now - lastTime > SANDBOX_IDLE_TTL_MS) {
        console.log(`[Docker] Killing idle session ${sessionId} (idle ${Math.round((now - lastTime) / 60_000)}min)`);
        await this.kill(sessionId);
      }
    }
  }

  private copyDirRecursive(src: string, dest: string) {
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        fs.mkdirSync(destPath, { recursive: true });
        this.copyDirRecursive(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
