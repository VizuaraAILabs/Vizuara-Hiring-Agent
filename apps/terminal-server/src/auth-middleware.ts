import postgres from 'postgres';
type Sql = ReturnType<typeof postgres>;

export async function validateSessionToken(token: string, sql: Sql): Promise<{ sessionId: string; challengeId: string } | null> {
  const [session] = await sql<{ id: string; challenge_id: string; status: string }[]>`
    SELECT id, challenge_id, status FROM sessions WHERE token = ${token}
  `;

  if (!session) return null;
  if (session.status !== 'active' && session.status !== 'pending') return null;

  return { sessionId: session.id, challengeId: session.challenge_id };
}
