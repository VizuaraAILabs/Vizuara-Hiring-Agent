import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { createSessionCookie } from '@/lib/auth';
import sql from '@/lib/db';
import { v4 as uuidv4 } from 'uuid';

export const dynamic = 'force-dynamic';

const VIZUARA_URL = process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai';
const COOKIE_NAME = 'vizuara_session';
const SESSION_EXPIRY = 14 * 24 * 60 * 60 * 1000; // 14 days
const RETURN_COOKIE = 'arceval_return_to';

function getCookieDomain(): string | undefined {
  if (process.env.NODE_ENV !== 'production') return undefined;
  return process.env.COOKIE_DOMAIN || undefined;
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');

  if (!token) {
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(token);

    const sessionCookie = await createSessionCookie(token);

    // Vizuara sets decoded.name to the company name when redirecting to ArcEval
    const firebaseUid = decoded.uid;
    const name = decoded.name || decoded.email?.split('@')[0] || 'Unknown';
    const email = decoded.email || '';

    // Upsert company record keyed by Firebase UID
    const [existing] = await sql<{ id: string }[]>`
      SELECT id FROM companies WHERE firebase_uid = ${firebaseUid}
    `;

    if (!existing) {
      const id = uuidv4();
      await sql`
        INSERT INTO companies (id, name, email, password_hash, firebase_uid)
        VALUES (${id}, ${name}, ${email}, '', ${firebaseUid})
      `;
    } else {
      // Sync profile from Vizuara on every login
      await sql`
        UPDATE companies SET email = ${email}, name = ${name}
        WHERE firebase_uid = ${firebaseUid}
      `;
    }

    const returnTo = request.cookies.get(RETURN_COOKIE)?.value || '/dashboard';
    const redirectPath = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/dashboard';

    const response = NextResponse.redirect(new URL(redirectPath, request.url));

    const cookieDomain = getCookieDomain();
    response.cookies.set(COOKIE_NAME, sessionCookie, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_EXPIRY / 1000,
      ...(cookieDomain ? { domain: cookieDomain } : {}),
    });

    response.cookies.set(RETURN_COOKIE, '', { maxAge: 0, path: '/' });

    return response;
  } catch (error) {
    console.error('Auth callback error:', error);
    return NextResponse.redirect(`${VIZUARA_URL}/auth/login`);
  }
}
