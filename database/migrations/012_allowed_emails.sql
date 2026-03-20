-- Allow companies to restrict challenge access to a specific list of email addresses.
-- NULL or empty array means anyone with the link can attempt.
ALTER TABLE challenges ADD COLUMN IF NOT EXISTS allowed_emails TEXT[] DEFAULT NULL;
