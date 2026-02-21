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

# Source the env file
set -a
source .env.production
set +a

# Verify required vars
for var in DOMAIN POSTGRES_PASSWORD JWT_SECRET ANTHROPIC_API_KEY GEMINI_API_KEY; do
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
echo "4. Running schema migration..."
docker compose exec -T postgres psql -U hiring -d hiring_agent < database/migrations/001_pg_schema.sql

echo ""
echo "5. Running seed script..."
docker compose exec web node -e "
const postgres = require('postgres');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const sql = postgres(process.env.DATABASE_URL, { max: 1 });

async function seed() {
  const [existing] = await sql\\\`SELECT id FROM companies WHERE email = 'demo@acme.com'\\\`;
  if (existing) {
    console.log('Demo company already exists, skipping seed.');
    await sql.end();
    return;
  }

  const companyId = uuidv4();
  const passwordHash = bcrypt.hashSync('password123', 10);
  await sql\\\`INSERT INTO companies (id, name, email, password_hash) VALUES (\${companyId}, 'Acme Engineering', 'demo@acme.com', \${passwordHash})\\\`;

  await sql\\\`INSERT INTO challenges (id, company_id, title, description, time_limit_min, starter_files_dir)
    VALUES ('c0000001-0001-4000-a000-000000000006', \${companyId}, 'Design a Retrieval Strategy for RAG',
    'Build the retrieval component for a RAG system. See BRIEF.md for full instructions.',
    60, 'challenges/rag-retrieval')
    ON CONFLICT (id) DO NOTHING\\\`;

  console.log('Demo data seeded!');
  console.log('  Email: demo@acme.com');
  console.log('  Password: password123');
  await sql.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
"

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
