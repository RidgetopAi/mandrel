---

LAYER 1: CLIENT LAYER

┌─────────────────────┐ ┌─────────────────────┐
│ AI Agents/Claude │ │ Web Browser │
│ (STDIO Protocol) │ │ (HTTP/WebSocket) │
└──────────┬──────────┘ └──────────┬──────────┘
│ │

---

LAYER 2: PROTOCOL LAYER

             ↓                                ↓

┌─────────────────────┐ ┌─────────────────────┐
│ MCP Server │ │ Mandrel Command │
│ AidisMcpServer.ts │◄────────►│ Express Backend │
│ Port: 5001 │ Bridge │ Port: 5000 │
│ │ │ │
│ + HTTP Bridge │ │ + React Frontend │
│ Port: 8080 │ │ Port: 3000 │
└─────────┬───────────┘ └─────────┬───────────┘
│ │
└────────────┬───────────────────┘
↓

---

LAYER 3: TOOL/HANDLER LAYER

          ┌──────────────────────────────────────┐
          │        27 MCP Tools                  │
          │  (Tool Definitions + Handlers)       │
          ├──────────────────────────────────────┤
          │  • System: ping, status              │
          │  • Navigation: help, explain         │
          │  • Context: store, search (4 tools)  │
          │  • Projects: switch, create (6)      │
          │  • Decisions: record, search (4)     │
          │  • Tasks: create, update (6)         │
          │  • Smart Search: search, recs (2)    │
          └─────────────────┬────────────────────┘
                            ↓

---

LAYER 4: SERVICES LAYER

          ┌──────────────────────────────────────┐
          │         Core Services                │
          ├──────────────────────────────────────┤
          │  • SessionTracker - Auto-tracking    │
          │  • Embedding - Transformers.js       │
          │  • DatabasePool - Connection mgmt    │
          │  • GitTracker - Git integration      │
          │  • HealthCheck - System monitoring   │
          │  • QueueManager - Background tasks   │
          └─────────────────┬────────────────────┘
                            ↓

---

LAYER 5: DATA LAYER

          ┌──────────────────────────────────────┐
          │    PostgreSQL (mandrel)     │
          ├──────────────────────────────────────┤
          │  Core Tables:                        │
          │  • projects - Project definitions    │
          │  • contexts - With 384D embeddings   │
          │  • sessions - Productivity tracking  │
          │  • technical_decisions - Decisions   │
          │  • tasks - Task management           │
          │  • session_activities - Events       │
          │                                      │
          │  Extension: pgvector (vector search) │
          └──────────────────────────────────────┘

---

KEY DATA FLOWS (Add as Arrows)

Flow 1: MCP Tool Call

AI Agent → MCP Server → Validation → Handler → Service → Database → Response

Flow 2: Web Dashboard

React UI → Express API → Controller → SessionTracker → Database → JSON

Flow 3: Semantic Search

Query → Embedding Service → Generate Vector → pgvector Search → Results

Flow 4: Auto Session Tracking

context_store/task_create → SessionTracker → session_activities table

---

Excalidraw Design Suggestions

Color Coding:

- Blue: Client Layer (AI Agents, Web Browser)
- Green: Protocol/Server Layer (MCP Server, Express)
- Purple: Handler/Tool Layer (27 MCP Tools)
- Orange: Services Layer (Core business logic)
- Red: Data Layer (PostgreSQL)

Key Numbers to Highlight:

- 27 MCP Tools (consolidated from 52)
- 8 REST API Endpoints (/api/v2/sessions/\*)
- 12 Database Tables (core tables)
- 384D Vector Embeddings (Transformers.js)
- Ports: 5001 (MCP), 8080 (Bridge), 3000/5000 (Command), 5432 (DB)

Callout Boxes:

1. "Dual Protocol Support" - Both STDIO MCP and HTTP
2. "Auto Session Tracking" - No manual management
3. "Local Embeddings" - Zero-cost Transformers.js
4. "70% Token Reduction" - From 52 to 27 tools

---

Optional: Technology Stack Box

┌─────────────────────────────────────┐
│ Technology Stack │
├─────────────────────────────────────┤
│ Backend: Node.js + TypeScript │
│ Protocol: Model Context Protocol │
│ Database: PostgreSQL + pgvector │
│ Frontend: React + Ant Design │
│ Embeddings: Transformers.js │
│ Server: Express │
│ Testing: Vitest │
└─────────────────────────────────────┘
