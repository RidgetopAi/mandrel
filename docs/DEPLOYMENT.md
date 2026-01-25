# Mandrel VPS Deployment Guide

Complete guide for deploying Mandrel to a production VPS. This documents the actual production deployment on Hetzner VPS.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Provisioning](#server-provisioning)
3. [Database Setup](#database-setup)
4. [Security Hardening: Service User](#security-hardening-service-user)
5. [Application Deployment](#application-deployment)
6. [Secrets Management](#secrets-management)
7. [Systemd Service Configuration](#systemd-service-configuration)
8. [Nginx Configuration](#nginx-configuration)
9. [SSL Setup with Certbot](#ssl-setup-with-certbot)
10. [Verification Steps](#verification-steps)
11. [Log Locations](#log-locations)
12. [Update and Redeploy Instructions](#update-and-redeploy-instructions)

---

## Prerequisites

### VPS Requirements

- **OS**: Ubuntu 24.04 LTS (or similar Debian-based)
- **RAM**: Minimum 2GB (4GB recommended for embedding generation)
- **Storage**: 20GB+ SSD
- **CPU**: 2+ cores

### Software Requirements

| Software | Version | Purpose |
|----------|---------|---------|
| Node.js | 20.x | JavaScript runtime |
| npm | 10.x | Package manager |
| PostgreSQL | 16.x | Database with vector support |
| pgvector | 0.6.x | Vector similarity search |
| Nginx | 1.24+ | Reverse proxy |
| Certbot | Latest | SSL certificate management |

---

## Server Provisioning

### 1. Initial Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install essential tools
sudo apt install -y curl git build-essential

# Set up firewall
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

### 2. Install Node.js 20.x

```bash
# Add NodeSource repository
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -

# Install Node.js
sudo apt install -y nodejs

# Verify installation
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

### 3. Install PostgreSQL 16

```bash
# Add PostgreSQL repository
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update

# Install PostgreSQL 16 with pgvector
sudo apt install -y postgresql-16 postgresql-16-pgvector

# Start PostgreSQL
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

### 4. Install Nginx

```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

### 5. Install Certbot

```bash
sudo apt install -y certbot python3-certbot-nginx
```

---

## Database Setup

> **Note**: The production database was renamed from `aidis_production` to `mandrel` as part of the Mandrel rebranding. If you are migrating from an existing installation, see [Database Migration from aidis_production](#database-migration-from-aidis_production) below.

### 1. Create Database User and Database

```bash
# Switch to postgres user
sudo -u postgres psql

# In PostgreSQL shell:
CREATE USER ridgetop WITH PASSWORD 'your_secure_password';
CREATE DATABASE mandrel OWNER ridgetop;
GRANT ALL PRIVILEGES ON DATABASE mandrel TO ridgetop;
\q
```

### 2. Install Required Extensions

```bash
# Connect to the production database
sudo -u postgres psql -d mandrel

# Install extensions
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

# Verify extensions
\dx
```

**Expected Output:**
```
   Name    | Version |   Schema   |                            Description
-----------+---------+------------+-------------------------------------------------------------------
 pg_trgm   | 1.6     | public     | text similarity measurement and index searching based on trigrams
 pgcrypto  | 1.3     | public     | cryptographic functions
 plpgsql   | 1.0     | pg_catalog | PL/pgSQL procedural language
 uuid-ossp | 1.1     | public     | generate universally unique identifiers (UUIDs)
 vector    | 0.6.0   | public     | vector data type and ivfflat and hnsw access methods
```

### 3. Configure PostgreSQL Authentication

Edit `/etc/postgresql/16/main/pg_hba.conf`:

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

Ensure local connections use md5:
```
# IPv4 local connections:
host    all             all             127.0.0.1/32            md5
```

Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

### Database Migration from aidis_production

If you have an existing `aidis_production` database that needs to be renamed to `mandrel`, use the migration script:

```bash
# Copy the rename script to the VPS
scp scripts/rename-database.sh user@vps:/tmp/

# SSH to VPS
ssh user@vps

# Run in dry-run mode first to see what will happen
/tmp/rename-database.sh --dry-run

# Run the actual migration (requires stopping services first)
sudo systemctl stop mandrel
sudo systemctl stop mandrel-command
/tmp/rename-database.sh

# Update environment files to use DATABASE_NAME=mandrel
# Then restart services
sudo systemctl start mandrel
sudo systemctl start mandrel-command
```

The migration script will:
1. Create a full backup of the existing database
2. Terminate all active connections
3. Rename `aidis_production` to `mandrel`
4. Verify data integrity

**Important**: This migration requires a maintenance window as services must be stopped during the rename.

---

## Security Hardening: Service User

Services should run as a dedicated non-root user for security. This prevents potential exploits from gaining root access.

### 1. Create System User

```bash
# Create system user with no login shell or home directory
sudo useradd --system --no-create-home --shell /bin/false mandrel

# Create minimal home directory for npm cache
sudo mkdir -p /home/mandrel/.npm
sudo chown -R mandrel:mandrel /home/mandrel
```

### 2. Verify User Creation

```bash
id mandrel
# Expected: uid=995(mandrel) gid=986(mandrel) groups=986(mandrel)
```

**Note**: The UID/GID may differ on your system. The important thing is that the user exists as a system user.

---

## Application Deployment

### 1. Create Application Directory

```bash
sudo mkdir -p /opt/mandrel
# Initially owned by deploy user for setup
sudo chown $(whoami):$(whoami) /opt/mandrel

### 2. Clone Repository

```bash
cd /opt/mandrel
git clone https://github.com/RidgetopAi/mandrel.git .
# Or if deploying from local:
# rsync -avz --exclude 'node_modules' ~/aidis/ user@vps:/opt/mandrel/
```

### 3. Install Dependencies

```bash
# MCP Server
cd /opt/mandrel/mcp-server
npm install

# Mandrel Command Backend
cd /opt/mandrel/mandrel-command/backend
npm install

# Mandrel Command Frontend
cd /opt/mandrel/mandrel-command/frontend
npm install
npm run build
```

### 4. Configure Environment Files

#### MCP Server (`/opt/mandrel/mcp-server/.env`)

```bash
# Mandrel MCP Server - Production Configuration

# Database
DATABASE_USER=ridgetop
DATABASE_HOST=localhost
DATABASE_NAME=mandrel
DATABASE_PASSWORD=your_secure_password
DATABASE_PORT=5432

# Environment
NODE_ENV=production

# Logging
LOG_LEVEL=info
DB_LOG_LEVEL=warn

# Optional: Redis (for job queues)
REDIS_URL=redis://localhost:6379
```

#### Mandrel Command Backend (`/opt/mandrel/mandrel-command/backend/.env`)

```bash
# Mandrel Command Backend - Production Configuration

# Server Configuration
PORT=5000
NODE_ENV=production

# Frontend Configuration
FRONTEND_URL=https://command.yourdomain.com

# Database Configuration (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=mandrel
DB_USER=ridgetop
DB_PASSWORD=your_secure_password
DB_SSL=false

# MCP Server Configuration
AIDIS_MCP_HOST=localhost
AIDIS_MCP_PORT=8080

# Security
JWT_SECRET=generate_a_secure_random_string_here
BCRYPT_ROUNDS=12

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# CORS
CORS_ORIGIN=https://command.yourdomain.com

# API Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

#### Mandrel Command Frontend (`/opt/mandrel/mandrel-command/frontend/.env`)

```bash
VITE_API_URL=https://command.yourdomain.com
VITE_MCP_URL=https://mandrel.yourdomain.com
```

### 5. Run Database Migrations

```bash
cd /opt/mandrel/mcp-server
npx tsx src/database/migrate.ts
```

### 6. Transfer Ownership to Service User

After deployment, transfer ownership to the mandrel service user:

```bash
# Transfer application directory ownership
sudo chown -R mandrel:mandrel /opt/mandrel

# Create and set ownership of log files
sudo touch /var/log/mandrel-mcp.log /var/log/mandrel-command.log
sudo chown mandrel:mandrel /var/log/mandrel-mcp.log /var/log/mandrel-command.log

# If there are existing application logs
sudo chown -R mandrel:mandrel /opt/mandrel/mandrel-command/logs 2>/dev/null || true
```

---

## Secrets Management

**IMPORTANT**: Secrets (JWT tokens, API keys, passwords) should NEVER be stored directly in systemd service files. Systemd environment variables are visible via `systemctl show <service>`, which exposes secrets to any user who can run systemctl commands.

### Secure Secrets Storage

All secrets are stored in `/opt/mandrel/.env.secrets` with restrictive permissions.

#### 1. Create the Secrets File

```bash
sudo cat > /opt/mandrel/.env.secrets << 'EOF'
# Mandrel Secrets - DO NOT COMMIT THIS FILE
# Created: $(date -Iseconds)
# Permissions: 600 (owner read/write only)

# JWT Secret for Mandrel Command authentication
MANDREL_JWT_SECRET=your_secure_jwt_secret_here
EOF
```

#### 2. Set Secure Permissions

```bash
# Set ownership to mandrel service user
sudo chown mandrel:mandrel /opt/mandrel/.env.secrets

# Set restrictive permissions (only service user can read)
sudo chmod 600 /opt/mandrel/.env.secrets

# Verify permissions
ls -la /opt/mandrel/.env.secrets
# Expected: -rw------- 1 mandrel mandrel ... /opt/mandrel/.env.secrets
```

#### 3. Systemd Integration

Services load secrets via `EnvironmentFile` directive instead of inline `Environment=`:

```ini
[Service]
# Non-secret environment variables can be inline
Environment=NODE_ENV=production
Environment=MANDREL_JWT_EXPIRES_IN=24h

# Secrets loaded from file (not visible in systemctl show)
EnvironmentFile=/opt/mandrel/.env.secrets
```

#### 4. Verify Secrets Are Hidden

After configuration, verify secrets are not exposed:

```bash
# This should NOT show MANDREL_JWT_SECRET value
systemctl show mandrel-command --property=Environment

# Expected output (secret not visible):
# Environment=NODE_ENV=production MANDREL_JWT_EXPIRES_IN=24h
```

### Generating Secure Secrets

```bash
# Generate a secure JWT secret (256-bit, base64 encoded)
openssl rand -base64 32

# Example output: exbJVa7eEYfHpPv2OR/efdYvTW19rrz7Ngr+qSel8bI=
```

### Secrets Rotation

When rotating secrets:

1. Generate new secret
2. Update `/opt/mandrel/.env.secrets`
3. Restart affected services: `sudo systemctl restart mandrel-command`
4. Verify service health: `curl http://localhost:5000/api/health`

### Example Template

See `config/environments/.env.secrets.example` for the template structure.

---

## Systemd Service Configuration

### 1. Mandrel MCP Server Service

Create `/etc/systemd/system/mandrel.service`:

```ini
[Unit]
Description=Mandrel MCP Server
After=network.target postgresql.service
Wants=postgresql.service

[Service]
Type=simple
User=mandrel
Group=mandrel
WorkingDirectory=/opt/mandrel/mcp-server
Environment=NODE_ENV=production
EnvironmentFile=/opt/mandrel/mcp-server/.env
ExecStart=/usr/bin/npx tsx src/main.ts
Restart=always
RestartSec=10
StandardOutput=append:/var/log/mandrel-mcp.log
StandardError=append:/var/log/mandrel-mcp.log

[Install]
WantedBy=multi-user.target
```

**Note**: Services run as the `mandrel` user (not root) for security. Ensure `/opt/mandrel` is owned by `mandrel:mandrel`.

### 2. Mandrel Command Backend Service

Create `/etc/systemd/system/mandrel-command.service`:

```ini
[Unit]
Description=Mandrel Command Backend
After=network.target postgresql.service mandrel.service
Wants=postgresql.service

[Service]
Type=simple
User=mandrel
Group=mandrel
WorkingDirectory=/opt/mandrel/mandrel-command/backend
Environment=NODE_ENV=production
Environment=MANDREL_JWT_EXPIRES_IN=24h
EnvironmentFile=/opt/mandrel/.env.secrets
EnvironmentFile=/opt/mandrel/mandrel-command/backend/.env
ExecStart=/usr/bin/npx tsx src/server.ts
Restart=always
RestartSec=10
StandardOutput=append:/var/log/mandrel-command.log
StandardError=append:/var/log/mandrel-command.log

[Install]
WantedBy=multi-user.target
```

**Note**: Secrets like `MANDREL_JWT_SECRET` are loaded from `/opt/mandrel/.env.secrets` (see [Secrets Management](#secrets-management)). Never put secrets directly in systemd service files.

### 3. Enable and Start Services

```bash
# Reload systemd
sudo systemctl daemon-reload

# Enable services to start on boot
sudo systemctl enable mandrel
sudo systemctl enable mandrel-command

# Start services
sudo systemctl start mandrel
sudo systemctl start mandrel-command

# Check status
sudo systemctl status mandrel
sudo systemctl status mandrel-command
```

---

## Nginx Configuration

### 1. MCP Server (`/etc/nginx/sites-available/mandrel`)

```nginx
server {
    server_name mandrel.yourdomain.com;

    # MCP Server / Health endpoints
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }

    listen 80;
}
```

### 2. Mandrel Command (`/etc/nginx/sites-available/mandrel-command`)

```nginx
server {
    server_name command.yourdomain.com;

    # Frontend - serve static React build
    root /opt/mandrel/mandrel-command/frontend/build;
    index index.html;

    # API requests proxy to backend (port 5000)
    location /api {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }

    # MCP server proxy (port 8080) - for frontend direct calls
    location /mcp {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }

    # MCP v2 API proxy
    location /v2 {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
        proxy_connect_timeout 300s;
        proxy_send_timeout 300s;
    }

    # React SPA - handle client-side routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    listen 80;
}
```

### 3. Enable Sites

```bash
# Create symbolic links
sudo ln -s /etc/nginx/sites-available/mandrel /etc/nginx/sites-enabled/
sudo ln -s /etc/nginx/sites-available/mandrel-command /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Reload nginx
sudo systemctl reload nginx
```

---

## SSL Setup with Certbot

### 1. Obtain SSL Certificates

```bash
# For MCP server
sudo certbot --nginx -d mandrel.yourdomain.com

# For Command dashboard
sudo certbot --nginx -d command.yourdomain.com
```

Certbot will:
- Automatically obtain certificates from Let's Encrypt
- Configure nginx with SSL settings
- Set up automatic HTTP to HTTPS redirects
- Configure automatic renewal

### 2. Verify SSL Configuration

After Certbot runs, your nginx configs will be updated with:

```nginx
listen 443 ssl;
ssl_certificate /etc/letsencrypt/live/mandrel.yourdomain.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/mandrel.yourdomain.com/privkey.pem;
include /etc/letsencrypt/options-ssl-nginx.conf;
ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
```

### 3. Test Automatic Renewal

```bash
sudo certbot renew --dry-run
```

### 4. SSL Options Reference

Certbot creates `/etc/letsencrypt/options-ssl-nginx.conf` with secure defaults:

```nginx
ssl_session_cache shared:le_nginx_SSL:10m;
ssl_session_timeout 1440m;
ssl_session_tickets off;

ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;

ssl_ciphers "ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384";
```

---

## Verification Steps

### 1. Check Service Status

```bash
# Check all services
sudo systemctl status mandrel
sudo systemctl status mandrel-command
sudo systemctl status nginx
sudo systemctl status postgresql
```

### 2. Test MCP Health Endpoint

```bash
# Local test
curl http://localhost:8080/health

# Via domain (with SSL)
curl https://mandrel.yourdomain.com/health
```

**Expected Response:**
```json
{"status":"ok","version":"1.0.0","uptime":123.456}
```

### 3. Verify Services Run as Non-Root User

```bash
# Check that services are running as mandrel user (not root)
ps aux | grep tsx
# Expected: mandrel user (not root) for all processes
```

### 4. Test Database Connection

```bash
sudo -u postgres psql -d mandrel -c "SELECT COUNT(*) FROM projects;"
```

### 5. Test MCP Tool

```bash
curl -X POST http://localhost:8080/mcp/tools/mandrel_ping \
  -H "Content-Type: application/json" \
  -d '{"arguments": {}}'
```

**Expected Response:**
```json
{"content":[{"type":"text","text":"pong! Mandrel MCP Server is operational..."}]}
```

### 6. Access Dashboard

Open `https://command.yourdomain.com` in a browser and verify:
- Login page loads
- React SPA routes work
- API calls succeed (check browser console)

---

## Log Locations

| Log | Location | Description |
|-----|----------|-------------|
| MCP Server | `/var/log/mandrel-mcp.log` | MCP server application logs |
| Command Backend | `/var/log/mandrel-command.log` | Dashboard backend logs |
| Nginx Access | `/var/log/nginx/access.log` | HTTP access logs |
| Nginx Error | `/var/log/nginx/error.log` | Nginx error logs |
| PostgreSQL | `/var/log/postgresql/postgresql-16-main.log` | Database logs |
| Certbot | `/var/log/letsencrypt/letsencrypt.log` | SSL certificate logs |

### Viewing Logs

```bash
# Real-time MCP server logs
tail -f /var/log/mandrel-mcp.log

# Real-time Command backend logs
tail -f /var/log/mandrel-command.log

# Last 100 lines of nginx errors
tail -100 /var/log/nginx/error.log

# Follow all Mandrel logs
tail -f /var/log/mandrel-*.log
```

---

## Update and Redeploy Instructions

### 1. Quick Update (Code Only)

```bash
# SSH to VPS
ssh your-vps

# Pull latest code
cd /opt/mandrel
git pull origin main

# Rebuild frontend if changed
cd mandrel-command/frontend
npm install
npm run build

# Restart services
sudo systemctl restart mandrel
sudo systemctl restart mandrel-command
```

### 2. Full Redeploy

```bash
# SSH to VPS
ssh your-vps

# Stop services
sudo systemctl stop mandrel-command
sudo systemctl stop mandrel

# Backup current deployment
sudo cp -r /opt/mandrel /opt/mandrel.backup.$(date +%Y%m%d)

# Pull latest
cd /opt/mandrel
git fetch --all
git reset --hard origin/main

# Update dependencies
cd mcp-server && npm install
cd ../mandrel-command/backend && npm install
cd ../frontend && npm install && npm run build

# Run migrations if needed
cd /opt/mandrel/mcp-server
npx tsx src/database/migrate.ts

# Restart services
sudo systemctl start mandrel
sudo systemctl start mandrel-command

# Verify
curl https://mandrel.yourdomain.com/health
```

### 3. Database Backup Before Updates

```bash
# Create backup
sudo -u postgres pg_dump mandrel > /tmp/aidis_backup_$(date +%Y%m%d_%H%M%S).sql

# Restore if needed
sudo -u postgres psql mandrel < /tmp/aidis_backup_YYYYMMDD_HHMMSS.sql
```

### 4. Rollback Procedure

```bash
# Stop services
sudo systemctl stop mandrel-command
sudo systemctl stop mandrel

# Restore from backup
sudo rm -rf /opt/mandrel
sudo mv /opt/mandrel.backup.YYYYMMDD /opt/mandrel

# Restart services
sudo systemctl start mandrel
sudo systemctl start mandrel-command
```

---

## Production URLs (Current Deployment)

| Service | Internal Port | External URL |
|---------|---------------|--------------|
| MCP Server | 8080 | https://mandrel.ridgetopai.net |
| Command Dashboard | 5000 (API) | https://command.ridgetopai.net |
| Command Frontend | - (static) | https://command.ridgetopai.net |

---

## Troubleshooting

### Service Won't Start

```bash
# Check logs for errors
journalctl -u mandrel -n 50
journalctl -u mandrel-command -n 50

# Verify environment files exist
ls -la /opt/mandrel/mcp-server/.env
ls -la /opt/mandrel/mandrel-command/backend/.env
```

### Database Connection Errors

```bash
# Test PostgreSQL is running
sudo systemctl status postgresql

# Test connection manually
psql -h localhost -U ridgetop -d mandrel -c "SELECT 1;"

# Check pg_hba.conf for auth issues
sudo cat /etc/postgresql/16/main/pg_hba.conf | grep -v "^#"
```

### Nginx 502 Bad Gateway

```bash
# Check if backend services are running
sudo systemctl status mandrel
sudo systemctl status mandrel-command

# Check if ports are listening
ss -tlnp | grep -E '8080|5000'

# Check nginx error log
tail -50 /var/log/nginx/error.log
```

### Permission Denied Errors (EACCES)

If services fail with permission errors after switching to non-root user:

```bash
# Check file ownership
ls -la /opt/mandrel/

# Fix ownership if needed
sudo chown -R mandrel:mandrel /opt/mandrel

# Fix log file permissions
sudo chown mandrel:mandrel /var/log/mandrel-*.log

# Fix application log directory
sudo chown -R mandrel:mandrel /opt/mandrel/mandrel-command/logs

# NPM cache errors - create home directory for npm
sudo mkdir -p /home/mandrel/.npm
sudo chown -R mandrel:mandrel /home/mandrel

# Restart services
sudo systemctl restart mandrel mandrel-command
```

### SSL Certificate Issues

```bash
# Check certificate status
sudo certbot certificates

# Renew manually if needed
sudo certbot renew

# Check certificate dates
openssl s_client -connect mandrel.yourdomain.com:443 -servername mandrel.yourdomain.com </dev/null 2>/dev/null | openssl x509 -noout -dates
```

---

**Last Updated**: 2026-01-25
**Production Environment**: Ubuntu 24.04 LTS on Hetzner VPS
**Node.js Version**: 20.19.5
**PostgreSQL Version**: 16.11
