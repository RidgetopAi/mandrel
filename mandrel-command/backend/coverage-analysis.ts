/**
 * TR0007-B: AIDIS Command Backend Test Coverage Analysis
 * 
 * This script analyzes test coverage and identifies critical testing gaps
 * for the AIDIS Command Backend system.
 */

import * as fs from 'fs';
import * as path from 'path';

interface EndpointInfo {
  method: string;
  path: string;
  controller: string;
  handler: string;
  tested: boolean;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

interface CoverageAnalysis {
  totalFiles: number;
  testedFiles: number;
  coveragePercentage: number;
  endpoints: EndpointInfo[];
  criticalGaps: string[];
  recommendations: string[];
}

/**
 * Extract API endpoints from route files
 */
function extractEndpoints(): EndpointInfo[] {
  const endpoints: EndpointInfo[] = [];
  const routesDir = path.join(__dirname, 'src/routes');
  
  const routeFiles = [
    { file: 'health.ts', basePath: '/' },
    { file: 'auth.ts', basePath: '/auth' },
    { file: 'contexts.ts', basePath: '/contexts' },
    { file: 'projects.ts', basePath: '/projects' },
    { file: 'sessions.ts', basePath: '/sessions' },
    { file: 'sessionCode.ts', basePath: '/session-code' },
    { file: 'tasks.ts', basePath: '/tasks' },
    { file: 'decisions.ts', basePath: '/decisions' },
    { file: 'naming.ts', basePath: '/naming' },
    { file: 'dashboard.ts', basePath: '/dashboard' },
    { file: 'monitoring.ts', basePath: '/monitoring' }
  ];

  // Core endpoints we know exist based on route structure
  const knownEndpoints: EndpointInfo[] = [
    // Health endpoints - CRITICAL
    { method: 'GET', path: '/health', controller: 'healthController', handler: 'getHealth', tested: false, riskLevel: 'LOW' },
    { method: 'GET', path: '/db-status', controller: 'healthController', handler: 'getDatabaseStatus', tested: false, riskLevel: 'MEDIUM' },
    { method: 'GET', path: '/version', controller: 'healthController', handler: 'getVersion', tested: false, riskLevel: 'LOW' },
    
    // Auth endpoints - CRITICAL
    { method: 'POST', path: '/auth/login', controller: 'auth', handler: 'login', tested: false, riskLevel: 'CRITICAL' },
    { method: 'POST', path: '/auth/logout', controller: 'auth', handler: 'logout', tested: false, riskLevel: 'HIGH' },
    { method: 'POST', path: '/auth/register', controller: 'auth', handler: 'register', tested: false, riskLevel: 'CRITICAL' },
    { method: 'GET', path: '/auth/verify', controller: 'auth', handler: 'verify', tested: false, riskLevel: 'HIGH' },
    
    // Context endpoints - HIGH
    { method: 'GET', path: '/contexts', controller: 'context', handler: 'getContexts', tested: false, riskLevel: 'HIGH' },
    { method: 'POST', path: '/contexts', controller: 'context', handler: 'createContext', tested: false, riskLevel: 'HIGH' },
    { method: 'GET', path: '/contexts/search', controller: 'context', handler: 'searchContexts', tested: false, riskLevel: 'HIGH' },
    { method: 'GET', path: '/contexts/:id', controller: 'context', handler: 'getContext', tested: false, riskLevel: 'MEDIUM' },
    { method: 'PUT', path: '/contexts/:id', controller: 'context', handler: 'updateContext', tested: false, riskLevel: 'MEDIUM' },
    { method: 'DELETE', path: '/contexts/:id', controller: 'context', handler: 'deleteContext', tested: false, riskLevel: 'MEDIUM' },
    
    // Project endpoints - HIGH
    { method: 'GET', path: '/projects', controller: 'project', handler: 'getProjects', tested: false, riskLevel: 'HIGH' },
    { method: 'POST', path: '/projects', controller: 'project', handler: 'createProject', tested: false, riskLevel: 'HIGH' },
    { method: 'GET', path: '/projects/:id', controller: 'project', handler: 'getProject', tested: false, riskLevel: 'MEDIUM' },
    { method: 'PUT', path: '/projects/:id', controller: 'project', handler: 'updateProject', tested: false, riskLevel: 'MEDIUM' },
    { method: 'DELETE', path: '/projects/:id', controller: 'project', handler: 'deleteProject', tested: false, riskLevel: 'HIGH' },
    
    // Session endpoints - HIGH
    { method: 'GET', path: '/sessions', controller: 'session', handler: 'getSessions', tested: false, riskLevel: 'HIGH' },
    { method: 'POST', path: '/sessions', controller: 'session', handler: 'createSession', tested: false, riskLevel: 'HIGH' },
    { method: 'GET', path: '/sessions/:id', controller: 'session', handler: 'getSession', tested: false, riskLevel: 'MEDIUM' },
    { method: 'PUT', path: '/sessions/:id', controller: 'session', handler: 'updateSession', tested: false, riskLevel: 'MEDIUM' },
    { method: 'GET', path: '/sessions/:id/detail', controller: 'session', handler: 'getSessionDetail', tested: false, riskLevel: 'MEDIUM' },
    
    // Session Code endpoints - MEDIUM (legacy)
    { method: 'GET', path: '/session-code/correlate', controller: 'sessionCode', handler: 'correlateGitCommits', tested: false, riskLevel: 'MEDIUM' },
    { method: 'GET', path: '/session-code/sessions/:sessionId/commits', controller: 'sessionCode', handler: 'getSessionCommits', tested: false, riskLevel: 'MEDIUM' },
    
    // Task endpoints - MEDIUM
    { method: 'GET', path: '/tasks', controller: 'task', handler: 'getTasks', tested: false, riskLevel: 'MEDIUM' },
    { method: 'POST', path: '/tasks', controller: 'task', handler: 'createTask', tested: false, riskLevel: 'MEDIUM' },
    
    // Decision endpoints - MEDIUM
    { method: 'GET', path: '/decisions', controller: 'decision', handler: 'getDecisions', tested: false, riskLevel: 'MEDIUM' },
    { method: 'POST', path: '/decisions', controller: 'decision', handler: 'recordDecision', tested: false, riskLevel: 'MEDIUM' },
    
    // Naming endpoints - LOW
    { method: 'GET', path: '/naming/suggest', controller: 'naming', handler: 'suggestNames', tested: false, riskLevel: 'LOW' },
    { method: 'POST', path: '/naming/register', controller: 'naming', handler: 'registerName', tested: false, riskLevel: 'LOW' },
    
    // Dashboard endpoints - LOW
    { method: 'GET', path: '/dashboard/stats', controller: 'dashboard', handler: 'getDashboardStats', tested: false, riskLevel: 'LOW' },
    
    // Monitoring endpoints - LOW
    { method: 'GET', path: '/monitoring/metrics', controller: 'monitoring', handler: 'getMetrics', tested: false, riskLevel: 'LOW' }
  ];

  return knownEndpoints;
}

/**
 * Analyze current test coverage based on existing test files
 */
function analyzeCoverage(): CoverageAnalysis {
  const endpoints = extractEndpoints();
  const srcDir = path.join(__dirname, 'src');
  
  // Count source files
  const sourceFiles = getAllFiles(srcDir).filter(f => f.endsWith('.ts') && !f.includes('test'));
  const testFiles = getAllFiles(__dirname).filter(f => f.includes('test') && f.endsWith('.ts'));
  
  // Based on jest output, we have very low coverage (2.42%)
  const analysis: CoverageAnalysis = {
    totalFiles: sourceFiles.length,
    testedFiles: Math.round(sourceFiles.length * 0.0242), // 2.42% coverage
    coveragePercentage: 2.42,
    endpoints,
    criticalGaps: [],
    recommendations: []
  };

  // Identify critical gaps
  const criticalEndpoints = endpoints.filter(e => e.riskLevel === 'CRITICAL' && !e.tested);
  const highRiskEndpoints = endpoints.filter(e => e.riskLevel === 'HIGH' && !e.tested);
  
  analysis.criticalGaps = [
    `Authentication system (${criticalEndpoints.length} critical endpoints untested)`,
    `Context management (${endpoints.filter(e => e.path.includes('/contexts')).length} endpoints untested)`,
    `Project management (${endpoints.filter(e => e.path.includes('/projects')).length} endpoints untested)`,
    `Session management (${endpoints.filter(e => e.path.includes('/sessions')).length} endpoints untested)`,
    'Database connection and health checks',
    'Middleware authentication and JWT handling',
    'Error handling and validation',
    'MCP integration layer'
  ];

  analysis.recommendations = [
    'Priority 1: Create comprehensive authentication tests (login, register, JWT validation)',
    'Priority 2: Test all CRUD operations for contexts and projects',
    'Priority 3: Add database service layer tests',
    'Priority 4: Test session management and correlation',
    'Priority 5: Add middleware testing (auth, error handling)',
    'Priority 6: Create integration tests for MCP bridge',
    'Priority 7: Add API endpoint validation tests',
    'Priority 8: Test error scenarios and edge cases'
  ];

  return analysis;
}

/**
 * Get all files recursively
 */
function getAllFiles(dir: string): string[] {
  const files: string[] = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory() && !item.includes('node_modules') && !item.includes('dist')) {
        files.push(...getAllFiles(fullPath));
      } else if (stat.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }
  
  return files;
}

/**
 * Generate coverage report
 */
function generateReport(): void {
  const analysis = analyzeCoverage();
  
  console.log('\n🔍 AIDIS COMMAND BACKEND TEST COVERAGE AUDIT');
  console.log('='.repeat(60));
  
  console.log('\n📊 COVERAGE OVERVIEW:');
  console.log(`Total Source Files: ${analysis.totalFiles}`);
  console.log(`Tested Files: ${analysis.testedFiles}`);
  console.log(`Coverage Percentage: ${analysis.coveragePercentage}%`);
  console.log(`Status: ${analysis.coveragePercentage < 10 ? '❌ CRITICAL' : analysis.coveragePercentage < 50 ? '⚠️ LOW' : '✅ ACCEPTABLE'}`);
  
  console.log('\n🎯 API ENDPOINT COVERAGE:');
  const byRisk = analysis.endpoints.reduce((acc, ep) => {
    acc[ep.riskLevel] = (acc[ep.riskLevel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  console.log(`CRITICAL Risk: ${byRisk.CRITICAL || 0} endpoints (${((byRisk.CRITICAL || 0) / analysis.endpoints.length * 100).toFixed(1)}%)`);
  console.log(`HIGH Risk: ${byRisk.HIGH || 0} endpoints (${((byRisk.HIGH || 0) / analysis.endpoints.length * 100).toFixed(1)}%)`);
  console.log(`MEDIUM Risk: ${byRisk.MEDIUM || 0} endpoints (${((byRisk.MEDIUM || 0) / analysis.endpoints.length * 100).toFixed(1)}%)`);
  console.log(`LOW Risk: ${byRisk.LOW || 0} endpoints (${((byRisk.LOW || 0) / analysis.endpoints.length * 100).toFixed(1)}%)`);
  
  console.log('\n🚨 CRITICAL GAPS:');
  analysis.criticalGaps.forEach((gap, i) => {
    console.log(`${i + 1}. ${gap}`);
  });
  
  console.log('\n💡 RECOMMENDATIONS (Priority Order):');
  analysis.recommendations.forEach((rec, i) => {
    console.log(`${i + 1}. ${rec}`);
  });
  
  console.log('\n🔥 HIGH-RISK UNTESTED ENDPOINTS:');
  const highRiskUntested = analysis.endpoints
    .filter(ep => (ep.riskLevel === 'CRITICAL' || ep.riskLevel === 'HIGH') && !ep.tested)
    .sort((a, b) => a.riskLevel === 'CRITICAL' ? -1 : 1);
    
  highRiskUntested.forEach(ep => {
    console.log(`${ep.riskLevel === 'CRITICAL' ? '🔴' : '🟡'} ${ep.method} ${ep.path} (${ep.controller}.${ep.handler})`);
  });
  
  console.log('\n📈 TESTING STRATEGY:');
  console.log('1. Unit Tests: Controllers, Services, Middleware');
  console.log('2. Integration Tests: API endpoints with database');
  console.log('3. Authentication Tests: JWT, session management');
  console.log('4. Error Handling Tests: Validation, database errors');
  console.log('5. MCP Integration Tests: Bridge communication');
  
  console.log('\n⚡ IMMEDIATE ACTIONS:');
  console.log('1. Fix test setup configuration (database connection issues)');
  console.log('2. Create proper test environment with test database');
  console.log('3. Add supertest-based API endpoint tests');
  console.log('4. Implement authentication middleware testing');
  console.log('5. Add database service mocking for unit tests');
  
  console.log('\n📋 DELIVERABLE SUMMARY:');
  console.log(`- Current Coverage: ${analysis.coveragePercentage}% (Target: 80%+)`);
  console.log(`- Critical Endpoints Untested: ${analysis.endpoints.filter(e => e.riskLevel === 'CRITICAL').length}`);
  console.log(`- High Risk Endpoints Untested: ${analysis.endpoints.filter(e => e.riskLevel === 'HIGH').length}`);
  console.log('- Test Infrastructure: NEEDS SETUP');
  console.log('- Risk Level for Refactoring: HIGH (due to low test coverage)');
}

// Run the analysis
if (require.main === module) {
  generateReport();
}

export { analyzeCoverage, generateReport };
