#!/bin/bash
# Live viewer for captured spindles
# Perfect for running in a tmux pane to watch thinking blocks in real-time

LOGFILE="logs/spindles.jsonl"

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Clear screen and show header
clear
echo -e "${CYAN}╔════════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║${NC}  ${MAGENTA}🎡 SPINDLES LIVE VIEWER${NC}                                      ${CYAN}║${NC}"
echo -e "${CYAN}║${NC}  Watching: ${YELLOW}logs/spindles.jsonl${NC}                               ${CYAN}║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Create log file if it doesn't exist
if [ ! -f "$LOGFILE" ]; then
    mkdir -p logs
    touch "$LOGFILE"
    echo -e "${YELLOW}📝 Created new log file: $LOGFILE${NC}"
    echo ""
fi

# Show initial stats
echo -e "${BLUE}📊 Initial Stats:${NC}"
TOTAL_SPINDLES=$(wc -l < "$LOGFILE" 2>/dev/null || echo 0)
echo -e "   Total spindles captured: ${GREEN}$TOTAL_SPINDLES${NC}"
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${YELLOW}⏳ Waiting for new spindles...${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Tail the log file and format each new spindle
tail -f -n 0 "$LOGFILE" | while read -r line; do
    # Parse JSON
    TIMESTAMP=$(echo "$line" | jq -r '.spindle.timestamp')
    SPINDLE_ID=$(echo "$line" | jq -r '.spindle.id')
    SESSION_ID=$(echo "$line" | jq -r '.spindle.sessionId // "none"')
    TYPE=$(echo "$line" | jq -r '.spindle.type')
    CONTENT=$(echo "$line" | jq -r '.spindle.content')

    # Format timestamp
    TIME=$(date -d "$TIMESTAMP" +'%H:%M:%S' 2>/dev/null || echo "now")

    # Display the spindle
    echo -e "${GREEN}━━━ SPINDLE CAPTURED ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}🕐 Time:${NC}       $TIME"
    echo -e "${BLUE}🆔 ID:${NC}         ${SPINDLE_ID:0:8}..."
    echo -e "${BLUE}📦 Session:${NC}    $SESSION_ID"
    echo -e "${BLUE}🏷️  Type:${NC}       $TYPE"
    echo -e "${BLUE}💭 Content:${NC}"
    echo ""

    # Word wrap the content nicely (60 chars wide)
    echo "$CONTENT" | fold -w 60 -s | while read -r contentline; do
        echo -e "   ${CYAN}│${NC} $contentline"
    done

    echo ""
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Update counter
    TOTAL_SPINDLES=$((TOTAL_SPINDLES + 1))
    echo -e "${YELLOW}📊 Total: $TOTAL_SPINDLES spindles${NC}"
    echo ""
done
