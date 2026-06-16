#!/usr/bin/env bash
# =============================================================================
# fleet-schema-audit.sh — READ-ONLY fleet schema-drift audit (report only)
# =============================================================================
# For every tenant in the registry (/root/mandrel-registry.json) PLUS Brian's
# prod Mandrel (/opt/mandrel, systemd), dumps the live schema as a canonical,
# version-agnostic fingerprint and diffs it against the committed reference
# (scripts/schema-reference.sql.txt). Reports per-instance drift: missing
# tables/columns/constraints/indexes (in reference, absent live) and EXTRAS
# (live but not in reference).
#
#   *** REPORT ONLY. This script NEVER runs ALTER/CREATE/DROP/migrate on any
#       tenant or prod DB. Every DB touch is a read-only SELECT. ***
#
# It auto-covers new tenants: anything added to the registry is picked up on the
# next run. Suspended tenants (whose stack is down) are reported as SKIPPED.
#
# Connectivity: each tenant's Postgres runs in a container named
# `mandrel-<handle>-postgres` (db=mandrel, user=mandrel). We read the schema via
# `docker exec <container> psql` so no passwords are handled here. Prod is read
# via `sudo -u postgres psql -d mandrel` on the host.
#
# Usage:
#   bash scripts/fleet-schema-audit.sh              # audit all live tenants + prod
#   bash scripts/fleet-schema-audit.sh <handle>...  # audit only named handle(s)
#   FLEET_AUDIT_INCLUDE_PROD=0 bash scripts/...      # skip prod
#
# Exit: 0 if NO drift anywhere, 1 if ANY instance drifted (so it can gate a CI
# fleet-health job), 2 on operational error (registry missing, etc.).
# =============================================================================
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
FINGERPRINT_SQL="$SCRIPT_DIR/schema-fingerprint.sql"
REFERENCE_FILE="$SCRIPT_DIR/schema-reference.sql.txt"
REGISTRY="${MANDREL_REGISTRY:-/root/mandrel-registry.json}"
INCLUDE_PROD="${FLEET_AUDIT_INCLUDE_PROD:-1}"
PROD_DB="${FLEET_AUDIT_PROD_DB:-mandrel}"

RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; BLD=$'\033[1m'; CYN=$'\033[36m'; RST=$'\033[0m'
hdr() { printf '\n%s========== %s ==========%s\n' "$BLD" "$*" "$RST"; }

# --- Preconditions -----------------------------------------------------------
[[ -f "$FINGERPRINT_SQL" ]] || { echo "${RED}Missing $FINGERPRINT_SQL${RST}"; exit 2; }
[[ -f "$REFERENCE_FILE"  ]] || { echo "${RED}Missing committed reference $REFERENCE_FILE — run schema-contract.sh regenerate${RST}"; exit 2; }
[[ -f "$REGISTRY"        ]] || { echo "${RED}Registry not found at $REGISTRY${RST}"; exit 2; }
command -v jq >/dev/null 2>&1 || { echo "${RED}jq required${RST}"; exit 2; }

# Reference body (sorted, comment-stripped) — compared against every instance.
REF_BODY="$(mktemp /tmp/fleet_audit_ref.XXXXXX)"
grep -v '^#' "$REFERENCE_FILE" | sed '/^[[:space:]]*$/d' | LC_ALL=C sort > "$REF_BODY"
REF_OBJECTS=$(wc -l < "$REF_BODY")

# Read the fingerprint SQL once into a var so we can pipe it into containers via stdin.
FP_SQL="$(cat "$FINGERPRINT_SQL")"

cleanup() { rm -f "$REF_BODY"; }
trap cleanup EXIT

hdr "FLEET SCHEMA-DRIFT AUDIT (read-only)"
echo "Reference: $REFERENCE_FILE (${REF_OBJECTS} objects)"
echo "Registry:  $REGISTRY"
printf '%sNOTE: report-only — no tenant/prod DB is ever altered.%s\n' "$YLW" "$RST"

# --- Build the audit target list --------------------------------------------
# Each target: "<label>|<mode>|<conn>"  where mode=container|host
#   container -> conn is the docker container name (psql inside it)
#   host      -> conn is the host db name (sudo -u postgres psql -d <db>)
declare -a TARGETS=()

REQUESTED=("$@")
in_requested() {
  [[ ${#REQUESTED[@]} -eq 0 ]] && return 0
  local h; for h in "${REQUESTED[@]}"; do [[ "$h" == "$1" ]] && return 0; done
  return 1
}

# Tenants from the registry (auto-covers new tenants).
while IFS=$'\t' read -r handle status; do
  [[ -z "$handle" ]] && continue
  in_requested "$handle" || continue
  TARGETS+=("$handle|container|mandrel-${handle}-postgres|$status")
done < <(jq -r '.tenants | to_entries[] | "\(.key)\t\(.value.status // "unknown")"' "$REGISTRY")

# Prod (host systemd Mandrel) unless excluded or a specific handle filter was given.
if [[ "$INCLUDE_PROD" == "1" ]] && in_requested "prod"; then
  TARGETS+=("prod(systemd)|host|${PROD_DB}|active")
fi

[[ ${#TARGETS[@]} -gt 0 ]] || { echo "${YLW}No matching targets.${RST}"; exit 0; }

# --- Audit each target -------------------------------------------------------
ANY_DRIFT=0
declare -a REPORT_LINES=()

fingerprint_container() {  # $1 = container name -> stdout canonical fingerprint
  docker exec -i "$1" psql -U mandrel -d mandrel -v ON_ERROR_STOP=1 -f - 2>/dev/null <<< "$FP_SQL" \
    | grep -E '^(COLUMN|CONSTRAINT|INDEX|VIEW|SEQUENCE|ENUM) ' | LC_ALL=C sort
}
fingerprint_host() {       # $1 = db name -> stdout canonical fingerprint
  sudo -u postgres psql -d "$1" -v ON_ERROR_STOP=1 -f "$FINGERPRINT_SQL" 2>/dev/null \
    | grep -E '^(COLUMN|CONSTRAINT|INDEX|VIEW|SEQUENCE|ENUM) ' | LC_ALL=C sort
}

for t in "${TARGETS[@]}"; do
  IFS='|' read -r label mode conn status <<< "$t"
  hdr "instance: ${CYN}${label}${RST} (status=${status})"

  # Suspended stacks are down — skip cleanly (not a drift, just not auditable now).
  if [[ "$status" == "suspended" ]]; then
    echo "${YLW}SKIP: status=suspended (stack down — schema not auditable).${RST}"
    REPORT_LINES+=("$(printf '  %-22s %s' "$label" "SKIP (suspended)")")
    continue
  fi

  LIVE="$(mktemp /tmp/fleet_audit_live.XXXXXX)"
  if [[ "$mode" == "container" ]]; then
    if ! docker ps --format '{{.Names}}' | grep -qx "$conn"; then
      echo "${YLW}SKIP: container '$conn' not running.${RST}"
      REPORT_LINES+=("$(printf '  %-22s %s' "$label" "SKIP (container down)")")
      rm -f "$LIVE"; continue
    fi
    fingerprint_container "$conn" > "$LIVE"
  else
    fingerprint_host "$conn" > "$LIVE"
  fi

  LIVE_OBJECTS=$(wc -l < "$LIVE")
  if [[ "$LIVE_OBJECTS" -lt 50 ]]; then
    echo "${RED}ERROR: live fingerprint for '$label' has only ${LIVE_OBJECTS} lines — could not read schema (skipping).${RST}"
    REPORT_LINES+=("$(printf '  %-22s %s' "$label" "ERROR (no schema)")")
    rm -f "$LIVE"; continue
  fi

  # MISSING = in reference, absent live (code may call objects the tenant lacks).
  # EXTRA   = live but not in reference (drift accreted on the tenant).
  # comm REQUIRES both inputs sorted in the SAME collation it compares in, so we
  # pin LC_ALL=C end-to-end (the fingerprints were sorted with LC_ALL=C sort too) —
  # otherwise comm warns "input is not in sorted order" and the diff is garbage.
  MISSING="$(LC_ALL=C comm -23 "$REF_BODY" "$LIVE")"
  EXTRA="$(LC_ALL=C comm -13 "$REF_BODY" "$LIVE")"
  N_MISSING=$([[ -n "$MISSING" ]] && printf '%s\n' "$MISSING" | grep -c . || echo 0)
  N_EXTRA=$([[ -n "$EXTRA" ]] && printf '%s\n' "$EXTRA" | grep -c . || echo 0)

  echo "live objects: ${LIVE_OBJECTS}   reference: ${REF_OBJECTS}"
  if [[ "$N_MISSING" -eq 0 && "$N_EXTRA" -eq 0 ]]; then
    echo "${GRN}NO DRIFT — schema matches the committed reference exactly.${RST}"
    REPORT_LINES+=("$(printf '  %-22s %s' "$label" "${GRN}OK (no drift)${RST}")")
  else
    ANY_DRIFT=1
    echo "${RED}DRIFT: ${N_MISSING} missing (in ref, not live), ${N_EXTRA} extra (live, not in ref).${RST}"
    if [[ "$N_MISSING" -gt 0 ]]; then
      echo "${YLW}--- MISSING (reference has it, this instance does NOT) ---${RST}"
      printf '%s\n' "$MISSING" | sed 's/^/   - /'
    fi
    if [[ "$N_EXTRA" -gt 0 ]]; then
      echo "${YLW}--- EXTRA (this instance has it, reference does NOT) ---${RST}"
      printf '%s\n' "$EXTRA" | sed 's/^/   + /'
    fi
    REPORT_LINES+=("$(printf '  %-22s %s' "$label" "${RED}DRIFT (-${N_MISSING}/+${N_EXTRA})${RST}")")
  fi
  rm -f "$LIVE"
done

# --- Summary -----------------------------------------------------------------
hdr "FLEET DRIFT SUMMARY"
for l in "${REPORT_LINES[@]}"; do printf '%b\n' "$l"; done
if [[ "$ANY_DRIFT" -eq 0 ]]; then
  printf '\n%s##########  FLEET CLEAN — no drift  ##########%s\n' "$GRN" "$RST"
  exit 0
else
  printf '\n%s##########  FLEET DRIFT DETECTED (report-only; nothing was altered)  ##########%s\n' "$RED" "$RST"
  exit 1
fi
