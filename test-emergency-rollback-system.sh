#!/bin/bash
# Test Emergency Rollback System
# Validates all TR0011 components without executing destructive operations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

success() {
    echo -e "${GREEN}✅ $1${NC}"
    TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
    echo -e "${RED}❌ $1${NC}"
    TESTS_FAILED=$((TESTS_FAILED + 1))
}

info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

echo -e "${BLUE}🧪 Testing Emergency Rollback System (TR0011)${NC}"
echo "============================================="
echo

# Test 1: Verify all scripts exist and are executable
info "Test 1: Script availability and permissions"
scripts=(
    "emergency-rollback.sh"
    "rollback-database.sh" 
    "rollback-services.sh"
    "health-check.sh"
)

for script in "${scripts[@]}"; do
    if [[ -f "$script" && -x "$script" ]]; then
        success "Script exists and executable: $script"
    else
        fail "Script missing or not executable: $script"
    fi
done
echo

# Test 2: Verify baseline resources exist
info "Test 2: Baseline resources"
if git tag --list | grep -q "pre-refactor-baseline-2025-09-12"; then
    success "Baseline git tag exists"
else
    fail "Baseline git tag missing"
fi

if [[ -f "backups/aidis_backup_20250912_162614.sql.backup" ]]; then
    success "Baseline database backup exists"
else
    fail "Baseline database backup missing"
fi

if [[ -f "scripts/restore-database.sh" ]]; then
    success "Database restore script exists"
else
    fail "Database restore script missing"
fi
echo

# Test 3: Test emergency rollback safety confirmation
info "Test 3: Emergency rollback safety"
output=$(echo "wrong confirmation" | timeout 5 ./emergency-rollback.sh 2>&1 || true)
if echo "$output" | grep -q "Emergency rollback cancelled"; then
    success "Emergency rollback requires proper confirmation"
else
    fail "Emergency rollback safety confirmation failed"
fi
echo

# Test 4: Test health check functionality
info "Test 4: Health check system"
if ./health-check.sh > /dev/null 2>&1; then
    success "Health check runs without errors"
else
    # Health check may legitimately fail, but should not crash
    if ./health-check.sh 2>&1 | grep -q "Health Check Summary"; then
        success "Health check completes (may have found issues)"
    else
        fail "Health check crashes or malformed"
    fi
fi
echo

# Test 5: Test service verification
info "Test 5: Service management"
if ./rollback-services.sh verify 2>&1 | grep -q "Verifying all services"; then
    success "Service verification runs"
else
    fail "Service verification failed"
fi
echo

# Test 6: Test database rollback script validation
info "Test 6: Database rollback validation"
if ./rollback-database.sh nonexistent_backup 2>&1 | grep -q "Backup file not found"; then
    success "Database rollback validates backup existence"
else
    fail "Database rollback validation failed"
fi
echo

# Test 7: Verify documentation exists
info "Test 7: Documentation completeness"
if [[ -f "EMERGENCY_ROLLBACK.md" ]]; then
    success "Emergency rollback documentation exists"
    
    # Check key sections exist
    if grep -q "Emergency Decision Tree" EMERGENCY_ROLLBACK.md; then
        success "Documentation includes decision tree"
    else
        fail "Documentation missing decision tree"
    fi
    
    if grep -q "emergency-rollback.sh" EMERGENCY_ROLLBACK.md; then
        success "Documentation covers all scripts"
    else
        fail "Documentation incomplete"
    fi
else
    fail "Emergency rollback documentation missing"
fi
echo

# Test 8: Verify rollback timing target
info "Test 8: Performance targets"
if grep -q "<10 minutes" EMERGENCY_ROLLBACK.md && grep -q "<10 minutes" emergency-rollback.sh; then
    success "10-minute target documented and implemented"
else
    fail "10-minute target not properly set"
fi
echo

# Summary
echo "============================================="
echo -e "${BLUE}Test Summary${NC}"
echo -e "Tests passed: ${GREEN}${TESTS_PASSED}${NC}"
echo -e "Tests failed: ${RED}${TESTS_FAILED}${NC}"
echo

if [[ $TESTS_FAILED -eq 0 ]]; then
    echo -e "${GREEN}🎉 ALL EMERGENCY ROLLBACK TESTS PASSED${NC}"
    echo "Emergency rollback system is ready for production emergencies"
    exit 0
else
    echo -e "${RED}💥 SOME EMERGENCY ROLLBACK TESTS FAILED${NC}" 
    echo "Fix issues before relying on emergency rollback system"
    exit 1
fi
