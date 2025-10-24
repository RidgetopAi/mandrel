#!/bin/bash
# AIDIS Unified Logging Startup Script

set -e

# Create logs directory if it doesn't exist
mkdir -p logs

# Log file with timestamp
LOG_FILE="logs/aidis-$(date +%Y%m%d-%H%M%S).log"
LATEST_LOG="logs/aidis-latest.log"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

log "========================================="
log "AIDIS MCP SERVER STARTUP"
log "========================================="
log "Log file: $LOG_FILE"
log "Node environment: ${NODE_ENV:-development}"
log ""

# Create symlink to latest log
ln -sf "$(basename "$LOG_FILE")" "$LATEST_LOG"

# Check if server is already running
if lsof -i :3000 > /dev/null 2>&1; then
    log "⚠️  WARNING: Port 3000 already in use"
    log "Attempting to kill existing process..."
    lsof -ti :3000 | xargs kill -9 2>/dev/null || true
    sleep 2
fi

# Change to mcp-server directory
cd mcp-server

log "📦 Installing dependencies (if needed)..."
npm install --silent >> "../$LOG_FILE" 2>&1 || {
    log "❌ npm install failed"
    exit 1
}

log "🔨 Building TypeScript..."
npm run build >> "../$LOG_FILE" 2>&1 || {
    log "❌ TypeScript compilation failed"
    log "See $LOG_FILE for details"
    exit 1
}

log "🚀 Starting AIDIS MCP Server..."
log ""

# Start server with output to log file
NODE_ENV="${NODE_ENV:-development}" npm start 2>&1 | while IFS= read -r line; do
    echo "[$(date '+%H:%M:%S')] $line" | tee -a "../$LOG_FILE"
done
