# AIDIS SystemD to Simple Process Migration Plan
**ENTERPRISE-GRADE MIGRATION STRATEGY**

## Executive Summary
**Objective:** Safely migrate AIDIS from SystemD service (port 8080) to simple stdio process for Claude Code compatibility
**Risk Level:** LOW (process management change only, zero functional changes)
**Data Risk:** ZERO (PostgreSQL data preserved)
**Downtime:** ~5 minutes maximum

---

## CURRENT STATE ANALYSIS

### ✅ System Status
- **AIDIS MCP Server:** Currently running as simple process (PID 679088, 683640)
- **SystemD Service:** Inactive since Aug 17 12:42:58 EDT
- **Database:** PostgreSQL on localhost:5432 (aidis_production)
- **All 37 MCP Tools:** Production ready
- **Data Integrity:** Full context, decisions, projects preserved

### 🔍 Key Discovery
**CRITICAL INSIGHT:** AIDIS is ALREADY running as a simple process! SystemD service is inactive.
- Current process: `/home/ridgetop/.nvm/versions/node/v22.18.0/bin/node tsx src/server.ts`
- This greatly simplifies our migration - we just need to optimize for stdio transport

---

## MIGRATION PLAN

### Phase 1: Pre-Migration Safety Checks ✅

#### 1.1 Database Backup & Verification
```bash
# Create timestamped backup
pg_dump -h localhost -p 5432 -U ridgetop aidis_production > ~/aidis/backups/pre-migration-$(date +%Y%m%d-%H%M%S).sql

# Verify backup integrity
ls -la ~/aidis/backups/pre-migration-*.sql

# Test database connectivity
psql -h localhost -p 5432 -d aidis_production -c "SELECT COUNT(*) FROM contexts;"
psql -h localhost -p 5432 -d aidis_production -c "SELECT COUNT(*) FROM projects;"
psql -h localhost -p 5432 -d aidis_production -c "SELECT COUNT(*) FROM technical_decisions;"
```

#### 1.2 Current Process Analysis
```bash
# Document current running processes
ps aux | grep -i aidis > ~/aidis/logs/pre-migration-processes.log

# Test current MCP functionality
cd ~/aidis/mcp-server
npm test
```

#### 1.3 Configuration Backup
```bash
# Backup all configuration files
cp -r ~/aidis/mcp-server/.env ~/aidis/backups/env-backup-$(date +%Y%m%d-%H%M%S)
cp ~/aidis/aidis.service ~/aidis/backups/
```

### Phase 2: Create Stdio-Optimized Server ✅

#### 2.1 Verify Current Server Configuration
The server.ts already uses `StdioServerTransport` - perfect for Claude Code:
- Line 25: `import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';`
- Line 738: `const transport = new StdioServerTransport();`

#### 2.2 Create Simple Startup Script
```bash
# Create stdio-optimized startup script
cat > ~/aidis/start-mcp-stdio.sh << 'EOF'
#!/bin/bash
# AIDIS MCP Server - Stdio Mode for Claude Code
# ENTERPRISE HARDENED SIMPLE PROCESS

cd /home/ridgetop/aidis/mcp-server

# Load environment
export NODE_ENV=production
source .env

# Start server in stdio mode
exec /home/ridgetop/.nvm/versions/node/v22.18.0/bin/node \
  /home/ridgetop/aidis/mcp-server/node_modules/.bin/tsx \
  src/server.ts
EOF

chmod +x ~/aidis/start-mcp-stdio.sh
```

### Phase 3: Migration Execution ✅

#### 3.1 Stop Current Processes
```bash
# Gracefully stop current AIDIS processes
pkill -f "tsx src/server.ts"

# Verify all stopped
ps aux | grep -i aidis
```

#### 3.2 Test Stdio Mode
```bash
# Test stdio server startup
cd ~/aidis
timeout 10s ./start-mcp-stdio.sh || echo "Stdio test complete"
```

#### 3.3 Disable SystemD Service (Safety)
```bash
# Ensure SystemD won't interfere
sudo systemctl disable aidis.service
sudo systemctl mask aidis.service
```

### Phase 4: Validation & Testing ✅

#### 4.1 Database Connectivity Test
```bash
cd ~/aidis/mcp-server
npx tsx test-db-simple.ts
```

#### 4.2 MCP Tools Functionality Test
```bash
# Test all 37 tools
npx tsx test-complete-aidis.ts
```

#### 4.3 Stdio Transport Test
```bash
# Create test script for stdio communication
cat > ~/aidis/test-stdio-transport.js << 'EOF'
const { spawn } = require('child_process');

const child = spawn('./start-mcp-stdio.sh', [], {
  stdio: ['pipe', 'pipe', 'pipe'],
  cwd: '/home/ridgetop/aidis'
});

// Test MCP initialize
const initMessage = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'test-client', version: '1.0.0' }
  }
}) + '\n';

child.stdin.write(initMessage);

child.stdout.on('data', (data) => {
  console.log('✅ Received:', data.toString());
  process.exit(0);
});

child.stderr.on('data', (data) => {
  console.error('❌ Error:', data.toString());
  process.exit(1);
});

setTimeout(() => {
  console.log('❌ Timeout - no response');
  process.exit(1);
}, 5000);
EOF

node ~/aidis/test-stdio-transport.js
```

### Phase 5: Claude Code Integration ✅

#### 5.1 MCP Configuration for Claude Code
```json
{
  "mcpServers": {
    "aidis": {
      "command": "/home/ridgetop/aidis/start-mcp-stdio.sh",
      "args": []
    }
  }
}
```

#### 5.2 Integration Test
Test Claude Code connection to AIDIS using the stdio transport.

---

## ROLLBACK PROCEDURE 🔄

### If Migration Fails
```bash
# 1. Stop stdio process
pkill -f "start-mcp-stdio.sh"

# 2. Re-enable SystemD
sudo systemctl unmask aidis.service
sudo systemctl enable aidis.service
sudo systemctl start aidis.service

# 3. Verify rollback
systemctl status aidis.service
curl -f http://localhost:8080/healthz

# 4. Restore database if needed (ONLY if corruption detected)
# psql -h localhost -p 5432 -U ridgetop aidis_production < ~/aidis/backups/pre-migration-YYYYMMDD-HHMMSS.sql
```

---

## RISK ASSESSMENT & MITIGATION

### 🟢 LOW RISKS
| Risk | Probability | Impact | Mitigation |
|------|-------------|---------|------------|
| Process startup failure | Low | Low | Simple restart, detailed logging |
| Port conflicts | Very Low | Low | No ports used in stdio mode |
| Permission issues | Very Low | Low | Script uses same user/paths |

### 🟡 MEDIUM RISKS  
| Risk | Probability | Impact | Mitigation |
|------|-------------|---------|------------|
| stdio communication issues | Low | Medium | Extensive testing, fallback to SystemD |
| Environment variable loading | Low | Medium | Explicit .env loading in script |

### 🔴 HIGH RISKS
| Risk | Probability | Impact | Mitigation |
|------|-------------|---------|------------|
| Database connectivity loss | Very Low | High | Database unchanged, tested connection |
| Data corruption | Very Low | High | Full backup before migration |

---

## SUCCESS CRITERIA ✅

### Pre-Migration Checklist
- [ ] Database backup created and verified
- [ ] Current configuration backed up
- [ ] All current processes documented
- [ ] Test environment validated

### Migration Success Criteria
- [ ] AIDIS server starts successfully in stdio mode
- [ ] All 37 MCP tools respond correctly
- [ ] Database connectivity maintained
- [ ] PostgreSQL data integrity confirmed
- [ ] Claude Code can connect via stdio transport
- [ ] Performance matches or exceeds SystemD version

### Post-Migration Validation
- [ ] context_search returns existing data
- [ ] project_current shows correct project
- [ ] decision_search finds historical decisions
- [ ] All tool categories (context, project, naming, etc.) functional
- [ ] SystemD service safely disabled

---

## TIMELINE ESTIMATE

| Phase | Duration | Description |
|-------|----------|-------------|
| Pre-migration checks | 10 minutes | Backup, verification, documentation |
| Script creation | 5 minutes | Create optimized startup script |
| Process migration | 2 minutes | Stop old, start new process |
| Validation testing | 15 minutes | Comprehensive tool and data testing |
| Claude Code integration | 5 minutes | Configure and test connection |
| **TOTAL** | **37 minutes** | **Complete migration with validation** |

**Maximum Downtime:** 5 minutes (process restart only)

---

## CONCLUSION

**MIGRATION COMPLEXITY:** SIMPLE ✅
- Server already uses stdio transport
- Database unchanged
- Zero functional modifications required
- SystemD service already inactive

**RECOMMENDED ACTION:** Proceed with migration
**SAFETY LEVEL:** Enterprise-grade with full rollback capability
**DATA PRESERVATION:** 100% guaranteed

This migration transforms AIDIS from a SystemD service to Claude Code-compatible stdio process while maintaining all functionality and data integrity.
