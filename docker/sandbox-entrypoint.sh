#!/bin/bash
# Set the real ANTHROPIC_API_KEY from the hidden env var
export ANTHROPIC_API_KEY="$_SANDBOX_API_KEY"

# Pre-initialize Claude Code auth by running a quick non-interactive command.
# The -p flag handles auth without interactive prompts, saving the acceptance
# state so the interactive 'claude' command won't ask again.
if [ -n "$ANTHROPIC_API_KEY" ]; then
    HOME=/home/candidate claude-real -p "hello" --output-format json --max-turns 1 > /dev/null 2>&1 || true
fi

# Keep container alive — terminal server attaches via docker exec
exec sleep infinity
