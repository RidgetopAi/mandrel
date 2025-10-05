/**
 * TR001-5 & TR004-5: MCP Response Handler with Grammar Parser and Error Boundaries
 * Integrates robust parsing with existing AIDIS MCP infrastructure
 */

import { McpParser, McpResponse } from '../parsers/mcpParser.js';
import { logger } from './logger.js';

export interface McpHandlerResult {
  success: boolean;
  data?: any;
  error?: string;
  contentType?: 'tool' | 'success' | 'error';
  originalResponse?: string;
}

/**
 * Enhanced MCP Response Handler with Error Boundaries
 * Replaces brittle JSON parsing with structured grammar validation
 */
export class McpResponseHandler {
  private static readonly RESPONSE_TIMEOUT = 30000; // 30 seconds
  private static readonly MAX_RETRIES = 3;
  private static readonly RETRY_BACKOFF = 1000; // 1 second

  /**
   * Process MCP response with error boundaries and parsing validation
   */
  static async processResponse(
    rawResponse: string,
    context: { toolName?: string; requestId?: string } = {}
  ): Promise<McpHandlerResult> {
    const { toolName = 'unknown', requestId = 'unknown' } = context;

    try {
      // Input validation
      if (typeof rawResponse !== 'string') {
        logger.warn('Non-string response received', { toolName, requestId, type: typeof rawResponse });
        return {
          success: false,
          error: 'Invalid response type: expected string',
          originalResponse: String(rawResponse)
        };
      }

      // Parse with grammar validation
      const parseResult = McpParser.parseResponse(rawResponse);

      if (!parseResult.success) {
        logger.warn('MCP response parsing failed', {
          toolName,
          requestId,
          error: parseResult.error,
          responseLength: rawResponse.length,
          responsePreview: rawResponse.substring(0, 200)
        });

        return {
          success: false,
          error: `Response parsing failed: ${parseResult.error}`,
          originalResponse: rawResponse
        };
      }

      // Determine response type
      const contentType = this.determineResponseType(parseResult.data);

      logger.debug('MCP response parsed successfully', {
        toolName,
        requestId,
        contentType,
        responseLength: rawResponse.length
      });

      return {
        success: true,
        data: parseResult.data,
        contentType,
        originalResponse: rawResponse
      };

    } catch (error) {
      const err = error as Error;
      logger.error('Critical error in MCP response processing', {
        toolName,
        requestId,
        error: err.message,
        stack: err.stack,
        responseLength: rawResponse?.length || 0
      });

      return {
        success: false,
        error: `Critical processing error: ${err.message}`,
        originalResponse: rawResponse
      };
    }
  }

  /**
   * Process tool response with content validation
   */
  static async processToolResponse(
    rawResponse: string,
    context: { toolName?: string; requestId?: string } = {}
  ): Promise<McpHandlerResult> {
    const result = await this.processResponse(rawResponse, context);

    if (!result.success) {
      return result;
    }

    // Validate tool response structure
    const toolParseResult = McpParser.parseToolResponse(rawResponse);
    if (!toolParseResult.success) {
      logger.warn('Tool response validation failed', {
        ...context,
        error: toolParseResult.error
      });

      return {
        success: false,
        error: `Tool response validation failed: ${toolParseResult.error}`,
        originalResponse: rawResponse
      };
    }

    // Additional content validation
    const contentValidation = McpParser.validateContent(toolParseResult.data.content);
    if (!contentValidation.valid) {
      logger.warn('Tool content validation failed', {
        ...context,
        error: contentValidation.error
      });

      return {
        success: false,
        error: `Content validation failed: ${contentValidation.error}`,
        originalResponse: rawResponse
      };
    }

    return {
      success: true,
      data: toolParseResult.data,
      contentType: 'tool',
      originalResponse: rawResponse
    };
  }

  /**
   * Extract text content with error handling
   */
  static extractTextContent(mcpResponse: McpResponse): string[] {
    try {
      return McpParser.extractTextContent(mcpResponse);
    } catch (error) {
      const err = error as Error;
      logger.error('Error extracting text content', { error: err.message });
      return [];
    }
  }

  /**
   * Extract all content with error handling
   */
  static extractAllContent(mcpResponse: McpResponse): Array<{ type: string; content: any }> {
    try {
      return McpParser.extractAllContent(mcpResponse);
    } catch (error) {
      const err = error as Error;
      logger.error('Error extracting all content', { error: err.message });
      return [];
    }
  }

  /**
   * Retry mechanism for failed parsing
   */
  static async processWithRetry(
    rawResponse: string,
    context: { toolName?: string; requestId?: string } = {},
    maxRetries: number = this.MAX_RETRIES
  ): Promise<McpHandlerResult> {
    let lastError: string | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.processResponse(rawResponse, {
          ...context,
          requestId: `${context.requestId}-retry-${attempt}`
        });

        if (result.success) {
          if (attempt > 1) {
            logger.info('MCP response processing succeeded on retry', {
              ...context,
              attempt,
              maxRetries
            });
          }
          return result;
        }

        lastError = result.error;

        if (attempt < maxRetries) {
          const backoffTime = this.RETRY_BACKOFF * Math.pow(2, attempt - 1);
          logger.warn('MCP response processing failed, retrying', {
            ...context,
            attempt,
            maxRetries,
            backoffMs: backoffTime,
            error: result.error
          });

          await new Promise(resolve => setTimeout(resolve, backoffTime));
        }

      } catch (error) {
        const err = error as Error;
        lastError = err.message;
        logger.error('Critical error during retry attempt', {
          ...context,
          attempt,
          error: err.message
        });
      }
    }

    return {
      success: false,
      error: `All retry attempts failed. Last error: ${lastError}`,
      originalResponse: rawResponse
    };
  }

  /**
   * Create standardized MCP tool response
   */
  static createToolResponse(content: Array<{ type: string; text?: string; data?: any }>): string {
    try {
      const mcpContent = content.map(item => {
        switch (item.type) {
          case 'text':
            return { type: 'text', text: item.text || '' };
          case 'image':
            return {
              type: 'image',
              data: item.data?.data || item.data || '',
              mimeType: item.data?.mimeType || 'image/png'
            };
          case 'resource':
            return {
              type: 'resource',
              resource: {
                uri: item.data?.uri || item.data || '',
                name: item.data?.name,
                description: item.data?.description
              }
            };
          default:
            return { type: 'text', text: JSON.stringify(item) };
        }
      });

      const response = { content: mcpContent };
      return JSON.stringify(response);

    } catch (error) {
      const err = error as Error;
      logger.error('Error creating tool response', { error: err.message, content });
      return JSON.stringify({
        content: [{
          type: 'text',
          text: `Error creating response: ${err.message}`
        }]
      });
    }
  }

  /**
   * Create standardized MCP success response
   */
  static createSuccessResponse(data: any): string {
    try {
      return JSON.stringify({
        success: true,
        data: data
      });
    } catch (error) {
      const err = error as Error;
      logger.error('Error creating success response', { error: err.message, data });
      return JSON.stringify({
        success: false,
        error: `Error serializing response: ${err.message}`
      });
    }
  }

  /**
   * Create standardized MCP error response
   */
  static createErrorResponse(error: string): string {
    try {
      return JSON.stringify({
        success: false,
        error: error
      });
    } catch (serializationError) {
      const err = serializationError as Error;
      logger.error('Error creating error response', {
        error: err.message,
        originalError: error
      });
      return JSON.stringify({
        success: false,
        error: 'Internal error creating error response'
      });
    }
  }

  /**
   * Determine response type from parsed data
   */
  private static determineResponseType(data: McpResponse): 'tool' | 'success' | 'error' {
    if ('content' in data) {
      return 'tool';
    }
    if ('success' in data) {
      return data.success ? 'success' : 'error';
    }
    return 'tool'; // Default assumption
  }

  /**
   * Validate response timing and size constraints
   */
  static validateResponseConstraints(
    rawResponse: string,
    context: { startTime?: number; toolName?: string } = {}
  ): { valid: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // Size validation
    const responseSizeKB = rawResponse.length / 1024;
    if (responseSizeKB > 1024) { // 1MB
      warnings.push(`Large response: ${responseSizeKB.toFixed(2)}KB`);
    }

    // Timing validation
    if (context.startTime) {
      const processingTime = Date.now() - context.startTime;
      if (processingTime > this.RESPONSE_TIMEOUT) {
        warnings.push(`Slow response: ${processingTime}ms`);
      }
    }

    return {
      valid: warnings.length === 0,
      warnings
    };
  }
}

export default McpResponseHandler;