import { Request } from 'express';

export interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  theme?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
  last_login?: Date;
  password_hash?: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  token_id: string;
  created_at: Date;
  expires_at: Date;
  is_active: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  user: Omit<User, 'password_hash'>;
  token: string;
  expires_at: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  role?: string;
}

export interface JWTPayload {
  userId: string;
  username: string;
  email: string;
  role: string;
  tokenId: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends Request {
  user?: User;
  tokenId?: string;
  projectId?: string; // Added for Oracle Phase 1: Project Context Middleware
}
