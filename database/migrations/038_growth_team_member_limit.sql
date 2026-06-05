-- Growth plans include up to 10 company team members.

UPDATE companies
SET team_member_limit = 10
WHERE plan = 'growth';
