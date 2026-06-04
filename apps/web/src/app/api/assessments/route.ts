import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';
import { getDecisionLabel, getRecommendationLabel } from '@/lib/utils';

type AssessmentChallenge = {
  id: string;
  title: string;
  candidate_count: number;
};

type AssessmentCandidate = {
  id: string;
  challenge_id: string;
  challenge_title: string;
  candidate_name: string;
  candidate_email: string;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  decision_label: string | null;
  recruiter_notes: string | null;
  invite_email_status: string | null;
  invite_email_sent_at: string | null;
  invite_email_error: string | null;
  candidate_lifecycle_status: string | null;
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

const csvHeaders = [
  'Assessment',
  'Candidate Name',
  'Candidate Email',
  'Session Status',
  'Candidate Status',
  'Decision',
  'Started At',
  'Ended At',
  'Invite Email',
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

function filenameSafe(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'assessments';
}

function formatScore(value: number | null) {
  return typeof value === 'number' ? value.toFixed(0) : '';
}

async function getChallengeFilter(
  companyId: string,
  challengeId: string | null
): Promise<{ id: string; title: string } | null | false> {
  if (!challengeId || challengeId === 'all') return null;

  const [challenge] = await sql<{ id: string; title: string }[]>`
    SELECT id, title
    FROM challenges
    WHERE id = ${challengeId}
      AND company_id = ${companyId}
  `;

  return challenge ?? false;
}

async function getAssessmentData(companyId: string, challengeId: string | null) {
  const selectedChallenge = await getChallengeFilter(companyId, challengeId);
  if (selectedChallenge === false) {
    return { error: NextResponse.json({ error: 'Challenge not found' }, { status: 404 }) };
  }

  const challenges = await sql<AssessmentChallenge[]>`
    SELECT
      c.id,
      c.title,
      COUNT(s.id)::int AS candidate_count
    FROM challenges c
    LEFT JOIN sessions s ON s.challenge_id = c.id
    WHERE c.company_id = ${companyId}
      AND c.archived_at IS NULL
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `;

  const candidates = selectedChallenge
    ? await sql<AssessmentCandidate[]>`
        SELECT
          s.id,
          s.challenge_id,
          c.title AS challenge_title,
          s.candidate_name,
          s.candidate_email,
          s.status,
          s.started_at,
          s.ended_at,
          s.created_at,
          s.decision_label,
          s.recruiter_notes,
          s.invite_email_status,
          s.invite_email_sent_at,
          s.invite_email_error,
          s.candidate_lifecycle_status,
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
        JOIN challenges c ON c.id = s.challenge_id
        LEFT JOIN analysis_results a ON a.session_id = s.id
        WHERE c.company_id = ${companyId}
          AND s.challenge_id = ${selectedChallenge.id}
        ORDER BY s.created_at DESC
      `
    : await sql<AssessmentCandidate[]>`
        SELECT
          s.id,
          s.challenge_id,
          c.title AS challenge_title,
          s.candidate_name,
          s.candidate_email,
          s.status,
          s.started_at,
          s.ended_at,
          s.created_at,
          s.decision_label,
          s.recruiter_notes,
          s.invite_email_status,
          s.invite_email_sent_at,
          s.invite_email_error,
          s.candidate_lifecycle_status,
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
        JOIN challenges c ON c.id = s.challenge_id
        LEFT JOIN analysis_results a ON a.session_id = s.id
        WHERE c.company_id = ${companyId}
          AND c.archived_at IS NULL
        ORDER BY s.created_at DESC
      `;

  return { challenges, candidates, selectedChallenge };
}

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const challengeId = searchParams.get('challengeId');
    const format = searchParams.get('format');
    const data = await getAssessmentData(user.companyId, challengeId);

    if ('error' in data) return data.error;

    if (format === 'csv') {
      const lines = [
        csvHeaders.map(csvCell).join(','),
        ...data.candidates.map((candidate) => [
          candidate.challenge_title,
          candidate.candidate_name,
          candidate.candidate_email,
          candidate.status,
          candidate.candidate_lifecycle_status ?? 'active',
          getDecisionLabel(candidate.decision_label),
          candidate.started_at ?? '',
          candidate.ended_at ?? '',
          candidate.invite_email_status ?? 'not_sent',
          formatScore(candidate.overall_score),
          formatScore(candidate.problem_decomposition),
          formatScore(candidate.first_principles),
          formatScore(candidate.creativity),
          formatScore(candidate.iteration_quality),
          formatScore(candidate.debugging_approach),
          formatScore(candidate.architecture_thinking),
          formatScore(candidate.communication_clarity),
          formatScore(candidate.efficiency),
          candidate.hiring_recommendation ? getRecommendationLabel(candidate.hiring_recommendation) : '',
        ].map(csvCell).join(',')),
      ];

      const filenameBase = data.selectedChallenge ? `${data.selectedChallenge.title}-candidates` : 'assessments-candidates';
      return new NextResponse(lines.join('\n'), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filenameSafe(filenameBase)}.csv"`,
        },
      });
    }

    return NextResponse.json({
      challenges: data.challenges,
      candidates: data.candidates,
    });
  } catch (error) {
    console.error('Error loading assessments:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
