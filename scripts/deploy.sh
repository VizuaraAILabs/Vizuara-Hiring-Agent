#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

echo "=== Hiring Agent Production Deployment ==="
echo ""

# Check for .env.production
if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found!"
  echo "Copy .env.production.template and fill in your values:"
  echo "  cp .env.production.template .env.production"
  exit 1
fi

# Strip Windows line endings if present
sed -i 's/\r$//' .env.production

# Source the env file
set -a
source .env.production
set +a

# Verify required vars
for var in DOMAIN POSTGRES_PASSWORD ANTHROPIC_API_KEY GEMINI_API_KEY FIREBASE_PROJECT_ID FIREBASE_CLIENT_EMAIL FIREBASE_PRIVATE_KEY; do
  if [ -z "${!var}" ] || [[ "${!var}" == *"CHANGE_ME"* ]]; then
    echo "ERROR: $var is not set or still has placeholder value in .env.production"
    exit 1
  fi
done

echo "1. Building sandbox image..."
docker build -t hiring-sandbox -f docker/Dockerfile.sandbox .

echo ""
echo "2. Building and starting services..."
docker compose --env-file .env.production up -d --build

echo ""
echo "3. Waiting for PostgreSQL to be ready..."
sleep 5

echo ""
echo "4. Running all database migrations..."
for migration in database/migrations/*.sql; do
  echo "  Running $migration..."
  docker compose --env-file .env.production exec -T postgres psql -U hiring -d hiring_agent < "$migration"
done

echo ""
echo "5. Running seed script..."
docker compose --env-file .env.production exec -T postgres psql -U hiring -d hiring_agent <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies WHERE email = 'demo@acme.com') THEN
    INSERT INTO companies (id, name, email, password_hash)
    VALUES (gen_random_uuid(), 'Acme Engineering', 'demo@acme.com',
            '$2a$10$xJ8Kq5K5K5K5K5K5K5K5KuYgYgYgYgYgYgYgYgYgYgYgYgYgYgYgY');
    RAISE NOTICE 'Demo company seeded (email: demo@acme.com)';
  ELSE
    RAISE NOTICE 'Demo company already exists, skipping.';
  END IF;

  INSERT INTO challenges (id, company_id, title, description, time_limit_min, starter_files_dir)
  SELECT 'c0000001-0001-4000-a000-000000000006', id,
         'Design a Retrieval Strategy for RAG',
         'Build the retrieval component for a RAG system. See BRIEF.md for full instructions.',
         60, 'challenges/rag-retrieval'
  FROM companies WHERE email = 'demo@acme.com'
  ON CONFLICT (id) DO NOTHING;
END $$;
SQL

echo ""
echo "=== Deployment complete! ==="
echo ""
echo "Your platform is live at: https://$DOMAIN"
echo ""
echo "Login with:"
echo "  Email: demo@acme.com"
echo "  Password: password123"
echo ""
echo "Service status:"
docker compose ps
