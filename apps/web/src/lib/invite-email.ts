export const DEFAULT_INVITE_EMAIL_SUBJECT = 'Your {{challenge_title}} assessment invite';

export const DEFAULT_INVITE_EMAIL_BODY = `Hi {{candidate_name}},

You have been invited to complete {{challenge_title}}.

Use this link to start your assessment:
{{assessment_link}}

Time limit: {{time_limit}}
Window: {{access_window}}

Best,
{{company_name}}`;

export const INVITE_EMAIL_MERGE_FIELDS = [
  '{{candidate_name}}',
  '{{challenge_title}}',
  '{{assessment_link}}',
  '{{time_limit}}',
  '{{access_window}}',
  '{{start_date}}',
  '{{end_date}}',
  '{{company_name}}',
] as const;

export type InviteEmailMergeData = {
  candidateName: string;
  challengeTitle: string;
  assessmentLink: string;
  timeLimitMin: number;
  startsAt: string | null;
  endsAt: string | null;
  companyName: string;
};

function formatInviteDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatAccessWindow(startsAt: string | null, endsAt: string | null) {
  const start = formatInviteDate(startsAt);
  const end = formatInviteDate(endsAt);

  if (start && end) return `${start} to ${end}`;
  if (start) return `Opens ${start}`;
  if (end) return `Open until ${end}`;
  return 'Available now';
}

export function renderInviteEmailTemplate(template: string, data: InviteEmailMergeData) {
  const values: Record<string, string> = {
    '{{candidate_name}}': data.candidateName,
    '{{challenge_title}}': data.challengeTitle,
    '{{assessment_link}}': data.assessmentLink,
    '{{time_limit}}': `${data.timeLimitMin} minutes`,
    '{{access_window}}': formatAccessWindow(data.startsAt, data.endsAt),
    '{{start_date}}': formatInviteDate(data.startsAt) ?? 'available now',
    '{{end_date}}': formatInviteDate(data.endsAt) ?? 'no end date',
    '{{company_name}}': data.companyName,
  };

  return Object.entries(values).reduce(
    (rendered, [field, value]) => rendered.split(field).join(value),
    template
  )
    .replace(/^Window:\s*available now\s+to\s+no end date$/gim, 'Window: Available now')
    .replace(/^Window:\s*Not scheduled\s+to\s+Not scheduled$/gim, 'Window: Available now');
}
