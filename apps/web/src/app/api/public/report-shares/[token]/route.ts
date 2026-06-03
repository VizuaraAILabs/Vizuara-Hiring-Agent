import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import type { AnalysisResult, Session } from '@/types';

type SharedReportChallenge = {
  id: string;
  title: string;
  description: string;
  time_limit_min: number;
  role: string | null;
  tech_stack: string | null;
  seniority: string | null;
  focus_areas: string | null;
  context: string | null;
  cohort_label: string | null;
  created_at: string;
};

type PublicAnalysisResult = Omit<AnalysisResult, 'model_used'> & {
  model_used?: never;
};

type SharedReportRow = Session & AnalysisResult & {
  session_id: string;
  challenge_id: string;
  analysis_id: string;
  challenge_title: string;
  challenge_description: string;
  challenge_time_limit_min: number;
  role: string | null;
  tech_stack: string | null;
  seniority: string | null;
  focus_areas: string | null;
  context: string | null;
  cohort_label: string | null;
  challenge_created_at: string;
  analysis_created_at: string;
  link_expires_at: string;
};

function toArray<T>(value: T[] | string | null | undefined): T[] {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const [row] = await sql<SharedReportRow[]>`
      SELECT
        s.id AS session_id,
        s.candidate_name,
        s.candidate_email,
        s.status,
        s.started_at,
        s.ended_at,
        s.created_at,
        ch.id AS challenge_id,
        ch.title AS challenge_title,
        ch.description AS challenge_description,
        ch.time_limit_min AS challenge_time_limit_min,
        ch.role,
        ch.tech_stack,
        ch.seniority,
        ch.focus_areas,
        ch.context,
        ch.cohort_label,
        ch.created_at AS challenge_created_at,
        a.id AS analysis_id,
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
        a.transcript_narrative,
        a.created_at AS analysis_created_at,
        rsl.expires_at AS link_expires_at
      FROM report_share_links rsl
      JOIN sessions s ON s.id = rsl.session_id
      JOIN challenges ch ON ch.id = s.challenge_id
      JOIN analysis_results a ON a.session_id = s.id
      WHERE rsl.token = ${token}
        AND rsl.revoked_at IS NULL
        AND rsl.expires_at > NOW()
      LIMIT 1
    `;

    if (!row) {
      return NextResponse.json(
        { error: 'Report link is expired or unavailable.' },
        {
          status: 404,
          headers: { 'Cache-Control': 'no-store' },
        },
      );
    }

    const session: Session = {
      id: row.session_id,
      challenge_id: row.challenge_id,
      candidate_name: row.candidate_name,
      candidate_email: row.candidate_email,
      token: '',
      status: row.status,
      started_at: row.started_at,
      ended_at: row.ended_at,
      created_at: row.created_at,
      workspace_snapshot: null,
      decision_label: null,
      recruiter_notes: null,
      reviewed_by_email: null,
      reviewed_by_name: null,
      reviewed_at: null,
      invite_email_status: null,
      invite_email_sent_at: null,
      invite_email_error: null,
      candidate_lifecycle_status: null,
      candidate_lifecycle_reason: null,
      candidate_lifecycle_updated_at: null,
      candidate_lifecycle_updated_by_email: null,
    };

    const challenge: SharedReportChallenge = {
      id: row.challenge_id,
      title: row.challenge_title,
      description: row.challenge_description,
      time_limit_min: row.challenge_time_limit_min,
      role: row.role,
      tech_stack: row.tech_stack,
      seniority: row.seniority,
      focus_areas: row.focus_areas,
      context: row.context,
      cohort_label: row.cohort_label,
      created_at: row.challenge_created_at,
    };

    const analysis: PublicAnalysisResult = {
      id: row.analysis_id,
      session_id: row.session_id,
      overall_score: row.overall_score,
      problem_decomposition: row.problem_decomposition,
      first_principles: row.first_principles,
      creativity: row.creativity,
      iteration_quality: row.iteration_quality,
      debugging_approach: row.debugging_approach,
      architecture_thinking: row.architecture_thinking,
      communication_clarity: row.communication_clarity,
      efficiency: row.efficiency,
      dimension_details: row.dimension_details ?? {},
      key_moments: toArray(row.key_moments),
      timeline_data: toArray(row.timeline_data),
      prompt_complexity: toArray(row.prompt_complexity),
      category_breakdown: row.category_breakdown ?? {},
      summary_narrative: row.summary_narrative,
      strengths: toArray(row.strengths),
      areas_for_growth: toArray(row.areas_for_growth),
      hiring_recommendation: row.hiring_recommendation,
      raw_claude_response: null,
      transcript_narrative: row.transcript_narrative,
      created_at: row.analysis_created_at,
    };

    return NextResponse.json(
      {
        session,
        challenge,
        analysis,
        expires_at: row.link_expires_at,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  } catch (error) {
    console.error('Error fetching shared report:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
