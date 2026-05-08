-- Trial end dates only apply while a company is on the trial plan.
UPDATE companies
SET trial_ends_at = NULL
WHERE plan <> 'trial'
  AND trial_ends_at IS NOT NULL;
