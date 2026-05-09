import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import type { Session, Challenge, WorkspaceSnapshot } from '@/types';

function normalizeWorkspaceSnapshot(snapshot: unknown): WorkspaceSnapshot | null {
  let parsed = snapshot;

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return null;
    }
  }

  if (!parsed || typeof parsed !== 'object') return null;

  const candidate = parsed as Partial<WorkspaceSnapshot>;
  return {
    archived_at: typeof candidate.archived_at === 'string' ? candidate.archived_at : '',
    tree: Array.isArray(candidate.tree) ? candidate.tree : [],
    files: Array.isArray(candidate.files) ? candidate.files : [],
  };
}

async function verifyAccess(sessionId: string, userId: string) {
  const [session] = await sql<Session[]>`SELECT * FROM sessions WHERE id = ${sessionId}`;
  if (!session) return null;

  const [challenge] = await sql<Challenge[]>`SELECT * FROM challenges WHERE id = ${session.challenge_id}`;
  if (!challenge || challenge.company_id !== userId) return null;

  return session;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  try {
    const user = await getAuthUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (!user.companyId) return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });

    const { sessionId } = await params;
    const session = await verifyAccess(sessionId, user.companyId);
    if (!session) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    if (session.status === 'pending' || session.status === 'active') {
      return NextResponse.json({ error: 'Session is still in progress' }, { status: 409 });
    }

    const [row] = await sql<{ workspace_snapshot: unknown }[]>`
      SELECT workspace_snapshot FROM sessions WHERE id = ${sessionId}
    `;

    if (!row?.workspace_snapshot) {
      return NextResponse.json({ error: 'No workspace snapshot available for this session' }, { status: 404 });
    }

    const snapshot = normalizeWorkspaceSnapshot(row.workspace_snapshot);
    if (!snapshot) {
      return NextResponse.json({ error: 'Invalid workspace snapshot' }, { status: 500 });
    }

    return NextResponse.json(snapshot);
  } catch (error) {
    console.error('Error fetching workspace snapshot:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
