# Linux Process Management Quick Reference

## Finding Running Processes

### By Process Name
```bash
# Simple search (shows PID only)
pgrep node

# With full command line (-a) and process details (-f)
pgrep -af "node|tsx"

# Search for specific server
pgrep -af "forge-studio|tsx.*server.ts"

# Using ps + grep
ps aux | grep node | grep -v grep
```

### By Port Number
```bash
# Find process using specific port (no sudo needed)
lsof -i :3000

# Find all listening Node processes
lsof -i -P -n | grep LISTEN | grep node

# Using netstat (if available)
netstat -tlnp 2>/dev/null | grep :3000

# Using ss (modern replacement for netstat)
ss -tlnp | grep :3000
```

### Get Detailed Process Info
```bash
# Basic info for specific PID
ps aux | grep 12345

# Full command line and environment
ps -p 12345 -f

# Working directory from /proc filesystem
readlink -f /proc/12345/cwd

# See all file descriptors (including log files!)
ls -la /proc/12345/fd/

# See what files process has open
lsof -p 12345

# CPU and memory usage over time
top -p 12345

# Better alternative to top (if installed)
htop -p 12345
```

## Viewing Logs

### Find Log Files Process is Writing To
```bash
# Check file descriptors for log files
ls -la /proc/12345/fd/ | grep -E "log|out|err"

# Example output:
# l-wx------ 1 user user 64 Nov 16 05:43 1 -> /tmp/app.log
# l-wx------ 1 user user 64 Nov 16 05:43 2 -> /tmp/app.log
```

### Tail Log Files
```bash
# View last 20 lines
tail -n 20 /tmp/app.log

# Follow log in real-time (-f for follow)
tail -f /tmp/app.log

# Follow multiple logs at once
tail -f /tmp/app.log /var/log/other.log

# Show last 50 lines and follow
tail -n 50 -f /tmp/app.log

# Filter logs while following
tail -f /tmp/app.log | grep ERROR
```

### For Systemd Services
```bash
# View service logs
journalctl -u service-name

# Last 50 lines
journalctl -u service-name -n 50

# Follow in real-time
journalctl -u service-name -f

# Today's logs only
journalctl -u service-name --since today
```

## Process Management

### Killing Processes
```bash
# Graceful shutdown (SIGTERM)
kill 12345

# Force kill (SIGKILL - use as last resort)
kill -9 12345

# Kill by name (kills ALL matching processes)
pkill node

# Kill with pattern
pkill -f "forge-studio"

# Interactive kill with confirmation
htop  # then press F9 to select signal
```

### Checking if Process is Running
```bash
# Exit code 0 if running, 1 if not
pgrep -x node > /dev/null && echo "Running" || echo "Not running"

# Count number of instances
pgrep node | wc -l

# Check specific process by PID
ps -p 12345 > /dev/null && echo "Running" || echo "Stopped"
```

## Practical Workflows

### Workflow 1: "What's running on port 3000?"
```bash
lsof -i :3000
# Shows: PID, process name, user
```

### Workflow 2: "Show me all Node processes and their logs"
```bash
# Find all node processes
pgrep -af node

# For each PID, check its log files
ls -la /proc/PID/fd/ | grep log

# Tail the log
tail -f /path/to/log.log
```

### Workflow 3: "Is my server running and where?"
```bash
# Find process
PID=$(pgrep -f "forge-studio")

# Get working directory
readlink -f /proc/$PID/cwd

# Check ports it's listening on
lsof -p $PID | grep LISTEN

# View recent logs
ls -la /proc/$PID/fd/ | grep log | awk '{print $NF}' | xargs tail -n 20
```

### Workflow 4: "Debug a misbehaving process"
```bash
# Check CPU/memory usage
ps aux | grep 12345

# See what files it has open
lsof -p 12345

# Trace system calls (advanced)
strace -p 12345

# Check network connections
lsof -i -a -p 12345
```

## Common Scenarios

### Scenario: "Just started a server, can't see logs"
```bash
# 1. Find the process
pgrep -af "server.ts"

# 2. Get its PID (example: 12345)
# 3. Check what log files it's writing to
ls -la /proc/12345/fd/ | grep -E "log|out|err"

# 4. Tail the log file
tail -f /path/from/step3
```

### Scenario: "Port already in use error"
```bash
# Find what's using the port
lsof -i :3000

# Kill it if needed
kill $(lsof -t -i :3000)
```

### Scenario: "Multiple node processes, which is which?"
```bash
# Show full command lines with PIDs
ps aux | grep node | grep -v grep

# Or more readable
pgrep -af node

# Check working directory to identify
for pid in $(pgrep node); do
  echo "PID: $pid - CWD: $(readlink -f /proc/$pid/cwd 2>/dev/null)"
done
```

## Pro Tips

1. **Bookmark your log directories**
   ```bash
   # Add to ~/.bashrc
   alias logs='cd ~/mandrel/mandrel-command/logs'
   alias taillogs='tail -f ~/mandrel/mandrel-command/logs/*.log'
   ```

2. **Create process monitoring aliases**
   ```bash
   # Add to ~/.bashrc
   alias psnode='pgrep -af node'
   alias pstsx='pgrep -af tsx'
   alias ports='lsof -i -P -n | grep LISTEN'
   ```

3. **Use watch for real-time monitoring**
   ```bash
   watch -n 1 'ps aux | grep node | grep -v grep'
   ```

4. **tmux/screen for persistent sessions**
   - Run servers in tmux/screen sessions
   - Detach and reattach to see logs anytime
   - Logs persist even if you disconnect

5. **Process groups and job control**
   ```bash
   # Run in background
   npm run dev &

   # List background jobs
   jobs

   # Bring to foreground
   fg %1

   # Send to background
   bg %1
   ```

## Quick Command Reference Card

```
FIND PROCESS:
  pgrep -af <name>           # Search by name with full command
  lsof -i :PORT             # Find by port
  ps aux | grep <name>      # Traditional search

GET DETAILS:
  ps -p PID -f              # Full process info
  readlink /proc/PID/cwd    # Working directory
  ls -la /proc/PID/fd/      # Open files/logs
  lsof -p PID               # All open files

VIEW LOGS:
  tail -f /path/to/log      # Follow log file
  ls /proc/PID/fd/ | grep log  # Find log files
  journalctl -f -u service  # Systemd service logs

MANAGE:
  kill PID                  # Graceful stop
  kill -9 PID               # Force stop
  pkill -f pattern          # Kill by pattern
```

---

**Created**: 2025-11-16
**System**: Arch Linux (full Linux desktop, migrated from WSL2)
