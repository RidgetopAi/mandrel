# Migration Plan: DigitalOcean → Hetzner VPS

**Created**: 2025-11-24
**Status**: Ready to execute
**Savings**: $36/month ($432/year)

---

## 📊 Current State

### DigitalOcean VPS (ridgetopai-vps)
- **IP**: 157.245.216.232
- **Size**: 2GB RAM, 1 vCPU, 50GB disk
- **Cost**: $12/mo (would be $48/mo for 8GB upgrade)
- **Usage**: 18GB used (38%)
- **Contents**:
  - Mandrel backups (3 recent backups, ~314MB each)
  - omarchy-backup.tar.gz (5.2GB)
  - Website files (if any in /var/www/)

### Hetzner VPS (hetzner-vps) - **NEW**
- **IP**: 178.156.219.146
- **Size**: 16GB RAM, 4 vCPU, 150GB NVMe disk
- **Cost**: €12/mo (~$12/mo)
- **Usage**: 1.2GB used (1%) - fresh install
- **SSH**: `ssh hetzner-vps` ✅

---

## 🎯 Migration Strategy

### Safe, Zero-Downtime Approach

**NOT a cutover** - We'll:
1. Set up Hetzner VPS in parallel
2. Sync backups continuously to both VPSs
3. Deploy Keymaker to Hetzner
4. Test thoroughly for 1-2 weeks
5. Only cancel DO after Hetzner is proven stable

**Why this is safe**:
- DO VPS stays running during migration
- All backups exist in 3 places (local + both VPSs)
- Can rollback at any time
- No data loss risk

---

## 📝 Step-by-Step Migration

### Phase 1: Initial Hetzner Setup (15-20 minutes)

**1. Run the setup script:**
```bash
cd ~/mandrel
./scripts/hetzner-setup.sh
```

**This will:**
- Create backup directories (`/root/mandrel-backups/`, `/root/websites/`, `/root/archives/`)
- Install PostgreSQL 16 + pgvector extension
- Install Node.js 20.x
- Install Ollama
- Install nginx + certbot for SSL
- Create keymaker_production database
- Configure firewall (SSH + HTTPS)
- Set timezone to America/Chicago

**Or run manually via SSH:**
```bash
ssh hetzner-vps < ./scripts/hetzner-setup.sh
```

---

### Phase 2: Migrate Data from DO → Hetzner (30-60 minutes)

**2. Run the migration script:**
```bash
cd ~/mandrel
./scripts/migrate-to-hetzner.sh
```

**This will interactively:**
- Test connectivity to both VPSs
- Sync all Mandrel backups (DO → Hetzner)
- Ask if you want to migrate website files
- Ask if you want to migrate the 5.2GB archive
- Show summary of what was migrated

**What gets migrated:**
- ✅ Mandrel backups → `/root/mandrel-backups/` (3 backups, ~940MB)
- ✅ Website files (optional) → `/root/websites/`
- ✅ Large archives (optional) → `/root/archives/`

---

### Phase 3: Update Backup Scripts (5 minutes)

**3. Switch to the new backup script:**

Your current backup runs daily at 2:00 AM and syncs to DO VPS.

**Option A: Dual backup (safest for transition)**
Keep both scripts running for 1-2 weeks:
```bash
# Keep old script backing up to DO
crontab -l  # Check current cron

# Add new script backing up to Hetzner
0 2 * * * /home/ridgetop/mandrel/scripts/backup-aidis-hetzner.sh >> /home/ridgetop/mandrel/logs/backup-hetzner.log 2>&1
```

**Option B: Switch completely (after testing)**
```bash
# Replace old backup script with new one
cp scripts/backup-aidis.sh scripts/backup-aidis-DO-ORIGINAL.sh  # Save original
cp scripts/backup-aidis-hetzner.sh scripts/backup-aidis.sh     # Replace with Hetzner version

# Test it manually first
./scripts/backup-aidis.sh
```

**4. Test the new backup script:**
```bash
# Run manually to verify it works
./scripts/backup-aidis-hetzner.sh

# Check it created a backup locally
ls -lh ~/mandrel/backups/

# Check it synced to Hetzner
ssh hetzner-vps "ls -lh /root/mandrel-backups/"
```

---

### Phase 4: Deploy Keymaker to Hetzner (30-45 minutes)

**5. Clone Keymaker repo to Hetzner:**
```bash
ssh hetzner-vps

cd /root
git clone https://github.com/ridgetopai/keymaker.git  # Or copy from local
cd keymaker
npm install
```

**6. Set up Keymaker database:**
```bash
# Already created in Phase 1, but verify
psql -U ridgetop -d keymaker_production -c "SELECT version();"
psql -U ridgetop -d keymaker_production -c "\dx"  # Check pgvector installed
```

**7. Load schema:**
```bash
psql -U ridgetop -d keymaker_production < schema/mvk.sql
```

**8. Pull Ollama models:**
```bash
ollama pull nomic-embed-text
ollama pull llama3.2:3b
```

**9. Configure environment:**
```bash
cat > .env << EOF
KEYMAKER_ENV=production
DATABASE_URL=postgresql://ridgetop:ridgetop2024@localhost:5432/keymaker_production
KEYMAKER_TOKEN=$(openssl rand -hex 32)
EOF
```

**10. Test Keymaker CLI:**
```bash
npm run keymaker observe "Testing Keymaker on Hetzner VPS"
npm run keymaker list
npm run keymaker stats
```

**11. Start Keymaker API server:**
```bash
# Create systemd service
cat > /etc/systemd/system/keymaker.service << EOF
[Unit]
Description=Keymaker API Server
After=network.target postgresql.service

[Service]
Type=simple
User=root
WorkingDirectory=/root/keymaker
Environment=NODE_ENV=production
ExecStart=/usr/bin/npm run serve:prod
Restart=always

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable keymaker
systemctl start keymaker
systemctl status keymaker
```

**12. Configure nginx + SSL:**
```bash
cat > /etc/nginx/sites-available/keymaker << EOF
server {
    server_name keymaker.ridgetopai.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
EOF

ln -s /etc/nginx/sites-available/keymaker /etc/nginx/sites-enabled/
nginx -t
systemctl reload nginx

# Get SSL certificate
certbot --nginx -d keymaker.ridgetopai.com
```

**13. Update DNS:**
- Point `keymaker.ridgetopai.com` A record to `178.156.219.146`
- Wait 5-10 minutes for propagation

**14. Test from phone:**
```bash
# From your phone browser:
https://keymaker.ridgetopai.com/api/stats
```

---

### Phase 5: Parallel Operation & Validation (1-2 weeks)

**15. Run both VPSs in parallel:**
- DO VPS continues receiving backups
- Hetzner VPS also receiving backups
- Use Keymaker on Hetzner exclusively
- Monitor for any issues

**Daily checks:**
```bash
# Check Hetzner backups
ssh hetzner-vps "ls -lt /root/mandrel-backups/ | head -5"

# Check Keymaker service
ssh hetzner-vps "systemctl status keymaker"

# Check disk space
ssh hetzner-vps "df -h"
```

---

### Phase 6: Decommission DO VPS (After validation)

**16. Once Hetzner is proven stable (1-2 weeks):**

**Final data sync (if needed):**
```bash
# One last backup sync from DO to Hetzner
rsync -avz ridgetopai-vps:/root/mandrel-backups/ hetzner-vps:/root/mandrel-backups/
```

**Update crontab:**
```bash
# Remove old DO backup job (if running dual backups)
crontab -e
# Delete the line with backup-aidis.sh pointing to ridgetopai-vps
```

**Take final DO snapshot:**
```bash
# In DigitalOcean console, create a snapshot (just in case)
# Name it: "ridgetopai-vps-final-snapshot-2025-11-XX"
```

**Cancel DO VPS:**
- Go to DigitalOcean console
- Destroy the droplet
- **Save $36/month** 🎉

---

## 🔍 Verification Checklist

Before canceling DO VPS, verify:

- [ ] Hetzner VPS accessible via `ssh hetzner-vps`
- [ ] PostgreSQL running and accessible
- [ ] Keymaker database created with pgvector
- [ ] Ollama installed with models pulled
- [ ] Keymaker API server running on port 3001
- [ ] Nginx configured with SSL certificate
- [ ] DNS points to Hetzner IP (178.156.219.146)
- [ ] Keymaker accessible from phone via HTTPS
- [ ] Backup script runs successfully to Hetzner
- [ ] At least 3 backups exist on Hetzner VPS
- [ ] No errors in systemd logs: `ssh hetzner-vps journalctl -u keymaker -n 50`

---

## 🚨 Rollback Plan

If anything goes wrong, you can instantly rollback:

**Hetzner has issues:**
- Keep using DO VPS (still running)
- All backups still going to DO
- Zero downtime

**Need to restore backup:**
```bash
# On Hetzner, restore from backup
ssh hetzner-vps
cd /root/mandrel-backups/TIMESTAMP/
./restore.sh
```

---

## 📊 Cost Savings

| Item | DO Cost | Hetzner Cost | Savings |
|------|---------|--------------|---------|
| Current VPS | $12/mo | - | - |
| Upgrade needed | $48/mo | $12/mo | $36/mo |
| **Annual savings** | $576/yr | $144/yr | **$432/yr** |

Plus better specs:
- 8× more RAM (16GB vs 2GB)
- 4× more vCPU (4 vs 1)
- 3× more disk (150GB vs 50GB)
- NVMe SSD (faster than DO's SSD)

---

## 📁 Files Created

1. **`scripts/hetzner-setup.sh`** - Initial VPS setup script
2. **`scripts/migrate-to-hetzner.sh`** - Data migration script
3. **`scripts/backup-aidis-hetzner.sh`** - Updated backup script (points to Hetzner)
4. **`MIGRATION-PLAN-DO-TO-HETZNER.md`** - This document

---

## 🎯 Execution Order

**Today:**
1. Run `./scripts/hetzner-setup.sh` (Phase 1)
2. Run `./scripts/migrate-to-hetzner.sh` (Phase 2)
3. Test new backup script (Phase 3)

**Next session (when ready for Keymaker deployment):**
4. Deploy Keymaker (Phase 4)
5. Set up nginx + SSL (Phase 4)
6. Update DNS (Phase 4)

**Ongoing (1-2 weeks):**
7. Monitor both VPSs (Phase 5)
8. Use Keymaker on Hetzner exclusively

**After validation:**
9. Cancel DO VPS (Phase 6)
10. Celebrate $432/year savings! 🎉

---

## 💡 Pro Tips

1. **Keep DO running for 2 weeks** - Don't rush the cutover
2. **Monitor Hetzner disk space** - You have 150GB vs DO's 50GB
3. **Check backup logs daily** - `tail -f ~/mandrel/logs/backup-hetzner.log`
4. **Test restore once** - Verify backups actually work
5. **Take a DO snapshot before canceling** - One final safety net

---

## 🆘 Support

If you encounter issues:

1. **Check SSH connectivity**: `ssh hetzner-vps "echo test"`
2. **Check services**: `ssh hetzner-vps "systemctl status postgresql keymaker nginx"`
3. **Check logs**: `ssh hetzner-vps "journalctl -xe"`
4. **Verify backups**: `ssh hetzner-vps "ls -lh /root/mandrel-backups/"`

---

**Ready to start? Run Phase 1:**
```bash
cd ~/mandrel
./scripts/hetzner-setup.sh
```
