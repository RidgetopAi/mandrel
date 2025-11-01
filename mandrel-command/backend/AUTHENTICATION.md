# Mandrel Command Authentication System

## Overview
Complete JWT-based authentication system with session management, role-based access control, and security features.

## Features
✅ **JWT Token Authentication** - Secure token-based auth  
✅ **Session Management** - Database-backed session tracking  
✅ **Password Security** - Bcrypt hashing with 12 rounds  
✅ **Role-Based Access Control** - Admin role permissions  
✅ **Rate Limiting** - Prevents brute force attacks  
✅ **Token Refresh** - Secure token renewal  
✅ **Input Validation** - Comprehensive request validation  
✅ **Session Invalidation** - Secure logout functionality  

## Default Admin User
- **Username**: `admin`
- **Password**: `admin123!`
- **Role**: `admin`
- **Email**: `admin@aidis.local`

## API Endpoints

### Authentication Routes

#### POST `/api/auth/login`
Authenticate user and receive JWT token.

**Request Body:**
```json
{
  "username": "admin",
  "password": "admin123!"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "uuid",
      "username": "admin",
      "email": "admin@aidis.local",
      "role": "admin",
      "is_active": true,
      "created_at": "2025-08-16T07:29:41.761Z",
      "updated_at": "2025-08-16T07:29:41.761Z",
      "last_login": "2025-08-16T07:33:13.795Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_at": "2025-08-17T03:33:13.780Z"
  }
}
```

#### POST `/api/auth/logout`
Invalidate current session.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Logout successful"
}
```

#### GET `/api/auth/profile`
Get current user profile.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "uuid",
      "username": "admin",
      "email": "admin@aidis.local",
      "role": "admin",
      "is_active": true,
      "created_at": "2025-08-16T07:29:41.761Z",
      "updated_at": "2025-08-16T07:29:41.761Z",
      "last_login": "2025-08-16T07:33:13.795Z"
    }
  }
}
```

#### POST `/api/auth/refresh`
Refresh JWT token.

**Headers:**
```
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Token refreshed successfully",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expires_at": "2025-08-17T03:33:13.812Z"
  }
}
```

#### POST `/api/auth/register` (Admin Only)
Create new admin user.

**Headers:**
```
Authorization: Bearer <admin-token>
```

**Request Body:**
```json
{
  "username": "newuser",
  "email": "newuser@aidis.local",
  "password": "secure123!",
  "role": "admin"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User created successfully",
  "data": {
    "user": {
      "id": "uuid",
      "username": "newuser",
      "email": "newuser@aidis.local",
      "role": "admin",
      "is_active": true,
      "created_at": "2025-08-16T07:35:00.000Z",
      "updated_at": "2025-08-16T07:35:00.000Z"
    }
  }
}
```

## Using Authentication in Frontend

### Login Flow
```javascript
// 1. Login
const loginResponse = await fetch('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'admin',
    password: 'admin123!'
  })
});

const { data } = await loginResponse.json();
const token = data.token;

// 2. Store token (localStorage, sessionStorage, or cookie)
localStorage.setItem('auth_token', token);

// 3. Use token for authenticated requests
const profileResponse = await fetch('/api/auth/profile', {
  headers: { 'Authorization': `Bearer ${token}` }
});
```

### Protected Route Usage
```javascript
// Add token to all API requests
const apiRequest = async (url, options = {}) => {
  const token = localStorage.getItem('auth_token');
  return fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
};

// Example protected request
const response = await apiRequest('/api/some-protected-endpoint');
```

## Security Features

### Rate Limiting
- **Login endpoints**: 5 attempts per 15 minutes per IP
- **General endpoints**: 100 requests per 15 minutes per IP

### Password Requirements
- Minimum 8 characters
- At least 1 uppercase letter
- At least 1 lowercase letter  
- At least 1 number
- At least 1 special character

### Token Security
- **Algorithm**: HS256
- **Expiration**: 24 hours
- **Session tracking**: Database-backed validation
- **Automatic invalidation**: On logout or token refresh

### Database Schema

#### admin_users table
```sql
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'admin',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_login TIMESTAMP
);
```

#### user_sessions table
```sql
CREATE TABLE user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  token_id VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  is_active BOOLEAN DEFAULT true
);
```

## Error Responses

### 401 Unauthorized
```json
{
  "error": "Authentication failed",
  "message": "Invalid username or password"
}
```

### 403 Forbidden
```json
{
  "error": "Access denied",
  "message": "Required role: admin"
}
```

### 429 Rate Limited
```json
{
  "error": "Too many authentication attempts",
  "message": "Please try again later"
}
```

## Testing

Run comprehensive tests:
```bash
npx tsx test-auth-comprehensive.ts
```

## Environment Variables

Add to `.env`:
```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12
```

## Production Deployment

1. **Change JWT Secret**: Generate strong random secret
2. **Enable HTTPS**: All authentication over SSL
3. **Set Strong Passwords**: Enforce password policy
4. **Monitor Sessions**: Track active sessions
5. **Log Auth Events**: Monitor for suspicious activity

## Integration with AIDIS System

This authentication system is designed to work with:
- **Mandrel Command Frontend** - React dashboard
- **AIDIS MCP Server** - Database operations
- **Future Admin Tools** - Extensible architecture

---

🎉 **Authentication System Complete & Production Ready!**
