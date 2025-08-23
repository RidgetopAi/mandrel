# AIDIS Command Dev Environment Setup Guide

## 🎯 Quick Start (3 commands)

```bash
# 1. Start AIDIS SystemD service (port 8080)
cd ~/aidis && ./setup-user-systemd.sh

# 2. Start HTTP-MCP Bridge (port 8081) 
cd ~/aidis && nohup node scripts/simple-http-bridge.js > logs/http-bridge.log 2>&1 &

# 3. Start AIDIS Command Dev (ports 3001 frontend, 5001 backend)
cd ~/aidis/aidis-command-dev && npm run dev:full
```

## 🏗️ Architecture Overview

```
Frontend (3001) → Backend (5001) → HTTP Bridge (8081) → AIDIS MCP (8080)
     ↑                  ↑                ↑                    ↑
   React UI        Express API     Simple Bridge        SystemD Service
```

## 🔧 What Each Service Does

### 1. AIDIS SystemD Service (Port 8080)
- **Purpose**: Main MCP server with all 37 AIDIS tools
- **Status**: `systemctl --user status aidis.service`
- **Health**: `curl http://localhost:8080/healthz`
- **Started by**: `./setup-user-systemd.sh`

### 2. HTTP-MCP Bridge (Port 8081)
- **Purpose**: Converts HTTP POST → MCP tool calls → HTTP responses
- **File**: `~/aidis/scripts/simple-http-bridge.js`
- **Health**: `curl http://localhost:8081/health`
- **Logs**: `~/aidis/logs/http-bridge.log`
- **Why needed**: Backend uses HTTP, MCP uses stdio protocol

### 3. AIDIS Command Backend (Port 5001)
- **Purpose**: REST API for the dashboard UI
- **Config**: Uses `http://localhost:5001/api` (see `frontend/src/services/api.ts`)
- **MCP calls**: POST to `http://localhost:8081/mcp/tools/{toolName}`
- **Database**: `aidis_development` on localhost:5432

### 4. AIDIS Command Frontend (Port 3001)
- **Purpose**: React dashboard UI
- **URL**: http://localhost:3001
- **Login**: admin / (any password)
- **Working pages**: Dashboard, Contexts, Agents, Tasks, Projects
- **Fixed**: Decisions (was failing, now works with bridge)

## 🚨 Common Issues & Solutions

### Issue: "Decisions page won't load"
**Cause**: HTTP-MCP Bridge not running on port 8081
```bash
# Check if bridge is running
ss -tlnp | grep :8081

# Start bridge if missing
cd ~/aidis && nohup node scripts/simple-http-bridge.js > logs/http-bridge.log 2>&1 &
```

### Issue: "SystemD service not running" 
**Cause**: AIDIS MCP service not started
```bash
# Check service status
systemctl --user status aidis.service

# Start if needed
cd ~/aidis && ./setup-user-systemd.sh
```

### Issue: "Backend won't start"
**Cause**: Port 5001 already in use or database connection
```bash
# Check what's using port 5001
ss -tlnp | grep :5001

# Check database connection
psql -h localhost -p 5432 -d aidis_development -c "SELECT 1;"
```

## 📝 Development Workflow

### Daily Startup
```bash
# Check all services
cd ~/aidis
systemctl --user status aidis.service    # Should be active
ss -tlnp | grep :8081                     # Should show bridge
cd aidis-command-dev && npm run dev:full  # Start frontend + backend
```

### Making Changes
1. **Frontend changes**: Auto-reload at http://localhost:3001
2. **Backend changes**: Nodemon auto-restarts server
3. **MCP changes**: Restart SystemD service
4. **Bridge changes**: Restart bridge service

### Logs to Check
- **Bridge**: `tail -f ~/aidis/logs/http-bridge.log`
- **SystemD**: `journalctl --user -u aidis.service -f`
- **Backend**: Shows in terminal where you ran `npm run dev:full`
- **Frontend**: Shows in terminal where you ran `npm run dev:full`

## 🎛️ Port Reference

| Service | Port | Purpose | Health Check |
|---------|------|---------|--------------|
| AIDIS MCP | 8080 | SystemD service | `curl localhost:8080/healthz` |
| HTTP Bridge | 8081 | HTTP→MCP bridge | `curl localhost:8081/health` |
| Frontend | 3001 | React UI | http://localhost:3001 |
| Backend | 5001 | REST API | `curl localhost:5001/api/health` |

## 🔄 Restart Everything (Nuclear Option)
```bash
# Stop everything
cd ~/aidis
systemctl --user stop aidis.service
pkill -f "simple-http-bridge.js"
pkill -f "aidis-command-dev"

# Start everything
./setup-user-systemd.sh
nohup node scripts/simple-http-bridge.js > logs/http-bridge.log 2>&1 &
cd aidis-command-dev && npm run dev:full
```

## ✅ Success Indicators
- ✅ AIDIS service: `systemctl --user is-active aidis.service` returns "active"
- ✅ HTTP bridge: `curl -s localhost:8081/health | grep healthy`
- ✅ Backend: `curl -s localhost:5001/api/health | grep healthy`  
- ✅ Frontend: Can load http://localhost:3001 and login
- ✅ Decisions: Decisions page loads without errors
