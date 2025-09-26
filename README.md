# AIDIS - AI Development Intelligence System

**Revolutionary persistent AI brain and development intelligence platform**

![Status](https://img.shields.io/badge/Status-Production%20Ready-brightgreen)
![Version](https://img.shields.io/badge/Version-0.1.0-blue)
![License](https://img.shields.io/badge/License-MIT-green)

---

## 🚀 What is AIDIS?

AIDIS solves the fundamental problems that destroy AI development projects:

- **❌ Context Loss** → **✅ Persistent AI Memory** (110+ contexts stored)
- **❌ Naming Chaos** → **✅ Enforced Consistency** across entire projects  
- **❌ Lost Decisions** → **✅ Records WHY** choices were made
- **❌ Project Confusion** → **✅ Clean Multi-project** workflows
- **❌ Coordination Failures** → **✅ Multi-agent Collaboration**
- **❌ Code Blindness** → **✅ Understands Structure** & dependencies

---

## 🎯 Core Components

### **AIDIS MCP Server**
- **47 production-ready tools** via Model Context Protocol (post-TT009 consolidation)
- **PostgreSQL + pgvector** for semantic search
- **Local embeddings** (zero API costs)
- **SystemD service** with enterprise stability

### **AIDIS COMMAND Dashboard** 
- **Full-stack React/Node.js** admin interface
- **Real-time WebSocket** updates
- **Task management** with professional UI
- **Context browsing** with semantic search
- **Project management** with analytics

---

## 🏗️ Architecture

```
AIDIS SYSTEM ARCHITECTURE
├── AIDIS MCP Server (aidis_development)
│   ├── 37 MCP Tools (context, project, naming, decisions, agents, code analysis)
│   ├── PostgreSQL + pgvector (384D local embeddings)
│   ├── SystemD service (enterprise stability)
│   └── HTTP forwarding proxy (bulletproof connectivity)
│
└── AIDIS COMMAND Dashboard (aidis_ui_dev)
    ├── React Frontend (http://localhost:3001)
    ├── Express Backend (http://localhost:5000)  
    ├── WebSocket real-time updates
    └── Professional task management UI
```

---

## 🚀 Quick Start

### Prerequisites
- **Node.js** 18+ and npm
- **PostgreSQL** 16 with pgvector extension
- **Docker** (for database container)

### Installation

```bash
# Clone the repository
git clone git@github.com:YourUsername/aidis.git
cd aidis

# Start database
docker run -d --name fb_postgres \
  -e POSTGRES_USER=usern_name \
  -e POSTGRES_PASSWORD=user_pw \
  -e POSTGRES_DB=aidis_development \
  -p 5432:5432 \
  postgres:16

# Install MCP server dependencies  
cd mcp-server && npm install

# Run database migrations
npx tsx scripts/migrate.ts

# Start AIDIS MCP server
npx tsx src/server.ts

# In new terminal - Start AIDIS COMMAND
cd ../aidis-command

# Install dependencies
npm run install:all

# Start backend
cd backend && npm run dev

# In new terminal - Start frontend  
cd frontend && PORT=3001 npm start
```

### Access
- **AIDIS COMMAND UI**: http://localhost:3001
- **Login**: admin / admin123!

---

## 🛠️ Development Commands

### AIDIS MCP Server
```bash
cd mcp-server
npm install                    # Install dependencies
npx tsx scripts/migrate.ts     # Run database migrations  
npx tsx src/server.ts          # Start AIDIS MCP server
npx tsx test-complete-aidis.ts # Test all systems
```

### AIDIS COMMAND Dashboard
```bash
cd aidis-command

# Backend
cd backend && npm run dev      # Start backend (port 5000)

# Frontend  
cd frontend && PORT=3001 npm start  # Start frontend (port 3001)
```

---

## 📋 Features

### ✅ **Production Ready**
- [x] **Context Management** - Store & retrieve development context with semantic search
- [x] **Project Management** - Multi-project workflows with seamless switching  
- [x] **Task Management** - Professional UI with real-time updates
- [x] **Authentication** - JWT-based security with role-based access
- [x] **WebSocket Integration** - Real-time collaborative features
- [x] **Local Embeddings** - Cost-free semantic search (Transformers.js)

### 🔄 **In Development** 
- [ ] **Technical Decision Browser** (T009)
- [ ] **Naming Registry Management** (T010)  
- [ ] **Kanban Board Interface** (T008-Advanced)
- [ ] **Task Analytics Dashboard** (T008-Advanced)

---

## 🧠 The AIDIS Difference

### **Before AIDIS:**
- AI agents forget everything between sessions
- Naming conflicts destroy codebases  
- Architectural decisions get lost
- Projects become unmaintainable

### **With AIDIS:**
- **110+ contexts** of persistent knowledge
- **Enforced naming consistency** across projects
- **Decision tracking** with alternatives and outcomes
- **Multi-agent coordination** for complex tasks

---

## 🎯 Use Cases

- **AI Development Projects** - Maintain context across multi-week builds
- **Code Architecture** - Track decisions and enforce patterns  
- **Team Coordination** - AI agents working together efficiently
- **Knowledge Management** - Never lose important context again

---

## 🏆 Technical Achievements

- **47 MCP Tools** - Complete development intelligence suite (post-TT009 consolidation)
- **Enterprise Architecture** - SystemD + HTTP proxy + PostgreSQL  
- **Zero Ongoing Costs** - Local embeddings eliminate API fees
- **Real-time Collaboration** - WebSocket infrastructure
- **Multi-project Support** - Clean separation and switching

---

## 📚 Documentation

- **MCP Tools Reference** - See `mcp-server/src/handlers/` for all 37 tools
- **API Documentation** - See `aidis-command/backend/src/routes/`
- **Database Schema** - See `mcp-server/database/migrations/`

---

## 🤝 Contributing

This is a revolutionary system that changes how AI development works. Contributions welcome!

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)  
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📚 Documentation Archive

Historical documentation from Oracle Refactor phases is preserved in:
- **Location:** `docs/archive/2025-09-23-oracle-refactor/`
- **Contains:** Removed API services, obsolete docs, legacy components
- **Purpose:** Historical reference and system evolution tracking

---

## 📄 License

MIT License - See [LICENSE](LICENSE) file for details.

---

## 🌟 Acknowledgments

Built with passion for the future of AI development. AIDIS represents a new paradigm where AI agents have persistent memory and can collaborate effectively on complex, long-term projects.

**This changes everything.** 🚀

---

*"AIDIS is not just a tool - it's the foundation for sustainable AI development."*
