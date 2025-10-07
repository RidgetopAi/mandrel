import { handlePatternAnalyze } from '../handlers/patterns/patternAnalyze.js';
import { handlePatternInsights } from '../handlers/patterns/patternInsights.js';
import { formatMcpError } from '../utils/mcpFormatter.js';
import type { McpResponse } from '../utils/mcpFormatter.js';

/**
 * Pattern Detection Routes
 * Handles: pattern_analyze, pattern_insights
 */
export class PatternsRoutes {
  /**
   * Handle pattern analyze requests
   */
  async handleAnalyze(args: any): Promise<McpResponse> {
    try {
      return await handlePatternAnalyze(args);
    } catch (error) {
      return formatMcpError(error as Error, 'pattern_analyze');
    }
  }

  /**
   * Handle pattern insights requests
   */
  async handleInsights(args: any): Promise<McpResponse> {
    try {
      return await handlePatternInsights(args);
    } catch (error) {
      return formatMcpError(error as Error, 'pattern_insights');
    }
  }
}

export const patternsRoutes = new PatternsRoutes();
