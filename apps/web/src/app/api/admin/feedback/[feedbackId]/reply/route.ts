import { NextRequest, NextResponse } from 'next/server';
import sql from '@/lib/db';
import { getAuthUser, isAdmin } from '@/lib/auth';
import { sendReplyEmail } from '@/lib/brevo';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ feedbackId: string }> }
) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { feedbackId } = await params;
  const { replyText } = await req.json();

  if (!replyText || typeof replyText !== 'string') {
    return NextResponse.json({ error: 'replyText is required' }, { status: 400 });
  }

  try {
    const [reply] = await sql`
      INSERT INTO feedback_replies (feedback_id, reply_text, replied_by, status)
      VALUES (${feedbackId}, ${replyText}, ${user.name}, 'draft')
      RETURNING id, feedback_id, reply_text, replied_by, status, sent_at, created_at
    `;

    return NextResponse.json({
      id: reply.id,
      feedbackId: reply.feedback_id,
      replyText: reply.reply_text,
      repliedBy: reply.replied_by,
      status: reply.status,
      sentAt: reply.sent_at,
      createdAt: reply.created_at,
    });
  } catch (error) {
    console.error('Save reply error:', error);
    return NextResponse.json({ error: 'Failed to save reply' }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ feedbackId: string }> }
) {
  const user = await getAuthUser();
  if (!user || !isAdmin(user.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { feedbackId } = await params;
  const { replyId } = await req.json();

  if (!replyId) {
    return NextResponse.json({ error: 'replyId is required' }, { status: 400 });
  }

  try {
    const [reply] = await sql`
      SELECT * FROM feedback_replies WHERE id = ${replyId} AND feedback_id = ${feedbackId}
    `;
    if (!reply) return NextResponse.json({ error: 'Reply not found' }, { status: 404 });

    const [feedback] = await sql`
      SELECT f.*, c.email AS company_email, c.name AS company_name
      FROM feedback f
      LEFT JOIN companies c ON c.id = f.company_id
      WHERE f.id = ${feedbackId}
    `;
    if (!feedback) return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });

    const toEmail = feedback.company_email;
    const toName = feedback.company_name || 'there';

    if (!toEmail) {
      return NextResponse.json({ error: 'No email found for this user' }, { status: 400 });
    }

    await sendReplyEmail({ to: toEmail, toName, replyText: reply.reply_text });

    await sql`
      UPDATE feedback_replies SET status = 'sent', sent_at = NOW() WHERE id = ${replyId}
    `;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Send reply error:', error);
    return NextResponse.json({ error: 'Failed to send reply' }, { status: 500 });
  }
}
