import type { IncomingMessage, ServerResponse } from 'http';
import crypto from 'crypto';
import postgres from 'postgres';

type Sql = ReturnType<typeof postgres>;

export const CLAUDE_GATEWAY_MODEL = 'claude-haiku-4-5-20251001';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
const MAX_REQUEST_BYTES = 25 * 1024 * 1024;

interface GatewayConfig {
  anthropicApiKey: string;
  tokenSecret: string;
}

interface GatewayToken {
  token: string;
  expiresAt: Date;
}

function hashToken(token: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(token).digest('hex');
}

function createOpaqueToken(): string {
  return `claude_sess_${crypto.randomBytes(32).toString('base64url')}`;
}

function getHeader(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  if (Array.isArray(value)) return value.join(', ');
  return value;
}

function writeJson(res: ServerResponse, status: number, body: Record<string, unknown>) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_REQUEST_BYTES) {
        reject(new Error('REQUEST_TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    req.on('error', reject);
  });
}

export async function issueClaudeGatewayToken(sql: Sql, sessionId: string, tokenSecret: string): Promise<GatewayToken> {
  const [session] = await sql<{ id: string; time_limit_min: number }[]>`
    SELECT s.id, c.time_limit_min
    FROM sessions s
    JOIN challenges c ON c.id = s.challenge_id
    WHERE s.id = ${sessionId}
  `;

  if (!session) {
    throw new Error('SESSION_NOT_FOUND');
  }

  const token = createOpaqueToken();
  const tokenHash = hashToken(token, tokenSecret);
  const ttlMinutes = session.time_limit_min + 30;
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000);

  await sql`
    UPDATE claude_gateway_tokens
    SET revoked_at = NOW()
    WHERE session_id = ${sessionId}
      AND revoked_at IS NULL
  `;

  await sql`
    INSERT INTO claude_gateway_tokens (session_id, token_hash, expires_at)
    VALUES (${sessionId}, ${tokenHash}, ${expiresAt})
  `;

  return { token, expiresAt };
}

async function validateGatewayToken(sql: Sql, bearerToken: string, tokenSecret: string): Promise<{ sessionId: string } | null> {
  const tokenHash = hashToken(bearerToken, tokenSecret);
  const [row] = await sql<{ id: string; session_id: string; status: string }[]>`
    SELECT cgt.id, cgt.session_id, s.status
    FROM claude_gateway_tokens cgt
    JOIN sessions s ON s.id = cgt.session_id
    WHERE cgt.token_hash = ${tokenHash}
      AND cgt.revoked_at IS NULL
      AND cgt.expires_at > NOW()
  `;

  if (!row || row.status !== 'active') return null;

  await sql`
    UPDATE claude_gateway_tokens
    SET last_used_at = NOW()
    WHERE id = ${row.id}
  `;

  return { sessionId: row.session_id };
}

export async function handleClaudeGatewayRequest(
  req: IncomingMessage,
  res: ServerResponse,
  sql: Sql,
  config: GatewayConfig
): Promise<void> {
  if (req.method !== 'POST') {
    writeJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  if (!config.anthropicApiKey || !config.tokenSecret) {
    writeJson(res, 503, { error: 'Claude gateway is not configured' });
    return;
  }

  const authHeader = getHeader(req, 'authorization') || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    writeJson(res, 401, { error: 'Missing bearer token' });
    return;
  }

  const tokenInfo = await validateGatewayToken(sql, match[1], config.tokenSecret);
  if (!tokenInfo) {
    writeJson(res, 401, { error: 'Invalid or expired bearer token' });
    return;
  }

  let bodyText: string;
  let parsedBody: any;
  try {
    bodyText = await readRequestBody(req);
    parsedBody = JSON.parse(bodyText);
  } catch (err: any) {
    const status = err?.message === 'REQUEST_TOO_LARGE' ? 413 : 400;
    writeJson(res, status, { error: status === 413 ? 'Request too large' : 'Invalid JSON body' });
    return;
  }

  if (parsedBody?.model !== CLAUDE_GATEWAY_MODEL) {
    writeJson(res, 403, { error: 'Model is not allowed' });
    return;
  }

  const upstreamHeaders: Record<string, string> = {
    'content-type': getHeader(req, 'content-type') || 'application/json',
    'accept': getHeader(req, 'accept') || 'application/json',
    'anthropic-version': getHeader(req, 'anthropic-version') || DEFAULT_ANTHROPIC_VERSION,
    'x-api-key': config.anthropicApiKey,
  };

  const anthropicBeta = getHeader(req, 'anthropic-beta');
  if (anthropicBeta) upstreamHeaders['anthropic-beta'] = anthropicBeta;

  let upstream: Response;
  try {
    upstream = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: upstreamHeaders,
      body: bodyText,
    });
  } catch {
    writeJson(res, 502, { error: 'Failed to reach Anthropic API' });
    return;
  }

  const responseHeaders: Record<string, string> = {};
  upstream.headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower === 'content-encoding' || lower === 'transfer-encoding' || lower === 'content-length') return;
    responseHeaders[key] = value;
  });

  res.writeHead(upstream.status, responseHeaders);

  if (!upstream.body) {
    res.end();
    return;
  }

  const reader = upstream.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch {
    res.destroy();
  } finally {
    reader.releaseLock();
  }
}
