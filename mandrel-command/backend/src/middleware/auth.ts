import { Response, NextFunction } from 'express';
import { AuthService } from '../services/auth';
import { AuthenticatedRequest } from '../types/auth';

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Allow CORS pre-flight to pass straight through
    if (req.method === 'OPTIONS') {
      return next();
    }

    // Development mode bypass - use default dev user (matches real user for settings persistence)
    if (process.env.NODE_ENV === 'development') {
      req.user = {
        id: 'f7ad70e4-ae50-4c42-9447-7be278023db4',
        username: 'ridgetopai',
        email: 'brianj@ridgetopai.net',
        role: 'admin',
        theme: 'dark',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };
      return next();
    }

    const authHeader = req.headers.authorization;

    // Validate authorization header format
    if (!authHeader) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Authorization header is required'
      });
      return;
    }

    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'Invalid authorization format',
        message: 'Authorization header must use Bearer token format'
      });
      return;
    }

    const token = authHeader.split(' ')[1];

    // Validate token presence
    if (!token || token.trim().length === 0) {
      res.status(401).json({
        success: false,
        error: 'Access denied',
        message: 'No token provided'
      });
      return;
    }

    // Validate token format (basic check for JWT structure)
    if (token.split('.').length !== 3) {
      res.status(401).json({
        success: false,
        error: 'Invalid token format',
        message: 'Token must be a valid JWT'
      });
      return;
    }

    // Verify JWT token
    const payload = AuthService.verifyJWT(token);
    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
        message: 'Token verification failed'
      });
      return;
    }

    // Validate session is still active
    const isValidSession = await AuthService.validateSession(payload.tokenId);
    if (!isValidSession) {
      res.status(401).json({
        success: false,
        error: 'Session expired',
        message: 'Please log in again'
      });
      return;
    }

    // Get user from database
    const user = await AuthService.findUserById(payload.userId);
    if (!user) {
      res.status(401).json({
        success: false,
        error: 'User not found',
        message: 'User account no longer exists'
      });
      return;
    }

    // Check if user account is still active
    if (!user.is_active) {
      res.status(403).json({
        success: false,
        error: 'Account disabled',
        message: 'Your account has been deactivated'
      });
      return;
    }

    // Attach user and token info to request
    req.user = user;
    req.tokenId = payload.tokenId;

    next();
  } catch (error) {
    console.error('Authentication error:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      ip: req.ip
    });

    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      message: 'Invalid or expired token'
    });
  }
};

const requireRole = (requiredRoles: string | string[]) => {
  const roles = Array.isArray(requiredRoles) ? requiredRoles : [requiredRoles];

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        message: 'Please authenticate first to access this resource'
      });
      return;
    }

    // Validate user role
    if (!req.user.role) {
      res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'User role not assigned'
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      console.warn('Role access denied:', {
        userId: req.user.id,
        userRole: req.user.role,
        requiredRoles: roles,
        path: req.path,
        method: req.method,
        timestamp: new Date().toISOString()
      });

      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        message: `Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`
      });
      return;
    }

    next();
  };
};

export const requireAdmin = requireRole('admin');
