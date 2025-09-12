#!/usr/bin/env npx tsx

/**
 * AIDIS MCP Server Performance Baseline Test
 * Comprehensive performance measurement of all 96 MCP tools
 */

import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface PerformanceMetric {
  tool: string;
  category: string;
  responseTime: number;
  success: boolean;
  errorMessage?: string;
  memoryBefore: number;
  memoryAfter: number;
}

interface SystemMetrics {
  timestamp: string;
  memoryUsage: number;
  cpuUsage: number;
  uptime: number;
}

class PerformanceBaseline {
  private metrics: PerformanceMetric[] = [];
  private systemMetrics: SystemMetrics[] = [];
  private startTime: number = Date.now();

  // Define all 96 MCP tools organized by category
  private readonly toolCategories = {
    'System Health': [
      'aidis_ping',
      'aidis_status'
    ],
    'Navigation': [
      'aidis_help',
      'aidis_explain',
      'aidis_examples'
    ],
    'Context Management': [
      'context_store',
      'context_search',
      'context_get_recent',
      'context_stats'
    ],
    'Project Management': [
      'project_list',
      'project_create',
      'project_switch',
      'project_current',
      'project_info',
      'project_insights'
    ],
    'Session Management': [
      'session_assign',
      'session_status',
      'session_new',
      'session_update',
      'session_details'
    ],
    'Naming Registry': [
      'naming_register',
      'naming_check',
      'naming_suggest',
      'naming_stats'
    ],
    'Technical Decisions': [
      'decision_record',
      'decision_search',
      'decision_update',
      'decision_stats'
    ],
    'Task Management': [
      'task_create',
      'task_list',
      'task_update',
      'task_details'
    ],
    'Code Analysis': [
      'code_analyze',
      'code_components',
      'code_dependencies',
      'code_impact',
      'code_stats'
    ],
    'Smart Search & AI': [
      'smart_search',
      'get_recommendations'
    ],
    'Code Complexity': [
      'complexity_analyze_files',
      'complexity_get_dashboard',
      'complexity_get_file_metrics',
      'complexity_get_function_metrics',
      'complexity_get_hotspots',
      'complexity_get_alerts',
      'complexity_acknowledge_alert',
      'complexity_resolve_alert',
      'complexity_get_refactoring_opportunities',
      'complexity_get_trends',
      'complexity_get_technical_debt',
      'complexity_analyze_commit',
      'complexity_set_thresholds',
      'complexity_get_performance',
      'complexity_start_tracking',
      'complexity_stop_tracking'
    ],
    'Development Metrics': [
      'metrics_collect_project',
      'metrics_get_dashboard',
      'metrics_get_core_metrics',
      'metrics_get_pattern_intelligence',
      'metrics_get_productivity_health',
      'metrics_get_alerts',
      'metrics_acknowledge_alert',
      'metrics_resolve_alert',
      'metrics_get_trends',
      'metrics_get_performance',
      'metrics_start_collection',
      'metrics_stop_collection'
    ],
    'Metrics Aggregation': [
      'metrics_aggregate_projects',
      'metrics_aggregate_timeline',
      'metrics_calculate_correlations',
      'metrics_get_executive_summary',
      'metrics_export_data'
    ],
    'Pattern Detection': [
      'pattern_detection_start',
      'pattern_detection_stop',
      'pattern_detection_status',
      'pattern_detect_commits',
      'pattern_track_git_activity',
      'pattern_get_alerts',
      'pattern_get_session_insights'
    ],
    'Pattern Analysis': [
      'pattern_analyze_project',
      'pattern_analyze_session',
      'pattern_analyze_commit',
      'pattern_get_discovered',
      'pattern_get_insights',
      'pattern_get_trends',
      'pattern_get_correlations',
      'pattern_get_anomalies',
      'pattern_get_recommendations',
      'pattern_get_performance'
    ],
    'Outcome Tracking': [
      'outcome_record',
      'outcome_track_metric',
      'outcome_analyze_impact',
      'outcome_conduct_retrospective',
      'outcome_get_insights',
      'outcome_get_analytics',
      'outcome_predict_success'
    ],
    'Git Integration': [
      'git_session_commits',
      'git_commit_sessions',
      'git_correlate_session'
    ]
  };

  // Sample parameters for each tool type
  private getToolParameters(tool: string): any {
    const sampleParams: { [key: string]: any } = {
      // System Health
      'aidis_ping': { message: 'Performance test ping' },
      'aidis_status': {},
      
      // Navigation
      'aidis_help': {},
      'aidis_explain': { toolName: 'aidis_ping' },
      'aidis_examples': { toolName: 'context_store' },
      
      // Context Management
      'context_store': { content: 'Performance test context', type: 'code' },
      'context_search': { query: 'test' },
      'context_get_recent': { limit: 5 },
      'context_stats': {},
      
      // Project Management
      'project_list': {},
      'project_current': {},
      'project_info': { project: 'default' },
      'project_insights': {},
      
      // Session Management
      'session_status': {},
      'session_details': { sessionId: 'current' },
      
      // Naming Registry
      'naming_check': { entityType: 'function', proposedName: 'testFunction' },
      'naming_stats': {},
      
      // Technical Decisions
      'decision_search': {},
      'decision_stats': {},
      
      // Task Management
      'task_list': {},
      
      // Code Analysis
      'code_stats': {},
      'code_components': {},
      
      // Smart Search
      'smart_search': { query: 'test' },
      'get_recommendations': { context: 'performance testing' },
      
      // Complexity
      'complexity_get_performance': {},
      'complexity_get_alerts': {},
      
      // Metrics
      'metrics_get_performance': {},
      'metrics_get_alerts': {},
      
      // Pattern Detection
      'pattern_detection_status': {},
      'pattern_get_performance': {},
      
      // Git Integration
      'git_session_commits': {}
    };
    
    return sampleParams[tool] || {};
  }

  private async getMemoryUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync("ps -o rss= -p $(pgrep -f 'npx tsx.*server.ts' | head -1)");
      return parseInt(stdout.trim()) * 1024; // Convert KB to bytes
    } catch (error) {
      console.warn('Could not get memory usage:', error);
      return 0;
    }
  }

  private async getCPUUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync("ps -o pcpu= -p $(pgrep -f 'npx tsx.*server.ts' | head -1)");
      return parseFloat(stdout.trim());
    } catch (error) {
      console.warn('Could not get CPU usage:', error);
      return 0;
    }
  }

  private async testMCPTool(tool: string, category: string): Promise<PerformanceMetric> {
    const params = this.getToolParameters(tool);
    const memoryBefore = await this.getMemoryUsage();
    const startTime = process.hrtime.bigint();
    
    try {
      // Create MCP request payload
      const payload = {
        method: `mcp__aidis__${tool}`,
        params
      };
      
      // Make HTTP request to MCP bridge
      const response = await fetch('http://localhost:8080/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000; // Convert to ms
      const memoryAfter = await this.getMemoryUsage();
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      return {
        tool,
        category,
        responseTime,
        success: true,
        memoryBefore,
        memoryAfter
      };
      
    } catch (error) {
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000;
      const memoryAfter = await this.getMemoryUsage();
      
      return {
        tool,
        category,
        responseTime,
        success: false,
        errorMessage: error instanceof Error ? error.message : String(error),
        memoryBefore,
        memoryAfter
      };
    }
  }

  private async collectSystemMetrics(): Promise<void> {
    const memory = await this.getMemoryUsage();
    const cpu = await this.getCPUUsage();
    
    this.systemMetrics.push({
      timestamp: new Date().toISOString(),
      memoryUsage: memory,
      cpuUsage: cpu,
      uptime: Date.now() - this.startTime
    });
  }

  private async testHealthEndpoints(): Promise<{ endpoint: string; responseTime: number; status: number }[]> {
    const endpoints = [
      'http://localhost:8080/healthz',
      'http://localhost:8080/readyz'
    ];
    
    const results = [];
    
    for (const endpoint of endpoints) {
      const startTime = process.hrtime.bigint();
      try {
        const response = await fetch(endpoint);
        const endTime = process.hrtime.bigint();
        const responseTime = Number(endTime - startTime) / 1000000;
        
        results.push({
          endpoint,
          responseTime,
          status: response.status
        });
      } catch (error) {
        const endTime = process.hrtime.bigint();
        const responseTime = Number(endTime - startTime) / 1000000;
        
        results.push({
          endpoint,
          responseTime: responseTime,
          status: 0
        });
      }
    }
    
    return results;
  }

  private async testDatabasePerformance(): Promise<any> {
    try {
      // Test basic database connectivity and simple queries
      const queries = [
        'SELECT current_database();',
        'SELECT COUNT(*) FROM contexts;',
        'SELECT COUNT(*) FROM projects;',
        'SELECT COUNT(*) FROM sessions;'
      ];
      
      const results = [];
      
      for (const query of queries) {
        const startTime = process.hrtime.bigint();
        try {
          const { stdout } = await execAsync(`psql -h localhost -p 5432 -d aidis_production -c "${query}" -t`);
          const endTime = process.hrtime.bigint();
          const responseTime = Number(endTime - startTime) / 1000000;
          
          results.push({
            query,
            responseTime,
            result: stdout.trim(),
            success: true
          });
        } catch (error) {
          const endTime = process.hrtime.bigint();
          const responseTime = Number(endTime - startTime) / 1000000;
          
          results.push({
            query,
            responseTime,
            success: false,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      return results;
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private calculateStats(values: number[]): { avg: number; p95: number; p99: number; min: number; max: number } {
    if (values.length === 0) return { avg: 0, p95: 0, p99: 0, min: 0, max: 0 };
    
    const sorted = [...values].sort((a, b) => a - b);
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const p95Index = Math.floor(sorted.length * 0.95);
    const p99Index = Math.floor(sorted.length * 0.99);
    
    return {
      avg: Math.round(avg * 100) / 100,
      p95: sorted[p95Index] || 0,
      p99: sorted[p99Index] || 0,
      min: sorted[0] || 0,
      max: sorted[sorted.length - 1] || 0
    };
  }

  async runPerformanceBaseline(): Promise<void> {
    console.log('🚀 Starting AIDIS MCP Server Performance Baseline...');
    console.log(`📊 Testing ${Object.values(this.toolCategories).flat().length} MCP tools across ${Object.keys(this.toolCategories).length} categories`);
    
    // Start system monitoring
    const monitoringInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, 10000); // Every 10 seconds
    
    try {
      // Test health endpoints first
      console.log('\n🏥 Testing Health Endpoints...');
      const healthResults = await this.testHealthEndpoints();
      
      // Test database performance
      console.log('💾 Testing Database Performance...');
      const dbResults = await this.testDatabasePerformance();
      
      // Test all MCP tools
      console.log('\n🧪 Testing MCP Tools Performance...');
      
      let toolCount = 0;
      const totalTools = Object.values(this.toolCategories).flat().length;
      
      for (const [category, tools] of Object.entries(this.toolCategories)) {
        console.log(`\n📂 Testing ${category} (${tools.length} tools)...`);
        
        for (const tool of tools) {
          toolCount++;
          process.stdout.write(`  [${toolCount}/${totalTools}] ${tool}... `);
          
          const metric = await this.testMCPTool(tool, category);
          this.metrics.push(metric);
          
          if (metric.success) {
            process.stdout.write(`✅ ${metric.responseTime.toFixed(1)}ms\n`);
          } else {
            process.stdout.write(`❌ ${metric.errorMessage}\n`);
          }
          
          // Small delay to prevent overwhelming the server
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      // Stop monitoring
      clearInterval(monitoringInterval);
      
      // Collect final system metrics
      await this.collectSystemMetrics();
      
      // Generate report
      console.log('\n📄 Generating Performance Baseline Report...');
      await this.generateReport(healthResults, dbResults);
      
      console.log('✅ Performance baseline complete! Report saved to baseline-mcp-performance.md');
      
    } catch (error) {
      clearInterval(monitoringInterval);
      console.error('❌ Performance baseline failed:', error);
      process.exit(1);
    }
  }

  private async generateReport(healthResults: any[], dbResults: any): Promise<void> {
    const timestamp = new Date().toISOString();
    const successfulMetrics = this.metrics.filter(m => m.success);
    const failedMetrics = this.metrics.filter(m => !m.success);
    
    // Calculate response time statistics
    const responseTimes = successfulMetrics.map(m => m.responseTime);
    const overallStats = this.calculateStats(responseTimes);
    
    // Calculate stats by category
    const categoryStats: { [key: string]: any } = {};
    for (const category of Object.keys(this.toolCategories)) {
      const categoryMetrics = successfulMetrics.filter(m => m.category === category);
      const categoryTimes = categoryMetrics.map(m => m.responseTime);
      categoryStats[category] = {
        ...this.calculateStats(categoryTimes),
        toolCount: categoryMetrics.length,
        successRate: categoryMetrics.length / this.metrics.filter(m => m.category === category).length * 100
      };
    }
    
    // Calculate memory usage stats
    const memoryUsages = this.systemMetrics.map(m => m.memoryUsage).filter(m => m > 0);
    const memoryStats = this.calculateStats(memoryUsages);
    
    // Find slowest tools
    const slowestTools = successfulMetrics
      .sort((a, b) => b.responseTime - a.responseTime)
      .slice(0, 10);
    
    const report = `# AIDIS MCP Server Performance Baseline Report

**Generated**: ${timestamp}  
**Test Duration**: ${Math.round((Date.now() - this.startTime) / 1000)}s  
**Total Tools Tested**: ${this.metrics.length}/96

---

## Executive Summary

✅ **Success Rate**: ${Math.round(successfulMetrics.length / this.metrics.length * 100)}% (${successfulMetrics.length}/${this.metrics.length} tools)  
⚡ **Average Response Time**: ${overallStats.avg}ms  
📊 **P95 Response Time**: ${overallStats.p95}ms  
📊 **P99 Response Time**: ${overallStats.p99}ms  
💾 **Average Memory Usage**: ${Math.round(memoryStats.avg / 1024 / 1024)}MB  
💾 **Peak Memory Usage**: ${Math.round(memoryStats.max / 1024 / 1024)}MB

---

## Response Time Statistics

### Overall Performance
| Metric | Value |
|--------|--------|
| Average | ${overallStats.avg}ms |
| Median | ${this.calculateStats(responseTimes).avg}ms |
| P95 | ${overallStats.p95}ms |
| P99 | ${overallStats.p99}ms |
| Min | ${overallStats.min}ms |
| Max | ${overallStats.max}ms |

### Performance by Category
| Category | Avg (ms) | P95 (ms) | Tools | Success Rate |
|----------|----------|----------|-------|--------------|
${Object.entries(categoryStats).map(([category, stats]) => 
  `| ${category} | ${stats.avg} | ${stats.p95} | ${stats.toolCount} | ${Math.round(stats.successRate)}% |`
).join('\n')}

---

## Memory Usage Analysis

| Metric | Value |
|--------|--------|
| Average Usage | ${Math.round(memoryStats.avg / 1024 / 1024)}MB |
| Peak Usage | ${Math.round(memoryStats.max / 1024 / 1024)}MB |
| Memory Growth | ${memoryUsages.length > 1 ? Math.round((memoryUsages[memoryUsages.length - 1] - memoryUsages[0]) / 1024 / 1024) : 0}MB |

### Memory Usage Over Time
${this.systemMetrics.map(m => 
  `- ${m.timestamp}: ${Math.round(m.memoryUsage / 1024 / 1024)}MB (CPU: ${m.cpuUsage}%)`
).join('\n')}

---

## Health Endpoints Performance

${healthResults.map(result => 
  `- **${result.endpoint}**: ${result.responseTime.toFixed(1)}ms (Status: ${result.status})`
).join('\n')}

---

## Database Performance

${Array.isArray(dbResults) ? dbResults.map(result => 
  `- **${result.query}**: ${result.responseTime.toFixed(1)}ms ${result.success ? '✅' : '❌'}`
).join('\n') : `❌ Database test failed: ${dbResults.error}`}

---

## Slowest Tools (Top 10)

${slowestTools.map((tool, index) => 
  `${index + 1}. **${tool.tool}** (${tool.category}): ${tool.responseTime.toFixed(1)}ms`
).join('\n')}

---

## Failed Tools

${failedMetrics.length > 0 ? 
  failedMetrics.map(tool => 
    `- **${tool.tool}** (${tool.category}): ${tool.errorMessage}`
  ).join('\n') 
  : 'No tool failures detected ✅'}

---

## Performance Bottlenecks Identified

${this.identifyBottlenecks(overallStats, categoryStats, memoryStats)}

---

## Recommendations

${this.generateRecommendations(overallStats, categoryStats, memoryStats, failedMetrics)}

---

## Raw Performance Data

### Detailed Tool Results
${successfulMetrics.map(tool => 
  `- **${tool.tool}**: ${tool.responseTime.toFixed(2)}ms (Memory: ${Math.round((tool.memoryAfter - tool.memoryBefore) / 1024)}KB delta)`
).join('\n')}

---

**Baseline Complete**: ${timestamp}  
**Next Baseline**: Recommended in 24-48 hours for trend analysis
`;

    fs.writeFileSync('/home/ridgetop/aidis/baseline-mcp-performance.md', report);
  }

  private identifyBottlenecks(overallStats: any, categoryStats: any, memoryStats: any): string {
    const bottlenecks = [];
    
    if (overallStats.p95 > 1000) {
      bottlenecks.push('- ⚠️ **High P95 latency**: Some tools taking >1s to respond');
    }
    
    if (memoryStats.max > 500 * 1024 * 1024) { // 500MB
      bottlenecks.push('- ⚠️ **High memory usage**: Peak memory usage exceeds 500MB');
    }
    
    // Find slowest categories
    const slowCategories = Object.entries(categoryStats)
      .filter(([, stats]: [string, any]) => stats.avg > 500)
      .map(([category]) => category);
    
    if (slowCategories.length > 0) {
      bottlenecks.push(`- ⚠️ **Slow categories**: ${slowCategories.join(', ')} showing elevated response times`);
    }
    
    return bottlenecks.length > 0 ? bottlenecks.join('\n') : '✅ No significant performance bottlenecks detected';
  }

  private generateRecommendations(overallStats: any, categoryStats: any, memoryStats: any, failedMetrics: any[]): string {
    const recommendations = [];
    
    if (overallStats.avg > 200) {
      recommendations.push('- 🎯 **Optimize database queries**: Average response time >200ms suggests database optimization opportunities');
    }
    
    if (memoryStats.max > 300 * 1024 * 1024) {
      recommendations.push('- 🎯 **Memory optimization**: Consider implementing connection pooling and caching strategies');
    }
    
    if (failedMetrics.length > 5) {
      recommendations.push('- 🎯 **Error handling**: High failure rate suggests need for improved error handling and parameter validation');
    }
    
    recommendations.push('- 📊 **Monitoring**: Implement continuous performance monitoring with alerting');
    recommendations.push('- 🔄 **Regular baselines**: Run performance tests weekly to track trends');
    
    return recommendations.join('\n');
  }
}

// Run the performance baseline
if (require.main === module) {
  const baseline = new PerformanceBaseline();
  baseline.runPerformanceBaseline().catch(console.error);
}

export default PerformanceBaseline;
