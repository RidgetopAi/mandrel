# TS015 - Operational Procedures Manual

**Status**: OPERATIONAL PROCEDURES COMPLETE  
**Created**: September 12, 2025  
**Type**: Operations and Maintenance Manual  
**Priority**: Enterprise Operations  

---

## 🎯 Executive Summary

This manual provides comprehensive operational procedures for maintaining, monitoring, and optimizing the TS001-TS015 Session Management System in production. It covers daily operations, maintenance procedures, performance monitoring, troubleshooting, and emergency response protocols.

### **Operational Scope**
- **System Monitoring**: Real-time health tracking and alerting
- **Maintenance Procedures**: Regular maintenance and optimization tasks
- **Performance Management**: System performance monitoring and tuning
- **Troubleshooting**: Issue identification and resolution procedures
- **Emergency Response**: Incident response and disaster recovery

---

## 🔍 System Monitoring

### **Health Monitoring Dashboard**

#### **Primary Health Metrics**
```bash
# Create monitoring script for system health
cat > /home/ridgetop/aidis/scripts/system-health-monitor.sh << 'EOF'
#!/bin/bash

# AIDIS System Health Monitor
# Run every 5 minutes via cron

LOG_FILE="/home/ridgetop/aidis/logs/health-monitor.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting health check..." >> $LOG_FILE

# 1. Service Status Check
SERVICE_STATUS=$(systemctl is-active aidis-production.service)
if [ "$SERVICE_STATUS" = "active" ]; then
    echo "[$TIMESTAMP] ✅ Service Status: ACTIVE" >> $LOG_FILE
    SERVICE_HEALTH=1
else
    echo "[$TIMESTAMP] ❌ Service Status: $SERVICE_STATUS" >> $LOG_FILE
    SERVICE_HEALTH=0
    # Send critical alert
    /home/ridgetop/aidis/scripts/send-alert.sh "CRITICAL: AIDIS Service Down" "Service status: $SERVICE_STATUS"
fi

# 2. Database Connectivity Check
DB_STATUS=$(psql -h localhost -d aidis_production -U ridgetop -c "SELECT 'OK';" -t 2>/dev/null | xargs)
if [ "$DB_STATUS" = "OK" ]; then
    echo "[$TIMESTAMP] ✅ Database: CONNECTED" >> $LOG_FILE
    DB_HEALTH=1
else
    echo "[$TIMESTAMP] ❌ Database: CONNECTION FAILED" >> $LOG_FILE
    DB_HEALTH=0
    # Send critical alert
    /home/ridgetop/aidis/scripts/send-alert.sh "CRITICAL: Database Connection Failed" "Unable to connect to PostgreSQL"
fi

# 3. Memory Usage Check
MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.2f", $3/$2 * 100.0}')
MEMORY_THRESHOLD=80.0
if (( $(echo "$MEMORY_USAGE < $MEMORY_THRESHOLD" | bc -l) )); then
    echo "[$TIMESTAMP] ✅ Memory Usage: ${MEMORY_USAGE}%" >> $LOG_FILE
    MEMORY_HEALTH=1
else
    echo "[$TIMESTAMP] ⚠️ Memory Usage: ${MEMORY_USAGE}% (>80%)" >> $LOG_FILE
    MEMORY_HEALTH=0
    # Send warning alert
    /home/ridgetop/aidis/scripts/send-alert.sh "WARNING: High Memory Usage" "Memory usage: ${MEMORY_USAGE}%"
fi

# 4. Disk Space Check
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
DISK_THRESHOLD=85
if [ "$DISK_USAGE" -lt "$DISK_THRESHOLD" ]; then
    echo "[$TIMESTAMP] ✅ Disk Usage: ${DISK_USAGE}%" >> $LOG_FILE
    DISK_HEALTH=1
else
    echo "[$TIMESTAMP] ⚠️ Disk Usage: ${DISK_USAGE}% (>85%)" >> $LOG_FILE
    DISK_HEALTH=0
    # Send warning alert
    /home/ridgetop/aidis/scripts/send-alert.sh "WARNING: Low Disk Space" "Disk usage: ${DISK_USAGE}%"
fi

# 5. Active Sessions Count
SESSION_COUNT=$(psql -h localhost -d aidis_production -U ridgetop -c "SELECT COUNT(*) FROM sessions WHERE ended_at IS NULL;" -t 2>/dev/null | xargs)
echo "[$TIMESTAMP] 📊 Active Sessions: ${SESSION_COUNT:-0}" >> $LOG_FILE

# 6. Error Rate Check (last 5 minutes)
ERROR_COUNT=$(sudo journalctl -u aidis-production.service --since "5 minutes ago" -p err --no-pager -q | wc -l)
if [ "$ERROR_COUNT" -lt 5 ]; then
    echo "[$TIMESTAMP] ✅ Error Rate: ${ERROR_COUNT} errors (last 5 min)" >> $LOG_FILE
    ERROR_HEALTH=1
else
    echo "[$TIMESTAMP] ⚠️ Error Rate: ${ERROR_COUNT} errors (last 5 min)" >> $LOG_FILE
    ERROR_HEALTH=0
    # Send warning alert
    /home/ridgetop/aidis/scripts/send-alert.sh "WARNING: High Error Rate" "Errors: ${ERROR_COUNT} in last 5 minutes"
fi

# 7. Overall Health Score
TOTAL_HEALTH=$((SERVICE_HEALTH + DB_HEALTH + MEMORY_HEALTH + DISK_HEALTH + ERROR_HEALTH))
HEALTH_PERCENTAGE=$(echo "scale=2; $TOTAL_HEALTH / 5 * 100" | bc)

if (( $(echo "$HEALTH_PERCENTAGE >= 80" | bc -l) )); then
    HEALTH_STATUS="EXCELLENT"
elif (( $(echo "$HEALTH_PERCENTAGE >= 60" | bc -l) )); then
    HEALTH_STATUS="GOOD"
elif (( $(echo "$HEALTH_PERCENTAGE >= 40" | bc -l) )); then
    HEALTH_STATUS="WARNING"
else
    HEALTH_STATUS="CRITICAL"
fi

echo "[$TIMESTAMP] 🎯 Overall Health: ${HEALTH_PERCENTAGE}% ($HEALTH_STATUS)" >> $LOG_FILE

# 8. Write health metrics to monitoring file
cat > /home/ridgetop/aidis/logs/current-health.json << EOF
{
    "timestamp": "$TIMESTAMP",
    "service_status": $SERVICE_HEALTH,
    "database_status": $DB_HEALTH,
    "memory_usage": $MEMORY_USAGE,
    "disk_usage": $DISK_USAGE,
    "active_sessions": ${SESSION_COUNT:-0},
    "error_count_5min": $ERROR_COUNT,
    "overall_health": $HEALTH_PERCENTAGE,
    "health_status": "$HEALTH_STATUS"
}
EOF

echo "[$TIMESTAMP] Health check completed." >> $LOG_FILE
EOF

# Make script executable
chmod +x /home/ridgetop/aidis/scripts/system-health-monitor.sh
```

#### **Alert System Configuration**
```bash
# Create alert script
cat > /home/ridgetop/aidis/scripts/send-alert.sh << 'EOF'
#!/bin/bash

# AIDIS Alert System
SUBJECT="$1"
MESSAGE="$2"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')
ALERT_LOG="/home/ridgetop/aidis/logs/alerts.log"

echo "[$TIMESTAMP] ALERT: $SUBJECT - $MESSAGE" >> $ALERT_LOG

# Log to system journal
logger -t aidis-alert "$SUBJECT: $MESSAGE"

# For now, just log alerts. In production, integrate with:
# - Email notifications
# - Slack/Discord webhooks  
# - SMS alerts for critical issues
# - Monitoring systems (Grafana, Nagios, etc.)

# Example email notification (uncomment and configure):
# echo "$MESSAGE" | mail -s "AIDIS Alert: $SUBJECT" admin@yourdomain.com

# Example Slack webhook (uncomment and configure):
# curl -X POST -H 'Content-type: application/json' \
#   --data "{\"text\":\"🚨 AIDIS Alert: $SUBJECT\\n$MESSAGE\"}" \
#   YOUR_SLACK_WEBHOOK_URL
EOF

# Make alert script executable
chmod +x /home/ridgetop/aidis/scripts/send-alert.sh
```

#### **Performance Monitoring**
```bash
# Create performance monitoring script
cat > /home/ridgetop/aidis/scripts/performance-monitor.sh << 'EOF'
#!/bin/bash

# AIDIS Performance Monitor
# Tracks key performance metrics

PERF_LOG="/home/ridgetop/aidis/logs/performance.log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting performance monitoring..." >> $PERF_LOG

# 1. Database Query Performance
DB_QUERY_TIME=$(psql -h localhost -d aidis_production -U ridgetop -c "\timing on" -c "SELECT COUNT(*) FROM sessions;" 2>&1 | grep "Time:" | awk '{print $2}' | sed 's/ms//')
echo "[$TIMESTAMP] Database Query Time: ${DB_QUERY_TIME:-N/A}ms" >> $PERF_LOG

# 2. Session Creation Performance Test
SESSION_CREATE_START=$(date +%s%3N)
TEST_SESSION_ID="perf-test-$(date +%s)"

# Simulate session creation (replace with actual API call)
psql -h localhost -d aidis_production -U ridgetop -c "
INSERT INTO sessions (id, project_id, agent_type, started_at, title) 
SELECT '$TEST_SESSION_ID', id, 'performance-test', NOW(), 'Performance Test'
FROM projects WHERE name = 'System Default' LIMIT 1;
" >/dev/null 2>&1

SESSION_CREATE_END=$(date +%s%3N)
SESSION_CREATE_TIME=$((SESSION_CREATE_END - SESSION_CREATE_START))

echo "[$TIMESTAMP] Session Creation Time: ${SESSION_CREATE_TIME}ms" >> $PERF_LOG

# Clean up test session
psql -h localhost -d aidis_production -U ridgetop -c "DELETE FROM sessions WHERE id = '$TEST_SESSION_ID';" >/dev/null 2>&1

# 3. Memory Performance
MEMORY_RSS=$(ps -o pid,rss,comm -C node | grep -v grep | awk 'NR>1 {sum += $2} END {print sum}')
echo "[$TIMESTAMP] Node.js Memory RSS: ${MEMORY_RSS:-0}KB" >> $PERF_LOG

# 4. CPU Usage
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | awk '{print $2}' | sed 's/%us,//')
echo "[$TIMESTAMP] CPU Usage: ${CPU_USAGE}%" >> $PERF_LOG

# 5. Connection Pool Status
CONNECTION_COUNT=$(psql -h localhost -d aidis_production -U ridgetop -c "SELECT count(*) FROM pg_stat_activity WHERE datname = 'aidis_production';" -t | xargs)
echo "[$TIMESTAMP] Database Connections: ${CONNECTION_COUNT:-0}" >> $PERF_LOG

# 6. Performance Alerts
if [ "$SESSION_CREATE_TIME" -gt 50 ]; then
    /home/ridgetop/aidis/scripts/send-alert.sh "Performance Warning" "Session creation time: ${SESSION_CREATE_TIME}ms (target: <50ms)"
fi

if [ "${DB_QUERY_TIME:-0}" -gt 25 ]; then
    /home/ridgetop/aidis/scripts/send-alert.sh "Performance Warning" "Database query time: ${DB_QUERY_TIME}ms (target: <25ms)"
fi

echo "[$TIMESTAMP] Performance monitoring completed." >> $PERF_LOG
EOF

# Make performance script executable
chmod +x /home/ridgetop/aidis/scripts/performance-monitor.sh
```

### **Automated Monitoring Setup**

#### **Cron Jobs Configuration**
```bash
# Install monitoring cron jobs
crontab -e

# Add these lines to the crontab:
# Health monitoring every 5 minutes
*/5 * * * * /home/ridgetop/aidis/scripts/system-health-monitor.sh

# Performance monitoring every 15 minutes  
*/15 * * * * /home/ridgetop/aidis/scripts/performance-monitor.sh

# Daily system report at 6 AM
0 6 * * * /home/ridgetop/aidis/scripts/daily-report.sh

# Weekly maintenance on Sundays at 2 AM
0 2 * * 0 /home/ridgetop/aidis/scripts/weekly-maintenance.sh
```

#### **Daily System Report**
```bash
# Create daily report script
cat > /home/ridgetop/aidis/scripts/daily-report.sh << 'EOF'
#!/bin/bash

# Daily AIDIS System Report

REPORT_FILE="/home/ridgetop/aidis/logs/daily-report-$(date +%Y%m%d).log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "AIDIS Daily System Report - $TIMESTAMP" > $REPORT_FILE
echo "================================================" >> $REPORT_FILE

# 1. System Uptime
echo "System Uptime:" >> $REPORT_FILE
uptime >> $REPORT_FILE
echo "" >> $REPORT_FILE

# 2. Service Status
echo "Service Status:" >> $REPORT_FILE
systemctl status aidis-production.service --no-pager -l >> $REPORT_FILE
echo "" >> $REPORT_FILE

# 3. Database Statistics
echo "Database Statistics:" >> $REPORT_FILE
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    'Projects' as table_name, COUNT(*) as count 
FROM projects
UNION ALL
SELECT 
    'Active Sessions' as table_name, COUNT(*) as count 
FROM sessions WHERE ended_at IS NULL
UNION ALL
SELECT 
    'Total Sessions' as table_name, COUNT(*) as count 
FROM sessions
UNION ALL
SELECT 
    'Contexts' as table_name, COUNT(*) as count 
FROM contexts;
" >> $REPORT_FILE
echo "" >> $REPORT_FILE

# 4. Performance Summary (last 24 hours)
echo "Performance Summary (Last 24 Hours):" >> $REPORT_FILE
if [ -f "/home/ridgetop/aidis/logs/performance.log" ]; then
    grep "$(date -d '1 day ago' '+%Y-%m-%d')" /home/ridgetop/aidis/logs/performance.log | tail -10 >> $REPORT_FILE
fi
echo "" >> $REPORT_FILE

# 5. Error Summary (last 24 hours)
echo "Error Summary (Last 24 Hours):" >> $REPORT_FILE
ERROR_COUNT=$(sudo journalctl -u aidis-production.service --since "24 hours ago" -p err --no-pager -q | wc -l)
echo "Total Errors: $ERROR_COUNT" >> $REPORT_FILE
if [ "$ERROR_COUNT" -gt 0 ]; then
    echo "Recent Errors:" >> $REPORT_FILE
    sudo journalctl -u aidis-production.service --since "24 hours ago" -p err --no-pager -q | tail -5 >> $REPORT_FILE
fi
echo "" >> $REPORT_FILE

# 6. Disk Usage
echo "Disk Usage:" >> $REPORT_FILE
df -h >> $REPORT_FILE
echo "" >> $REPORT_FILE

# 7. Memory Usage
echo "Memory Usage:" >> $REPORT_FILE
free -h >> $REPORT_FILE
echo "" >> $REPORT_FILE

# 8. Top Processes
echo "Top Processes:" >> $REPORT_FILE
ps aux --sort=-%cpu | head -10 >> $REPORT_FILE
echo "" >> $REPORT_FILE

# 9. Network Connections
echo "Network Connections:" >> $REPORT_FILE
netstat -tlnp | grep -E "(3001|5432)" >> $REPORT_FILE
echo "" >> $REPORT_FILE

echo "Report generated: $TIMESTAMP" >> $REPORT_FILE

# Send summary alert
CRITICAL_ISSUES=$(grep -c "❌\|CRITICAL" $REPORT_FILE)
if [ "$CRITICAL_ISSUES" -gt 0 ]; then
    /home/ridgetop/aidis/scripts/send-alert.sh "Daily Report: Critical Issues Found" "$CRITICAL_ISSUES critical issues detected. Check $REPORT_FILE"
fi
EOF

# Make daily report script executable
chmod +x /home/ridgetop/aidis/scripts/daily-report.sh
```

---

## 🔧 Maintenance Procedures

### **Weekly Maintenance Tasks**

#### **Database Maintenance**
```bash
# Create weekly maintenance script
cat > /home/ridgetop/aidis/scripts/weekly-maintenance.sh << 'EOF'
#!/bin/bash

# Weekly AIDIS Maintenance Tasks

MAINT_LOG="/home/ridgetop/aidis/logs/maintenance-$(date +%Y%m%d).log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting weekly maintenance..." >> $MAINT_LOG

# 1. Database Vacuum and Analyze
echo "[$TIMESTAMP] Running database vacuum and analyze..." >> $MAINT_LOG
psql -h localhost -d aidis_production -U ridgetop -c "VACUUM ANALYZE;" >> $MAINT_LOG 2>&1

# 2. Database Statistics Update
echo "[$TIMESTAMP] Updating database statistics..." >> $MAINT_LOG
psql -h localhost -d aidis_production -U ridgetop -c "
UPDATE pg_stat_user_tables SET n_tup_ins = 0, n_tup_upd = 0, n_tup_del = 0;
ANALYZE;
" >> $MAINT_LOG 2>&1

# 3. Log Rotation and Cleanup
echo "[$TIMESTAMP] Rotating logs..." >> $MAINT_LOG
/usr/sbin/logrotate /etc/logrotate.d/aidis

# 4. Clean up old session records (older than 90 days)
echo "[$TIMESTAMP] Cleaning up old session records..." >> $MAINT_LOG
DELETED_SESSIONS=$(psql -h localhost -d aidis_production -U ridgetop -t -c "
DELETE FROM sessions 
WHERE ended_at < NOW() - INTERVAL '90 days'
RETURNING id;
" | wc -l)
echo "[$TIMESTAMP] Deleted $DELETED_SESSIONS old session records" >> $MAINT_LOG

# 5. Clean up orphaned contexts (no session reference)
echo "[$TIMESTAMP] Cleaning up orphaned contexts..." >> $MAINT_LOG
DELETED_CONTEXTS=$(psql -h localhost -d aidis_production -U ridgetop -t -c "
DELETE FROM contexts 
WHERE session_id IS NOT NULL 
AND session_id NOT IN (SELECT id FROM sessions)
RETURNING id;
" | wc -l)
echo "[$TIMESTAMP] Deleted $DELETED_CONTEXTS orphaned contexts" >> $MAINT_LOG

# 6. Update database statistics
echo "[$TIMESTAMP] Updating table statistics..." >> $MAINT_LOG
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    schemaname,
    tablename,
    n_tup_ins,
    n_tup_upd,
    n_tup_del,
    n_dead_tup
FROM pg_stat_user_tables
ORDER BY schemaname, tablename;
" >> $MAINT_LOG

# 7. Check for database bloat
echo "[$TIMESTAMP] Checking for database bloat..." >> $MAINT_LOG
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
" >> $MAINT_LOG

# 8. Performance index analysis
echo "[$TIMESTAMP] Analyzing index performance..." >> $MAINT_LOG
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_tup_read > 0
ORDER BY idx_tup_read DESC;
" >> $MAINT_LOG

# 9. Backup validation
echo "[$TIMESTAMP] Validating recent backups..." >> $MAINT_LOG
LATEST_BACKUP=$(ls -t /home/ridgetop/aidis/backups/*.sql 2>/dev/null | head -1)
if [ -n "$LATEST_BACKUP" ]; then
    BACKUP_AGE=$(find "$LATEST_BACKUP" -mtime +7)
    if [ -n "$BACKUP_AGE" ]; then
        echo "[$TIMESTAMP] ⚠️ Warning: Latest backup is older than 7 days" >> $MAINT_LOG
        /home/ridgetop/aidis/scripts/send-alert.sh "Backup Warning" "Latest backup is older than 7 days: $LATEST_BACKUP"
    else
        echo "[$TIMESTAMP] ✅ Recent backup found: $LATEST_BACKUP" >> $MAINT_LOG
    fi
else
    echo "[$TIMESTAMP] ❌ No backups found" >> $MAINT_LOG
    /home/ridgetop/aidis/scripts/send-alert.sh "Backup Critical" "No database backups found"
fi

# 10. System resource cleanup
echo "[$TIMESTAMP] Cleaning up system resources..." >> $MAINT_LOG
# Clean up old log files (keep 30 days)
find /home/ridgetop/aidis/logs -name "*.log" -mtime +30 -delete
# Clean up old reports (keep 30 days)  
find /home/ridgetop/aidis/logs -name "daily-report-*.log" -mtime +30 -delete

echo "[$TIMESTAMP] Weekly maintenance completed." >> $MAINT_LOG

# Send maintenance summary
/home/ridgetop/aidis/scripts/send-alert.sh "Weekly Maintenance Complete" "Maintenance completed. Deleted $DELETED_SESSIONS sessions and $DELETED_CONTEXTS contexts. Check $MAINT_LOG for details."
EOF

# Make maintenance script executable
chmod +x /home/ridgetop/aidis/scripts/weekly-maintenance.sh
```

### **Database Backup Procedures**

#### **Automated Backup Script**
```bash
# Create backup script
cat > /home/ridgetop/aidis/scripts/backup-database.sh << 'EOF'
#!/bin/bash

# AIDIS Database Backup Script

BACKUP_DIR="/home/ridgetop/aidis/backups"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/aidis-backup-$TIMESTAMP.sql"
LOG_FILE="/home/ridgetop/aidis/logs/backup.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting database backup..." >> $LOG_FILE

# Create backup directory if it doesn't exist
mkdir -p $BACKUP_DIR

# Create backup with compression
pg_dump -h localhost -U ridgetop -d aidis_production \
    --verbose \
    --format=custom \
    --compress=9 \
    --file="$BACKUP_FILE.custom" 2>> $LOG_FILE

# Also create plain SQL backup for easy inspection
pg_dump -h localhost -U ridgetop -d aidis_production > "$BACKUP_FILE" 2>> $LOG_FILE

if [ $? -eq 0 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Backup completed: $BACKUP_FILE" >> $LOG_FILE
    
    # Compress the plain SQL backup
    gzip "$BACKUP_FILE"
    
    # Get backup size
    BACKUP_SIZE=$(du -h "$BACKUP_FILE.gz" | cut -f1)
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup size: $BACKUP_SIZE" >> $LOG_FILE
    
    # Clean up old backups (keep 30 days)
    find $BACKUP_DIR -name "aidis-backup-*.sql.gz" -mtime +30 -delete
    find $BACKUP_DIR -name "aidis-backup-*.sql.custom" -mtime +30 -delete
    
    # Verify backup integrity
    pg_restore --list "$BACKUP_FILE.custom" >/dev/null 2>&1
    if [ $? -eq 0 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Backup integrity verified" >> $LOG_FILE
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Backup integrity check failed" >> $LOG_FILE
        /home/ridgetop/aidis/scripts/send-alert.sh "Backup Critical" "Backup integrity check failed: $BACKUP_FILE"
    fi
    
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ❌ Backup failed" >> $LOG_FILE
    /home/ridgetop/aidis/scripts/send-alert.sh "Backup Critical" "Database backup failed"
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup process completed." >> $LOG_FILE
EOF

# Make backup script executable
chmod +x /home/ridgetop/aidis/scripts/backup-database.sh

# Add daily backup to cron (run at 1 AM)
(crontab -l 2>/dev/null; echo "0 1 * * * /home/ridgetop/aidis/scripts/backup-database.sh") | crontab -
```

### **System Update Procedures**

#### **Application Update Script**
```bash
# Create application update script
cat > /home/ridgetop/aidis/scripts/update-application.sh << 'EOF'
#!/bin/bash

# AIDIS Application Update Script

UPDATE_LOG="/home/ridgetop/aidis/logs/update-$(date +%Y%m%d-%H%M%S).log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Starting application update..." >> $UPDATE_LOG

# 1. Create backup before update
echo "[$TIMESTAMP] Creating backup before update..." >> $UPDATE_LOG
/home/ridgetop/aidis/scripts/backup-database.sh >> $UPDATE_LOG 2>&1

# 2. Stop the service
echo "[$TIMESTAMP] Stopping AIDIS service..." >> $UPDATE_LOG
sudo systemctl stop aidis-production.service

# 3. Update application code
echo "[$TIMESTAMP] Updating application code..." >> $UPDATE_LOG
cd /home/ridgetop/aidis
git stash push -m "Pre-update stash $(date +%Y%m%d-%H%M%S)"
git pull origin main >> $UPDATE_LOG 2>&1

# 4. Update dependencies
echo "[$TIMESTAMP] Updating dependencies..." >> $UPDATE_LOG
cd mcp-server
npm ci --only=production >> $UPDATE_LOG 2>&1

# 5. Run database migrations if any
echo "[$TIMESTAMP] Running database migrations..." >> $UPDATE_LOG
npm run migrate >> $UPDATE_LOG 2>&1

# 6. Build application
echo "[$TIMESTAMP] Building application..." >> $UPDATE_LOG
npm run build >> $UPDATE_LOG 2>&1

# 7. Start service
echo "[$TIMESTAMP] Starting AIDIS service..." >> $UPDATE_LOG
sudo systemctl start aidis-production.service

# 8. Wait for service to start
sleep 10

# 9. Verify service is running
SERVICE_STATUS=$(systemctl is-active aidis-production.service)
if [ "$SERVICE_STATUS" = "active" ]; then
    echo "[$TIMESTAMP] ✅ Service started successfully" >> $UPDATE_LOG
    
    # 10. Run health check
    /home/ridgetop/aidis/scripts/system-health-monitor.sh >> $UPDATE_LOG 2>&1
    
    echo "[$TIMESTAMP] ✅ Application update completed successfully" >> $UPDATE_LOG
    /home/ridgetop/aidis/scripts/send-alert.sh "Update Success" "AIDIS application updated successfully"
else
    echo "[$TIMESTAMP] ❌ Service failed to start: $SERVICE_STATUS" >> $UPDATE_LOG
    /home/ridgetop/aidis/scripts/send-alert.sh "Update Critical" "AIDIS service failed to start after update: $SERVICE_STATUS"
fi

echo "[$TIMESTAMP] Update process completed." >> $UPDATE_LOG
EOF

# Make update script executable
chmod +x /home/ridgetop/aidis/scripts/update-application.sh
```

---

## 🚨 Troubleshooting Procedures

### **Common Issues and Solutions**

#### **Service Startup Issues**
```bash
# Create troubleshooting script for service issues
cat > /home/ridgetop/aidis/scripts/troubleshoot-service.sh << 'EOF'
#!/bin/bash

# AIDIS Service Troubleshooting Script

echo "🔍 AIDIS Service Troubleshooting"
echo "================================"

# 1. Check service status
echo "1. Service Status:"
systemctl status aidis-production.service --no-pager -l

echo ""
echo "2. Recent Service Logs:"
sudo journalctl -u aidis-production.service --no-pager -n 20

echo ""
echo "3. Configuration Check:"
if [ -f "/home/ridgetop/aidis/mcp-server/.env.production" ]; then
    echo "✅ Environment file exists"
    echo "Configuration (sensitive values hidden):"
    cat /home/ridgetop/aidis/mcp-server/.env.production | sed 's/PASSWORD=.*/PASSWORD=***HIDDEN***/' | sed 's/SECRET=.*/SECRET=***HIDDEN***/'
else
    echo "❌ Environment file missing: /home/ridgetop/aidis/mcp-server/.env.production"
fi

echo ""
echo "4. Database Connectivity:"
DB_STATUS=$(psql -h localhost -d aidis_production -U ridgetop -c "SELECT 'Connected';" -t 2>/dev/null | xargs)
if [ "$DB_STATUS" = "Connected" ]; then
    echo "✅ Database connection successful"
else
    echo "❌ Database connection failed"
    echo "Checking PostgreSQL service:"
    systemctl status postgresql --no-pager -l
fi

echo ""
echo "5. Port Availability:"
PORT_3001=$(netstat -tlnp | grep :3001)
if [ -n "$PORT_3001" ]; then
    echo "✅ Port 3001 is in use:"
    echo "$PORT_3001"
else
    echo "❌ Port 3001 is not in use"
fi

echo ""
echo "6. File Permissions:"
echo "Service files:"
ls -la /home/ridgetop/aidis/mcp-server/dist/server.js 2>/dev/null || echo "❌ server.js not found"
ls -la /home/ridgetop/aidis/mcp-server/.env.production 2>/dev/null || echo "❌ .env.production not found"

echo ""
echo "7. System Resources:"
echo "Memory usage:"
free -h
echo "Disk usage:"
df -h /
echo "CPU load:"
uptime

echo ""
echo "8. Manual Service Test:"
echo "To test manually, run:"
echo "cd /home/ridgetop/aidis/mcp-server"
echo "NODE_ENV=production node dist/server.js"
EOF

# Make troubleshooting script executable
chmod +x /home/ridgetop/aidis/scripts/troubleshoot-service.sh
```

#### **Database Performance Issues**
```bash
# Create database troubleshooting script
cat > /home/ridgetop/aidis/scripts/troubleshoot-database.sh << 'EOF'
#!/bin/bash

# AIDIS Database Troubleshooting Script

echo "🔍 AIDIS Database Troubleshooting"
echo "================================="

# 1. Database connection test
echo "1. Database Connection:"
psql -h localhost -d aidis_production -U ridgetop -c "SELECT version();" 2>/dev/null && echo "✅ Connection successful" || echo "❌ Connection failed"

echo ""
echo "2. Database Statistics:"
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    'Projects' as table_name, COUNT(*) as count, pg_size_pretty(pg_total_relation_size('projects')) as size
FROM projects
UNION ALL
SELECT 
    'Sessions' as table_name, COUNT(*) as count, pg_size_pretty(pg_total_relation_size('sessions')) as size
FROM sessions
UNION ALL
SELECT 
    'Contexts' as table_name, COUNT(*) as count, pg_size_pretty(pg_total_relation_size('contexts')) as size
FROM contexts;
"

echo ""
echo "3. Active Connections:"
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    count(*) as total_connections,
    count(*) FILTER (WHERE state = 'active') as active_connections,
    count(*) FILTER (WHERE state = 'idle') as idle_connections
FROM pg_stat_activity 
WHERE datname = 'aidis_production';
"

echo ""
echo "4. Long Running Queries:"
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query,
    state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
AND query != '<IDLE>'
ORDER BY duration DESC;
"

echo ""
echo "5. Lock Analysis:"
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    blocked_locks.pid AS blocked_pid,
    blocked_activity.usename AS blocked_user,
    blocking_locks.pid AS blocking_pid,
    blocking_activity.usename AS blocking_user,
    blocked_activity.query AS blocked_statement,
    blocking_activity.query AS current_statement_in_blocking_process
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
    ON blocking_locks.locktype = blocked_locks.locktype
    AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
    AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
    AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
    AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
    AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
    AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
    AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
    AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
    AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
    AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;
"

echo ""
echo "6. Index Usage:"
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_tup_read/NULLIF(idx_tup_fetch, 0) as ratio
FROM pg_stat_user_indexes
WHERE idx_tup_read > 0
ORDER BY idx_tup_read DESC
LIMIT 10;
"

echo ""
echo "7. Table Bloat Check:"
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    schemaname,
    tablename,
    n_dead_tup,
    n_live_tup,
    round(n_dead_tup::numeric / NULLIF(n_live_tup, 0) * 100, 2) as bloat_percentage
FROM pg_stat_user_tables
WHERE n_dead_tup > 100
ORDER BY bloat_percentage DESC NULLS LAST;
"

echo ""
echo "8. Recent Vacuum/Analyze:"
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    schemaname,
    tablename,
    last_vacuum,
    last_autovacuum,
    last_analyze,
    last_autoanalyze
FROM pg_stat_user_tables
ORDER BY greatest(last_vacuum, last_autovacuum, last_analyze, last_autoanalyze) DESC NULLS LAST;
"
EOF

# Make database troubleshooting script executable
chmod +x /home/ridgetop/aidis/scripts/troubleshoot-database.sh
```

#### **Performance Troubleshooting**
```bash
# Create performance troubleshooting script
cat > /home/ridgetop/aidis/scripts/troubleshoot-performance.sh << 'EOF'
#!/bin/bash

# AIDIS Performance Troubleshooting Script

echo "🔍 AIDIS Performance Troubleshooting"
echo "===================================="

# 1. System Resource Usage
echo "1. System Resources:"
echo "CPU Usage:"
top -bn1 | grep "Cpu(s)"
echo ""
echo "Memory Usage:"
free -h
echo ""
echo "Disk Usage:"
df -h /
echo ""
echo "I/O Statistics:"
iostat -x 1 1 2>/dev/null || echo "iostat not available"

echo ""
echo "2. AIDIS Process Information:"
ps aux | grep -E "(node|aidis)" | grep -v grep

echo ""
echo "3. Network Connections:"
netstat -tlnp | grep -E "(3001|5432)"

echo ""
echo "4. Performance Test - Session Creation:"
START_TIME=$(date +%s%3N)
TEST_SESSION_ID="perf-test-$(date +%s)"

# Create test session
psql -h localhost -d aidis_production -U ridgetop -c "
INSERT INTO sessions (id, project_id, agent_type, started_at, title) 
SELECT '$TEST_SESSION_ID', id, 'performance-test', NOW(), 'Performance Test'
FROM projects WHERE name = 'System Default' LIMIT 1;
" >/dev/null 2>&1

END_TIME=$(date +%s%3N)
DURATION=$((END_TIME - START_TIME))

echo "Session creation time: ${DURATION}ms (target: <50ms)"

if [ $DURATION -lt 50 ]; then
    echo "✅ Performance within target"
else
    echo "❌ Performance below target"
fi

# Clean up test session
psql -h localhost -d aidis_production -U ridgetop -c "DELETE FROM sessions WHERE id = '$TEST_SESSION_ID';" >/dev/null 2>&1

echo ""
echo "5. Database Query Performance:"
psql -h localhost -d aidis_production -U ridgetop -c "\timing on" -c "EXPLAIN ANALYZE SELECT COUNT(*) FROM sessions;"

echo ""
echo "6. Recent Error Analysis:"
echo "Service errors (last hour):"
ERROR_COUNT=$(sudo journalctl -u aidis-production.service --since "1 hour ago" -p err --no-pager -q | wc -l)
echo "Error count: $ERROR_COUNT"

if [ $ERROR_COUNT -gt 0 ]; then
    echo "Recent errors:"
    sudo journalctl -u aidis-production.service --since "1 hour ago" -p err --no-pager -q | tail -5
fi

echo ""
echo "7. Memory Analysis:"
echo "Node.js processes:"
ps -eo pid,ppid,cmd,%mem,%cpu --sort=-%mem | grep node | head -5

echo ""
echo "8. Recommendations:"
if [ $DURATION -gt 50 ]; then
    echo "- Session creation is slow. Check database performance and indexes."
fi

if [ $(free | awk 'NR==2{printf "%.0f", $3*100/($3+$4+$5)}') -gt 80 ]; then
    echo "- High memory usage detected. Consider optimizing or adding more RAM."
fi

if [ $ERROR_COUNT -gt 10 ]; then
    echo "- High error rate detected. Check service logs for issues."
fi
EOF

# Make performance troubleshooting script executable
chmod +x /home/ridgetop/aidis/scripts/troubleshoot-performance.sh
```

---

## 🚨 Emergency Response Procedures

### **Incident Response Plan**

#### **Service Down Emergency Response**
```bash
# Create emergency response script
cat > /home/ridgetop/aidis/scripts/emergency-response.sh << 'EOF'
#!/bin/bash

# AIDIS Emergency Response Script

EMERGENCY_LOG="/home/ridgetop/aidis/logs/emergency-$(date +%Y%m%d-%H%M%S).log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] 🚨 EMERGENCY RESPONSE INITIATED" >> $EMERGENCY_LOG

# Determine the type of emergency
SERVICE_STATUS=$(systemctl is-active aidis-production.service)
DB_STATUS=$(psql -h localhost -d aidis_production -U ridgetop -c "SELECT 'OK';" -t 2>/dev/null | xargs)

echo "[$TIMESTAMP] Service Status: $SERVICE_STATUS" >> $EMERGENCY_LOG
echo "[$TIMESTAMP] Database Status: $DB_STATUS" >> $EMERGENCY_LOG

# Emergency Response: Service Down
if [ "$SERVICE_STATUS" != "active" ]; then
    echo "[$TIMESTAMP] 🚨 SERVICE DOWN - Initiating recovery..." >> $EMERGENCY_LOG
    
    # Step 1: Try to restart the service
    echo "[$TIMESTAMP] Attempting service restart..." >> $EMERGENCY_LOG
    sudo systemctl restart aidis-production.service
    sleep 10
    
    # Check if restart was successful
    NEW_STATUS=$(systemctl is-active aidis-production.service)
    if [ "$NEW_STATUS" = "active" ]; then
        echo "[$TIMESTAMP] ✅ Service restart successful" >> $EMERGENCY_LOG
        /home/ridgetop/aidis/scripts/send-alert.sh "Emergency Recovery Success" "AIDIS service restarted successfully"
    else
        echo "[$TIMESTAMP] ❌ Service restart failed, investigating..." >> $EMERGENCY_LOG
        
        # Step 2: Check for common issues
        echo "[$TIMESTAMP] Checking for common issues..." >> $EMERGENCY_LOG
        
        # Check disk space
        DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
        if [ "$DISK_USAGE" -gt 95 ]; then
            echo "[$TIMESTAMP] 🚨 CRITICAL: Disk space at ${DISK_USAGE}%" >> $EMERGENCY_LOG
            # Emergency disk cleanup
            find /home/ridgetop/aidis/logs -name "*.log" -mtime +7 -delete
            find /tmp -name "*.tmp" -mtime +1 -delete
        fi
        
        # Check memory
        MEMORY_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/($3+$4+$5)}')
        if [ "$MEMORY_USAGE" -gt 95 ]; then
            echo "[$TIMESTAMP] 🚨 CRITICAL: Memory usage at ${MEMORY_USAGE}%" >> $EMERGENCY_LOG
            # Kill any non-essential processes
            pkill -f "chrome\|firefox" 2>/dev/null || true
        fi
        
        # Step 3: Try manual start with debugging
        echo "[$TIMESTAMP] Attempting manual start for debugging..." >> $EMERGENCY_LOG
        cd /home/ridgetop/aidis/mcp-server
        timeout 30 node dist/server.js >> $EMERGENCY_LOG 2>&1 &
        MANUAL_PID=$!
        sleep 10
        
        if ps -p $MANUAL_PID > /dev/null; then
            echo "[$TIMESTAMP] Manual start successful, updating systemd..." >> $EMERGENCY_LOG
            kill $MANUAL_PID
            sudo systemctl start aidis-production.service
        else
            echo "[$TIMESTAMP] ❌ Manual start failed, escalating..." >> $EMERGENCY_LOG
            /home/ridgetop/aidis/scripts/send-alert.sh "Emergency Critical" "Unable to restart AIDIS service. Manual intervention required."
        fi
    fi
fi

# Emergency Response: Database Down
if [ "$DB_STATUS" != "OK" ]; then
    echo "[$TIMESTAMP] 🚨 DATABASE DOWN - Initiating recovery..." >> $EMERGENCY_LOG
    
    # Check PostgreSQL service
    PG_STATUS=$(systemctl is-active postgresql)
    if [ "$PG_STATUS" != "active" ]; then
        echo "[$TIMESTAMP] PostgreSQL service is down, restarting..." >> $EMERGENCY_LOG
        sudo systemctl restart postgresql
        sleep 15
        
        # Recheck database connection
        DB_STATUS=$(psql -h localhost -d aidis_production -U ridgetop -c "SELECT 'OK';" -t 2>/dev/null | xargs)
        if [ "$DB_STATUS" = "OK" ]; then
            echo "[$TIMESTAMP] ✅ Database recovery successful" >> $EMERGENCY_LOG
            # Restart AIDIS service
            sudo systemctl restart aidis-production.service
        else
            echo "[$TIMESTAMP] ❌ Database recovery failed" >> $EMERGENCY_LOG
            /home/ridgetop/aidis/scripts/send-alert.sh "Emergency Critical" "Database recovery failed. Immediate intervention required."
        fi
    else
        echo "[$TIMESTAMP] PostgreSQL service running but connection failed" >> $EMERGENCY_LOG
        /home/ridgetop/aidis/scripts/send-alert.sh "Emergency Critical" "Database connection failed despite service running. Check database integrity."
    fi
fi

# Final status check
FINAL_SERVICE_STATUS=$(systemctl is-active aidis-production.service)
FINAL_DB_STATUS=$(psql -h localhost -d aidis_production -U ridgetop -c "SELECT 'OK';" -t 2>/dev/null | xargs)

echo "[$TIMESTAMP] Final Status - Service: $FINAL_SERVICE_STATUS, Database: $FINAL_DB_STATUS" >> $EMERGENCY_LOG

if [ "$FINAL_SERVICE_STATUS" = "active" ] && [ "$FINAL_DB_STATUS" = "OK" ]; then
    echo "[$TIMESTAMP] ✅ EMERGENCY RESPONSE SUCCESSFUL" >> $EMERGENCY_LOG
    /home/ridgetop/aidis/scripts/send-alert.sh "Emergency Resolution" "AIDIS system recovered successfully"
    
    # Run health check to verify full recovery
    /home/ridgetop/aidis/scripts/system-health-monitor.sh >> $EMERGENCY_LOG 2>&1
else
    echo "[$TIMESTAMP] ❌ EMERGENCY RESPONSE INCOMPLETE" >> $EMERGENCY_LOG
    /home/ridgetop/aidis/scripts/send-alert.sh "Emergency Failed" "Unable to fully recover AIDIS system. Escalation required."
fi

echo "[$TIMESTAMP] Emergency response completed. Log: $EMERGENCY_LOG" >> $EMERGENCY_LOG
EOF

# Make emergency response script executable
chmod +x /home/ridgetop/aidis/scripts/emergency-response.sh
```

#### **Data Recovery Procedures**
```bash
# Create data recovery script
cat > /home/ridgetop/aidis/scripts/emergency-data-recovery.sh << 'EOF'
#!/bin/bash

# AIDIS Emergency Data Recovery Script

RECOVERY_LOG="/home/ridgetop/aidis/logs/data-recovery-$(date +%Y%m%d-%H%M%S).log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] 🚨 EMERGENCY DATA RECOVERY INITIATED" >> $RECOVERY_LOG

# Function to list available backups
list_backups() {
    echo "Available backups:" >> $RECOVERY_LOG
    ls -lath /home/ridgetop/aidis/backups/*.sql* 2>/dev/null | head -10 >> $RECOVERY_LOG
}

# Function to restore from backup
restore_backup() {
    local backup_file="$1"
    echo "[$TIMESTAMP] Restoring from backup: $backup_file" >> $RECOVERY_LOG
    
    # Create emergency backup of current state
    echo "[$TIMESTAMP] Creating emergency backup of current state..." >> $RECOVERY_LOG
    pg_dump -h localhost -U ridgetop aidis_production > "/home/ridgetop/aidis/backups/emergency-pre-restore-$(date +%Y%m%d-%H%M%S).sql"
    
    # Stop the service
    sudo systemctl stop aidis-production.service
    
    # Drop and recreate database
    psql -h localhost -U ridgetop -d postgres -c "DROP DATABASE IF EXISTS aidis_production;"
    psql -h localhost -U ridgetop -d postgres -c "CREATE DATABASE aidis_production;"
    
    # Restore from backup
    if [[ $backup_file == *.gz ]]; then
        gunzip -c "$backup_file" | psql -h localhost -U ridgetop aidis_production >> $RECOVERY_LOG 2>&1
    elif [[ $backup_file == *.custom ]]; then
        pg_restore -h localhost -U ridgetop -d aidis_production "$backup_file" >> $RECOVERY_LOG 2>&1
    else
        psql -h localhost -U ridgetop aidis_production < "$backup_file" >> $RECOVERY_LOG 2>&1
    fi
    
    if [ $? -eq 0 ]; then
        echo "[$TIMESTAMP] ✅ Database restore successful" >> $RECOVERY_LOG
        
        # Restart service
        sudo systemctl start aidis-production.service
        sleep 10
        
        # Verify service is working
        SERVICE_STATUS=$(systemctl is-active aidis-production.service)
        if [ "$SERVICE_STATUS" = "active" ]; then
            echo "[$TIMESTAMP] ✅ Service restart successful after recovery" >> $RECOVERY_LOG
            /home/ridgetop/aidis/scripts/send-alert.sh "Data Recovery Success" "Database restored from backup: $backup_file"
            return 0
        else
            echo "[$TIMESTAMP] ❌ Service failed to start after recovery" >> $RECOVERY_LOG
            return 1
        fi
    else
        echo "[$TIMESTAMP] ❌ Database restore failed" >> $RECOVERY_LOG
        return 1
    fi
}

# Check if backup file was specified
if [ -n "$1" ]; then
    BACKUP_FILE="$1"
    if [ -f "$BACKUP_FILE" ]; then
        restore_backup "$BACKUP_FILE"
    else
        echo "[$TIMESTAMP] ❌ Specified backup file not found: $BACKUP_FILE" >> $RECOVERY_LOG
        list_backups
    fi
else
    echo "[$TIMESTAMP] No backup file specified, listing available backups..." >> $RECOVERY_LOG
    list_backups
    
    # Auto-select most recent backup
    LATEST_BACKUP=$(ls -t /home/ridgetop/aidis/backups/*.sql* 2>/dev/null | head -1)
    if [ -n "$LATEST_BACKUP" ]; then
        echo "[$TIMESTAMP] Auto-selecting latest backup: $LATEST_BACKUP" >> $RECOVERY_LOG
        read -p "Restore from latest backup? (y/N): " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            restore_backup "$LATEST_BACKUP"
        else
            echo "[$TIMESTAMP] Recovery cancelled by user" >> $RECOVERY_LOG
        fi
    else
        echo "[$TIMESTAMP] ❌ No backups found" >> $RECOVERY_LOG
        /home/ridgetop/aidis/scripts/send-alert.sh "Recovery Critical" "No database backups available for recovery"
    fi
fi

echo "[$TIMESTAMP] Data recovery process completed. Log: $RECOVERY_LOG" >> $RECOVERY_LOG
EOF

# Make data recovery script executable
chmod +x /home/ridgetop/aidis/scripts/emergency-data-recovery.sh
```

---

## 📊 Performance Optimization

### **Database Performance Tuning**

#### **Index Optimization**
```sql
-- Performance optimization queries for database maintenance

-- 1. Find missing indexes on foreign keys
SELECT 
    c.conrelid::regclass AS table_name,
    'CREATE INDEX idx_' || c.conrelid::regclass || '_' || a.attname || ' ON ' || c.conrelid::regclass || '(' || a.attname || ');' AS suggested_index
FROM pg_constraint c
JOIN pg_attribute a ON a.attnum = ANY(c.conkey) AND a.attrelid = c.conrelid
WHERE c.contype = 'f'
AND NOT EXISTS (
    SELECT 1 FROM pg_index i
    WHERE i.indrelid = c.conrelid
    AND a.attnum = ANY(i.indkey)
);

-- 2. Find unused indexes (run periodically to identify unused indexes)
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_tup_read = 0 AND idx_tup_fetch = 0
ORDER BY schemaname, tablename, indexname;

-- 3. Find tables that need frequent full scans (candidates for indexing)
SELECT 
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    seq_tup_read / NULLIF(seq_scan, 0) AS avg_seq_read
FROM pg_stat_user_tables
WHERE seq_scan > 0
ORDER BY seq_tup_read DESC;
```

#### **Query Performance Monitoring**
```bash
# Create query performance monitoring script
cat > /home/ridgetop/aidis/scripts/monitor-query-performance.sh << 'EOF'
#!/bin/bash

# AIDIS Query Performance Monitor

PERF_LOG="/home/ridgetop/aidis/logs/query-performance-$(date +%Y%m%d).log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Query Performance Analysis" >> $PERF_LOG
echo "======================================" >> $PERF_LOG

# 1. Slowest queries
echo "[$TIMESTAMP] Top 10 Slowest Queries:" >> $PERF_LOG
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    rows
FROM pg_stat_statements 
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY mean_time DESC 
LIMIT 10;
" >> $PERF_LOG 2>/dev/null || echo "pg_stat_statements extension not available" >> $PERF_LOG

# 2. Most frequently executed queries
echo "[$TIMESTAMP] Top 10 Most Frequent Queries:" >> $PERF_LOG
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    query,
    calls,
    total_time,
    mean_time
FROM pg_stat_statements 
WHERE query NOT LIKE '%pg_stat_statements%'
ORDER BY calls DESC 
LIMIT 10;
" >> $PERF_LOG 2>/dev/null || echo "pg_stat_statements extension not available" >> $PERF_LOG

# 3. Table access patterns
echo "[$TIMESTAMP] Table Access Patterns:" >> $PERF_LOG
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    schemaname,
    tablename,
    seq_scan,
    seq_tup_read,
    idx_scan,
    idx_tup_fetch,
    n_tup_ins,
    n_tup_upd,
    n_tup_del
FROM pg_stat_user_tables
ORDER BY seq_tup_read DESC;
" >> $PERF_LOG

# 4. Index effectiveness
echo "[$TIMESTAMP] Index Effectiveness:" >> $PERF_LOG
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    t.schemaname,
    t.tablename,
    i.indexname,
    i.idx_tup_read,
    i.idx_tup_fetch,
    CASE WHEN i.idx_tup_read = 0 THEN 0 
         ELSE round(i.idx_tup_fetch::numeric / i.idx_tup_read * 100, 2) 
    END AS hit_ratio
FROM pg_stat_user_tables t
JOIN pg_stat_user_indexes i ON t.tablename = i.tablename
WHERE i.idx_tup_read > 0
ORDER BY hit_ratio DESC;
" >> $PERF_LOG

echo "[$TIMESTAMP] Query performance analysis completed." >> $PERF_LOG
EOF

# Make query performance script executable
chmod +x /home/ridgetop/aidis/scripts/monitor-query-performance.sh
```

### **Application Performance Optimization**

#### **Node.js Performance Monitoring**
```bash
# Create Node.js performance monitoring script
cat > /home/ridgetop/aidis/scripts/monitor-nodejs-performance.sh << 'EOF'
#!/bin/bash

# Node.js Performance Monitor for AIDIS

NODE_PERF_LOG="/home/ridgetop/aidis/logs/nodejs-performance-$(date +%Y%m%d).log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "[$TIMESTAMP] Node.js Performance Analysis" >> $NODE_PERF_LOG
echo "=========================================" >> $NODE_PERF_LOG

# 1. Process information
echo "[$TIMESTAMP] Process Information:" >> $NODE_PERF_LOG
ps aux | grep "node.*server.js" | grep -v grep >> $NODE_PERF_LOG

# 2. Memory usage details
echo "[$TIMESTAMP] Memory Usage Details:" >> $NODE_PERF_LOG
if pgrep -f "node.*server.js" > /dev/null; then
    NODE_PID=$(pgrep -f "node.*server.js")
    cat /proc/$NODE_PID/status | grep -E "(VmSize|VmRSS|VmData|VmStk|VmExe)" >> $NODE_PERF_LOG
    
    # Memory breakdown if possible
    if command -v smem &> /dev/null; then
        echo "Memory breakdown:" >> $NODE_PERF_LOG
        smem -p | grep node >> $NODE_PERF_LOG
    fi
else
    echo "Node.js process not found" >> $NODE_PERF_LOG
fi

# 3. File descriptor usage
echo "[$TIMESTAMP] File Descriptor Usage:" >> $NODE_PERF_LOG
if [ -n "$NODE_PID" ]; then
    FD_COUNT=$(ls -1 /proc/$NODE_PID/fd 2>/dev/null | wc -l)
    echo "Open file descriptors: $FD_COUNT" >> $NODE_PERF_LOG
    
    # Show file descriptor types
    echo "File descriptor types:" >> $NODE_PERF_LOG
    for fd in /proc/$NODE_PID/fd/*; do
        if [ -L "$fd" ]; then
            readlink "$fd" 2>/dev/null
        fi
    done | sort | uniq -c | head -10 >> $NODE_PERF_LOG
fi

# 4. Event loop lag simulation (if available)
echo "[$TIMESTAMP] Event Loop Performance Test:" >> $NODE_PERF_LOG
timeout 10 node -e "
const start = process.hrtime.bigint();
setImmediate(() => {
  const lag = Number(process.hrtime.bigint() - start) / 1e6;
  console.log('Event loop lag: ' + lag.toFixed(2) + 'ms');
});
setTimeout(() => process.exit(0), 1000);
" >> $NODE_PERF_LOG 2>&1

# 5. Garbage collection impact (basic estimation)
echo "[$TIMESTAMP] Memory Growth Analysis:" >> $NODE_PERF_LOG
if [ -n "$NODE_PID" ]; then
    INITIAL_MEM=$(cat /proc/$NODE_PID/status | grep VmRSS | awk '{print $2}')
    sleep 10
    FINAL_MEM=$(cat /proc/$NODE_PID/status | grep VmRSS | awk '{print $2}' 2>/dev/null || echo $INITIAL_MEM)
    MEM_GROWTH=$((FINAL_MEM - INITIAL_MEM))
    echo "Memory growth over 10s: ${MEM_GROWTH}KB" >> $NODE_PERF_LOG
fi

# 6. Network connections
echo "[$TIMESTAMP] Network Connections:" >> $NODE_PERF_LOG
netstat -np 2>/dev/null | grep "$NODE_PID" | head -10 >> $NODE_PERF_LOG 2>/dev/null || echo "Network info not available" >> $NODE_PERF_LOG

echo "[$TIMESTAMP] Node.js performance analysis completed." >> $NODE_PERF_LOG
EOF

# Make Node.js performance script executable
chmod +x /home/ridgetop/aidis/scripts/monitor-nodejs-performance.sh
```

---

## 📋 Operational Checklists

### **Daily Operations Checklist**
```bash
# Create daily operations checklist script
cat > /home/ridgetop/aidis/scripts/daily-operations-checklist.sh << 'EOF'
#!/bin/bash

# Daily Operations Checklist for AIDIS

CHECKLIST_LOG="/home/ridgetop/aidis/logs/daily-checklist-$(date +%Y%m%d).log"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "AIDIS Daily Operations Checklist - $TIMESTAMP" > $CHECKLIST_LOG
echo "=============================================" >> $CHECKLIST_LOG

# Function to check and log result
check_item() {
    local description="$1"
    local command="$2"
    local expected="$3"
    
    echo -n "[$TIMESTAMP] $description: " >> $CHECKLIST_LOG
    
    result=$(eval "$command" 2>/dev/null)
    
    if [[ "$result" == "$expected" ]] || [[ -z "$expected" && -n "$result" ]]; then
        echo "✅ PASS" >> $CHECKLIST_LOG
        return 0
    else
        echo "❌ FAIL ($result)" >> $CHECKLIST_LOG
        return 1
    fi
}

# Initialize counters
TOTAL_CHECKS=0
PASSED_CHECKS=0

# Service Status Checks
echo "" >> $CHECKLIST_LOG
echo "SERVICE STATUS CHECKS:" >> $CHECKLIST_LOG
echo "=====================" >> $CHECKLIST_LOG

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
if check_item "AIDIS service is active" "systemctl is-active aidis-production.service" "active"; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
if check_item "PostgreSQL service is active" "systemctl is-active postgresql" "active"; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

# Connectivity Checks
echo "" >> $CHECKLIST_LOG
echo "CONNECTIVITY CHECKS:" >> $CHECKLIST_LOG
echo "===================" >> $CHECKLIST_LOG

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
if check_item "Database connection successful" "psql -h localhost -d aidis_production -U ridgetop -c 'SELECT 1' -t | xargs" "1"; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
if check_item "Port 3001 is listening" "netstat -tlnp | grep :3001 | wc -l" "1"; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

# Data Integrity Checks
echo "" >> $CHECKLIST_LOG
echo "DATA INTEGRITY CHECKS:" >> $CHECKLIST_LOG
echo "======================" >> $CHECKLIST_LOG

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
if check_item "Projects table accessible" "psql -h localhost -d aidis_production -U ridgetop -c 'SELECT COUNT(*) FROM projects' -t | xargs | grep -E '^[0-9]+$'" ""; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
if check_item "Sessions table accessible" "psql -h localhost -d aidis_production -U ridgetop -c 'SELECT COUNT(*) FROM sessions' -t | xargs | grep -E '^[0-9]+$'" ""; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
if check_item "System default project exists" "psql -h localhost -d aidis_production -U ridgetop -c \"SELECT COUNT(*) FROM projects WHERE name = 'System Default'\" -t | xargs" "1"; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

# Performance Checks
echo "" >> $CHECKLIST_LOG
echo "PERFORMANCE CHECKS:" >> $CHECKLIST_LOG
echo "==================" >> $CHECKLIST_LOG

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
MEMORY_USAGE=$(free | awk 'NR==2{printf "%.0f", $3*100/($3+$4+$5)}')
if [[ $MEMORY_USAGE -lt 80 ]]; then
    echo "[$TIMESTAMP] Memory usage under 80%: ✅ PASS ($MEMORY_USAGE%)" >> $CHECKLIST_LOG
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo "[$TIMESTAMP] Memory usage under 80%: ❌ FAIL ($MEMORY_USAGE%)" >> $CHECKLIST_LOG
fi

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [[ $DISK_USAGE -lt 85 ]]; then
    echo "[$TIMESTAMP] Disk usage under 85%: ✅ PASS ($DISK_USAGE%)" >> $CHECKLIST_LOG
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo "[$TIMESTAMP] Disk usage under 85%: ❌ FAIL ($DISK_USAGE%)" >> $CHECKLIST_LOG
fi

# Log File Checks
echo "" >> $CHECKLIST_LOG
echo "LOG FILE CHECKS:" >> $CHECKLIST_LOG
echo "===============" >> $CHECKLIST_LOG

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
if check_item "Log directory exists and writable" "test -w /home/ridgetop/aidis/logs && echo 'writable'" "writable"; then
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
fi

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
ERROR_COUNT=$(sudo journalctl -u aidis-production.service --since "24 hours ago" -p err --no-pager -q | wc -l)
if [[ $ERROR_COUNT -lt 10 ]]; then
    echo "[$TIMESTAMP] Error count last 24h under 10: ✅ PASS ($ERROR_COUNT errors)" >> $CHECKLIST_LOG
    PASSED_CHECKS=$((PASSED_CHECKS + 1))
else
    echo "[$TIMESTAMP] Error count last 24h under 10: ❌ FAIL ($ERROR_COUNT errors)" >> $CHECKLIST_LOG
fi

# Backup Checks
echo "" >> $CHECKLIST_LOG
echo "BACKUP CHECKS:" >> $CHECKLIST_LOG
echo "==============" >> $CHECKLIST_LOG

TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
LATEST_BACKUP=$(ls -t /home/ridgetop/aidis/backups/*.sql* 2>/dev/null | head -1)
if [[ -n "$LATEST_BACKUP" ]]; then
    BACKUP_AGE=$(find "$LATEST_BACKUP" -mtime -2)
    if [[ -n "$BACKUP_AGE" ]]; then
        echo "[$TIMESTAMP] Recent backup exists (within 2 days): ✅ PASS" >> $CHECKLIST_LOG
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        echo "[$TIMESTAMP] Recent backup exists (within 2 days): ❌ FAIL" >> $CHECKLIST_LOG
    fi
else
    echo "[$TIMESTAMP] Recent backup exists (within 2 days): ❌ FAIL (no backups)" >> $CHECKLIST_LOG
fi

# Summary
echo "" >> $CHECKLIST_LOG
echo "DAILY CHECKLIST SUMMARY:" >> $CHECKLIST_LOG
echo "========================" >> $CHECKLIST_LOG
echo "[$TIMESTAMP] Passed: $PASSED_CHECKS/$TOTAL_CHECKS checks" >> $CHECKLIST_LOG

SUCCESS_RATE=$(echo "scale=2; $PASSED_CHECKS * 100 / $TOTAL_CHECKS" | bc)
echo "[$TIMESTAMP] Success Rate: $SUCCESS_RATE%" >> $CHECKLIST_LOG

if [[ $PASSED_CHECKS -eq $TOTAL_CHECKS ]]; then
    echo "[$TIMESTAMP] ✅ ALL CHECKS PASSED - System healthy" >> $CHECKLIST_LOG
    ALERT_LEVEL="INFO"
    ALERT_MESSAGE="Daily checklist: All $TOTAL_CHECKS checks passed"
elif [[ $SUCCESS_RATE > 80 ]]; then
    echo "[$TIMESTAMP] ⚠️ SOME ISSUES DETECTED - Review required" >> $CHECKLIST_LOG
    ALERT_LEVEL="WARNING"
    ALERT_MESSAGE="Daily checklist: $PASSED_CHECKS/$TOTAL_CHECKS checks passed ($SUCCESS_RATE%)"
else
    echo "[$TIMESTAMP] ❌ MULTIPLE ISSUES DETECTED - Immediate attention required" >> $CHECKLIST_LOG
    ALERT_LEVEL="CRITICAL"
    ALERT_MESSAGE="Daily checklist: Only $PASSED_CHECKS/$TOTAL_CHECKS checks passed ($SUCCESS_RATE%)"
fi

# Send appropriate alert
/home/ridgetop/aidis/scripts/send-alert.sh "$ALERT_LEVEL: Daily Operations Checklist" "$ALERT_MESSAGE. Check $CHECKLIST_LOG for details."

echo "[$TIMESTAMP] Daily operations checklist completed." >> $CHECKLIST_LOG
EOF

# Make daily checklist script executable
chmod +x /home/ridgetop/aidis/scripts/daily-operations-checklist.sh
```

---

## 📞 Support and Documentation

### **Operational Contact Information**

#### **Emergency Contacts**
- **Primary System Administrator**: `ridgetop@localhost`
- **Database Administrator**: `ridgetop@localhost` 
- **Application Developer**: Reference TS015 documentation series
- **Emergency Escalation**: Follow emergency response procedures

#### **Support Resources**
- **System Documentation**: `/home/ridgetop/aidis/TS015_SESSION_MANAGEMENT_COMPLETE.md`
- **Deployment Guide**: `/home/ridgetop/aidis/TS015_PRODUCTION_DEPLOYMENT_GUIDE.md`
- **Issue Resolution**: `/home/ridgetop/aidis/TS015_INTEGRATION_ISSUES_RESOLUTION.md`
- **Operations Manual**: This document
- **Log Directory**: `/home/ridgetop/aidis/logs/`
- **Script Directory**: `/home/ridgetop/aidis/scripts/`

### **Operational Command Reference**

#### **Essential Commands**
```bash
# Service Management
sudo systemctl status aidis-production.service    # Check service status
sudo systemctl restart aidis-production.service   # Restart service
sudo systemctl stop aidis-production.service      # Stop service
sudo systemctl start aidis-production.service     # Start service

# Health Monitoring
/home/ridgetop/aidis/scripts/system-health-monitor.sh        # System health check
/home/ridgetop/aidis/scripts/performance-monitor.sh          # Performance check
/home/ridgetop/aidis/scripts/daily-operations-checklist.sh   # Daily checklist

# Database Operations
psql -h localhost -d aidis_production -U ridgetop             # Connect to database
/home/ridgetop/aidis/scripts/backup-database.sh              # Create backup
/home/ridgetop/aidis/scripts/troubleshoot-database.sh        # Database troubleshooting

# Emergency Response
/home/ridgetop/aidis/scripts/emergency-response.sh           # Emergency recovery
/home/ridgetop/aidis/scripts/emergency-data-recovery.sh      # Data recovery

# Maintenance
/home/ridgetop/aidis/scripts/weekly-maintenance.sh           # Weekly maintenance
/home/ridgetop/aidis/scripts/update-application.sh           # Application updates
```

---

**TS015 Operational Procedures Manual Status**: ✅ **COMPLETE**  
**Monitoring Systems**: ✅ **COMPREHENSIVE HEALTH & PERFORMANCE TRACKING**  
**Maintenance Procedures**: ✅ **AUTOMATED AND MANUAL PROCEDURES DOCUMENTED**  
**Troubleshooting Guides**: ✅ **DETAILED ISSUE RESOLUTION PROCEDURES**  
**Emergency Response**: ✅ **COMPLETE INCIDENT RESPONSE PLAN**  
**Performance Optimization**: ✅ **DATABASE AND APPLICATION TUNING PROCEDURES**  
**Operational Excellence**: ✅ **ENTERPRISE-GRADE OPERATIONS FRAMEWORK**
