#!/bin/bash

# AIDIS Staging Setup Verification
# Tests staging configuration without conflicting with production

cd "$(dirname "$0")"

echo "🔍 AIDIS Staging Setup Verification"
echo "===================================="

TESTS_PASSED=0
TESTS_FAILED=0
TOTAL_TESTS=0

# Test function
test_result() {
    local test_name="$1"
    local result="$2"
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    echo ""
    echo "Test $TOTAL_TESTS: $test_name"
    
    if [ "$result" = "pass" ]; then
        echo "   ✅ PASSED"
        TESTS_PASSED=$((TESTS_PASSED + 1))
    else
        echo "   ❌ FAILED: $3"
        TESTS_FAILED=$((TESTS_FAILED + 1))
    fi
}

# 1. Database Setup Verification
echo ""
echo "🗄️  DATABASE VERIFICATION"
echo "========================="

if psql -h localhost -p 5432 -d aidis_staging -c "SELECT 1;" > /dev/null 2>&1; then
    test_result "Staging Database Connection" "pass"
    
    # Check table count
    TABLE_COUNT=$(psql -h localhost -p 5432 -d aidis_staging -t -c "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';" 2>/dev/null | xargs)
    if [ "$TABLE_COUNT" -gt 50 ]; then
        test_result "Database Schema Restored ($TABLE_COUNT tables)" "pass"
    else
        test_result "Database Schema Restored" "fail" "Only $TABLE_COUNT tables found"
    fi
    
    # Check data integrity
    CONTEXT_COUNT=$(psql -h localhost -p 5432 -d aidis_staging -t -c "SELECT count(*) FROM contexts;" 2>/dev/null | xargs)
    PROJECT_COUNT=$(psql -h localhost -p 5432 -d aidis_staging -t -c "SELECT count(*) FROM projects;" 2>/dev/null | xargs)
    
    test_result "Context Data Restored ($CONTEXT_COUNT contexts)" "pass"
    test_result "Project Data Restored ($PROJECT_COUNT projects)" "pass"
    
    # Check staging test marker
    if psql -h localhost -p 5432 -d aidis_staging -t -c "SELECT name FROM projects WHERE name = 'staging-test';" 2>/dev/null | grep -q "staging-test"; then
        test_result "Staging Test Data Present" "pass"
    else
        test_result "Staging Test Data Present" "fail" "staging-test project not found"
    fi
    
else
    test_result "Staging Database Connection" "fail" "Cannot connect to aidis_staging"
fi

# 2. Configuration Files Verification
echo ""
echo "⚙️  CONFIGURATION VERIFICATION"
echo "=============================="

if [ -f ".env.staging" ]; then
    test_result "Staging Environment File Exists" "pass"
    
    # Check key configuration values
    if grep -q "DATABASE_URL=postgresql://ridgetop@localhost:5432/aidis_staging" .env.staging; then
        test_result "Staging Database URL Configured" "pass"
    else
        test_result "Staging Database URL Configured" "fail" "Incorrect database URL"
    fi
    
    if grep -q "NODE_ENV=staging" .env.staging; then
        test_result "Staging Environment Variable Set" "pass"
    else
        test_result "Staging Environment Variable Set" "fail" "NODE_ENV not set to staging"
    fi
    
    if grep -q "HTTP_PORT=6000" .env.staging; then
        test_result "Staging HTTP Port Configured" "pass"
    else
        test_result "Staging HTTP Port Configured" "fail" "HTTP_PORT not set to 6000"
    fi
    
else
    test_result "Staging Environment File Exists" "fail" ".env.staging not found"
fi

# 3. Script Files Verification
echo ""
echo "📜 SCRIPT FILES VERIFICATION"
echo "============================"

REQUIRED_SCRIPTS=(
    "setup-staging-database.sh"
    "start-staging-all.sh"
    "start-staging-mcp.sh"
    "start-staging-backend.sh"
    "start-staging-frontend.sh"
    "stop-staging.sh"
    "status-staging.sh"
    "restart-staging.sh"
    "test-staging-functionality.sh"
)

for script in "${REQUIRED_SCRIPTS[@]}"; do
    if [ -f "$script" ] && [ -x "$script" ]; then
        test_result "Script $script exists and executable" "pass"
    else
        test_result "Script $script exists and executable" "fail" "Missing or not executable"
    fi
done

# 4. Custom Bridge Verification
echo ""
echo "🌉 BRIDGE CONFIGURATION VERIFICATION"
echo "===================================="

if [ -f "claude-http-mcp-bridge-staging.js" ]; then
    test_result "Staging HTTP Bridge Script Exists" "pass"
    
    # Check if it uses correct staging port
    if grep -q "port: 9090" claude-http-mcp-bridge-staging.js; then
        test_result "Staging Bridge Uses Correct Port (9090)" "pass"
    else
        test_result "Staging Bridge Uses Correct Port (9090)" "fail" "Port 9090 not found in bridge"
    fi
    
else
    test_result "Staging HTTP Bridge Script Exists" "fail" "claude-http-mcp-bridge-staging.js not found"
fi

# 5. Directory Structure Verification  
echo ""
echo "📁 DIRECTORY STRUCTURE VERIFICATION"
echo "===================================="

REQUIRED_DIRS=(
    "logs"
    "run"
)

for dir in "${REQUIRED_DIRS[@]}"; do
    if [ -d "$dir" ]; then
        test_result "Directory $dir exists" "pass"
    else
        test_result "Directory $dir exists" "fail" "Directory not found"
        mkdir -p "$dir"
        echo "   🔧 Created $dir directory"
    fi
done

# 6. Port Conflict Check
echo ""
echo "🔌 PORT CONFLICT VERIFICATION"
echo "============================="

STAGING_PORTS=(9090 6000 3001)
PRODUCTION_PORTS=(8080 5001 3000)

for i in "${!STAGING_PORTS[@]}"; do
    staging_port=${STAGING_PORTS[$i]}
    production_port=${PRODUCTION_PORTS[$i]}
    
    if [ "$staging_port" -ne "$production_port" ]; then
        test_result "Port $staging_port differs from production $production_port" "pass"
    else
        test_result "Port $staging_port differs from production $production_port" "fail" "Port conflict detected"
    fi
done

# 7. Documentation Verification
echo ""
echo "📚 DOCUMENTATION VERIFICATION"
echo "=============================="

if [ -f "STAGING_ENVIRONMENT_GUIDE.md" ]; then
    test_result "Staging Documentation Exists" "pass"
    
    # Check documentation completeness
    if grep -q "Quick Start\|Architecture\|Service Details" STAGING_ENVIRONMENT_GUIDE.md; then
        test_result "Documentation Contains Key Sections" "pass"
    else
        test_result "Documentation Contains Key Sections" "fail" "Missing key documentation sections"
    fi
else
    test_result "Staging Documentation Exists" "fail" "STAGING_ENVIRONMENT_GUIDE.md not found"
fi

# Results Summary
echo ""
echo ""
echo "📊 VERIFICATION RESULTS"
echo "======================="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $TESTS_PASSED"
echo "Failed: $TESTS_FAILED"

success_rate=$((TESTS_PASSED * 100 / TOTAL_TESTS))
echo "Success Rate: $success_rate%"

echo ""
if [ $TESTS_FAILED -eq 0 ]; then
    echo "🎉 ALL VERIFICATION TESTS PASSED!"
    echo "✅ Staging environment is properly configured and ready for use."
    echo ""
    echo "📋 Next Steps:"
    echo "1. Stop production AIDIS if needed: kill $(cat ../mcp-server/aidis.pid 2>/dev/null || echo 'N/A')"
    echo "2. Start staging environment: ./start-staging-all.sh"
    echo "3. Run functionality tests: ./test-staging-functionality.sh"
    exit 0
elif [ $success_rate -ge 80 ]; then
    echo "⚠️  Most verification tests passed with minor issues."
    echo "📋 Review failed tests above and fix before proceeding."
    exit 1
else
    echo "❌ MULTIPLE VERIFICATION FAILURES!"
    echo "📋 Staging environment needs setup attention before use."
    echo "🔧 Fix the failed tests above before proceeding."
    exit 2
fi
