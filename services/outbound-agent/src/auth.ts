import type { IncomingMessage, ServerResponse } from 'node:http';

export function isAuthorized(req: IncomingMessage) {
  const expected = process.env.ARCEVAL_AGENT_SECRET;
  if (!expected) return true;
  const header = req.headers.authorization || '';
  return header === `Bearer ${expected}`;
}

export function rejectUnauthorized(res: ServerResponse) {
  res.writeHead(401, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'unauthorized' }));
}
