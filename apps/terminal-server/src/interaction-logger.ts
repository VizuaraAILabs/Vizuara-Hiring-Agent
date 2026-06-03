import postgres from 'postgres';
type Sql = ReturnType<typeof postgres>;

interface PendingInteraction {
  session_id: string;
  sequence_num: number;
  direction: 'input' | 'output';
  content: string;
  content_type: 'terminal' | 'prompt' | 'response' | 'command';
  metadata: string;
}

// Heuristic markers for content classification
const CLAUDE_PROMPT_MARKERS = [
  /^>\s/, // Claude Code prompt marker
  /^\$ claude/,
  /^claude\s/,
];

const SHELL_PROMPT_PATTERN = /^\$\s|^%\s|^#\s|^bash-|^zsh/;
const MAX_FILE_EDIT_LOG_CHARS = 20_000;

type FlushListener = (sessionId: string, content: string, contentType: string) => void;

export class InteractionLogger {
  private sql: Sql;
  private buffer: PendingInteraction[] = [];
  private sequenceCounters: Map<string, number> = new Map();
  private inputBuffer: Map<string, { content: string; timer: NodeJS.Timeout | null }> = new Map();
  private outputBuffer: Map<string, { content: string; timer: NodeJS.Timeout | null }> = new Map();
  private flushTimer: NodeJS.Timeout | null = null;
  private inClaudeSession: Map<string, boolean> = new Map();
  private flushPromise: Promise<void> | null = null;
  /** Listeners called after each successful flush with the flushed interactions. */
  private flushListeners: FlushListener[] = [];

  /** Subscribe to aggregated, classified interactions as they are flushed to DB. */
  onFlush(listener: FlushListener) {
    this.flushListeners.push(listener);
  }

  constructor(sql: Sql) {
    this.sql = sql;

    // Flush buffer periodically
    this.flushTimer = setInterval(() => this.flush(), 2000);
  }

  private getSequence(sessionId: string): number {
    const current = this.sequenceCounters.get(sessionId) || 0;
    const next = current + 1;
    this.sequenceCounters.set(sessionId, next);
    return next;
  }

  private classifyInput(content: string, sessionId: string): 'prompt' | 'command' {
    const trimmed = content.trim();

    // Check if we're in a Claude Code session
    if (this.inClaudeSession.get(sessionId)) {
      return 'prompt';
    }

    // Check if this looks like a Claude Code invocation
    if (/^claude\b/.test(trimmed)) {
      this.inClaudeSession.set(sessionId, true);
      return 'command';
    }

    return 'command';
  }

  private classifyOutput(content: string, sessionId: string): 'response' | 'terminal' {
    // If we detect Claude's response markers
    if (this.inClaudeSession.get(sessionId)) {
      return 'response';
    }

    // Check for Claude Code output markers
    if (content.includes('Claude') || content.includes('anthropic')) {
      return 'response';
    }

    return 'terminal';
  }

  logInput(sessionId: string, data: string) {
    const existing = this.inputBuffer.get(sessionId);

    if (existing) {
      existing.content += data;
      if (existing.timer) clearTimeout(existing.timer);
    } else {
      this.inputBuffer.set(sessionId, { content: data, timer: null });
    }

    const entry = this.inputBuffer.get(sessionId)!;
    // Use a longer debounce for input — keystrokes arrive individually from
    // the PTY and we need to accumulate them into complete commands/prompts.
    // Flush on newline (Enter key) immediately, otherwise wait 500ms.
    const hasNewline = data.includes('\r') || data.includes('\n');
    entry.timer = setTimeout(() => {
      const content = entry.content;
      this.inputBuffer.delete(sessionId);

      if (content.trim().length === 0) return;

      // Detect end of Claude session
      if (content.trim() === '/exit' || content.trim() === 'exit') {
        this.inClaudeSession.set(sessionId, false);
      }

      const contentType = this.classifyInput(content, sessionId);
      this.buffer.push({
        session_id: sessionId,
        sequence_num: this.getSequence(sessionId),
        direction: 'input',
        content,
        content_type: contentType,
        metadata: '{}',
      });
    }, hasNewline ? 50 : 500);
  }

  logFileEdit(sessionId: string, filePath: string, content: string) {
    const truncated = content.length > MAX_FILE_EDIT_LOG_CHARS;
    const loggedContent = truncated
      ? `${content.slice(0, MAX_FILE_EDIT_LOG_CHARS)}\n\n[... file edit log truncated at ${MAX_FILE_EDIT_LOG_CHARS} characters ...]`
      : content;

    this.buffer.push({
      session_id: sessionId,
      sequence_num: this.getSequence(sessionId),
      direction: 'input',
      content: [
        `[FILE EDIT] Saved ${filePath}`,
        `Size: ${Buffer.byteLength(content, 'utf8')} bytes`,
        truncated ? `Logged: first ${MAX_FILE_EDIT_LOG_CHARS} characters` : 'Logged: full file content',
        '',
        '```',
        loggedContent,
        '```',
      ].join('\n'),
      content_type: 'command',
      metadata: JSON.stringify({
        action: 'file_edit',
        path: filePath,
        size_bytes: Buffer.byteLength(content, 'utf8'),
        logged_chars: loggedContent.length,
        truncated,
      }),
    });

    if (this.buffer.length >= 50) {
      this.flush();
    }
  }

  logOutput(sessionId: string, data: string) {
    const existing = this.outputBuffer.get(sessionId);

    if (existing) {
      existing.content += data;
      if (existing.timer) clearTimeout(existing.timer);
    } else {
      this.outputBuffer.set(sessionId, { content: data, timer: null });
    }

    const entry = this.outputBuffer.get(sessionId)!;
    entry.timer = setTimeout(() => {
      const content = entry.content;
      this.outputBuffer.delete(sessionId);

      if (content.trim().length === 0) return;

      // Detect Claude Code session start from output
      if (content.includes('╭') || content.includes('Claude Code')) {
        this.inClaudeSession.set(sessionId, true);
      }

      const contentType = this.classifyOutput(content, sessionId);
      this.buffer.push({
        session_id: sessionId,
        sequence_num: this.getSequence(sessionId),
        direction: 'output',
        content,
        content_type: contentType,
        metadata: '{}',
      });

      if (this.buffer.length >= 50) {
        this.flush();
      }
    }, 200);
  }

  private drainSessionBuffers(sessionId: string) {
    const input = this.inputBuffer.get(sessionId);
    if (input) {
      if (input.timer) clearTimeout(input.timer);
      this.inputBuffer.delete(sessionId);
      if (input.content.trim().length > 0) {
        this.buffer.push({
          session_id: sessionId,
          sequence_num: this.getSequence(sessionId),
          direction: 'input',
          content: input.content,
          content_type: this.classifyInput(input.content, sessionId),
          metadata: '{}',
        });
      }
    }

    const output = this.outputBuffer.get(sessionId);
    if (output) {
      if (output.timer) clearTimeout(output.timer);
      this.outputBuffer.delete(sessionId);
      if (output.content.trim().length > 0) {
        this.buffer.push({
          session_id: sessionId,
          sequence_num: this.getSequence(sessionId),
          direction: 'output',
          content: output.content,
          content_type: this.classifyOutput(output.content, sessionId),
          metadata: '{}',
        });
      }
    }
  }

  async flushSession(sessionId: string) {
    this.drainSessionBuffers(sessionId);
    await this.flush();
  }

  async flush() {
    if (this.flushPromise) {
      try {
        await this.flushPromise;
      } catch {
        // The original flush caller restores the buffer and logs the error.
      }
    }

    if (this.buffer.length === 0) return;

    const toInsert = [...this.buffer];
    this.buffer = [];

    this.flushPromise = (async () => {
      for (const item of toInsert) {
        await this.sql`
          INSERT INTO interactions (session_id, sequence_num, timestamp, direction, content, content_type, metadata)
          VALUES (${item.session_id}, ${item.sequence_num}, NOW(), ${item.direction}, ${item.content}, ${item.content_type}, ${item.metadata}::jsonb)
        `;
      }
      // Notify listeners with aggregated, classified content
      for (const item of toInsert) {
        for (const listener of this.flushListeners) {
          try { listener(item.session_id, item.content, item.content_type); } catch { /* non-fatal */ }
        }
      }
    })();

    try {
      await this.flushPromise;
    } catch (err) {
      console.error('Failed to flush interactions:', err);
      this.buffer.unshift(...toInsert);
    } finally {
      this.flushPromise = null;
    }
  }

  async destroy() {
    // Flush remaining buffers
    for (const [sessionId, entry] of this.inputBuffer) {
      this.drainSessionBuffers(sessionId);
    }
    for (const [sessionId] of this.outputBuffer) {
      this.drainSessionBuffers(sessionId);
    }

    await this.flush();

    if (this.flushTimer) clearInterval(this.flushTimer);
    this.inputBuffer.clear();
    this.outputBuffer.clear();
  }
}
