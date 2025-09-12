#!/bin/bash
# AIDIS Log Management Setup Script
# Sets up centralized logging, rotation, and monitoring

set -euo pipefail

AIDIS_ROOT="/home/ridgetop/aidis"
CONFIG_FILE="$AIDIS_ROOT/conf/log-management.conf"

cd "$AIDIS_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "\n${BLUE}=== $1 ===${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

show_help() {
    cat << EOF
🔧 AIDIS Log Management Setup

Usage: $0 [OPTIONS] [COMMAND]

Commands:
    install         Full setup of log management system (default)
    configure       Configure log management only  
    test           Test log management components
    uninstall      Remove log management setup
    status         Check current setup status

Options:
    --cron         Install cron jobs for automation
    --no-cron      Skip cron job installation
    --force        Force reinstallation
    --dry-run      Show what would be done
    --help         Show this help

Examples:
    $0 install          # Full installation
    $0 install --cron   # Install with cron automation
    $0 test            # Test the setup
    $0 status          # Check current status
EOF
}

check_dependencies() {
    print_header "Checking Dependencies"
    
    local missing_deps=()
    
    # Check for required commands
    for cmd in logrotate bc crontab curl; do
        if ! command -v "$cmd" &> /dev/null; then
            missing_deps+=("$cmd")
        fi
    done
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        print_error "Missing dependencies: ${missing_deps[*]}"
        echo "Install with: sudo apt update && sudo apt install ${missing_deps[*]}"
        return 1
    fi
    
    print_success "All dependencies satisfied"
    return 0
}

setup_directories() {
    print_header "Setting up Log Directory Structure"
    
    # Source configuration
    if [ -f "$CONFIG_FILE" ]; then
        source "$CONFIG_FILE"
    fi
    
    # Create all log directories
    local directories=(
        "logs"
        "logs/archive"
        "logs/metrics"
        "logs/patterns"
        "logs/complexity"
        "logs/git-tracking"
        "logs/system"
        "logs/errors"
        "logs/archive/metrics"
        "logs/archive/patterns"
        "logs/archive/complexity"
        "logs/archive/git-tracking"
        "logs/archive/system"
        "logs/archive/errors"
        "conf"
        "conf/logrotate.d"
        "conf/cron"
    )
    
    for dir in "${directories[@]}"; do
        mkdir -p "$AIDIS_ROOT/$dir"
        print_success "Created directory: $dir"
    done
    
    # Set proper permissions
    chmod 755 logs logs/archive logs/*/
    print_success "Set directory permissions"
    
    # Create .gitkeep files for empty directories
    find logs -type d -empty -exec touch {}/.gitkeep \;
    print_success "Added .gitkeep files"
}

configure_logrotate() {
    print_header "Configuring Log Rotation"
    
    local logrotate_config="$AIDIS_ROOT/conf/logrotate.d/aidis"
    
    if [ ! -f "$logrotate_config" ]; then
        print_error "Logrotate configuration not found: $logrotate_config"
        return 1
    fi
    
    # Test logrotate configuration
    if logrotate -d "$logrotate_config" &>/dev/null; then
        print_success "Logrotate configuration is valid"
    else
        print_error "Logrotate configuration has errors"
        logrotate -d "$logrotate_config"
        return 1
    fi
    
    # Initialize logrotate state file
    local state_file="$AIDIS_ROOT/logs/.logrotate.state"
    if [ ! -f "$state_file" ]; then
        touch "$state_file"
        print_success "Created logrotate state file"
    fi
    
    print_success "Log rotation configured"
}

install_cron_jobs() {
    print_header "Installing Cron Jobs"
    
    local cron_config="$AIDIS_ROOT/conf/cron/aidis-logmanagement"
    
    if [ ! -f "$cron_config" ]; then
        print_error "Cron configuration not found: $cron_config"
        return 1
    fi
    
    # Backup existing crontab
    local backup_file="$AIDIS_ROOT/logs/system/crontab-backup-$(date +%Y%m%d-%H%M%S)"
    if crontab -l &>/dev/null; then
        crontab -l > "$backup_file"
        print_success "Backed up existing crontab to: $backup_file"
    fi
    
    # Check if AIDIS cron jobs already exist
    if crontab -l 2>/dev/null | grep -q "aidis.*log"; then
        print_warning "AIDIS log management cron jobs already exist"
        echo "Remove them first or use --force to replace"
        return 1
    fi
    
    # Add new cron jobs
    (crontab -l 2>/dev/null; echo ""; echo "# AIDIS Log Management"; cat "$cron_config") | crontab -
    print_success "Installed cron jobs for log management"
    
    # Verify cron jobs
    echo "Installed cron jobs:"
    crontab -l | grep aidis
}

create_test_logs() {
    print_header "Creating Test Logs"
    
    # Create some test log entries
    local test_logs=(
        "logs/aidis.log"
        "logs/aidis-core.log"
        "logs/system/monitoring.log"
        "logs/system/cleanup.log"
        "logs/metrics/collection.log"
    )
    
    for log_file in "${test_logs[@]}"; do
        mkdir -p "$(dirname "$log_file")"
        echo "$(date '+%Y-%m-%d %H:%M:%S') - Test log entry for setup verification" >> "$log_file"
        print_success "Created test entry in: $log_file"
    done
}

test_log_management() {
    print_header "Testing Log Management Components"
    
    local test_results=0
    
    # Test 1: Directory structure
    echo "🧪 Testing directory structure..."
    if [ -d "logs" ] && [ -d "logs/archive" ] && [ -d "logs/system" ]; then
        print_success "Directory structure: OK"
    else
        print_error "Directory structure: FAILED"
        ((test_results++))
    fi
    
    # Test 2: Scripts are executable
    echo "🧪 Testing script permissions..."
    local scripts=("log-rotate.sh" "log-analyze.sh" "log-monitor.sh" "log-cleanup.sh")
    for script in "${scripts[@]}"; do
        if [ -x "scripts/$script" ]; then
            print_success "Script executable: $script"
        else
            print_error "Script not executable: $script"
            ((test_results++))
        fi
    done
    
    # Test 3: Logrotate configuration
    echo "🧪 Testing logrotate configuration..."
    if logrotate -d "conf/logrotate.d/aidis" &>/dev/null; then
        print_success "Logrotate configuration: OK"
    else
        print_error "Logrotate configuration: FAILED"
        ((test_results++))
    fi
    
    # Test 4: Log analysis script
    echo "🧪 Testing log analysis..."
    if ./scripts/log-analyze.sh status &>/dev/null; then
        print_success "Log analysis script: OK"
    else
        print_error "Log analysis script: FAILED"
        ((test_results++))
    fi
    
    # Test 5: Log monitoring script
    echo "🧪 Testing log monitoring..."
    if ./scripts/log-monitor.sh test &>/dev/null; then
        print_success "Log monitoring script: OK"
    else
        print_error "Log monitoring script: FAILED"
        ((test_results++))
    fi
    
    # Test 6: Manual log rotation
    echo "🧪 Testing manual log rotation..."
    create_test_logs
    if ./scripts/log-rotate.sh &>/dev/null; then
        print_success "Manual log rotation: OK"
    else
        print_error "Manual log rotation: FAILED"
        ((test_results++))
    fi
    
    # Test 7: Cleanup dry run
    echo "🧪 Testing log cleanup (dry run)..."
    if ./scripts/log-cleanup.sh dry-run &>/dev/null; then
        print_success "Log cleanup: OK"
    else
        print_error "Log cleanup: FAILED"
        ((test_results++))
    fi
    
    # Summary
    echo
    if [ $test_results -eq 0 ]; then
        print_success "All tests passed! Log management system is ready."
    else
        print_error "$test_results test(s) failed. Check the issues above."
        return 1
    fi
    
    return 0
}

show_status() {
    print_header "Log Management Status"
    
    # Check directories
    echo "📁 Directory Structure:"
    if [ -d "logs" ]; then
        echo "  ✅ Main logs directory exists"
        echo "     - Active logs: $(find logs -maxdepth 1 -name "*.log" 2>/dev/null | wc -l) files"
        echo "     - Archived logs: $(find logs/archive -name "*.gz" 2>/dev/null | wc -l) files"
        echo "     - Total size: $(du -sh logs 2>/dev/null | cut -f1)"
    else
        echo "  ❌ Main logs directory missing"
    fi
    
    # Check scripts
    echo
    echo "🔧 Management Scripts:"
    local scripts=("log-rotate.sh" "log-analyze.sh" "log-monitor.sh" "log-cleanup.sh")
    for script in "${scripts[@]}"; do
        if [ -x "scripts/$script" ]; then
            echo "  ✅ $script"
        else
            echo "  ❌ $script (missing or not executable)"
        fi
    done
    
    # Check logrotate
    echo
    echo "🔄 Log Rotation:"
    if [ -f "conf/logrotate.d/aidis" ]; then
        echo "  ✅ Logrotate configuration exists"
        if [ -f "logs/.logrotate.state" ]; then
            local last_rotation
            last_rotation=$(stat -c %y "logs/.logrotate.state" 2>/dev/null || echo "never")
            echo "     - Last rotation: $last_rotation"
        fi
    else
        echo "  ❌ Logrotate configuration missing"
    fi
    
    # Check cron jobs
    echo
    echo "⏰ Cron Jobs:"
    if crontab -l 2>/dev/null | grep -q "aidis.*log"; then
        echo "  ✅ AIDIS log management cron jobs installed"
        echo "     Scheduled tasks:"
        crontab -l | grep "aidis" | sed 's/^/     /'
    else
        echo "  ❌ No AIDIS log management cron jobs found"
    fi
    
    # Check recent activity
    echo
    echo "📊 Recent Activity:"
    if [ -f "logs/system/monitoring.log" ]; then
        local recent_lines
        recent_lines=$(tail -5 "logs/system/monitoring.log" 2>/dev/null | wc -l)
        echo "  ✅ Monitoring log has $recent_lines recent entries"
    else
        echo "  ℹ️  No monitoring activity yet"
    fi
    
    if [ -f "logs/system/cleanup.log" ]; then
        local recent_cleanup
        recent_cleanup=$(tail -1 "logs/system/cleanup.log" 2>/dev/null || echo "No recent cleanup")
        echo "  📋 Last cleanup: $recent_cleanup"
    fi
}

install_log_management() {
    local dry_run="$1"
    local install_cron="$2"
    
    if [ "$dry_run" = "true" ]; then
        print_header "DRY RUN: Log Management Installation"
        echo "Would perform the following actions:"
        echo "  1. Check dependencies"
        echo "  2. Setup directory structure"
        echo "  3. Configure log rotation"
        if [ "$install_cron" = "true" ]; then
            echo "  4. Install cron jobs"
        fi
        echo "  5. Create test logs"
        echo "  6. Run validation tests"
        return 0
    fi
    
    print_header "Installing AIDIS Log Management System"
    
    # Step 1: Check dependencies
    check_dependencies || return 1
    
    # Step 2: Setup directories
    setup_directories || return 1
    
    # Step 3: Configure logrotate
    configure_logrotate || return 1
    
    # Step 4: Install cron jobs (optional)
    if [ "$install_cron" = "true" ]; then
        install_cron_jobs || return 1
    fi
    
    # Step 5: Create initial test logs
    create_test_logs || return 1
    
    # Step 6: Run tests
    test_log_management || return 1
    
    print_header "Installation Complete"
    print_success "AIDIS Log Management System installed successfully!"
    
    echo
    echo "Next steps:"
    echo "1. Review configuration: conf/log-management.conf"
    echo "2. Test log rotation: ./scripts/log-rotate.sh"
    echo "3. Monitor logs: ./scripts/log-monitor.sh monitor"
    echo "4. Analyze logs: ./scripts/log-analyze.sh status"
    
    if [ "$install_cron" != "true" ]; then
        echo "5. Install cron jobs: $0 install --cron"
    fi
}

uninstall_log_management() {
    print_header "Uninstalling AIDIS Log Management"
    
    print_warning "This will remove log management automation but preserve log files"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Uninstall cancelled"
        return 0
    fi
    
    # Remove cron jobs
    if crontab -l 2>/dev/null | grep -q "aidis.*log"; then
        print_header "Removing cron jobs..."
        crontab -l | grep -v "aidis.*log" | crontab -
        print_success "Removed AIDIS log management cron jobs"
    fi
    
    # Archive current logs
    local archive_dir="logs/uninstall-archive-$(date +%Y%m%d-%H%M%S)"
    mkdir -p "$archive_dir"
    cp -r logs/system "$archive_dir/" 2>/dev/null || true
    print_success "Archived system logs to: $archive_dir"
    
    print_success "Log management automation removed"
    print_warning "Log files and directories preserved"
}

# Parse command line arguments
DRY_RUN="false"
INSTALL_CRON="false"
FORCE="false"
COMMAND="install"

while [[ $# -gt 0 ]]; do
    case $1 in
        --cron)
            INSTALL_CRON="true"
            shift
            ;;
        --no-cron)
            INSTALL_CRON="false"
            shift
            ;;
        --force)
            FORCE="true"
            shift
            ;;
        --dry-run)
            DRY_RUN="true"
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        install|configure|test|uninstall|status)
            COMMAND="$1"
            shift
            ;;
        *)
            echo "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

# Execute command
case "$COMMAND" in
    install)
        install_log_management "$DRY_RUN" "$INSTALL_CRON"
        ;;
    configure)
        setup_directories
        configure_logrotate
        ;;
    test)
        test_log_management
        ;;
    uninstall)
        uninstall_log_management
        ;;
    status)
        show_status
        ;;
    *)
        echo "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac
