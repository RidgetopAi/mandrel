/**
 * MCP Integration Service - Session-Project Correlation
 * 
 * This service handles the integration between AIDIS Command UI 
 * and the MCP server for session and project correlation.
 */

import { McpService } from './mcp';

export interface MCPSession {
  sessionId: string;
  projectId?: string;
  projectName?: string;
  title?: string;
  description?: string;
  startedAt?: string;
  contextCount?: number;
  lastContextAt?: string;
  type?: string;
  duration?: number;
}

class MCPIntegrationService {
  /**
   * Get current session from MCP server
   */
  static async getCurrentSession(): Promise<MCPSession | null> {
    try {
      console.log('[MCP Integration] Getting current session status...');
      
      // Call the AIDIS MCP session_status tool
      const result = await McpService.callTool('session_status', {});
      
      if (!result.success || !result.data) {
        console.log('[MCP Integration] No session data from MCP server');
        return null;
      }
      
      // Parse the session_status text response
      const sessionData = await this.parseSessionStatus(result.data);
      
      if (!sessionData) {
        console.log('[MCP Integration] Could not parse session data');
        return null;
      }
      
      console.log('[MCP Integration] Current session:', sessionData);
      return sessionData;
    } catch (error) {
      console.error('[MCP Integration] Failed to get current session:', error);
      return null;
    }
  }

  /**
   * Parse session_status text response from AIDIS MCP
   */
  private static async parseSessionStatus(text: string): Promise<MCPSession | null> {
    try {
      if (typeof text !== 'string') {
        console.warn('[MCP Integration] Expected text response, got:', typeof text);
        return null;
      }

      // Look for session ID pattern: 🆔 Session ID: 163125b3...
      const sessionIdMatch = text.match(/🆔\s*Session ID:\s*([a-f0-9-]+)/);
      if (!sessionIdMatch) {
        console.log('[MCP Integration] No session ID found in response');
        return null;
      }

      const sessionId = sessionIdMatch[1];

      // Extract project name: 🏢 Project: aidis-bootstrap
      const projectMatch = text.match(/🏢\s*Project:\s*([^\n\r]+)/);
      const projectName = projectMatch ? projectMatch[1].trim() : 'Unknown';

      // Extract session type: 🏷️ Type: claude-code-agent
      const typeMatch = text.match(/🏷️\s*Type:\s*([^\n\r]+)/);
      const type = typeMatch ? typeMatch[1].trim() : 'unknown';

      // Extract start time: ⏰ Started: 9/12/2025, 11:12:53 AM
      const startedMatch = text.match(/⏰\s*Started:\s*([^\n\r]+)/);
      let startedAt = '';
      if (startedMatch) {
        try {
          // Convert the displayed date format to ISO
          const dateStr = startedMatch[1].trim();
          const date = new Date(dateStr);
          startedAt = date.toISOString();
        } catch (e) {
          console.warn('[MCP Integration] Could not parse start date:', startedMatch[1]);
          startedAt = new Date().toISOString();
        }
      }

      // Extract duration: ⏱️ Duration: 186 minutes
      const durationMatch = text.match(/⏱️\s*Duration:\s*(\d+)\s*minutes/);
      const duration = durationMatch ? parseInt(durationMatch[1]) : 0;

      // Extract context count: 📝 Contexts: 5
      const contextMatch = text.match(/📝\s*Contexts:\s*(\d+)/);
      const contextCount = contextMatch ? parseInt(contextMatch[1]) : 0;

      // Extract decisions count: 🎯 Decisions: 0
      const decisionsMatch = text.match(/🎯\s*Decisions:\s*(\d+)/);
      const decisionsCount = decisionsMatch ? parseInt(decisionsMatch[1]) : 0;

      // Create a descriptive title based on project and type
      const title = `${type} session - ${projectName}`;
      const description = `Session with ${contextCount} contexts and ${decisionsCount} decisions`;

      // Resolve project name to actual project UUID
      const projectId = await this.resolveProjectNameToId(projectName);

      const session: MCPSession = {
        sessionId,
        projectId,
        projectName,
        title,
        description,
        startedAt,
        contextCount,
        lastContextAt: startedAt, // Use start time as fallback
        type,
        duration
      };

      console.log('[MCP Integration] Parsed session:', session);
      return session;
    } catch (error) {
      console.error('[MCP Integration] Error parsing session status:', error);
      return null;
    }
  }

  /**
   * Get current project from MCP server
   */
  static async getCurrentProject(): Promise<{ id: string; name: string } | null> {
    try {
      console.log('[MCP Integration] Getting current project...');
      
      const result = await McpService.callTool('project_current', {});
      
      if (!result.success || !result.data) {
        console.log('[MCP Integration] No project data from MCP server');
        return null;
      }

      // Parse the project_current text response
      const projectData = this.parseProjectCurrent(result.data);
      
      console.log('[MCP Integration] Current project:', projectData);
      return projectData;
    } catch (error) {
      console.error('[MCP Integration] Failed to get current project:', error);
      return null;
    }
  }

  /**
   * Parse project_current text response from AIDIS MCP
   */
  private static parseProjectCurrent(text: string): { id: string; name: string } | null {
    try {
      if (typeof text !== 'string') {
        return null;
      }

      // Look for project name pattern: 🟢 Current Project: **aidis-bootstrap**
      const projectMatch = text.match(/🟢\s*Current Project:\s*\*\*([^*]+)\*\*/);
      if (!projectMatch) {
        return null;
      }

      const name = projectMatch[1].trim();
      const id = name.toLowerCase().replace(/\s+/g, '-');

      return { id, name };
    } catch (error) {
      console.error('[MCP Integration] Error parsing project current:', error);
      return null;
    }
  }

  /**
   * Test MCP connectivity
   */
  static async testConnection(): Promise<boolean> {
    try {
      const result = await McpService.callTool('mandrel_ping', { message: 'UI Integration Test' });
      return result.success;
    } catch (error) {
      console.error('[MCP Integration] Connection test failed:', error);
      return false;
    }
  }

  /**
   * Resolve project name to actual project UUID
   */
  private static async resolveProjectNameToId(projectName: string): Promise<string> {
    try {
      console.log(`[MCP Integration] Resolving project name "${projectName}" to UUID...`);
      
      // Call the AIDIS MCP project_list tool to get all projects
      const result = await McpService.callTool('project_list', {});
      
      if (!result.success || !result.data) {
        console.warn('[MCP Integration] Could not get project list from MCP server');
        return projectName; // Fallback to name
      }
      
      // Parse the project list response to find the project ID
      const projectId = this.parseProjectIdFromList(result.data, projectName);
      
      if (projectId) {
        console.log(`[MCP Integration] Resolved "${projectName}" to UUID: ${projectId}`);
        return projectId;
      } else {
        console.warn(`[MCP Integration] Could not find UUID for project "${projectName}"`);
        return projectName; // Fallback to name
      }
    } catch (error) {
      console.error(`[MCP Integration] Failed to resolve project name "${projectName}":`, error);
      return projectName; // Fallback to name
    }
  }

  /**
   * Parse project ID from project_list response
   */
  private static parseProjectIdFromList(text: string, projectName: string): string | null {
    try {
      // Look for the project entry with the specific name
      // Format: **project-name** ... 🆔 ID: uuid
      const projectRegex = new RegExp(`\\*\\*${projectName.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}\\*\\*[\\s\\S]*?🆔\\s*ID:\\s*([a-f0-9-]+)`, 'i');
      const match = text.match(projectRegex);
      
      if (match) {
        return match[1].trim();
      }
      
      return null;
    } catch (error) {
      console.error('[MCP Integration] Failed to parse project ID from list:', error);
      return null;
    }
  }
}
