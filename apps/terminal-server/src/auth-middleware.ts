import * as jose from 'jose';
import type { Sql } from 'postgres';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'hiring-agent-jwt-secret-change-in-production'
);

export async function validateSessionToken(token: string, sql: Sql): Promise<{ sessionId: string; challengeId: string } | null> {
  const [session] = await sql<{ id: string; challenge_id: string; status: string }[]>`
    SELECT id, challenge_id, status FROM sessions WHERE token = ${token}
  `;

  if (!session) return null;
  if (session.status !== 'active' && session.status !== 'pending') return null;

  return { sessionId: session.id, challengeId: session.challenge_id };
}

export async function validateJWT(token: string): Promise<{ sub: string } | null> {
  try {
    const { payload } = await jose.jwtVerify(token, JWT_SECRET);
    return payload as { sub: string };
  } catch {
    return null;
  }
}
