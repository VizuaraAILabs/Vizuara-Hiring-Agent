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
