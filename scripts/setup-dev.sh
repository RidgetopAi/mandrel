#!/bin/bash

# AIDIS Development Setup - No sudo required
# Enterprise hardening for development environment

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIDIS_ROOT="$(dirname "$SCRIPT_DIR")"

log "🔧 Setting up AIDIS Enterprise Hardening (Development)..."
log "📁 AIDIS Root: $AIDIS_ROOT"

# 1. Create local directories
log "📁 Creating local directories..."
mkdir -p "$AIDIS_ROOT/logs"
mkdir -p "$AIDIS_ROOT/run"

# 2. Create environment file
log "🔧 Creating environment configuration..."
tee "$AIDIS_ROOT/.env" > /dev/null <<EOF
# AIDIS Enterprise Hardening Configuration
NODE_ENV=development
MCP_DEBUG=handshake,transport,errors
AIDIS_HEALTH_PORT=8080

# Database settings
DATABASE_URL=postgresql://localhost:5432/aidis_dev

# Hardening settings
AIDIS_MAX_RETRIES=3
AIDIS_INITIAL_RETRY_DELAY=1000
AIDIS_CIRCUIT_BREAKER_THRESHOLD=5
AIDIS_CIRCUIT_BREAKER_TIMEOUT=30000
EOF

# 3. Update PID file location for development
log "🔧 Updating server for development..."
sed -i 's|/var/run/aidis.pid|/home/ridgetop/aidis/run/aidis.pid|g' "$AIDIS_ROOT/mcp-server/src/server.ts"
sed -i 's|PID_FILE="/var/run/aidis.pid"|PID_FILE="/home/ridgetop/aidis/run/aidis.pid"|g' "$AIDIS_ROOT/scripts/aidis-control.sh"

# 4. Set permissions
log "🔧 Setting file permissions..."
chmod 600 "$AIDIS_ROOT/.env"
chmod +x "$AIDIS_ROOT/scripts/"*.sh

success "✅ Development setup complete!"
echo ""
echo "🚀 Test the hardening:"
echo "   $AIDIS_ROOT/scripts/aidis-control.sh start"
echo "   $AIDIS_ROOT/scripts/aidis-control.sh status"
echo "   $AIDIS_ROOT/scripts/aidis-control.sh health"
echo ""
echo "🏥 Health endpoints will be available at:"
echo "   http://localhost:8080/healthz"
echo "   http://localhost:8080/readyz"
