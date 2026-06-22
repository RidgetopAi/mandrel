# Mandrel

**Persistent memory infrastructure for AI-assisted development**

Mandrel solves the fundamental problem of context loss in AI-assisted software development. When AI agents (like Claude) help build software, they forget everything between sessions—decisions made, patterns established, problems solved. Mandrel gives AI agents a persistent, semantically-searchable knowledge base that survives across sessions.

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=flat&logo=postgresql&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-Protocol-orange)
![Status](https://img.shields.io/badge/Status-Production-green)

---

## The Problem

Every AI-assisted development session starts from zero. Your AI assistant doesn't remember:
- Why you chose React Query over SWR last week
- That you already debugged this exact error three days ago
- The architectural decisions that shaped your codebase
- The naming conventions your team established

You end up re-explaining context, re-justifying decisions, and re-solving problems. Context windows fill with repetitive background instead of forward progress.

## The Solution

Mandrel provides 44 specialized tools that integrate directly with AI agents via the [Model Context Protocol (MCP)](https://modelcontextprotocol.io/). These tools enable:

- **Semantic Context Storage** — Store development context with 384-dimensional vector embeddings for similarity search
- **Decision Tracking** — Record architectural decisions with rationale, alternatives considered, and outcomes
- **Multi-Project Management** — Maintain separate knowledge bases across projects
- **Task Coordination** — Track work in progress with status, dependencies, and progress metrics
- **Smart Search** — Query across all stored knowledge using natural language
- **Knowledge Graph & Thread Recall** — Link records with typed edges (`decided_by`, `caused`, `supersedes`, `learned_from`, …), auto-thread new captures onto the active task/decision, and replay the full story of any piece of work with `recall_thread` — each node carrying a trust signal

When you start a new session, the AI agent retrieves relevant context automatically. Previous decisions, established patterns, and learned lessons are immediately available.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
├─────────────────────────┬───────────────────────────────────────┤
│   Claude / AI Agents    │           Web Dashboard               │
│   (MCP STDIO Protocol)  │        (React + Ant Design)           │
└───────────┬─────────────┴───────────────────┬───────────────────┘
            │                                 │
            ▼                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Protocol Layer                             │
├──────────────────────────────────────────────────────────────────┤
│  MCP Server (TypeScript)                                         │
│  ├── STDIO Transport (Port 5001) — Direct AI agent connection    │
│  ├── HTTP Bridge (Port 8080) — REST API for tooling              │
│  └── 44 MCP Tools — Context, Decisions, Tasks, Projects, Search  │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Services Layer                             │
├──────────────────────────────────────────────────────────────────┤
│  Embedding Service          │  Session Tracker                   │
│  └── Transformers.js        │  └── Auto-activity recording       │
│  └── 384D vectors           │                                    │
│  └── Zero API cost          │  Circuit Breaker                   │
│                             │  └── Database resilience           │
└───────────────────────────┬─────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Data Layer                                │
│  PostgreSQL + pgvector                                           │
│  ├── contexts — Development context with vector embeddings       │
│  ├── technical_decisions — Architectural decision records        │
│  ├── tasks — Work tracking with status and metadata              │
│  ├── projects — Multi-project isolation                          │
│  └── sessions — Productivity analytics                           │
└─────────────────────────────────────────────────────────────────┘
```

### Key Technical Decisions

**Local Embeddings**: Mandrel uses [Transformers.js](https://github.com/xenova/transformers.js) with the `all-MiniLM-L6-v2` model to generate embeddings locally. This means:
- Zero API costs for semantic search
- No data leaves your machine
- Works offline
- ~25MB model, cached after first use

**Dual Protocol Support**: The MCP server exposes both STDIO (for direct AI agent connection) and HTTP (for tooling, debugging, and the web dashboard). This enables rich developer tooling while maintaining protocol compliance.

**Circuit Breaker Pattern**: Database operations use a circuit breaker to gracefully handle PostgreSQL connectivity issues without crashing the server.

---

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 16 with pgvector extension

### Docker (Recommended)

```bash
git clone https://github.com/RidgetopAi/mandrel.git
cd mandrel
cp .env.example .env
npm run setup
docker-compose up -d        # PostgreSQL + Redis
npm run migrate
npm run dev:mcp             # Terminal 1: MCP Server
npm run dev:command         # Terminal 2: Dashboard
```

### Native Install (macOS)

```bash
brew install postgresql@16 redis node
brew services start postgresql@16
createdb mandrel
psql -d mandrel -c "CREATE EXTENSION IF NOT EXISTS vector;"

git clone https://github.com/RidgetopAi/mandrel.git
cd mandrel
npm run setup && npm run migrate
npm run dev:mcp
```

**Access Points:**
- Dashboard: http://localhost:3000
- MCP HTTP Bridge: http://localhost:8080
- MCP STDIO: Port 5001

### Verify Your Installation

After completing either Docker or Native installation, verify everything is working:

```bash
# Run the comprehensive installation validator
./scripts/validate-install.sh

# Or manually test the MCP health endpoint
curl http://localhost:8080/health
```

**Expected successful output from health check:**
```json
{"status":"ok","version":"0.5.x","uptime":123.456}
```

**Expected output from validate-install.sh:**
```
Mandrel Installation Validator
==============================
[✓] Node.js 20.x (required: 18+)
[✓] PostgreSQL 16.x running
[✓] Database 'mandrel' accessible
[✓] pgvector extension installed
[✓] pg_trgm extension installed
[✓] pgcrypto extension installed
[✗] Redis not running (optional - needed for job queues)
[✓] MCP server responding on :8080

Result: 7/8 checks passed
```

---

## Troubleshooting

### Connection refused on port 8080

**Symptom:** `curl: (7) Failed to connect to localhost port 8080: Connection refused`

**Cause:** The MCP server is not running.

**Solution:**
```bash
# Check if the server is running
ps aux | grep "mcp"

# Start the MCP server
npm run dev:mcp

# Or check the logs if running as a service
tail -f /var/log/mandrel-mcp.log
```

### pgvector extension not found

**Symptom:** Database error mentioning `vector` type not found or `extension "vector" does not exist`

**Cause:** The pgvector extension is not installed in your PostgreSQL database.

**Solution:**
```bash
# Connect to your database and install the extension
psql -d mandrel -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Verify it's installed
psql -d mandrel -c "SELECT extname FROM pg_extension WHERE extname = 'vector';"
```

If pgvector is not available on your system, install it first:
```bash
# macOS with Homebrew
brew install pgvector

# Ubuntu/Debian
sudo apt install postgresql-16-pgvector

# Then restart PostgreSQL and create the extension
```

### Authentication failed

**Symptom:** `FATAL: password authentication failed for user` or similar authentication errors

**Cause:** The database credentials in your `.env` file don't match your PostgreSQL configuration.

**Solution:**
1. Check your `.env` file has correct credentials:
```bash
cat .env | grep DATABASE
```

2. Verify the credentials work directly:
```bash
psql -h localhost -U <your_user> -d mandrel
```

3. If using the default setup, ensure your `.env` matches:
```
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=mandrel
DATABASE_USER=mandrel
DATABASE_PASSWORD=<your_password>
```

4. If you need to reset the password:
```bash
sudo -u postgres psql -c "ALTER USER mandrel WITH PASSWORD 'new_password';"
```

---

## MCP Tools Reference

Mandrel provides 44 tools organized into 8 categories:

| Category | Tools | Purpose |
|----------|-------|---------|
| **System Health** | `mandrel_ping`, `mandrel_status` | Health checks and diagnostics |
| **Navigation** | `mandrel_help`, `mandrel_explain`, `mandrel_examples` | Tool discovery and documentation |
| **Context** | `context_store`, `context_search`, `context_get_recent`, `context_update`, `context_stats`, `context_delete`, `context_restore` | Semantic knowledge storage (+ edit / soft-delete / restore) |
| **Projects** | `project_list`, `project_create`, `project_update`, `project_delete`, `project_switch`, `project_current`, `project_info`, `project_insights` | Multi-project management |
| **Decisions** | `decision_record`, `decision_search`, `decision_get`, `decision_update`, `decision_stats`, `decision_delete`, `decision_restore` | Architectural decision tracking with outcomes |
| **Tasks** | `task_create`, `task_list`, `task_update`, `task_details`, `task_bulk_update`, `task_progress_summary`, `task_delete`, `task_restore` | Work coordination |
| **Smart Search & AI** | `smart_search`, `get_recommendations` | Cross-domain AI-powered search |
| **Linking & Graph** | `link`, `unlink`, `get_links`, `recall_thread`, `thread_set`, `thread_current`, `thread_clear` | Typed-edge knowledge graph + thread recall — the memory "story" |

### Example: Storing Context

```typescript
// AI agent stores a learning after debugging
context_store({
  content: "PostgreSQL connection pooling issue: PG_BOUNCER was dropping
            connections after 30s idle. Fixed by setting server_idle_timeout=600
            in pgbouncer.ini. Symptom was 'connection reset' errors under load.",
  type: "error",
  tags: ["postgresql", "pgbouncer", "connection-pooling"]
})
```

### Example: Searching Context

```typescript
// Later session: AI agent searches for relevant context
context_search({
  query: "database connection dropping under load"
})
// Returns the pgbouncer fix with semantic similarity matching
```

---

## Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| MCP Server | TypeScript, Node.js | Core protocol implementation |
| Database | PostgreSQL 16 + pgvector | Persistent storage with vector search |
| Embeddings | Transformers.js (all-MiniLM-L6-v2) | 384D semantic vectors, local inference |
| Web Dashboard | React, Ant Design, Vite | Developer UI |
| API Backend | Express.js | REST API + WebSocket |
| Validation | Zod | Runtime schema validation |
| Testing | Vitest | Unit and integration tests |

---

## Production Deployment

Mandrel is production-deployed with systemd service management:

```bash
sudo systemctl status mandrel          # MCP server
sudo systemctl status mandrel-command  # Web dashboard
```

**Security**: The HTTP bridge binds to localhost by default. For production, deploy behind a reverse proxy (nginx/Caddy) with authentication.

---

## Project Stats

- **44 MCP tools** across 8 categories (incl. a typed-edge knowledge graph + thread recall)
- **8 REST endpoints** for session analytics
- **PostgreSQL + pgvector** storage — 384D embeddings plus a typed-edge graph over contexts, decisions, and tasks
- **Zero external API costs** for embeddings

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Ensure TypeScript compiles (`npm run type-check`)
4. Run tests (`npm test`)
5. Submit a pull request

---

## License

MIT License — See [LICENSE](LICENSE) for details.

---

Built by [RidgetopAI](https://github.com/RidgetopAi) to make AI-assisted development sustainable.
