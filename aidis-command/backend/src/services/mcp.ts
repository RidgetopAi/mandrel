/**
 * MCP Service - Interface to AIDIS MCP Server
 * 
 * This service handles communication with the AIDIS MCP server
 * via HTTP endpoints at localhost:8080/mcp/tools/{toolName}
 */

import http from 'http';

export interface McpResult {
  success: boolean;
  data?: any;
  error?: string;
}

export class McpService {
  private static readonly REQUEST_TIMEOUT = 10000; // 10 seconds

  /**
   * Call an AIDIS MCP tool via HTTP endpoint
   */
  static async callTool(toolName: string, params: any): Promise<McpResult> {
    console.log(`[MCP] Calling ${toolName} with params:`, params);
    
    try {
      const result = await this.makeRequest(toolName, params);
      console.log(`[MCP] ${toolName} result:`, result);
      return {
        success: true,
        data: result
      };
    } catch (error) {
      console.error(`[MCP] ${toolName} failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Make HTTP request to AIDIS MCP server
   */
  private static async makeRequest(toolName: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ arguments: params });
      
      const options = {
        hostname: 'localhost',
        port: process.env.AIDIS_HTTP_PORT || process.env.AIDIS_MCP_PORT || process.env.PORT || 8080,
        path: `/mcp/tools/${toolName}`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });
        
        res.on('end', () => {
          try {
            if (res.statusCode === 200) {
              const parsed = JSON.parse(data);
              
              if (parsed.isError || parsed.success === false) {
                const message = parsed.error || parsed.message || 'AIDIS MCP tool error';
                reject(new Error(message));
                return;
              }

              // Extract the actual result from AIDIS response
              let result = parsed.result !== undefined ? parsed.result : parsed;

              // Check for structured data first (new format)
              if (result && result.data) {
                resolve(result.data);
                return;
              }

              // Handle AIDIS text-based responses (legacy format)
              if (result && result.content && result.content[0] && result.content[0].text) {
                const textResult = result.content[0].text;

                // Try to parse structured data from AIDIS text responses
                if (toolName === 'naming_stats') {
                  result = this.parseNamingStats(textResult);
                } else if (toolName === 'naming_check') {
                  result = this.parseNamingCheck(textResult);
                } else if (toolName === 'naming_suggest') {
                  result = this.parseNamingSuggest(textResult);
                } else if (toolName === 'decision_search') {
                  result = this.parseDecisionSearch(textResult);
                } else if (toolName === 'decision_stats') {
                  result = this.parseDecisionStats(textResult);
                } else if (toolName === 'project_insights') {
                  result = this.parseProjectInsights(textResult);
                } else {
                  // For other tools, return the text as-is for now
                  result = textResult;
                }
              }

              resolve(result);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.setTimeout(this.REQUEST_TIMEOUT);
      req.write(postData);
      req.end();
    });
  }

  /**
   * Parse naming statistics from AIDIS text response
   */
  private static parseNamingStats(text: string): any {
    const stats: any = {
      total_names: 0,
      compliance: 0,
      deprecated: 0,
      recent_activity: 0,
      by_type: {},
      by_project: {}
    };

    // Extract total names
    const totalMatch = text.match(/Total Names:\s*(\d+)/);
    if (totalMatch) stats.total_names = parseInt(totalMatch[1]);

    // Extract compliance
    const complianceMatch = text.match(/Convention Compliance:\s*(\d+)%/);
    if (complianceMatch) stats.compliance = parseInt(complianceMatch[1]);

    // Extract deprecated
    const deprecatedMatch = text.match(/Deprecated:\s*(\d+)/);
    if (deprecatedMatch) stats.deprecated = parseInt(deprecatedMatch[1]);

    // Extract recent activity
    const activityMatch = text.match(/Recent Activity:\s*(\d+)/);
    if (activityMatch) stats.recent_activity = parseInt(activityMatch[1]);

    // Extract by type
    const typeSection = text.match(/By Type:([\s\S]*?)(?:\n\n|$)/);
    if (typeSection) {
      const typeLines = typeSection[1].split('\n').filter(line => line.trim());
      for (const line of typeLines) {
        const typeMatch = line.match(/^\s*([^:]+):\s*(\d+)/);
        if (typeMatch) {
          stats.by_type[typeMatch[1].trim()] = parseInt(typeMatch[2]);
        }
      }
    }

    return stats;
  }

  /**
   * Parse naming check from AIDIS text response
   */
  private static parseNamingCheck(text: string): any {
    const available = text.toLowerCase().includes('available') || text.toLowerCase().includes('not registered');
    return {
      available,
      message: text
    };
  }

  /**
   * Parse naming suggestions from AIDIS text response
   */
  private static parseNamingSuggest(text: string): any {
    // For now, return the text and let the controller handle parsing
    // TODO: Implement proper parsing when AIDIS returns structured suggestions
    return {
      suggestions: [],
      message: text
    };
  }

  /**
   * Parse decision search from AIDIS text response
   */
  private static parseDecisionSearch(text: string): any {
    const result = {
      results: [] as any[],
      total: 0,
      page: 1,
      limit: 20
    };

    if (text.includes('No decisions found')) {
      return result;
    }

    // Parse the decisions from the text response
    // Format: "Found X technical decisions:"
    const totalMatch = text.match(/Found (\d+) technical decisions?:/);
    if (totalMatch) {
      result.total = parseInt(totalMatch[1]);
    }

    // Parse individual decisions
    const decisionBlocks = text.split(/\d+\.\s+\*\*/).slice(1);
    
    for (const block of decisionBlocks) {
      const decision = this.parseDecisionBlock(block.trim());
      if (decision) {
        result.results.push(decision);
      }
    }

    return result;
  }

  /**
   * Parse individual decision block from AIDIS text
   */
  private static parseDecisionBlock(block: string): any | null {
    try {
      // Extract decision type from first line (e.g., "ARCHITECTURE** - critical impact")
      const typeMatch = block.match(/^([A-Z]+)\*\*\s*-\s*([a-z]+)\s+impact/);
      if (!typeMatch) return null;

      const type = typeMatch[1];
      const impact = typeMatch[2];

      // Extract title (next line after emoji)
      const titleMatch = block.match(/📝\s+(.+)/);
      const title = titleMatch ? titleMatch[1].trim() : 'Untitled Decision';

      // Extract rationale/description
      const rationaleMatch = block.match(/💡\s+(.+)/);
      const rationale = rationaleMatch ? rationaleMatch[1].trim() : '';

      // Extract date and status
      const dateStatusMatch = block.match(/📅\s+(\d{4}-\d{2}-\d{2})\s+\|\s+Status:\s+([a-z]+)/);
      const date = dateStatusMatch ? dateStatusMatch[1] : new Date().toISOString().split('T')[0];
      const status = dateStatusMatch ? dateStatusMatch[2] : 'active';

      // Extract tags
      const tagsMatch = block.match(/🏷️\s+\[([^\]]*)\]/);
      const tags = tagsMatch && tagsMatch[1] ? tagsMatch[1].split(', ').filter(t => t.trim()) : [];

      // Extract alternatives info
      const alternativesMatch = block.match(/\((\d+)\s+alternatives?\s+considered\)/);
      const alternativesCount = alternativesMatch ? parseInt(alternativesMatch[1]) : 0;

      return {
        id: Date.now() + Math.random(), // Generate a temporary ID
        title,
        decision_type: type.toLowerCase(),
        impact_level: impact,
        rationale,
        status,
        created_at: `${date}T00:00:00.000Z`,
        updated_at: `${date}T00:00:00.000Z`,
        tags,
        alternatives: alternativesCount > 0 ? [`${alternativesCount} alternatives considered`] : [],
        problem: rationale, // Use rationale as problem description
        decision: title // Use title as the decision
      };
    } catch (error) {
      console.error('Error parsing decision block:', error);
      return null;
    }
  }

  /**
   * Parse decision statistics from AIDIS text response
   */
  private static parseDecisionStats(text: string): any {
    const stats: any = {
      total_decisions: 0,
      by_status: {},
      by_type: {},
      by_impact: {},
      recent_decisions: 0,
      success_rate: 0
    };

    // Extract total decisions
    const totalMatch = text.match(/📈 Total Decisions:\s*(\d+)/);
    if (totalMatch) stats.total_decisions = parseInt(totalMatch[1]);

    // Extract success rate
    const successMatch = text.match(/✅ Success Rate:\s*(\d+)%/);
    if (successMatch) stats.success_rate = parseInt(successMatch[1]);

    // Extract recent activity
    const activityMatch = text.match(/🕐 Recent Activity:\s*(\d+)/);
    if (activityMatch) stats.recent_decisions = parseInt(activityMatch[1]);

    // Extract by type
    const typeSection = text.match(/📋 By Type:([\s\S]*?)(?:\n\n|📊)/);
    if (typeSection) {
      const typeLines = typeSection[1].split('\n').filter(line => line.trim());
      for (const line of typeLines) {
        const typeMatch = line.match(/^\s*([^:]+):\s*(\d+)/);
        if (typeMatch) {
          stats.by_type[typeMatch[1].trim()] = parseInt(typeMatch[2]);
        }
      }
    }

    // Extract by status
    const statusSection = text.match(/📊 By Status:([\s\S]*?)(?:\n\n|⚡)/);
    if (statusSection) {
      const statusLines = statusSection[1].split('\n').filter(line => line.trim());
      for (const line of statusLines) {
        const statusMatch = line.match(/^\s*([^:]+):\s*(\d+)/);
        if (statusMatch) {
          stats.by_status[statusMatch[1].trim()] = parseInt(statusMatch[2]);
        }
      }
    }

    // Extract by impact
    const impactSection = text.match(/⚡ By Impact:([\s\S]*?)(?:\n\n|🎯|$)/);
    if (impactSection) {
      const impactLines = impactSection[1].split('\n').filter(line => line.trim());
      for (const line of impactLines) {
        const impactMatch = line.match(/^\s*([^:]+):\s*(\d+)/);
        if (impactMatch) {
          stats.by_impact[impactMatch[1].trim()] = parseInt(impactMatch[2]);
        }
      }
    }

    return stats;
  }

  /**
   * Parse project insights from AIDIS text response
   */
  private static parseProjectInsights(text: string): any {
    const insights: any = {
      projectHealth: {
        score: 0,
        level: 'unknown',
        components: 0,
        contexts: 0,
        decisions: 0,
        tasks: 0
      },
      teamEfficiency: {
        score: 0,
        level: 'unknown'
      },
      raw: text
    };

    // Extract health score - looks for patterns like "HEALTHY (80.76/100)"
    const healthMatch = text.match(/🟢\s*HEALTHY\s*\(([0-9.]+)\/100\)|🟡\s*MODERATE\s*\(([0-9.]+)\/100\)|🔴\s*POOR\s*\(([0-9.]+)\/100\)/);
    if (healthMatch) {
      const score = parseFloat(healthMatch[1] || healthMatch[2] || healthMatch[3]);
      insights.projectHealth.score = score;
      
      if (score >= 70) insights.projectHealth.level = 'healthy';
      else if (score >= 40) insights.projectHealth.level = 'moderate';
      else insights.projectHealth.level = 'poor';
    }

    // Extract team efficiency - looks for patterns like "🤝 Team Efficiency: 🟡 MODERATE (45%)"
    const efficiencyMatch = text.match(/🤝\s*Team Efficiency:\s*🟡\s*MODERATE\s*\((\d+)%\)|🟢\s*EFFICIENT\s*\((\d+)%\)|🔴\s*POOR\s*\((\d+)%\)/);
    if (efficiencyMatch) {
      const score = parseInt(efficiencyMatch[1] || efficiencyMatch[2] || efficiencyMatch[3]);
      insights.teamEfficiency.score = score;
      
      if (score >= 70) insights.teamEfficiency.level = 'efficient';
      else if (score >= 40) insights.teamEfficiency.level = 'moderate';
      else insights.teamEfficiency.level = 'poor';
    }

    // Extract component count
    const componentsMatch = text.match(/📦\s*Components:\s*(\d+)/);
    if (componentsMatch) {
      insights.projectHealth.components = parseInt(componentsMatch[1]);
    }

    // Extract context count
    const contextsMatch = text.match(/📝\s*Contexts:\s*(\d+)/);
    if (contextsMatch) {
      insights.projectHealth.contexts = parseInt(contextsMatch[1]);
    }

    // Extract decisions count
    const decisionsMatch = text.match(/🎯\s*Decisions:\s*(\d+)/);
    if (decisionsMatch) {
      insights.projectHealth.decisions = parseInt(decisionsMatch[1]);
    }

    // Extract tasks count
    const tasksMatch = text.match(/📋\s*Tasks:\s*(\d+)/);
    if (tasksMatch) {
      insights.projectHealth.tasks = parseInt(tasksMatch[1]);
    }

    return insights;
  }

  /**
   * Call an arbitrary MCP server endpoint (not a tool endpoint)
   * Used for REST API calls like /api/v2/projects/:id/set-primary
   */
  static async callMcpEndpoint(path: string, method: string = 'GET', body?: any): Promise<any> {
    return new Promise((resolve, reject) => {
      const postData = body ? JSON.stringify(body) : '';

      const options = {
        hostname: 'localhost',
        port: process.env.AIDIS_HTTP_PORT || process.env.AIDIS_MCP_PORT || process.env.PORT || 8080,
        path: path,
        method: method,
        headers: {
          'Content-Type': 'application/json',
          ...(postData ? { 'Content-Length': Buffer.byteLength(postData) } : {})
        }
      };

      const req = http.request(options, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              const parsed = JSON.parse(data);
              resolve(parsed);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${data}`));
            }
          } catch (parseError) {
            reject(new Error(`Failed to parse response: ${parseError}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      req.setTimeout(this.REQUEST_TIMEOUT);

      if (postData) {
        req.write(postData);
      }

      req.end();
    });
  }

  /**
   * Test AIDIS server connectivity
   */
  static async testConnection(): Promise<boolean> {
    try {
      await this.callTool('aidis_ping', { message: 'Connection test' });
      return true;
    } catch (error) {
      console.error('[MCP] Connection test failed:', error);
      return false;
    }
  }
}
