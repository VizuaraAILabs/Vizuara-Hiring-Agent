# Company Team Accounts

This document proposes a simple team-account model for ArcEval.

The goal is:

- one shared company account for billing, plan, quota, and challenges
- separate Firebase credentials for each human teammate
- a small membership layer that connects people to the company
- no heavy permission framework in the first implementation

## Current Model

Today ArcEval effectively treats one Firebase user as one company account:

```text
Firebase user UID -> companies.firebase_uid -> company account
```

That keeps the app simple, but it makes team accounts awkward. If multiple people share one Firebase login, ArcEval cannot safely audit actions, revoke one person, or tell who changed what.

## Recommended Model

Keep `companies` as the tenant/account. Add `company_members` for people.

```text
companies
  id
  name
  billing / plan / quota fields

company_members
  id
  company_id
  firebase_uid
  email
  name
  role
  status
  invited_by
  invited_at
  joined_at
```

Each teammate gets their own Firebase account. Their `company_members` row points to the shared company.

```text
Firebase user UID -> company_members.firebase_uid -> company_members.company_id -> companies.id
```

This keeps most existing routes stable because the app already uses `user.companyId` as the tenant identifier.

## Email Normalization

Normalize identity emails before storing or comparing them:

```ts
function normalizeIdentityEmail(email: string) {
  return email.trim().toLowerCase();
}
```

Use normalized emails for:

- `companies.email`
- `pending_signups.email`
- `company_members.email`
- authenticated actor emails in audit/review records

The session route should compare invite/member emails using normalized values, not raw Firebase token values. This avoids creating separate records for `Person@Company.com` and `person@company.com`.

## Keep The First Version Small

Do not build a full enterprise IAM system in the first pass.

Start with:

- one `company_members` table
- email invites only
- simple role checks
- remove access by setting `status = 'removed'`
- no nested teams, departments, custom permissions, SSO, groups, or ownership transfer workflow yet

Those can come later if customers actually need them.

## Minimal Schema

```sql
CREATE TABLE company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  firebase_uid TEXT UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'recruiter',
  status TEXT NOT NULL DEFAULT 'invited',
  invited_by UUID REFERENCES company_members(id),
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, email)
);
```

Recommended constraints:

```sql
ALTER TABLE company_members
  ADD CONSTRAINT company_members_role_check
  CHECK (role IN ('owner', 'recruiter', 'viewer'));

ALTER TABLE company_members
  ADD CONSTRAINT company_members_status_check
  CHECK (status IN ('invited', 'active', 'removed'));
```

Keep the role list short. The MVP roles should be:

```text
owner     - team management, billing, all recruiter actions
recruiter - create/manage assessments, view candidates/reports
viewer    - read-only dashboard and reports
```

Avoid adding `admin` separately unless there is a clear product need. `owner` plus `recruiter` plus `viewer` is enough to start.

## Seat Limit

Add a company-level limit:

```sql
ALTER TABLE companies
  ADD COLUMN team_member_limit INTEGER NOT NULL DEFAULT 1;
```

When inviting a teammate, enforce:

```text
active members + invited members < team_member_limit
```

Do not count removed members.

Plan defaults can be handled in application code:

```text
trial: 1 member
starter: 3 members
growth: 10 members
enterprise: custom
```

This is simpler than building a separate plan-permissions engine immediately.

## Signup And Invite Flow

### 1. Company owner signs up

Create:

```text
companies row
company_members row with role = owner, status = active
```

The owner member should use the same Firebase UID and email as the signup user.

### 2. Owner invites teammate

Create a pending member row:

```text
company_id = owner's company
email = invited teammate email
role = recruiter or viewer
status = invited
firebase_uid = null
invited_by = owner member id
invited_at = now()
```

The invite does not need a complex invite-token system for the first version if Firebase email identity is trusted. The invite can simply say: "Sign up or log in with this email."

### 3. Teammate signs up or logs in

During `/api/auth/session`, after verifying the Firebase token, check:

```text
Is there a company_members row where:
  email = normalizeIdentityEmail(decoded.email)
  status = invited
  firebase_uid is null
```

If yes, claim the invite:

```text
firebase_uid = decoded.uid
status = active
joined_at = now()
```

Then return the shared company account.

### 4. Existing member logs in

For normal login, resolve the user by:

```text
company_members.firebase_uid = decoded.uid
status = active
```

Then load the company through `company_members.company_id`.

## Auth User Shape

`getAuthUser()` should return the company as the tenant and the member as the human actor:

```ts
{
  sub: company.id,
  companyId: company.id,
  memberId: companyMember.id,
  email: companyMember.email,
  name: companyMember.name,
  role: companyMember.role,
  isAdmin: false
}
```

This lets existing company-scoped routes keep using `user.companyId`, while new audit logs and permission checks can use `user.memberId`.

## Offboarding

Do not delete the Firebase user when removing a teammate from a company.

Set:

```text
company_members.status = 'removed'
```

Then `getAuthUser()` should refuse access because only active members are allowed.

This is safer than deleting auth accounts, especially if the same Firebase user may later access another product or another company.

## Route Changes

Keep route changes incremental:

1. `getAuthUser()`
   - First check platform super-admin claims as it does today.
   - For company users, resolve through `company_members.firebase_uid`.
   - Return `companyId` and `memberId`.

2. `/api/auth/session`
   - If an active member exists for the Firebase UID, log them in.
   - If an invited member exists for the email, attach the Firebase UID and activate the member.
   - If neither exists, keep the current owner/company signup behavior.

3. Team Settings APIs
   - `GET /api/team/members`
   - `POST /api/team/invites`
   - `PATCH /api/team/members/{memberId}`
   - `DELETE /api/team/members/{memberId}` should mark the member as `removed`, not hard-delete.

4. Role checks
   - Start with a small helper such as `requireCompanyRole(user, ['owner', 'recruiter'])`.
   - Add it only to routes that need it.
   - Do not rewrite every route at once.

## Migration Path

Implement in this order:

1. Add `company_members` and `companies.team_member_limit`.
2. Backfill each existing `companies.firebase_uid` into an owner member.
3. Update `getAuthUser()` to prefer `company_members.firebase_uid`.
4. Update `/api/auth/session` to claim invited members by email.
5. Add basic Team Settings UI for invite, remove, and role change.
6. Add role checks to sensitive routes.

Backfill shape:

```sql
INSERT INTO company_members (
  company_id,
  firebase_uid,
  email,
  name,
  role,
  status,
  joined_at
)
SELECT
  id,
  firebase_uid,
  LOWER(TRIM(email)),
  name,
  'owner',
  'active',
  created_at
FROM companies
WHERE firebase_uid IS NOT NULL
ON CONFLICT (company_id, email) DO NOTHING;
```

## Avoid Bloat

Do not include these in the first version:

- custom per-route permission matrices
- teams inside teams
- invite expiration and resend history tables
- SSO/SAML
- multiple companies per Firebase user
- ownership transfer
- billing seat proration
- detailed admin audit viewer

The first useful version only needs:

```text
company tenant
member identity
invite by email
role
status
seat limit
```

That gives ArcEval clean team access, audit-friendly identity, and simple offboarding without making the implementation too large.
