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
 * Format list response (for list/search tools)
 */
export function formatMcpList(
  items: any[],
  title: string,
  itemFormatter: (item: any) => string
): McpResponse {
  let text = `📋 ${title}\n`;
  text += `\nTotal: ${items.length}\n\n`;

  if (items.length === 0) {
    text += 'No items found.\n';
  } else {
    items.forEach((item, index) => {
      text += `${index + 1}. ${itemFormatter(item)}\n`;
    });
  }

  return {
    content: [{ type: 'text', text }]
  };
}

/**
 * Format statistics response
 */
export function formatMcpStats(
  stats: Record<string, any>,
  title: string
): McpResponse {
  let text = `📊 ${title}\n\n`;

  Object.entries(stats).forEach(([key, value]) => {
    const label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
    text += `${label}: ${value}\n`;
  });

  return {
    content: [{ type: 'text', text }]
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
