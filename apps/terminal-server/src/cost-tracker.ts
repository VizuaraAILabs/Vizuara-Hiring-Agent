import type { Sql } from 'postgres';
import { extractTokenReadings } from './token-parser';

interface SessionTracking {
  sessionId: string;
  companyId: string;
  startedAt: number;
  inputTokens: number;
  outputTokens: number;
}

/**
 * Tracks Claude API token usage and Docker container uptime per session.
 * Persists usage_events rows when a session ends.
 */
export class CostTracker {
  private sessions = new Map<string, SessionTracking>();
  private sql: Sql;

  // Default rates: Claude Sonnet $3/$15 per M tokens
  private static INPUT_RATE = 3.0;
  private static OUTPUT_RATE = 15.0;

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
    });
  }

  processOutput(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const reading = extractTokenReadings(data);
    if (reading) {
      session.inputTokens += reading.inputTokens;
      session.outputTokens += reading.outputTokens;
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.sessions.delete(sessionId);

    const durationSeconds = Math.round((Date.now() - session.startedAt) / 1000);
    const anthropicCost =
      (session.inputTokens / 1_000_000) * CostTracker.INPUT_RATE +
      (session.outputTokens / 1_000_000) * CostTracker.OUTPUT_RATE;

    try {
      // Record Anthropic token usage
      if (session.inputTokens > 0 || session.outputTokens > 0) {
        await this.sql`
          INSERT INTO usage_events
            (session_id, company_id, provider, event_type, input_tokens, output_tokens, model, cost_usd)
          VALUES
            (${session.sessionId}, ${session.companyId}, 'anthropic', 'api_call',
             ${session.inputTokens}, ${session.outputTokens}, 'claude-sonnet', ${anthropicCost})
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
        `[CostTracker] Session ${sessionId}: ${session.inputTokens} in / ${session.outputTokens} out tokens, ` +
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
