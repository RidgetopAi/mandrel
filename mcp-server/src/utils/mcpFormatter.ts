/**
 * MCP Response Formatter
 * Standardizes response format across all MCP tools
 */

export interface McpResponse {
  content: Array<{
    type: 'text' | 'resource';
    text?: string;
    resource?: string;
  }>;
  isError?: boolean;
  /**
   * Legacy structured-data sibling for API consumers. Kept for back-compat; the
   * dual-channel seam (routes/index.ts) promotes it to `structuredContent` when a
   * handler set it. Prefer setting `structuredContent` directly in new code.
   */
  data?: any;
  /**
   * MCP DUAL-CHANNEL OUTPUT (task 2c412458): the machine-readable JSON object that
   * conforms to the tool's declared `outputSchema`. RAW field values only — NEVER
   * marked-up text (that is the root-cause fix for the markdown-in-values class).
   * Every tool emits one; the seam in routes/index.ts guarantees it's present.
   */
  structuredContent?: Record<string, any>;
}

/**
 * Strip lightweight markdown emphasis from a RAW value so structuredContent never
 * carries presentation markup (the markdown-in-values root-cause fix). Conservative:
 * only removes `**bold**`/`__bold__`/`*italic*`/`_italic_` wrappers and backticks;
 * leaves all other characters intact. Non-strings pass through unchanged.
 */
export function rawValue<T>(value: T): T {
  if (typeof value !== 'string') return value;
  return value
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1') as unknown as T;
}

export interface FormatOptions {
  emoji?: string;
  includeDetails?: boolean;
  detailFormatter?: (data: any) => string;
}

/**
 * Format successful MCP response with data
 */
export function formatMcpResponse(
  result: any,
  successMessage: string,
  options?: FormatOptions
): McpResponse {
  const emoji = options?.emoji || '✅';
  const includeDetails = options?.includeDetails ?? true;

  let text = `${emoji} ${successMessage}\n`;

  if (includeDetails && result) {
    if (options?.detailFormatter) {
      text += '\n' + options.detailFormatter(result);
    } else {
      text += '\n' + formatDefaultDetails(result);
    }
  }

  return {
    content: [{ type: 'text', text }]
  };
}

/**
 * Format error MCP response
 */
export function formatMcpError(
  error: Error | string,
  context?: string
): McpResponse {
  const message = typeof error === 'string' ? error : error.message;
  const contextStr = context ? `\n\nContext: ${context}` : '';

  return {
    content: [{
      type: 'text',
      text: `❌ Error: ${message}${contextStr}`
    }],
    isError: true
  };
}

/**
 * Default detail formatter
 */
function formatDefaultDetails(data: any): string {
  if (typeof data === 'string') return data;
  if (typeof data === 'number' || typeof data === 'boolean') return String(data);

  // Format object properties
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value !== null && value !== undefined) {
      const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
      lines.push(`${label}: ${formatValue(value)}`);
    }
  }
  return lines.join('\n');
}

function formatValue(value: any): string {
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}
