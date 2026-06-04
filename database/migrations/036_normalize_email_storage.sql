-- Normalize stored identity/candidate emails to lowercase for reliable matching.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM companies
    GROUP BY LOWER(TRIM(email))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize companies.email: duplicate emails differ only by case or whitespace.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pending_signups
    GROUP BY LOWER(TRIM(email))
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot normalize pending_signups.email: duplicate emails differ only by case or whitespace.';
  END IF;
END $$;

UPDATE companies
SET email = LOWER(TRIM(email))
WHERE email <> LOWER(TRIM(email));

UPDATE pending_signups
SET email = LOWER(TRIM(email))
WHERE email <> LOWER(TRIM(email));

UPDATE sessions
SET candidate_email = LOWER(TRIM(candidate_email))
WHERE candidate_email <> LOWER(TRIM(candidate_email));

UPDATE sessions
SET reviewed_by_email = LOWER(TRIM(reviewed_by_email))
WHERE reviewed_by_email IS NOT NULL
  AND reviewed_by_email <> LOWER(TRIM(reviewed_by_email));

UPDATE sessions
SET candidate_lifecycle_updated_by_email = LOWER(TRIM(candidate_lifecycle_updated_by_email))
WHERE candidate_lifecycle_updated_by_email IS NOT NULL
  AND candidate_lifecycle_updated_by_email <> LOWER(TRIM(candidate_lifecycle_updated_by_email));

UPDATE session_lifecycle_events
SET actor_email = LOWER(TRIM(actor_email))
WHERE actor_email <> LOWER(TRIM(actor_email));

UPDATE report_share_links
SET created_by_email = LOWER(TRIM(created_by_email))
WHERE created_by_email IS NOT NULL
  AND created_by_email <> LOWER(TRIM(created_by_email));

UPDATE challenges
SET allowed_emails = (
  SELECT ARRAY(
    SELECT DISTINCT normalized_email
    FROM (
      SELECT LOWER(TRIM(email)) AS normalized_email
      FROM UNNEST(allowed_emails) AS emails(email)
    ) normalized
    WHERE normalized_email <> ''
    ORDER BY normalized_email
  )
)
WHERE allowed_emails IS NOT NULL;
