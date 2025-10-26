#!/usr/bin/env bash
# Wrapper to launch AIDIS Claude HTTP-MCP bridge with robust logging.
# Use this as the MCP `command` in codex config to avoid PATH issues.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_DIR="$ROOT_DIR/logs"
BRIDGE_JS="$ROOT_DIR/claude-http-mcp-bridge.js"
NODE_BIN="/home/ridgetop/.nvm/versions/node/v22.18.0/bin/node"

mkdir -p "$LOG_DIR"

{
  echo "[$(date --iso-8601=seconds)] Launching AIDIS bridge (pid $$)"
  echo "node: $NODE_BIN"
  echo "script: $BRIDGE_JS"
  echo "cwd: $ROOT_DIR"
} >> "$LOG_DIR/bridge-spawn.log" 2>&1

exec "$NODE_BIN" "$BRIDGE_JS" >> "$LOG_DIR/bridge-stdio.log" 2>> "$LOG_DIR/bridge-stdio.log"

