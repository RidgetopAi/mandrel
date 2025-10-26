# TR018-4: Phase 4 Rollback and Emergency Procedures
## Oracle Refactor - Service De-duplication Recovery Plans

**Created**: 2025-09-20
**Phase**: 4 (Service De-duplication)
**Status**: ACTIVE
**Owner**: AIDIS Development Team

---

## 🚨 EMERGENCY QUICK REFERENCE

### **IMMEDIATE ROLLBACK COMMANDS**

```bash
# 🚨 EMERGENCY: Full Phase 4 Rollback (30 seconds)
git checkout refactor/phase-0-baseline
./restart-aidis.sh
curl http://localhost:8080/healthz  # Verify rollback

# 🚨 EMERGENCY: Service Recovery (60 seconds)
./stop-aidis.sh && ./start-aidis.sh
npm run dev  # Start command services

# 🚨 EMERGENCY: Database Rollback (2 minutes)
# Contact DBA for PITR restore to pre-Phase 4 timestamp
```

### **EMERGENCY CONTACTS**
- **Primary**: Development Team Lead
- **Secondary**: System Administrator
- **Database**: DBA On-Call
- **Escalation**: Technical Director

---

## 📋 ROLLBACK SCENARIOS & PROCEDURES

### **Scenario 1: Service Health Failures**

**Triggers:**
- Health endpoints returning 5xx errors
- Services not responding within 30 seconds
- Database connection failures
- More than 1 service down simultaneously

**Detection:**
```bash
# Health Check Validation
curl -f http://localhost:3000 || echo "Frontend FAILED"
curl -f http://localhost:5000/health || echo "Backend FAILED"
curl -f http://localhost:8080/healthz || echo "MCP FAILED"
curl -f http://localhost:8080/readyz || echo "Database FAILED"
```

**Rollback Procedure:**
1. **Immediate Response (0-2 minutes)**
   ```bash
   # Stop all Phase 4 services
   ./stop-aidis.sh
   pkill -f "concurrently"
   pkill -f "react-scripts"

   # Revert to Phase 0 baseline
   git checkout refactor/phase-0-baseline

   # Start baseline services
   ./start-aidis.sh
   ```

2. **Validation (2-5 minutes)**
   ```bash
   # Wait for startup
   sleep 30

   # Verify rollback success
   curl http://localhost:8080/healthz
   curl http://localhost:3000

   # Check process count
   ps aux | grep -E "(node|tsx)" | wc -l
   ```

3. **Documentation (5-10 minutes)**
   ```bash
   # Log rollback event
   echo "$(date): Phase 4 service rollback completed" >> logs/rollback.log

   # Capture system state
   ps aux > logs/rollback-processes-$(date +%s).log
   ```

---

### **Scenario 2: Performance Degradation**

**Triggers:**
- Response times >1000ms consistently
- Memory usage >3000MB
- CPU usage >80% for >5 minutes
- Database connection pool exhaustion

**Detection:**
```bash
# Performance Monitoring
time curl http://localhost:8080/healthz  # Should be <100ms
free -h | grep Mem  # Check memory usage
top -p $(pgrep -f "tsx src/server.ts") -n 1  # Check CPU
```

**Rollback Procedure:**
1. **Performance Triage (0-1 minute)**
   ```bash
   # Check current resource usage
   ps aux --sort=-%mem | head -10
   ss -tulpn | grep -E "(3000|5000|8080)"
   ```

2. **Graceful Degradation (1-3 minutes)**
   ```bash
   # Scale down non-essential services
   # Keep MCP and Frontend running, restart Backend
   curl -X POST http://localhost:5000/admin/graceful-shutdown
   npm run dev:backend &
   ```

3. **Full Rollback if Degradation Continues (3-5 minutes)**
   ```bash
   # Execute Scenario 1 procedures
   git checkout refactor/phase-0-baseline
   ./restart-aidis.sh
   ```

---

### **Scenario 3: Database Connection Issues**

**Triggers:**
- Connection pool errors
- PostgreSQL connection refused
- Database timeouts >30 seconds
- Vector operations failing

**Detection:**
```bash
# Database Health Check
psql -h localhost -p 5432 -d aidis_production -c "SELECT 1;"
curl -s http://localhost:8080/readyz | grep database
```

**Rollback Procedure:**
1. **Connection Pool Reset (0-1 minute)**
   ```bash
   # Restart MCP server to reset pool
   ./restart-aidis.sh

   # Verify database connectivity
   psql -h localhost -p 5432 -d aidis_production -c "SELECT current_database();"
   ```

2. **Database Recovery (1-5 minutes)**
   ```bash
   # Check PostgreSQL service
   sudo systemctl status postgresql
   sudo systemctl restart postgresql

   # Verify pgvector extension
   psql -h localhost -p 5432 -d aidis_production -c "SELECT * FROM pg_extension WHERE extname='vector';"
   ```

3. **PITR Restore if Corruption Detected (5-30 minutes)**
   ```bash
   # CONTACT DBA IMMEDIATELY
   # Point-in-Time Recovery to pre-Phase 4 state
   # Target timestamp: 2025-09-19 18:00:00 UTC
   ```

---

### **Scenario 4: Process Count Explosion**

**Triggers:**
- >20 Node.js processes running
- Memory leak detected (>4000MB usage)
- Process spawn failures
- System load >5.0

**Detection:**
```bash
# Process Monitoring
ps aux | grep -E "(node|tsx|npm)" | wc -l  # Should be ≤12
ps aux --sort=-%mem | grep -E "(node|tsx)"
```

**Rollback Procedure:**
1. **Process Cleanup (0-2 minutes)**
   ```bash
   # Kill all AIDIS processes
   pkill -f "tsx src/server.ts"
   pkill -f "concurrently"
   pkill -f "react-scripts"
   pkill -f "claude-http-mcp-bridge"

   # Wait for cleanup
   sleep 10
   ```

2. **Restart Essential Services Only (2-5 minutes)**
   ```bash
   # Start minimal service set
   ./start-aidis.sh  # Only MCP server

   # Verify process count
   ps aux | grep -E "(node|tsx)" | wc -l  # Should be ≤5
   ```

3. **Full Environment Reset (5-10 minutes)**
   ```bash
   # Complete rollback to Phase 0
   git checkout refactor/phase-0-baseline
   ./restart-aidis.sh
   npm run dev  # Restart command services
   ```

---

### **Scenario 5: Service Mesh Failures**

**Triggers:**
- HTTP bridge not responding
- MCP protocol errors
- Service discovery failures
- Load balancer errors

**Detection:**
```bash
# Service Mesh Health
curl http://localhost:8080/mcp/tools/aidis_ping
netstat -tlnp | grep -E "(3000|5000|8080)"
```

**Rollback Procedure:**
1. **Bridge Recovery (0-2 minutes)**
   ```bash
   # Restart HTTP-MCP bridge
   pkill -f "claude-http-mcp-bridge"
   node claude-http-mcp-bridge.js &

   # Test bridge functionality
   curl -X POST http://localhost:8080/mcp/tools/aidis_ping -H "Content-Type: application/json" -d '{}'
   ```

2. **Service Mesh Reset (2-5 minutes)**
   ```bash
   # Restart all interconnected services
   ./stop-aidis.sh
   pkill -f "concurrently"
   sleep 5
   ./start-aidis.sh
   npm run dev &
   ```

---

## 🎯 ROLLBACK VALIDATION CHECKLIST

### **Post-Rollback Verification Steps**

```bash
# 1. Service Health Validation
curl -f http://localhost:3000                    # Frontend
curl -f http://localhost:5000/health             # Backend API
curl -f http://localhost:8080/healthz            # MCP Health
curl -f http://localhost:8080/readyz             # MCP Ready
curl -f http://localhost:8080/livez              # MCP Live

# 2. Database Connectivity
psql -h localhost -p 5432 -d aidis_production -c "SELECT current_database();"

# 3. MCP Tool Functionality
curl -X POST http://localhost:8080/mcp/tools/aidis_ping \
  -H "Content-Type: application/json" -d '{}'

# 4. Process Count Validation
ps aux | grep -E "(node|tsx|npm)" | wc -l        # Should be ≤15

# 5. Memory Usage Check
free -h | grep Mem                               # Available >2GB

# 6. Integration Test Suite
npx tsx test-phase4-integration.ts               # >80% pass rate
```

### **Success Criteria**
- ✅ All 5 health endpoints return 200 OK
- ✅ Database queries execute successfully
- ✅ MCP tools respond within 1000ms
- ✅ Process count within acceptable range
- ✅ Memory usage <3000MB
- ✅ Integration tests pass >80%

---

## 📊 MONITORING & ALERTING

### **Real-time Monitoring Commands**

```bash
# Continuous Health Monitoring (run in separate terminal)
while true; do
  echo "$(date) - Health Check"
  curl -s http://localhost:8080/healthz | grep status
  curl -s http://localhost:8080/readyz | grep status
  echo "Processes: $(ps aux | grep -E '(node|tsx)' | wc -l)"
  echo "Memory: $(free -h | grep Mem | awk '{print $3}')"
  sleep 30
done

# Process Monitoring
watch 'ps aux | grep -E "(node|tsx|npm)" | grep -v grep'

# Memory Monitoring
watch 'free -h && ps aux --sort=-%mem | head -10'
```

### **Alert Thresholds**
- **CRITICAL**: Any service health check fails
- **WARNING**: Response time >500ms
- **WARNING**: Process count >15
- **WARNING**: Memory usage >2500MB
- **INFO**: New service startup detected

---

## 🔄 RECOVERY TIME OBJECTIVES (RTO)

| **Scenario** | **Detection Time** | **Rollback Time** | **Total RTO** |
|--------------|-------------------|-------------------|---------------|
| Service Health Failure | 1 minute | 2 minutes | **3 minutes** |
| Performance Degradation | 2 minutes | 3 minutes | **5 minutes** |
| Database Connection | 1 minute | 5 minutes | **6 minutes** |
| Process Explosion | 30 seconds | 2 minutes | **3 minutes** |
| Service Mesh Failure | 1 minute | 3 minutes | **4 minutes** |
| **Full System Rollback** | 2 minutes | 5 minutes | **7 minutes** |

---

## 📋 INCIDENT RESPONSE WORKFLOW

### **Phase 1: Detection (0-2 minutes)**
1. **Automated Monitoring**: Health check failures trigger alerts
2. **Manual Detection**: User reports or developer observation
3. **Triage**: Determine severity and rollback scenario
4. **Communication**: Alert team via designated channels

### **Phase 2: Response (2-7 minutes)**
1. **Execute Rollback**: Follow appropriate scenario procedure
2. **Monitor Progress**: Watch service recovery in real-time
3. **Validate Success**: Run post-rollback verification checklist
4. **Document Actions**: Log all commands and observations

### **Phase 3: Recovery (7-15 minutes)**
1. **Root Cause Analysis**: Investigate failure triggers
2. **System Hardening**: Apply fixes to prevent recurrence
3. **Testing**: Validate fixes in staging environment
4. **Communication**: Update stakeholders on status

### **Phase 4: Post-Incident (15+ minutes)**
1. **Incident Report**: Document full timeline and lessons
2. **Process Improvement**: Update rollback procedures
3. **Team Review**: Conduct post-mortem discussion
4. **Prevention Planning**: Schedule follow-up improvements

---

## 🛡️ DATA PROTECTION & BACKUP

### **Pre-Rollback Data Backup**

```bash
# Database Backup
pg_dump -h localhost -p 5432 -d aidis_production > \
  backups/pre-rollback-$(date +%Y%m%d_%H%M%S).sql

# Configuration Backup
cp -r config/ backups/config-$(date +%Y%m%d_%H%M%S)/
cp -r logs/ backups/logs-$(date +%Y%m%d_%H%M%S)/

# Git State Preservation
git branch rollback-point-$(date +%Y%m%d_%H%M%S)
git tag phase-4-rollback-$(date +%Y%m%d_%H%M%S)
```

### **Data Recovery Verification**

```bash
# Verify Database Integrity
psql -h localhost -p 5432 -d aidis_production -c \
  "SELECT COUNT(*) FROM contexts; SELECT COUNT(*) FROM technical_decisions;"

# Verify Log Continuity
tail -20 logs/aidis.log

# Verify Configuration Consistency
diff -r config/ backups/config-latest/
```

---

## 🔧 AUTOMATED ROLLBACK SCRIPTS

### **Emergency Rollback Script**

```bash
#!/bin/bash
# emergency-rollback.sh
# Phase 4 Emergency Rollback Automation

set -e  # Exit on any error

echo "🚨 INITIATING EMERGENCY PHASE 4 ROLLBACK"
echo "Timestamp: $(date)"

# 1. Stop all services
echo "🛑 Stopping all services..."
./stop-aidis.sh
pkill -f "concurrently" || true
pkill -f "react-scripts" || true
sleep 5

# 2. Backup current state
echo "💾 Backing up current state..."
git branch "emergency-rollback-$(date +%Y%m%d_%H%M%S)" || true

# 3. Revert to baseline
echo "⏪ Reverting to Phase 0 baseline..."
git checkout refactor/phase-0-baseline

# 4. Restart services
echo "🚀 Starting baseline services..."
./start-aidis.sh

# 5. Wait for startup
echo "⏳ Waiting for service startup..."
sleep 30

# 6. Verify rollback
echo "✅ Verifying rollback success..."
if curl -f http://localhost:8080/healthz; then
  echo "✅ ROLLBACK SUCCESSFUL"
  echo "📊 System Status: OPERATIONAL"
else
  echo "❌ ROLLBACK FAILED"
  echo "🚨 MANUAL INTERVENTION REQUIRED"
  exit 1
fi

echo "📋 Rollback completed at $(date)"
```

### **Health Check Monitoring Script**

```bash
#!/bin/bash
# monitor-health.sh
# Continuous Phase 4 Health Monitoring

ALERT_THRESHOLD=3  # Failed checks before triggering rollback
failed_count=0

while true; do
  timestamp=$(date)

  # Test all critical endpoints
  if curl -f -s http://localhost:8080/healthz > /dev/null && \
     curl -f -s http://localhost:3000 > /dev/null; then

    echo "$timestamp - ✅ All services healthy"
    failed_count=0

  else
    failed_count=$((failed_count + 1))
    echo "$timestamp - ❌ Health check failed ($failed_count/$ALERT_THRESHOLD)"

    if [ $failed_count -ge $ALERT_THRESHOLD ]; then
      echo "🚨 TRIGGERING EMERGENCY ROLLBACK"
      ./emergency-rollback.sh
      break
    fi
  fi

  sleep 30
done
```

---

## 📞 ESCALATION MATRIX

| **Time Elapsed** | **Action** | **Responsibility** |
|------------------|------------|-------------------|
| 0-5 minutes | Execute automated rollback | Development Team |
| 5-10 minutes | Manual intervention if automated fails | Senior Developer |
| 10-15 minutes | Database team involvement | DBA |
| 15-30 minutes | Management notification | Team Lead |
| 30+ minutes | Executive escalation | Technical Director |

---

## 📝 TESTING & VALIDATION

### **Rollback Procedure Testing**

```bash
# Simulate Phase 4 failure scenarios
# TEST 1: Service health failure
sudo iptables -A OUTPUT -p tcp --dport 5432 -j DROP  # Block DB
# Execute rollback procedure
# Verify recovery
sudo iptables -D OUTPUT -p tcp --dport 5432 -j DROP  # Restore

# TEST 2: Process explosion simulation
for i in {1..10}; do node -e "setInterval(() => {}, 1000)" & done
# Execute process cleanup procedure
# Verify process count normalization

# TEST 3: Memory exhaustion simulation
node -e "const arr = []; while(true) arr.push(new Array(1000000).fill('x'))" &
# Execute performance rollback procedure
# Verify memory recovery
```

### **Rollback Success Metrics**

1. **Recovery Time**: <7 minutes for any scenario
2. **Data Integrity**: 100% database consistency maintained
3. **Service Availability**: >99% uptime during rollback
4. **Process Count**: Returns to baseline levels
5. **Memory Usage**: <3000MB post-rollback
6. **Functionality**: >95% integration test pass rate

---

## 🔐 SECURITY CONSIDERATIONS

### **Rollback Security Checklist**

- [ ] No secrets exposed during rollback process
- [ ] Database credentials remain encrypted
- [ ] Log files sanitized of sensitive information
- [ ] Network access controls maintained
- [ ] Service authentication preserved
- [ ] Backup files stored securely

### **Access Control During Emergencies**

```bash
# Emergency access validation
whoami  # Verify authorized user
pwd     # Confirm working directory
git status  # Verify repository state
```

---

## 📚 DOCUMENTATION & TRAINING

### **Team Training Requirements**

1. **All Developers**: Basic rollback procedures
2. **Senior Developers**: Full emergency response
3. **DevOps Team**: Infrastructure rollback
4. **Management**: Escalation procedures

### **Documentation Updates**

- Update after each rollback execution
- Quarterly procedure review and testing
- Annual comprehensive revision
- Incident-driven immediate updates

---

**Document Version**: 1.0
**Last Updated**: 2025-09-20
**Next Review**: 2025-10-20
**Approval**: Development Team Lead

---

*This document is part of the Oracle Refactor Phase 4 completion requirements and serves as the official rollback and emergency response guide for AIDIS service de-duplication changes.*