set shell := ["cmd.exe", "/c"]

default:
    just --list

# Start the Next.js dev server with values loaded from .env.production.
web:
    scripts\web-prod-env.cmd

# Start the Next.js dev server with values loaded from .env.local.
# Use this for local development; .env.local should point DATABASE_URL at the dev Neon database.
web-local:
    scripts\web-local-env.cmd

# Start the terminal server used by local assessment sessions.
terminal:
    cd apps\terminal-server && npm run dev

# Create/activate the analysis engine .venv and install required Python modules.
analysis-setup:
    cd services\analysis-engine && if not exist .venv python -m venv .venv && call .venv\Scripts\activate.bat && python -m pip install -r requirements.txt

# Start the FastAPI analysis engine.
analysis:
    cd services\analysis-engine && call .venv\Scripts\activate.bat && python -m uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload

# Build the Docker image used for candidate sandbox containers.
sandbox-build:
    docker build -t hiring-sandbox -f docker/Dockerfile.sandbox .

# Confirm the candidate sandbox image exists locally.
sandbox-check:
    docker images hiring-sandbox

# Run every Postgres migration against the DATABASE_URL in .env.local.
migrate-local-all:
    scripts\migrate-local.cmd all

# Run only the latest Postgres migration against the DATABASE_URL in .env.local.
migrate-local-latest:
    scripts\migrate-local.cmd latest

# List recent sessions that have interaction rows, for choosing parser fixture session ids.
fixture-sessions limit="20":
    node scripts\list-interaction-sessions.js --limit {{limit}}

# List recent sessions for a challenge that have interaction rows.
fixture-sessions-for challenge_id limit="20":
    node scripts\list-interaction-sessions.js --challenge-id {{challenge_id}} --limit {{limit}}

# Export redacted parser interaction fixture for a session.
fixture-export session_id limit="200":
    node scripts\export-interaction-fixture.js --session-id {{session_id}} --limit {{limit}}

# Export unredacted parser interaction fixture for local-only debugging.
fixture-export-raw session_id limit="200":
    node scripts\export-interaction-fixture.js --session-id {{session_id}} --limit {{limit}} --raw
