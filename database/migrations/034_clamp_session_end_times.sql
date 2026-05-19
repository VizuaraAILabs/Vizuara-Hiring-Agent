-- Clamp historical completion timestamps that were recorded after the assessment deadline.
-- The end-session API now writes the effective end time, but existing rows may still
-- contain delayed browser/network submission times.
UPDATE sessions s
SET ended_at = s.started_at + (c.time_limit_min * INTERVAL '1 minute')
FROM challenges c
WHERE c.id = s.challenge_id
  AND s.started_at IS NOT NULL
  AND s.ended_at IS NOT NULL
  AND c.time_limit_min IS NOT NULL
  AND s.ended_at > s.started_at + (c.time_limit_min * INTERVAL '1 minute');
