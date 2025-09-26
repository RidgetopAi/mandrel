/**
 * TR003-5: Strict Versioned MCP API (/v2/mcp/*)
 * Prevents breaking changes and enables gradual migration
 */

import express from 'express';
import { IngressValidator, ValidationContext } from '../../middleware/ingressValidation.js';
import { McpResponseHandler } from '../../utils/mcpResponseHandler.js';
import { logger } from '../../utils/logger.js';
import { contextHandler } from '../../handlers/context.js';
import { projectHandler } from '../../handlers/project.js';
import { namingHandler } from '../../handlers/naming.js';
import { decisionsHandler } from '../../handlers/decisions.js';
import { tasksHandler } from '../../handlers/tasks.js';
import { codeAnalysisHandler } from '../../handlers/codeAnalysis.js';
import { smartSearchHandler } from '../../handlers/smartSearch.js';

// API version metadata
export const API_VERSION = '2.0.0';
export const API_COMPATIBILITY = ['2.0.0', '2.1.0']; // Backward compatible versions

// Request/Response interfaces for v2 API
export interface V2McpRequest {
  tool: string;
  arguments?: any;
  requestId?: string;
  clientVersion?: string;
}

export interface V2McpResponse {
  success: boolean;
  data?: any;
  error?: string;
  version: string;
  requestId?: string;
  processingTime?: number;
  warnings?: string[];
}

/**
 * Versioned MCP API Router
 * Provides strict API versioning with backward compatibility
 */
export class V2McpRouter {
  private router: express.Router;
  private toolHandlers: Map<string, Function>;

  constructor() {
    this.router = express.Router();
    this.toolHandlers = new Map();
    this.initializeHandlers();
    this.setupRoutes();
    this.setupMiddleware();
  }

  /**
   * Initialize tool handlers mapping
   */
  private initializeHandlers(): void {
    // Context Management
    this.toolHandlers.set('context_store', contextHandler);
    this.toolHandlers.set('context_search', contextHandler);
    this.toolHandlers.set('context_get_recent', contextHandler);
    this.toolHandlers.set('context_stats', contextHandler);

    // Project Management
    this.toolHandlers.set('project_create', projectHandler);
    this.toolHandlers.set('project_switch', projectHandler);
    this.toolHandlers.set('project_info', projectHandler);
    this.toolHandlers.set('project_list', projectHandler);
    this.toolHandlers.set('project_current', projectHandler);
    this.toolHandlers.set('project_insights', projectHandler);

    // Naming Registry
    this.toolHandlers.set('naming_register', namingHandler);
    this.toolHandlers.set('naming_check', namingHandler);
    this.toolHandlers.set('naming_suggest', namingHandler);
    this.toolHandlers.set('naming_stats', namingHandler);

    // Technical Decisions
    this.toolHandlers.set('decision_record', decisionsHandler);
    this.toolHandlers.set('decision_search', decisionsHandler);
    this.toolHandlers.set('decision_update', decisionsHandler);
    this.toolHandlers.set('decision_stats', decisionsHandler);

    // Task Management
    this.toolHandlers.set('task_create', tasksHandler);
    this.toolHandlers.set('task_list', tasksHandler);
    this.toolHandlers.set('task_update', tasksHandler);
    this.toolHandlers.set('task_bulk_update', tasksHandler);
    this.toolHandlers.set('task_details', tasksHandler);
    this.toolHandlers.set('task_progress_summary', tasksHandler);

    // Code Analysis
    this.toolHandlers.set('code_analyze', codeAnalysisHandler);
    this.toolHandlers.set('code_components', codeAnalysisHandler);
    this.toolHandlers.set('code_dependencies', codeAnalysisHandler);
    this.toolHandlers.set('code_impact', codeAnalysisHandler);
    this.toolHandlers.set('code_stats', codeAnalysisHandler);

    // Smart Search
    this.toolHandlers.set('smart_search', smartSearchHandler);
    this.toolHandlers.set('get_recommendations', smartSearchHandler);
  }

  /**
   * Setup API middleware
   */
  private setupMiddleware(): void {
    // API version validation
    this.router.use((req, res, next) => {
      const clientVersion = req.headers['x-api-version'] as string;

      if (clientVersion && !API_COMPATIBILITY.includes(clientVersion)) {
        return res.status(400).json({
          success: false,
          error: `Unsupported API version: ${clientVersion}`,
          version: API_VERSION,
          supportedVersions: API_COMPATIBILITY
        });
      }

      // Add version info to request
      (req as any).apiVersion = clientVersion || API_VERSION;
      next();
    });

    // Request logging
    this.router.use((req, res, next) => {
      const requestId = req.headers['x-request-id'] as string || `v2-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      (req as any).requestId = requestId;

      logger.info('V2 MCP API request', {
        requestId,
        method: req.method,
        path: req.path,
        tool: req.params.tool,
        clientVersion: (req as any).apiVersion,
        userAgent: req.headers['user-agent']
      });

      next();
    });

    // Request size limiting
    this.router.use(express.json({ limit: '1mb' }));
    this.router.use(express.urlencoded({ extended: true, limit: '1mb' }));
  }

  /**
   * Setup API routes
   */
  private setupRoutes(): void {
    // API information endpoint
    this.router.get('/', (req, res) => {
      res.json({
        version: API_VERSION,
        compatibleVersions: API_COMPATIBILITY,
        endpoints: {
          tools: '/v2/mcp/tools/:toolName',
          list: '/v2/mcp/tools',
          health: '/v2/mcp/health'
        },
        documentation: 'https://docs.aidis.dev/api/v2'
      });
    });

    // Health check endpoint
    this.router.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        version: API_VERSION,
        timestamp: new Date().toISOString(),
        toolsAvailable: this.toolHandlers.size
      });
    });

    // List available tools
    this.router.get('/tools', (req, res) => {
      const tools = Array.from(this.toolHandlers.keys()).map(tool => ({
        name: tool,
        endpoint: `/v2/mcp/tools/${tool}`,
        methods: ['POST']
      }));

      res.json({
        success: true,
        version: API_VERSION,
        data: {
          tools,
          totalCount: tools.length
        }
      });
    });

    // Tool execution endpoint
    this.router.post('/tools/:tool', async (req, res) => {
      const startTime = Date.now();
      const { tool } = req.params;
      const requestId = (req as any).requestId;
      const apiVersion = (req as any).apiVersion;

      try {
        // Validate request structure
        const requestValidation = this.validateV2Request(req.body, tool);
        if (!requestValidation.success) {
          return res.status(400).json({
            success: false,
            error: requestValidation.error,
            version: API_VERSION,
            requestId
          });
        }

        // Check if tool exists
        const handler = this.toolHandlers.get(tool);
        if (!handler) {
          return res.status(404).json({
            success: false,
            error: `Tool '${tool}' not found`,
            version: API_VERSION,
            requestId,
            availableTools: Array.from(this.toolHandlers.keys())
          });
        }

        // Create validation context
        const validationContext: ValidationContext = IngressValidator.createValidationContext(
          tool,
          requestId,
          'http'
        );

        // Enhanced validation
        const validationResult = await IngressValidator.validateIngressRequest(
          tool,
          req.body.arguments || {},
          validationContext,
          {
            enableSanitization: true,
            enableAuditLogging: true,
            maxRequestSize: 1024 * 1024 // 1MB
          }
        );

        if (!validationResult.success) {
          return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: validationResult.errors,
            warnings: validationResult.warnings,
            version: API_VERSION,
            requestId
          });
        }

        // Execute tool handler
        const toolResult = await handler(tool, validationResult.data || {});

        // Process response through handler
        const responseResult = await McpResponseHandler.processResponse(
          JSON.stringify(toolResult),
          { toolName: tool, requestId }
        );

        if (!responseResult.success) {
          return res.status(500).json({
            success: false,
            error: 'Tool execution failed',
            details: responseResult.error,
            version: API_VERSION,
            requestId,
            processingTime: Date.now() - startTime
          });
        }

        // Success response
        const v2Response: V2McpResponse = {
          success: true,
          data: responseResult.data,
          version: API_VERSION,
          requestId,
          processingTime: Date.now() - startTime,
          warnings: validationResult.warnings?.length ? validationResult.warnings : undefined
        };

        res.json(v2Response);

      } catch (error) {
        logger.error('V2 MCP API error', {
          tool,
          requestId,
          error: error.message,
          stack: error.stack
        });

        res.status(500).json({
          success: false,
          error: 'Internal server error',
          version: API_VERSION,
          requestId,
          processingTime: Date.now() - startTime
        });
      }
    });

    // Catch-all for unsupported methods
    this.router.all('/tools/:tool', (req, res) => {
      res.status(405).json({
        success: false,
        error: `Method ${req.method} not allowed for tool endpoint`,
        version: API_VERSION,
        allowedMethods: ['POST']
      });
    });

    // 404 handler
    this.router.all('*', (req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        version: API_VERSION,
        path: req.path
      });
    });
  }

  /**
   * Validate V2 request structure
   */
  private validateV2Request(body: any, tool: string): { success: boolean; error?: string } {
    if (!body || typeof body !== 'object') {
      return {
        success: false,
        error: 'Request body must be a JSON object'
      };
    }

    // Arguments are optional but must be object if present
    if (body.arguments !== undefined && typeof body.arguments !== 'object') {
      return {
        success: false,
        error: 'Arguments must be an object'
      };
    }

    return { success: true };
  }

  /**
   * Get the Express router
   */
  getRouter(): express.Router {
    return this.router;
  }

  /**
   * Add custom tool handler
   */
  addToolHandler(toolName: string, handler: Function): void {
    this.toolHandlers.set(toolName, handler);
    logger.info('Added V2 tool handler', { toolName });
  }

  /**
   * Remove tool handler
   */
  removeToolHandler(toolName: string): boolean {
    const removed = this.toolHandlers.delete(toolName);
    if (removed) {
      logger.info('Removed V2 tool handler', { toolName });
    }
    return removed;
  }

  /**
   * Get tool statistics
   */
  getToolStats(): { [key: string]: any } {
    return {
      totalTools: this.toolHandlers.size,
      availableTools: Array.from(this.toolHandlers.keys()),
      version: API_VERSION,
      compatibleVersions: API_COMPATIBILITY
    };
  }
}

export default V2McpRouter;