#!/bin/bash
# Mandrel TENANT Backup Script  (per-tenant Docker Postgres + registry + secrets)
# -----------------------------------------------------------------------------
# Companion to the host pipeline (backup-mandrel-vps.sh + offsite-mandrel-b2.sh).
# The host scripts back up ONLY the host `mandrel` DB. This script backs up the
# per-customer TENANT databases, which run in `mandrel-<h>-postgres` containers,
# plus the tenant registry, plus (LOCAL ONLY) the per-tenant secret env files.
#
# Modelled on the prod pipeline conventions:
#   - verify-then-promote: dump to a temp file, integrity-check, only then move
#     into the dated folder (a failed dump never leaves a fake "success" folder).
#   - integrity check per dump: pg_restore --list succeeds, non-empty, object floor.
#   - off-site to Backblaze B2 with `rclone copy` + `rclone check` (hash verify).
#   - retention: 14 local / 30 remote dated folders.
#
# SCOPE / SAFETY (this script is intentionally conservative):
#   - READ-ONLY on tenant data: `pg_dump` only. The restore DRILL restores into a
#     THROWAWAY scratch DB inside the same container and DROPS it — it never
#     touches the live tenant DB.
#   - ADDITIVE files only under /root/mandrel-backups/tenants/<TS>/.
#   - Off-site uploads DBs + registry ONLY. Secrets are NEVER pushed off-site
#     unless OFFSITE_SECRETS=1 is explicitly set (default OFF — Brian's pending
#     decision). The default off-site set excludes every *.env.
#   - Never prints/logs secret VALUES. Creds are read from container env into
#     locals and used as args only.
#
# USAGE:
#   backup-tenants-vps.sh                 # full run: dump all active tenants,
#                                         # registry, secrets(local), drill, off-site
#   OUTPUT_ROOT=/root/x backup-...sh      # override local output root (for testing)
#   NO_OFFSITE=1 backup-tenants-vps.sh    # skip the B2 upload entirely
#   OFFSITE_SECRETS=1 backup-...sh        # (DANGER) also push secrets off-site — OFF by default
#   NO_DRILL=1 backup-tenants-vps.sh      # skip the restore drill
#
# Exit non-zero on any failure. Designed to run from cron as root.

set -euo pipefail

# --- Config -------------------------------------------------------------------
REGISTRY="${REGISTRY:-/root/mandrel-registry.json}"
OUTPUT_ROOT="${OUTPUT_ROOT:-/root/mandrel-backups/tenants}"
SECRETS_GLOB_DIR="${SECRETS_GLOB_DIR:-/root}"           # where .mandrel-*.env live
LOG_FILE="${LOG_FILE:-/var/log/mandrel-tenant-backup.log}"
REMOTE="${REMOTE:-b2:RidgetopAi/mandrel-tenants}"
RCLONE_CONF="${RCLONE_CONF:-/root/.config/rclone/rclone.conf}"

KEEP_LOCAL="${KEEP_LOCAL:-14}"     # local dated folders to keep
KEEP_REMOTE="${KEEP_REMOTE:-30}"   # remote dated folders to keep

# Integrity floors. Tenant dumps are ~400KB-550KB of custom-format archive.
MIN_DUMP_BYTES="${MIN_DUMP_BYTES:-50000}"    # 50KB floor (a fresh tenant is still >50KB)
MIN_OBJECTS="${MIN_OBJECTS:-100}"            # object-count floor from pg_restore --list

# Toggles (env-overridable)
NO_OFFSITE="${NO_OFFSITE:-0}"
OFFSITE_SECRETS="${OFFSITE_SECRETS:-0}"      # default OFF — never push secrets off-site
NO_DRILL="${NO_DRILL:-0}"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DEST_DIR="$OUTPUT_ROOT/$TIMESTAMP"
TMP_ROOT="$(mktemp -d /tmp/mandrel-tenant-bk.XXXXXX)"

# Counters used by the final SUCCESS line / alerting.
TENANTS_OK=0
TENANTS_FAILED=0
DRILL_OK=0
DRILL_FAILED=0

log() {
    echo "[$(date)] tenant-backup: $1" | tee -a "$LOG_FILE"
}

cleanup() {
    rm -rf "$TMP_ROOT" 2>/dev/null || true
}
trap cleanup EXIT

fail() {
    log "FAILURE: $1"
    log "=== Tenant Backup FAILED ==="
    exit 1
}

log "=== Mandrel Tenant Backup Starting (ts=$TIMESTAMP) ==="

# --- 0. Sanity checks ---------------------------------------------------------
command -v docker >/dev/null 2>&1 || fail "docker not found on PATH"
command -v jq     >/dev/null 2>&1 || fail "jq not found on PATH"
[ -r "$REGISTRY" ] || fail "registry not readable at $REGISTRY"

# --- 1. Resolve ACTIVE tenants from the registry ------------------------------
# Active = registry status 'active' AND a running mandrel-<h>-postgres container.
# (A registry-active tenant with no running pg container — e.g. mid-migration —
#  is skipped with a WARN rather than failing the whole run.)
mapfile -t ACTIVE_TENANTS < <(jq -r '.tenants | to_entries[] | select(.value.status=="active") | .key' "$REGISTRY")
[ "${#ACTIVE_TENANTS[@]}" -gt 0 ] || fail "no active tenants found in registry"
log "Active tenants in registry: ${ACTIVE_TENANTS[*]}"

# --- 2. Promote: build the dated dir only after we have at least one good dump -
# We dump into $TMP_ROOT first, integrity-check, and move good dumps into a
# staging dir. Only at the end do we promote staging -> $DEST_DIR.
STAGING="$TMP_ROOT/staging"
mkdir -p "$STAGING"

dump_tenant() {
    local h="$1"
    local container="mandrel-${h}-postgres"

    if ! docker ps --format '{{.Names}}' | grep -qx "$container"; then
        log "WARN: $container not running — skipping tenant '$h' (registry-active but no pg container)"
        return 2
    fi

    # Read creds from container env into locals. NEVER echoed.
    local pguser pgdb
    pguser="$(docker exec "$container" printenv POSTGRES_USER 2>/dev/null || true)"
    pgdb="$(docker exec "$container" printenv POSTGRES_DB 2>/dev/null || true)"
    if [ -z "$pguser" ] || [ -z "$pgdb" ]; then
        log "ERROR: could not read POSTGRES_USER/DB from $container env — skipping '$h'"
        return 1
    fi

    local tmp_dump="$TMP_ROOT/${h}.dump"
    log "Dumping tenant '$h' from $container ..."
    if ! docker exec "$container" pg_dump -U "$pguser" -Fc -d "$pgdb" > "$tmp_dump" 2>>"$LOG_FILE"; then
        log "ERROR: pg_dump failed for tenant '$h'"
        rm -f "$tmp_dump"
        return 1
    fi

    # Integrity: size floor.
    local bytes
    bytes="$(stat -c %s "$tmp_dump" 2>/dev/null || echo 0)"
    if [ "$bytes" -lt "$MIN_DUMP_BYTES" ]; then
        log "ERROR: tenant '$h' dump too small: ${bytes} bytes (< ${MIN_DUMP_BYTES})"
        rm -f "$tmp_dump"
        return 1
    fi

    # Integrity: pg_restore --list must succeed and report >= MIN_OBJECTS objects.
    local objects
    if ! pg_restore --list "$tmp_dump" >/dev/null 2>&1; then
        log "ERROR: tenant '$h' dump is not a valid archive (pg_restore --list failed)"
        rm -f "$tmp_dump"
        return 1
    fi
    objects="$(pg_restore --list "$tmp_dump" 2>/dev/null | grep -c ';' || true)"
    if [ "${objects:-0}" -lt "$MIN_OBJECTS" ]; then
        log "ERROR: tenant '$h' dump reported ${objects} objects (< ${MIN_OBJECTS} floor)"
        rm -f "$tmp_dump"
        return 1
    fi

    mv "$tmp_dump" "$STAGING/${h}.dump"
    log "OK: tenant '$h' dump verified (${bytes} bytes, ${objects} objects)"
    return 0
}

# --- 3. Restore drill (non-destructive) ---------------------------------------
# Restore the just-made dump into a throwaway scratch DB INSIDE the tenant's own
# container (guarantees PG-version match), compare row counts for a stable set of
# core tables vs the live source, then DROP the scratch DB. Never mutates the
# live tenant DB. Returns 0 on match, 1 on mismatch/error.
restore_drill() {
    local h="$1"
    local container="mandrel-${h}-postgres"
    local dump="$STAGING/${h}.dump"
    [ -f "$dump" ] || { log "DRILL WARN: no dump for '$h' to drill"; return 1; }

    local pguser pgdb
    pguser="$(docker exec "$container" printenv POSTGRES_USER 2>/dev/null || true)"
    pgdb="$(docker exec "$container" printenv POSTGRES_DB 2>/dev/null || true)"
    [ -n "$pguser" ] && [ -n "$pgdb" ] || { log "DRILL ERROR: no creds for '$h'"; return 1; }

    local scratch="ci_restoredrill_${h}_$$"
    # Tables present in every tenant (Mandrel core). Compared as an ordered list.
    local count_sql="SELECT 'contexts',count(*) FROM contexts UNION ALL SELECT 'tasks',count(*) FROM tasks UNION ALL SELECT 'projects',count(*) FROM projects ORDER BY 1;"

    local src_counts scratch_counts
    src_counts="$(docker exec "$container" psql -U "$pguser" -d "$pgdb" -tA -c "$count_sql" 2>/dev/null || true)"

    if ! docker exec "$container" createdb -U "$pguser" "$scratch" 2>>"$LOG_FILE"; then
        log "DRILL ERROR: could not create scratch DB for '$h'"
        return 1
    fi

    # Restore the staged dump into the scratch DB. Stream it in over stdin.
    if ! docker exec -i "$container" pg_restore -U "$pguser" -d "$scratch" --no-owner --no-privileges < "$dump" 2>>"$LOG_FILE"; then
        # pg_restore can exit non-zero on benign warnings; we still compare counts.
        log "DRILL WARN: pg_restore returned non-zero for '$h' scratch (checking row counts anyway)"
    fi

    scratch_counts="$(docker exec "$container" psql -U "$pguser" -d "$scratch" -tA -c "$count_sql" 2>/dev/null || true)"

    # Always drop the scratch DB.
    docker exec "$container" dropdb -U "$pguser" "$scratch" 2>>"$LOG_FILE" || \
        log "DRILL WARN: failed to drop scratch DB $scratch for '$h' (manual cleanup may be needed)"

    if [ -z "$src_counts" ] || [ -z "$scratch_counts" ]; then
        log "DRILL FAIL: '$h' empty count result (src or scratch)"
        return 1
    fi
    if [ "$src_counts" == "$scratch_counts" ]; then
        log "DRILL OK: '$h' row counts match source [$(echo "$src_counts" | tr '\n' ' ')]"
        return 0
    else
        log "DRILL FAIL: '$h' row-count MISMATCH. source=[$(echo "$src_counts" | tr '\n' ' ')] scratch=[$(echo "$scratch_counts" | tr '\n' ' ')]"
        return 1
    fi
}

# --- Run dumps for every active tenant ----------------------------------------
for h in "${ACTIVE_TENANTS[@]}"; do
    if dump_tenant "$h"; then
        TENANTS_OK=$((TENANTS_OK + 1))
        if [ "$NO_DRILL" != "1" ]; then
            if restore_drill "$h"; then
                DRILL_OK=$((DRILL_OK + 1))
            else
                DRILL_FAILED=$((DRILL_FAILED + 1))
            fi
        fi
    else
        rc=$?
        # rc 2 = skipped (not running); don't count as a hard failure.
        if [ "$rc" == "2" ]; then
            : # skipped, already logged
        else
            TENANTS_FAILED=$((TENANTS_FAILED + 1))
        fi
    fi
done

[ "$TENANTS_OK" -gt 0 ] || fail "no tenant dumps succeeded — refusing to promote an empty backup"

# --- 4. Back up the registry alongside (mode 600) -----------------------------
if [ -r "$REGISTRY" ]; then
    cp -p "$REGISTRY" "$STAGING/mandrel-registry.json"
    chmod 600 "$STAGING/mandrel-registry.json"
    log "Registry copied into staging."
else
    log "WARN: registry not readable; skipping registry copy"
fi

# --- 5. Secrets: LOCAL backup ONLY. Tarred into the dated folder, mode 600. ----
# These are the per-tenant *.env files. They go into the LOCAL backup only and
# are EXCLUDED from the off-site set unless OFFSITE_SECRETS=1.
SECRETS_TAR="$STAGING/tenant-secrets.tar.gz"
if compgen -G "$SECRETS_GLOB_DIR/.mandrel-*.env" >/dev/null; then
    # Tar from $SECRETS_GLOB_DIR so paths are stored relative (basename only).
    if tar -czf "$SECRETS_TAR" -C "$SECRETS_GLOB_DIR" $(cd "$SECRETS_GLOB_DIR" && ls .mandrel-*.env) 2>>"$LOG_FILE"; then
        chmod 600 "$SECRETS_TAR"
        log "Secrets bundled into LOCAL-only tenant-secrets.tar.gz (mode 600, NOT for off-site)"
    else
        log "WARN: failed to tar secret env files (continuing; local backup still has DBs+registry)"
        rm -f "$SECRETS_TAR"
    fi
else
    log "WARN: no .mandrel-*.env files found under $SECRETS_GLOB_DIR"
fi

# --- 6. Promote staging -> dated folder ---------------------------------------
mkdir -p "$DEST_DIR"
chmod 700 "$DEST_DIR"
mv "$STAGING"/* "$DEST_DIR"/
chmod 700 "$DEST_DIR"

# --- 7. Manifest --------------------------------------------------------------
{
    echo "Mandrel Tenant Backup"
    echo "====================="
    echo "Timestamp: $TIMESTAMP"
    echo "Created:   $(date)"
    echo "Host:      $(hostname)"
    echo ""
    echo "Tenants dumped OK: $TENANTS_OK"
    echo "Tenants failed:    $TENANTS_FAILED"
    echo "Restore drills OK: $DRILL_OK"
    echo "Restore drills failed: $DRILL_FAILED"
    echo ""
    echo "Files:"
    ls -la "$DEST_DIR"
    echo ""
    echo "Restore a tenant <h>:"
    echo "  docker exec -i mandrel-<h>-postgres pg_restore -U <user> -d <db> --clean --if-exists < $DEST_DIR/<h>.dump"
} > "$DEST_DIR/backup_info.txt"
chmod 600 "$DEST_DIR/backup_info.txt"

echo "$TIMESTAMP" > "$OUTPUT_ROOT/latest_timestamp"

# --- 8. Local retention: keep newest $KEEP_LOCAL dated folders ----------------
log "Local retention: keeping newest $KEEP_LOCAL dated folders under $OUTPUT_ROOT ..."
( cd "$OUTPUT_ROOT" && ls -1dt */ 2>/dev/null | tail -n +$((KEEP_LOCAL + 1)) | xargs -r rm -rf ) || \
    log "WARN: local retention prune hit an error (continuing)"

BACKUP_SIZE="$(du -sh "$DEST_DIR" | cut -f1)"
log "Local backup promoted: $DEST_DIR ($BACKUP_SIZE) — ${TENANTS_OK} tenants, ${DRILL_OK} drills OK"

# --- 9. Off-site to B2 (DBs + registry ONLY; secrets excluded by default) ------
offsite_push() {
    command -v rclone >/dev/null 2>&1 || { log "OFFSITE FAILURE: rclone not on PATH"; return 1; }
    [ -f "$RCLONE_CONF" ] || { log "OFFSITE FAILURE: rclone config missing at $RCLONE_CONF"; return 1; }

    local dest="$REMOTE/$TIMESTAMP/"

    # Build the exclude set. By default EXCLUDE the secrets tarball so creds never
    # leave the box. Only OFFSITE_SECRETS=1 (Brian's pending decision) includes it.
    local -a EXCLUDES=()
    if [ "$OFFSITE_SECRETS" != "1" ]; then
        EXCLUDES+=(--exclude "tenant-secrets.tar.gz")
        log "OFFSITE: secrets EXCLUDED from off-site (OFFSITE_SECRETS=0). Pushing DBs + registry only."
    else
        log "OFFSITE WARNING: OFFSITE_SECRETS=1 — secrets WILL be pushed off-site. (Ensure this is an approved decision.)"
    fi

    log "OFFSITE: rclone copy $DEST_DIR -> $dest ..."
    if ! rclone copy "$DEST_DIR" "$dest" "${EXCLUDES[@]}" --transfers 4 --b2-hard-delete 2>&1 | tee -a "$LOG_FILE"; then
        log "OFFSITE FAILURE: rclone copy failed for $TIMESTAMP"
        return 1
    fi

    # Verify with rclone check (hash compare). Use the SAME exclude set so the
    # check doesn't flag the intentionally-skipped secrets file as a difference.
    log "OFFSITE: verifying with rclone check ..."
    if ! rclone check "$DEST_DIR" "$dest" "${EXCLUDES[@]}" 2>&1 | tee -a "$LOG_FILE"; then
        log "OFFSITE FAILURE: rclone check found differences for $TIMESTAMP"
        return 1
    fi

    # Remote retention: keep newest $KEEP_REMOTE dated folders under this prefix.
    log "OFFSITE: remote retention (keep newest $KEEP_REMOTE under mandrel-tenants/) ..."
    local remote_dirs total delete_count
    remote_dirs="$(rclone lsf "$REMOTE/" --dirs-only 2>/dev/null | sed 's:/*$::' | sort)"
    total="$(echo "$remote_dirs" | grep -c . || true)"
    if [ "${total:-0}" -gt "$KEEP_REMOTE" ]; then
        delete_count=$((total - KEEP_REMOTE))
        echo "$remote_dirs" | head -n "$delete_count" | while read -r OLD; do
            [ -n "$OLD" ] || continue
            log "OFFSITE retention: purging old remote folder mandrel-tenants/$OLD"
            rclone purge "$REMOTE/$OLD" 2>&1 | tee -a "$LOG_FILE" || \
                log "OFFSITE WARN: failed to purge mandrel-tenants/$OLD (continuing)"
        done
    else
        log "OFFSITE retention: $total folder(s) remote, under keep limit ($KEEP_REMOTE); nothing to prune"
    fi

    log "OFFSITE: off-site backup of $TIMESTAMP uploaded + verified to $dest"
    return 0
}

OFFSITE_STATUS="skipped"
if [ "$NO_OFFSITE" == "1" ]; then
    log "OFFSITE: skipped (NO_OFFSITE=1)"
else
    if offsite_push; then
        OFFSITE_STATUS="ok"
    else
        OFFSITE_STATUS="failed"
        # Off-site failure is a real failure (local backup already safe on disk).
        log "FAILURE: off-site push failed (local backup IS intact at $DEST_DIR)"
        log "=== Tenant Backup FINISHED WITH OFFSITE FAILURE ==="
        exit 1
    fi
fi

# --- 10. Final status line (grepped by the alert helper) ----------------------
if [ "$TENANTS_FAILED" -eq 0 ] && [ "$DRILL_FAILED" -eq 0 ]; then
    log "SUCCESS: tenant backup $TIMESTAMP — ${TENANTS_OK} tenants dumped+verified, ${DRILL_OK} restore-drills OK, offsite=${OFFSITE_STATUS}"
else
    # Partial: some dumps or drills failed but at least one succeeded and was promoted.
    log "PARTIAL: tenant backup $TIMESTAMP — ok=${TENANTS_OK} failed=${TENANTS_FAILED} drill_ok=${DRILL_OK} drill_failed=${DRILL_FAILED} offsite=${OFFSITE_STATUS}"
fi
log "=== Tenant Backup Finished ==="

# Exit non-zero if anything failed so cron + the alert helper see it.
if [ "$TENANTS_FAILED" -ne 0 ] || [ "$DRILL_FAILED" -ne 0 ]; then
    exit 1
fi
exit 0
