#!/bin/bash

# AIDIS Weekly Backup Compression Script
# Compresses older backups into weekly archives

set -e  # Exit on error

BACKUP_DIR="/home/ridgetop/aidis/backups"
ARCHIVE_DIR="/home/ridgetop/aidis/backups/weekly_archives"
TIMESTAMP=$(date +"%Y%m%d")
CURRENT_WEEK=$(date +"%Y-W%U")

echo "📦 AIDIS Weekly Backup Compression - $TIMESTAMP"

# Create archive directory
mkdir -p "$ARCHIVE_DIR"

# Find backups older than 7 days
WEEK_AGO=$(date -d "7 days ago" +"%Y%m%d")

echo "🔍 Looking for backups older than $WEEK_AGO..."

# Get list of backup directories older than 7 days
OLD_BACKUPS=$(find "$BACKUP_DIR" -maxdepth 1 -type d -name "20*" | while read backup; do
    backup_date=$(basename "$backup" | cut -d'_' -f1)
    if [[ "$backup_date" < "$WEEK_AGO" ]]; then
        echo "$backup"
    fi
done)

if [ -z "$OLD_BACKUPS" ]; then
    echo "ℹ️  No old backups found to compress"
    exit 0
fi

# Create weekly archive
ARCHIVE_NAME="aidis_weekly_${CURRENT_WEEK}_${TIMESTAMP}.tar.gz"
ARCHIVE_PATH="$ARCHIVE_DIR/$ARCHIVE_NAME"

echo "📦 Creating weekly archive: $ARCHIVE_NAME"
echo "📂 Archiving $(echo "$OLD_BACKUPS" | wc -l) backup directories..."

# Create compressed archive
tar -czf "$ARCHIVE_PATH" -C "$BACKUP_DIR" $(echo "$OLD_BACKUPS" | xargs -n1 basename)

if [ $? -eq 0 ]; then
    # Verify archive integrity
    echo "🔍 Verifying archive integrity..."
    tar -tzf "$ARCHIVE_PATH" > /dev/null
    
    if [ $? -eq 0 ]; then
        # Archive verified, remove original directories
        echo "✅ Archive verified, removing original backup directories..."
        echo "$OLD_BACKUPS" | xargs rm -rf
        
        # Create archive info file
        cat > "$ARCHIVE_DIR/${ARCHIVE_NAME%.tar.gz}_info.txt" << EOF
AIDIS Weekly Archive Information
================================
Archive: $ARCHIVE_NAME
Created: $(date)
Week: $CURRENT_WEEK
Host: $(hostname)

Archived Backups:
$(echo "$OLD_BACKUPS" | xargs -n1 basename)

Archive Size: $(du -sh "$ARCHIVE_PATH" | cut -f1)

Extraction:
tar -xzf "$ARCHIVE_NAME" -C /desired/location/

Notes:
- This archive contains complete AIDIS backups with restore scripts
- Each backup directory contains database dumps, code, and configs
- Extract individual backup directories as needed
EOF
        
        echo "✅ Weekly compression complete!"
        echo "📦 Archive: $ARCHIVE_PATH"
        echo "📊 Size: $(du -sh "$ARCHIVE_PATH" | cut -f1)"
        echo "📋 Info: $ARCHIVE_DIR/${ARCHIVE_NAME%.tar.gz}_info.txt"
    else
        echo "❌ Archive verification failed! Keeping original backups."
        rm -f "$ARCHIVE_PATH"
        exit 1
    fi
else
    echo "❌ Archive creation failed!"
    exit 1
fi

# Cleanup very old archives (keep last 8 weeks = 2 months)
echo "🧹 Cleaning up old weekly archives (keeping last 8)..."
cd "$ARCHIVE_DIR"
ls -1t aidis_weekly_*.tar.gz 2>/dev/null | tail -n +9 | xargs rm -f 2>/dev/null || echo "No old archives to clean"
ls -1t aidis_weekly_*_info.txt 2>/dev/null | tail -n +9 | xargs rm -f 2>/dev/null || echo "No old info files to clean"

echo "🎉 Weekly backup compression completed successfully!"

# Summary
echo ""
echo "📊 Current Backup Storage:"
echo "=========================="
echo "Recent backups: $(find "$BACKUP_DIR" -maxdepth 1 -type d -name "20*" | wc -l) directories"
echo "Quick backups:  $(ls -1 "$BACKUP_DIR"/quick/*.backup 2>/dev/null | wc -l) files"
echo "Weekly archives: $(ls -1 "$ARCHIVE_DIR"/aidis_weekly_*.tar.gz 2>/dev/null | wc -l) archives"
echo ""
echo "Total backup storage: $(du -sh "$BACKUP_DIR" | cut -f1)"
