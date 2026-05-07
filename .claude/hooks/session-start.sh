#!/bin/bash
set -euo pipefail

# Only run in remote Claude Code environments
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Run the Manthan environment loader
node "$CLAUDE_PROJECT_DIR/manthan-loader.js"
