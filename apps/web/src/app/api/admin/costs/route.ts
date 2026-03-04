import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user || !isAdmin(user.email)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Per-company cost breakdown
    const companyCosts = await sql`
      SELECT
        c.id AS company_id,
        c.name AS company_name,
        c.plan,
        COALESCE(SUM(ue.cost_usd), 0) AS total_spend,
        COUNT(DISTINCT ue.session_id)::int AS session_count,
        COALESCE(SUM(ue.input_tokens), 0) AS total_input_tokens,
        COALESCE(SUM(ue.output_tokens), 0) AS total_output_tokens,
        COALESCE(SUM(CASE WHEN ue.provider = 'anthropic' THEN ue.cost_usd ELSE 0 END), 0) AS anthropic_cost,
        COALESCE(SUM(CASE WHEN ue.provider = 'gemini' THEN ue.cost_usd ELSE 0 END), 0) AS gemini_cost,
        COALESCE(SUM(CASE WHEN ue.provider = 'docker' THEN ue.cost_usd ELSE 0 END), 0) AS docker_cost,
        COALESCE(SUM(CASE WHEN ue.provider = 'vps' THEN ue.cost_usd ELSE 0 END), 0) AS vps_cost
      FROM companies c
      LEFT JOIN usage_events ue ON ue.company_id = c.id
      GROUP BY c.id, c.name, c.plan
      ORDER BY total_spend DESC
    `;

    // Platform-wide totals
    const [totals] = await sql`
      SELECT
        COALESCE(SUM(cost_usd), 0) AS total_spend,
        COUNT(DISTINCT session_id)::int AS total_sessions,
        COALESCE(SUM(input_tokens), 0) AS total_input_tokens,
        COALESCE(SUM(output_tokens), 0) AS total_output_tokens,
        COALESCE(SUM(CASE WHEN provider = 'anthropic' THEN cost_usd ELSE 0 END), 0) AS anthropic_cost,
        COALESCE(SUM(CASE WHEN provider = 'gemini' THEN cost_usd ELSE 0 END), 0) AS gemini_cost,
        COALESCE(SUM(CASE WHEN provider = 'docker' THEN cost_usd ELSE 0 END), 0) AS docker_cost,
        COALESCE(SUM(CASE WHEN provider = 'vps' THEN cost_usd ELSE 0 END), 0) AS vps_cost
      FROM usage_events
    `;

    return NextResponse.json({ companyCosts, totals });
  } catch (error) {
    console.error('Admin costs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
