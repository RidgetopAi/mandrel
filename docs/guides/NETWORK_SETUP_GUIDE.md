# Network Setup Guide - Desktop & Laptop

## Network Configuration

**Desktop (Arch Linux Full):**
- IP Address: `192.168.0.175`
- Network: WiFi (wlan0)
- OS: Arch Linux 6.17.8-arch1-1

**Laptop (Windows + WSL2):**
- Windows IP: `192.168.0.202`
- WSL2 IP: `172.24.232.232` (internal virtual network)
- OS: Windows with WSL2 (Ubuntu/Debian)

Both devices are on the same local network: `192.168.0.0/24`

---

## SSH Access: Desktop → Laptop

### SSH Key Authentication (Passwordless)

**Desktop has SSH key:** `~/.ssh/id_ed25519`
**Laptop authorized:** Desktop's public key is in `~/.ssh/authorized_keys`

### Connect from Desktop to Laptop

```bash
# Simple connection
ssh ridgetop@192.168.0.202

# Run commands remotely
ssh ridgetop@192.168.0.202 "ls -la"

# Copy files from laptop to desktop
scp ridgetop@192.168.0.202:/path/to/file /local/destination

# Copy directories recursively
scp -r ridgetop@192.168.0.202:/path/to/dir /local/destination
```

### WSL2 Port Forwarding Setup

**Problem:** WSL2 uses a virtual network (172.24.x.x), so services running in WSL2 aren't directly accessible from the LAN.

**Solution:** Windows port forwarding forwards LAN requests to WSL2.

**On Laptop (Windows PowerShell as Administrator):**
```powershell
# Forward SSH (port 22) from Windows to WSL2
netsh interface portproxy add v4tov4 listenport=22 listenaddress=0.0.0.0 connectport=22 connectaddress=172.24.232.232

# Allow through Windows Firewall
New-NetFirewallRule -DisplayName "SSH to WSL2" -Direction Inbound -LocalPort 22 -Protocol TCP -Action Allow

# Verify port forwarding
netsh interface portproxy show all
```

**To remove port forwarding:**
```powershell
netsh interface portproxy delete v4tov4 listenport=22 listenaddress=0.0.0.0
```

---

## Mandrel MCP Server Network Access

To make Mandrel accessible from both desktop and laptop:

### Option 1: Run Mandrel on Desktop (Recommended)

**Start Mandrel on desktop:**
```bash
cd ~/mandrel/mcp-server
./start-aidis.sh
# Mandrel runs on localhost:8080
```

**Access from laptop via SSH tunnel:**
```bash
# On laptop WSL2:
ssh -L 8080:localhost:8080 ridgetop@192.168.0.175

# Now laptop can access: http://localhost:8080
```

### Option 2: Run Mandrel on Laptop

**Start Mandrel in laptop WSL2:**
```bash
cd ~/mandrel/mcp-server
./start-aidis.sh
# Runs on WSL2 localhost:8080
```

**Setup port forwarding (PowerShell as Admin):**
```powershell
# Forward port 8080 from Windows to WSL2
netsh interface portproxy add v4tov4 listenport=8080 listenaddress=0.0.0.0 connectport=8080 connectaddress=172.24.232.232

# Allow through firewall
New-NetFirewallRule -DisplayName "Mandrel MCP" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
```

**Access from desktop:**
```bash
curl http://192.168.0.202:8080/mcp/tools/mandrel_ping
```

### Option 3: Mandrel on Both Machines

Run separate Mandrel instances on each machine, sharing the same PostgreSQL database.

**Desktop database connection string:**
```bash
postgresql://ridgetop@localhost:5432/mandrel
```

**Laptop connects to desktop's PostgreSQL:**
```bash
# On desktop: Edit PostgreSQL to allow remote connections
sudo nano /etc/postgresql/*/main/postgresql.conf
# Change: listen_addresses = 'localhost' → listen_addresses = '*'

sudo nano /etc/postgresql/*/main/pg_hba.conf
# Add: host all all 192.168.0.0/24 md5

sudo systemctl restart postgresql

# On laptop .env file:
DATABASE_HOST=192.168.0.175
DATABASE_PORT=5432
DATABASE_NAME=mandrel
DATABASE_USER=ridgetop
DATABASE_PASSWORD=your_password
```

---

## Common Network Tasks

### Check What's Listening on a Port

**Desktop:**
```bash
lsof -i :8080
ss -tlnp | grep 8080
```

**Laptop WSL2:**
```bash
sudo ss -tlnp | grep 8080
```

**Laptop Windows:**
```powershell
netstat -ano | findstr :8080
```

### Test Connectivity

**Ping (may be blocked by firewall):**
```bash
ping 192.168.0.202
```

**Test specific port:**
```bash
# From desktop:
ssh ridgetop@192.168.0.202 "echo 'Connection works!'"

# Test HTTP endpoint:
curl http://192.168.0.202:8080/api/health
```

### Find Your IP Address

**Desktop (Linux):**
```bash
ip addr show wlan0 | grep "inet "
# or
hostname -I
```

**Laptop WSL2:**
```bash
# WSL2 internal IP:
ip addr show eth0 | grep "inet "

# Windows IP (from WSL2):
ipconfig.exe | grep -A 4 "Wireless LAN"
```

**Laptop Windows:**
```powershell
ipconfig
```

---

## Firewall Rules Reference

### Windows Firewall (PowerShell as Admin)

**Allow specific port:**
```powershell
New-NetFirewallRule -DisplayName "Service Name" -Direction Inbound -LocalPort 8080 -Protocol TCP -Action Allow
```

**List firewall rules:**
```powershell
Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*Service*"}
```

**Remove rule:**
```powershell
Remove-NetFirewallRule -DisplayName "Service Name"
```

### Linux Firewall (if enabled)

**Check if firewall is active:**
```bash
sudo ufw status
```

**Allow port:**
```bash
sudo ufw allow 8080/tcp
```

---

## Troubleshooting

### SSH Connection Refused

1. **Check SSH is running on laptop:**
   ```bash
   sudo service ssh status
   sudo service ssh start
   ```

2. **Check port forwarding is configured:**
   ```powershell
   netsh interface portproxy show all
   ```

3. **Check firewall allows port 22:**
   ```powershell
   Get-NetFirewallRule | Where-Object {$_.DisplayName -like "*SSH*"}
   ```

### Can't Access Service on WSL2 from LAN

1. **Verify service is running in WSL2:**
   ```bash
   sudo ss -tlnp | grep PORT
   ```

2. **Check WSL2 IP hasn't changed:**
   ```bash
   ip addr show eth0 | grep "inet "
   # If changed, update port forwarding with new IP
   ```

3. **Recreate port forwarding with current WSL2 IP:**
   ```powershell
   # Delete old forwarding
   netsh interface portproxy delete v4tov4 listenport=PORT listenaddress=0.0.0.0

   # Add new forwarding with current WSL2 IP
   netsh interface portproxy add v4tov4 listenport=PORT listenaddress=0.0.0.0 connectport=PORT connectaddress=CURRENT_WSL2_IP
   ```

### WSL2 IP Keeps Changing

**Problem:** WSL2 IP changes on every restart.

**Solution:** Use a script to automatically update port forwarding.

**Create `update-wsl-forwarding.ps1` on Windows:**
```powershell
# Get current WSL2 IP
$wslIP = wsl hostname -I | ForEach-Object { $_.Trim() }

# Remove old forwarding
netsh interface portproxy delete v4tov4 listenport=22 listenaddress=0.0.0.0
netsh interface portproxy delete v4tov4 listenport=8080 listenaddress=0.0.0.0

# Add new forwarding
netsh interface portproxy add v4tov4 listenport=22 listenaddress=0.0.0.0 connectport=22 connectaddress=$wslIP
netsh interface portproxy add v4tov4 listenport=8080 listenaddress=0.0.0.0 connectport=8080 connectaddress=$wslIP

Write-Host "Port forwarding updated for WSL2 IP: $wslIP"
netsh interface portproxy show all
```

**Run on Windows startup or manually when WSL2 IP changes.**

---

## Quick Reference Commands

```bash
# SSH from desktop to laptop
ssh ridgetop@192.168.0.202

# Copy file from laptop to desktop
scp ridgetop@192.168.0.202:/path/file .

# Copy directory from laptop to desktop
scp -r ridgetop@192.168.0.202:/path/dir .

# Run command on laptop from desktop
ssh ridgetop@192.168.0.202 "command"

# SSH tunnel (forward laptop port to desktop)
ssh -L LOCAL_PORT:localhost:REMOTE_PORT ridgetop@192.168.0.202

# Check what's listening on port
lsof -i :PORT          # Linux
netstat -ano | findstr :PORT  # Windows
```

---

**Last Updated:** 2025-11-16
**Network:** 192.168.0.0/24
**Desktop IP:** 192.168.0.175
**Laptop Windows IP:** 192.168.0.202
**Laptop WSL2 IP:** 172.24.232.232 (may change on restart)
