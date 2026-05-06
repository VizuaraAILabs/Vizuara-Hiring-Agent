# Vizuara Auth Integration Guide

This document describes how to integrate a Next.js app with Vizuara AI's centralized authentication system. The app itself does NOT handle login/signup — it delegates to `vizuara.ai` and receives a Firebase ID token back via redirect.

---

## Overview

- **vizuara.ai** owns user authentication (Firebase Auth)
- **Your app** receives a Firebase ID token after login, verifies it server-side, and creates an HttpOnly session cookie
- **Enrollment/payment status** is stored in Firebase Firestore's `Enrollments` collection (written by vizuara.ai, read-only by your app)

### Auth Flow

```
User clicks Login
  → Your app: GET /api/auth/redirect?returnTo=/current-page
    → Sets {app_name}_return_to cookie with the return path
    → Redirects to: vizuara.ai/auth/login?redirect={YOUR_CALLBACK_URL}

User logs in on vizuara.ai
  → vizuara.ai redirects to: YOUR_APP/api/auth/session?token={firebaseIdToken}
    → Verifies the Firebase ID token server-side
    → Creates a Firebase session cookie (14-day expiry)
    → Upserts user record in your database
    → Sets vizuara_session HttpOnly cookie on the response
    → Redirects to the saved return path

Subsequent requests
  → Client calls GET /api/auth/me
    → Server reads vizuara_session cookie
    → Verifies session cookie via Firebase Admin
    → Fetches user data from db
    → Returns user object
```

---

## Dependencies

```bash
npm install firebase-admin
```

---

## Environment Variables

```env
# Firebase Admin SDK (server-side only)
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=your-service-account@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# Cross-domain cookie (production only — set to parent domain)
COOKIE_DOMAIN=.vizuara.ai

# Enrollment
{app_name}_ENROLLMENT_ID=your-enrollment-id

# Public URLs
NEXT_PUBLIC_VIZUARA_URL=https://vizuara.ai
NEXT_PUBLIC_APP_CALLBACK_URL=https://your-app.vizuara.ai/api/auth/session
```

The Firebase service account needs these IAM roles:
- **Firebase Authentication Admin** — for `verifyIdToken()`, `verifySessionCookie()`, `createSessionCookie()`
- **Cloud Datastore Viewer** — for read-only Firestore access to the `Enrollments` collection

---

## Files to Create

### 1. `src/types/auth.ts` — Type definitions

```typescript
export interface User {
  id: string;
  fullName: string;
  email: string;
  experienceLevel: 'beginner' | 'intermediate' | 'advanced' | null;
  onboardingComplete: boolean;
  interests: string[];
}

export interface AuthState {
  user: User | null;
  loading: boolean;
}
```

### 2. `src/types/subscription.ts` — Enrollment types

```typescript
export type EnrollmentStatus = 'ACTIVE' | 'COMPLETED' | 'DROPPED';

export interface Enrollment {
  uid: string;
  courseId: string;
  status: EnrollmentStatus;
  enrolledAt?: string;
}

export interface EnrollmentStatusResponse {
  enrolled: boolean;
  status: EnrollmentStatus | null;
  enrollment: Enrollment | null;
}
```

### 3. `src/lib/firebase-admin.ts` — Firebase Admin singleton

```typescript
import { initializeApp, getApps, cert, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore as _getFirestore, type Firestore } from 'firebase-admin/firestore';

let _app: App | null = null;
let _auth: Auth | null = null;
let _firestore: Firestore | null = null;

function getAdminApp(): App {
  if (_app) return _app;

  if (getApps().length > 0) {
    _app = getApps()[0];
    return _app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      'Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, or FIREBASE_PRIVATE_KEY'
    );
  }

  _app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });

  return _app;
}

export function getAdminAuth(): Auth {
  if (_auth) return _auth;
  _auth = getAuth(getAdminApp());
  return _auth;
}

export function getAdminFirestore(): Firestore {
  if (_firestore) return _firestore;
  _firestore = _getFirestore(getAdminApp());
  return _firestore;
}
```

### 4. `src/lib/auth.ts` — Session management and user retrieval

```typescript
import { cookies } from 'next/headers';
import { getAdminAuth } from './firebase-admin';
import { getAdminFirestore } from './firebase-admin';
import type { User } from '@/types/auth';

const COOKIE_NAME = 'vizuara_session';
const SESSION_EXPIRY = 14 * 24 * 60 * 60 * 1000; // 14 days

function getCookieDomain(): string | undefined {
  if (process.env.NODE_ENV !== 'production') return undefined;
  const host = process.env.COOKIE_DOMAIN;
  return host || undefined;
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

export async function getAuthUser(): Promise<User | null> {
  const session = await getSessionCookie();
  if (!session) return null;

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifySessionCookie(session, true);

    // TODO: Query your database for the user by decoded.uid
    // Example: const user = await db.users.findById(decoded.uid);
    // Return null if user not found, otherwise map to User type:
    // return {
    //   id: decoded.uid,
    //   fullName: user.name,
    //   email: user.email,
    //   ...
    // };

    throw new Error('Implement database lookup for user');
  } catch {
    return null;
  }
}

export function generateId(): string {
  return crypto.randomUUID();
}

const ENROLLMENT_ID = process.env.PODS_ENROLLMENT_ID || 'vizuara-pods';

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
```

### 5. `src/app/api/auth/redirect/route.ts` — Initiates login by redirecting to vizuara.ai

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

const VIZUARA_URL = process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai';
const APP_CALLBACK_URL = process.env.NEXT_PUBLIC_APP_CALLBACK_URL || 'https://your-app.vizuara.ai/api/auth/session';
const RETURN_COOKIE = 'pods_return_to';
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
```

### 6. `src/app/api/auth/session/route.ts` — Callback handler after vizuara.ai login

This is the most critical route. vizuara.ai redirects here with a Firebase ID token after successful login.

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth } from '@/lib/firebase-admin';
import { createSessionCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VIZUARA_URL = process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai';
const COOKIE_NAME = 'vizuara_session';
const SESSION_EXPIRY = 14 * 24 * 60 * 60 * 1000; // 14 days
const RETURN_COOKIE = 'pods_return_to';

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

    // TODO: Upsert user in your database
    // Use decoded.uid as the user ID, decoded.email for email,
    // decoded.name for display name. Example:
    // await db.users.upsert({
    //   id: decoded.uid,
    //   email: decoded.email,
    //   name: decoded.name || decoded.email?.split('@')[0],
    // });

    const returnTo = request.cookies.get(RETURN_COOKIE)?.value || '/';
    const redirectPath = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/';

    // IMPORTANT: Set cookies directly on the redirect response.
    // Using cookies().set() + NextResponse.redirect() separately
    // causes the Set-Cookie header to be dropped.
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
```

### 7. `src/app/api/auth/me/route.ts` — Get current user

```typescript
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const user = await getAuthUser();
    return NextResponse.json({ user });
  } catch {
    return NextResponse.json({ user: null });
  }
}
```

### 8. `src/app/api/auth/logout/route.ts` — Logout

```typescript
import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST() {
  await clearAuthCookie();
  return NextResponse.json({ success: true });
}
```

### 9. `src/app/api/subscription/status/route.ts` — Enrollment check

```typescript
import { NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { getAdminFirestore } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

const ENROLLMENT_ID = process.env.PODS_ENROLLMENT_ID || 'vizuara-pods';

export async function GET() {
  try {
    const user = await getAuthUser();
    if (!user) {
      return NextResponse.json({ enrolled: false, status: null, enrollment: null });
    }

    const db = getAdminFirestore();
    const docRef = db.collection('Enrollments').doc(`${user.id}_${ENROLLMENT_ID}`);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ enrolled: false, status: null, enrollment: null });
    }

    const data = doc.data()!;
    const isActive = data.status === 'ACTIVE' || data.status === 'COMPLETED';

    return NextResponse.json({
      enrolled: isActive,
      status: data.status,
      enrollment: {
        uid: user.id,
        courseId: ENROLLMENT_ID,
        status: data.status,
        enrolledAt: data.enrollmentDate?.toDate?.()?.toISOString?.() ?? data.enrollmentDate ?? null,
      },
    });
  } catch {
    return NextResponse.json({ enrolled: false, status: null, enrollment: null });
  }
}
```

### 10. `src/context/AuthContext.tsx` — Client-side auth state

```typescript
'use client';

import { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from 'react';
import type { User, AuthState } from '@/types/auth';

const VIZUARA_URL = process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai';

type AuthAction =
  | { type: 'SET_USER'; user: User | null }
  | { type: 'SET_LOADING'; loading: boolean }
  | { type: 'UPDATE_USER'; updates: Partial<User> };

function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'SET_USER':
      return { user: action.user, loading: false };
    case 'SET_LOADING':
      return { ...state, loading: action.loading };
    case 'UPDATE_USER':
      if (!state.user) return state;
      return { ...state, user: { ...state.user, ...action.updates } };
    default:
      return state;
  }
}

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(authReducer, { user: null, loading: true });

  const refreshUser = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      dispatch({ type: 'SET_USER', user: data.user });
    } catch {
      dispatch({ type: 'SET_USER', user: null });
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    dispatch({ type: 'SET_USER', user: null });
    window.location.href = VIZUARA_URL;
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    dispatch({ type: 'UPDATE_USER', updates });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user: state.user,
        loading: state.loading,
        logout,
        refreshUser,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
```

### 11. `src/context/SubscriptionContext.tsx` — Enrollment state

```typescript
'use client';

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import type { EnrollmentStatus, EnrollmentStatusResponse } from '@/types/subscription';

interface SubscriptionContextValue {
  enrolled: boolean;
  loading: boolean;
  status: EnrollmentStatus | null;
  refreshSubscription: () => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [enrolled, setEnrolled] = useState(false);
  const [status, setStatus] = useState<EnrollmentStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshSubscription = useCallback(async () => {
    try {
      const res = await fetch('/api/subscription/status');
      if (!res.ok) {
        setEnrolled(false);
        setStatus(null);
        setLoading(false);
        return;
      }
      const data: EnrollmentStatusResponse = await res.json();
      setEnrolled(data.enrolled);
      setStatus(data.status);
    } catch {
      setEnrolled(false);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setEnrolled(false);
      setStatus(null);
      setLoading(false);
      return;
    }
    refreshSubscription();
  }, [user, authLoading, refreshSubscription]);

  return (
    <SubscriptionContext.Provider
      value={{ enrolled, loading: authLoading || loading, status, refreshSubscription }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
}
```

### 12. `src/components/auth/AuthGate.tsx` — Require login to view content

```typescript
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

interface AuthGateProps {
  children: React.ReactNode;
}

export default function AuthGate({ children }: AuthGateProps) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = `/api/auth/redirect?returnTo=${encodeURIComponent(pathname)}`;
    }
  }, [user, loading, pathname]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  return <>{children}</>;
}
```

### 13. `src/components/auth/SubscriptionGate.tsx` — Require enrollment to view content

```typescript
'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';
import { useSubscription } from '@/context/SubscriptionContext';

const VIZUARA_URL = process.env.NEXT_PUBLIC_VIZUARA_URL || 'https://vizuara.ai';

interface SubscriptionGateProps {
  children: React.ReactNode;
}

export default function SubscriptionGate({ children }: SubscriptionGateProps) {
  const { user, loading: authLoading } = useAuth();
  const { enrolled, loading: subLoading } = useSubscription();
  const pathname = usePathname();

  const loading = authLoading || subLoading;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      window.location.href = `/api/auth/redirect?returnTo=${encodeURIComponent(pathname)}`;
    } else if (!enrolled) {
      window.location.href = `${VIZUARA_URL}/pricing`;
    }
  }, [user, enrolled, loading, pathname]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p>Loading...</p>
      </div>
    );
  }

  if (!user || !enrolled) return null;

  return <>{children}</>;
}
```

### 14. `src/app/auth/login/page.tsx` — Login redirect page

```typescript
'use client';

import { useEffect } from 'react';

export default function LoginPage() {
  useEffect(() => {
    window.location.href = '/api/auth/redirect?returnTo=/';
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <p>Redirecting to login...</p>
    </div>
  );
}
```

---

## Layout Setup

Wrap your app with `AuthProvider` in your root layout. If you need enrollment gating, also add `SubscriptionProvider` inside `AuthProvider`:

```typescript
// src/app/layout.tsx
import { AuthProvider } from '@/context/AuthContext';
import { SubscriptionProvider } from '@/context/SubscriptionContext';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          <SubscriptionProvider>
            {children}
          </SubscriptionProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
```

---

## Usage Patterns

### Protect a page (login required):

```typescript
import AuthGate from '@/components/auth/AuthGate';

export default function ProtectedPage() {
  return (
    <AuthGate>
      <h1>Protected content</h1>
    </AuthGate>
  );
}
```

### Protect a page (enrollment required):

```typescript
import SubscriptionGate from '@/components/auth/SubscriptionGate';

export default function PaidPage() {
  return (
    <SubscriptionGate>
      <h1>Paid content</h1>
    </SubscriptionGate>
  );
}
```

### Access user in a client component:

```typescript
'use client';
import { useAuth } from '@/context/AuthContext';

export default function Greeting() {
  const { user, loading, logout } = useAuth();
  if (loading) return <p>Loading...</p>;
  if (!user) return <p>Not logged in</p>;
  return <p>Hello, {user.fullName}</p>;
}
```

### Access user in a server API route:

```typescript
import { getAuthUser } from '@/lib/auth';

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  // user.id, user.email, user.fullName, etc.
}
```

---

## Important Notes

1. **Cookie on redirect**: In the session callback route, cookies MUST be set directly on the `NextResponse.redirect()` object. Using `cookies().set()` separately causes the `Set-Cookie` header to be dropped during redirects.

2. **Cross-domain cookies**: In production, set `COOKIE_DOMAIN=.vizuara.ai` so the session cookie is shared across all `*.vizuara.ai` subdomains.

3. **No middleware**: There is no Next.js middleware for auth. Protection is handled by `AuthGate`/`SubscriptionGate` on the client and `getAuthUser()` on the server.

4. **Firestore is read-only**: Your app only reads from the `Enrollments` collection. Enrollment records are created by vizuara.ai after payment. Never write to this collection from your app.

5. **vizuara.ai login contract**: When you redirect to `vizuara.ai/auth/login?redirect={callbackUrl}`, vizuara.ai will redirect back to `{callbackUrl}?token={firebaseIdToken}` after successful authentication.

6. **Database is your choice**: The `getAuthUser()` function in `src/lib/auth.ts` and the upsert in the session route have TODO placeholders. Implement these with whatever database you're using (Postgres, MongoDB, Supabase, Prisma, etc.). The only requirement is storing users keyed by their Firebase UID (`decoded.uid`).
