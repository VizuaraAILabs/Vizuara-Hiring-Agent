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
echo "4. Running schema migration..."
docker compose exec -T postgres psql -U hiring -d hiring_agent < database/migrations/001_pg_schema.sql

echo ""
echo "5. Running seed script..."
docker compose cp scripts/seed-prod.js web:/tmp/seed-prod.js
docker compose exec web node /tmp/seed-prod.js

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
