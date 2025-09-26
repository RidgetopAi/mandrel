/**
 * TR001-6: Frontend API Client Hardening
 * Enhanced type-safe API client with V2 endpoint integration, validation, and retry logic
 * Integrates with Phase 5 V2 API endpoints at port 8080
 */

import { z } from 'zod';

// ================================
// CORE SCHEMAS & TYPES
// ================================

export const McpResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  version: z.string().optional(),
  requestId: z.string().optional(),
  processingTime: z.number().optional(),
});

export const ApiErrorSchema = z.object({
  message: z.string(),
  code: z.string().optional(),
  details: z.any().optional(),
  requestId: z.string().optional(),
  timestamp: z.string().optional(),
});

export type McpResponse<T = any> = z.infer<typeof McpResponseSchema> & {
  data?: T;
};

export type ApiError = z.infer<typeof ApiErrorSchema>;

// ================================
// RETRY CONFIGURATION
// ================================

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
  retryCondition?: (error: ApiError, attempt: number) => boolean;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 10000,
  backoffFactor: 2,
  retryCondition: (error, attempt) => {
    // Retry on network errors, timeouts, and 5xx server errors
    const retryableCodes = ['NETWORK_ERROR', 'TIMEOUT', 'ECONNREFUSED'];
    const retryableMessages = ['timeout', 'network', 'connection', 'server error'];

    if (retryableCodes.includes(error.code || '')) return true;
    if (retryableMessages.some(msg => error.message.toLowerCase().includes(msg))) return true;

    return false;
  }
};

// ================================
// AIDIS API CLIENT CLASS
// ================================

export class AidisApiClient {
  private baseUrl: string;
  private timeout: number;
  private retryConfig: RetryConfig;

  constructor(config?: {
    baseUrl?: string;
    timeout?: number;
    retryConfig?: Partial<RetryConfig>;
  }) {
    this.baseUrl = config?.baseUrl || 'http://localhost:8080';
    this.timeout = config?.timeout || 30000;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config?.retryConfig };
  }

  // ================================
  // CORE REQUEST METHOD WITH RETRY
  // ================================

  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: ApiError | null = null;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = this.normalizeError(error, operationName);

        // Don't retry on last attempt
        if (attempt === this.retryConfig.maxRetries) {
          break;
        }

        // Check if we should retry this error
        if (!this.retryConfig.retryCondition?.(lastError, attempt)) {
          break;
        }

        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffFactor, attempt),
          this.retryConfig.maxDelay
        );

        console.warn(`API request failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}). Retrying in ${delay}ms...`, {
          operation: operationName,
          error: lastError.message,
          requestId: lastError.requestId
        });

        await this.sleep(delay);
      }
    }

    throw lastError;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private normalizeError(error: any, operation: string): ApiError {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const timestamp = new Date().toISOString();

    if (error instanceof Error) {
      return {
        message: error.message,
        code: error.name === 'TypeError' ? 'NETWORK_ERROR' : 'UNKNOWN_ERROR',
        details: { operation, originalError: error.message },
        requestId,
        timestamp
      };
    }

    if (typeof error === 'object' && error !== null) {
      return {
        message: error.message || 'Unknown error occurred',
        code: error.code || 'UNKNOWN_ERROR',
        details: error.details || { operation },
        requestId: error.requestId || requestId,
        timestamp: error.timestamp || timestamp
      };
    }

    return {
      message: String(error),
      code: 'UNKNOWN_ERROR',
      details: { operation },
      requestId,
      timestamp
    };
  }

  // ================================
  // HTTP REQUEST METHODS
  // ================================

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: any,
    options?: {
      headers?: Record<string, string>;
      validateResponse?: boolean;
    }
  ): Promise<McpResponse<T>> {
    const url = `${this.baseUrl}${endpoint}`;
    const requestId = `v2_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const requestOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Version': '2.0.0',
        'X-Request-ID': requestId,
        ...options?.headers,
      },
      signal: AbortSignal.timeout(this.timeout),
    };

    if (body && method !== 'GET') {
      requestOptions.body = JSON.stringify(body);
    }

    const startTime = Date.now();

    try {
      const response = await fetch(url, requestOptions);
      const processingTime = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;

        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        throw {
          message: errorData.message || `HTTP ${response.status}: ${response.statusText}`,
          code: `HTTP_${response.status}`,
          details: errorData,
          requestId,
          timestamp: new Date().toISOString()
        };
      }

      const responseText = await response.text();
      let responseData;

      try {
        responseData = JSON.parse(responseText);
      } catch {
        throw {
          message: 'Invalid JSON response from server',
          code: 'PARSE_ERROR',
          details: { responseText },
          requestId,
          timestamp: new Date().toISOString()
        };
      }

      // Validate response if requested
      if (options?.validateResponse !== false) {
        const validation = McpResponseSchema.safeParse(responseData);
        if (!validation.success) {
          console.warn('Response validation failed:', validation.error.issues);
          // Don't throw, just log warning for backward compatibility
        }
      }

      return {
        ...responseData,
        requestId: responseData.requestId || requestId,
        processingTime: responseData.processingTime || processingTime,
      };

    } catch (error: any) {
      if (error?.name === 'AbortError') {
        throw {
          message: `Request timeout after ${this.timeout}ms`,
          code: 'TIMEOUT',
          details: { timeout: this.timeout, url },
          requestId,
          timestamp: new Date().toISOString()
        };
      }
      throw error;
    }
  }

  // ================================
  // V2 MCP API METHODS
  // ================================

  async getHealth(): Promise<{ status: string; version: string; toolsAvailable: number }> {
    return this.executeWithRetry(async () => {
      const response = await this.makeRequest<{ status: string; version: string; toolsAvailable: number }>(
        'GET',
        '/v2/mcp/health'
      );
      return response.data || response;
    }, 'getHealth');
  }

  async listTools(): Promise<{ tools: string[] }> {
    return this.executeWithRetry(async () => {
      const response = await this.makeRequest<{ tools: string[] }>(
        'GET',
        '/v2/mcp/tools'
      );
      return response.data || { tools: [] };
    }, 'listTools');
  }

  async callTool<T = any>(toolName: string, args: Record<string, any> = {}): Promise<T> {
    return this.executeWithRetry(async () => {
      const response = await this.makeRequest<T>(
        'POST',
        `/v2/mcp/tools/${toolName}`,
        args
      );

      if (!response.success) {
        throw {
          message: response.error || `Tool ${toolName} failed`,
          code: 'TOOL_ERROR',
          details: { toolName, args, response },
          requestId: response.requestId,
          timestamp: new Date().toISOString()
        };
      }

      return response.data;
    }, `callTool:${toolName}`);
  }

  // ================================
  // SPECIFIC AIDIS TOOL METHODS
  // ================================

  async ping(message?: string): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.callTool('aidis_ping', message ? { message } : {});
  }

  async getStatus(): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.callTool('aidis_status');
  }

  async getCurrentProject(): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.callTool('project_current');
  }

  async listProjects(includeStats = false): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.callTool('project_list', { includeStats });
  }

  async switchProject(project: string): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.callTool('project_switch', { project });
  }

  async storeContext(content: string, type: string, tags?: string[]): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.callTool('context_store', { content, type, tags });
  }

  async searchContexts(query: string, limit?: number, type?: string): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.callTool('context_search', { query, limit, type });
  }

  async getRecentContexts(limit?: number, projectId?: string): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.callTool('context_get_recent', { limit, projectId });
  }

  async getSessionStatus(): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.callTool('session_status');
  }

  async assignSession(projectName: string): Promise<{ content: Array<{ type: string; text: string }> }> {
    return this.callTool('session_assign', { projectName });
  }

  // ================================
  // UTILITY METHODS
  // ================================

  getRequestMetrics(): {
    baseUrl: string;
    timeout: number;
    retryConfig: RetryConfig;
  } {
    return {
      baseUrl: this.baseUrl,
      timeout: this.timeout,
      retryConfig: this.retryConfig,
    };
  }

  updateConfig(config: {
    baseUrl?: string;
    timeout?: number;
    retryConfig?: Partial<RetryConfig>;
  }): void {
    if (config.baseUrl) this.baseUrl = config.baseUrl;
    if (config.timeout) this.timeout = config.timeout;
    if (config.retryConfig) {
      this.retryConfig = { ...this.retryConfig, ...config.retryConfig };
    }
  }
}

// ================================
// SINGLETON INSTANCE & EXPORTS
// ================================

export const aidisApi = new AidisApiClient();

// Factory function for custom configurations
export const createAidisApiClient = (config?: {
  baseUrl?: string;
  timeout?: number;
  retryConfig?: Partial<RetryConfig>;
}) => new AidisApiClient(config);

export default aidisApi;