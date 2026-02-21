#!/bin/bash
# Write the API key from a hidden env var into Claude Code's config file.
# We use _SANDBOX_API_KEY (not ANTHROPIC_API_KEY) so Claude Code doesn't
# detect it as an env var and show the "Do you want to use this API key?" prompt.
if [ -n "$_SANDBOX_API_KEY" ]; then
    cat > /home/candidate/.claude.json << EOF
{"hasCompletedOnboarding":true,"primaryApiKey":"$_SANDBOX_API_KEY"}
EOF
fi

# Keep container alive — terminal server attaches via docker exec
exec sleep infinity
