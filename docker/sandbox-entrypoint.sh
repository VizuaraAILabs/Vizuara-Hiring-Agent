#!/bin/bash
# The _SANDBOX_API_KEY env var is read by /usr/local/bin/get-api-key.sh
# (configured as apiKeyHelper in Claude Code settings). No need to write
# it anywhere — Claude Code calls the helper script on demand.

# Keep container alive — terminal server attaches via docker exec
exec sleep infinity
