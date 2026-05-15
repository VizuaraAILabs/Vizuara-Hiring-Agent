import { NextResponse } from 'next/server';

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
    { error: 'Assessment is temporarily unavailable. Please try again in a moment.' },
    { status: 503 }
  );
}
