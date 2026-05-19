# Self-Sufficient Auth Plan

## Goal

Make the Hiring Agent app authenticate users directly, without sending users to `vizuara.ai` for login or signup.

Payments, subscription ownership, and Vizuara enrollment records stay unchanged for now. The app should still read Vizuara/Firebase enrollment status exactly as it does today.

Forgot password should also remain delegated to Vizuara AI Labs. The Hiring Agent app should not implement its own password reset UI or Firebase action-code handling in this phase.

Email verification is mandatory for email/password accounts. The app must not create a Hiring Agent session for an unverified email/password Firebase user.

Email verification routes should remain Vizuara AI Labs routes. Hiring Agent should enforce verification status, but should not own Firebase action-code pages for verification links.

## Current Hiring Agent Flow

The current app delegates all login and signup UI to Vizuara AI Labs.

1. A protected Hiring Agent page sends unauthenticated users to:
   - `GET /api/auth/redirect?returnTo=...`
2. `apps/web/src/app/api/auth/redirect/route.ts` stores the local return path in the `arceval_return_to` cookie.
3. The user is redirected to:
   - `https://vizuara.ai/auth/login?redirect=https://hire.vizuara.ai/api/auth/session`
4. Vizuara AI Labs authenticates with Firebase client auth.
5. Vizuara AI Labs redirects back to:
   - `https://hire.vizuara.ai/api/auth/session?token={firebaseIdToken}`
6. `apps/web/src/app/api/auth/session/route.ts` verifies the Firebase ID token with Firebase Admin, creates a Firebase session cookie, and stores it as `vizuara_session`.
7. The app upserts a local `companies` row using:
   - Firebase UID as `companies.firebase_uid`
   - decoded email as company email
   - decoded name as company name
8. All server-side auth continues through `getAuthUser()` in `apps/web/src/lib/auth.ts`, which verifies the `vizuara_session` cookie and maps the Firebase UID back to a local company.

This means the Hiring Agent app already owns its own server session. What it does not own is the user-facing Firebase sign-in/sign-up step.

## Vizuara AI Labs Flow

The Vizuara app already has the Firebase client auth implementation we need to replicate or adapt.

Key files inspected:

- `D:\Vizuara Projects\Vizuara-AI-Labs\src\firebaseConfig.ts`
- `D:\Vizuara Projects\Vizuara-AI-Labs\src\contexts\AuthContext.tsx`
- `D:\Vizuara Projects\Vizuara-AI-Labs\src\services\authService.ts`
- `D:\Vizuara Projects\Vizuara-AI-Labs\src\pages\auth\Login.tsx`
- `D:\Vizuara Projects\Vizuara-AI-Labs\src\pages\auth\Signup.tsx`
- `D:\Vizuara Projects\Vizuara-AI-Labs\src\utils\auth-redirect.ts`

The important redirect behavior lives in `src/utils/auth-redirect.ts`:

- It reads the `redirect` query param.
- It only allows redirects to `https://pods.vizuara.ai` and `https://hire.vizuara.ai`.
- It gets the current Firebase user's ID token.
- It appends that token to the redirect URL as `?token=...`.
- It sends the browser to the requesting app.

That is the bridge the Hiring Agent currently depends on.

## Proposed New Flow

The Hiring Agent app should keep the same server-side session model, but replace the external Vizuara auth UI with local Firebase client auth.

1. User visits `/login` or `/register` inside Hiring Agent.
2. The page uses Firebase Web SDK directly.
3. User signs in with email/password or Google.
4. The client gets `currentUser.getIdToken(true)`.
5. The client posts the token to the local session endpoint:
   - `POST /api/auth/session`
6. The server verifies the ID token using the existing Firebase Admin setup.
7. The server creates the same Firebase session cookie:
   - `vizuara_session`
8. The server upserts or updates the local `companies` row.
9. The client navigates to the saved return path or `/dashboard`.

This avoids external auth redirection while preserving the current backend auth contract.

## Implementation Plan

### 1. Add Firebase Web SDK

Add `firebase` to `apps/web/package.json`.

Create a client Firebase module, likely:

- `apps/web/src/lib/firebase-client.ts`

Required public env vars:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

These must point to the same Firebase project that `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` currently target on the server.

### 2. Convert `/login` To A Real Login Page

Replace `apps/web/src/app/(auth)/login/page.tsx`.

Support:

- Email/password login via Firebase Auth
- Google login if the provider is enabled for the Firebase project
- Forgot-password link that hands off to Vizuara's existing forgot-password flow
- Return path support from `returnTo` or a local return cookie

On successful Firebase sign-in:

- call `user.getIdToken(true)`
- call local `POST /api/auth/session`
- redirect to `/dashboard` or the saved path

Forgot password from this page should link out to Vizuara, for example:

- `https://vizuara.ai/auth/forgot-password`

If Vizuara supports a return/continue parameter for password reset completion, preserve the current app URL in that parameter. If it does not, the user can reset the password on Vizuara and then return to Hiring Agent to log in locally.

### 3. Convert `/register` To A Real Signup Page

Replace `apps/web/src/app/(auth)/register/page.tsx`.

The Hiring Agent account represents a company, so the form should ask for:

- Company name
- Work email
- Password

For email/password signup:

- create the Firebase Auth user
- set Firebase profile `displayName` to company name
- send email verification through Firebase using Vizuara's verification/action route configuration
- show a verification-required state
- do not call the local session endpoint until the user verifies their email and signs in again

For Google signup:

- Firebase display name will usually be a person's name, not a company name
- after first login, the app should ask for or allow editing the company name
- otherwise the local company name may be initialized from the Google profile name

### 4. Keep Company Name Locally Editable

Companies need a profile page where they can manage their own display name.

The app already has this surface:

- `apps/web/src/app/dashboard/profile/page.tsx`
- `apps/web/src/app/api/profile/route.ts`
- dashboard link: `/dashboard/profile`

The important auth-flow rule is that once a local company row exists, Firebase/Vizuara profile names should not overwrite `companies.name` on subsequent logins. This matters especially for Google auth, where Firebase `displayName` is usually a person's name rather than the company name.

Use `companies.name` as the Hiring Agent source of truth for company display name. The Firebase profile name can seed the initial company name only at first account creation.

### 5. Extend `/api/auth/session`

Keep the existing `GET /api/auth/session?token=...` callback for backward compatibility during rollout.

Add a `POST /api/auth/session` handler that accepts:

```json
{
  "token": "firebase-id-token",
  "companyName": "Optional company name"
}
```

Both GET and POST should share the same internal function:

- verify ID token
- reject unverified email/password users
- create session cookie
- upsert company by `firebase_uid` or email
- preserve existing `companies.id`
- update email, name, and `firebase_uid`
- set `vizuara_session`

Important: continue setting cookies on the actual `NextResponse`, especially for redirects. The existing route already gets this right.

### 6. Update Auth Gates

Change unauthenticated redirects from `/api/auth/redirect` to local pages:

- `apps/web/src/components/auth/AuthGate.tsx`
- `apps/web/src/components/auth/SubscriptionGate.tsx`

Instead of:

- `/api/auth/redirect?returnTo=/some-page`

Use:

- `/login?returnTo=/some-page`

or:

- `/register?returnTo=/some-page`

`SubscriptionGate` should still redirect unauthenticated users to local login, but non-enrolled users can continue going to the current Vizuara payment/pricing URL.

### 7. Keep Payment And Enrollment Logic As-Is

Do not change:

- `apps/web/src/lib/enrollment.ts`
- `apps/web/src/app/api/subscription/status/route.ts`
- Vizuara pricing/payment URLs
- Firestore `Enrollments` read behavior

The app should continue using `companies.firebase_uid` to look up Vizuara enrollment status.

### 8. Delegate Forgot Password To Vizuara

Do not build a local password reset page in Hiring Agent during this phase.

Instead:

- show a "Forgot password?" link on the local login page
- send the user to Vizuara AI Labs' existing forgot-password route
- let Vizuara send and process Firebase password reset emails
- after reset, the user returns to Hiring Agent and signs in through the new local login page

This keeps one source of truth for password reset behavior and avoids duplicating Firebase action-code routes in the Next.js app.

## Rollout Strategy

Use a feature flag so we can switch safely:

- `NEXT_PUBLIC_AUTH_MODE=local`
- `NEXT_PUBLIC_AUTH_MODE=vizuara`

During rollout:

1. Keep `/api/auth/redirect` and GET `/api/auth/session` working.
2. Add local login/register and POST `/api/auth/session`.
3. Switch gates and header links to local auth only after local login works.
4. Remove the external redirect dependency later, after production has been stable.

## Caveats

### Email Verification

Vizuara AI Labs blocks unverified email/password users in `AuthContext.tsx`. Hiring Agent should do the same.

Email/password signup must send a Firebase verification email and stop at a verification-required screen. The app should not create `vizuara_session`, upsert a trial company session, or redirect to `/dashboard` until Firebase reports `emailVerified === true`.

Google-authenticated users can be treated as verified through the provider, but the server should still explicitly inspect the decoded Firebase token/provider state before issuing the session cookie.

Verification links and Firebase action-code handling should remain on Vizuara AI Labs routes. Hiring Agent should not implement local routes like `/auth/verify-email` or `/auth/action` in this phase.

Implementation detail:

- client-side login should check `firebaseUser.emailVerified` before posting to `/api/auth/session`
- server-side `/api/auth/session` should also enforce verification so a modified client cannot bypass it
- verification email action URLs should be controlled by Vizuara
- after verification, the user must return to Hiring Agent and log in locally
- if possible, include a continue URL that points back to Hiring Agent login, preserving the original return path

### Forgot Password Ownership

Forgot password should stay on Vizuara AI Labs. This avoids a second implementation of Firebase password reset emails, action codes, expired-code UI, and reset completion routing.

The tradeoff is that auth is not fully local in the strictest sense: account recovery still sends users to Vizuara. That is acceptable for this phase because password reset is an account-support flow, while normal login/signup can still become self-sufficient inside Hiring Agent.

### Company Name vs User Name

Vizuara AI Labs uses one `name` field. For Hiring Agent, the name is semantically a company name.

Email/password signup can set Firebase `displayName` to company name. Google signup cannot reliably do that because Google provides a personal display name. The local `companies.name` should be editable after login.

### Existing Users

Existing users already have `companies.firebase_uid`.

If they sign in locally against the same Firebase project, their UID should match and the local row should be reused. If the app is accidentally pointed at a different Firebase project, the UID will not match and duplicate company records may be created.

### Cookie Naming

The cookie is currently named `vizuara_session`. That can remain for compatibility, but it is conceptually now the Hiring Agent session cookie.

Renaming it later would require a short migration window where both cookie names are accepted.

### Firebase Authorized Domains

The Firebase project must allow the Hiring Agent domains for client auth:

- local development domain
- `hire.vizuara.ai`
- any staging domain

Google sign-in will fail if the domain is missing from Firebase Auth settings.

### CORS Is Avoided

The new flow should post the ID token to the same Next.js app, so no cross-origin auth callback is needed. This is simpler than the current Vizuara redirect bridge.

### Token Exposure

The current redirect flow puts a Firebase ID token in the URL query string. The local flow should avoid that by posting the token in the request body to `POST /api/auth/session`.

This reduces exposure through browser history, logs, analytics, and referrer headers.

### Admin Detection

Hiring Agent admin access should come from Vizuara Firebase custom claims, not hardcoded emails.

Vizuara uses the `role` custom claim on Firebase Auth tokens for privileged backend checks. Hiring Agent should mirror Vizuara's admin privilege rule:

- `role === "ADMIN"` means admin here
- `role === "SUPER ADMIN"` also means admin here

The server should derive `user.isAdmin` inside `getAuthUser()` after verifying the Firebase session cookie. Existing API routes should check `user.isAdmin`, not email allowlists.

For public flows that only have a company ID, such as candidate application to a challenge, resolve the company's `firebase_uid` and inspect that Firebase user's custom claims with Firebase Admin.

Do not maintain a separate Hiring Agent admin list unless a temporary emergency override is explicitly needed.

### Firestore Enrollment Dependency Remains

Auth can become local, but access/payment is still coupled to Vizuara Firestore enrollment documents. If Vizuara payments or enrollment writing breaks, Hiring Agent subscription gating can still break.

This is acceptable for now because payments are intentionally unchanged.

## Potential Future Issues

- Firebase client and admin configs drift between environments.
- Email verification links intentionally route to Vizuara; the post-verification return path must be clear so users do not get stranded on the wrong product.
- Password reset remains dependent on Vizuara availability and route stability.
- Google signup may create companies with personal names until the user edits their profile.
- Local auth UI must handle Firebase errors cleanly: disabled user, wrong password, popup closed, too many attempts, network failure.
- Trial creation is currently tied to first session creation. Repeated account creation with alternate emails can create multiple trials unless product rules limit it.
- If future payments move into Hiring Agent, enrollment reads from Vizuara Firestore will become the next major coupling point.
- Keeping both external and local auth during rollout means two ways to create/update users. The shared session upsert code must be idempotent.

## Recommended First PR

Make the first PR small and reversible:

1. Add Firebase client config.
2. Add `POST /api/auth/session`.
3. Enforce mandatory email verification in `POST /api/auth/session`.
4. Create local email/password login only.
5. Keep external Vizuara redirect routes unchanged.
6. Wire "Forgot password?" to Vizuara's existing forgot-password page.
7. Add `NEXT_PUBLIC_AUTH_MODE` and wire only login/register links through it.

After that works, add local signup and Google login.
