import sql from '@/lib/db';

export async function recordAnalysisFailure(
  sessionId: string,
  errorCode: string,
  errorMessage: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    await sql`
      INSERT INTO analysis_failures (
        session_id,
        error_code,
        error_message,
        error_metadata
      ) VALUES (
        ${sessionId},
        ${errorCode},
        ${errorMessage},
        ${sql.json(metadata as Parameters<typeof sql.json>[0])}
      )
    `;
  } catch (error) {
    console.error('Failed to record analysis failure:', error);
  }
}
