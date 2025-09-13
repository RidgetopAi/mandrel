#!/bin/bash
# AIDIS Comprehensive Health Check Script
# Verify system health after rollback operations
# Created for TR0011 - Emergency rollback procedures

set -e  # Exit on any error

# Configuration
AIDIS_ROOT="/home/ridgetop/aidis"
DB_NAME="aidis_production"
DB_HOST="localhost"
DB_PORT="5432"
DB_USER="ridgetop"
MCP_PORT="8080"
BACKEND_PORT="5000"
FRONTEND_PORT="3000"
HEALTH_TIMEOUT="10"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Test results
TESTS_PASSED=0
TESTS_FAILED=0
CRITICAL_FAILURES=0

# Logging function
log() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

info() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')] INFO:${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
    echo -e "${RED}❌ $1${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
    if [[ "${2:-}" == "critical" ]]; then
        CRITICAL_FAILURES=$((CRITICAL_FAILURES + 1))
    fi
}

# Test database connectivity
test_database() {
    info "Testing database connectivity..."
    
    # Basic connection test
    if psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -c "SELECT 1;" > /dev/null 2>&1; then
        success "Database connection"
        
        # Test database content
        local context_count=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM contexts;" 2>/dev/null | xargs || echo "0")
        local project_count=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM projects;" 2>/dev/null | xargs || echo "0")
        local session_count=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM sessions;" 2>/dev/null | xargs || echo "0")
        
        success "Database content - Contexts: ${context_count}, Projects: ${project_count}, Sessions: ${session_count}"
        
        # Verify key tables exist
        local table_count=$(psql -h "${DB_HOST}" -p "${DB_PORT}" -U "${DB_USER}" -d "${DB_NAME}" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" | xargs)
        if [[ "$table_count" -gt 10 ]]; then
            success "Database schema - ${table_count} tables"
        else
            fail "Database schema incomplete - only ${table_count} tables" "critical"
        fi
    else
        fail "Database connection" "critical"
    fi
}

# Test MCP server connectivity
test_mcp_server() {
    info "Testing MCP server connectivity..."
    
    # Check if port is open
    if ss -tlnp | grep -q ":${MCP_PORT} "; then
        success "MCP server port ${MCP_PORT} is open"
        
        # Test health endpoint
        local health_response=$(curl -s --connect-timeout ${HEALTH_TIMEOUT} "http://localhost:${MCP_PORT}/healthz" 2>/dev/null || echo "")
        if [[ -n "$health_response" ]]; then
            success "MCP server health endpoint: ${health_response}"
        else
            fail "MCP server health endpoint not responding"
        fi
        
        # Check if AIDIS process is running
        if [[ -f "${AIDIS_ROOT}/logs/aidis.pid" ]]; then
            local pid=$(cat "${AIDIS_ROOT}/logs/aidis.pid")
            if ps -p "$pid" > /dev/null 2>&1; then
                success "AIDIS MCP server process running (PID: ${pid})"
            else
                fail "AIDIS process not running (stale PID)" "critical"
            fi
        else
            fail "AIDIS PID file not found" "critical"
        fi
    else
        fail "MCP server port ${MCP_PORT} not open" "critical"
    fi
}

# Test AIDIS Command backend
test_aidis_backend() {
    info "Testing AIDIS Command backend..."
    
    # Check if backend port is responding
    if timeout ${HEALTH_TIMEOUT} bash -c "echo >/dev/tcp/localhost/${BACKEND_PORT}" 2>/dev/null; then
        success "AIDIS backend port ${BACKEND_PORT} is responding"
        
        # Try to get a simple API response
        local api_response=$(curl -s --connect-timeout ${HEALTH_TIMEOUT} "http://localhost:${BACKEND_PORT}/api/status" 2>/dev/null || echo "")
        if [[ -n "$api_response" ]]; then
            success "AIDIS backend API responding"
        else
            warning "AIDIS backend API not responding (may be expected)"
        fi
    else
        warning "AIDIS backend port ${BACKEND_PORT} not responding (may be expected)"
    fi
}

# Test frontend accessibility  
test_frontend() {
    info "Testing frontend accessibility..."
    
    # Check if frontend is served
    if timeout ${HEALTH_TIMEOUT} bash -c "echo >/dev/tcp/localhost/${FRONTEND_PORT}" 2>/dev/null; then
        success "Frontend port ${FRONTEND_PORT} is responding"
        
        # Test if we can get the main page
        local frontend_response=$(curl -s --connect-timeout ${HEALTH_TIMEOUT} -I "http://localhost:${FRONTEND_PORT}/" 2>/dev/null | head -n1 || echo "")
        if echo "$frontend_response" | grep -q "200 OK"; then
            success "Frontend serving content"
        else
            warning "Frontend not serving content properly"
        fi
    else
        warning "Frontend port ${FRONTEND_PORT} not responding (may be expected)"
    fi
}

# Test file system integrity
test_filesystem() {
    info "Testing file system integrity..."
    
    # Check critical AIDIS files exist
    local critical_files=(
        "${AIDIS_ROOT}/package.json"
        "${AIDIS_ROOT}/mcp-server/src/server.ts"
        "${AIDIS_ROOT}/start-aidis.sh"
        "${AIDIS_ROOT}/stop-aidis.sh"
        "${AIDIS_ROOT}/scripts/restore-database.sh"
    )
    
    local missing_files=0
    for file in "${critical_files[@]}"; do
        if [[ -f "$file" ]]; then
            success "Critical file exists: $(basename "$file")"
        else
            fail "Critical file missing: $file" "critical"
            missing_files=$((missing_files + 1))
        fi
    done
    
    if [[ $missing_files -eq 0 ]]; then
        success "All critical files present"
    fi
    
    # Check logs directory
    if [[ -d "${AIDIS_ROOT}/logs" ]]; then
        success "Logs directory exists"
    else
        fail "Logs directory missing" 
        mkdir -p "${AIDIS_ROOT}/logs" && success "Created logs directory"
    fi
}

# Test git repository state
test_git_state() {
    info "Testing git repository state..."
    
    cd "${AIDIS_ROOT}"
    
    # Check if we're in a git repository
    if [[ -d .git ]]; then
        success "Git repository detected"
        
        # Get current commit
        local current_commit=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
        local current_branch=$(git branch --show-current 2>/dev/null || echo "unknown")
        
        success "Current commit: ${current_commit:0:8}"
        success "Current branch: ${current_branch}"
        
        # Check if repository is clean
        if git diff --quiet && git diff --staged --quiet; then
            success "Git repository is clean"
        else
            warning "Git repository has uncommitted changes"
        fi
        
        # Check if we're on the baseline tag
        local baseline_commit=$(git rev-list -n 1 "pre-refactor-baseline-2025-09-12" 2>/dev/null || echo "")
        if [[ "$current_commit" == "$baseline_commit" ]]; then
            success "Repository is at baseline tag"
        else
            info "Repository is not at baseline tag (current development)"
        fi
    else
        fail "Not a git repository" "critical"
    fi
}

# Performance checks
test_performance() {
    info "Testing system performance..."
    
    # Check system load
    local load_1min=$(uptime | awk -F'load average:' '{print $2}' | awk -F',' '{print $1}' | xargs)
    if [[ $(echo "$load_1min < 2.0" | bc -l 2>/dev/null || echo 0) -eq 1 ]]; then
        success "System load acceptable: ${load_1min}"
    else
        warning "System load high: ${load_1min}"
    fi
    
    # Check available memory
    local mem_available=$(free -m | grep 'Available' | awk '{print $NF}' || echo 0)
    if [[ $mem_available -gt 500 ]]; then
        success "Available memory: ${mem_available}MB"
    else
        warning "Low available memory: ${mem_available}MB"
    fi
    
    # Check disk space
    local disk_available=$(df "${AIDIS_ROOT}" | tail -1 | awk '{print $(NF-2)}')
    local disk_available_gb=$((disk_available / 1024 / 1024))
    if [[ $disk_available_gb -gt 1 ]]; then
        success "Disk space available: ${disk_available_gb}GB"
    else
        warning "Low disk space: ${disk_available_gb}GB"
    fi
}

# Main health check execution
main() {
    echo -e "${BLUE}🏥 AIDIS Comprehensive Health Check${NC}"
    echo "======================================"
    echo

    local start_time=$(date +%s)

    # Run all health checks
    test_filesystem
    echo
    test_git_state
    echo
    test_database
    echo
    test_mcp_server
    echo
    test_aidis_backend
    echo
    test_frontend
    echo
    test_performance
    echo

    # Summary
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    
    echo "======================================"
    echo -e "${BLUE}Health Check Summary${NC}"
    echo "Duration: ${duration}s"
    echo -e "Tests passed: ${GREEN}${TESTS_PASSED}${NC}"
    echo -e "Tests failed: ${RED}${TESTS_FAILED}${NC}"
    echo -e "Critical failures: ${RED}${CRITICAL_FAILURES}${NC}"
    echo

    # Overall status
    if [[ $CRITICAL_FAILURES -eq 0 ]]; then
        if [[ $TESTS_FAILED -eq 0 ]]; then
            echo -e "${GREEN}🎉 ALL HEALTH CHECKS PASSED${NC}"
            echo "System is fully operational"
            exit 0
        else
            echo -e "${YELLOW}⚠️  SYSTEM OPERATIONAL WITH WARNINGS${NC}"
            echo "Some non-critical tests failed"
            exit 0
        fi
    else
        echo -e "${RED}💥 CRITICAL HEALTH CHECK FAILURES${NC}"
        echo "System requires immediate attention"
        exit 1
    fi
}

# Execute main function
main "$@"
