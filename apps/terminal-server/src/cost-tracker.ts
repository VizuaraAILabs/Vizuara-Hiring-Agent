import type { Sql } from 'postgres';
import { extractTokenReadings } from './token-parser';

interface SessionTracking {
  sessionId: string;
  companyId: string;
  startedAt: number;
  inputTokens: number;
  outputTokens: number;
  inputChars: number;
  outputChars: number;
}

/**
 * Tracks Claude API token usage and Docker container uptime per session.
 *
 * Primary method: parse Claude Code's token indicators from PTY output.
 * Fallback: estimate tokens from interaction character counts (~4 chars/token).
 *
 * Persists usage_events rows when a session ends.
 */
export class CostTracker {
  private sessions = new Map<string, SessionTracking>();
  private sql: Sql;

  // Default rates: Claude Sonnet $3/$15 per M tokens
  private static INPUT_RATE = 3.0;
  private static OUTPUT_RATE = 15.0;
  private static CHARS_PER_TOKEN = 4;

  constructor(sql: Sql) {
    this.sql = sql;
  }

  startSession(sessionId: string, companyId: string): void {
    this.sessions.set(sessionId, {
      sessionId,
      companyId,
      startedAt: Date.now(),
      inputTokens: 0,
      outputTokens: 0,
      inputChars: 0,
      outputChars: 0,
    });
  }

  processOutput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Track raw character count for fallback estimation
    session.outputChars += data.length;

    // Try to parse token indicators from PTY output
    const reading = extractTokenReadings(data);
    if (reading) {
      session.inputTokens += reading.inputTokens;
      session.outputTokens += reading.outputTokens;
    }
  }

  processInput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.inputChars += data.length;
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.sessions.delete(sessionId);

    const durationSeconds = Math.round((Date.now() - session.startedAt) / 1000);

    // Use parsed tokens if available, otherwise estimate from character counts
    let inputTokens = session.inputTokens;
    let outputTokens = session.outputTokens;
    let estimated = false;

    if (inputTokens === 0 && outputTokens === 0 && (session.inputChars > 0 || session.outputChars > 0)) {
      // Fallback: estimate from interactions stored in DB
      try {
        const [row] = await this.sql`
          SELECT
            COALESCE(SUM(CASE WHEN direction = 'input' THEN length(content) ELSE 0 END), 0) as input_chars,
            COALESCE(SUM(CASE WHEN direction = 'output' THEN length(content) ELSE 0 END), 0) as output_chars
          FROM interactions
          WHERE session_id = ${session.sessionId}
        `;
        if (row) {
          inputTokens = Math.round(Number(row.input_chars) / CostTracker.CHARS_PER_TOKEN);
          outputTokens = Math.round(Number(row.output_chars) / CostTracker.CHARS_PER_TOKEN);
          estimated = true;
        }
      } catch (err) {
        // If DB query fails, use the raw char counts we accumulated
        inputTokens = Math.round(session.inputChars / CostTracker.CHARS_PER_TOKEN);
        outputTokens = Math.round(session.outputChars / CostTracker.CHARS_PER_TOKEN);
        estimated = true;
      }
    }

    const anthropicCost =
      (inputTokens / 1_000_000) * CostTracker.INPUT_RATE +
      (outputTokens / 1_000_000) * CostTracker.OUTPUT_RATE;

    try {
      // Record Anthropic token usage
      if (inputTokens > 0 || outputTokens > 0) {
        await this.sql`
          INSERT INTO usage_events
            (session_id, company_id, provider, event_type, input_tokens, output_tokens, model, cost_usd, metadata)
          VALUES
            (${session.sessionId}, ${session.companyId}, 'anthropic', 'api_call',
             ${inputTokens}, ${outputTokens}, 'claude-sonnet', ${anthropicCost},
             ${JSON.stringify({ estimated })}::jsonb)
        `;
      }

      // Record Docker container runtime
      await this.sql`
        INSERT INTO usage_events
          (session_id, company_id, provider, event_type, duration_seconds, cost_usd)
        VALUES
          (${session.sessionId}, ${session.companyId}, 'docker', 'container_run',
           ${durationSeconds}, 0)
      `;

      console.log(
        `[CostTracker] Session ${sessionId}: ${inputTokens} in / ${outputTokens} out tokens${estimated ? ' (estimated)' : ''}, ` +
        `$${anthropicCost.toFixed(6)} Anthropic, ${durationSeconds}s container`
      );
    } catch (err) {
      console.error(`[CostTracker] Failed to persist cost events for ${sessionId}:`, err);
    }
  }

  async destroy(): Promise<void> {
    const remaining = [...this.sessions.keys()];
    for (const sessionId of remaining) {
      await this.endSession(sessionId);
    }
  }
}
