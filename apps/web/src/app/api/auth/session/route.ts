import { createSessionCookie, isAdmin } from '@/lib/auth';
import sql from '@/lib/db';
import { normalizeIdentityEmail } from '@/lib/email';
import { getAdminAuth } from '@/lib/firebase-admin';
import { ensureVizuaraUserDocument } from '@/lib/vizuara-user-profile';
import { NextRequest, NextResponse } from 'next/server';
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

function getExternalOrigin(request: NextRequest): string {
  const forwardedHost = request.headers.get('x-forwarded-host');
  const forwardedProto = request.headers.get('x-forwarded-proto') || 'https';
  if (forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}

function getSafeReturnTo(returnTo?: string | null): string {
  if (!returnTo || !returnTo.startsWith('/') || returnTo.startsWith('//')) return '/dashboard';
  return returnTo;
}

async function createSessionResponse({
  request,
  token,
  redirect,
  returnTo,
  companyName,
}: {
  request: NextRequest;
  token: string | null;
  redirect: boolean;
  returnTo?: string | null;
  companyName?: string | null;
}) {
  if (!token) {
    if (redirect) {
      return NextResponse.redirect(new URL('/login', getExternalOrigin(request)));
    }
    return NextResponse.json({ error: 'Missing token' }, { status: 400 });
  }

  const adminAuth = getAdminAuth();
  const decoded = await adminAuth.verifyIdToken(token).catch((error) => {
    console.error('Auth token verification error:', error);
    return null;
  });

  if (!decoded) {
    if (redirect) {
      return NextResponse.redirect(`${VIZUARA_URL}/auth/login`);
    }
    return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
  }

  try {
    if (decoded.email_verified === false) {
      if (redirect) {
        return NextResponse.redirect(new URL('/login?error=email-not-verified', getExternalOrigin(request)));
      }
      return NextResponse.json({ error: 'Email verification is required' }, { status: 403 });
    }

    const firebaseUid = decoded.uid;
    const trimmedCompanyName = companyName?.trim() || '';
    const email = normalizeIdentityEmail(decoded.email || '');
    const role = typeof decoded.role === 'string' ? decoded.role : null;
    const userIsAdmin = isAdmin(email, role);
    const requestedReturnTo = returnTo || request.cookies.get(RETURN_COOKIE)?.value || '/dashboard';

    if (!userIsAdmin) {
      const [existing] = await sql<{ id: string; name: string }[]>`
        SELECT id, name FROM companies WHERE firebase_uid = ${firebaseUid} OR email = ${email}
        LIMIT 1
      `;
      let companyNameForVizuaraProfile = trimmedCompanyName || decoded.name || email.split('@')[0] || 'Unknown company';

      if (!existing) {
        const [pendingSignup] = await sql<{ company_name: string }[]>`
          SELECT company_name FROM pending_signups
          WHERE firebase_uid = ${firebaseUid} OR email = ${email}
          LIMIT 1
        `;

        const companyNameForCreate =
          trimmedCompanyName ||
          pendingSignup?.company_name ||
          decoded.name ||
          email.split('@')[0] ||
          'Unknown company';
        companyNameForVizuaraProfile = companyNameForCreate;

        const id = uuidv4();
        const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
        await sql.begin(async (tx) => {
          const trx = tx as unknown as typeof sql;

          await trx`
            INSERT INTO companies (id, name, email, firebase_uid, plan, trial_ends_at)
            VALUES (${id}, ${companyNameForCreate}, ${email}, ${firebaseUid}, 'trial', ${trialEndsAt})
          `;

          await trx`
            DELETE FROM pending_signups
            WHERE firebase_uid = ${firebaseUid} OR email = ${email}
          `;
        });
      } else {
        companyNameForVizuaraProfile = existing.name || companyNameForVizuaraProfile;

        // Keep the local company name as the source of truth after account creation.
        await sql.begin(async (tx) => {
          const trx = tx as unknown as typeof sql;

          await trx`
            UPDATE companies SET email = ${email}, firebase_uid = ${firebaseUid}
            WHERE id = ${existing.id}
          `;

          await trx`
            DELETE FROM pending_signups
            WHERE firebase_uid = ${firebaseUid} OR email = ${email}
          `;
        });
      }

      try {
        await ensureVizuaraUserDocument({
          firebaseUid,
          email,
          displayName: companyNameForVizuaraProfile,
          photoURL: typeof decoded.picture === 'string' ? decoded.picture : null,
        });
      } catch (error) {
        console.error('Unable to ensure Vizuara Users profile:', error);
      }
    }

    const sessionCookie = await createSessionCookie(token);
    const safeReturnTo = getSafeReturnTo(requestedReturnTo);
    const redirectPath = userIsAdmin && safeReturnTo === '/dashboard'
      ? '/dashboard/admin'
      : safeReturnTo;

    const response = redirect
      ? NextResponse.redirect(new URL(redirectPath, getExternalOrigin(request)))
      : NextResponse.json({ ok: true, redirectTo: redirectPath });

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
    console.error('Auth session setup error:', error);
    if (redirect) {
      return NextResponse.redirect(new URL('/login?error=session-setup-failed', getExternalOrigin(request)));
    }
    return NextResponse.json(
      { error: 'Unable to create your session. Please try again in a moment.' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return createSessionResponse({
    request,
    token: request.nextUrl.searchParams.get('token'),
    redirect: true,
  });
}

export async function POST(request: NextRequest) {
  let token: string | null = null;
  let returnTo: string | null = null;
  let companyName: string | null = null;
  try {
    const body = await request.json();
    token = typeof body.token === 'string' ? body.token : null;
    returnTo = typeof body.returnTo === 'string' ? body.returnTo : null;
    companyName = typeof body.companyName === 'string' ? body.companyName : null;
  } catch {
    token = null;
  }

  return createSessionResponse({
    request,
    token,
    redirect: false,
    returnTo,
    companyName,
  });
}
