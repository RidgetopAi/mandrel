import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth';
import { logger } from '../config/logger';
import { AuthenticatedRequest } from '../types/auth';

/**
 * SSE Authentication Middleware
 * 
 * Validates JWT tokens for Server-Sent Events connections.
 * Supports both Authorization header and query parameter token
 * (query parameter is needed because EventSource API doesn't support headers).
 * 
 * Sets req.user on successful authentication.
 */
export const ensureAuthForSse = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Development mode bypass - use default dev user (matches real user for settings persistence)
    if (process.env.NODE_ENV === 'development') {
      logger.debug('SSE Auth: Development mode bypass');
      req.user = {
        id: 'f7ad70e4-ae50-4c42-9447-7be278023db4',
        username: 'ridgetopai',
        email: 'brianj@ridgetopai.net',
        role: 'admin',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date()
      };
      return next();
    }

    // Extract token from Authorization header or query parameter
    // EventSource API doesn't support custom headers, so we allow query param
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7) // Remove 'Bearer ' prefix
      : (req.query.token as string | undefined);

    if (!token) {
      logger.warn('SSE Auth: No token provided', {
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      res.status(401).send('Authentication required. Provide token via Authorization header or ?token= query parameter');
      return;
    }

    // Validate token format (basic check for JWT structure)
    if (token.split('.').length !== 3) {
      logger.warn('SSE Auth: Invalid token format', {
        ip: req.ip,
        tokenPrefix: token.substring(0, 20) + '...'
      });
      res.status(401).send('Invalid token format. Token must be a valid JWT');
      return;
    }

    // Verify JWT token
    const payload = AuthService.verifyJWT(token);
    if (!payload) {
      logger.warn('SSE Auth: Token verification failed', {
        ip: req.ip
      });
      res.status(401).send('Invalid token. Token verification failed');
      return;
    }

    // Validate session is still active
    const isValidSession = await AuthService.validateSession(payload.tokenId);
    if (!isValidSession) {
      logger.warn('SSE Auth: Session expired or invalid', {
        userId: payload.userId,
        tokenId: payload.tokenId
      });
      res.status(401).send('Session expired. Please log in again');
      return;
    }

    // Get user from database
    const user = await AuthService.findUserById(payload.userId);
    if (!user) {
      logger.warn('SSE Auth: User not found', {
        userId: payload.userId
      });
      res.status(401).send('User not found');
      return;
    }

    // Check if user is active
    if (!user.is_active) {
      logger.warn('SSE Auth: Inactive user attempted connection', {
        userId: user.id,
        username: user.username
      });
      res.status(403).send('Account is inactive');
      return;
    }

    // Attach user to request
    req.user = user;

    logger.debug('SSE Auth: Successful authentication', {
      userId: user.id,
      username: user.username
    });

    next();

  } catch (error) {
    logger.error('SSE Auth: Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    res.status(500).send('Authentication error');
  }
};

/**
 * Optional project context middleware for SSE
 * Extracts and validates project ID from query parameter
 */
export const extractSseProjectContext = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const projectId = req.query.projectId as string | undefined;

    if (projectId) {
      // Validate UUID format
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(projectId)) {
        logger.warn('SSE Project: Invalid project ID format', {
          projectId,
          userId: req.user?.id
        });
        res.status(400).send('Invalid project ID format');
        return;
      }

      // Attach project context to request
      (req as any).project = { id: projectId };

      logger.debug('SSE Project: Context extracted', {
        projectId,
        userId: req.user?.id
      });
    }

    next();

  } catch (error) {
    logger.error('SSE Project: Unexpected error', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    res.status(500).send('Project context error');
  }
};
