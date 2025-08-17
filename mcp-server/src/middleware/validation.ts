/**
 * ORACLE HARDENING: INPUT VALIDATION MIDDLEWARE
 * Zod-based validation for all AIDIS MCP tool requests
 * Prevents malformed input and ensures data integrity
 */

import { z } from 'zod';

// Base validation schemas
const baseMetadata = z.record(z.any()).optional();
const baseId = z.string().uuid().optional();
const baseName = z.string().min(1).max(255);
const baseDescription = z.string().max(2000).optional();
const baseTags = z.array(z.string().max(50)).max(20).optional();
const baseQuery = z.string().min(1).max(1000);
const baseLimit = z.number().int().min(1).max(100).default(10);
const baseRelevanceScore = z.number().min(0).max(10).optional();

// System Health Schemas
export const aidisSystemSchemas = {
  ping: z.object({
    message: z.string().max(500).optional()
  }),
  
  status: z.object({})
};

// Context Management Schemas
export const contextSchemas = {
  store: z.object({
    content: z.string().min(1).max(10000),
    type: z.enum(['code', 'decision', 'error', 'planning', 'completion']),
    tags: baseTags,
    relevanceScore: baseRelevanceScore,
    metadata: baseMetadata
  }),
  
  search: z.object({
    query: baseQuery,
    type: z.enum(['code', 'decision', 'error', 'planning', 'completion']).optional(),
    tags: baseTags,
    limit: baseLimit,
    minSimilarity: z.number().min(0).max(100).optional(),
    offset: z.number().int().min(0).optional()
  }),
  
  stats: z.object({})
};

// Project Management Schemas
export const projectSchemas = {
  create: z.object({
    name: baseName,
    description: baseDescription,
    metadata: baseMetadata
  }),
  
  switch: z.object({
    project: z.union([
      z.string().uuid(), // Project ID
      z.string().min(1).max(255) // Project name
    ])
  }),
  
  info: z.object({
    project: z.string().min(1).max(255).optional()
  }),
  
  list: z.object({}),
  
  current: z.object({}),
  
  insights: z.object({})
};

// Naming Registry Schemas
export const namingSchemas = {
  register: z.object({
    name: baseName,
    type: z.enum(['variable', 'function', 'class', 'interface', 'component', 'file', 'directory']),
    context: z.string().max(1000).optional(),
    metadata: baseMetadata
  }),
  
  check: z.object({
    name: baseName,
    type: z.enum(['variable', 'function', 'class', 'interface', 'component', 'file', 'directory']).optional()
  }),
  
  suggest: z.object({
    partialName: z.string().min(1).max(100),
    type: z.enum(['variable', 'function', 'class', 'interface', 'component', 'file', 'directory']).optional(),
    limit: baseLimit
  }),
  
  stats: z.object({})
};

// Technical Decision Schemas
export const decisionSchemas = {
  record: z.object({
    title: z.string().min(1).max(255),
    description: z.string().min(1).max(5000),
    alternatives: z.array(z.string().max(1000)).min(1).max(10),
    chosenAlternative: z.string().max(1000),
    reasoning: z.string().max(2000).optional(),
    impact: z.enum(['low', 'medium', 'high']).optional(),
    tags: baseTags,
    metadata: baseMetadata
  }),
  
  search: z.object({
    query: baseQuery,
    limit: baseLimit,
    includeOutcome: z.boolean().optional()
  }),
  
  update: z.object({
    decisionId: z.string().uuid(),
    outcome: z.string().max(2000).optional(),
    lessons: z.string().max(2000).optional(),
    status: z.enum(['active', 'superseded', 'deprecated']).optional()
  }),
  
  stats: z.object({})
};

// Multi-Agent Coordination Schemas
export const agentSchemas = {
  register: z.object({
    agentType: z.string().min(1).max(100),
    capabilities: z.array(z.string().max(100)).max(20),
    metadata: baseMetadata
  }),
  
  list: z.object({}),
  
  status: z.object({
    agentId: z.string().uuid().optional()
  }),
  
  join: z.object({
    agentId: z.string().uuid(),
    sessionId: z.string().uuid().optional()
  }),
  
  leave: z.object({
    agentId: z.string().uuid(),
    sessionId: z.string().uuid().optional()
  }),
  
  sessions: z.object({
    agentId: z.string().uuid().optional()
  }),
  
  message: z.object({
    from: z.string().uuid(),
    to: z.string().uuid().optional(),
    message: z.string().min(1).max(5000),
    type: z.enum(['info', 'request', 'response', 'error']).optional()
  }),
  
  messages: z.object({
    agentId: z.string().uuid().optional(),
    limit: baseLimit,
    since: z.string().datetime().optional()
  })
};

// Task Management Schemas  
export const taskSchemas = {
  create: z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    type: z.enum(['feature', 'bug', 'refactor', 'test', 'docs', 'devops']),
    priority: z.enum(['low', 'medium', 'high', 'critical']),
    status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional(),
    assignedAgent: z.string().uuid().optional(),
    dependencies: z.array(z.string().uuid()).max(10).optional(),
    tags: baseTags,
    metadata: baseMetadata
  }),
  
  list: z.object({
    status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    assignedAgent: z.string().uuid().optional(),
    limit: baseLimit
  }),
  
  update: z.object({
    taskId: z.string().uuid(),
    status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    assignedAgent: z.string().uuid().optional(),
    progress: z.number().min(0).max(100).optional(),
    notes: z.string().max(2000).optional()
  })
};

// Code Analysis Schemas
export const codeSchemas = {
  analyze: z.object({
    filePath: z.string().min(1).max(1000),
    language: z.enum(['typescript', 'javascript', 'python', 'java', 'csharp']).optional()
  }),
  
  components: z.object({
    filePath: z.string().min(1).max(1000).optional()
  }),
  
  dependencies: z.object({
    filePath: z.string().min(1).max(1000).optional()
  }),
  
  impact: z.object({
    filePath: z.string().min(1).max(1000),
    changeType: z.enum(['modify', 'delete', 'rename']).optional()
  }),
  
  stats: z.object({})
};

// Smart Search & AI Recommendations Schemas
export const smartSearchSchemas = {
  search: z.object({
    query: baseQuery,
    scope: z.enum(['contexts', 'decisions', 'naming', 'agents', 'tasks', 'code', 'all']).optional(),
    limit: baseLimit
  }),
  
  recommendations: z.object({
    context: z.string().max(2000),
    type: z.enum(['naming', 'architecture', 'testing', 'refactoring']).optional()
  })
};

// Main validation schema registry
export const validationSchemas = {
  // System Health
  aidis_ping: aidisSystemSchemas.ping,
  aidis_status: aidisSystemSchemas.status,
  
  // Context Management
  context_store: contextSchemas.store,
  context_search: contextSchemas.search,
  context_stats: contextSchemas.stats,
  
  // Project Management
  project_create: projectSchemas.create,
  project_switch: projectSchemas.switch,
  project_info: projectSchemas.info,
  project_list: projectSchemas.list,
  project_current: projectSchemas.current,
  project_insights: projectSchemas.insights,
  
  // Naming Registry
  naming_register: namingSchemas.register,
  naming_check: namingSchemas.check,
  naming_suggest: namingSchemas.suggest,
  naming_stats: namingSchemas.stats,
  
  // Technical Decisions
  decision_record: decisionSchemas.record,
  decision_search: decisionSchemas.search,
  decision_update: decisionSchemas.update,
  decision_stats: decisionSchemas.stats,
  
  // Multi-Agent Coordination
  agent_register: agentSchemas.register,
  agent_list: agentSchemas.list,
  agent_status: agentSchemas.status,
  agent_join: agentSchemas.join,
  agent_leave: agentSchemas.leave,
  agent_sessions: agentSchemas.sessions,
  agent_message: agentSchemas.message,
  agent_messages: agentSchemas.messages,
  
  // Task Management
  task_create: taskSchemas.create,
  task_list: taskSchemas.list,
  task_update: taskSchemas.update,
  
  // Code Analysis
  code_analyze: codeSchemas.analyze,
  code_components: codeSchemas.components,
  code_dependencies: codeSchemas.dependencies,
  code_impact: codeSchemas.impact,
  code_stats: codeSchemas.stats,
  
  // Smart Search & AI Recommendations
  smart_search: smartSearchSchemas.search,
  get_recommendations: smartSearchSchemas.recommendations
};

/**
 * Validate MCP tool arguments using Zod schemas
 * @param toolName Name of the MCP tool
 * @param args Arguments to validate
 * @returns Validated arguments or throws validation error
 */
export function validateToolArguments(toolName: string, args: any) {
  const schema = validationSchemas[toolName as keyof typeof validationSchemas];
  
  if (!schema) {
    throw new Error(`No validation schema found for tool: ${toolName}`);
  }
  
  try {
    return schema.parse(args);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => 
        `${issue.path.join('.')}: ${issue.message}`
      ).join(', ');
      
      throw new Error(`Validation failed for ${toolName}: ${issues}`);
    }
    throw error;
  }
}

/**
 * Validation middleware for MCP requests
 * @param toolName Name of the MCP tool
 * @param args Arguments to validate
 */
export function validationMiddleware(toolName: string, args: any) {
  try {
    const validatedArgs = validateToolArguments(toolName, args);
    return {
      success: true,
      data: validatedArgs,
      error: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error.message
    };
  }
}

export default validationMiddleware;
