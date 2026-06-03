import { NextResponse } from 'next/server';

export interface AnalysisEngineError {
  code: string;
  message: string;
  retryable: boolean;
  status: number;
  metadata?: Record<string, unknown>;
  rawBody?: string;
}

const DEFAULT_MESSAGE = 'Analysis failed. Please retry or contact support.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function safeCodeForStatus(status: number): string {
  if (status === 400) return 'invalid_analysis_request';
  if (status === 404) return 'analysis_not_found';
  if (status === 409) return 'already_analyzed';
  if (status === 504) return 'analysis_timeout';
  if (status >= 500) return 'analysis_engine_error';
  return 'analysis_error';
}

function safeMessageForStatus(status: number): string {
  if (status === 400) return 'This session is not ready for analysis.';
  if (status === 404) return 'The analysis report could not be found.';
  if (status === 409) return 'This session has already been analyzed.';
  if (status === 504) return 'Analysis took too long. Please retry.';
  return DEFAULT_MESSAGE;
}

function defaultRetryable(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

export function parseAnalysisEngineError(status: number, body: string): AnalysisEngineError {
  let parsed: unknown = null;
  try {
    parsed = body ? JSON.parse(body) : null;
  } catch {
    parsed = null;
  }

  let candidate: unknown = parsed;
  let normalizedEnvelope = false;
  if (isRecord(candidate) && 'detail' in candidate) {
    const detail = candidate.detail;
    if (isRecord(detail) && 'error' in detail) {
      candidate = detail.error;
      normalizedEnvelope = true;
    } else {
      candidate = detail;
    }
  }
  if (isRecord(candidate) && 'error' in candidate) {
    candidate = candidate.error;
    normalizedEnvelope = true;
  }

  if (normalizedEnvelope && isRecord(candidate)) {
    const metadata = isRecord(candidate.metadata)
      ? candidate.metadata as Record<string, unknown>
      : undefined;
    return {
      code: typeof candidate.code === 'string' ? candidate.code : safeCodeForStatus(status),
      message: typeof candidate.message === 'string' ? candidate.message : safeMessageForStatus(status),
      retryable: typeof candidate.retryable === 'boolean' ? candidate.retryable : defaultRetryable(status),
      status,
      metadata,
      rawBody: body,
    };
  }

  return {
    code: safeCodeForStatus(status),
    message: safeMessageForStatus(status),
    retryable: defaultRetryable(status),
    status,
    rawBody: body,
  };
}

export function logAnalysisEngineError(
  context: string,
  error: AnalysisEngineError,
  metadata: Record<string, unknown> = {},
) {
  console.error(context, {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    status: error.status,
    metadata: error.metadata,
    rawBody: error.rawBody,
    ...metadata,
  });
}

export function analysisErrorResponse(error: AnalysisEngineError) {
  return NextResponse.json(
    {
      error: error.message,
      code: error.code,
      retryable: error.retryable,
    },
    { status: error.status },
  );
}
