#!/bin/bash
# AIDIS Log Rotation Script
# Manually trigger log rotation for all AIDIS services

set -euo pipefail

AIDIS_ROOT="/home/ridgetop/aidis"
LOGROTATE_CONFIG="$AIDIS_ROOT/conf/logrotate.d/aidis"
LOGROTATE_STATE="$AIDIS_ROOT/logs/.logrotate.state"

cd "$AIDIS_ROOT"

echo "🔄 AIDIS Log Rotation Starting..."
echo "📅 $(date)"
echo

# Check if logrotate config exists
if [ ! -f "$LOGROTATE_CONFIG" ]; then
    echo "❌ Logrotate configuration not found: $LOGROTATE_CONFIG"
    exit 1
fi

# Create state directory if needed
mkdir -p "$(dirname "$LOGROTATE_STATE")"

# Run logrotate with our configuration
echo "📋 Running logrotate with AIDIS configuration..."
if logrotate -v -s "$LOGROTATE_STATE" "$LOGROTATE_CONFIG"; then
    echo "✅ Log rotation completed successfully"
    
    # Show rotation summary
    echo
    echo "📊 Post-rotation summary:"
    echo "   Main logs: $(ls -la logs/*.log 2>/dev/null | wc -l) files"
    echo "   Archive logs: $(find logs/archive -name '*.gz' 2>/dev/null | wc -l) compressed files"
    echo "   Total disk usage: $(du -sh logs/ 2>/dev/null | cut -f1) (logs directory)"
    
    # Log the rotation event
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Log rotation completed successfully" >> logs/system/log-rotation.log
    
else
    echo "❌ Log rotation failed"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - Log rotation failed" >> logs/system/log-rotation.log
    exit 1
fi

echo
echo "🎯 Log rotation complete. Archived logs are compressed in logs/archive/"
