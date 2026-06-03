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

echo ""
echo "=== Setup complete! ==="
echo "1. Copy .env.local and set your required API keys"
echo "2. Start Postgres with 'docker compose -f docker-compose.dev.yml up -d'"
echo "3. Run database migrations with 'scripts\\migrate-local.cmd all' on Windows"
echo "4. Run 'npm run dev' to start all services"
