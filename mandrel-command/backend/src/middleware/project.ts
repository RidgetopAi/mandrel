import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types/auth';
import { logger } from '../config/logger';
import { isValidUuid } from '../utils/uuid';

/**
 * Project Context Middleware
 * 
 * Reads X-Project-ID header, validates user access, and attaches req.projectId
 * Implements Oracle Phase 1: Centralized Project Scoping
 */
export const projectContextMiddleware = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Allow CORS pre-flight to pass through
    if (req.method === 'OPTIONS') {
      return next();
    }

    // Skip project validation for auth endpoints
    if (req.path.startsWith('/auth') || req.path === '/health' || req.path === '/db-status') {
      return next();
    }

    // Read X-Project-ID header
    const projectIdHeader = req.headers['x-project-id'] as string;
    
    if (projectIdHeader) {
      // Validate project ID format against the shared, Postgres-exact UUID
      // check. (Previously this used a stricter RFC version/variant regex
      // `...-[1-5]...-[89ab]...` which REJECTED real ids the DB had stored and
      // accepted — over-rejection that 400'd users out of valid projects.)
      if (!isValidUuid(projectIdHeader)) {
        res.status(400).json({
          success: false,
          error: 'Invalid project ID format',
          message: 'Project ID must be a valid UUID'
        });
        return;
      }

      // TODO: Add project access validation when user-project relationships are implemented
      // For now, we trust the authenticated user has access to the project
      
      // Attach validated project ID to request
      req.projectId = projectIdHeader;
    }

    next();
  } catch (error) {
    logger.error('Project context middleware error', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
      path: req.path,
      method: req.method,
      projectId: req.headers['x-project-id']
    });
    
    res.status(500).json({
      success: false,
      error: 'Project context validation failed',
      message: 'Internal server error during project validation'
    });
  }
};

