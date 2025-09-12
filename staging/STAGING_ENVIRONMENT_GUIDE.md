# AIDIS Staging Environment Guide

## Overview

Complete staging environment for AIDIS refactoring safety with isolated database, services, and testing capabilities.

## Quick Start

```bash
# Setup and start everything
cd /home/ridgetop/aidis/staging
./start-staging-all.sh

# Check status  
./status-staging.sh

# Test functionality
./test-staging-functionality.sh

# Stop everything
./stop-staging.sh
```

## Architecture

### Service Ports (No Production Conflicts)
- **Frontend**: 3001 (vs production 3000)
- **Backend**: 6000 (vs production 5001) 
- **MCP**: 9080 (vs production stdio)

### Database
- **Staging**: `aidis_staging` 
- **Production**: `aidis_production`
- **Source**: Restored from `aidis_backup_20250912_162614.sql.gz`

### File Structure
```
staging/
├── .env.staging              # Staging environment variables
├── logs/                     # Isolated staging logs
├── run/                      # PID files for service management
├── setup-staging-database.sh # Database setup from backup
├── start-staging-all.sh      # Start complete environment
├── start-staging-mcp.sh      # Start MCP server only
├── start-staging-backend.sh  # Start backend only  
├── start-staging-frontend.sh # Start frontend only
├── stop-staging.sh           # Stop all services
├── restart-staging.sh        # Restart everything
├── status-staging.sh         # Check service status
└── test-staging-functionality.sh # Test all components
```

## Service Details

### MCP Server (Port 9080)
- **Process**: `npx tsx src/server.ts`
- **Config**: Uses `.env.staging` environment
- **Database**: `aidis_staging` 
- **Logs**: `staging/logs/mcp-staging.log`
- **PID**: `staging/run/staging-mcp.pid`

### Backend HTTP Bridge (Port 6000)
- **Process**: `node claude-http-mcp-bridge.js`
- **Proxy**: Bridges HTTP to MCP protocol
- **Health**: `http://localhost:6000/healthz`
- **API**: `http://localhost:6000/api/*`
- **Logs**: `staging/logs/backend-staging.log` 
- **PID**: `staging/run/staging-backend.pid`

### Frontend Web Server (Port 3001)
- **Process**: Custom Express server
- **Static**: Serves `/client` directory
- **Proxy**: Routes `/api/*` to backend
- **Access**: `http://localhost:3001`
- **Logs**: `staging/logs/frontend-staging.log`
- **PID**: `staging/run/staging-frontend.pid`

## Environment Configuration

### Key Differences from Production

| Setting | Production | Staging | Purpose |
|---------|------------|---------|---------|
| Database | `aidis_production` | `aidis_staging` | Data isolation |
| MCP Port | stdio | 9080 | HTTP testing |
| Backend Port | 5001 | 6000 | Conflict avoidance |  
| Frontend Port | 3000 | 3001 | Conflict avoidance |
| NODE_ENV | production | staging | Environment detection |
| CORS | restrictive | permissive | Testing flexibility |
| Logging | minimal | verbose | Debug visibility |
| Reset Data | disabled | configurable | Testing scenarios |

### Environment Variables (`.env.staging`)
```bash
# Core Configuration
DATABASE_URL=postgresql://ridgetop@localhost:5432/aidis_staging
NODE_ENV=staging
MCP_PORT=9080
HTTP_PORT=6000
FRONTEND_PORT=3001

# Features - All enabled for testing
ENABLE_METRICS_COLLECTION=true
ENABLE_PATTERN_DETECTION=true  
ENABLE_GIT_TRACKING=true
ENABLE_COMPLEXITY_ANALYSIS=true
ENABLE_OUTCOME_TRACKING=true

# Staging-specific
STAGING_MODE=true
ALLOW_DESTRUCTIVE_OPERATIONS=true
ENABLE_CORS=true
LOG_LEVEL=debug
```

## Database Setup

### Automated Setup
```bash
./setup-staging-database.sh
```

### Manual Setup  
```bash
# Drop existing (if needed)
psql -h localhost -p 5432 -c "DROP DATABASE IF EXISTS aidis_staging;"

# Create database
psql -h localhost -p 5432 -c "CREATE DATABASE aidis_staging OWNER ridgetop;"

# Restore from backup
gunzip -c ../backups/aidis_backup_20250912_162614.sql.gz | \
  psql -h localhost -p 5432 -d aidis_staging

# Verify
psql -h localhost -p 5432 -d aidis_staging -c "SELECT count(*) FROM projects;"
```

## Testing Framework

### Comprehensive Test Suite
```bash
./test-staging-functionality.sh
```

**Test Categories:**
1. **Service Status**: Process and PID validation
2. **Port Binding**: Network socket verification  
3. **HTTP Endpoints**: API response testing
4. **Database**: Connection and data integrity
5. **Integration**: Cross-service communication
6. **Data Isolation**: Staging vs production separation
7. **Configuration**: Environment variable validation
8. **Log Files**: Logging system verification

### Test Results Interpretation
- **Success Rate ≥ 95%**: Environment fully functional
- **Success Rate ≥ 80%**: Minor issues, investigate logs
- **Success Rate < 80%**: Major problems, check service status

## Service Management

### Individual Service Control
```bash
# MCP Server only
./start-staging-mcp.sh
kill $(cat run/staging-mcp.pid)

# Backend only  
./start-staging-backend.sh
kill $(cat run/staging-backend.pid)

# Frontend only
./start-staging-frontend.sh
kill $(cat run/staging-frontend.pid)
```

### Complete Environment Control
```bash
# Start everything in order
./start-staging-all.sh

# Stop everything gracefully
./stop-staging.sh

# Restart with validation
./restart-staging.sh

# Check status and health
./status-staging.sh
```

### Log Monitoring
```bash
# Real-time monitoring
tail -f logs/mcp-staging.log
tail -f logs/backend-staging.log  
tail -f logs/frontend-staging.log

# Multi-tail all logs
multitail logs/*.log

# Error filtering
grep -i error logs/*.log
grep -i "failed\|error\|exception" logs/*.log
```

## Development Workflow

### 1. Refactoring Safety Process
```bash
# 1. Start staging environment
./start-staging-all.sh

# 2. Test current functionality  
./test-staging-functionality.sh

# 3. Make changes to source code

# 4. Restart affected services
./restart-staging.sh

# 5. Re-test functionality
./test-staging-functionality.sh

# 6. Compare with production behavior
diff <(curl -s http://localhost:6000/api/projects) \
     <(curl -s http://localhost:5001/api/projects)
```

### 2. Database Testing Scenarios
```bash
# Reset to clean state
./setup-staging-database.sh

# Test with minimal data
psql -d aidis_staging -c "DELETE FROM contexts WHERE created_at < NOW() - INTERVAL '1 day';"

# Test with production-like load  
# (restore full production backup)
```

### 3. Performance Comparison
```bash
# Staging performance
time curl -s http://localhost:6000/api/projects >/dev/null

# Production performance  
time curl -s http://localhost:5001/api/projects >/dev/null

# Database query performance
psql -d aidis_staging -c "EXPLAIN ANALYZE SELECT * FROM contexts LIMIT 100;"
psql -d aidis_production -c "EXPLAIN ANALYZE SELECT * FROM contexts LIMIT 100;"
```

## Troubleshooting

### Common Issues

**Port Conflicts**
```bash
# Check what's using staging ports
netstat -lnp | grep -E ":(9080|6000|3001)"

# Kill conflicting processes
sudo fuser -k 9080/tcp 6000/tcp 3001/tcp
```

**Database Connection Issues**
```bash
# Test PostgreSQL connection
psql -h localhost -p 5432 -d aidis_staging -c "SELECT version();"

# Check database exists
psql -h localhost -p 5432 -l | grep aidis_staging

# Recreate database
./setup-staging-database.sh
```

**Service Startup Failures**
```bash
# Check detailed service status
./status-staging.sh

# View recent logs  
tail -50 logs/mcp-staging.log
tail -50 logs/backend-staging.log

# Manual service start with debug
cd ../mcp-server
NODE_ENV=staging npx tsx src/server.ts
```

### Log Analysis

**Error Patterns to Watch:**
- Database connection failures
- Port binding conflicts  
- MCP protocol errors
- HTTP proxy timeouts
- Memory/resource exhaustion

**Useful Log Commands:**
```bash
# Error summary
grep -c "ERROR\|FATAL" logs/*.log

# Recent activity
tail -100 logs/mcp-staging.log | grep -E "(ERROR|WARN|INFO)"

# Performance issues
grep -i "timeout\|slow\|performance" logs/*.log
```

## Safety Features

### Data Isolation
- ✅ Separate `aidis_staging` database
- ✅ Different service ports  
- ✅ Isolated log files
- ✅ Staging-specific environment variables
- ✅ No shared process management with production

### Rollback Safety
- ✅ Production services unaffected by staging
- ✅ Database backup source preserved
- ✅ Easy staging environment reset
- ✅ Version-controlled configuration

### Testing Integration
- ✅ Automated functionality testing
- ✅ Health check endpoints
- ✅ Service status monitoring  
- ✅ Integration test framework

## Maintenance

### Regular Tasks
```bash
# Weekly database refresh from production
./setup-staging-database.sh

# Log rotation
find logs/ -name "*.log" -mtime +7 -delete

# Service health check
./test-staging-functionality.sh | grep -E "(PASSED|FAILED)"
```

### Monitoring Staging Health
```bash
# Daily health check
./status-staging.sh > staging-health.log

# Alert on failures
if ! ./test-staging-functionality.sh >/dev/null; then
    echo "Staging environment health check failed!" | mail -s "AIDIS Staging Alert" admin@example.com
fi
```

---

**Ready for safe AIDIS refactoring with complete staging isolation!**
