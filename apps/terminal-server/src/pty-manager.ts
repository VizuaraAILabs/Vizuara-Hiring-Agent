import * as pty from 'node-pty';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface PtySession {
  process: pty.IPty;
  sessionId: string;
  workDir: string;
  onData: ((data: string) => void) | null;
  onExit: ((code: number) => void) | null;
}

export class PtyManager {
  private sessions: Map<string, PtySession> = new Map();

  spawn(sessionId: string, starterFilesDir?: string): PtySession {
    // Create isolated workspace
    const workDir = path.join(os.tmpdir(), 'sessions', sessionId);
    fs.mkdirSync(workDir, { recursive: true });

    // Seed workspace with starter files if provided and workspace is empty (reconnect guard)
    if (starterFilesDir) {
      const workDirContents = fs.readdirSync(workDir);
      if (workDirContents.length === 0) {
        const resolvedSrc = path.isAbsolute(starterFilesDir)
          ? starterFilesDir
          : path.resolve(__dirname, '..', '..', '..', starterFilesDir);
        if (fs.existsSync(resolvedSrc)) {
          this.copyDirRecursive(resolvedSrc, workDir);
          console.log(`[PTY] Seeded workspace for ${sessionId} from ${resolvedSrc}`);
        } else {
          console.warn(`[PTY] Starter files dir not found: ${resolvedSrc}`);
        }
      }
    }

    // Spawn a real PTY so interactive tools like Claude Code work
    const proc = pty.spawn('/bin/bash', ['-l'], {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: workDir,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        SESSION_WORKDIR: workDir,
      } as Record<string, string>,
    });

    const session: PtySession = {
      process: proc,
      sessionId,
      workDir,
      onData: null,
      onExit: null,
    };

    proc.onData((data: string) => {
      session.onData?.(data);
    });

    proc.onExit(({ exitCode }) => {
      session.onExit?.(exitCode);
      this.sessions.delete(sessionId);
    });

    this.sessions.set(sessionId, session);
    return session;
  }

  getSession(sessionId: string): PtySession | undefined {
    return this.sessions.get(sessionId);
  }

  write(sessionId: string, data: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.process.write(data);
    }
  }

  resize(sessionId: string, cols: number, rows: number) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.process.resize(cols, rows);
    }
  }

  kill(sessionId: string) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.process.kill();
      this.sessions.delete(sessionId);
    }
  }

  killAll() {
    for (const [id] of this.sessions) {
      this.kill(id);
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
