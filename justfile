set shell := ["cmd.exe", "/c"]

default:
    just --list

# Start the Next.js dev server with values loaded from .env.production.
web:
    scripts\web-prod-env.cmd
