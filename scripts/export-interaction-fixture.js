#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_OUT_DIR = path.join(
  ROOT_DIR,
  'services',
  'analysis-engine',
  'tests',
  'fixtures',
  'interactions',
);

dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });

function usage() {
  console.log(`
Usage:
  node scripts/export-interaction-fixture.js --session-id <uuid> [options]

Options:
  --limit <n>       Number of interactions to export. Default: 200.
  --out <path>      Output file path. Default: services/analysis-engine/tests/fixtures/interactions/<session-id>.json
  --raw             Disable content redaction. Use only for local, uncommitted debugging.
  --help            Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    sessionId: '',
    limit: 200,
    out: '',
    redact: true,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--session-id') {
      args.sessionId = argv[++i] || '';
      continue;
    }
    if (arg === '--limit') {
      args.limit = Number.parseInt(argv[++i] || '', 10);
      continue;
    }
    if (arg === '--out') {
      args.out = argv[++i] || '';
      continue;
    }
    if (arg === '--raw') {
      args.redact = false;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.sessionId) {
    throw new Error('Missing required --session-id');
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 1000) {
    throw new Error('--limit must be an integer between 1 and 1000');
  }
  if (!args.out) {
    args.out = path.join(DEFAULT_OUT_DIR, `${args.sessionId}.json`);
  }

  return args;
}

function redactText(value) {
  if (typeof value !== 'string') return value;

  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/\b(?:sk|pk|rk|xox[baprs])-[-_A-Za-z0-9]{16,}\b/g, '[REDACTED_TOKEN]')
    .replace(/\b[A-Za-z0-9_]*(?:API|TOKEN|SECRET|KEY|PASSWORD)[A-Za-z0-9_]*\s*=\s*["']?[^"'\s]+["']?/gi, '[REDACTED_SECRET]')
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{16,}\b/gi, '[REDACTED_AUTH_HEADER]');
}

function redactJson(value) {
  if (typeof value === 'string') return redactText(value);
  if (Array.isArray(value)) return value.map(redactJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /email|token|secret|key|password|authorization/i.test(key)
          ? '[REDACTED]'
          : redactJson(entry),
      ]),
    );
  }
  return value;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Put it in .env.local or export it before running.');
  }

  const sql = postgres(databaseUrl, {
    max: 1,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  try {
    const rows = await sql`
      SELECT id, session_id, sequence_num, timestamp, direction, content, content_type, metadata
      FROM interactions
      WHERE session_id = ${args.sessionId}
      ORDER BY sequence_num ASC
      LIMIT ${args.limit}
    `;

    const fixture = rows.map((row) => ({
      id: row.id,
      session_id: String(row.session_id),
      sequence_num: row.sequence_num,
      timestamp: row.timestamp instanceof Date ? row.timestamp.toISOString() : String(row.timestamp),
      direction: row.direction,
      content: args.redact ? redactText(row.content) : row.content,
      content_type: row.content_type,
      metadata: args.redact ? redactJson(row.metadata ?? {}) : (row.metadata ?? {}),
    }));

    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8');
    console.log(`Exported ${fixture.length} interaction(s) to ${path.relative(ROOT_DIR, args.out)}`);
    if (fixture.length === 0) {
      console.warn('No rows found for that session_id.');
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
