#!/bin/bash

# AIDIS Staging Functionality Test Suite
# Comprehensive testing of all staging components

cd "$(dirname "$0")"

echo "🧪 AIDIS Staging Functionality Test Suite"
echo "=========================================="

# Test results tracking
TOTAL_TESTS=0
PASSED_TESTS=0
FAILED_TESTS=0

# Function to run a test
run_test() {
    local test_name=$1
    local test_command=$2
    local expected_result=$3
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
    echo "🔍 Test $TOTAL_TESTS: $test_name"
    
    # Run the test
    if eval "$test_command" > /dev/null 2>&1; then
        if [ "$expected_result" = "success" ]; then
            echo "   ✅ PASSED"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            echo "   ❌ FAILED (unexpected success)"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    else
        if [ "$expected_result" = "fail" ]; then
            echo "   ✅ PASSED (expected failure)"
            PASSED_TESTS=$((PASSED_TESTS + 1))
        else
            echo "   ❌ FAILED"
            FAILED_TESTS=$((FAILED_TESTS + 1))
        fi
    fi
}

# Function to test HTTP endpoint
test_http() {
    local endpoint=$1
    local description=$2
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
    echo "🔍 Test $TOTAL_TESTS: $description"
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$endpoint" 2>/dev/null)
    if [ "$response" = "200" ] || [ "$response" = "301" ] || [ "$response" = "302" ]; then
        echo "   ✅ PASSED (HTTP $response)"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "   ❌ FAILED (HTTP $response)"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

# Function to test database query
test_database() {
    local query=$1
    local description=$2
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    echo ""
    echo "🔍 Test $TOTAL_TESTS: $description"
    
    if result=$(psql -h localhost -p 5432 -d aidis_staging -t -c "$query" 2>/dev/null); then
        echo "   ✅ PASSED (Result: $(echo $result | xargs))"
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        echo "   ❌ FAILED"
        FAILED_TESTS=$((FAILED_TESTS + 1))
    fi
}

echo ""
echo "🚀 Starting Comprehensive Tests..."

# 1. Service Status Tests
echo ""
echo "📊 SERVICE STATUS TESTS"
echo "======================="

run_test "MCP Server Process Running" "[ -f run/staging-mcp.pid ] && ps -p \$(cat run/staging-mcp.pid) > /dev/null" "success"
run_test "Backend Server Process Running" "[ -f run/staging-backend.pid ] && ps -p \$(cat run/staging-backend.pid) > /dev/null" "success"
run_test "Frontend Server Process Running" "[ -f run/staging-frontend.pid ] && ps -p \$(cat run/staging-frontend.pid) > /dev/null" "success"

# 2. Port Tests
echo ""
echo "🔌 PORT BINDING TESTS"
echo "===================="

run_test "MCP Port 9090 Listening" "netstat -ln | grep ':9090 '" "success"
run_test "Backend Port 6000 Listening" "netstat -ln | grep ':6000 '" "success" 
run_test "Frontend Port 3001 Listening" "netstat -ln | grep ':3001 '" "success"

# 3. HTTP Endpoint Tests
echo ""
echo "🌐 HTTP ENDPOINT TESTS"
echo "======================"

test_http "http://localhost:6000/healthz" "Backend Health Check"
test_http "http://localhost:3001" "Frontend Home Page"
test_http "http://localhost:6000/api/projects" "Backend API Endpoint"
test_http "http://localhost:9090/healthz" "MCP HTTP Health Check"

# 4. Database Tests
echo ""
echo "🗄️  DATABASE TESTS"
echo "=================="

test_database "SELECT 1" "Basic Database Connection"
test_database "SELECT count(*) FROM projects" "Projects Table Access"
test_database "SELECT count(*) FROM contexts" "Contexts Table Access" 
test_database "SELECT count(*) FROM sessions" "Sessions Table Access"
test_database "SELECT name FROM projects WHERE name = 'staging-test'" "Staging Test Data Present"

# 5. Integration Tests
echo ""
echo "🔗 INTEGRATION TESTS"
echo "===================="

# Test MCP tool availability (requires MCP client)
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "🔍 Test $TOTAL_TESTS: MCP Tools Available"
# This would need an MCP client to test properly
echo "   ⚪ SKIPPED (requires MCP client)"

# Test backend API functionality
TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "🔍 Test $TOTAL_TESTS: Backend API Functionality"
if api_response=$(curl -s "http://localhost:6000/api/projects" 2>/dev/null) && echo "$api_response" | grep -q "\"projects\""; then
    echo "   ✅ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "   ❌ FAILED"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi

# 6. Data Isolation Tests  
echo ""
echo "🔐 DATA ISOLATION TESTS"
echo "======================="

test_database "SELECT current_database()" "Connected to Staging Database"

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "🔍 Test $TOTAL_TESTS: Database Isolation Verified"
current_db=$(psql -h localhost -p 5432 -d aidis_staging -t -c "SELECT current_database();" 2>/dev/null | xargs)
if [ "$current_db" = "aidis_staging" ]; then
    echo "   ✅ PASSED (Connected to $current_db)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "   ❌ FAILED (Connected to $current_db, expected aidis_staging)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi

# 7. Configuration Tests
echo ""
echo "⚙️  CONFIGURATION TESTS"
echo "======================="

TOTAL_TESTS=$((TOTAL_TESTS + 1))
echo ""
echo "🔍 Test $TOTAL_TESTS: Staging Environment Variables"
if [ "$NODE_ENV" = "staging" ] || grep -q "NODE_ENV=staging" .env.staging; then
    echo "   ✅ PASSED (NODE_ENV configured for staging)"
    PASSED_TESTS=$((PASSED_TESTS + 1))
else
    echo "   ❌ FAILED (NODE_ENV not set to staging)"
    FAILED_TESTS=$((FAILED_TESTS + 1))
fi

# 8. Log File Tests
echo ""
echo "📋 LOG FILE TESTS"
echo "================="

run_test "MCP Log File Exists" "[ -f logs/mcp-staging.log ]" "success"
run_test "Backend Log File Exists" "[ -f logs/backend-staging.log ]" "success"
run_test "Frontend Log File Exists" "[ -f logs/frontend-staging.log ]" "success"

# Test results summary
echo ""
echo ""
echo "📊 TEST RESULTS SUMMARY"
echo "======================="
echo "Total Tests: $TOTAL_TESTS"
echo "Passed: $PASSED_TESTS"  
echo "Failed: $FAILED_TESTS"

success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
echo "Success Rate: $success_rate%"

echo ""
if [ $FAILED_TESTS -eq 0 ]; then
    echo "🎉 ALL TESTS PASSED! Staging environment is fully functional."
    exit 0
elif [ $success_rate -ge 80 ]; then
    echo "⚠️  Most tests passed, but some issues detected."
    echo "📋 Check logs for details:"
    echo "   tail -f logs/mcp-staging.log"
    echo "   tail -f logs/backend-staging.log"
    echo "   tail -f logs/frontend-staging.log"
    exit 1
else
    echo "❌ MULTIPLE TEST FAILURES - Staging environment needs attention!"
    echo "📋 Check service status: ./status-staging.sh"
    exit 2
fi
