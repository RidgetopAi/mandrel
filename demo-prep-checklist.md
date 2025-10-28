# AIDIS Podcast Demo - Pre-Flight Checklist

## Before You Sleep Tonight:

- [x] Backups verified (DONE - you have 8 days of backups)
- [ ] Run one more manual backup NOW
- [ ] Test restore (5 minutes - optional but recommended)
- [ ] Practice demo flow 3 times
- [ ] Document known limitations
- [ ] Restart all services fresh

## Quick Backup Right Now:

```bash
cd /home/ridgetop/aidis
./scripts/quick-backup.sh
```

## Quick Restore Test (Optional - 5 min):

```bash
# This creates a TEST database, doesn't touch production
cd /home/ridgetop/aidis/backups/20251028_021926
./restore.sh
# Verify: psql -d aidis_production_restored -c "\dt"
# Cleanup: dropdb aidis_production_restored
```

## Known Limitations to Mention:

1. "State sync between MCP tools and UI requires manual refresh"
2. "Best used with one Claude Code session at a time"
3. "Real-time sync is planned for next sprint"

## Demo Flow Practice:

1. Show Dashboard → Projects
2. Show Context semantic search
3. Show Dependency Visualizations (NEW!)
4. Show Session tracking
5. Talk about 100% LLM-built journey

## Emergency Restore (if demo breaks):

```bash
# Stop services
./stop-aidis.sh

# Restore from this morning's backup
cd /home/ridgetop/aidis/backups/20251028_021926
./restore.sh

# Rename database
psql -c "DROP DATABASE aidis_production;"
psql -c "ALTER DATABASE aidis_production_restored RENAME TO aidis_production;"

# Restart
./start-aidis.sh
```

## Services Status Check:

```bash
# Verify all 3 services running
curl http://localhost:8080/healthz  # MCP Server
curl http://localhost:5000/api/health  # Backend
curl http://localhost:3000  # Frontend (should return HTML)
```
