// ActivityMonitor watches terminal interactions for trigger events and fires
// interview questions via the Next.js API.

interface ActivityEntry {
  content: string;
  contentType: string;
  timestamp: number;
}

interface MonitorConfig {
  sessionToken: string;
  nextAppUrl: string;
  // Minimum gap between AI-initiated questions (ms)
  minIntervalMs?: number;
  // Maximum number of AI-initiated questions per session
  maxQuestions?: number;
}

// Trigger types and the patterns that fire them
const TRIGGER_PATTERNS: Array<{ type: string; test: (content: string) => boolean }> = [
  {
    type: 'new_file_created',
    test: (c) => /\btouch\s+\S+|\bcreate[d]?\s+\S+\.(ts|py|js|go|rs|java|cpp|c|rb|php)\b/i.test(c),
  },
  {
    type: 'test_run',
    test: (c) => /\b(pytest|npm test|yarn test|jest|go test|cargo test|rspec|make test)\b/.test(c),
  },
  {
    type: 'repeated_test_failure',
    test: (c) => /\b(FAILED|AssertionError|Error:|failed|error)/i.test(c),
  },
  {
    type: 'architecture_pivot',
    test: (c) =>
      /\b(refactor|rewrite|start over|different approach|better way|class\s+\w+|interface\s+\w+)\b/i.test(c),
  },
  {
    type: 'large_code_write',
    // Heuristic: a prompt that's long and mentions implementation
    test: (c) => c.length > 200 && /\b(implement|create|build|write|add)\b/i.test(c),
  },
  {
    type: 'data_structure_choice',
    test: (c) =>
      /\b(hashmap|hash map|dictionary|dict|array|list|queue|stack|tree|graph|set|heap|trie)\b/i.test(c),
  },
];

export class ActivityMonitor {
  private readonly config: Required<MonitorConfig>;
  private recentActivity: ActivityEntry[] = [];
  private lastQuestionTime: number = 0;
  private idleTimer: NodeJS.Timeout | null = null;
  private failureBuffer: number[] = []; // timestamps of recent failures
  private destroyed = false;

  constructor(config: MonitorConfig) {
    this.config = {
      minIntervalMs: 5 * 60 * 1000,
      maxQuestions: 6,
      ...config,
    };

    // Start idle check — fires if candidate hasn't done anything for 5 minutes
    this.resetIdleTimer();
  }

  /** Called for every interaction flushed to DB. */
  observe(content: string, contentType: string) {
    if (this.destroyed) return;

    this.recentActivity.push({ content, contentType, timestamp: Date.now() });
    // Keep a rolling window of the last 20 entries
    if (this.recentActivity.length > 20) {
      this.recentActivity.shift();
    }

    this.resetIdleTimer();
    this.checkTriggers(content, contentType);
  }

  private checkTriggers(content: string, contentType: string) {
    if (!this.canAsk()) return;

    for (const trigger of TRIGGER_PATTERNS) {
      if (trigger.type === 'repeated_test_failure') {
        if (trigger.test(content)) {
          this.failureBuffer.push(Date.now());
          // Prune failures older than 3 minutes
          const cutoff = Date.now() - 3 * 60 * 1000;
          this.failureBuffer = this.failureBuffer.filter((t) => t > cutoff);
          if (this.failureBuffer.length >= 2) {
            this.failureBuffer = [];
            this.fire('repeated_test_failure');
            return;
          }
        }
        continue;
      }

      if (trigger.test(content)) {
        this.fire(trigger.type);
        return;
      }
    }
  }

  private canAsk(): boolean {
    return Date.now() - this.lastQuestionTime >= this.config.minIntervalMs;
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.destroyed) return;

    this.idleTimer = setTimeout(() => {
      if (this.canAsk() && this.recentActivity.length > 0) {
        this.fire('extended_idle');
      }
    }, 5 * 60 * 1000);
  }

  private async fire(triggerType: string) {
    if (!this.canAsk() || this.destroyed) return;

    this.lastQuestionTime = Date.now();

    const recentActivity = this.recentActivity
      .slice(-15)
      .map((e) => e.content.trim())
      .filter((c) => c.length > 0);

    try {
      const url = `${this.config.nextAppUrl}/api/sessions/${this.config.sessionToken}/interview/trigger`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recentActivity, triggerType }),
        signal: AbortSignal.timeout(15_000),
      });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>) as Record<string, unknown>;
      if (data.ok && data.generated) {
        console.log(`[Interview] Question generated for trigger: ${triggerType}`);
      } else if (!data.ok) {
        // Not generated — reset timer so we can try again later
        this.lastQuestionTime = 0;
        console.log(`[Interview] Trigger skipped: ${String(data.reason ?? 'no question generated')}`);
      }
    } catch (err) {
      console.warn(`[Interview] Failed to call trigger endpoint:`, (err as Error).message);
      // Reset so next trigger can retry
      this.lastQuestionTime = 0;
    }
  }

  destroy() {
    this.destroyed = true;
    if (this.idleTimer) clearTimeout(this.idleTimer);
  }
}
