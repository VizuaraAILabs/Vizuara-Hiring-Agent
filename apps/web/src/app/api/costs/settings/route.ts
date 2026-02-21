import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser } from '@/lib/auth';

export async function PUT(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const companyId = user.sub;
    const body = await request.json();

    const {
      vps_monthly_cost_usd = 0,
      anthropic_input_rate = 3.0,
      anthropic_output_rate = 15.0,
      gemini_input_rate = 0.15,
      gemini_output_rate = 0.60,
    } = body;

    const [settings] = await sql`
      INSERT INTO cost_settings (
        company_id, vps_monthly_cost_usd,
        anthropic_input_rate, anthropic_output_rate,
        gemini_input_rate, gemini_output_rate,
        updated_at
      ) VALUES (
        ${companyId}, ${vps_monthly_cost_usd},
        ${anthropic_input_rate}, ${anthropic_output_rate},
        ${gemini_input_rate}, ${gemini_output_rate},
        NOW()
      )
      ON CONFLICT (company_id) DO UPDATE SET
        vps_monthly_cost_usd = EXCLUDED.vps_monthly_cost_usd,
        anthropic_input_rate = EXCLUDED.anthropic_input_rate,
        anthropic_output_rate = EXCLUDED.anthropic_output_rate,
        gemini_input_rate = EXCLUDED.gemini_input_rate,
        gemini_output_rate = EXCLUDED.gemini_output_rate,
        updated_at = NOW()
      RETURNING *
    `;

    return NextResponse.json(settings);
  } catch (error) {
    console.error('Error updating cost settings:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
