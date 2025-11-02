# Spindles Proxy - Quick Start Guide

## Every Time Procedure

### 1. Start the Proxy
```bash
cd /home/ridgetop/aidis/spindles-proxy
./start-spindles.sh
```

### 2. Start the Watcher (in tmux pane)
```bash
cd /home/ridgetop/aidis/spindles-proxy
./watch-spindles.sh
```

### 3. Set Environment Variable
```bash
export ANTHROPIC_BASE_URL=http://localhost:8082
```

### 4. Verify It's Set
```bash
echo $ANTHROPIC_BASE_URL
# Should show: http://localhost:8082
```

### 5. Start Claude
```bash
claude
```

---

## Reset/Unset the Export

### To disable proxy routing:
```bash
unset ANTHROPIC_BASE_URL
```

### To verify it's unset:
```bash
echo $ANTHROPIC_BASE_URL
# Should show nothing (empty)
```

### To re-enable:
```bash
export ANTHROPIC_BASE_URL=http://localhost:8082
```

---

## If Proxy Crashed (After Tmux Kill)

### Quick recovery:
```bash
# 1. Restart proxy
cd /home/ridgetop/aidis/spindles-proxy
./start-spindles.sh

# 2. Set env var again
export ANTHROPIC_BASE_URL=http://localhost:8082

# 3. Verify
echo $ANTHROPIC_BASE_URL

# 4. Start Claude
claude
```

---

## Helper Scripts

All in `/home/ridgetop/aidis/spindles-proxy/`:

| Script | Purpose |
|--------|---------|
| `start-spindles.sh` | Start the proxy server |
| `stop-spindles.sh` | Stop the proxy server |
| `status-spindles.sh` | Check status and recent spindles |
| `watch-spindles.sh` | Live viewer for thinking blocks |
| `enable-proxy.sh` | Set ANTHROPIC_BASE_URL (use with `source`) |
| `disable-proxy.sh` | Unset ANTHROPIC_BASE_URL (use with `source`) |

**Important:** Use `source ./enable-proxy.sh` not `./enable-proxy.sh`

---

## One-Liner for Quick Reset

```bash
cd /home/ridgetop/aidis/spindles-proxy && ./start-spindles.sh && export ANTHROPIC_BASE_URL=http://localhost:8082 && echo "Ready! ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL"
```
