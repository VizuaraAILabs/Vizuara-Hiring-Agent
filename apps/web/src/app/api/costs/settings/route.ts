import { NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';

function numberSetting(value: unknown, fallback: number) {
  if (value === undefined || value === null) {
    return fallback;
  }

  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('invalid_number_setting');
  }
  return parsed;
}

export async function PUT(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isAdmin(user.email, user.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!user.companyId) {
      return NextResponse.json({ error: 'Company workspace required' }, { status: 403 });
    }

    const companyId = user.companyId;
    const body = await request.json();

    let vps_monthly_cost_usd: number;
    let anthropic_input_rate: number;
    let anthropic_output_rate: number;
    let gemini_input_rate: number;
    let gemini_output_rate: number;

    try {
      vps_monthly_cost_usd = numberSetting(body.vps_monthly_cost_usd, 0);
      anthropic_input_rate = numberSetting(body.anthropic_input_rate, 1.0);
      anthropic_output_rate = numberSetting(body.anthropic_output_rate, 5.0);
      gemini_input_rate = numberSetting(body.gemini_input_rate, 0.15);
      gemini_output_rate = numberSetting(body.gemini_output_rate, 0.60);
    } catch {
      return NextResponse.json(
        { error: 'Cost settings must be non-negative numbers' },
        { status: 400 },
      );
    }

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
