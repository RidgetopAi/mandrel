#!/bin/bash
# AIDIS tmux Development Setup
# Creates a tmux session with:
#   - Left pane: Claude Code / work area (70% width)
#   - Top-right pane: Live logs (30% width, 70% height)
#   - Bottom-right pane: Quick commands (30% width, 30% height)

SESSION_NAME="aidis-dev"

# Check if session already exists
if tmux has-session -t "$SESSION_NAME" 2>/dev/null; then
    echo "Session '$SESSION_NAME' already exists. Attaching..."
    tmux attach-session -t "$SESSION_NAME"
    exit 0
fi

# Create new session with first window
tmux new-session -d -s "$SESSION_NAME" -n "aidis"

# Split window: vertical split at 70% (left pane is work area)
tmux split-window -h -p 30 -t "$SESSION_NAME:0"

# Split right pane: horizontal split at 70% (top for logs, bottom for commands)
tmux split-window -v -p 30 -t "$SESSION_NAME:0.1"

# Pane 0 (left): Work area
tmux send-keys -t "$SESSION_NAME:0.0" "cd /home/ridgetop/aidis" C-m
tmux send-keys -t "$SESSION_NAME:0.0" "clear" C-m
tmux send-keys -t "$SESSION_NAME:0.0" "echo ''" C-m
tmux send-keys -t "$SESSION_NAME:0.0" "echo '🚀 AIDIS Development Environment'" C-m
tmux send-keys -t "$SESSION_NAME:0.0" "echo '📝 Left pane: Claude Code work area'" C-m
tmux send-keys -t "$SESSION_NAME:0.0" "echo '📊 Top-right: Live logs'" C-m
tmux send-keys -t "$SESSION_NAME:0.0" "echo '⚡ Bottom-right: Quick commands'" C-m
tmux send-keys -t "$SESSION_NAME:0.0" "echo ''" C-m

# Pane 1 (top-right): Live logs
tmux send-keys -t "$SESSION_NAME:0.1" "cd /home/ridgetop/aidis" C-m
tmux send-keys -t "$SESSION_NAME:0.1" "echo 'Waiting for logs...'" C-m
tmux send-keys -t "$SESSION_NAME:0.1" "echo 'Start server with: ./scripts/start-with-logging.sh'" C-m
tmux send-keys -t "$SESSION_NAME:0.1" "echo 'Or run: ./scripts/tail-logs.sh'" C-m

# Pane 2 (bottom-right): Quick commands
tmux send-keys -t "$SESSION_NAME:0.2" "cd /home/ridgetop/aidis" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "clear" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "cat << 'EOF'" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "⚡ Quick Commands:" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "Start Server:" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "  ./scripts/start-with-logging.sh" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "View Logs:" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "  ./scripts/tail-logs.sh" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "TypeScript Check:" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "  cd mcp-server && npm run type-check" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "Run Tests:" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "  cd mcp-server && npm test" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "Kill Server:" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "  lsof -ti :3000 | xargs kill -9" C-m
tmux send-keys -t "$SESSION_NAME:0.2" "EOF" C-m

# Set active pane to work area (left)
tmux select-pane -t "$SESSION_NAME:0.0"

# Attach to session
echo "✅ Created tmux session '$SESSION_NAME'"
echo "Attaching now..."
sleep 1
tmux attach-session -t "$SESSION_NAME"
