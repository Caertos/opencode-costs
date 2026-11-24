#!/bin/sh
# install.sh — Register the opencode-costs sidebar panel
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/caertos/opencode-costs/main/install.sh | sh
#   or: ./install.sh
#
# Adds "opencode-costs-tui" to ~/.config/opencode/cli.json -> plugins, which is
# the list OpenCode 2.x reads for TUI plugins.
set -e

command -v node >/dev/null 2>&1 || {
    echo "Error: node is required (OpenCode ships it, but it must be on PATH)" >&2
    exit 1
}

node <<'NODE'
const fs = require("fs");
const os = require("os");
const path = require("path");

const configDir = path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "opencode");
const file = path.join(configDir, "cli.json");

let config = {};
if (fs.existsSync(file)) {
  const raw = fs.readFileSync(file, "utf8");
  if (raw.trim()) {
    try {
      config = JSON.parse(raw);
    } catch (error) {
      console.error(`Error: ${file} is not valid JSON (${error.message}); fix it and retry.`);
      process.exit(1);
    }
  }
}

const plugins = Array.isArray(config.plugins)
  ? config.plugins.filter((entry) => !String(entry).startsWith("opencode-costs-tui"))
  : [];
plugins.push("opencode-costs-tui");
config.plugins = plugins;

fs.mkdirSync(configDir, { recursive: true });
fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\n");
console.log(`registered opencode-costs-tui in ${file}`);
NODE

echo ""
echo "Done. Restart OpenCode (or run /reload) to load the panel."
echo "Click its header to collapse or expand it."
