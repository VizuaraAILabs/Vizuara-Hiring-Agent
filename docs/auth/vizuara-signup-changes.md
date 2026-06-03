# Required Changes to Vizuara's Signup Page

When a user signs up on vizuara.ai via a redirect from ArcEval (i.e. the `redirect` query param contains `hire.vizuara.ai`), the signup flow needs two modifications.

---

## 1. Rename "Full Name" to "Company Name" for ArcEval redirects

When `redirect` URL contains `hire.vizuara.ai`, the name field should be labeled "Company Name" instead of "Full Name", since ArcEval users are companies, not individual learners.

**Current:**
```tsx
<Label htmlFor="name">Full Name</Label>
<Input
  id="name"
  type="text"
  placeholder="Enter your full name"
  ...
/>
```

**Changed (when redirect is to ArcEval):**
```tsx
<Label htmlFor="name">{isArcEvalRedirect ? 'Company Name' : 'Full Name'}</Label>
<Input
  id="name"
  type="text"
  placeholder={isArcEvalRedirect ? 'Enter your company name' : 'Enter your full name'}
  ...
/>
```

**Detection logic:**
```tsx
const redirectUrl = getRedirectParam();
const isArcEvalRedirect = redirectUrl?.includes('hire.vizuara.ai') ?? false;
```

---

## 2. Store name as `firstName` in Firestore (existing behavior)

The `signup(email, password, name)` function already stores the name. Confirm that the `name` param passed to Firebase's `createUser` or `updateProfile` ends up as `displayName` on the Firebase Auth user — this is what ArcEval reads via `decoded.name` in the ID token.

No code change needed here if `signup()` already sets `displayName`. Just verify.

---

## 3. Handle Google OAuth redirect for ArcEval

After a successful Google signup, if the redirect URL points to ArcEval, the user should be redirected back. This already works via `handleAuthRedirect`:

```tsx
const handleGoogleSignup = async () => {
  ...
  await loginWithGoogle();
  if (redirectUrl && await handleAuthRedirect(redirectUrl)) return;
  ...
};
```

For Google signups, `decoded.name` in the ID token will be the user's Google display name (personal name, not company name). **This is acceptable** — ArcEval will use it as-is and the user can update it later on ArcEval's dashboard.

---

## 4. Handle email/password signup redirect for ArcEval

After a successful email/password signup, the current flow shows an email verification alert but does **not** redirect to the callback URL. For ArcEval redirects, after email verification is complete, the user should be redirected back to ArcEval's callback URL.

**Current behavior (email/password):**
```tsx
if (confirmation.success) {
  toast({ ... });
  setShowEmailSentAlert(true);
  // No redirect — user stays on Vizuara
}
```

**Required behavior:** After the user verifies their email and logs in, the redirect to ArcEval's callback should happen. This likely already works if the `redirect` param is preserved through the email verification → login flow. Verify that:

1. After email verification, the user is sent to the login page
2. The login page preserves the `redirect` param
3. After login, `handleAuthRedirect(redirectUrl)` fires and sends the user to `hire.vizuara.ai/api/auth/session?token={idToken}`

---

## Summary of changes

| Change | Scope | Effort |
|--------|-------|--------|
| Conditionally show "Company Name" label/placeholder | Signup page | Small — add `isArcEvalRedirect` flag, swap label/placeholder |
| Verify `displayName` is set on Firebase Auth user | `signup()` function | Verify only — likely no change needed |
| Verify email verification → redirect flow works | Auth flow | Verify only — test the full flow |
| Google OAuth redirect | Already handled | No change needed |
