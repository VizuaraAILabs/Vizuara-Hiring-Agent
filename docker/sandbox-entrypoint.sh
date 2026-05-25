#!/bin/bash

# Keep container alive. Terminal server attaches via docker exec.
# Do not materialize Anthropic credentials in this untrusted sandbox.
exec sleep infinity
