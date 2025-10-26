#!/bin/bash

# AIDIS Full Stack Shutdown Script
# Gracefully stops both MCP server and Command interface

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🛑 Stopping AIDIS Full Stack...${NC}"

# Step 1: Stop AIDIS Command Interface
echo -e "${YELLOW}🎛️  Stopping AIDIS Command Interface...${NC}"
if [ -f "run/aidis-command.pid" ]; then
    COMMAND_PID=$(cat run/aidis-command.pid)
    if ps -p "$COMMAND_PID" > /dev/null 2>&1; then
        echo -e "   Stopping Command interface (PID: $COMMAND_PID)..."
        kill -TERM "$COMMAND_PID" 2>/dev/null

        # Wait for graceful shutdown
        for i in {1..10}; do
            if ! ps -p "$COMMAND_PID" > /dev/null 2>&1; then
                break
            fi
            sleep 1
        done

        # Force kill if still running
        if ps -p "$COMMAND_PID" > /dev/null 2>&1; then
            echo -e "   Force stopping Command interface..."
            kill -9 "$COMMAND_PID" 2>/dev/null
        fi
    fi
    rm -f "run/aidis-command.pid"
fi

# Kill any remaining nodemon/ts-node processes
pkill -f "nodemon" 2>/dev/null || true
pkill -f "ts-node" 2>/dev/null || true
pkill -f "concurrently" 2>/dev/null || true

echo -e "${GREEN}✅ Command interface stopped${NC}"

# Step 2: Stop AIDIS MCP Server
echo -e "${YELLOW}🔧 Stopping AIDIS MCP Server...${NC}"
./stop-aidis.sh

# Step 3: Final cleanup
echo -e "${YELLOW}🧹 Final cleanup...${NC}"
pkill -f "aidis" 2>/dev/null || true
sleep 1

echo -e "${GREEN}✅ AIDIS Full Stack stopped successfully${NC}"