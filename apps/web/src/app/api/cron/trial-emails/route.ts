import sql from '@/lib/db';
import { sendTrialFeedbackEmail } from '@/lib/brevo';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const MS_PER_DAY = 1000 * 60 * 60 * 24;
const TRIAL_DURATION_DAYS = 14;
const EMAIL_INTERVAL_DAYS = 3;

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const companies = await sql<{ email: string; name: string; trial_ends_at: string }[]>`
    SELECT email, name, trial_ends_at
    FROM companies
    WHERE plan = 'trial' AND trial_ends_at > NOW()
  `;

  const now = Date.now();
  let sent = 0;

  for (const company of companies) {
    const trialStart = new Date(company.trial_ends_at).getTime() - TRIAL_DURATION_DAYS * MS_PER_DAY;
    const daysSinceStart = Math.floor((now - trialStart) / MS_PER_DAY);

    if (daysSinceStart > 0 && daysSinceStart % EMAIL_INTERVAL_DAYS === 0) {
      await sendTrialFeedbackEmail(company.email, company.name, daysSinceStart);
      sent++;
    }
  }

  return NextResponse.json({ ok: true, sent });
}
