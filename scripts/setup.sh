#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Hiring Agent Platform Setup ==="

# Install Node dependencies
echo "Installing Node.js dependencies..."
cd "$ROOT_DIR/apps/web" && npm install
cd "$ROOT_DIR/apps/terminal-server" && npm install

# Set up Python virtual environment
echo "Setting up Python analysis engine..."
cd "$ROOT_DIR/services/analysis-engine"
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
deactivate

# Initialize database
echo "Initializing database..."
mkdir -p "$ROOT_DIR/database"
sqlite3 "$ROOT_DIR/database/hiring_agent.db" < "$ROOT_DIR/database/migrations/001_initial_schema.sql"

# Apply additional migrations (idempotent)
echo "Applying migrations..."
sqlite3 "$ROOT_DIR/database/hiring_agent.db" < "$ROOT_DIR/database/migrations/002_add_starter_files.sql" 2>/dev/null || true

echo ""
echo "=== Setup complete! ==="
echo "1. Copy .env.local and set your ANTHROPIC_API_KEY"
echo "2. Run 'npm run dev' to start all services"
