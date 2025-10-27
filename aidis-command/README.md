# AIDIS Command - Web Interface

Production-ready web interface for AIDIS MCP Server.

![Status](https://img.shields.io/badge/Status-Beta-yellow)
![License](https://img.shields.io/badge/License-MIT-green)

---

## Overview

AIDIS Command provides a comprehensive web dashboard for managing projects, contexts, technical decisions, and tasks stored in the AIDIS MCP Server.

**Features:**
- 📊 Project management and switching
- 🔍 Context search with semantic similarity
- 📝 Technical decision tracking
- ✅ Task coordination and analytics
- 📈 Real-time updates via WebSocket
- 🎨 Modern UI with Ant Design

---

## Prerequisites

- Node.js 16+
- AIDIS MCP Server running (see main README)

---

## Quick Start

### 1. Install Dependencies

```bash
cd aidis-command/frontend
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Update environment variables as needed:

```env
# Backend REST API URL
REACT_APP_API_URL=http://localhost:5000/api

# MCP Server HTTP Bridge URL
REACT_APP_MCP_URL=http://localhost:8080

# WebSocket URL for real-time updates
REACT_APP_WS_URL=ws://localhost:5000/ws

# Sentry Error Tracking (Optional)
REACT_APP_SENTRY_DSN=
REACT_APP_SENTRY_ENABLED=false
```

### 3. Run Development Server

```bash
npm start
```

Or run the full stack:

```bash
cd ../..
npm run dev:full
```

### 4. Access

Open http://localhost:3000

**Default Login**: admin / admin123!

---

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `REACT_APP_API_URL` | Backend REST API base URL | `http://localhost:5000/api` |
| `REACT_APP_MCP_URL` | MCP tools endpoint | `http://localhost:8080` |
| `REACT_APP_WS_URL` | WebSocket for real-time updates | `ws://localhost:5000/ws` |
| `REACT_APP_SENTRY_DSN` | (Optional) Sentry error tracking | - |
| `REACT_APP_SENTRY_ENABLED` | (Optional) Enable Sentry | `false` |

### Ports

- **Frontend**: 3000 (React dev server)
- **Backend API**: 5000 (Express)
- **MCP Server**: 8080 (HTTP bridge)
- **WebSocket**: 5000 (same as backend API)

---

## Architecture

### Frontend
- **React 18** with TypeScript
- **Ant Design 5** for UI components
- **React Query** for server state management
- **React Router 6** with lazy-loaded routes
- **Code splitting** for optimal performance

### Backend API
- **Express.js** REST API
- **JWT authentication**
- **WebSocket** for real-time updates
- **OpenAPI** generated TypeScript client

---

## Production Build

```bash
npm run build
```

Outputs to `build/` directory. Serve with any static file server.

---

## Optional: Sentry Integration

To enable error tracking in production:

1. Sign up for Sentry account
2. Create a new React project
3. Copy your DSN
4. Set environment variables:
   ```bash
   REACT_APP_SENTRY_DSN=your-dsn-here
   REACT_APP_SENTRY_ENABLED=true
   ```
5. Rebuild: `npm run build`

---

## Development

### Available Scripts

- `npm start` - Start development server
- `npm run build` - Production build
- `npm test` - Run tests
- `npm run lint` - Run ESLint
- `npm run type-check` - TypeScript type checking

### Project Structure

```
frontend/
├── src/
│   ├── api/          # API clients and generated types
│   ├── components/   # Reusable UI components
│   ├── contexts/     # React contexts
│   ├── hooks/        # Custom React hooks
│   ├── pages/        # Route components
│   ├── services/     # Business logic
│   ├── types/        # TypeScript types
│   └── utils/        # Utility functions
├── public/           # Static assets
└── package.json
```

---

## Troubleshooting

### "Failed to connect to MCP server"
- Ensure AIDIS MCP Server is running on port 8080
- Check `REACT_APP_MCP_URL` in your `.env` file

### "WebSocket connection failed"
- Ensure backend is running on port 5000
- Check `REACT_APP_WS_URL` in your `.env` file

### "401 Unauthorized"
- Check that you're logged in
- Try logging out and back in
- Clear localStorage: `localStorage.clear()`

---

## License

MIT

---

## Contributing

This is beta software. Contributions welcome!

**Known Limitations:**
- Performance tuning ongoing
- Additional test coverage needed
- Documentation improvements in progress

**Reporting Issues:**
- Include browser console errors
- Describe steps to reproduce
- Note your environment (OS, Node version, browser)

---

**Status**: Beta - expect rough edges, but core functionality is solid!
