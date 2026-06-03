import { cookies } from 'next/headers';
import { getAdminAuth, getAdminFirestore } from './firebase-admin';
import sql from './db';

const COOKIE_NAME = 'vizuara_session';
const SESSION_EXPIRY = 14 * 24 * 60 * 60 * 1000; // 14 days

function getCookieDomain(): string | undefined {
  if (process.env.NODE_ENV !== 'production') return undefined;
  return process.env.COOKIE_DOMAIN || undefined;
}

export async function createSessionCookie(idToken: string): Promise<string> {
  const adminAuth = getAdminAuth();
  return adminAuth.createSessionCookie(idToken, { expiresIn: SESSION_EXPIRY });
}

export async function setAuthCookie(sessionCookie: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_EXPIRY / 1000,
    domain: getCookieDomain(),
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    domain: getCookieDomain(),
  });
}

async function getSessionCookie(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value ?? null;
}

/**
 * Returns the authenticated user from the Firebase session cookie.
 * Shape: { sub: companyId, email, name } — matches the old JWT payload
 * so all existing API routes continue working without changes.
 */
export async function getAuthUser(): Promise<{ sub: string; companyId: string | null; email: string; name: string; role: string | null; isAdmin: boolean } | null> {
  const session = await getSessionCookie();
  if (!session) return null;

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifySessionCookie(session, true);

    const role = typeof decoded.role === 'string' ? decoded.role : null;
    const email = decoded.email || '';
    const name = decoded.name || email.split('@')[0] || 'Admin';
    const userIsAdmin = isAdmin(email, role);

    if (userIsAdmin) {
      return {
        sub: decoded.uid,
        companyId: null,
        email,
        name,
        role,
        isAdmin: true,
      };
    }

    // Look up the company by firebase_uid for company accounts.
    const [company] = await sql<{ id: string; name: string; email: string }[]>`
      SELECT id, name, email FROM companies WHERE firebase_uid = ${decoded.uid}
    `;

    if (!company) return null;

    return {
      sub: company.id,
      companyId: company.id,
      email: company.email,
      name: company.name,
      role,
      isAdmin: false,
    };
  } catch {
    return null;
  }
}

export function isAdmin(_email: string, role?: string | null): boolean {
  const normalizedRole = role?.trim().toUpperCase();
  return normalizedRole === 'SUPER ADMIN'
    || normalizedRole === 'SUPER_ADMIN';
}

const ENROLLMENT_ID = process.env.ARCEVAL_ENROLLMENT_ID || '';

export async function checkEnrollment(uid: string): Promise<boolean> {
  try {
    const db = getAdminFirestore();
    const docRef = db.collection('Enrollments').doc(`${uid}_${ENROLLMENT_ID}`);
    const doc = await docRef.get();

    if (!doc.exists) return false;

    const data = doc.data();
    return data?.status === 'ACTIVE' || data?.status === 'COMPLETED';
  } catch {
    return false;
  }
}
