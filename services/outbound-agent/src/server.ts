import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { isAuthorized, rejectUnauthorized } from './auth.js';
import { runDiscovery, runDraftOutreach, runEnrichment } from './claude-runner.js';
import type { RunRequest } from './schemas.js';

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function isRunRequest(value: unknown): value is RunRequest {
  if (!value || typeof value !== 'object') return false;
  const body = value as Record<string, unknown>;
  return typeof body.runId === 'string'
    && ['discovery', 'enrichment', 'draft_outreach', 'reply_classification'].includes(String(body.mode));
}

async function handleRun(req: IncomingMessage, res: ServerResponse) {
  if (!isAuthorized(req)) return rejectUnauthorized(res);
  const body = await readJson(req);
  if (!isRunRequest(body)) {
    return sendJson(res, 400, { error: 'runId and supported mode are required' });
  }

  if (body.mode === 'discovery') {
    const result = await runDiscovery(body);
    return sendJson(res, 200, { runId: body.runId, status: 'completed', result });
  }

  if (body.mode === 'enrichment') {
    const result = await runEnrichment(body);
    return sendJson(res, 200, { runId: body.runId, status: 'completed', result });
  }

  if (body.mode === 'draft_outreach') {
    const result = await runDraftOutreach(body);
    return sendJson(res, 200, { runId: body.runId, status: 'completed', result });
  }

  return sendJson(res, 501, { runId: body.runId, status: 'failed', error: `${body.mode} is not implemented yet` });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      return sendJson(res, 200, { ok: true, service: 'arceval-outbound-agent', version: '0.1.0' });
    }
    if (req.method === 'POST' && url.pathname === '/runs') {
      return await handleRun(req, res);
    }
    return sendJson(res, 404, { error: 'not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'internal error';
    return sendJson(res, 500, { error: message });
  }
});

const port = Number(process.env.PORT || 8080);
server.listen(port, '0.0.0.0', () => {
  console.log(`arceval-outbound-agent listening on ${port}`);
});
