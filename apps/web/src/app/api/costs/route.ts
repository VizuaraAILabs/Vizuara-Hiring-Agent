import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function GET(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const companyId = user.sub;
    const url = new URL(request.url);
    const days = parseInt(url.searchParams.get('days') || '30');

    // 1. Daily costs grouped by provider
    const dailyCosts = await sql`
      SELECT
        DATE(created_at) as date,
        COALESCE(SUM(CASE WHEN provider = 'anthropic' THEN cost_usd ELSE 0 END), 0) as anthropic,
        COALESCE(SUM(CASE WHEN provider = 'gemini' THEN cost_usd ELSE 0 END), 0) as gemini,
        COALESCE(SUM(CASE WHEN provider = 'docker' THEN cost_usd ELSE 0 END), 0) as docker,
        COALESCE(SUM(CASE WHEN provider = 'vps' THEN cost_usd ELSE 0 END), 0) as vps,
        COALESCE(SUM(cost_usd), 0) as total
      FROM usage_events
      WHERE company_id = ${companyId}
        AND created_at >= NOW() - (${days} || ' days')::interval
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `;

    // 2. Provider breakdown (all time)
    const providerBreakdown = await sql`
      SELECT
        provider,
        COALESCE(SUM(cost_usd), 0) as total_cost,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COUNT(*)::int as event_count
      FROM usage_events
      WHERE company_id = ${companyId}
      GROUP BY provider
      ORDER BY total_cost DESC
    `;

    // 3. Session costs (last 50)
    const sessionCosts = await sql`
      SELECT
        ue.session_id,
        s.candidate_name,
        s.candidate_email,
        ch.title as challenge_title,
        COALESCE(SUM(CASE WHEN ue.provider = 'anthropic' THEN ue.cost_usd ELSE 0 END), 0) as anthropic_cost,
        COALESCE(SUM(CASE WHEN ue.provider = 'gemini' THEN ue.cost_usd ELSE 0 END), 0) as gemini_cost,
        COALESCE(SUM(CASE WHEN ue.provider = 'docker' THEN ue.cost_usd ELSE 0 END), 0) as docker_cost,
        COALESCE(SUM(ue.cost_usd), 0) as total_cost,
        MIN(ue.created_at) as created_at
      FROM usage_events ue
      JOIN sessions s ON s.id = ue.session_id
      JOIN challenges ch ON ch.id = s.challenge_id
      WHERE ue.company_id = ${companyId}
        AND ue.session_id IS NOT NULL
      GROUP BY ue.session_id, s.candidate_name, s.candidate_email, ch.title
      ORDER BY created_at DESC
      LIMIT 50
    `;

    // 4. Cumulative totals
    const [totals] = await sql`
      SELECT
        COALESCE(SUM(cost_usd), 0) as total_spend,
        COALESCE(SUM(input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(output_tokens), 0) as total_output_tokens,
        COUNT(DISTINCT session_id)::int as session_count
      FROM usage_events
      WHERE company_id = ${companyId}
    `;

    // 5. Cost settings
    const [settings] = await sql`
      SELECT * FROM cost_settings WHERE company_id = ${companyId}
    `;

    return NextResponse.json({
      dailyCosts,
      providerBreakdown,
      sessionCosts,
      totals: totals || { total_spend: 0, total_input_tokens: 0, total_output_tokens: 0, session_count: 0 },
      settings: settings || null,
    });
  } catch (error) {
    console.error('Error fetching cost data:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
