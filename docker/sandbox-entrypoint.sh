#!/bin/bash
# Write the API key to a file that the apiKeyHelper script reads.
# The entrypoint has _SANDBOX_API_KEY from Docker's container env,
# which is guaranteed to be available here (unlike in exec'd processes).
if [ -n "$_SANDBOX_API_KEY" ]; then
    printf '%s' "$_SANDBOX_API_KEY" > /home/candidate/.claude/.api-key
    chmod 600 /home/candidate/.claude/.api-key
fi

# Keep container alive — terminal server attaches via docker exec
exec sleep infinity
