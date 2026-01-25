#!/bin/bash

# =============================================================================
# Mandrel Complete Setup Script
# =============================================================================
# Comprehensive setup script that detects OS, installs dependencies,
# configures PostgreSQL, and validates the installation.
#
# Usage: ./scripts/setup.sh
#
# This script will:
#   1. Detect OS (macOS vs Ubuntu/Debian vs other)
#   2. Install dependencies via appropriate package manager
#   3. Set up PostgreSQL (user, database, extensions)
#   4. Copy .env.example to .env if needed
#   5. Run npm install in all directories
#   6. Run database migrations
#   7. Run validate-install.sh at the end
#
# Exit codes:
#   0 - Setup completed successfully
#   1 - Setup failed
# =============================================================================

set -euo pipefail

# =============================================================================
# CONFIGURATION
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MANDREL_ROOT="$(dirname "$SCRIPT_DIR")"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Default database values (from .env.example)
DEFAULT_DB_HOST="localhost"
DEFAULT_DB_PORT="5432"
DEFAULT_DB_NAME="mandrel"
DEFAULT_DB_USER="mandrel"
DEFAULT_DB_PASSWORD="mandrel_dev_password"

# =============================================================================
# LOGGING FUNCTIONS
# =============================================================================

log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

step() {
    echo ""
    echo -e "${CYAN}========================================${NC}"
    echo -e "${CYAN}$1${NC}"
    echo -e "${CYAN}========================================${NC}"
}

# =============================================================================
# OS DETECTION
# =============================================================================

detect_os() {
    OS_TYPE="unknown"
    PKG_MANAGER="unknown"

    if [[ "$OSTYPE" == "darwin"* ]]; then
        OS_TYPE="macos"
        if command -v brew &> /dev/null; then
            PKG_MANAGER="brew"
        else
            error "Homebrew not found. Please install Homebrew first:"
            echo "  /bin/bash -c \"\$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)\""
            exit 1
        fi
    elif [[ -f /etc/debian_version ]]; then
        OS_TYPE="debian"
        PKG_MANAGER="apt"
    elif [[ -f /etc/redhat-release ]]; then
        OS_TYPE="redhat"
        PKG_MANAGER="dnf"
        if ! command -v dnf &> /dev/null; then
            PKG_MANAGER="yum"
        fi
    elif [[ -f /etc/arch-release ]]; then
        OS_TYPE="arch"
        PKG_MANAGER="pacman"
    fi

    log "Detected OS: $OS_TYPE (package manager: $PKG_MANAGER)"
}

# =============================================================================
# DEPENDENCY INSTALLATION
# =============================================================================

install_dependencies_macos() {
    log "Installing dependencies with Homebrew..."

    # Update Homebrew
    brew update || warn "Failed to update Homebrew"

    # Install Node.js if not present or version < 18
    if ! command -v node &> /dev/null; then
        log "Installing Node.js..."
        brew install node@20
    else
        local node_version=$(node -v | sed 's/v//' | cut -d. -f1)
        if [[ "$node_version" -lt 18 ]]; then
            warn "Node.js version $node_version is too old, installing Node.js 20..."
            brew install node@20
        else
            log "Node.js $(node -v) already installed"
        fi
    fi

    # Install PostgreSQL if not present
    if ! command -v psql &> /dev/null; then
        log "Installing PostgreSQL..."
        brew install postgresql@16
        brew services start postgresql@16
    else
        log "PostgreSQL already installed"
    fi

    # Install pgvector
    log "Installing pgvector extension..."
    brew install pgvector || warn "pgvector may already be installed"

    # Install Redis (optional)
    if ! command -v redis-cli &> /dev/null; then
        log "Installing Redis (optional)..."
        brew install redis || warn "Failed to install Redis"
    fi
}

install_dependencies_debian() {
    log "Installing dependencies with APT..."

    # Check if running as root or with sudo
    SUDO=""
    if [[ $EUID -ne 0 ]]; then
        if command -v sudo &> /dev/null; then
            SUDO="sudo"
        else
            error "This script requires root privileges or sudo"
            exit 1
        fi
    fi

    # Update package list
    $SUDO apt-get update

    # Install essential build tools
    log "Installing build essentials..."
    $SUDO apt-get install -y curl wget gnupg2 lsb-release ca-certificates build-essential

    # Install Node.js 20.x (via NodeSource)
    if ! command -v node &> /dev/null; then
        log "Installing Node.js 20.x..."
        curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
        $SUDO apt-get install -y nodejs
    else
        local node_version=$(node -v | sed 's/v//' | cut -d. -f1)
        if [[ "$node_version" -lt 18 ]]; then
            warn "Node.js version $node_version is too old, installing Node.js 20..."
            curl -fsSL https://deb.nodesource.com/setup_20.x | $SUDO -E bash -
            $SUDO apt-get install -y nodejs
        else
            log "Node.js $(node -v) already installed"
        fi
    fi

    # Install PostgreSQL 16 with pgvector
    if ! command -v psql &> /dev/null; then
        log "Installing PostgreSQL 16..."
        # Add PostgreSQL official APT repository
        $SUDO sh -c 'echo "deb https://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
        wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | $SUDO apt-key add -
        $SUDO apt-get update
        $SUDO apt-get install -y postgresql-16 postgresql-16-pgvector
    else
        log "PostgreSQL already installed"
        # Install pgvector for existing PostgreSQL
        local pg_version=$($SUDO -u postgres psql -t -c "SHOW server_version_num;" 2>/dev/null | tr -d ' ' | head -c 2)
        if [[ -n "$pg_version" ]]; then
            $SUDO apt-get install -y postgresql-${pg_version}-pgvector || warn "Could not install pgvector for PostgreSQL $pg_version"
        fi
    fi

    # Install Redis (optional)
    if ! command -v redis-cli &> /dev/null; then
        log "Installing Redis (optional)..."
        $SUDO apt-get install -y redis-server || warn "Failed to install Redis"
    fi

    # Start services
    $SUDO systemctl enable postgresql || true
    $SUDO systemctl start postgresql || true
}

install_dependencies_redhat() {
    log "Installing dependencies with DNF/YUM..."

    SUDO=""
    if [[ $EUID -ne 0 ]]; then
        if command -v sudo &> /dev/null; then
            SUDO="sudo"
        else
            error "This script requires root privileges or sudo"
            exit 1
        fi
    fi

    # Install Node.js
    if ! command -v node &> /dev/null; then
        log "Installing Node.js 20.x..."
        curl -fsSL https://rpm.nodesource.com/setup_20.x | $SUDO bash -
        $SUDO $PKG_MANAGER install -y nodejs
    else
        log "Node.js $(node -v) already installed"
    fi

    # Install PostgreSQL
    if ! command -v psql &> /dev/null; then
        log "Installing PostgreSQL..."
        $SUDO $PKG_MANAGER install -y postgresql-server postgresql-contrib
        $SUDO postgresql-setup --initdb || true
        $SUDO systemctl enable postgresql
        $SUDO systemctl start postgresql
    fi

    warn "pgvector may need to be compiled from source on Red Hat-based systems"
    warn "See: https://github.com/pgvector/pgvector#installation"
}

install_dependencies_arch() {
    log "Installing dependencies with Pacman..."

    SUDO=""
    if [[ $EUID -ne 0 ]]; then
        if command -v sudo &> /dev/null; then
            SUDO="sudo"
        else
            error "This script requires root privileges or sudo"
            exit 1
        fi
    fi

    # Install Node.js
    if ! command -v node &> /dev/null; then
        log "Installing Node.js..."
        $SUDO pacman -S --noconfirm nodejs npm
    else
        log "Node.js $(node -v) already installed"
    fi

    # Install PostgreSQL
    if ! command -v psql &> /dev/null; then
        log "Installing PostgreSQL..."
        $SUDO pacman -S --noconfirm postgresql
        $SUDO -u postgres initdb -D /var/lib/postgres/data || true
        $SUDO systemctl enable postgresql
        $SUDO systemctl start postgresql
    fi

    warn "pgvector may need to be installed from AUR on Arch Linux"
}

install_dependencies() {
    step "Installing System Dependencies"

    case "$OS_TYPE" in
        macos)
            install_dependencies_macos
            ;;
        debian)
            install_dependencies_debian
            ;;
        redhat)
            install_dependencies_redhat
            ;;
        arch)
            install_dependencies_arch
            ;;
        *)
            error "Unsupported OS: $OS_TYPE"
            echo "Please install the following manually:"
            echo "  - Node.js 18+"
            echo "  - PostgreSQL 14+ with pgvector extension"
            echo "  - Redis (optional)"
            exit 1
            ;;
    esac

    success "System dependencies installed"
}

# =============================================================================
# POSTGRESQL SETUP
# =============================================================================

setup_postgresql() {
    step "Setting Up PostgreSQL"

    # Load environment if exists
    if [[ -f "$MANDREL_ROOT/.env" ]]; then
        set -a
        source "$MANDREL_ROOT/.env"
        set +a
    fi

    DB_HOST="${DATABASE_HOST:-$DEFAULT_DB_HOST}"
    DB_PORT="${DATABASE_PORT:-$DEFAULT_DB_PORT}"
    DB_NAME="${DATABASE_NAME:-$DEFAULT_DB_NAME}"
    DB_USER="${DATABASE_USER:-$DEFAULT_DB_USER}"
    DB_PASSWORD="${DATABASE_PASSWORD:-$DEFAULT_DB_PASSWORD}"

    log "Database configuration:"
    log "  Host: $DB_HOST"
    log "  Port: $DB_PORT"
    log "  Database: $DB_NAME"
    log "  User: $DB_USER"

    # Determine how to run PostgreSQL commands
    PG_CMD_PREFIX=""
    if [[ "$OS_TYPE" == "macos" ]]; then
        # On macOS, Homebrew PostgreSQL runs as the current user
        PG_CMD_PREFIX=""
    else
        # On Linux, use sudo -u postgres
        PG_CMD_PREFIX="sudo -u postgres"
    fi

    # Create database user if it doesn't exist
    log "Creating database user '$DB_USER'..."
    if [[ "$OS_TYPE" == "macos" ]]; then
        # macOS - check if user exists, create if not
        if ! psql -U postgres -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>/dev/null | grep -q 1; then
            createuser -U postgres -s "$DB_USER" 2>/dev/null || \
            psql -U postgres -c "CREATE USER $DB_USER WITH SUPERUSER PASSWORD '$DB_PASSWORD';" 2>/dev/null || \
            warn "User may already exist or cannot be created"
        fi
        # Set password
        psql -U postgres -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || true
    else
        # Linux with postgres user
        $PG_CMD_PREFIX psql -tc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" 2>/dev/null | grep -q 1 || \
            $PG_CMD_PREFIX psql -c "CREATE USER $DB_USER WITH SUPERUSER PASSWORD '$DB_PASSWORD';" 2>/dev/null || \
            warn "User may already exist"
        # Set password
        $PG_CMD_PREFIX psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || true
    fi

    # Create database if it doesn't exist
    log "Creating database '$DB_NAME'..."
    if [[ "$OS_TYPE" == "macos" ]]; then
        createdb -U postgres "$DB_NAME" 2>/dev/null || warn "Database may already exist"
        psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true
    else
        $PG_CMD_PREFIX createdb "$DB_NAME" 2>/dev/null || warn "Database may already exist"
        $PG_CMD_PREFIX psql -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" 2>/dev/null || true
    fi

    # Install PostgreSQL extensions
    log "Installing PostgreSQL extensions..."

    if [[ "$OS_TYPE" == "macos" ]]; then
        PSQL_CMD="psql -U postgres -d $DB_NAME"
    else
        PSQL_CMD="$PG_CMD_PREFIX psql -d $DB_NAME"
    fi

    # Install extensions
    $PSQL_CMD -c "CREATE EXTENSION IF NOT EXISTS vector;" 2>/dev/null || warn "pgvector extension may need manual installation"
    $PSQL_CMD -c "CREATE EXTENSION IF NOT EXISTS pg_trgm;" 2>/dev/null || warn "pg_trgm extension failed"
    $PSQL_CMD -c "CREATE EXTENSION IF NOT EXISTS pgcrypto;" 2>/dev/null || warn "pgcrypto extension failed"
    $PSQL_CMD -c 'CREATE EXTENSION IF NOT EXISTS "uuid-ossp";' 2>/dev/null || warn "uuid-ossp extension failed"

    success "PostgreSQL setup complete"
}

# =============================================================================
# ENVIRONMENT SETUP
# =============================================================================

setup_environment() {
    step "Setting Up Environment"

    # Copy .env.example to .env if .env doesn't exist
    if [[ ! -f "$MANDREL_ROOT/.env" ]]; then
        if [[ -f "$MANDREL_ROOT/.env.example" ]]; then
            log "Copying .env.example to .env..."
            cp "$MANDREL_ROOT/.env.example" "$MANDREL_ROOT/.env"
            chmod 600 "$MANDREL_ROOT/.env"
            success "Created .env from .env.example"
            warn "Please review and update .env with your settings"
        else
            error ".env.example not found at $MANDREL_ROOT/.env.example"
            exit 1
        fi
    else
        log ".env file already exists"
    fi

    # Create mcp-server .env if needed
    if [[ ! -f "$MANDREL_ROOT/mcp-server/.env" ]]; then
        if [[ -f "$MANDREL_ROOT/mcp-server/.env.example" ]]; then
            log "Copying mcp-server/.env.example to .env..."
            cp "$MANDREL_ROOT/mcp-server/.env.example" "$MANDREL_ROOT/mcp-server/.env"
            chmod 600 "$MANDREL_ROOT/mcp-server/.env"
        elif [[ -f "$MANDREL_ROOT/.env" ]]; then
            log "Linking mcp-server/.env to root .env..."
            ln -sf "$MANDREL_ROOT/.env" "$MANDREL_ROOT/mcp-server/.env" || \
            cp "$MANDREL_ROOT/.env" "$MANDREL_ROOT/mcp-server/.env"
        fi
    fi

    # Create mandrel-command backend .env if needed
    if [[ ! -f "$MANDREL_ROOT/mandrel-command/backend/.env" ]]; then
        if [[ -f "$MANDREL_ROOT/mandrel-command/.env.example" ]]; then
            log "Copying mandrel-command/.env.example to backend/.env..."
            cp "$MANDREL_ROOT/mandrel-command/.env.example" "$MANDREL_ROOT/mandrel-command/backend/.env"
            chmod 600 "$MANDREL_ROOT/mandrel-command/backend/.env"
        elif [[ -f "$MANDREL_ROOT/.env" ]]; then
            log "Copying root .env to mandrel-command/backend/.env..."
            cp "$MANDREL_ROOT/.env" "$MANDREL_ROOT/mandrel-command/backend/.env"
        fi
    fi

    # Create necessary directories
    log "Creating required directories..."
    mkdir -p "$MANDREL_ROOT/logs"
    mkdir -p "$MANDREL_ROOT/run"

    success "Environment setup complete"
}

# =============================================================================
# NPM INSTALL
# =============================================================================

run_npm_install() {
    step "Installing Node.js Dependencies"

    # Install in mcp-server
    if [[ -f "$MANDREL_ROOT/mcp-server/package.json" ]]; then
        log "Installing dependencies in mcp-server/..."
        cd "$MANDREL_ROOT/mcp-server"
        npm install
        success "mcp-server dependencies installed"
    else
        warn "mcp-server/package.json not found"
    fi

    # Install in mandrel-command/backend
    if [[ -f "$MANDREL_ROOT/mandrel-command/backend/package.json" ]]; then
        log "Installing dependencies in mandrel-command/backend/..."
        cd "$MANDREL_ROOT/mandrel-command/backend"
        npm install
        success "mandrel-command/backend dependencies installed"
    else
        warn "mandrel-command/backend/package.json not found"
    fi

    # Install in mandrel-command/frontend
    if [[ -f "$MANDREL_ROOT/mandrel-command/frontend/package.json" ]]; then
        log "Installing dependencies in mandrel-command/frontend/..."
        cd "$MANDREL_ROOT/mandrel-command/frontend"
        npm install
        success "mandrel-command/frontend dependencies installed"
    else
        warn "mandrel-command/frontend/package.json not found"
    fi

    # Return to root
    cd "$MANDREL_ROOT"

    success "All Node.js dependencies installed"
}

# =============================================================================
# DATABASE MIGRATIONS
# =============================================================================

run_migrations() {
    step "Running Database Migrations"

    # Load environment
    if [[ -f "$MANDREL_ROOT/.env" ]]; then
        set -a
        source "$MANDREL_ROOT/.env"
        set +a
    fi

    # Check for migration scripts in mcp-server
    if [[ -d "$MANDREL_ROOT/mcp-server/src/db/migrations" ]] || [[ -d "$MANDREL_ROOT/mcp-server/migrations" ]]; then
        log "Running MCP server migrations..."
        cd "$MANDREL_ROOT/mcp-server"

        # Try different migration commands
        if npm run migrate 2>/dev/null; then
            success "MCP server migrations complete"
        elif npm run db:migrate 2>/dev/null; then
            success "MCP server migrations complete"
        else
            warn "No migration script found in mcp-server, checking for SQL files..."
            # Look for migration SQL files
            if compgen -G "$MANDREL_ROOT/mcp-server/src/db/migrations/*.sql" > /dev/null 2>&1; then
                log "Found SQL migration files"
            fi
        fi
    fi

    # Check for migration scripts in mandrel-command
    if [[ -d "$MANDREL_ROOT/mandrel-command/migrations" ]] || [[ -d "$MANDREL_ROOT/mandrel-command/backend/migrations" ]]; then
        log "Running Mandrel Command migrations..."
        cd "$MANDREL_ROOT/mandrel-command/backend"

        if npm run migrate 2>/dev/null; then
            success "Mandrel Command migrations complete"
        elif npm run db:migrate 2>/dev/null; then
            success "Mandrel Command migrations complete"
        else
            warn "No migration script found in mandrel-command"
        fi
    fi

    cd "$MANDREL_ROOT"
    log "Migration step completed"
}

# =============================================================================
# VALIDATION
# =============================================================================

run_validation() {
    step "Validating Installation"

    if [[ -x "$MANDREL_ROOT/scripts/validate-install.sh" ]]; then
        "$MANDREL_ROOT/scripts/validate-install.sh"
    else
        warn "validate-install.sh not found or not executable"
        # Make it executable and try again
        if [[ -f "$MANDREL_ROOT/scripts/validate-install.sh" ]]; then
            chmod +x "$MANDREL_ROOT/scripts/validate-install.sh"
            "$MANDREL_ROOT/scripts/validate-install.sh"
        fi
    fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
    echo ""
    echo "=============================================="
    echo "     Mandrel Complete Setup Script"
    echo "=============================================="
    echo ""
    log "Mandrel Root: $MANDREL_ROOT"
    echo ""

    # Step 1: Detect OS
    detect_os

    # Step 2: Install dependencies
    install_dependencies

    # Step 3: Setup environment
    setup_environment

    # Step 4: Setup PostgreSQL
    setup_postgresql

    # Step 5: Install npm dependencies
    run_npm_install

    # Step 6: Run migrations
    run_migrations

    # Step 7: Validate installation
    run_validation

    # Final message
    step "Setup Complete!"
    echo ""
    echo "Next steps:"
    echo "  1. Review and update .env with your settings"
    echo "  2. Start the MCP server:"
    echo "       cd $MANDREL_ROOT/mcp-server && npm run dev"
    echo "  3. Start Mandrel Command (optional):"
    echo "       cd $MANDREL_ROOT/mandrel-command/backend && npm run dev"
    echo ""
    echo "For help, see: $MANDREL_ROOT/README.md"
    echo ""
}

# Run main function
main "$@"
