#!/bin/bash
# Tail the latest AIDIS log file with color highlighting

LOG_DIR="logs"
LATEST_LOG="$LOG_DIR/aidis-latest.log"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Check if log exists
if [ ! -f "$LATEST_LOG" ]; then
    echo "⚠️  No log file found at $LATEST_LOG"
    echo "Start the server first with: ./scripts/start-with-logging.sh"
    exit 1
fi

# Tail with color highlighting
tail -f "$LATEST_LOG" | sed \
    -e "s/ERROR/${RED}ERROR${NC}/g" \
    -e "s/WARN/${YELLOW}WARN${NC}/g" \
    -e "s/INFO/${GREEN}INFO${NC}/g" \
    -e "s/DEBUG/${BLUE}DEBUG${NC}/g" \
    -e "s/✅/${GREEN}✅${NC}/g" \
    -e "s/❌/${RED}❌${NC}/g" \
    -e "s/⚠️/${YELLOW}⚠️${NC}/g" \
    -e "s/🚀/${CYAN}🚀${NC}/g" \
    -e "s/📦/${MAGENTA}📦${NC}/g" \
    -e "s/🔨/${YELLOW}🔨${NC}/g"
