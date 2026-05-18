import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import type {
  DimensionDetail,
  KeyMoment,
  PromptComplexityEntry,
  TimelineEntry,
} from '@/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

type SessionStatus = 'pending' | 'active' | 'completed' | 'queued' | 'analyzing' | 'analyzed';
type HiringRecommendation = 'strong_yes' | 'yes' | 'neutral' | 'no' | 'strong_no';

type CandidateAnalysisRow = {
  session_id: string;
  session_status: SessionStatus;
  candidate_name: string;
  candidate_email: string;
  started_at: string | null;
  ended_at: string | null;
  session_created_at: string;
  challenge_id: string;
  challenge_title: string;
  challenge_description: string;
  role: string | null;
  tech_stack: string | null;
  seniority: string | null;
  focus_areas: string | null;
  context: string | null;
  time_limit_min: number;
  analysis_id: string | null;
  analysis_created_at: string | null;
  overall_score: number | null;
  problem_decomposition: number | null;
  first_principles: number | null;
  creativity: number | null;
  iteration_quality: number | null;
  debugging_approach: number | null;
  architecture_thinking: number | null;
  communication_clarity: number | null;
  efficiency: number | null;
  dimension_details: Record<string, DimensionDetail> | string | null;
  key_moments: KeyMoment[] | string | null;
  timeline_data: TimelineEntry[] | string | null;
  prompt_complexity: PromptComplexityEntry[] | string | null;
  category_breakdown: Record<string, number> | string | null;
  summary_narrative: string | null;
  strengths: string[] | string | null;
  areas_for_growth: string[] | string | null;
  hiring_recommendation: HiringRecommendation | null;
  transcript_narrative: string | null;
};

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getProvidedApiKey(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice('bearer '.length).trim();
  }

  return request.headers.get('x-api-key');
}

function matchesApiKey(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);

  if (providedBuffer.length !== expectedBuffer.length) {
    return false;
  }

  return timingSafeEqual(providedBuffer, expectedBuffer);
}

function parseJsonValue<T>(value: T | string | null, fallback: T): T {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  try {
    const expectedApiKey = process.env.CANDIDATE_ANALYSIS_API_KEY;
    if (!expectedApiKey) {
      return NextResponse.json(
        { error: 'Candidate analysis API key is not configured' },
        { status: 503 },
      );
    }

    const providedApiKey = getProvidedApiKey(request);
    if (!providedApiKey || !matchesApiKey(providedApiKey, expectedApiKey)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const email = request.nextUrl.searchParams.get('email')?.trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: 'A valid email query parameter is required' }, { status: 400 });
    }

    const rows = await sql<CandidateAnalysisRow[]>`
      SELECT
        s.id AS session_id,
        s.status AS session_status,
        s.candidate_name,
        s.candidate_email,
        s.started_at,
        s.ended_at,
        s.created_at AS session_created_at,
        c.id AS challenge_id,
        c.title AS challenge_title,
        c.description AS challenge_description,
        c.role,
        c.tech_stack,
        c.seniority,
        c.focus_areas,
        c.context,
        c.time_limit_min,
        a.id AS analysis_id,
        a.created_at AS analysis_created_at,
        a.overall_score,
        a.problem_decomposition,
        a.first_principles,
        a.creativity,
        a.iteration_quality,
        a.debugging_approach,
        a.architecture_thinking,
        a.communication_clarity,
        a.efficiency,
        a.dimension_details,
        a.key_moments,
        a.timeline_data,
        a.prompt_complexity,
        a.category_breakdown,
        a.summary_narrative,
        a.strengths,
        a.areas_for_growth,
        a.hiring_recommendation,
        a.transcript_narrative
      FROM sessions s
      JOIN challenges c ON c.id = s.challenge_id
      LEFT JOIN analysis_results a ON a.session_id = s.id
      WHERE lower(s.candidate_email) = ${email}
      ORDER BY s.created_at DESC
    `;

    const analyses = rows.map((row) => ({
      session: {
        id: row.session_id,
        status: row.session_status,
        started_at: row.started_at,
        ended_at: row.ended_at,
        created_at: row.session_created_at,
      },
      challenge: {
        id: row.challenge_id,
        title: row.challenge_title,
        description: row.challenge_description,
        role: row.role,
        tech_stack: row.tech_stack,
        seniority: row.seniority,
        focus_areas: row.focus_areas,
        context: row.context,
        time_limit_min: row.time_limit_min,
      },
      analysis: row.analysis_id
        ? {
            id: row.analysis_id,
            created_at: row.analysis_created_at ?? '',
            overall_score: row.overall_score ?? 0,
            hiring_recommendation: row.hiring_recommendation ?? 'neutral',
            scores: {
              problem_decomposition: row.problem_decomposition ?? 0,
              first_principles: row.first_principles ?? 0,
              creativity: row.creativity ?? 0,
              iteration_quality: row.iteration_quality ?? 0,
              debugging_approach: row.debugging_approach ?? 0,
              architecture_thinking: row.architecture_thinking ?? 0,
              communication_clarity: row.communication_clarity ?? 0,
              efficiency: row.efficiency ?? 0,
            },
            dimension_details: parseJsonValue(row.dimension_details, {}),
            summary_narrative: row.summary_narrative ?? '',
            transcript_narrative: row.transcript_narrative,
            strengths: parseJsonValue(row.strengths, []),
            areas_for_growth: parseJsonValue(row.areas_for_growth, []),
            key_moments: parseJsonValue(row.key_moments, []),
            timeline_data: parseJsonValue(row.timeline_data, []),
            prompt_complexity: parseJsonValue(row.prompt_complexity, []),
            category_breakdown: parseJsonValue(row.category_breakdown, {}),
          }
        : null,
    }));

    const candidateName = rows.find((row) => row.candidate_name.trim().length > 0)?.candidate_name ?? null;

    return NextResponse.json({
      candidate: {
        email,
        name: candidateName,
      },
      total_attempts: rows.length,
      analyses,
    });
  } catch (error) {
    console.error('Error fetching public candidate analysis:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
