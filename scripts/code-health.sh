#!/usr/bin/env bash
# =============================================================================
# code-health.sh — RidgetopAi's re-runnable code-quality self-check harness
# =============================================================================
# WHY THIS EXISTS
#   Mandrel is a PUBLIC repo serving real customer tenants, built largely by
#   agents. We need a repeatable, honest way to keep that code honest: catch
#   leaked secrets, divergent copy-paste drift (our #1 historical risk — it
#   caused a customer outage), dead code, security smells, and lint rot — and
#   produce a single judgment-base report a non-coder (Brian) can read.
#
#   This is the trust baseline. Re-run it any time; diff the reports over time.
#
# WHAT IT RUNS (6 tools, fixed — do not substitute)
#   1. gitleaks   — secrets (working tree + full git history)
#   2. shellcheck — bash lint over the ops/deploy scripts
#   3. jscpd      — copy-paste / duplication over the product TS source (PRIORITY)
#   4. semgrep    — security SAST over the product TS source
#   5. knip       — dead code / unused exports / unused deps per product package
#   6. eslint     — correctness (MEASURE only; configs are known-imperfect)
#
# SCOPES
#   Shell  : scripts/*.sh + scripts/lib/*.sh
#   TS src : mcp-server/src, mandrel-command/backend/src, mandrel-command/frontend/src
#   Always excluded: node_modules, dist, build, build.bak*, .git, LongMemEval data,
#                    *.bak*, venv, vendored, logs, coverage, test files.
#
# OUTPUT
#   Raw per-tool output  -> $REPORT_ROOT/<date>/raw/   (gitignored — noisy)
#   Consolidated report  -> $REPORT_ROOT/<date>/code-health-<date>.md   (committed)
#   A copy of the report -> ra-mandrel/reports/code-health-<date>.md     (committed)
#
# DESIGN
#   * Idempotent / re-runnable: a missing tool is FLAGGED (status "skipped"),
#     it never crashes the whole run.
#   * Each tool's exit/finding-count is captured; the harness itself exits 0 even
#     when tools find problems (it's a report, not a gate).
#   * No secret VALUES are ever written to the report — only file:line + rule.
#
# USAGE
#   bash scripts/code-health.sh                 # full run
#   SKIP_HISTORY=1 bash scripts/code-health.sh  # skip the slow gitleaks history scan
#
# Maintained as a first-class tool. Keep it boring and well-commented.
# =============================================================================

set -uo pipefail   # NOTE: intentionally NOT -e; a tool finding issues must not abort.

# ---------------------------------------------------------------------------
# 0. Paths & setup
# ---------------------------------------------------------------------------
REPO="${REPO:-/home/ridgetop/projects/ra-mandrel}"
REPORT_ROOT="${REPORT_ROOT:-/home/ridgetop/projects/ridgetopai-reports/code-health}"
DATE="$(date +%Y-%m-%d)"
TS="$(date +%Y-%m-%d\ %H:%M:%S\ %Z)"
OUTDIR="$REPORT_ROOT/$DATE"
RAW="$OUTDIR/raw"
REPORT="$OUTDIR/code-health-$DATE.md"
REPO_REPORT_DIR="$REPO/reports"
START_EPOCH="$(date +%s)"

# pipx-installed tools (semgrep) live here
export PATH="$PATH:/root/.local/bin:/usr/local/bin"

mkdir -p "$RAW"
cd "$REPO" || { echo "FATAL: cannot cd to $REPO"; exit 1; }

# TS source scopes (the product code)
TS_SCOPES=(mcp-server/src mandrel-command/backend/src mandrel-command/frontend/src)

# Shared ignore globs for the TS tools
IGNORE_GLOB="**/node_modules/**,**/dist/**,**/build/**,**/build.bak*/**,**/*.bak*,**/coverage/**,**/*.test.ts,**/*.test.tsx,**/*.d.ts,**/LongMemEval/**"

# ---------------------------------------------------------------------------
# Health-summary accumulator. Each tool appends one row:
#   "<tool>|<count>|<worst>|<verdict-emoji> <verdict-text>"
# ---------------------------------------------------------------------------
SUMMARY_ROWS=()
add_summary() { SUMMARY_ROWS+=("$1|$2|$3|$4"); }

have() { command -v "$1" >/dev/null 2>&1; }

log() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }

# Markdown body is assembled into this temp file, then prepended with summary.
BODY="$(mktemp)"
sec() { printf '\n## %s\n\n' "$1" >>"$BODY"; }

# ===========================================================================
# 1. gitleaks — secrets
# ===========================================================================
log "1/6 gitleaks (secrets)"
sec "Secrets (gitleaks)"
if have gitleaks; then
  # Working tree scan (--no-git): what is on disk right now.
  GL_WT="$RAW/gitleaks-worktree.json"
  gitleaks detect --source . --no-git --redact \
    --report-format json --report-path "$GL_WT" \
    >"$RAW/gitleaks-worktree.log" 2>&1
  WT_COUNT="$(jq 'length' "$GL_WT" 2>/dev/null || echo 0)"

  # History scan: what is actually committed/public (the real exposure). Slow.
  HIST_COUNT="n/a"
  if [ "${SKIP_HISTORY:-0}" != "1" ]; then
    GL_HIST="$RAW/gitleaks-history.json"
    gitleaks detect --source . --redact \
      --report-format json --report-path "$GL_HIST" \
      >"$RAW/gitleaks-history.log" 2>&1
    HIST_COUNT="$(jq 'length' "$GL_HIST" 2>/dev/null || echo 0)"
  fi

  {
    echo "- **Working tree (on disk now):** ${WT_COUNT} hit(s)"
    echo "- **Git history (committed / public):** ${HIST_COUNT} hit(s)"
    echo ""
    echo "Working-tree hits (value REDACTED — file:line + rule only). Note many"
    echo "live in gitignored files (.env, logs) that are NOT committed:"
    echo ""
    echo '```'
    # We re-derive "tracked?" for each WT hit so we distinguish committed vs local.
    if [ "$WT_COUNT" != "0" ] && [ -s "$GL_WT" ]; then
      jq -r '.[] | "\(.RuleID)\t\(.File):\(.StartLine)"' "$GL_WT" 2>/dev/null \
        | sort -u | while IFS=$'\t' read -r rule loc; do
            f="${loc%%:*}"
            if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then
              tracked="COMMITTED"
            else
              tracked="local-only(gitignored)"
            fi
            printf '%-18s %-12s %s\n' "$rule" "[$tracked]" "$loc"
          done
    else
      echo "(none)"
    fi
    echo '```'
    if [ "$HIST_COUNT" != "n/a" ] && [ "$HIST_COUNT" != "0" ]; then
      echo ""
      echo "Git-history hits by file+rule (these persist in the public repo even if"
      echo "the file was later deleted — value REDACTED):"
      echo ""
      echo '```'
      jq -r '.[] | "\(.RuleID)\t\(.File)"' "$RAW/gitleaks-history.json" 2>/dev/null \
        | sort | uniq -c | sort -rn
      echo '```'
    fi
  } >>"$BODY"

  # Verdict is driven by COMMITTED working-tree hits + history hits, not local-only.
  COMMITTED_WT=0
  if [ "$WT_COUNT" != "0" ] && [ -s "$GL_WT" ]; then
    while IFS= read -r f; do
      git ls-files --error-unmatch "$f" >/dev/null 2>&1 && COMMITTED_WT=$((COMMITTED_WT+1))
    done < <(jq -r '.[].File' "$GL_WT" 2>/dev/null | sort -u)
  fi
  HIST_N="${HIST_COUNT//n\/a/0}"
  if [ "$COMMITTED_WT" -eq 0 ] && [ "${HIST_N:-0}" -eq 0 ]; then
    add_summary "gitleaks" "$WT_COUNT wt / $HIST_COUNT hist" "—" "✅ clean (committed: 0)"
  elif [ "$COMMITTED_WT" -eq 0 ]; then
    add_summary "gitleaks" "$WT_COUNT wt / $HIST_COUNT hist" "history" "⚠️ attention (history has secrets; worktree committed: 0)"
  else
    add_summary "gitleaks" "$WT_COUNT wt / $HIST_COUNT hist" "committed" "⚠️ attention (secrets in committed files — triage; see Secrets section)"
  fi
else
  echo "_gitleaks not installed — skipped._" >>"$BODY"
  add_summary "gitleaks" "—" "—" "⚠️ skipped (not installed)"
fi

# ===========================================================================
# 2. shellcheck — bash
# ===========================================================================
log "2/6 shellcheck (bash)"
sec "Shell (shellcheck)"
if have shellcheck; then
  SC_JSON="$RAW/shellcheck.json"
  # Scope: ops/deploy scripts + the shared lib. Capture as JSON for counts.
  mapfile -t SH_FILES < <(ls scripts/*.sh scripts/lib/*.sh 2>/dev/null)
  shellcheck -f json "${SH_FILES[@]}" >"$SC_JSON" 2>/dev/null
  SC_ERR="$(jq '[.[]|select(.level=="error")]|length' "$SC_JSON" 2>/dev/null || echo 0)"
  SC_WARN="$(jq '[.[]|select(.level=="warning")]|length' "$SC_JSON" 2>/dev/null || echo 0)"
  SC_INFO="$(jq '[.[]|select(.level=="info")]|length' "$SC_JSON" 2>/dev/null || echo 0)"
  SC_STYLE="$(jq '[.[]|select(.level=="style")]|length' "$SC_JSON" 2>/dev/null || echo 0)"
  SC_TOTAL="$(jq 'length' "$SC_JSON" 2>/dev/null || echo 0)"
  {
    echo "Scanned **${#SH_FILES[@]}** shell scripts (scripts/*.sh + scripts/lib/*.sh)."
    echo ""
    echo "| Severity | Count |"
    echo "|----------|-------|"
    echo "| error    | $SC_ERR |"
    echo "| warning  | $SC_WARN |"
    echo "| info     | $SC_INFO |"
    echo "| style    | $SC_STYLE |"
    echo "| **total**| $SC_TOTAL |"
    echo ""
    echo "Top shellcheck codes by frequency:"
    echo '```'
    jq -r '.[] | "SC\(.code)\t\(.level)"' "$SC_JSON" 2>/dev/null \
      | sort | uniq -c | sort -rn | head -12
    echo '```'
    if [ "$SC_ERR" != "0" ]; then
      echo ""
      echo "Error-level findings (file:line — code):"
      echo '```'
      jq -r '.[]|select(.level=="error")|"\(.file):\(.line)  SC\(.code)  \(.message)"' "$SC_JSON" 2>/dev/null | head -25
      echo '```'
    fi
  } >>"$BODY"
  if [ "$SC_ERR" -gt 0 ]; then
    add_summary "shellcheck" "$SC_TOTAL" "error" "🔴 serious ($SC_ERR errors)"
  elif [ "$SC_WARN" -gt 0 ]; then
    add_summary "shellcheck" "$SC_TOTAL" "warning" "⚠️ attention ($SC_WARN warnings)"
  else
    add_summary "shellcheck" "$SC_TOTAL" "info/style" "✅ clean (no errors/warnings)"
  fi
else
  echo "_shellcheck not installed — skipped._" >>"$BODY"
  add_summary "shellcheck" "—" "—" "⚠️ skipped (not installed)"
fi

# ===========================================================================
# 3. jscpd — duplication (THE priority tool)
# ===========================================================================
log "3/6 jscpd (duplication — priority)"
sec "Duplication (jscpd) — the centerpiece"
JSCPD_OUT="$RAW/jscpd"
mkdir -p "$JSCPD_OUT"
if have npx; then
  npx --yes jscpd@latest "${TS_SCOPES[@]}" \
    --silent --reporters json --output "$JSCPD_OUT" \
    --ignore "$IGNORE_GLOB" \
    >"$RAW/jscpd.log" 2>&1
  JREP="$JSCPD_OUT/jscpd-report.json"
  if [ -s "$JREP" ]; then
    DUP_PCT="$(jq -r '.statistics.total.percentage | (.*100|round/100)' "$JREP" 2>/dev/null)"
    DUP_CLONES="$(jq -r '.statistics.total.clones' "$JREP" 2>/dev/null)"
    DUP_LINES="$(jq -r '.statistics.total.duplicatedLines' "$JREP" 2>/dev/null)"
    {
      echo "- **Duplicated:** ${DUP_PCT}% of lines"
      echo "- **Clone clusters:** ${DUP_CLONES}"
      echo "- **Duplicated lines:** ${DUP_LINES}"
      echo ""
      echo "Top 12 worst clones (lines — fileA:start-end  <=>  fileB:start-end)."
      echo "Cross-package clones are the drift risk that caused the outage:"
      echo ""
      echo '```'
      jq -r '.duplicates | sort_by(-.lines) | .[0:12][] |
        "\(.lines)L  \(.firstFile.name):\(.firstFile.start)-\(.firstFile.end)   <=>   \(.secondFile.name):\(.secondFile.start)-\(.secondFile.end)"' \
        "$JREP" 2>/dev/null
      echo '```'
    } >>"$BODY"
    # Verdict bands: <3% green, 3-8% attention, >8% serious.
    PCT_INT="${DUP_PCT%%.*}"; PCT_INT="${PCT_INT:-0}"
    if [ "$PCT_INT" -lt 3 ]; then
      add_summary "jscpd" "${DUP_PCT}% / ${DUP_CLONES} clusters" "—" "✅ clean (<3%)"
    elif [ "$PCT_INT" -lt 8 ]; then
      add_summary "jscpd" "${DUP_PCT}% / ${DUP_CLONES} clusters" "moderate" "⚠️ attention (cross-package dup)"
    else
      add_summary "jscpd" "${DUP_PCT}% / ${DUP_CLONES} clusters" "high" "🔴 serious (>8% duplication)"
    fi
  else
    echo "_jscpd produced no report — see raw/jscpd.log._" >>"$BODY"
    add_summary "jscpd" "—" "—" "⚠️ error (no report)"
  fi
else
  echo "_npx unavailable — jscpd skipped._" >>"$BODY"
  add_summary "jscpd" "—" "—" "⚠️ skipped (no npx)"
fi

# ===========================================================================
# 4. semgrep — security SAST
# ===========================================================================
log "4/6 semgrep (security SAST)"
sec "Security (semgrep)"
if have semgrep; then
  SG_JSON="$RAW/semgrep.json"
  semgrep --config=p/typescript --config=p/security-audit \
    "${TS_SCOPES[@]}" \
    --json --output "$SG_JSON" \
    --exclude='*.test.ts' --exclude='*.test.tsx' --exclude='node_modules' \
    --exclude='dist' --exclude='build' --exclude='*.d.ts' \
    --metrics=off --quiet \
    >"$RAW/semgrep.log" 2>&1
  if [ -s "$SG_JSON" ]; then
    SG_ERR="$(jq '[.results[]|select(.extra.severity=="ERROR")]|length' "$SG_JSON" 2>/dev/null || echo 0)"
    SG_WARN="$(jq '[.results[]|select(.extra.severity=="WARNING")]|length' "$SG_JSON" 2>/dev/null || echo 0)"
    SG_INFO="$(jq '[.results[]|select(.extra.severity=="INFO")]|length' "$SG_JSON" 2>/dev/null || echo 0)"
    SG_TOTAL="$(jq '.results|length' "$SG_JSON" 2>/dev/null || echo 0)"
    {
      echo "| Severity | Count |"
      echo "|----------|-------|"
      echo "| ERROR    | $SG_ERR |"
      echo "| WARNING  | $SG_WARN |"
      echo "| INFO     | $SG_INFO |"
      echo "| **total**| $SG_TOTAL |"
      echo ""
      if [ "$SG_ERR" != "0" ]; then
        echo "**ERROR-severity (high) findings (file:line — rule):**"
        echo '```'
        jq -r '.results[]|select(.extra.severity=="ERROR")|"\(.path):\(.start.line)  \(.check_id|split(".")|.[-1])"' "$SG_JSON" 2>/dev/null
        echo '```'
      fi
      echo "Top rules by frequency (all severities):"
      echo '```'
      jq -r '.results[]|"\(.extra.severity)\t\(.check_id|split(".")|.[-1])"' "$SG_JSON" 2>/dev/null \
        | sort | uniq -c | sort -rn | head -12
      echo '```'
    } >>"$BODY"
    if [ "$SG_ERR" -gt 0 ]; then
      add_summary "semgrep" "$SG_TOTAL" "ERROR" "🔴 serious ($SG_ERR high)"
    elif [ "$SG_WARN" -gt 0 ]; then
      add_summary "semgrep" "$SG_TOTAL" "WARNING" "⚠️ attention ($SG_WARN warnings)"
    else
      add_summary "semgrep" "$SG_TOTAL" "info" "✅ clean (no high/med)"
    fi
  else
    echo "_semgrep produced no output — see raw/semgrep.log._" >>"$BODY"
    add_summary "semgrep" "—" "—" "⚠️ error (no output)"
  fi
else
  echo "_semgrep not installed — skipped._" >>"$BODY"
  add_summary "semgrep" "—" "—" "⚠️ skipped (not installed)"
fi

# ===========================================================================
# 5. knip — dead code / unused exports / unused deps
# ===========================================================================
log "5/6 knip (dead code)"
sec "Dead code (knip)"
if have npx; then
  # knip is run per-package (it auto-detects entrypoints from package.json).
  KNIP_PKGS=(mcp-server mandrel-command/backend mandrel-command/frontend)
  KNIP_TOTAL=0
  {
    echo "Run per product package (knip auto-detects entrypoints). Counts per category:"
    echo ""
    echo "| Package | Unused files | Unused exports | Unused exp. types | Unused deps |"
    echo "|---------|-------------:|---------------:|------------------:|------------:|"
  } >>"$BODY"
  for pkg in "${KNIP_PKGS[@]}"; do
    KLOG="$RAW/knip-$(echo "$pkg" | tr '/' '-').log"
    ( cd "$REPO/$pkg" && npx --yes knip@latest --no-progress ) >"$KLOG" 2>&1 || true
    uf="$(grep -oE 'Unused files \(([0-9]+)\)' "$KLOG" | grep -oE '[0-9]+' | head -1)"; uf="${uf:-0}"
    ue="$(grep -oE 'Unused exports \(([0-9]+)\)' "$KLOG" | grep -oE '[0-9]+' | head -1)"; ue="${ue:-0}"
    ut="$(grep -oE 'Unused exported types \(([0-9]+)\)' "$KLOG" | grep -oE '[0-9]+' | head -1)"; ut="${ut:-0}"
    ud="$(grep -oE 'Unused dependencies \(([0-9]+)\)' "$KLOG" | grep -oE '[0-9]+' | head -1)"; ud="${ud:-0}"
    printf '| %s | %s | %s | %s | %s |\n' "$pkg" "$uf" "$ue" "$ut" "$ud" >>"$BODY"
    KNIP_TOTAL=$((KNIP_TOTAL + uf + ue + ut + ud))
  done
  {
    echo ""
    echo "Top unused-file offenders (from the package with the most unused files):"
    echo '```'
    # Pick the knip log whose "Unused files (N)" count is largest, then list them.
    biggest=""; bestn=-1
    for f in "$RAW"/knip-*.log; do
      [ -e "$f" ] || continue
      n="$(grep -oE 'Unused files \(([0-9]+)\)' "$f" | grep -oE '[0-9]+' | head -1)"; n="${n:-0}"
      if [ "$n" -gt "$bestn" ]; then bestn="$n"; biggest="$f"; fi
    done
    if [ -n "${biggest:-}" ]; then
      echo "(${biggest##*/knip-} → ${bestn} unused files)"
      awk '/^Unused files/{p=1;next} p&&/^Unused (exports|dependencies|devDependencies|exported)/{p=0} p' "$biggest" | head -15
    fi
    echo '```'
  } >>"$BODY"
  if [ "$KNIP_TOTAL" -gt 150 ]; then
    add_summary "knip" "$KNIP_TOTAL items" "high" "⚠️ attention (lots of dead code)"
  elif [ "$KNIP_TOTAL" -gt 0 ]; then
    add_summary "knip" "$KNIP_TOTAL items" "moderate" "⚠️ attention (some dead code)"
  else
    add_summary "knip" "0" "—" "✅ clean"
  fi
else
  echo "_npx unavailable — knip skipped._" >>"$BODY"
  add_summary "knip" "—" "—" "⚠️ skipped (no npx)"
fi

# ===========================================================================
# 6. eslint — correctness (MEASURE only)
# ===========================================================================
log "6/6 eslint (correctness — measure only)"
sec "Lint / correctness (eslint — measured, not fixed)"
if have npx; then
  # Per-package eslint. Configs are known-imperfect; we MEASURE, never fix.
  # pkg|relsrc|ext
  ESLINT_TARGETS=(
    "mcp-server|src|.ts"
    "mandrel-command/backend|src|.ts"
    "mandrel-command/frontend|src|.ts,.tsx"
  )
  ES_GRAND=0
  {
    echo "| Package | Problems | Errors | Warnings |"
    echo "|---------|---------:|-------:|---------:|"
  } >>"$BODY"
  declare -a ES_JSONS=()
  for t in "${ESLINT_TARGETS[@]}"; do
    IFS='|' read -r pkg src ext <<<"$t"
    EJSON="$RAW/eslint-$(echo "$pkg" | tr '/' '-').json"
    ES_JSONS+=("$EJSON")
    ( cd "$REPO/$pkg" && npx eslint "$src" --ext "$ext" --format json -o "$EJSON" ) \
      >"$RAW/eslint-$(echo "$pkg" | tr '/' '-').log" 2>&1 || true
    if [ -s "$EJSON" ]; then
      tot="$(jq '[.[].messages[]]|length' "$EJSON" 2>/dev/null || echo 0)"
      err="$(jq '[.[].messages[]|select(.severity==2)]|length' "$EJSON" 2>/dev/null || echo 0)"
      wrn="$(jq '[.[].messages[]|select(.severity==1)]|length' "$EJSON" 2>/dev/null || echo 0)"
    else
      tot=0; err=0; wrn=0
    fi
    printf '| %s | %s | %s | %s |\n' "$pkg" "$tot" "$err" "$wrn" >>"$BODY"
    ES_GRAND=$((ES_GRAND + tot))
  done
  {
    echo ""
    echo "Top rules by violation count (all packages combined), tagged bug-class vs style."
    echo "NOTE: a huge \`no-undef\` count usually means the eslint config lacks the right"
    echo "env/globals (TS/Node) — config noise, NOT that many real undefined-variable bugs."
    echo ""
    echo '```'
    # Combine all eslint JSONs, group by ruleId, tag class.
    jq -rs '
      [ .[] | .[].messages[] | .ruleId ] | map(select(. != null))
      | group_by(.) | map({rule: .[0], n: length}) | sort_by(-.n) | .[0:12][]
      | "\(.n)\t\(.rule)"' "${ES_JSONS[@]}" 2>/dev/null \
      | while IFS=$'\t' read -r n rule; do
          case "$rule" in
            no-undef|*no-unused-vars|*no-floating-promises|eqeqeq|no-redeclare|*no-misused-promises|no-cond-assign|no-fallthrough|*no-non-null-assertion)
              tag="[bug-class]";;
            *) tag="[style]";;
          esac
          printf '%-6s %-12s %s\n' "$n" "$tag" "$rule"
        done
    echo '```'
  } >>"$BODY"
  if [ "$ES_GRAND" -gt 500 ]; then
    add_summary "eslint" "$ES_GRAND problems" "high" "⚠️ attention (config-inflated; see note)"
  elif [ "$ES_GRAND" -gt 0 ]; then
    add_summary "eslint" "$ES_GRAND problems" "moderate" "⚠️ attention"
  else
    add_summary "eslint" "0" "—" "✅ clean"
  fi
else
  echo "_npx unavailable — eslint skipped._" >>"$BODY"
  add_summary "eslint" "—" "—" "⚠️ skipped (no npx)"
fi

# ===========================================================================
# 7. Assemble the consolidated report (summary table first, then sections)
# ===========================================================================
log "Assembling report -> $REPORT"
END_EPOCH="$(date +%s)"
WALL=$(( END_EPOCH - START_EPOCH ))

# Preserve a hand-written judgment across re-runs. The "What this means" section is
# the one part a human authors (the numbers above are regenerated). If an existing
# repo report for this date already has a REAL judgment (not the placeholder), carry
# it forward so a re-run never clobbers it. Detect via a sentinel the template lacks.
PRIOR_JUDGMENT=""
PRIOR="$REPO_REPORT_DIR/code-health-$DATE.md"
if [ -f "$PRIOR" ] && grep -q '^## What this means (judgment)' "$PRIOR" \
   && ! grep -q 'auto-templated by the harness' "$PRIOR"; then
  # Everything from the judgment header to EOF is the authored narrative.
  PRIOR_JUDGMENT="$(awk '/^## What this means \(judgment\)/{p=1} p' "$PRIOR")"
  log "Preserving existing hand-written judgment from $PRIOR"
fi

{
  echo "# RidgetopAi Code-Health Report — $DATE"
  echo ""
  echo "_Generated: $TS · wall-time: ${WALL}s · harness: \`scripts/code-health.sh\`_"
  echo ""
  echo "Repo: \`ra-mandrel\` (public, customer-serving, largely agent-built)."
  echo "Scopes — TS: mcp-server/src, mandrel-command/{backend,frontend}/src · Shell: scripts/*.sh + scripts/lib/*.sh."
  echo "Excluded: node_modules, dist, build, *.bak*, .git, logs, coverage, test files, LongMemEval data."
  echo ""
  echo "## Health summary"
  echo ""
  echo "| Tool | Count | Worst severity | Verdict |"
  echo "|------|-------|----------------|---------|"
  for row in "${SUMMARY_ROWS[@]}"; do
    IFS='|' read -r t c w v <<<"$row"
    printf '| %s | %s | %s | %s |\n' "$t" "$c" "$w" "$v"
  done
  echo ""
  echo "_Verdict legend: ✅ clean · ⚠️ attention · 🔴 serious._"
  echo ""
  echo "> The **\"What this means\"** judgment section is at the bottom — written for a"
  echo "> non-coder reader. The sections in between are the concrete evidence."
  cat "$BODY"
  echo ""
  echo "---"
  echo ""
  if [ -n "$PRIOR_JUDGMENT" ]; then
    # Re-run: keep the human-authored judgment verbatim.
    echo "$PRIOR_JUDGMENT"
  else
    # First run for this date: emit the template for a human to fill in.
    echo "## What this means (judgment)"
    echo ""
    echo "_PLACEHOLDER — fill this in based on the numbers above (written for a"
    echo "non-coder reader: what's genuinely healthy, the real risks, and a"
    echo "prioritized shortlist). A re-run of the harness will preserve whatever"
    echo "you write here._"
  fi
} >"$REPORT"

# Mirror into the repo (committed) and keep raw out of git.
mkdir -p "$REPO_REPORT_DIR"
cp "$REPORT" "$REPO_REPORT_DIR/code-health-$DATE.md"

# chown the report tree to ridgetop (we run as root; Lesson 002).
chown -R ridgetop:ridgetop "$REPORT_ROOT" 2>/dev/null || true

log "DONE"
echo "Consolidated report : $REPORT"
echo "Repo copy           : $REPO_REPORT_DIR/code-health-$DATE.md"
echo "Raw outputs         : $RAW  (gitignored)"
echo "Wall-time           : ${WALL}s"
rm -f "$BODY"
exit 0
