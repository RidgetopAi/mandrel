#!/bin/bash
# Setup automated AIDIS backups via cron

echo "🤖 Setting up AIDIS Backup Automation"

# Create cron jobs
CRON_JOBS="
# AIDIS Backup Jobs
# Quick backup every 2 hours (business hours)
0 8,10,12,14,16,18 * * 1-5 /home/ridgetop/aidis/scripts/quick-backup.sh >> /home/ridgetop/aidis/logs/backup.log 2>&1

# Full backup daily at 2 AM
0 2 * * * /home/ridgetop/aidis/scripts/backup-aidis.sh >> /home/ridgetop/aidis/logs/backup.log 2>&1

# Full backup before any major work (manual trigger)
# Run: /home/ridgetop/aidis/scripts/backup-aidis.sh
"

echo "Proposed cron schedule:"
echo "$CRON_JOBS"
echo ""
echo "To install these cron jobs, run:"
echo "  crontab -l > /tmp/current_cron"
echo "  echo '$CRON_JOBS' >> /tmp/current_cron"  
echo "  crontab /tmp/current_cron"
echo ""
echo "To view current cron jobs: crontab -l"
echo "To remove AIDIS cron jobs: crontab -e (then delete the AIDIS lines)"
