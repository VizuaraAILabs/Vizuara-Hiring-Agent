import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { getChallengeById } from '@/lib/challenge-queries';
import type { Session, WorkspaceFile, WorkspaceSnapshot } from '@/types';

async function verifyAccess(sessionId: string, userId: string) {
  const [session] = await sql<Session[]>`SELECT * FROM sessions WHERE id = ${sessionId}`;
  if (!session) return null;

  const challenge = await getChallengeById(session.challenge_id);
  if (!challenge || challenge.company_id !== userId) return null;

  return session;
}

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

function sanitizeZipPath(filePath: string): string | null {
  const normalized = filePath.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);

  if (parts.length === 0 || parts.some((part) => part === '.' || part === '..')) {
    return null;
  }

  return parts.join('/');
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUInt16(value: number): Buffer {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function writeUInt32(value: number): Buffer {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value >>> 0);
  return buffer;
}

function createZip(files: WorkspaceFile[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const zipPath = sanitizeZipPath(file.path);
    if (!zipPath) continue;

    const nameBuffer = Buffer.from(zipPath, 'utf8');
    const contentBuffer = Buffer.from(file.content ?? '', 'utf8');
    const checksum = crc32(contentBuffer);

    const localHeader = Buffer.concat([
      writeUInt32(0x04034b50),
      writeUInt16(20),
      writeUInt16(0x0800),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(checksum),
      writeUInt32(contentBuffer.length),
      writeUInt32(contentBuffer.length),
      writeUInt16(nameBuffer.length),
      writeUInt16(0),
      nameBuffer,
    ]);

    const centralHeader = Buffer.concat([
      writeUInt32(0x02014b50),
      writeUInt16(20),
      writeUInt16(20),
      writeUInt16(0x0800),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(checksum),
      writeUInt32(contentBuffer.length),
      writeUInt32(contentBuffer.length),
      writeUInt16(nameBuffer.length),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt16(0),
      writeUInt32(0),
      writeUInt32(offset),
      nameBuffer,
    ]);

    localParts.push(localHeader, contentBuffer);
    centralParts.push(centralHeader);
    offset += localHeader.length + contentBuffer.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const endOfCentralDirectory = Buffer.concat([
    writeUInt32(0x06054b50),
    writeUInt16(0),
    writeUInt16(0),
    writeUInt16(centralParts.length),
    writeUInt16(centralParts.length),
    writeUInt32(centralDirectory.length),
    writeUInt32(offset),
    writeUInt16(0),
  ]);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
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

    const zip = createZip(snapshot.files);
    const body = zip.buffer.slice(
      zip.byteOffset,
      zip.byteOffset + zip.byteLength,
    ) as ArrayBuffer;
    const filename = `workspace-${sessionId}.zip`;

    return new NextResponse(body, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(zip.length),
      },
    });
  } catch (error) {
    console.error('Error downloading workspace snapshot:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
