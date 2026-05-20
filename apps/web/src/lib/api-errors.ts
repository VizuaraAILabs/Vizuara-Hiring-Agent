import { NextResponse } from 'next/server';
import { candidateUnavailablePayload } from './candidate-unavailable';

type ErrorWithCode = {
  code?: unknown;
};

export function isDatabaseConnectionError(error: unknown) {
  if (!error || typeof error !== 'object') return false;

  const code = (error as ErrorWithCode).code;
  return code === 'CONNECT_TIMEOUT' || code === 'ECONNRESET' || code === 'ECONNREFUSED';
}

export function databaseUnavailableResponse() {
  return NextResponse.json(
    candidateUnavailablePayload('temporarily_unavailable'),
    { status: 503 }
  );
}
