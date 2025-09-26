# AIDIS Command Frontend

A professional React-based admin interface for the AI Development Intelligence System (AIDIS).

## Features Implemented ✅

### Authentication System
- JWT token-based authentication
- Secure login/logout with session management
- Automatic token refresh and 401 handling
- Protected route middleware
- Persistent authentication state

### User Interface
- Professional admin layout with Ant Design v5
- Responsive sidebar navigation
- User dropdown with profile options
- Breadcrumb navigation
- AIDIS branding and theming

### Routing Structure
- `/login` - Public login page
- `/dashboard` - Protected dashboard with stats
- `/contexts` - Context browser (placeholder)
- `/agents` - Agent management (placeholder) 
- `/projects` - Project switcher (placeholder)
- `/settings` - User settings

### State Management
- Zustand store for global state
- Authentication context with React Context API
- Persistent state across page refreshes
- Clean error handling and loading states

### API Integration
- Axios client with interceptors
- Automatic JWT header injection
- Error handling and retry logic
- TypeScript interfaces for type safety

## Technology Stack

- **React 18** - Modern React with hooks
- **TypeScript** - Full type safety
- **Ant Design v5** - Professional UI components
- **React Router v6** - Client-side routing
- **Zustand** - Lightweight state management
- **Axios** - HTTP client with interceptors

## Getting Started

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Setup**
   ```bash
   # Create .env file (already created)
   REACT_APP_API_URL=http://localhost:5000/api
   ```

3. **Development Server**
   ```bash
   npm start
   # Opens browser at http://localhost:3000
   ```

4. **Production Build**
   ```bash
   npm run build
   ```

## Authentication

### Demo Credentials
- **Username:** `admin`
- **Password:** `admin123!`

### Login Flow
1. Navigate to `/login`
2. Enter credentials
3. JWT token stored in localStorage
4. Redirected to dashboard
5. Protected routes accessible

### Logout Flow
1. Click user dropdown → Logout
2. API call to logout endpoint
3. Token cleared from storage
4. Redirected to login page

## Project Structure

```
src/
├── components/          # Reusable components
│   ├── AppLayout.tsx   # Main app layout
│   └── ProtectedRoute.tsx # Route protection
├── contexts/           # React contexts
│   └── AuthContext.tsx # Authentication context
├── pages/             # Page components
│   ├── Login.tsx      # Login page
│   ├── Dashboard.tsx  # Main dashboard
│   ├── Contexts.tsx   # Context browser
│   ├── Agents.tsx     # Agent management
│   ├── Projects.tsx   # Project switcher
│   └── Settings.tsx   # User settings
├── services/          # External services
│   └── api.ts        # API client
├── stores/           # Zustand stores  
│   └── authStore.ts  # Auth state management
└── App.tsx          # Main app component
```

## API Integration

### Endpoints Used
- `POST /api/auth/login` - User authentication
- `POST /api/auth/logout` - Session cleanup
- `GET /api/auth/me` - Get current user
- `GET /api/health` - Health check

### Error Handling
- Automatic 401 redirect to login
- Toast notifications for errors
- Retry mechanisms for failed requests
- Graceful fallbacks for offline scenarios

## Security Features

- JWT token stored in localStorage (can be upgraded to httpOnly cookies)
- Automatic token expiration handling
- Protected route middleware
- Input validation on forms
- XSS protection through React's built-in sanitization

## Development Commands

```bash
# Start development server
npm start

# Build for production  
npm run build

# Run tests
npm test

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Code formatting
npm run format
```

## Integration with Backend

The frontend is configured to work with the AIDIS Command backend running on `http://localhost:5000`.

### API Configuration
- Base URL: `http://localhost:5000/api`
- Authentication: Bearer token in headers
- Content-Type: `application/json`
- Timeout: 10 seconds

## Next Steps

### Phase 1: Context Browser
- Implement semantic search interface
- Context filtering and sorting
- Visualization of context relationships

### Phase 2: Agent Management
- Agent registration and monitoring
- Task assignment interface
- Real-time status updates

### Phase 3: Project Management
- Project creation and switching
- Configuration management
- Data import/export

### Phase 4: Advanced Features
- Real-time notifications
- Advanced analytics dashboard
- Collaboration features

## Testing

The frontend can be tested by:

1. Ensuring backend is running on port 5000
2. Starting frontend with `npm start`
3. Logging in with admin/admin123!
4. Navigating between protected routes
5. Testing authentication persistence on refresh

## Architecture Notes

- **Single Page Application (SPA)** with client-side routing
- **Component-based architecture** with reusable components
- **Separation of concerns** with services, stores, and contexts
- **TypeScript-first** development for type safety
- **Modern React patterns** with hooks and functional components

This frontend provides a solid foundation for the AIDIS Command admin interface with room for feature expansion as the system grows.
