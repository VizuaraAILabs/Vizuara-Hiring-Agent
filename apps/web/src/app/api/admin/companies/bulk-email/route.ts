import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser, isAdmin } from '@/lib/auth';
import { sendBulkEmail } from '@/lib/brevo';

const MAX_RECIPIENTS = 100;

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { recipients, subject, bodyText } = body as {
    recipients: { email: string; name: string }[];
    subject: string;
    bodyText: string;
  };

  if (!Array.isArray(recipients) || recipients.length === 0) {
    return NextResponse.json({ error: 'No recipients provided' }, { status: 400 });
  }
  if (recipients.length > MAX_RECIPIENTS) {
    return NextResponse.json({ error: `Maximum ${MAX_RECIPIENTS} recipients allowed` }, { status: 400 });
  }
  if (!subject?.trim()) {
    return NextResponse.json({ error: 'Subject is required' }, { status: 400 });
  }
  if (!bodyText?.trim()) {
    return NextResponse.json({ error: 'Body is required' }, { status: 400 });
  }

  const result = await sendBulkEmail({ recipients, subject: subject.trim(), bodyText: bodyText.trim() });
  return NextResponse.json({ ok: true, sent: result.sent });
}
