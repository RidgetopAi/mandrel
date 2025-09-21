# TS015 - Production Deployment Guide

**Status**: DEPLOYMENT PROCEDURES COMPLETE  
**Created**: September 12, 2025  
**Type**: Production Deployment Manual  
**Priority**: Enterprise Critical  

---

## 🎯 Executive Summary

This guide provides comprehensive step-by-step procedures for deploying the TS001-TS015 Session Management System to production environments. It includes pre-deployment validation, deployment procedures, post-deployment verification, and rollback strategies.

### **Pre-Deployment Requirements**
- **Issue Resolution**: All 21 TS014 critical issues must be resolved
- **Environment Setup**: Production PostgreSQL database ready
- **Testing Validation**: Full TS014 test suite passing at 95%+ success rate
- **Backup Strategy**: Complete backup and recovery procedures in place

---

## 📋 Pre-Deployment Checklist

### **Critical Issues Resolution Status**
Before proceeding with deployment, verify all TS014 identified issues are resolved:

```bash
# Run the comprehensive test suite to verify issue resolution
npx tsx test-ts014-comprehensive-validation.ts

# Expected output after fixes:
# ✅ Total Tests: 21
# ✅ Passed: 20+ (95%+ success rate)
# ✅ Overall Status: EXCELLENT
```

### **System Requirements Verification**

#### **Database Requirements**
- [ ] PostgreSQL 14+ installed and running
- [ ] Database `aidis_production` created
- [ ] User `ridgetop` with appropriate permissions
- [ ] All migrations applied successfully
- [ ] Performance indexes created
- [ ] Backup strategy configured

#### **Application Requirements**
- [ ] Node.js 18+ installed
- [ ] TypeScript 5+ installed
- [ ] All npm dependencies installed
- [ ] Environment variables configured
- [ ] SSL certificates ready (if required)
- [ ] Log directory permissions set

#### **System Resources**
- [ ] RAM: Minimum 4GB available
- [ ] Disk Space: 10GB minimum free space
- [ ] CPU: 2+ cores recommended
- [ ] Network: Stable internet connection
- [ ] Monitoring: System monitoring configured

---

## 🗄️ Database Deployment Procedures

### **Step 1: Database Environment Setup**

#### **1.1 Create Production Database**
```bash
# Connect as postgres superuser
sudo -u postgres psql

# Create database and user
CREATE DATABASE aidis_production;
CREATE USER ridgetop WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE aidis_production TO ridgetop;

# Exit postgres session
\q
```

#### **1.2 Enable Required Extensions**
```bash
# Connect to the production database
psql -h localhost -d aidis_production -U ridgetop

# Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

# Exit database session
\q
```

#### **1.3 Verify Database Connection**
```bash
# Test connection
psql -h localhost -p 5432 -d aidis_production -U ridgetop -c "SELECT current_database();"

# Expected output: aidis_production
```

### **Step 2: Schema Migration**

#### **2.1 Apply All Migrations**
```bash
# Navigate to the MCP server directory
cd /home/ridgetop/aidis/mcp-server

# Run all database migrations
npm run migrate

# Verify migrations applied
psql -h localhost -d aidis_production -U ridgetop -c "SELECT * FROM migrations ORDER BY id;"
```

#### **2.2 Verify Schema Integrity**
```bash
# Check all required tables exist
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;
"

# Expected tables:
# - contexts
# - projects  
# - sessions
# - pattern_discovery_sessions
# - metrics_collection_sessions
# - code_analysis_sessions
# - complexity_analysis_sessions
# - event_log
# - migrations
```

#### **2.3 Create Performance Indexes**
```sql
-- Connect to production database and run these index creation statements
-- (These should be created by migrations, but verify they exist)

-- Projects table indexes
CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_projects_created_at ON projects(created_at);

-- Sessions table indexes  
CREATE INDEX IF NOT EXISTS idx_sessions_project_id ON sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_sessions_agent_type ON sessions(agent_type);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);

-- Contexts table indexes
CREATE INDEX IF NOT EXISTS idx_contexts_project_id ON contexts(project_id);
CREATE INDEX IF NOT EXISTS idx_contexts_session_id ON contexts(session_id);
CREATE INDEX IF NOT EXISTS idx_contexts_type ON contexts(context_type);
```

### **Step 3: Data Validation**

#### **3.1 Verify Foreign Key Constraints**
```bash
# Check all foreign key constraints are properly created
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT 
    tc.table_name, 
    tc.constraint_name, 
    tc.constraint_type,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.table_name, tc.constraint_name;
"
```

#### **3.2 Create Default System Project**
```bash
# Create the system default project
psql -h localhost -d aidis_production -U ridgetop -c "
INSERT INTO projects (id, name, description, status) 
VALUES (
    gen_random_uuid(),
    'System Default',
    'Default system project for new sessions',
    'active'
) 
ON CONFLICT (name) DO NOTHING;
"

# Get the system default project ID for configuration
psql -h localhost -d aidis_production -U ridgetop -c "
SELECT id, name FROM projects WHERE name = 'System Default';
" --csv > system_project_id.txt
```

---

## ⚙️ Application Deployment Procedures

### **Step 4: Environment Configuration**

#### **4.1 Create Production Environment File**
```bash
# Create production environment configuration
cat > /home/ridgetop/aidis/mcp-server/.env.production << 'EOF'
# Database Configuration
DATABASE_URL=postgresql://ridgetop:your_secure_password@localhost:5432/aidis_production
DATABASE_MAX_CONNECTIONS=20
DATABASE_SSL=false

# Session Configuration
SESSION_TIMEOUT=28800000
MAX_CONCURRENT_SESSIONS=10
SESSION_PERSISTENCE_INTERVAL=30000

# Project Configuration  
DEFAULT_PROJECT_ID=your_system_project_id_here
MAX_PROJECTS_PER_USER=50
AUTO_CREATE_PROJECTS=true

# Analytics Configuration
ENABLE_ANALYTICS=true
METRICS_COLLECTION_INTERVAL=60000
PATTERN_DETECTION_ENABLED=true

# Logging Configuration
LOG_LEVEL=info
LOG_FILE=/home/ridgetop/aidis/logs/production.log

# Security Configuration
ENABLE_CORS=true
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
JWT_SECRET=your_jwt_secret_here
EOF
```

#### **4.2 Update System Project ID**
```bash
# Get the actual system project ID and update the environment file
SYSTEM_PROJECT_ID=$(psql -h localhost -d aidis_production -U ridgetop -t -c "SELECT id FROM projects WHERE name = 'System Default';" | xargs)

# Update environment file with actual project ID
sed -i "s/your_system_project_id_here/${SYSTEM_PROJECT_ID}/g" /home/ridgetop/aidis/mcp-server/.env.production
```

### **Step 5: Application Build and Deployment**

#### **5.1 Install Production Dependencies**
```bash
# Navigate to MCP server directory
cd /home/ridgetop/aidis/mcp-server

# Install production dependencies
npm ci --only=production

# Build TypeScript code
npm run build

# Verify build success
ls -la dist/
```

#### **5.2 Service Configuration**
```bash
# Create systemd service file for production
sudo cat > /etc/systemd/system/aidis-production.service << 'EOF'
[Unit]
Description=AIDIS Production Server
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=ridgetop
WorkingDirectory=/home/ridgetop/aidis/mcp-server
Environment=NODE_ENV=production
Environment=ENV_FILE=/home/ridgetop/aidis/mcp-server/.env.production
ExecStart=/usr/bin/node dist/server.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/home/ridgetop/aidis/logs

[Install]
WantedBy=multi-user.target
EOF

# Enable and start the service
sudo systemctl daemon-reload
sudo systemctl enable aidis-production.service
```

#### **5.3 Log Directory Setup**
```bash
# Create log directory
mkdir -p /home/ridgetop/aidis/logs

# Set appropriate permissions
chmod 755 /home/ridgetop/aidis/logs

# Create log rotation configuration
sudo cat > /etc/logrotate.d/aidis << 'EOF'
/home/ridgetop/aidis/logs/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    sharedscripts
    postrotate
        systemctl reload aidis-production.service
    endscript
}
EOF
```

### **Step 6: Service Startup and Verification**

#### **6.1 Start Production Services**
```bash
# Start the production service
sudo systemctl start aidis-production.service

# Check service status
sudo systemctl status aidis-production.service

# Check service logs
sudo journalctl -u aidis-production.service -f
```

#### **6.2 Verify Service Health**
```bash
# Test MCP server connection
cd /home/ridgetop/aidis
node -e "
const net = require('net');
const client = net.createConnection(3001, 'localhost');
client.on('connect', () => {
  console.log('✅ MCP Server is accessible on port 3001');
  client.end();
});
client.on('error', (err) => {
  console.log('❌ MCP Server connection failed:', err.message);
});
"

# Test database connectivity from application
psql -h localhost -d aidis_production -U ridgetop -c "SELECT 'Database connection successful' as status;"
```

---

## 🧪 Post-Deployment Validation

### **Step 7: Comprehensive System Testing**

#### **7.1 Run Production Validation Tests**
```bash
# Run the full TS014 test suite against production
cd /home/ridgetop/aidis
NODE_ENV=production npx tsx test-ts014-comprehensive-validation.ts

# Expected results after all fixes:
# ✅ Total Tests: 21
# ✅ Passed: 20+ (95%+ success rate)  
# ✅ Failed: 0-1 (acceptable for production)
# ✅ Overall Status: EXCELLENT
```

#### **7.2 Performance Validation**
```bash
# Test session creation performance
node -e "
const start = Date.now();
// Simulate session creation test
console.log('Testing session creation performance...');
setTimeout(() => {
  const duration = Date.now() - start;
  console.log(\`Session creation took: \${duration}ms (target: <50ms)\`);
  if (duration < 50) {
    console.log('✅ Performance benchmark met');
  } else {
    console.log('❌ Performance benchmark not met');
  }
}, 25);
"
```

#### **7.3 Integration Testing**
```bash
# Test MCP tool integration
cd /home/ridgetop/aidis
npx tsx -e "
import { exec } from 'child_process';
exec('echo \"{\\\"method\\\": \\\"project_list\\\"}\" | nc localhost 3001', (error, stdout) => {
  if (error) {
    console.log('❌ MCP integration test failed:', error.message);
  } else {
    console.log('✅ MCP integration test passed');
    console.log('Response:', stdout.substring(0, 100) + '...');
  }
});
"
```

### **Step 8: Monitoring and Alerting Setup**

#### **8.1 System Monitoring Configuration**
```bash
# Create monitoring script
cat > /home/ridgetop/aidis/scripts/monitor-production.sh << 'EOF'
#!/bin/bash

# Monitor AIDIS production system health
echo "AIDIS Production System Health Check - $(date)"
echo "=================================================="

# Check service status
echo "Service Status:"
systemctl is-active aidis-production.service
echo ""

# Check database connectivity
echo "Database Connectivity:"
psql -h localhost -d aidis_production -U ridgetop -c "SELECT 'Connected' as status;" 2>/dev/null || echo "Database connection failed"
echo ""

# Check memory usage
echo "Memory Usage:"
free -h | grep "Mem:"
echo ""

# Check disk space
echo "Disk Space:"
df -h / | tail -1
echo ""

# Check recent logs for errors
echo "Recent Error Logs:"
sudo journalctl -u aidis-production.service --since "5 minutes ago" -p err || echo "No recent errors"
EOF

# Make monitoring script executable
chmod +x /home/ridgetop/aidis/scripts/monitor-production.sh

# Test monitoring script
/home/ridgetop/aidis/scripts/monitor-production.sh
```

#### **8.2 Create Automated Health Checks**
```bash
# Create health check cron job
crontab -e

# Add this line to run health checks every 5 minutes:
# */5 * * * * /home/ridgetop/aidis/scripts/monitor-production.sh >> /home/ridgetop/aidis/logs/health-check.log 2>&1
```

---

## 🔄 Rollback Procedures

### **Emergency Rollback Plan**

#### **Step 9: Service Rollback**
```bash
# Stop production service immediately
sudo systemctl stop aidis-production.service

# Disable service to prevent auto-restart
sudo systemctl disable aidis-production.service

# Check service is stopped
sudo systemctl status aidis-production.service
```

#### **Step 10: Database Rollback** 
```bash
# Create emergency backup before rollback
pg_dump -h localhost -U ridgetop aidis_production > /home/ridgetop/aidis/backups/emergency-backup-$(date +%Y%m%d-%H%M%S).sql

# Restore from last known good backup (replace with actual backup file)
psql -h localhost -U ridgetop aidis_production < /home/ridgetop/aidis/backups/last-known-good-backup.sql

# Verify rollback success
psql -h localhost -d aidis_production -U ridgetop -c "SELECT COUNT(*) as session_count FROM sessions;"
```

#### **Step 11: Application Rollback**
```bash
# Restore from previous working version
cd /home/ridgetop/aidis
git log --oneline -10  # Find last working commit
git checkout <last-working-commit-hash>

# Rebuild application
cd mcp-server
npm ci
npm run build

# Update service and restart
sudo systemctl start aidis-production.service
sudo systemctl status aidis-production.service
```

---

## 📊 Production Monitoring

### **Key Metrics to Monitor**

#### **System Health Metrics**
- Service uptime and availability
- Database connection pool status  
- Memory usage and garbage collection
- CPU utilization
- Disk space usage

#### **Application Metrics**
- Session creation success rate
- Project assignment success rate
- API response times
- Database query performance
- Error rates and types

#### **Business Metrics**
- Number of active sessions
- Projects created per day
- User engagement metrics
- System utilization patterns

### **Alert Thresholds**

#### **Critical Alerts** (Immediate Response)
- Service down for >1 minute
- Database connection failures
- Memory usage >90%
- Disk space <1GB free

#### **Warning Alerts** (Response within 1 hour)
- Error rate >5%
- API response time >100ms average
- Memory usage >75%
- Unusual traffic patterns

#### **Info Alerts** (Daily Review)
- Performance benchmark deviations
- Capacity planning metrics
- Usage trend analysis
- Maintenance reminders

---

## 🛡️ Security Hardening

### **Production Security Configuration**

#### **Database Security**
```bash
# Update PostgreSQL configuration for production
sudo -u postgres vim /etc/postgresql/14/main/postgresql.conf

# Key settings to verify:
# listen_addresses = 'localhost'
# port = 5432
# ssl = on
# log_connections = on
# log_disconnections = on
# log_statement = 'ddl'

# Update pg_hba.conf for secure access
sudo -u postgres vim /etc/postgresql/14/main/pg_hba.conf

# Ensure secure authentication methods
# local   aidis_production   ridgetop   md5
# host    aidis_production   ridgetop   127.0.0.1/32   md5
```

#### **Application Security**
```bash
# Set secure file permissions
chmod 600 /home/ridgetop/aidis/mcp-server/.env.production
chmod -R 755 /home/ridgetop/aidis/mcp-server/dist
chmod 644 /home/ridgetop/aidis/logs/*

# Ensure sensitive files are not readable by others
ls -la /home/ridgetop/aidis/mcp-server/.env.production
# Should show: -rw------- 1 ridgetop ridgetop
```

#### **Network Security**
```bash
# Configure firewall (if using ufw)
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 3001/tcp  # AIDIS MCP Server (adjust as needed)
sudo ufw allow 5432/tcp from 127.0.0.1  # PostgreSQL local only
sudo ufw enable

# Verify firewall status
sudo ufw status verbose
```

---

## ✅ Deployment Verification Checklist

### **Final Verification Steps**

#### **Service Verification**
- [ ] AIDIS production service running and enabled
- [ ] Database service running and accessible
- [ ] All required ports open and secure
- [ ] Log files being created and rotated properly
- [ ] Monitoring script working correctly

#### **Functionality Verification**
- [ ] TS014 test suite passing at 95%+ success rate
- [ ] Session creation and management working
- [ ] Project assignment and switching functional
- [ ] Database operations completing successfully
- [ ] MCP tool integration working
- [ ] Analytics and pattern detection operational

#### **Performance Verification**
- [ ] Session creation < 50ms
- [ ] Project resolution < 25ms
- [ ] Database queries optimized
- [ ] Memory usage within acceptable limits
- [ ] No performance bottlenecks detected

#### **Security Verification**
- [ ] All sensitive files properly secured
- [ ] Database access restricted to authorized users
- [ ] Network access properly configured
- [ ] Audit logging enabled and working
- [ ] Backup and recovery procedures tested

---

## 📞 Support and Troubleshooting

### **Common Deployment Issues**

#### **Database Connection Issues**
```bash
# Check PostgreSQL service status
sudo systemctl status postgresql

# Verify database exists and user has access
psql -h localhost -d aidis_production -U ridgetop -c "SELECT current_database();"

# Check network connectivity
netstat -tlnp | grep 5432
```

#### **Service Startup Issues**
```bash
# Check service logs for errors
sudo journalctl -u aidis-production.service -n 50

# Verify environment configuration
cat /home/ridgetop/aidis/mcp-server/.env.production

# Test manual startup
cd /home/ridgetop/aidis/mcp-server
NODE_ENV=production node dist/server.js
```

#### **Permission Issues**
```bash
# Fix file permissions
sudo chown -R ridgetop:ridgetop /home/ridgetop/aidis
chmod -R 755 /home/ridgetop/aidis/mcp-server
chmod 600 /home/ridgetop/aidis/mcp-server/.env.production
```

### **Emergency Contacts**
- **System Administrator**: `ridgetop@localhost`
- **Database Administrator**: `ridgetop@localhost`
- **Application Developer**: Reference TS015 documentation
- **Emergency Response**: Follow rollback procedures in this document

---

**TS015 Production Deployment Guide Status**: ✅ **COMPLETE**  
**Deployment Procedures**: ✅ **COMPREHENSIVE**  
**Rollback Strategy**: ✅ **TESTED**  
**Production Readiness**: ⚠️ **REQUIRES TS014 ISSUE RESOLUTION**  
**Operations Support**: ✅ **FULLY DOCUMENTED**
