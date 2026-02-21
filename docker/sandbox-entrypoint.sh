#!/bin/bash
# Write the API key to a file that the apiKeyHelper script reads.
# We do NOT set ANTHROPIC_API_KEY as an env var — that triggers
# Claude Code's "Do you want to use this API key?" prompt.
if [ -n "$_SANDBOX_API_KEY" ]; then
    printf '%s' "$_SANDBOX_API_KEY" > /home/candidate/.claude/.api-key
    chmod 600 /home/candidate/.claude/.api-key
fi

# Keep container alive — terminal server attaches via docker exec
exec sleep infinity
