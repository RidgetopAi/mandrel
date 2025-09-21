#!/bin/bash

# AIDIS Full Stack Startup Script
# Ensures clean startup of both MCP server and Command interface

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Starting AIDIS Full Stack...${NC}"

# Step 1: Clean shutdown of any existing processes
echo -e "${YELLOW}🧹 Cleaning up existing processes...${NC}"
if [ -f "./kill-all-aidis.sh" ]; then
    ./kill-all-aidis.sh
    sleep 2
else
    echo "⚠️  kill-all-aidis.sh not found, manual cleanup..."
    pkill -f "aidis" 2>/dev/null || true
    pkill -f "tsx.*server" 2>/dev/null || true
    pkill -f "nodemon" 2>/dev/null || true
    pkill -f "ts-node" 2>/dev/null || true
    sleep 2
fi

# Step 2: Start AIDIS MCP Server (core system)
echo -e "${GREEN}🔧 Starting AIDIS MCP Server...${NC}"
./start-aidis.sh

# Wait for MCP server to be ready
echo -e "${YELLOW}⏳ Waiting for MCP server to be ready...${NC}"
for i in {1..30}; do
    if curl -s http://localhost:8080/health > /dev/null 2>&1; then
        echo -e "${GREEN}✅ MCP Server is ready!${NC}"
        break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ MCP Server failed to start${NC}"
        exit 1
    fi
done

# Step 3: Start AIDIS Command (admin interface)
echo -e "${GREEN}🎛️  Starting AIDIS Command Interface...${NC}"
cd aidis-command

# Start in background and capture PID
nohup npm run dev:full > ../logs/aidis-command.log 2>&1 &
COMMAND_PID=$!
echo $COMMAND_PID > ../run/aidis-command.pid

echo -e "${GREEN}✅ AIDIS Command started (PID: $COMMAND_PID)${NC}"

# Step 4: Wait for Command interface to be ready
echo -e "${YELLOW}⏳ Waiting for Command interface...${NC}"
for i in {1..60}; do
    if curl -s http://localhost:3000 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Command interface is ready!${NC}"
        break
    fi
    sleep 1
done

# Step 5: Display status
echo ""
echo -e "${BLUE}🎯 AIDIS Full Stack Status:${NC}"
echo -e "   ${GREEN}🔧 MCP Server:${NC}     http://localhost:8080/health"
echo -e "   ${GREEN}🎛️  Command Backend:${NC} http://localhost:5000/api/health"
echo -e "   ${GREEN}🌐 Command Frontend:${NC} http://localhost:3000"
echo ""
echo -e "${YELLOW}📋 Logs:${NC}"
echo -e "   MCP Server:    tail -f logs/aidis.log"
echo -e "   Command UI:    tail -f logs/aidis-command.log"
echo ""
echo -e "${YELLOW}🛑 Stop Everything:${NC} ./stop-full-stack.sh"
echo ""
echo -e "${GREEN}🚀 Full stack is ready!${NC}"