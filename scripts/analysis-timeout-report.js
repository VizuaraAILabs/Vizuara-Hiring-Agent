#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const postgres = require('postgres');
const dotenv = require('dotenv');

const ROOT_DIR = path.resolve(__dirname, '..');
const DEFAULT_OUT = path.join(ROOT_DIR, 'tmp', 'analysis-timeout-report.json');

dotenv.config({ path: path.join(ROOT_DIR, '.env.local') });
dotenv.config({ path: path.join(ROOT_DIR, '.env.production'), override: true });

function usage() {
  console.log(`
Usage:
  node scripts/analysis-timeout-report.js [options]

Options:
  --hours <n>       Look back this many hours for failures. Default: 48.
  --limit <n>       Max rows per section. Default: 50.
  --candidate <q>   Optional candidate name/email search text.
  --out <path>      Output JSON file. Default: tmp/analysis-timeout-report.json
  --help            Show this help.
`);
}

function parseArgs(argv) {
  const args = {
    hours: 48,
    limit: 50,
    candidate: '',
    out: DEFAULT_OUT,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      usage();
      process.exit(0);
    }
    if (arg === '--hours') {
      args.hours = Number.parseInt(argv[++i] || '', 10);
      continue;
    }
    if (arg === '--limit') {
      args.limit = Number.parseInt(argv[++i] || '', 10);
      continue;
    }
    if (arg === '--candidate') {
      args.candidate = argv[++i] || '';
      continue;
    }
    if (arg === '--out') {
      args.out = path.resolve(ROOT_DIR, argv[++i] || '');
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!Number.isInteger(args.hours) || args.hours < 1 || args.hours > 24 * 30) {
    throw new Error('--hours must be an integer between 1 and 720');
  }
  if (!Number.isInteger(args.limit) || args.limit < 1 || args.limit > 500) {
    throw new Error('--limit must be an integer between 1 and 500');
  }

  return args;
}

function serialize(value) {
  return JSON.parse(JSON.stringify(value, (_key, entry) => {
    if (entry instanceof Date) return entry.toISOString();
    if (typeof entry === 'bigint') return entry.toString();
    return entry;
  }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set. Put it in .env.local/.env.production or export it before running.');
  }

  const sql = postgres(databaseUrl, {
    max: 2,
    idle_timeout: 5,
    connect_timeout: 10,
  });

  const candidatePattern = args.candidate ? `%${args.candidate}%` : null;

  try {
    const recentFailures = await sql`
      SELECT
        af.session_id,
        af.error_code,
        af.error_message,
        af.error_metadata,
        af.created_at,
        s.candidate_name,
        s.candidate_email,
        s.status AS session_status,
        s.created_at AS session_created_at,
        s.ended_at AS session_ended_at,
        c.title AS challenge_title,
        aj.status AS analysis_job_status,
        aj.attempt_count AS analysis_job_attempt_count,
        aj.last_error AS analysis_job_last_error,
        aj.updated_at AS analysis_job_updated_at
      FROM analysis_failures af
      LEFT JOIN sessions s ON s.id = af.session_id
      LEFT JOIN challenges c ON c.id = s.challenge_id
      LEFT JOIN analysis_jobs aj ON aj.session_id = af.session_id
      WHERE af.created_at >= NOW() - (${args.hours} * INTERVAL '1 hour')
        AND (
          ${candidatePattern}::text IS NULL
          OR s.candidate_email ILIKE ${candidatePattern}
          OR s.candidate_name ILIKE ${candidatePattern}
        )
      ORDER BY af.created_at DESC
      LIMIT ${args.limit}
    `;

    const stuckOrFailedSessions = await sql`
      SELECT
        s.id AS session_id,
        s.candidate_name,
        s.candidate_email,
        s.status AS session_status,
        s.created_at AS session_created_at,
        s.ended_at AS session_ended_at,
        c.title AS challenge_title,
        aj.status AS analysis_job_status,
        aj.attempt_count,
        aj.last_error,
        aj.claimed_by,
        aj.claimed_at,
        aj.lease_expires_at,
        aj.updated_at AS analysis_job_updated_at,
        ar.id IS NOT NULL AS has_analysis_result
      FROM sessions s
      LEFT JOIN challenges c ON c.id = s.challenge_id
      LEFT JOIN analysis_jobs aj ON aj.session_id = s.id
      LEFT JOIN analysis_results ar ON ar.session_id = s.id
      WHERE s.status IN ('queued', 'analyzing', 'analysis failed')
        AND (
          ${candidatePattern}::text IS NULL
          OR s.candidate_email ILIKE ${candidatePattern}
          OR s.candidate_name ILIKE ${candidatePattern}
        )
      ORDER BY COALESCE(aj.updated_at, s.ended_at, s.created_at) DESC
      LIMIT ${args.limit}
    `;

    const recentCompletedWithoutAnalysis = await sql`
      SELECT
        s.id AS session_id,
        s.candidate_name,
        s.candidate_email,
        s.status AS session_status,
        s.created_at AS session_created_at,
        s.ended_at AS session_ended_at,
        c.title AS challenge_title,
        aj.status AS analysis_job_status,
        aj.attempt_count,
        aj.last_error,
        aj.updated_at AS analysis_job_updated_at
      FROM sessions s
      LEFT JOIN challenges c ON c.id = s.challenge_id
      LEFT JOIN analysis_jobs aj ON aj.session_id = s.id
      LEFT JOIN analysis_results ar ON ar.session_id = s.id
      WHERE s.status = 'completed'
        AND ar.id IS NULL
        AND COALESCE(s.ended_at, s.created_at) >= NOW() - (${args.hours} * INTERVAL '1 hour')
        AND (
          ${candidatePattern}::text IS NULL
          OR s.candidate_email ILIKE ${candidatePattern}
          OR s.candidate_name ILIKE ${candidatePattern}
        )
      ORDER BY COALESCE(s.ended_at, s.created_at) DESC
      LIMIT ${args.limit}
    `;

    const recentTimeoutSummary = await sql`
      SELECT
        af.error_code,
        COUNT(*)::int AS count,
        MIN(af.created_at) AS first_seen,
        MAX(af.created_at) AS last_seen
      FROM analysis_failures af
      LEFT JOIN sessions s ON s.id = af.session_id
      WHERE af.created_at >= NOW() - (${args.hours} * INTERVAL '1 hour')
        AND (
          ${candidatePattern}::text IS NULL
          OR s.candidate_email ILIKE ${candidatePattern}
          OR s.candidate_name ILIKE ${candidatePattern}
        )
      GROUP BY af.error_code
      ORDER BY count DESC, last_seen DESC
    `;

    const report = {
      generated_at: new Date().toISOString(),
      filters: {
        hours: args.hours,
        limit: args.limit,
        candidate: args.candidate || null,
      },
      counts: {
        recent_failures: recentFailures.length,
        stuck_or_failed_sessions: stuckOrFailedSessions.length,
        recent_completed_without_analysis: recentCompletedWithoutAnalysis.length,
      },
      timeout_codes: [
        'analysis_timeout',
        'analysis_start_timeout',
        'enrich_dimensions_timeout',
        'transcript_narrative_timeout',
      ],
      recent_timeout_summary: serialize(recentTimeoutSummary),
      recent_failures: serialize(recentFailures),
      stuck_or_failed_sessions: serialize(stuckOrFailedSessions),
      recent_completed_without_analysis: serialize(recentCompletedWithoutAnalysis),
    };

    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

    console.log(`Wrote ${path.relative(ROOT_DIR, args.out)}`);
    console.log(`Recent failures: ${recentFailures.length}`);
    console.log(`Stuck/failed sessions: ${stuckOrFailedSessions.length}`);
    console.log(`Completed without analysis: ${recentCompletedWithoutAnalysis.length}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exit(1);
});
