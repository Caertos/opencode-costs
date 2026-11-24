#!/bin/sh
# install.sh — Install the opencode-costs sidebar panel
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/caertos/opencode-costs/main/install.sh | sh
#   or: ./install.sh
#
# Requires OpenCode 2.x and npm.
set -e

if ! command -v opencode >/dev/null 2>&1; then
    echo "Error: the opencode CLI is required but was not found in PATH" >&2
    exit 1
fi

echo "Installing opencode-costs-tui..."
opencode plugin add opencode-costs-tui

echo ""
echo "Done. Open a session and the panel appears in the sidebar."
echo "Click the header to collapse or expand it."
