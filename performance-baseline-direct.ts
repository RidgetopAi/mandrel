#!/usr/bin/env npx tsx

/**
 * AIDIS Performance Baseline - Direct MCP Tool Testing
 * Tests response times for key MCP tools through HTTP endpoints
 */

import fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

interface ToolResult {
  tool: string;
  responseTime: number;
  success: boolean;
  error?: string;
  memoryBefore: number;
  memoryAfter: number;
}

interface SystemSnapshot {
  timestamp: string;
  memoryMB: number;
  cpuPercent: number;
}

class DirectPerformanceTest {
  private results: ToolResult[] = [];
  private systemSnapshots: SystemSnapshot[] = [];
  private startTime = Date.now();

  // Core tools to test for baseline
  private readonly coreTools = [
    // System Health
    'aidis_ping',
    'aidis_status',
    
    // Navigation
    'aidis_help',
    
    // Context Management
    'context_search',
    'context_get_recent',
    'context_stats',
    
    // Project Management
    'project_list',
    'project_current',
    'project_info',
    
    // Session Management
    'session_status',
    
    // Naming & Decisions
    'naming_stats',
    'decision_stats',
    
    // Code Analysis
    'code_stats',
    
    // Smart Search
    'smart_search',
    
    // Performance & Metrics
    'metrics_get_performance',
    'complexity_get_performance',
    'pattern_get_performance'
  ];

  private async getMemoryUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync("ps -o rss= -p $(pgrep -f 'npx tsx.*server.ts' | head -1)");
      return parseInt(stdout.trim()) * 1024; // KB to bytes
    } catch {
      return 0;
    }
  }

  private async getCPUUsage(): Promise<number> {
    try {
      const { stdout } = await execAsync("ps -o pcpu= -p $(pgrep -f 'npx tsx.*server.ts' | head -1)");
      return parseFloat(stdout.trim());
    } catch {
      return 0;
    }
  }

  private async captureSystemSnapshot(): Promise<void> {
    const memory = await this.getMemoryUsage();
    const cpu = await this.getCPUUsage();
    
    this.systemSnapshots.push({
      timestamp: new Date().toISOString(),
      memoryMB: Math.round(memory / 1024 / 1024),
      cpuPercent: cpu
    });
  }

  private getToolParameters(tool: string): any {
    const params: { [key: string]: any } = {
      'aidis_ping': { message: 'Performance baseline test' },
      'context_search': { query: 'test', limit: 5 },
      'context_get_recent': { limit: 5 },
      'project_info': { project: 'default' },
      'smart_search': { query: 'performance' },
      'session_details': { sessionId: 'current' }
    };
    
    return params[tool] || {};
  }

  private async testTool(toolName: string): Promise<ToolResult> {
    const memoryBefore = await this.getMemoryUsage();
    const startTime = process.hrtime.bigint();
    
    try {
      const params = this.getToolParameters(toolName);
      const response = await fetch(`http://localhost:8080/mcp/tools/${toolName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arguments: params })
      });
      
      const endTime = process.hrtime.bigint();
      const responseTime = Number(endTime - startTime) / 1000000; // ns to ms
      const memoryAfter = await this.getMemoryUsage();
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'Tool call failed');
      }
      
      return {
        tool: toolName,
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
        tool: toolName,
        responseTime,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        memoryBefore,
        memoryAfter
      };
    }
  }

  private async testHealthEndpoints(): Promise<any[]> {
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
          responseTime: Math.round(responseTime * 100) / 100,
          status: response.status,
          success: response.ok
        });
      } catch (error) {
        const endTime = process.hrtime.bigint();
        const responseTime = Number(endTime - startTime) / 1000000;
        
        results.push({
          endpoint,
          responseTime: Math.round(responseTime * 100) / 100,
          status: 0,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return results;
  }

  private async testDatabasePerformance(): Promise<any[]> {
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
          responseTime: Math.round(responseTime * 100) / 100,
          result: stdout.trim(),
          success: true
        });
      } catch (error) {
        const endTime = process.hrtime.bigint();
        const responseTime = Number(endTime - startTime) / 1000000;
        
        results.push({
          query,
          responseTime: Math.round(responseTime * 100) / 100,
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    return results;
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
    console.log('🚀 AIDIS MCP Performance Baseline Starting...');
    console.log(`📊 Testing ${this.coreTools.length} core MCP tools + system performance`);
    
    // Capture initial system state
    await this.captureSystemSnapshot();
    
    // Test health endpoints
    console.log('\n🏥 Testing Health Endpoints...');
    const healthResults = await this.testHealthEndpoints();
    healthResults.forEach(result => {
      console.log(`  ${result.endpoint}: ${result.responseTime}ms (${result.success ? '✅' : '❌'})`);
    });
    
    // Test database performance
    console.log('\n💾 Testing Database Performance...');
    const dbResults = await this.testDatabasePerformance();
    dbResults.forEach(result => {
      console.log(`  ${result.query}: ${result.responseTime}ms (${result.success ? '✅' : '❌'})`);
    });
    
    // Test core MCP tools
    console.log('\n🧪 Testing Core MCP Tools...');
    
    for (let i = 0; i < this.coreTools.length; i++) {
      const tool = this.coreTools[i];
      process.stdout.write(`  [${i + 1}/${this.coreTools.length}] ${tool}... `);
      
      const result = await this.testTool(tool);
      this.results.push(result);
      
      if (result.success) {
        process.stdout.write(`✅ ${result.responseTime.toFixed(1)}ms\n`);
      } else {
        process.stdout.write(`❌ ${result.error}\n`);
      }
      
      // Capture system snapshot every 3 tools
      if (i % 3 === 0) {
        await this.captureSystemSnapshot();
      }
      
      // Brief pause to prevent overwhelming
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Final system snapshot
    await this.captureSystemSnapshot();
    
    // Generate performance report
    console.log('\n📄 Generating Performance Report...');
    await this.generateReport(healthResults, dbResults);
    
    console.log('✅ Performance baseline complete! Saved to baseline-mcp-performance.md');
  }

  private async generateReport(healthResults: any[], dbResults: any[]): Promise<void> {
    const timestamp = new Date().toISOString();
    const testDuration = Math.round((Date.now() - this.startTime) / 1000);
    
    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    
    const responseTimes = successful.map(r => r.responseTime);
    const stats = this.calculateStats(responseTimes);
    
    // Memory analysis
    const memoryValues = this.systemSnapshots.map(s => s.memoryMB);
    const memoryStats = this.calculateStats(memoryValues);
    const memoryGrowth = memoryValues.length > 1 ? 
      memoryValues[memoryValues.length - 1] - memoryValues[0] : 0;
    
    // Identify performance issues
    const slowTools = successful.filter(r => r.responseTime > 500).sort((a, b) => b.responseTime - a.responseTime);
    
    const report = `# AIDIS MCP Server Performance Baseline Report

**Generated**: ${timestamp}  
**Test Duration**: ${testDuration}s  
**Tools Tested**: ${this.results.length} core tools  
**Success Rate**: ${Math.round(successful.length / this.results.length * 100)}%

---

## Executive Summary

⚡ **Overall Performance**: ${stats.avg < 200 ? 'Good' : stats.avg < 500 ? 'Acceptable' : 'Needs Attention'}  
📊 **Average Response Time**: ${stats.avg}ms  
📊 **95th Percentile**: ${stats.p95}ms  
📊 **99th Percentile**: ${stats.p99}ms  
💾 **Memory Usage**: ${memoryStats.avg}MB avg, ${memoryStats.max}MB peak  
🔄 **Memory Growth**: ${memoryGrowth > 0 ? '+' : ''}${memoryGrowth}MB during test

---

## Response Time Statistics

| Metric | Value | Assessment |
|--------|-------|------------|
| Average | ${stats.avg}ms | ${stats.avg < 200 ? '✅ Excellent' : stats.avg < 500 ? '⚠️ Acceptable' : '❌ Slow'} |
| P95 | ${stats.p95}ms | ${stats.p95 < 500 ? '✅ Good' : stats.p95 < 1000 ? '⚠️ Acceptable' : '❌ Poor'} |
| P99 | ${stats.p99}ms | ${stats.p99 < 1000 ? '✅ Good' : stats.p99 < 2000 ? '⚠️ Acceptable' : '❌ Poor'} |
| Min | ${stats.min}ms | Fastest response |
| Max | ${stats.max}ms | Slowest response |

---

## System Health Endpoints

| Endpoint | Response Time | Status |
|----------|---------------|---------|
${healthResults.map(r => `| ${r.endpoint} | ${r.responseTime}ms | ${r.success ? '✅' : '❌'} ${r.status} |`).join('\n')}

---

## Database Performance

| Query | Response Time | Status |
|-------|---------------|---------|
${dbResults.map(r => `| ${r.query} | ${r.responseTime}ms | ${r.success ? '✅' : '❌'} |`).join('\n')}

---

## Memory Usage Analysis

| Metric | Value |
|--------|-------|
| Initial Memory | ${memoryValues[0] || 0}MB |
| Peak Memory | ${memoryStats.max}MB |
| Average Memory | ${memoryStats.avg}MB |
| Memory Growth | ${memoryGrowth}MB |
| Memory Efficiency | ${memoryGrowth < 10 ? '✅ Stable' : memoryGrowth < 50 ? '⚠️ Moderate Growth' : '❌ High Growth'} |

### Memory Usage Timeline
${this.systemSnapshots.map(s => `- ${s.timestamp}: ${s.memoryMB}MB (CPU: ${s.cpuPercent}%)`).join('\n')}

---

## Tool Performance Details

### Successful Tools (${successful.length})
${successful.map(r => `- **${r.tool}**: ${r.responseTime.toFixed(1)}ms`).join('\n')}

${slowTools.length > 0 ? `### Slow Tools (>500ms)
${slowTools.map(r => `- **${r.tool}**: ${r.responseTime.toFixed(1)}ms ⚠️`).join('\n')}` : ''}

${failed.length > 0 ? `### Failed Tools (${failed.length})
${failed.map(r => `- **${r.tool}**: ${r.error} ❌`).join('\n')}` : '✅ No tool failures'}

---

## Performance Assessment

### Strengths
${this.generateStrengths(stats, memoryStats)}

### Areas for Improvement
${this.generateImprovements(stats, memoryStats, slowTools, failed)}

---

## Recommendations

${this.generateRecommendations(stats, memoryStats, failed.length)}

---

**Baseline Timestamp**: ${timestamp}  
**Next Recommended Test**: 24-48 hours for trend analysis
`;

    fs.writeFileSync('/home/ridgetop/aidis/baseline-mcp-performance.md', report);
  }

  private generateStrengths(stats: any, memoryStats: any): string {
    const strengths = [];
    
    if (stats.avg < 200) strengths.push('- ⚡ Excellent average response times (<200ms)');
    if (stats.p95 < 500) strengths.push('- 📊 Good 95th percentile performance (<500ms)');
    if (memoryStats.max < 300) strengths.push('- 💾 Efficient memory usage (<300MB peak)');
    if (this.systemSnapshots.length > 1) {
      const growth = this.systemSnapshots[this.systemSnapshots.length - 1].memoryMB - this.systemSnapshots[0].memoryMB;
      if (growth < 10) strengths.push('- 🔒 Stable memory profile (minimal growth during testing)');
    }
    
    return strengths.length > 0 ? strengths.join('\n') : '- System showing baseline performance characteristics';
  }

  private generateImprovements(stats: any, memoryStats: any, slowTools: any[], failed: any[]): string {
    const improvements = [];
    
    if (stats.avg > 500) improvements.push('- ⚠️ High average response times - investigate database query optimization');
    if (stats.p95 > 1000) improvements.push('- ⚠️ Poor 95th percentile performance - examine outlier responses');
    if (memoryStats.max > 400) improvements.push('- ⚠️ High memory usage - consider memory optimization strategies');
    if (slowTools.length > 3) improvements.push(`- ⚠️ Multiple slow tools (${slowTools.length}) - targeted optimization needed`);
    if (failed.length > 0) improvements.push(`- ❌ Tool failures (${failed.length}) - investigate error handling and parameter validation`);
    
    return improvements.length > 0 ? improvements.join('\n') : '- No significant performance issues identified';
  }

  private generateRecommendations(stats: any, memoryStats: any, failureCount: number): string {
    const recommendations = [];
    
    if (stats.avg > 300) {
      recommendations.push('- 🎯 **Database Optimization**: Review slow queries and add appropriate indexes');
    }
    
    if (memoryStats.max > 350) {
      recommendations.push('- 🎯 **Memory Management**: Implement connection pooling and result caching');
    }
    
    if (failureCount > 2) {
      recommendations.push('- 🎯 **Error Handling**: Improve parameter validation and error responses');
    }
    
    recommendations.push('- 📊 **Monitoring**: Set up continuous performance monitoring with alerting');
    recommendations.push('- 🔄 **Regular Testing**: Run performance baselines weekly to track trends');
    recommendations.push('- 📈 **Scaling Preparation**: Document current limits for capacity planning');
    
    return recommendations.join('\n');
  }
}

// Run the performance test
if (require.main === module) {
  const test = new DirectPerformanceTest();
  test.runPerformanceBaseline().catch(error => {
    console.error('❌ Performance test failed:', error);
    process.exit(1);
  });
}
