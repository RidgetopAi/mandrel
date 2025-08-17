#!/bin/bash

# AIDIS Enterprise Hardening Installation Script
# Implements Oracle's bulletproof stability recommendations

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AIDIS_ROOT="$(dirname "$SCRIPT_DIR")"

log "🔧 Installing AIDIS Enterprise Hardening..."
log "📁 AIDIS Root: $AIDIS_ROOT"

# 1. Create necessary directories
log "📁 Creating system directories..."
sudo mkdir -p /var/run
sudo mkdir -p /var/log/aidis
sudo chown ridgetop:ridgetop /var/log/aidis

# 2. Install systemd service (optional, for production)
if command -v systemctl &> /dev/null; then
    log "🔧 Installing systemd service..."
    
    # Copy service file
    sudo cp "$AIDIS_ROOT/aidis.service" /etc/systemd/system/
    
    # Reload systemd
    sudo systemctl daemon-reload
    
    # Enable service (but don't start yet)
    sudo systemctl enable aidis.service
    
    success "✅ SystemD service installed and enabled"
else
    warn "⚠️  SystemD not available, skipping service installation"
fi

# 3. Install process control script globally
log "🔧 Installing process control script..."
sudo ln -sf "$AIDIS_ROOT/scripts/aidis-control.sh" /usr/local/bin/aidis-control
success "✅ Process control script available as: aidis-control"

# 4. Create log rotation config
log "🔧 Setting up log rotation..."
sudo tee /etc/logrotate.d/aidis > /dev/null <<EOF
/home/ridgetop/aidis/aidis.log {
    weekly
    rotate 4
    compress
    delaycompress
    missingok
    notifempty
    create 644 ridgetop ridgetop
    postrotate
        /usr/local/bin/aidis-control restart > /dev/null 2>&1 || true
    endscript
}
EOF
success "✅ Log rotation configured"

# 5. Create health check monitoring script
log "🔧 Creating health monitoring script..."
tee "$AIDIS_ROOT/scripts/health-monitor.sh" > /dev/null <<'EOF'
#!/bin/bash

# AIDIS Health Monitor - Oracle Enterprise Grade
# Continuous health monitoring with auto-recovery

HEALTH_URL="http://localhost:8080"
LOG_FILE="/var/log/aidis/health-monitor.log"
CONTROL_SCRIPT="/usr/local/bin/aidis-control"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

# Check health and restart if needed
check_and_recover() {
    # Check liveness
    if ! curl -s "$HEALTH_URL/healthz" > /dev/null 2>&1; then
        log "❌ Liveness check failed - attempting restart"
        $CONTROL_SCRIPT restart
        sleep 10
        
        if curl -s "$HEALTH_URL/healthz" > /dev/null 2>&1; then
            log "✅ Auto-recovery successful"
        else
            log "🚨 Auto-recovery failed - manual intervention needed"
        fi
        return
    fi
    
    # Check readiness
    if ! curl -s "$HEALTH_URL/readyz" > /dev/null 2>&1; then
        log "⚠️  Readiness check failed - AIDIS may be unhealthy"
        return
    fi
    
    log "✅ Health check passed"
}

# Run health check
check_and_recover
EOF

chmod +x "$AIDIS_ROOT/scripts/health-monitor.sh"
success "✅ Health monitoring script created"

# 6. Setup cron job for health monitoring (optional)
log "🔧 Setting up cron job for health monitoring..."
(crontab -l 2>/dev/null | grep -v "aidis.*health-monitor" || true; echo "*/5 * * * * $AIDIS_ROOT/scripts/health-monitor.sh") | crontab -
success "✅ Health monitoring cron job installed (every 5 minutes)"

# 7. Create environment file
log "🔧 Creating environment configuration..."
tee "$AIDIS_ROOT/.env" > /dev/null <<EOF
# AIDIS Enterprise Hardening Configuration
NODE_ENV=production
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
success "✅ Environment configuration created"

# 8. Set proper permissions
log "🔧 Setting file permissions..."
chmod 600 "$AIDIS_ROOT/.env"
chmod +x "$AIDIS_ROOT/scripts/"*.sh
success "✅ File permissions set"

# Final status
echo ""
log "🎉 AIDIS Enterprise Hardening Installation Complete!"
echo ""
echo "📋 What was installed:"
echo "   🔧 SystemD service: /etc/systemd/system/aidis.service"
echo "   🎮 Control script: /usr/local/bin/aidis-control"
echo "   📊 Health monitor: $AIDIS_ROOT/scripts/health-monitor.sh"
echo "   🔄 Log rotation: /etc/logrotate.d/aidis"
echo "   ⏰ Cron monitoring: every 5 minutes"
echo ""
echo "🚀 Quick Start Commands:"
echo "   Start AIDIS: aidis-control start"
echo "   Check status: aidis-control status"
echo "   Health check: aidis-control health"
echo "   View logs: aidis-control logs"
echo "   Restart: aidis-control restart"
echo ""
echo "🏥 Health Endpoints:"
echo "   Liveness: http://localhost:8080/healthz"
echo "   Readiness: http://localhost:8080/readyz"
echo ""
echo "🔒 Enterprise Features Enabled:"
echo "   ✅ Process singleton pattern"
echo "   ✅ Health check endpoints"
echo "   ✅ Graceful shutdown handling"
echo "   ✅ Retry logic with exponential backoff"
echo "   ✅ Circuit breaker pattern"
echo "   ✅ MCP debug logging"
echo "   ✅ Automatic health monitoring"
echo "   ✅ SystemD service integration"
echo ""
warn "⚠️  Remember to start PostgreSQL before starting AIDIS"
success "🔥 AIDIS is now bulletproof and ready for production!"
