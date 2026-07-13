const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const SENDER = {
  name: 'ArcEval',
  email: 'hello@vizuara.com',
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildEmailHtml(name: string, dayNumber: number): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>How's your ArcEval trial going?</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Figtree',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <!-- Header -->
          <tr>
            <td style="background:#00a854;padding:32px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">ArcEval</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi ${name},</p>
              <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
                You're on day <strong>${dayNumber}</strong> of your ArcEval trial — we hope it's been useful so far!
              </p>
              <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
                We'd love to hear how it's going. Is there anything that's working well, anything confusing, or a feature you wish existed? Your feedback directly shapes what we build next.
              </p>
              <p style="margin:0 0 8px;font-size:16px;color:#374151;">Just hit reply — we read every message.</p>
              <p style="margin:32px 0 0;font-size:15px;color:#6b7280;">
                — The ArcEval Team
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                You're receiving this because you signed up for an ArcEval trial.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

export async function sendReplyEmail({
  to,
  toName,
  replyText,
}: {
  to: string;
  toName: string;
  replyText: string;
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.error('Brevo: BREVO_API_KEY is not set');
    return;
  }

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Re: Your feedback on ArcEval</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Figtree',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#00a854;padding:32px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">ArcEval</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi ${toName},</p>
              <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
                Thank you for your feedback on ArcEval. Here's our response:
              </p>
              <div style="background:#f8f9fa;border-left:4px solid #00a854;padding:16px;margin:16px 0;border-radius:4px;">
                <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">${replyText.replace(/\n/g, '<br>')}</p>
              </div>
              <p style="margin:16px 0 0;font-size:15px;color:#374151;line-height:1.6;">
                If you have any more questions, feel free to reply to this email.
              </p>
              <p style="margin:32px 0 0;font-size:15px;color:#6b7280;">
                — The ArcEval Team
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">
                You're receiving this because you submitted feedback on ArcEval.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: to, name: toName }],
      subject: 'Re: Your feedback on ArcEval',
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`Brevo: failed to send reply to ${to} — ${res.status} ${body}`);
    throw new Error(`Brevo API error ${res.status}: ${body}`);
  }
}

export async function sendBulkEmail({
  recipients,
  subject,
  bodyText,
}: {
  recipients: { email: string; name: string }[];
  subject: string;
  bodyText: string;
}): Promise<{ sent: number }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY is not set');

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Figtree',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#00a854;padding:32px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">ArcEval</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap;">${bodyText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
              <p style="margin:32px 0 0;font-size:15px;color:#6b7280;">— The ArcEval Team</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">You're receiving this because you have an ArcEval account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  // Brevo allows up to 150 `to` recipients per call; we batch in chunks of 100
  const CHUNK = 100;
  let sent = 0;
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const chunk = recipients.slice(i, i + CHUNK);
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: SENDER,
        to: [SENDER],
        bcc: chunk,
        subject,
        htmlContent: html,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Brevo API error ${res.status}: ${body}`);
    }
    sent += chunk.length;
  }
  return { sent };
}

export async function sendInviteEmail({
  to,
  toName,
  subject,
  bodyText,
  companyName,
  assessmentLink,
}: {
  to: string;
  toName: string;
  subject: string;
  bodyText: string;
  companyName: string;
  assessmentLink?: string;
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY is not set');

  const safeSubject = escapeHtml(subject);
  const safeBody = escapeHtml(bodyText);
  const safeCompanyName = escapeHtml(companyName);
  const safeAssessmentLink = assessmentLink ? escapeHtml(assessmentLink) : null;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Figtree',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#00a854;padding:32px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">ArcEval</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap;">${safeBody}</p>
              ${safeAssessmentLink ? `<p style="margin:24px 0 0;"><a href="${safeAssessmentLink}" style="display:inline-block;background:#00a854;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 18px;border-radius:8px;">Open assessment</a></p>` : ''}
              <p style="margin:32px 0 0;font-size:15px;color:#6b7280;">Sent by ${safeCompanyName}</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">You're receiving this because you were invited to an ArcEval assessment.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: to, name: toName }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${body}`);
  }
}

export async function sendTeamInviteEmail({
  to,
  toName,
  companyName,
  role,
  invitedByName,
  invitedByEmail,
  inviteLink,
}: {
  to: string;
  toName: string;
  companyName: string;
  role: string;
  invitedByName: string;
  invitedByEmail: string;
  inviteLink: string;
}): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY is not set');

  const safeToName = escapeHtml(toName);
  const safeCompanyName = escapeHtml(companyName);
  const safeRole = escapeHtml(role);
  const safeInvitedByName = escapeHtml(invitedByName);
  const safeInvitedByEmail = escapeHtml(invitedByEmail);
  const safeInviteLink = escapeHtml(inviteLink);
  const subject = `You have been invited to join ${companyName} on ArcEval`;
  const safeSubject = escapeHtml(subject);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Figtree',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#00a854;padding:32px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">ArcEval</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 16px;font-size:16px;color:#111827;">Hi ${safeToName},</p>
              <p style="margin:0 0 16px;font-size:16px;color:#374151;line-height:1.6;">
                ${safeInvitedByName} has invited you to join <strong>${safeCompanyName}</strong> on ArcEval.
              </p>
              <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;">
                <tr>
                  <td style="padding:14px 16px;background:#f9fafb;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;">Role</td>
                  <td style="padding:14px 16px;font-size:15px;color:#111827;">${safeRole}</td>
                </tr>
                <tr>
                  <td style="padding:14px 16px;background:#f9fafb;font-size:13px;font-weight:700;color:#6b7280;text-transform:uppercase;border-top:1px solid #e5e7eb;">Invited by</td>
                  <td style="padding:14px 16px;font-size:15px;color:#111827;border-top:1px solid #e5e7eb;">${safeInvitedByName} &lt;${safeInvitedByEmail}&gt;</td>
                </tr>
              </table>
              <p style="margin:0 0 24px;font-size:16px;color:#374151;line-height:1.6;">
                Use the email address this invite was sent to when you create or sign in to your ArcEval account.
              </p>
              <p style="margin:0;"><a href="${safeInviteLink}" style="display:inline-block;background:#00a854;color:#ffffff;text-decoration:none;font-size:14px;font-weight:700;padding:12px 18px;border-radius:8px;">Accept invite</a></p>
              <p style="margin:32px 0 0;font-size:15px;color:#6b7280;">Sent by ${safeCompanyName}</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0;font-size:12px;color:#9ca3af;">You're receiving this because you were invited to join an ArcEval company account.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: to, name: toName }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API error ${res.status}: ${body}`);
  }
}

export async function sendOutboundEmail({
  to,
  toName,
  subject,
  bodyText,
}: {
  to: string;
  toName: string;
  subject: string;
  bodyText: string;
}): Promise<{ messageId: string | null }> {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) throw new Error('BREVO_API_KEY is not set');

  const safeSubject = escapeHtml(subject);
  const safeBody = escapeHtml(bodyText);

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${safeSubject}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Figtree',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">
          <tr>
            <td style="background:#00a854;padding:32px 40px;">
              <p style="margin:0;font-size:22px;font-weight:700;color:#ffffff;">ArcEval</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0;font-size:15px;color:#374151;line-height:1.7;white-space:pre-wrap;">${safeBody}</p>
              <p style="margin:32px 0 0;font-size:15px;color:#6b7280;">The ArcEval Team</p>
            </td>
          </tr>
          <tr>
            <td style="background:#f9fafb;padding:20px 40px;border-top:1px solid #e5e7eb;">
              <p style="margin:0 0 8px;font-size:12px;color:#9ca3af;">You're receiving this because ArcEval thought this may be relevant to your team's technical hiring.</p>
              <p style="margin:0;font-size:12px;color:#9ca3af;">Reply with "unsubscribe" and we will suppress your email or domain from future outreach.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  const res = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sender: SENDER,
      to: [{ email: to, name: toName }],
      subject,
      htmlContent: html,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    throw new Error(`Brevo API error ${res.status}: ${raw}`);
  }

  let data: { messageId?: string } = {};
  if (raw) {
    try {
      data = JSON.parse(raw) as { messageId?: string };
    } catch {
      data = {};
    }
  }
  return { messageId: data.messageId ?? null };
}

export async function sendTrialFeedbackEmail(
  email: string,
  name: string,
  dayNumber: number
): Promise<void> {
  const apiKey = process.env.BREVO_API_KEY;

  if (!apiKey) {
    console.error('Brevo: BREVO_API_KEY is not set');
    return;
  }

  try {
    const res = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sender: SENDER,
        to: [{ email, name }],
        subject: `Day ${dayNumber} of your ArcEval trial — how's it going?`,
        htmlContent: buildEmailHtml(name, dayNumber),
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`Brevo: failed to send email to ${email} — ${res.status} ${body}`);
    }
  } catch (err) {
    console.error(`Brevo: error sending email to ${email}`, err);
  }
}
