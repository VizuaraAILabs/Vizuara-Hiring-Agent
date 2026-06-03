import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import { getChallengeById } from '@/lib/challenge-queries';
import { getDecisionLabel, getRecommendationLabel } from '@/lib/utils';

type ScoreExportRow = {
  candidate_name: string;
  candidate_email: string;
  session_status: string;
  candidate_lifecycle_status: string | null;
  decision_label: string | null;
  started_at: string | null;
  ended_at: string | null;
  overall_score: number | null;
  problem_decomposition: number | null;
  first_principles: number | null;
  creativity: number | null;
  iteration_quality: number | null;
  debugging_approach: number | null;
  architecture_thinking: number | null;
  communication_clarity: number | null;
  efficiency: number | null;
  hiring_recommendation: string | null;
};

const headers = [
  'Candidate Name',
  'Candidate Email',
  'Session Status',
  'Candidate Status',
  'Decision',
  'Started At',
  'Ended At',
  'Overall Score',
  'Problem Decomposition',
  'First Principles',
  'Creativity',
  'Iteration Quality',
  'Debugging Approach',
  'Architecture Thinking',
  'Communication Clarity',
  'Efficiency',
  'Recommendation',
];

function csvCell(value: string | number | null | undefined) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function formatScore(value: number | null) {
  return typeof value === 'number' ? value.toFixed(0) : '';
}

function filenameSafe(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'challenge';
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    const challenge = await getChallengeById(id);
    if (!challenge) {
      return NextResponse.json({ error: 'Challenge not found' }, { status: 404 });
    }

    if (challenge.company_id !== user.companyId && !isAdmin(user.email, user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const rows = await sql<ScoreExportRow[]>`
      SELECT
        s.candidate_name,
        s.candidate_email,
        s.status AS session_status,
        s.candidate_lifecycle_status,
        s.decision_label,
        s.started_at,
        s.ended_at,
        a.overall_score,
        a.problem_decomposition,
        a.first_principles,
        a.creativity,
        a.iteration_quality,
        a.debugging_approach,
        a.architecture_thinking,
        a.communication_clarity,
        a.efficiency,
        a.hiring_recommendation
      FROM sessions s
      LEFT JOIN analysis_results a ON a.session_id = s.id
      WHERE s.challenge_id = ${id}
      ORDER BY s.created_at DESC
    `;

    const lines = [
      headers.map(csvCell).join(','),
      ...rows.map((row) => [
        row.candidate_name,
        row.candidate_email,
        row.session_status,
        row.candidate_lifecycle_status ?? 'active',
        getDecisionLabel(row.decision_label),
        row.started_at ?? '',
        row.ended_at ?? '',
        formatScore(row.overall_score),
        formatScore(row.problem_decomposition),
        formatScore(row.first_principles),
        formatScore(row.creativity),
        formatScore(row.iteration_quality),
        formatScore(row.debugging_approach),
        formatScore(row.architecture_thinking),
        formatScore(row.communication_clarity),
        formatScore(row.efficiency),
        row.hiring_recommendation ? getRecommendationLabel(row.hiring_recommendation) : '',
      ].map(csvCell).join(',')),
    ];

    return new NextResponse(lines.join('\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameSafe(challenge.title)}-scores.csv"`,
      },
    });
  } catch (error) {
    console.error('Error exporting scores CSV:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
