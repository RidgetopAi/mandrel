# AIDIS System Resource & Performance Baseline Report

**Generated:** September 12, 2025 15:36 EDT  
**System:** Ubuntu 24.04.2 LTS (WSL2)  
**Uptime:** 6 hours 45 minutes  

## Executive Summary

System is operating normally with **low resource utilization** and **minimal error rates**. AIDIS Core HTTP service is healthy on port 8080, PostgreSQL is active with good performance metrics. Identified 19 errors primarily related to UUID validation issues in session management.

## 📊 System Resource Utilization

### CPU Performance
- **Load Average:** 0.16, 0.13, 0.16 (1min, 5min, 15min) - **EXCELLENT**
- **CPU Usage:** 4.4% user, 0.4% system, 94.3% idle - **OPTIMAL**
- **Active Tasks:** 134 total (1 running, 133 sleeping)
- **Peak Process:** Node.js AIDIS service (30% CPU, 239MB RAM)

### Memory Utilization  
- **Total Memory:** 15.8GB
- **Used Memory:** 5.0GB (32% utilization) - **GOOD**
- **Available Memory:** 10.7GB (68% available) - **EXCELLENT**
- **Swap Usage:** 0GB used of 4GB - **OPTIMAL**

### Disk Performance
- **Root Filesystem:** 22GB used / 1007GB total (3% usage) - **EXCELLENT**
- **I/O Performance:** 
  - Average wait: 0.03% (very low)
  - Primary disk (sdd): 1.40% utilization
  - Read throughput: 241.93 kB/s
  - Write throughput: 1085.60 kB/s

## 🔥 Error Analysis & Rates

### Current Error Count: 19 total errors across all logs

### Error Breakdown by Type:
1. **UUID Validation Errors (12 errors - 63%)**
   - Issue: `invalid input syntax for type uuid: "default-session"`
   - Impact: Context storage and session management failures
   - **CRITICAL** - Requires immediate attention

2. **Missing Function Errors (1 error - 5%)**
   - Issue: `contextHandler.searchContexts is not a function`
   - Impact: Search functionality degraded

3. **MCP Tool Validation Errors (6 errors - 32%)**
   - Issue: Validation for nonexistent tools and JSON parsing
   - Impact: Invalid API calls properly rejected (expected behavior)

### Error Rate Timeline
- **No growth pattern observed** - errors appear to be from testing/validation
- **Recovery Status:** Service remains operational despite errors

## 🗄️ Database Performance Analysis

### Connection Health
- **Active Connections:** 2 (well within limits)
- **Database Status:** Active and responsive
- **Connection Pool:** 20 max connections configured
- **Query Response:** Sub-millisecond response times

### Table Activity (Top 10 by Operations)
| Table | Inserts | Updates | Deletes | Total Ops |
|-------|---------|---------|---------|-----------|
| sessions | 195 | 54 | 0 | 249 |
| projects | 74 | 11 | 63 | 148 |
| analytics_events | 96 | 0 | 42 | 138 |
| tasks | 11 | 9 | 0 | 20 |
| sessions_backup_* | 36 | 0 | 0 | 36 |

### Database Extensions
- ✅ pgvector extension active and functional
- ✅ Vector operations confirmed working
- ✅ No lock contention detected

## 🌐 Network Performance

### Service Availability
- **AIDIS Core:** ✅ Healthy (port 8080)
- **PostgreSQL:** ✅ Active (port 5432) 
- **Node.js Services:** ✅ Running (port 5001)
- **Development Server:** ✅ Available (port 3000)

### Latency Measurements
- **Localhost ping:** 0.125ms average (excellent)
- **Database queries:** <1ms response time
- **HTTP health check:** <100ms response time

## 📈 Alert Thresholds for Regression Detection

### 🚨 CRITICAL Thresholds
| Metric | Current | Warning | Critical | Action |
|--------|---------|---------|-----------|--------|
| Memory Usage | 32% | >80% | >90% | Scale/restart |
| CPU Load (5min) | 0.13 | >4.0 | >8.0 | Investigate |
| Disk Usage | 3% | >85% | >95% | Clean/expand |
| Error Rate | 19/hr | >50/hr | >100/hr | Debug/fix |
| DB Connections | 2 | >15 | >18 | Check leaks |

### ⚠️ WARNING Thresholds  
| Metric | Current | Warning | Action |
|--------|---------|---------|---------|
| I/O Wait | 0.03% | >5% | Monitor disk |
| Response Time | <100ms | >500ms | Check network |
| Active Processes | 134 | >200 | Review processes |

## 🔧 Monitoring Recommendations

### Immediate Actions Required
1. **🚨 HIGH PRIORITY:** Fix UUID validation in session management
   - Location: `/mcp-server/src/handlers/context.ts:271`
   - Error: Session ID "default-session" not valid UUID format
   - Impact: Context storage system partially broken

2. **🔧 MEDIUM PRIORITY:** Implement missing searchContexts function
   - Location: Context handler implementation
   - Impact: Search functionality degraded

### Ongoing Monitoring Setup

#### Real-time Alerts (< 1 minute detection)
```bash
# CPU monitoring
watch -n 10 'top -bn1 | grep "load average"'

# Memory monitoring  
watch -n 30 'free -h'

# Database connections
watch -n 60 'psql -h localhost -p 5432 -d aidis_production -c "SELECT count(*) FROM pg_stat_activity WHERE state = '\''active'\'';"'
```

#### Daily Health Checks
```bash
# System resource summary
./scripts/daily-health-check.sh

# Error log analysis
grep -i error /home/ridgetop/aidis/logs/*.log | wc -l

# Database performance
psql -h localhost -p 5432 -d aidis_production -c "SELECT * FROM pg_stat_database WHERE datname='aidis_production';"
```

#### Weekly Performance Reviews
- Disk usage trends
- Error pattern analysis  
- Database growth metrics
- Backup verification

### Automation Recommendations

1. **Log Rotation:** Implement automated log cleanup (logs growing steadily)
2. **Health Dashboards:** Set up Grafana/Prometheus monitoring
3. **Automated Backups:** Current backup system working well (daily backups successful)
4. **Alert Integration:** Connect to Slack/email for critical thresholds

## 📊 Historical Context

### System Growth Trends
- **Database Size:** 17MB (from backups, steady growth)
- **Log Growth:** 1,555 lines in backup.log (manageable)
- **Session Activity:** 195 sessions created (active usage)

### Backup Status ✅
- **Last Full Backup:** September 11, 2025 (successful)
- **Quick Backups:** Regular 2-hour schedule working
- **Backup Size:** 17MB production database
- **Recovery:** Tested and documented

## 🎯 Performance Optimization Opportunities

1. **UUID Session Management:** Implement proper UUID generation for sessions
2. **Connection Pooling:** Current 20 connections adequate, consider monitoring
3. **Log Management:** Implement log rotation for large backup.log
4. **Caching Strategy:** Database performance is good, caching not immediately needed

---

**Next Review:** September 19, 2025  
**Escalation Contact:** System Administrator  
**Monitoring Dashboard:** http://localhost:8080/healthz

*This baseline establishes normal operating parameters for AIDIS system monitoring and regression detection.*
