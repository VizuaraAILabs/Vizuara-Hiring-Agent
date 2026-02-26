import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const VIZUARA_URL = process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai';
const APP_CALLBACK_URL = process.env.NEXT_PUBLIC_APP_CALLBACK_URL || 'https://hire.vizuara.ai/api/auth/session';
const RETURN_COOKIE = 'arceval_return_to';
const RETURN_COOKIE_TTL = 10 * 60; // 10 minutes

export async function GET(request: NextRequest) {
  const returnTo = request.nextUrl.searchParams.get('returnTo') || '/';
  const safePath = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';

  const cookieStore = await cookies();
  cookieStore.set(RETURN_COOKIE, safePath, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: RETURN_COOKIE_TTL,
  });

  const loginUrl = `${VIZUARA_URL}/auth/login?redirect=${encodeURIComponent(APP_CALLBACK_URL)}`;
  return NextResponse.redirect(loginUrl);
}
