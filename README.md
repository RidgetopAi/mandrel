# AIDIS - AI Development Intelligence System

**Persistent AI memory and development intelligence platform for complex software projects**

![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Version](https://img.shields.io/badge/Version-1.0.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Overview

AIDIS provides persistent memory and intelligence tools for AI development workflows. It solves the fundamental problem of context loss in AI-assisted development by maintaining a searchable knowledge base of project context, technical decisions, and task coordination across development sessions.

**Key Capabilities:**
- Persistent context storage with semantic search
- Technical decision tracking and retrieval
- Multi-project workflow management
- Task coordination and analytics
- Real-time collaboration infrastructure

---

## Architecture

AIDIS consists of two primary components:

### MCP Server
Production-grade backend implementing the Model Context Protocol with 27 specialized tools for development intelligence.

**Technology Stack:**
- Node.js/TypeScript
- PostgreSQL with pgvector extension
- Local embeddings via Transformers.js (zero API costs)
- MCP STDIO + HTTP bridge protocols

### AIDIS Command Dashboard
Web-based administration interface for managing projects, contexts, and tasks.

**Technology Stack:**
- React frontend with Ant Design
- Express.js REST API backend
- WebSocket real-time updates
- JWT authentication

```
System Architecture
├── MCP Server (Port 5001)
│   ├── 27 MCP Tools (context, projects, decisions, tasks)
│   ├── PostgreSQL Database (aidis_production)
│   ├── Local embeddings (384D vectors)
│   └── HTTP Bridge (Port 8080)
│
└── AIDIS Command (Ports 3000/5000)
    ├── React Frontend
    ├── Express Backend
    └── WebSocket Server
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 16 with pgvector extension
- Docker (optional, for database)

### Installation

```bash
# Clone repository
git clone https://github.com/RidgetopAi/aidis.git
cd aidis

# Start PostgreSQL (using Docker)
docker run -d --name aidis-postgres \
  -e POSTGRES_USER=ridgetop \
  -e POSTGRES_PASSWORD=your_password \
  -e POSTGRES_DB=aidis_production \
  -p 5432:5432 \
  ankane/pgvector

# Install MCP server dependencies
cd mcp-server
npm install

# Run database migrations
npx tsx scripts/migrate.ts

# Start MCP server
./start-aidis.sh

# Install AIDIS Command (new terminal)
cd ../aidis-command
npm run install:all

# Start backend
cd backend && npm run dev

# Start frontend (new terminal)
cd frontend && npm start
```

### Access

- **AIDIS Command UI**: http://localhost:3000
- **Default Login**: admin / admin123!
- **MCP Server**: localhost:5001 (STDIO) / localhost:8080 (HTTP Bridge)

---

## Features

### Context Management
Store and retrieve development context with semantic similarity search. Maintain project knowledge across sessions.

- Automatic embedding generation
- Semantic search with relevance scoring
- Type categorization (code, decision, error, discussion, etc.)
- Tag-based filtering
- Project-scoped isolation

### Technical Decision Tracking
Record architectural and implementation decisions with full context, alternatives considered, and outcomes.

- Decision type classification
- Impact level tracking
- Alternative comparison
- Outcome recording
- Component mapping

### Project Management
Multi-project workflows with seamless switching and project-specific contexts.

- Project creation and switching
- Default project configuration
- Project-scoped data isolation
- Statistics and insights
- Git repository integration

### Task Coordination
Professional task management with real-time updates and analytics.

- Status tracking (todo, in progress, blocked, completed)
- Priority levels and assignments
- Dependency management
- Progress analytics
- WebSocket live updates

### Session Analytics
Track development sessions with productivity metrics and activity timelines.

- Session duration and activity tracking
- File modification history
- Productivity scoring
- Session comparison
- Activity timeline

---

## MCP Tools

AIDIS provides 27 specialized tools via the Model Context Protocol:

**Navigation & Help** (5 tools)
- System health monitoring
- Tool discovery and documentation
- Usage examples

**Context Operations** (4 tools)
- Store, search, and retrieve context
- Recent context access
- Statistics and analytics

**Project Management** (6 tools)
- Create, list, and switch projects
- Project information and insights
- Current project tracking

**Decision Tracking** (4 tools)
- Record decisions with alternatives
- Search and filter decisions
- Update outcomes
- Decision statistics

**Task Management** (6 tools)
- Create and update tasks
- Bulk operations
- Progress tracking
- Task details and filtering

**Smart Search** (2 tools)
- Cross-project intelligent search
- AI-powered recommendations

For detailed tool documentation, use the `aidis_help` and `aidis_explain` tools.

---

## Development

### MCP Server Commands

```bash
cd mcp-server

# Start server
npx tsx src/server.ts

# Run migrations
npx tsx scripts/migrate.ts

# Production scripts
./start-aidis.sh    # Start server
./stop-aidis.sh     # Stop server
./restart-aidis.sh  # Restart server
./status-aidis.sh   # Check status
```

### AIDIS Command Commands

```bash
cd aidis-command

# Backend development
cd backend && npm run dev

# Frontend development
cd frontend && npm start

# Production build
npm run build:all
```

### Database Migrations

Migrations are located in `mcp-server/migrations/` and run automatically on server start. Manual execution:

```bash
cd mcp-server
npx tsx scripts/migrate.ts
```

---

## Configuration

### Environment Variables

Create `.env` files in `mcp-server/` and `aidis-command/backend/`:

**MCP Server (.env)**
```env
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_USER=ridgetop
DATABASE_PASSWORD=your_password
DATABASE_NAME=aidis_production
MCP_PORT=5001
HTTP_BRIDGE_PORT=8080
```

**AIDIS Command Backend (.env)**
```env
DATABASE_URL=postgresql://ridgetop:your_password@localhost:5432/aidis_production
JWT_SECRET=your_jwt_secret
PORT=5000
FRONTEND_URL=http://localhost:3000
```

### Default Project

Configure default project selection in AIDIS Command Settings page for automatic project loading on login.

---

## Production Deployment

### Database Setup

1. Install PostgreSQL 16 with pgvector extension
2. Create production database
3. Configure connection string in `.env`
4. Run migrations

### MCP Server

```bash
cd mcp-server
npm install --production
./start-aidis.sh
```

### AIDIS Command

```bash
cd aidis-command
npm run build:all
npm run start:prod
```

### Systemd Service (Optional)

Template service file available at `aidis.service` for systemd integration.

---

## Project Structure

```
aidis/
├── mcp-server/              # MCP protocol server
│   ├── src/
│   │   ├── handlers/        # MCP tool implementations
│   │   ├── services/        # Business logic
│   │   ├── models/          # Database models
│   │   └── server.ts        # Entry point
│   ├── migrations/          # Database schema
│   └── scripts/             # Utility scripts
│
├── aidis-command/           # Web dashboard
│   ├── frontend/            # React application
│   │   ├── src/
│   │   │   ├── components/  # React components
│   │   │   ├── pages/       # Page components
│   │   │   ├── contexts/    # React contexts
│   │   │   └── services/    # API clients
│   │   └── public/          # Static assets
│   │
│   └── backend/             # Express API
│       └── src/
│           ├── routes/      # API endpoints
│           └── middleware/  # Express middleware
│
├── scripts/                 # Production scripts
└── docs/                    # Documentation
```

---

## Use Cases

**AI Development Projects**
Maintain context and decisions across multi-week AI-assisted development projects.

**Code Architecture**
Track architectural decisions and enforce patterns across large codebases.

**Team Coordination**
Enable multiple AI agents or developers to collaborate effectively with shared context.

**Knowledge Management**
Build searchable knowledge bases of project-specific information and decisions.

---

## Technical Highlights

- **Local Embeddings**: Zero API costs using Transformers.js for semantic search
- **MCP Protocol**: Standards-compliant tool implementation
- **Semantic Search**: PostgreSQL pgvector for similarity queries
- **Real-time Updates**: WebSocket infrastructure for live collaboration
- **Multi-project**: Clean data isolation and project switching
- **Production Ready**: Comprehensive error handling and logging

---

## Documentation

- **Setup Guide**: `docs/DEV_SETUP_GUIDE.md`
- **Database Migrations**: `docs/DB_MIGRATION_WALKTHROUGH.md`
- **MCP Protocol Reference**: `docs/reference/MCP_STDIO_PROTOCOL_REFERENCE.md`
- **API Documentation**: Available in `aidis-command/backend/src/routes/`
- **Tool Catalog**: Use `aidis_help` MCP tool for current tool listing

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add feature'`)
4. Push to the branch (`git push origin feature/your-feature`)
5. Open a Pull Request

### Development Branch Structure

- `main` - Production-ready code
- `aidis-alpha` - Active development
- `dev-docs` - Historical documentation

---

## License

MIT License - See LICENSE file for details.

---

## Acknowledgments

Built by RidgetopAI for sustainable AI-assisted development. AIDIS demonstrates that persistent memory and structured knowledge management are essential for complex software projects involving AI agents.

For questions or support, please open an issue on GitHub.
