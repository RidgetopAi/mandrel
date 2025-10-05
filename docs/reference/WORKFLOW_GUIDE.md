# AIDIS Workflow Guide

## New Recommended Workflow

### For Full Development Work (MCP + Command Interface):
```bash
# Start everything cleanly
./start-full-stack.sh

# Stop everything cleanly
./stop-full-stack.sh
```

### For MCP Server Only:
```bash
# Start just the core server
./start-aidis.sh

# Stop just the core server
./stop-aidis.sh
```

## What Each Script Does:

### `./start-full-stack.sh`
1. ✅ Kills ALL existing AIDIS processes (using kill-all-aidis.sh)
2. ✅ Starts AIDIS MCP Server
3. ✅ Waits for MCP server health check
4. ✅ Starts AIDIS Command (both backend + frontend)
5. ✅ Tracks PIDs properly
6. ✅ Shows status and logs

### `./stop-full-stack.sh`
1. ✅ Gracefully stops Command interface
2. ✅ Kills any nodemon/ts-node processes
3. ✅ Stops MCP server
4. ✅ Final cleanup

## Benefits:
- **No more redundant processes** - Clean startup every time
- **Proper process tracking** - PIDs stored in run/ directory
- **Health checks** - Waits for services to be ready
- **Single command** - No more complex manual steps
- **Phase 4.3 compliant** - No nodemon/ts-node conflicts

## Old vs New:

### ❌ Old Way (causes process conflicts):
```bash
# Manual steps that create redundant processes
./start-aidis.sh
cd aidis-command && npm run dev:full  # Creates nodemon/ts-node
```

### ✅ New Way (clean and safe):
```bash
# One command handles everything properly
./start-full-stack.sh
```

## Access Points After Startup:
- **AIDIS Tasks**: http://localhost:3000 (Command Interface)
- **MCP Server**: http://localhost:8080/health
- **API Backend**: http://localhost:5000/api/health