#!/bin/bash

# Mandrel Installation Validator
# ==============================
# Validates that all Mandrel prerequisites are installed and configured correctly.
# Run this after installation to verify your setup.
#
# Usage: ./scripts/validate-install.sh
#
# Exit codes:
#   0 - All required checks passed
#   1 - One or more required checks failed

set -o pipefail

# ===========================================
# CONFIGURATION
# ===========================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANDREL_ROOT="$(dirname "$SCRIPT_DIR")"

# Load environment variables if .env exists
if [[ -f "$MANDREL_ROOT/.env" ]]; then
    set -a
    source "$MANDREL_ROOT/.env"
    set +a
elif [[ -f "$MANDREL_ROOT/mcp-server/.env" ]]; then
    set -a
    source "$MANDREL_ROOT/mcp-server/.env"
    set +a
fi

# Default values (matching .env.example defaults)
DATABASE_HOST="${DATABASE_HOST:-localhost}"
DATABASE_PORT="${DATABASE_PORT:-5432}"
DATABASE_NAME="${DATABASE_NAME:-mandrel}"
DATABASE_USER="${DATABASE_USER:-mandrel}"
DATABASE_PASSWORD="${DATABASE_PASSWORD:-mandrel_dev_password}"
REDIS_URL="${REDIS_URL:-redis://localhost:6379}"
MCP_HEALTH_URL="${MCP_HEALTH_URL:-http://localhost:8080/health}"

# Counters
PASSED=0
FAILED=0
TOTAL=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# ===========================================
# HELPER FUNCTIONS
# ===========================================

check_pass() {
    local message="$1"
    echo -e "[${GREEN}\xE2\x9C\x93${NC}] $message"
    ((PASSED++))
    ((TOTAL++))
}

check_fail() {
    local message="$1"
    echo -e "[${RED}\xE2\x9C\x97${NC}] $message"
    ((FAILED++))
    ((TOTAL++))
}

check_warn() {
    local message="$1"
    echo -e "[${YELLOW}!${NC}] $message"
    ((TOTAL++))
}

# ===========================================
# CHECK FUNCTIONS
# ===========================================

check_nodejs() {
    if command -v node &> /dev/null; then
        local version=$(node -v 2>/dev/null | sed 's/v//')
        local major_version=$(echo "$version" | cut -d. -f1)

        if [[ "$major_version" -ge 18 ]]; then
            check_pass "Node.js $version (required: 18+)"
            return 0
        else
            check_fail "Node.js $version (required: 18+, found: $version)"
            return 1
        fi
    else
        check_fail "Node.js not installed (required: 18+)"
        return 1
    fi
}

check_postgresql_running() {
    # Try pg_isready first (most reliable)
    if command -v pg_isready &> /dev/null; then
        if pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" &> /dev/null; then
            # Get PostgreSQL version
            local pg_version=""
            if command -v psql &> /dev/null; then
                pg_version=$(psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -c "SELECT version();" -t 2>/dev/null | head -1 | awk '{print $2}' || echo "")
            fi
            if [[ -n "$pg_version" ]]; then
                check_pass "PostgreSQL $pg_version running on $DATABASE_HOST:$DATABASE_PORT"
            else
                check_pass "PostgreSQL running on $DATABASE_HOST:$DATABASE_PORT"
            fi
            return 0
        fi
    fi

    # Fallback: check if port is open
    if nc -z "$DATABASE_HOST" "$DATABASE_PORT" 2>/dev/null; then
        check_pass "PostgreSQL port $DATABASE_PORT is open (cannot verify version)"
        return 0
    fi

    check_fail "PostgreSQL not running on $DATABASE_HOST:$DATABASE_PORT"
    return 1
}

check_database_accessible() {
    if ! command -v psql &> /dev/null; then
        check_fail "psql command not found - cannot verify database accessibility"
        return 1
    fi

    export PGPASSWORD="$DATABASE_PASSWORD"
    if psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" -c "SELECT 1;" &> /dev/null; then
        check_pass "Database '$DATABASE_NAME' accessible"
        unset PGPASSWORD
        return 0
    else
        check_fail "Database '$DATABASE_NAME' not accessible (check credentials)"
        unset PGPASSWORD
        return 1
    fi
}

check_extension() {
    local extension_name="$1"
    local display_name="${2:-$extension_name}"

    if ! command -v psql &> /dev/null; then
        check_fail "$display_name extension - psql not available"
        return 1
    fi

    export PGPASSWORD="$DATABASE_PASSWORD"
    local result=$(psql -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER" -d "$DATABASE_NAME" \
        -t -c "SELECT 1 FROM pg_extension WHERE extname = '$extension_name';" 2>/dev/null | tr -d ' ')
    unset PGPASSWORD

    if [[ "$result" == "1" ]]; then
        check_pass "$display_name extension installed"
        return 0
    else
        check_fail "$display_name extension not installed"
        echo "      Hint: CREATE EXTENSION IF NOT EXISTS $extension_name;"
        return 1
    fi
}

check_pgvector() {
    check_extension "vector" "pgvector"
}

check_pg_trgm() {
    check_extension "pg_trgm" "pg_trgm"
}

check_pgcrypto() {
    check_extension "pgcrypto" "pgcrypto"
}

check_uuid_ossp() {
    check_extension "uuid-ossp" "uuid-ossp"
}

check_mcp_health() {
    if command -v curl &> /dev/null; then
        local response=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$MCP_HEALTH_URL" 2>/dev/null)

        if [[ "$response" == "200" ]]; then
            local health_body=$(curl -s --connect-timeout 5 "$MCP_HEALTH_URL" 2>/dev/null)
            local version=$(echo "$health_body" | grep -o '"version":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
            if [[ -n "$version" && "$version" != "unknown" ]]; then
                check_pass "MCP server responding on :8080 (version: $version)"
            else
                check_pass "MCP server responding on :8080"
            fi
            return 0
        fi
    fi

    check_fail "MCP server not responding on :8080"
    echo "      Hint: Start the server with 'npm run dev' in mcp-server/"
    return 1
}

check_redis() {
    # Extract host and port from REDIS_URL (e.g., redis://localhost:6379)
    local redis_host=$(echo "$REDIS_URL" | sed -E 's|redis://([^:/]+).*|\1|')
    local redis_port=$(echo "$REDIS_URL" | sed -E 's|redis://[^:]+:([0-9]+).*|\1|')
    redis_host="${redis_host:-localhost}"
    redis_port="${redis_port:-6379}"

    # Check if redis-cli is available
    if command -v redis-cli &> /dev/null; then
        if redis-cli -h "$redis_host" -p "$redis_port" ping &> /dev/null; then
            check_pass "Redis running on $redis_host:$redis_port"
            return 0
        fi
    fi

    # Fallback: check if port is open
    if nc -z "$redis_host" "$redis_port" 2>/dev/null; then
        check_pass "Redis port $redis_port is open"
        return 0
    fi

    check_warn "Redis not running on $redis_host:$redis_port (optional - needed for job queues)"
    return 0  # Redis is optional, so don't fail
}

check_env_files() {
    local env_found=0
    local env_locations=(
        "$MANDREL_ROOT/.env"
        "$MANDREL_ROOT/mcp-server/.env"
    )

    for env_file in "${env_locations[@]}"; do
        if [[ -f "$env_file" ]]; then
            env_found=1
            break
        fi
    done

    if [[ $env_found -eq 1 ]]; then
        check_pass ".env file exists"
        return 0
    else
        check_fail ".env file not found"
        echo "      Hint: Copy .env.example to .env and configure"
        return 1
    fi
}

# ===========================================
# MAIN
# ===========================================

echo ""
echo "Mandrel Installation Validator"
echo "=============================="
echo ""

# Run all checks
check_nodejs
check_postgresql_running
check_database_accessible
check_pgvector
check_pg_trgm
check_pgcrypto
check_uuid_ossp
check_mcp_health
check_redis
check_env_files

# Summary
echo ""
echo "=============================="
echo "Result: $PASSED/$TOTAL checks passed"
echo ""

if [[ $FAILED -gt 0 ]]; then
    echo -e "${RED}Some required checks failed. Please fix the issues above.${NC}"
    exit 1
else
    echo -e "${GREEN}All required checks passed! Mandrel is ready to use.${NC}"
    exit 0
fi
