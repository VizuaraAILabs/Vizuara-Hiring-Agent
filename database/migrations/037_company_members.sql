-- Company team members for shared ArcEval company accounts.

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS team_member_limit INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  firebase_uid TEXT UNIQUE,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'recruiter',
  status TEXT NOT NULL DEFAULT 'invited',
  invited_by UUID REFERENCES company_members(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  invite_email_status TEXT NOT NULL DEFAULT 'not_sent',
  invite_email_sent_at TIMESTAMPTZ,
  invite_email_error TEXT,
  joined_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, email)
);

ALTER TABLE company_members
  ADD COLUMN IF NOT EXISTS invite_email_status TEXT NOT NULL DEFAULT 'not_sent',
  ADD COLUMN IF NOT EXISTS invite_email_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invite_email_error TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_members_role_check'
  ) THEN
    ALTER TABLE company_members ADD CONSTRAINT company_members_role_check
      CHECK (role IN ('owner', 'recruiter', 'viewer'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_members_status_check'
  ) THEN
    ALTER TABLE company_members ADD CONSTRAINT company_members_status_check
      CHECK (status IN ('invited', 'active', 'removed'));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'company_members_invite_email_status_check'
  ) THEN
    ALTER TABLE company_members ADD CONSTRAINT company_members_invite_email_status_check
      CHECK (invite_email_status IN ('not_sent', 'sent', 'failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_company_members_company_status
  ON company_members(company_id, status);

CREATE INDEX IF NOT EXISTS idx_company_members_firebase_uid
  ON company_members(firebase_uid)
  WHERE firebase_uid IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_members_email
  ON company_members(LOWER(email));

INSERT INTO company_members (
  company_id,
  firebase_uid,
  email,
  name,
  role,
  status,
  invite_email_status,
  joined_at,
  created_at,
  updated_at
)
SELECT
  id,
  firebase_uid,
  LOWER(TRIM(email)),
  name,
  'owner',
  'active',
  'not_sent',
  created_at,
  created_at,
  NOW()
FROM companies
WHERE firebase_uid IS NOT NULL
ON CONFLICT (company_id, email) DO NOTHING;
