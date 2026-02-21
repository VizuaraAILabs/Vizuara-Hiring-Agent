#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Starting Hiring Agent Platform ==="

# Start all three services
echo "Starting Next.js frontend (port 3000)..."
cd "$ROOT_DIR/apps/web" && npm run dev &
WEB_PID=$!

echo "Starting Terminal Server (port 3001)..."
cd "$ROOT_DIR/apps/terminal-server" && npm run dev &
TERMINAL_PID=$!

echo "Starting Analysis Engine (port 8000)..."
cd "$ROOT_DIR/services/analysis-engine"
if [ -d ".venv" ]; then
  source .venv/bin/activate
fi
python3 -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload &
ANALYSIS_PID=$!

echo ""
echo "=== All services started ==="
echo "  Frontend:        http://localhost:3000"
echo "  Terminal Server:  ws://localhost:3001"
echo "  Analysis Engine:  http://localhost:8000"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $WEB_PID $TERMINAL_PID $ANALYSIS_PID 2>/dev/null; exit" INT TERM
wait
