# Spindles Proxy - Testing Guide

## Quick Start

### Step 1: Start the Proxy Server
```bash
cd /home/ridgetop/aidis/spindles-proxy
./start-spindles.sh
```

### Step 2: Start the Watcher (in a tmux pane)
```bash
cd /home/ridgetop/aidis/spindles-proxy
./watch-spindles.sh
```

### Step 3: Enable Proxy for Claude Code

**In a NEW terminal window**, run:
```bash
cd /home/ridgetop/aidis/spindles-proxy
source ./enable-proxy.sh
```

This sets `ANTHROPIC_BASE_URL=http://localhost:8082` for that terminal session.

### Step 4: Test with Claude Code
```bash
# Still in the same terminal from Step 3
claude "write a hello world function in python"
```

**You should see**:
- Thinking blocks appearing in your watch pane in real-time! 🎡
- The Claude Code session working normally (no impact on user experience)

---

## Understanding Environment Variables

**What is `ANTHROPIC_BASE_URL`?**
- It's an environment variable that tells Claude Code where to send API requests
- Default: `https://api.anthropic.com` (direct to Anthropic)
- With proxy: `http://localhost:8082` (routes through our proxy first)

**Why use `source`?**
- `source ./enable-proxy.sh` runs the script in your CURRENT shell
- This is required for `export` to affect YOUR terminal
- Without `source`, it runs in a subprocess and the variable doesn't persist

---

## Helper Scripts

### Enable Proxy
```bash
source ./enable-proxy.sh
```
Sets ANTHROPIC_BASE_URL to route through proxy

### Disable Proxy
```bash
source ./disable-proxy.sh
```
Removes ANTHROPIC_BASE_URL (back to direct connection)

### Check Proxy Status
```bash
./status-spindles.sh
```
Shows if proxy is running and recent spindles captured

---

## Permanent Setup (Optional)

To always route through the proxy, add to your `~/.bashrc` or `~/.zshrc`:

```bash
# Add this line
export ANTHROPIC_BASE_URL=http://localhost:8082
```

Then reload:
```bash
source ~/.bashrc  # or source ~/.zshrc
```

---

## Troubleshooting

**No spindles captured?**
1. Check proxy is running: `./status-spindles.sh`
2. Verify env var is set: `echo $ANTHROPIC_BASE_URL`
3. Make sure you used `source ./enable-proxy.sh` (not just `./enable-proxy.sh`)
4. Check you started Claude Code AFTER setting the variable

**Proxy not forwarding requests?**
- Check proxy logs in the terminal where `start-spindles.sh` is running
- Should see `[PROXY] POST /v1/messages` when requests come through

**Want to disable temporarily?**
```bash
source ./disable-proxy.sh
```

---

## Example Workflow

```bash
# Terminal 1: Start proxy
cd /home/ridgetop/aidis/spindles-proxy
./start-spindles.sh

# Terminal 2: Watch spindles
cd /home/ridgetop/aidis/spindles-proxy
./watch-spindles.sh

# Terminal 3: Use Claude Code with proxy
cd /home/ridgetop/aidis/spindles-proxy
source ./enable-proxy.sh
claude "explain what a spindle is"
# Watch Terminal 2 for captured thinking blocks! 🎡
```

---

## Technical Details

**How it works:**
1. Claude Code checks `ANTHROPIC_BASE_URL` environment variable
2. If set, sends requests there instead of `api.anthropic.com`
3. Our proxy receives the request on port 8082
4. Proxy forwards to real Anthropic API
5. As response streams back, proxy extracts `<thinking>` blocks
6. Proxy logs spindles to `logs/spindles.jsonl`
7. Proxy forwards full response unchanged to Claude Code
8. User sees no difference - perfect passthrough!

**Zero impact on user experience** - The proxy is completely transparent.
