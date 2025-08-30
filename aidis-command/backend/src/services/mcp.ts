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
        port: process.env.AIDIS_MCP_PORT || 8081,
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
              
              // Handle AIDIS response format
              if (parsed.isError) {
                reject(new Error(parsed.message || 'AIDIS MCP tool error'));
              } else {
                // Extract the actual result from AIDIS response
                let result = parsed.result !== undefined ? parsed.result : parsed;
                
                // Handle AIDIS text-based responses
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
                  } else {
                    // For other tools, return the text as-is for now
                    result = textResult;
                  }
                }
                
                resolve(result);
              }
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
