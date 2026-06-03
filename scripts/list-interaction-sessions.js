#!/usr/bin/env node

const path = require('path');
const postgres = require('postgres');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '..');
dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });

function usage() {
  console.log(`
Usage:
  node scripts/list-interaction-sessions.js [options]

Options:
  --limit <n>           Number of sessions to print. Default: 20.
  --challenge-id <uuid> Filter sessions by challenge id.
  --all                 Include sessions with zero interactions.
  --help                Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    limit: 20,
    challengeId: '',
    includeEmpty: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--limit') {
      args.limit = Number.parseInt(argv[++i] || '', 10);
      continue;
    }
    if (arg === '--challenge-id') {
      args.challengeId = argv[++i] || '';
      continue;
    }
    if (arg === '--all') {
      args.includeEmpty = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 200) {
    throw new Error('--limit must be an integer between 1 and 200');
  }

  return args;
}

function formatDate(value) {
  if (!value) return '';
  return value instanceof Date ? value.toISOString() : String(value);
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
    const rows = args.includeEmpty
      ? await sql`
          SELECT
            s.id,
            s.challenge_id,
            s.candidate_name,
            s.candidate_email,
            s.status,
            s.created_at,
            COUNT(i.id)::int AS interaction_count,
            MAX(i.timestamp) AS last_interaction_at
          FROM sessions s
          LEFT JOIN interactions i ON i.session_id = s.id
          WHERE (${args.challengeId || null}::uuid IS NULL OR s.challenge_id = ${args.challengeId || null}::uuid)
          GROUP BY s.id
          ORDER BY COALESCE(MAX(i.timestamp), s.created_at) DESC
          LIMIT ${args.limit}
        `
      : await sql`
          SELECT
            s.id,
            s.challenge_id,
            s.candidate_name,
            s.candidate_email,
            s.status,
            s.created_at,
            COUNT(i.id)::int AS interaction_count,
            MAX(i.timestamp) AS last_interaction_at
          FROM sessions s
          JOIN interactions i ON i.session_id = s.id
          WHERE (${args.challengeId || null}::uuid IS NULL OR s.challenge_id = ${args.challengeId || null}::uuid)
          GROUP BY s.id
          ORDER BY MAX(i.timestamp) DESC
          LIMIT ${args.limit}
        `;

    if (rows.length === 0) {
      console.log('No sessions found.');
      return;
    }

    console.table(rows.map((row) => ({
      session_id: String(row.id),
      challenge_id: String(row.challenge_id),
      status: row.status,
      interactions: row.interaction_count,
      last_interaction_at: formatDate(row.last_interaction_at),
      created_at: formatDate(row.created_at),
      candidate: row.candidate_name,
      email: row.candidate_email,
    })));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
