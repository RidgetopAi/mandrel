# Mandrel Command

Database viewer and admin tool for AIDIS (AI Development Intelligence System). This application provides a web interface for managing contexts, agents, tasks, decisions, and naming registry with data cleanup capabilities.

## Project Structure

```
aidis-command/
├── frontend/          # React TypeScript frontend
├── backend/           # Express TypeScript backend
├── shared/            # Shared TypeScript types
├── .env.example       # Environment configuration template
└── README.md          # This file
```

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- PostgreSQL database with AIDIS schema
- AIDIS MCP server running (optional for full functionality)

### Installation

1. Clone and setup:
```bash
cd aidis-command
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your database and server configuration
```

3. Start development servers:
```bash
npm run dev:full
```

This will start:
- Backend API server on http://localhost:5000
- Frontend React app on http://localhost:3000

### Development Scripts

```bash
# Start both frontend and backend in development mode
npm run dev:full

# Start individual services
npm run dev:frontend    # React dev server
npm run dev:backend     # Express dev server with hot reload

# Build for production
npm run build

# Linting and formatting
npm run lint
npm run lint:fix
npm run format
```

## Technology Stack

### Frontend
- **React 18** with TypeScript
- **Ant Design** for UI components
- **React Router** for navigation
- **Axios** for API communication

### Backend
- **Express** with TypeScript
- **PostgreSQL** for database
- **CORS** and **Helmet** for security
- **Morgan** for logging

### Shared
- **TypeScript** definitions
- Database model types
- API request/response interfaces

## API Endpoints

### Health Check
- `GET /api/health` - Basic health check
- `GET /api/health/db` - Database connectivity check

### Planned Endpoints (Phase 2)
- `/api/projects` - Project management
- `/api/contexts` - Context storage and search
- `/api/agents` - Agent coordination
- `/api/tasks` - Task management
- `/api/decisions` - Technical decisions
- `/api/naming` - Naming registry

## Database Integration

This application connects to the same PostgreSQL database used by AIDIS MCP server. The database schema includes:

- **projects** - Project management
- **contexts** - Context storage with vector embeddings
- **agents** - Multi-agent coordination
- **tasks** - Task breakdown and tracking
- **technical_decisions** - Architectural decision records
- **naming_registry** - Naming consistency enforcement
- **code_components** - Code structure analysis

## Development Phases

### Phase 1: Foundation ✅ COMPLETE
- [x] Project structure setup
- [x] Frontend React application
- [x] Backend Express server
- [x] Shared TypeScript types
- [x] Development environment configuration
- [x] Basic health check endpoints

### Phase 2: Core API Integration (Next)
- [ ] Database connection and models
- [ ] CRUD endpoints for all AIDIS tables
- [ ] Authentication and authorization
- [ ] API documentation with Swagger

### Phase 3: Advanced UI (Future)
- [ ] Data visualization dashboards
- [ ] Real-time updates with WebSockets
- [ ] Advanced search and filtering
- [ ] Export/import functionality

### Phase 4: Production Ready (Future)
- [ ] Comprehensive test suite
- [ ] Performance optimization
- [ ] Security hardening
- [ ] Deployment configuration

## Contributing

This is an internal tool for AIDIS development. Follow TypeScript best practices and maintain consistency with existing code patterns.

## License

MIT License - Internal use only
