# AIDIS COMMAND - Project Architecture

**Project**: Database Viewer and Admin Tool for AI Development Intelligence System
**Agent**: ProjectManager
**Created**: 2025-08-16

## Overview

AIDIS COMMAND is a comprehensive web-based administration and visualization tool for the AI Development Intelligence System. It provides database browsing, agent management, task tracking, decision history, and data cleanup capabilities.

## System Architecture

### Technology Stack Selection

**Frontend Framework**: React with TypeScript
- **Rationale**: Mature ecosystem, excellent TypeScript support, extensive component libraries
- **UI Library**: Ant Design (comprehensive admin components) or Material-UI
- **State Management**: Zustand or Redux Toolkit
- **Data Visualization**: D3.js + React-D3-Library for embedding visualization
- **Routing**: React Router v6

**Backend**: Node.js with Express
- **Rationale**: Leverages existing AIDIS TypeScript codebase, direct database integration
- **API Style**: RESTful with GraphQL consideration for complex queries
- **Authentication**: JWT-based with role-based access control
- **WebSocket**: Socket.io for real-time updates

**Database Integration**:
- **Direct PostgreSQL Connection**: Reuse existing pool configuration
- **Vector Query Optimization**: Custom endpoints for embedding similarity searches
- **Transaction Management**: Proper isolation for data cleanup operations

### Application Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AIDIS COMMAND                            │
├─────────────────────────────────────────────────────────────┤
│  React Frontend (Port 3000)                                │
│  ├── Dashboard                                              │
│  ├── Context Browser                                        │
│  ├── Agent Management                                       │
│  ├── Task Tracker                                           │
│  ├── Decision History                                       │
│  ├── Naming Registry                                        │
│  └── Data Cleanup Tools                                     │
├─────────────────────────────────────────────────────────────┤
│  Express API Server (Port 8080)                            │
│  ├── REST Endpoints                                         │
│  ├── WebSocket Server                                       │
│  ├── Authentication Middleware                              │
│  └── Database Query Layer                                   │
├─────────────────────────────────────────────────────────────┤
│  Existing AIDIS Infrastructure                             │
│  ├── PostgreSQL + pgvector                                 │
│  ├── MCP Server (can remain running)                       │
│  └── 37 Production-Ready MCP Tools                         │
└─────────────────────────────────────────────────────────────┘
```

## Database Integration Strategy

### Direct Database Access
- **Connection Pool**: Extend existing database configuration from MCP server
- **Query Optimization**: Implement connection pooling and prepared statements
- **Vector Search**: Custom PostgreSQL functions for similarity queries
- **Real-time Updates**: Database triggers + WebSocket notifications

### Data Access Patterns
1. **Read-Heavy Workloads**: Context browsing, decision history
2. **Real-time Updates**: Agent status, task progress
3. **Complex Queries**: Multi-table joins, vector similarity searches
4. **Batch Operations**: Data cleanup, bulk updates

## Core Features Architecture

### 1. Context Viewer with Semantic Search
- **Vector Similarity Heatmap**: D3.js visualization of embedding relationships
- **Interactive Search**: Real-time semantic search with query expansion
- **Content Filtering**: By type, date, relevance, tags, projects
- **Export Capabilities**: JSON, CSV, formatted reports

### 2. Agent Management Panel
- **Real-time Status Dashboard**: Live agent status monitoring
- **Registration Interface**: Add/remove agents with capability configuration
- **Session Tracking**: Historical agent activity and performance metrics
- **Communication Hub**: Inter-agent message monitoring and debugging

### 3. Task Tracker
- **Kanban Board**: Drag-and-drop task management interface
- **Dependency Visualization**: Task relationship graphs
- **Progress Analytics**: Timeline views, completion rates, bottleneck analysis
- **Assignment Management**: Intelligent agent workload balancing

### 4. Decision History Browser
- **Decision Timeline**: Chronological view with impact tracking
- **Alternative Analysis**: Compare rejected alternatives with outcomes
- **Impact Assessment**: Show affected components and downstream effects
- **Search & Filter**: By type, impact level, date, affected components

### 5. Naming Registry Interface
- **Conflict Resolution**: Visual conflict detection and resolution workflows
- **Convention Analysis**: Pattern detection and compliance checking
- **Bulk Operations**: Import/export naming conventions, batch updates
- **Suggestion Engine**: Smart naming recommendations with context awareness

### 6. Data Cleanup Tools
- **Contaminated Data Detection**: Pattern-based identification of corrupted entries
- **Safe Deletion Interface**: Multi-step confirmation with impact analysis
- **Backup & Restore**: Point-in-time recovery capabilities
- **Data Quality Metrics**: Health scoring and improvement recommendations

## Security Architecture

### Authentication & Authorization
- **JWT Token-Based**: Stateless authentication with refresh tokens
- **Role-Based Access Control (RBAC)**:
  - `admin`: Full access to all operations including data cleanup
  - `manager`: Read/write access to projects, tasks, decisions
  - `viewer`: Read-only access to contexts and decisions
  - `agent`: Programmatic access for automated operations

### Data Protection
- **Input Validation**: Comprehensive validation on all endpoints
- **SQL Injection Prevention**: Parameterized queries only
- **XSS Protection**: Content Security Policy and input sanitization
- **Rate Limiting**: Prevent abuse of search and cleanup operations
- **Audit Logging**: Track all administrative actions

## Performance Requirements

### Response Times
- **Dashboard Load**: < 2 seconds
- **Context Search**: < 500ms for semantic search
- **Real-time Updates**: < 100ms WebSocket latency
- **Data Cleanup**: Background processing with progress indicators

### Scalability
- **Concurrent Users**: Support 50+ simultaneous users
- **Data Volume**: Handle 100K+ contexts efficiently
- **Search Performance**: Sub-second response for complex queries
- **Memory Usage**: Optimized for long-running processes

## Development Environment

### Project Structure
```
aidis-command/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/      # Reusable UI components
│   │   ├── pages/           # Page components
│   │   ├── services/        # API client services
│   │   ├── hooks/           # Custom React hooks
│   │   ├── utils/           # Utility functions
│   │   └── types/           # TypeScript type definitions
│   ├── public/
│   └── package.json
├── backend/                  # Express server
│   ├── src/
│   │   ├── routes/          # API route handlers
│   │   ├── middleware/      # Express middleware
│   │   ├── services/        # Business logic services
│   │   ├── models/          # Database models
│   │   ├── utils/           # Utility functions
│   │   └── types/           # TypeScript type definitions
│   └── package.json
├── shared/                   # Shared TypeScript types
├── docs/                     # Documentation
└── deployment/               # Docker and deployment configs
```

### Development Commands
```bash
# Frontend (React)
cd aidis-command/frontend
npm install
npm start                    # Development server on port 3000
npm run build               # Production build
npm run test                # Jest testing
npm run lint                # ESLint checking
npm run type-check          # TypeScript validation

# Backend (Express)
cd aidis-command/backend  
npm install
npm run dev                 # Development server on port 8080
npm run build              # TypeScript compilation
npm run start              # Production server
npm run test               # Jest + Supertest
npm run lint               # ESLint checking
npm run type-check         # TypeScript validation

# Full Stack
npm run dev:full           # Start both frontend and backend
npm run build:all          # Build both applications
npm run test:all           # Run all tests
```

## Integration with Existing AIDIS

### MCP Server Coexistence
- AIDIS COMMAND runs alongside existing MCP server
- No conflicts as they serve different purposes
- Can leverage MCP tools for some operations if needed
- Shared database ensures data consistency

### Database Schema Extensions
- **No breaking changes** to existing schema
- **Additional tables** for application-specific features:
  - `admin_users` - Authentication and RBAC
  - `audit_logs` - Administrative action tracking  
  - `cleanup_jobs` - Background cleanup task management
  - `ui_preferences` - User interface customizations

### Migration Strategy
- **Phase 1**: Setup development environment and basic CRUD operations
- **Phase 2**: Implement core visualization and search features  
- **Phase 3**: Add real-time updates and advanced analytics
- **Phase 4**: Implement data cleanup and administrative features
- **Phase 5**: Production deployment and optimization

This architecture provides a solid foundation for building a comprehensive AIDIS administration tool while maintaining integration with the existing system.
