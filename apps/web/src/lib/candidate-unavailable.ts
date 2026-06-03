export type CandidateUnavailableReason =
  | 'ok'
  | 'closed'
  | 'not_started'
  | 'expired'
  | 'email_not_allowed'
  | 'capacity_reached'
  | 'quota_unavailable'
  | 'already_submitted'
  | 'submitted_evaluating'
  | 'revoked'
  | 'invalid_link'
  | 'session_not_active'
  | 'already_started'
  | 'invite_preparing'
  | 'temporarily_unavailable';

export interface CandidateUnavailableCopy {
  title: string;
  message: string;
}

export interface CandidateUnavailablePayload extends CandidateUnavailableCopy {
  error: string;
  reason: CandidateUnavailableReason;
}

const COPY: Record<CandidateUnavailableReason, CandidateUnavailableCopy> = {
  ok: {
    title: 'Assessment available',
    message: 'OK',
  },
  closed: {
    title: 'Assessment closed',
    message: 'The company is no longer accepting submissions for this assessment. Contact the company if you think this is a mistake.',
  },
  not_started: {
    title: 'Assessment not open yet',
    message: 'This assessment has not opened yet. Please return during the scheduled access window.',
  },
  expired: {
    title: 'Assessment window ended',
    message: 'The access window for this assessment has ended. Contact the company if you need help.',
  },
  email_not_allowed: {
    title: 'Invite-only assessment',
    message: 'This assessment is only available to invited candidates. Use the email address on your invitation or contact the company.',
  },
  capacity_reached: {
    title: 'Assessment at capacity',
    message: 'This assessment has reached its candidate limit. Contact the company if you were expecting to take it.',
  },
  quota_unavailable: {
    title: 'Assessment temporarily unavailable',
    message: 'This assessment is temporarily unavailable. Please contact the company for next steps.',
  },
  already_submitted: {
    title: 'Assessment already submitted',
    message: 'A submission already exists for this email address. Each candidate can submit this assessment once.',
  },
  submitted_evaluating: {
    title: 'Submission received',
    message: 'Your assessment has been submitted and is currently being evaluated.',
  },
  revoked: {
    title: 'Invite no longer active',
    message: 'This assessment invite is no longer active. Please contact the company for help.',
  },
  invalid_link: {
    title: 'Assessment link not found',
    message: 'This assessment link may be invalid or no longer available.',
  },
  session_not_active: {
    title: 'Session unavailable',
    message: 'This session is not currently active. Return to your assessment link or contact the company if you need help.',
  },
  already_started: {
    title: 'Session already started',
    message: 'This session has already started or is no longer waiting to begin. Refresh the page or reopen your active workspace.',
  },
  invite_preparing: {
    title: 'Invite still being prepared',
    message: 'This assessment invite is still being prepared. Please try again shortly.',
  },
  temporarily_unavailable: {
    title: 'Assessment temporarily unavailable',
    message: 'This assessment is temporarily unavailable. Please contact the company for next steps.',
  },
};

export function isCandidateUnavailableReason(value: unknown): value is CandidateUnavailableReason {
  return typeof value === 'string' && value in COPY;
}

export function getCandidateUnavailableCopy(
  reason: unknown,
  fallbackMessage?: string
): CandidateUnavailableCopy {
  if (isCandidateUnavailableReason(reason)) return COPY[reason];
  return {
    title: 'Assessment unavailable',
    message: fallbackMessage || COPY.temporarily_unavailable.message,
  };
}

export function candidateUnavailablePayload(reason: CandidateUnavailableReason): CandidateUnavailablePayload {
  const copy = COPY[reason];
  return {
    reason,
    title: copy.title,
    message: copy.message,
    error: copy.message,
  };
}
