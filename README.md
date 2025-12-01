# Mandrel - AI Development Intelligence System

**Persistent AI memory and development intelligence platform for complex software projects**

![Status](https://img.shields.io/badge/Status-Beta-yellow)
![Version](https://img.shields.io/badge/Version-0.1.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Overview

Mandrel provides persistent memory and intelligence tools for AI development workflows. It solves the fundamental problem of context loss in AI-assisted development by maintaining a searchable knowledge base of project context, technical decisions, and task coordination across development sessions.

**Key Capabilities:**
- Persistent context storage with semantic search
- Technical decision tracking and retrieval
- Multi-project workflow management
- Task coordination and analytics
- Real-time collaboration infrastructure

---

## Quick Start

Choose **ONE** installation method below.

### Prerequisites (All Methods)

- **Node.js 18+** - [download](https://nodejs.org/) or use nvm
- **Git** - for cloning the repository

---

## Option A: Docker (Recommended - Easiest)

Docker handles PostgreSQL and Redis for you. Best for getting started quickly.

```bash
# 1. Clone the repository
git clone https://github.com/RidgetopAi/mandrel.git
cd mandrel

# 2. Copy environment files
cp .env.example .env
cp mcp-server/.env.example mcp-server/.env
cp mandrel-command/backend/.env.example mandrel-command/backend/.env

# 3. Install Node.js dependencies
npm run setup

# 4. Start PostgreSQL and Redis (Docker)
docker-compose up -d

# 5. Wait for containers to be healthy (~10 seconds)
docker-compose ps  # should show "healthy" status

# 6. Run database migrations
npm run migrate

# 7. Start Mandrel (2 terminals)
npm run dev:mcp      # Terminal 1: MCP Server
npm run dev:command  # Terminal 2: Web Dashboard
```

**Access:**
- Dashboard: http://localhost:3000 (login: admin / admin123!)
- MCP Server: localhost:5001 (STDIO) / localhost:8080 (HTTP Bridge)

---

## Option B: Native (No Docker)

For those who prefer running PostgreSQL and Redis natively. Faster startup, more control.

### macOS (Homebrew)

```bash
# 1. Install system dependencies
brew install postgresql@16 redis node

# 2. Start services
brew services start postgresql@16
brew services start redis

# 3. Create database and enable pgvector
createdb aidis_production
psql -d aidis_production -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 4. Clone and setup
git clone https://github.com/RidgetopAi/mandrel.git
cd mandrel

# 5. Copy and edit environment files
cp .env.example .env
cp mcp-server/.env.example mcp-server/.env
cp mandrel-command/backend/.env.example mandrel-command/backend/.env

# Edit .env files to match your PostgreSQL user:
# DATABASE_USER=your_username
# DATABASE_PASSWORD=your_password (if any)

# 6. Install dependencies
npm run setup

# 7. Run migrations
npm run migrate

# 8. Start Mandrel (2 terminals)
npm run dev:mcp      # Terminal 1
npm run dev:command  # Terminal 2
```

### Ubuntu/Debian

```bash
# 1. Install PostgreSQL 16 with pgvector
sudo apt update
sudo apt install -y postgresql-16 postgresql-16-pgvector redis-server

# 2. Start services
sudo systemctl start postgresql redis-server
sudo systemctl enable postgresql redis-server

# 3. Create database user and database
sudo -u postgres createuser --createdb $USER
createdb aidis_production
psql -d aidis_production -c "CREATE EXTENSION IF NOT EXISTS vector;"

# 4. Clone and setup
git clone https://github.com/RidgetopAi/mandrel.git
cd mandrel

# 5. Copy environment files
cp .env.example .env
cp mcp-server/.env.example mcp-server/.env
cp mandrel-command/backend/.env.example mandrel-command/backend/.env

# Edit DATABASE_USER in .env files to match your username

# 6. Install and run
npm run setup
npm run migrate
npm run dev:mcp      # Terminal 1
npm run dev:command  # Terminal 2
```

---

## Troubleshooting

### "Database does not exist"

```bash
# Create it manually
createdb aidis_production

# Then enable pgvector
psql -d aidis_production -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### "Connection refused" to PostgreSQL

Check that PostgreSQL is running:
```bash
# macOS
brew services list | grep postgresql

# Linux
sudo systemctl status postgresql
```

### "pgvector extension not available"

Install the pgvector extension for your system:
```bash
# macOS (Homebrew PostgreSQL already includes it)
# Just run: CREATE EXTENSION vector;

# Ubuntu/Debian
sudo apt install postgresql-16-pgvector

# Then in psql:
psql -d aidis_production -c "CREATE EXTENSION vector;"
```

### Port already in use

Mandrel uses these ports by default:
- 5432: PostgreSQL
- 6379: Redis
- 5001: MCP Server (STDIO)
- 8080: MCP HTTP Bridge
- 5000: Mandrel Command Backend
- 3000: Mandrel Command Frontend

Check for conflicts:
```bash
lsof -i :5432  # Check PostgreSQL port
lsof -i :8080  # Check HTTP Bridge port
```

---

## Architecture

```
Mandrel System
├── MCP Server (Port 5001/8080)
│   ├── 27 MCP Tools (context, projects, decisions, tasks)
│   ├── PostgreSQL Database (aidis_production)
│   ├── Redis (background job queues)
│   ├── Local embeddings (384D vectors via Transformers.js)
│   └── HTTP Bridge (Port 8080)
│
└── Mandrel Command Dashboard (Ports 3000/5000)
    ├── React Frontend (Port 3000)
    ├── Express Backend (Port 5000)
    └── WebSocket Server
```

### Technology Stack

**MCP Server:**
- Node.js/TypeScript
- PostgreSQL with pgvector extension
- Local embeddings via Transformers.js (zero API costs)
- MCP STDIO + HTTP bridge protocols

**Mandrel Command Dashboard:**
- React frontend with Ant Design
- Express.js REST API backend
- WebSocket real-time updates
- JWT authentication

---

## Configuration

### Environment Variables

All environment variables support a priority chain:
1. `MANDREL_*` (preferred)
2. `AIDIS_*` (deprecated, shows warning)
3. Legacy names (e.g., `DATABASE_*`)

**Key Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_NAME` | `aidis_production` | PostgreSQL database name |
| `DATABASE_USER` | `mandrel` | PostgreSQL username |
| `DATABASE_PASSWORD` | `mandrel_dev_password` | PostgreSQL password |
| `DATABASE_HOST` | `localhost` | PostgreSQL host |
| `DATABASE_PORT` | `5432` | PostgreSQL port |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |

### Files

- `.env` - Root configuration (optional, for shared settings)
- `mcp-server/.env` - MCP Server configuration
- `mandrel-command/backend/.env` - Dashboard backend configuration

---

## Security Notice

**HTTP Bridge is Localhost-Only by Default**

The MCP HTTP bridge (port 8080) is **unauthenticated** and binds to `127.0.0.1` for security.

- **Safe**: Default localhost-only binding prevents network exposure
- **Do NOT expose** the HTTP bridge to the internet without adding authentication
- **Override**: Set `MANDREL_BIND_ADDR=0.0.0.0` to bind all interfaces (NOT RECOMMENDED for production)

**First Run Note**: The first context storage downloads the Transformers.js embedding model (~50MB). This may take 1-2 minutes. Subsequent operations are fast.

---

## MCP Tools

Mandrel provides 27 specialized tools via the Model Context Protocol:

- **Navigation & Help** (5 tools): System health, tool discovery, documentation
- **Context Operations** (4 tools): Store, search, retrieve context
- **Project Management** (6 tools): Create, list, switch projects
- **Decision Tracking** (4 tools): Record decisions with alternatives
- **Task Management** (6 tools): Create, update, track tasks
- **Smart Search** (2 tools): Cross-project search, AI recommendations

For detailed tool documentation, use the `mandrel_help` and `mandrel_explain` tools.

---

## Development Commands

```bash
# Install all dependencies
npm run setup

# Run database migrations
npm run migrate

# Start MCP Server (development)
npm run dev:mcp

# Start Dashboard (development)
npm run dev:command

# Build for production
npm run build:mcp
npm run build:command
```

### MCP Server Scripts

```bash
cd mcp-server
./start-mandrel.sh    # Start server
./stop-mandrel.sh     # Stop server
./restart-mandrel.sh  # Restart server
./status-mandrel.sh   # Check status
```

---

## Project Structure

```
mandrel/
├── mcp-server/              # MCP protocol server
│   ├── src/
│   │   ├── handlers/        # MCP tool implementations
│   │   ├── services/        # Business logic
│   │   └── server.ts        # Entry point
│   └── migrations/          # Database schema
│
├── mandrel-command/         # Web dashboard
│   ├── frontend/            # React application
│   └── backend/             # Express API
│
├── adapters/                # MCP protocol adapters
├── docker-compose.yml       # Docker services config
├── .env.example             # Root environment template
└── package.json             # Root npm scripts
```

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

---

## License

MIT License - See LICENSE file for details.

---

## Acknowledgments

Built by RidgetopAI for sustainable AI-assisted development. Mandrel demonstrates that persistent memory and structured knowledge management are essential for complex software projects involving AI agents.

For questions or support, please open an issue on GitHub.
