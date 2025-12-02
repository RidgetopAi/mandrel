#!/bin/bash
# Migration Script: DigitalOcean → Hetzner
# Safely migrates backups and website data

set -e

DO_VPS="ridgetopai-vps"
HETZNER_VPS="hetzner-vps"

echo "🚀 Starting Migration: DigitalOcean → Hetzner"
echo "=============================================="
echo ""

# Phase 1: Test Connectivity
echo "Phase 1: Testing VPS connectivity..."
if ssh $DO_VPS "echo 'DO VPS connected'" && ssh $HETZNER_VPS "echo 'Hetzner VPS connected'"; then
    echo "✅ Both VPSs are reachable"
else
    echo "❌ Connection failed. Check SSH config."
    exit 1
fi
echo ""

# Phase 2: Sync Mandrel Backups
echo "Phase 2: Syncing Mandrel backups..."
echo "Step 1: Pulling backups from DO VPS to local temp..."
TEMP_DIR=$(mktemp -d)
rsync -avz --progress $DO_VPS:/root/mandrel-backups/ "$TEMP_DIR/"
echo ""
echo "Step 2: Pushing backups from local to Hetzner VPS..."
rsync -avz --progress "$TEMP_DIR/" $HETZNER_VPS:/root/mandrel-backups/
rm -rf "$TEMP_DIR"
echo "✅ Mandrel backups synced"
echo ""

# Phase 3: Check for website files
echo "Phase 3: Checking for website files on DO VPS..."
ssh $DO_VPS "ls -lh /var/www/ 2>/dev/null || echo 'No /var/www/ directory found'"
echo ""
echo "Do you have a website on DO VPS that needs migrating? (y/n)"
read -p "> " MIGRATE_WEBSITE

if [ "$MIGRATE_WEBSITE" = "y" ]; then
    echo "Syncing website files..."
    TEMP_WEB=$(mktemp -d)
    rsync -avz --progress $DO_VPS:/var/www/ "$TEMP_WEB/"
    rsync -avz --progress "$TEMP_WEB/" $HETZNER_VPS:/root/websites/
    rm -rf "$TEMP_WEB"
    echo "✅ Website files synced to /root/websites/"
fi
echo ""

# Phase 4: Migrate large archives
echo "Phase 4: Checking for large archives..."
ssh $DO_VPS "ls -lh ~/*.tar.gz ~/*.zip 2>/dev/null || echo 'No archives found'"
echo ""
echo "Found omarchy-backup.tar.gz (5.2GB). Migrate this? (y/n)"
read -p "> " MIGRATE_ARCHIVE

if [ "$MIGRATE_ARCHIVE" = "y" ]; then
    echo "Syncing large archive (this may take a while - 5.2GB)..."
    TEMP_ARCH=$(mktemp -d)
    rsync -avz --progress $DO_VPS:/root/omarchy-backup.tar.gz "$TEMP_ARCH/"
    rsync -avz --progress "$TEMP_ARCH/omarchy-backup.tar.gz" $HETZNER_VPS:/root/archives/
    rm -rf "$TEMP_ARCH"
    echo "✅ Archive synced to /root/archives/"
fi
echo ""

# Phase 5: Summary
echo "✅ Migration Complete!"
echo "====================="
echo ""
echo "What was migrated:"
echo "  ✓ Mandrel backups → $HETZNER_VPS:/root/mandrel-backups/"
[ "$MIGRATE_WEBSITE" = "y" ] && echo "  ✓ Website files → $HETZNER_VPS:/root/websites/"
[ "$MIGRATE_ARCHIVE" = "y" ] && echo "  ✓ Archives → $HETZNER_VPS:/root/archives/"
echo ""
echo "Next steps:"
echo "1. Update backup scripts to use hetzner-vps"
echo "2. Test backup script with: ./scripts/backup-aidis.sh"
echo "3. Deploy Keymaker to Hetzner"
echo "4. Once verified, cancel DO VPS to save \$36/month"
echo ""
echo "Old DO VPS is still running - DO NOT CANCEL until you verify everything works!"
