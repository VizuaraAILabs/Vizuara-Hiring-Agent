import postgres from 'postgres';
type Sql = ReturnType<typeof postgres>;

export async function validateSessionToken(token: string, sql: Sql): Promise<{ sessionId: string; challengeId: string } | null> {
  const [session] = await sql<{ id: string; challenge_id: string; status: string; candidate_lifecycle_status: string | null }[]>`
    SELECT id, challenge_id, status, candidate_lifecycle_status FROM sessions WHERE token = ${token}
  `;

  if (!session) return null;
  if (session.candidate_lifecycle_status) return null;
  if (session.status !== 'active' && session.status !== 'pending') return null;

  return { sessionId: session.id, challengeId: session.challenge_id };
}
