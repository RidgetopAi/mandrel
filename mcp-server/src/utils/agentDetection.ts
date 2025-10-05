/**
 * Agent Type Detection Utility
 *
 * Detects which AI coding assistant is running the MCP session
 * based on environment variables and other context clues.
 */

export interface AgentInfo {
  type: string;           // Machine-readable: 'claude-code', 'cline', etc.
  displayName: string;    // Human-readable: 'Claude Code', 'Cline', etc.
  version?: string;       // Optional version info
  confidence: 'high' | 'medium' | 'low';  // Detection confidence
}

/**
 * Detect agent type from environment variables
 *
 * Detection priority:
 * 1. Explicit agent environment variables (CLAUDECODE, CLINE, etc.)
 * 2. TERM_PROGRAM and related context
 * 3. Generic MCP client fallback
 *
 * @returns AgentInfo object with type, displayName, and confidence
 */
export function detectAgentType(): AgentInfo {
  // Claude Code detection (HIGH confidence)
  if (process.env.CLAUDECODE === '1') {
    return {
      type: 'claude-code',
      displayName: 'Claude Code',
      version: process.env.CLAUDE_CODE_VERSION,
      confidence: 'high'
    };
  }

  if (process.env.CLAUDE_CODE_ENTRYPOINT) {
    return {
      type: 'claude-code',
      displayName: 'Claude Code',
      confidence: 'high'
    };
  }

  // Cline detection
  if (process.env.CLINE === '1' || process.env.CLINE_ACTIVE === 'true') {
    return {
      type: 'cline',
      displayName: 'Cline',
      version: process.env.CLINE_VERSION,
      confidence: 'high'
    };
  }

  // Roo Code detection
  if (process.env.ROO_CODE === '1' || process.env.ROO_ACTIVE === 'true') {
    return {
      type: 'roo-code',
      displayName: 'Roo Code',
      version: process.env.ROO_VERSION,
      confidence: 'high'
    };
  }

  // Windsurf detection
  if (process.env.WINDSURF === '1' || process.env.WINDSURF_ACTIVE === 'true') {
    return {
      type: 'windsurf',
      displayName: 'Windsurf',
      version: process.env.WINDSURF_VERSION,
      confidence: 'high'
    };
  }

  // Cursor detection
  if (process.env.CURSOR === '1') {
    return {
      type: 'cursor',
      displayName: 'Cursor',
      confidence: 'high'
    };
  }

  if (process.env.TERM_PROGRAM === 'cursor') {
    return {
      type: 'cursor',
      displayName: 'Cursor',
      confidence: 'medium'
    };
  }

  // Allow manual override via environment variable
  if (process.env.AIDIS_AGENT_TYPE && process.env.AIDIS_AGENT_DISPLAY_NAME) {
    return {
      type: process.env.AIDIS_AGENT_TYPE,
      displayName: process.env.AIDIS_AGENT_DISPLAY_NAME,
      confidence: 'high'
    };
  }

  // Generic MCP client fallback (LOW confidence)
  return {
    type: 'mcp-client',
    displayName: 'MCP Client',
    confidence: 'low'
  };
}

/**
 * Allow manual override of agent detection
 *
 * @param type Machine-readable agent type
 * @param displayName Human-readable display name
 * @returns AgentInfo with high confidence
 */
export function overrideAgentType(
  type: string,
  displayName: string
): AgentInfo {
  return {
    type,
    displayName,
    confidence: 'high'
  };
}

/**
 * Get agent info with metadata enrichment
 * Includes detection metadata for debugging and analytics
 *
 * @returns AgentInfo with additional metadata
 */
export function getAgentInfo(): AgentInfo & { metadata: Record<string, any> } {
  const agentInfo = detectAgentType();

  return {
    ...agentInfo,
    metadata: {
      detection_time: new Date().toISOString(),
      environment_vars: {
        claudecode: process.env.CLAUDECODE,
        cline: process.env.CLINE,
        roo_code: process.env.ROO_CODE,
        windsurf: process.env.WINDSURF,
        cursor: process.env.CURSOR,
        term_program: process.env.TERM_PROGRAM,
        term_program_version: process.env.TERM_PROGRAM_VERSION
      }
    }
  };
}

/**
 * Map old agent type names to new standardized names
 * Provides backward compatibility for existing data
 *
 * @param oldType Legacy agent type string
 * @returns Standardized agent type
 */
export function normalizeAgentType(oldType: string): string {
  const mapping: Record<string, string> = {
    'claude-code-agent': 'claude-code',
    'web': 'web-ui',
    'mcp': 'mcp-client'
  };

  return mapping[oldType] || oldType;
}