# Payment & Access Flow

This document describes how payment, enrollment, and content gating work in the ArcEval app.

---

## Overview

The ArcEval app handles **zero** payment logic. Everything is delegated to vizuara.ai:

- **vizuara.ai** handles checkout, payment processing, and writes enrollment records to Firestore
- **hire.vizuara.ai** reads those enrollment records (read-only) and gates content accordingly
- ArcEval enforces **plan-based quotas** (session limits per billing period) based on the enrollment data

---

## Enrollment Data Model

Enrollment records live in Firebase Firestore:

```
Collection: Enrollments
Document ID: {firebase_uid}_{enrollment_id}

Fields:
  status: "ACTIVE" | "COMPLETED" | "DROPPED"
  enrollmentDate: Firestore Timestamp
```

The enrollment ID is configured via `ARCEVAL_ENROLLMENT_ID` env var.

Example document: `Enrollments/abc123_course_12345`

---

## Plan Tiers & Quotas

| Plan | Session Limit | Trial Duration | Notes |
|------|--------------|----------------|-------|
| Trial | 5 assessments | 14 days | Default for new companies |
| Starter ($149/mo) | 50 assessments/period | — | |
| Growth ($499/mo) | 250 assessments/period | — | |
| Enterprise (custom) | Unlimited | — | |

The `companies` table tracks plan state:

```sql
ALTER TABLE companies ADD COLUMN plan TEXT NOT NULL DEFAULT 'trial'
  CHECK(plan IN ('trial', 'starter', 'growth', 'enterprise'));
ALTER TABLE companies ADD COLUMN trial_ends_at TIMESTAMPTZ;
```

---

## User Journey

### New user (not logged in)

```
Clicks "Get Started" on landing page
  → Redirects to vizuara.ai/auth/signup?redirect={APP_CALLBACK_URL}
  → User creates account on vizuara.ai
  → vizuara.ai redirects to hire.vizuara.ai/api/auth/session?token={idToken}
  → Session cookie is set, company record upserted (plan='trial', trial_ends_at=NOW()+14d)
  → User lands on /dashboard with 5 free assessments
```

### Trial user pays

```
Trial expires or quota reached
  → Dashboard shows "Upgrade" banner with payment URL
  → User pays on vizuara.ai
  → vizuara.ai writes Enrollments/{uid}_{enrollment_id} with status: "ACTIVE"
  → On next session creation, ArcEval reads enrollment, updates company plan
```

### Existing user (logged in, not enrolled)

```
Tries to create a session beyond trial limits
  → checkEnrollmentStatus() returns quota_exceeded or trial_expired
  → 403 response with reason and payment URL
  → Dashboard shows upgrade banner
```

### Unauthenticated user hits a protected page

```
Navigates to /dashboard
  → AuthGate detects no user
  → Redirects to /api/auth/redirect?returnTo=/dashboard
  → Sets arceval_return_to cookie, redirects to vizuara.ai/auth/login
  → After login, redirected back to /api/auth/session?token={idToken}
  → Session verified, company upserted, redirected to /dashboard
```

---

## Enrollment & Quota Checking

### `checkEnrollmentStatus(companyId)` — Core logic

File: `src/lib/enrollment.ts` (to be created)

Logic flow:

1. Query company record for `firebase_uid`, `plan`, `trial_ends_at`
2. **If trial:**
   - Trial not expired + sessions < 5 → allow
   - Trial not expired + sessions >= 5 → block (`quota_exceeded`)
   - Trial expired → check Firestore enrollment (step 3). If not enrolled → block (`trial_expired`)
3. **Check Firestore** enrollment doc at `Enrollments/{firebase_uid}_{ARCEVAL_ENROLLMENT_ID}`:
   - Doc doesn't exist → block (`not_enrolled`), return payment URL
   - Doc exists + status is `ACTIVE` → payment is current, update `companies.plan` if changed
   - Doc exists + status is not `ACTIVE` → block (`not_enrolled`), payment lapsed
4. **Count total sessions** created by this company
5. Compare against plan limits: trial=5, starter=50, growth=250, enterprise=unlimited

Returns:

```typescript
{
  canCreateSession: boolean;
  reason: 'ok' | 'trial_active' | 'trial_expired' | 'quota_exceeded' | 'not_enrolled';
  sessionsUsed: number;
  sessionsLimit: number;
  plan: string;
  trialEndsAt: Date | null;
  paymentUrl?: string;
}
```

### Server-side: `/api/subscription/status`

```
GET /api/subscription/status
  → getAuthUser() verifies session cookie
  → Looks up firebase_uid from companies table
  → Queries Firestore: Enrollments/{uid}_{ARCEVAL_ENROLLMENT_ID}
  → Returns { enrolled: boolean, status, enrollment }
```

File: `src/app/api/subscription/status/route.ts`

### Server-side: `/api/plan/route.ts` (to be created)

```
GET /api/plan
  → Calls checkEnrollmentStatus(user.sub)
  → Returns full plan status JSON for dashboard display
```

### Client-side: SubscriptionContext

```
AuthProvider loads user → SubscriptionProvider calls /api/subscription/status
  → Stores { enrolled, status } in React Context
  → Available via useSubscription() hook anywhere in the app
```

File: `src/context/SubscriptionContext.tsx`

### Direct check: `checkEnrollment(uid)`

A utility in `src/lib/auth.ts` for server-side checks outside of API routes:

```typescript
checkEnrollment(uid) → reads Firestore → returns boolean
```

---

## Enforcement Points

### Primary: Session creation (`/api/challenges/[id]/apply`)

After fetching the challenge, **before** creating a new session:

1. Existing "resume session" check stays first (resuming doesn't consume a slot)
2. Call `checkEnrollmentStatus(challenge.company_id)`
3. If `canCreateSession` is false, return 403 with reason and payment URL
4. Otherwise proceed with session creation as normal

### Dashboard UI: Plan status display

**Sidebar** — plan status section:
- Show current plan name + usage bar ("12 / 50 assessments")
- Trial: "Trial ends in X days"
- Quota exceeded / trial expired: "Upgrade" button linking to payment URL

**Dashboard page** — banner at top when `canCreateSession` is false:
- Trial expired: "Your free trial has ended. Subscribe to continue."
- Quota exceeded: "You've used all N assessments. Upgrade your plan."

### Candidate-facing error

When a company is over quota, candidates see: "This assessment is temporarily unavailable. Please contact the company." — never expose payment details to candidates.

---

## Content Gating

### AuthGate component

File: `src/components/auth/AuthGate.tsx`

Wraps pages that require login. If not authenticated, redirects to `/api/auth/redirect?returnTo={current_page}`.

### SubscriptionGate component

File: `src/components/auth/SubscriptionGate.tsx`

Wraps pages that require both login and an active enrollment.

**Logic:**
```
If not logged in → redirect to /api/auth/redirect?returnTo={current_page}
If logged in but not enrolled → redirect to vizuara.ai/pricing
If logged in and enrolled → render children
```

### Pages gated by SubscriptionGate

| Page | Route |
|------|-------|
| Dashboard | `/dashboard` |
| New Challenge | `/dashboard/challenges/new` |
| Costs | `/dashboard/costs` |

### Pages NOT gated

| Page | Route | Notes |
|------|-------|-------|
| Landing page | `/` | Public |
| About | `/about` | Public |
| Login | `/login` | Redirects to Vizuara |
| Register | `/register` | Redirects to Vizuara |
| Candidate session | `/session/[token]` | Authenticated by session token, not user login |

---

## Where Auth/Payment Links Appear

### Header (public pages)

| User state | Actions shown |
|---|---|
| Not logged in | "Sign in" → vizuara.ai/auth/login, "Get Started" → vizuara.ai/auth/signup |
| Logged in | "Dashboard" link, "Sign out" button |

### Landing page CTAs

| Button | Links to |
|---|---|
| "Start Free Trial" | vizuara.ai/auth/signup |
| "Try These Challenges Free" | vizuara.ai/auth/signup |
| Pricing tier CTAs | vizuara.ai/auth/signup (or mailto for Enterprise) |

### Sidebar (dashboard)

| Action | Behavior |
|---|---|
| Plan badge | Shows plan name, usage bar, upgrade CTA when blocked |
| "Sign out" | Calls /api/auth/logout, redirects to / |

---

## Environment Variables

```env
# Firebase Admin SDK credentials
FIREBASE_PROJECT_ID=<project-id>
FIREBASE_CLIENT_EMAIL=<service-account-email>
FIREBASE_PRIVATE_KEY=<private-key>

# Enrollment course ID (must match what vizuara.ai writes to Firestore)
ARCEVAL_ENROLLMENT_ID=<enrollment-id>

# URLs (these have sensible defaults)
NEXT_PUBLIC_VIZUARA_URL=https://vizuara.ai
NEXT_PUBLIC_APP_CALLBACK_URL=https://hire.vizuara.ai/api/auth/session

# Cookie domain (production only, for cross-subdomain cookies)
COOKIE_DOMAIN=.vizuara.ai
```

---

## Key Files

### Implemented

| File | Role |
|------|------|
| `src/lib/firebase-admin.ts` | Firebase Admin SDK singleton (Auth + Firestore) |
| `src/lib/auth.ts` | Session cookie management, `getAuthUser()`, `checkEnrollment()` |
| `src/app/api/auth/redirect/route.ts` | Initiates login flow with returnTo support |
| `src/app/api/auth/session/route.ts` | OAuth callback — verifies token, upserts company, sets session |
| `src/app/api/auth/me/route.ts` | Returns current authenticated user for client-side polling |
| `src/app/api/auth/logout/route.ts` | Clears session cookie |
| `src/app/api/subscription/status/route.ts` | API endpoint returning enrollment status |
| `src/context/AuthContext.tsx` | Client-side auth state via React Context |
| `src/context/SubscriptionContext.tsx` | Client-side enrollment state via React Context |
| `src/components/auth/AuthGate.tsx` | Wrapper component requiring login |
| `src/components/auth/SubscriptionGate.tsx` | Wrapper component requiring login + enrollment |
| `src/components/Header.tsx` | Global nav bar with auth-aware actions |
| `src/types/auth.ts` | `AuthUser`, `AuthState` types |
| `src/types/subscription.ts` | `EnrollmentStatus`, `Enrollment`, `EnrollmentStatusResponse` types |
| `database/migrations/004_firebase_auth.sql` | Adds `firebase_uid` column to companies table |

### To be implemented (quota enforcement)

| File | Role |
|------|------|
| `src/lib/enrollment.ts` | `checkEnrollmentStatus()` — quota & enrollment checker |
| `src/app/api/plan/route.ts` | GET endpoint returning plan status for dashboard |
| `src/app/api/challenges/[id]/apply/route.ts` | Add enforcement before session creation |
| `src/components/dashboard/Sidebar.tsx` | Add plan badge, usage bar, upgrade CTA |
| `src/app/dashboard/page.tsx` | Add quota/trial banner |
| `src/types/index.ts` | Add `plan`, `trial_ends_at` to Company interface |
| `database/migrations/005_plan_columns.sql` | Add `plan` and `trial_ends_at` columns |

---

## Edge Cases

| Scenario | Handling |
|---|---|
| **Firebase unavailable** | Fail open during trial (allow if within limits), fail closed for paid plans (block + log error) |
| **Enrollment doc missing** | Normal for unpaid users → return `not_enrolled` + payment URL |
| **Enrollment doc unexpected structure** | Log warning, treat as not enrolled |
| **Payment lapsed** | Enrollment doc status changes from ACTIVE → treat as not enrolled, block session creation |
| **Race condition** | Two concurrent session creates could overshoot by 1 — acceptable for MVP |
| **Candidate-facing error** | Show "This assessment is temporarily unavailable. Please contact the company." — never expose payment details |

---

## Important Notes

1. **Read-only**: The ArcEval app never writes to the `Enrollments` collection. All enrollment records are created by vizuara.ai after payment.

2. **Enrollment ID must match**: The `ARCEVAL_ENROLLMENT_ID` must exactly match the course ID that vizuara.ai uses when writing the enrollment document.

3. **No webhook**: There is no payment webhook. Enrollment status is checked on-demand when the user visits the app. If a user pays and immediately returns, the Firestore document should already exist by the time the subscription status endpoint is called.

4. **Company upsert**: The session callback route creates a company record if one doesn't exist (keyed by `firebase_uid`), or updates email/name if the user changed them on vizuara.ai.

5. **Redirect on denial**: Unenrolled users hitting gated content are redirected to `vizuara.ai/pricing`, sending them directly to where they can pay.

6. **Session duration**: Firebase session cookies are set with a 14-day expiry. After that, the user must re-authenticate through Vizuara.

7. **No local auth**: There are no local login/register forms. The `/login` and `/register` pages simply redirect to Vizuara's auth pages.

---

## Implementation Order (remaining work)

| Step | Task | Files |
|---|---|---|
| 1 | Run migration for plan columns | `database/migrations/005_plan_columns.sql` |
| 2 | Update TypeScript types | `src/types/index.ts` |
| 3 | Create enrollment/quota checker | `src/lib/enrollment.ts` |
| 4 | Add enforcement to apply route | `src/app/api/challenges/[id]/apply/route.ts` |
| 5 | Create plan status endpoint | `src/app/api/plan/route.ts` |
| 6 | Update Sidebar with plan badge | `src/components/dashboard/Sidebar.tsx` |
| 7 | Update Dashboard with quota banner | `src/app/dashboard/page.tsx` |
