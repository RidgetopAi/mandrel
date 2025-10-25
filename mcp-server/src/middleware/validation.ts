/**
 * ORACLE HARDENING: INPUT VALIDATION MIDDLEWARE
 * Zod-based validation for all AIDIS MCP tool requests
 * Prevents malformed input and ensures data integrity
 */

import { z } from 'zod';

// Base validation schemas
const baseMetadata = z.record(z.any()).optional();
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
  
  status: z.object({}),
  
  help: z.object({}),
  
  explain: z.object({
    toolName: z.string().min(1).max(100)
  })
};

// Context Management Schemas
export const contextSchemas = {
  store: z.object({
    content: z.string().min(1).max(10000),
    type: z.enum(['code', 'decision', 'error', 'discussion', 'planning', 'completion', 'milestone', 'reflections', 'handoff', 'lessons']),
    tags: baseTags,
    relevanceScore: baseRelevanceScore,
    metadata: baseMetadata,
    projectId: z.string().optional(),
    sessionId: z.string().optional()
  }),
  
  search: z.object({
    query: baseQuery,
    type: z.enum(['code', 'decision', 'error', 'discussion', 'planning', 'completion', 'milestone', 'reflections', 'handoff', 'lessons']).optional(),
    tags: baseTags,
    limit: baseLimit,
    minSimilarity: z.number().min(0).max(100).optional(),
    offset: z.number().int().min(0).optional(),
    projectId: z.string().optional(),
    sessionId: z.string().optional()
  }),
  
  get_recent: z.object({
    limit: z.number().int().min(1).max(20).default(5),
    projectId: z.string().optional()
  }),
  
  stats: z.object({})
};

// Project Management Schemas
export const projectSchemas = {
  create: z.object({
    name: baseName,
    description: baseDescription,
    gitRepoUrl: z.string().optional(),
    rootDirectory: z.string().optional(),
    metadata: baseMetadata
  }),
  
  switch: z.object({
    project: z.union([
      z.string().uuid(), // Project ID
      z.string().min(1).max(255) // Project name
    ])
  }),
  
  info: z.object({
    project: z.string().min(1).max(255)
  }),
  
  list: z.object({
    includeStats: z.union([z.boolean(), z.string().transform(val => val === 'true')]).optional().default(false)
  }),
  
  current: z.object({}),
  
  insights: z.object({})
};

// Naming Registry Schemas
export const namingSchemas = {
  register: z.object({
    canonicalName: baseName,
    entityType: z.enum(['variable', 'function', 'class', 'interface', 'type', 'component', 
                        'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 
                        'database_column', 'config_key', 'environment_var', 'css_class', 'html_id']),
    description: z.string().max(1000).optional(),
    aliases: z.array(z.string().max(255)).max(10).optional(),
    contextTags: z.array(z.string().max(50)).max(20).optional(),
    projectId: z.string().optional()
  }),
  
  check: z.object({
    proposedName: baseName,
    entityType: z.enum(['variable', 'function', 'class', 'interface', 'type', 'component', 
                        'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 
                        'database_column', 'config_key', 'environment_var', 'css_class', 'html_id']),
    contextTags: z.array(z.string().max(50)).max(20).optional(),
    projectId: z.string().optional()
  }),
  
  suggest: z.object({
    description: z.string().min(1).max(1000),
    entityType: z.enum(['variable', 'function', 'class', 'interface', 'type', 'component', 
                        'file', 'directory', 'module', 'service', 'endpoint', 'database_table', 
                        'database_column', 'config_key', 'environment_var', 'css_class', 'html_id']),
    contextTags: z.array(z.string().max(50)).max(20).optional(),
    projectId: z.string().optional()
  }),
  
  stats: z.object({})
};

// Technical Decision Schemas
export const decisionSchemas = {
  record: z.object({
    decisionType: z.enum(['architecture', 'library', 'framework', 'pattern', 'api_design', 'database', 'deployment', 'security', 'performance', 'ui_ux', 'testing', 'tooling', 'process', 'naming_convention', 'code_style']),
    title: z.string().min(1).max(255),
    description: z.string().min(1).max(5000),
    rationale: z.string().max(2000),
    impactLevel: z.enum(['low', 'medium', 'high', 'critical']),
    alternativesConsidered: z.array(z.object({
      name: z.string(),
      pros: z.array(z.string()).optional(),
      cons: z.array(z.string()).optional(),
      reasonRejected: z.string()
    })).optional(),
    problemStatement: z.string().max(2000).optional(),
    affectedComponents: z.array(z.string()).optional(),
    tags: baseTags.optional(),
    projectId: z.string().optional(),
    metadata: baseMetadata.optional()
  }),
  
  search: z.object({
    query: z.string().min(1).max(1000).optional(), // Make query optional for flexible filtering
    limit: baseLimit,
    // Add all parameters the handler actually supports (all optional)
    decisionType: z.enum(['architecture', 'library', 'framework', 'pattern',
      'api_design', 'database', 'deployment', 'security', 'performance',
      'ui_ux', 'testing', 'tooling', 'process', 'naming_convention', 'code_style']).optional(),
    status: z.enum(['active', 'deprecated', 'superseded', 'under_review']).optional(),
    impactLevel: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    component: z.string().optional(),
    tags: baseTags.optional(),
    projectId: z.string().optional(),
    includeOutcome: z.boolean().optional()
    // Note: dateFrom/dateTo excluded - complex date parsing not needed for AI ease-of-use
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
    name: z.string().min(1).max(100),
    type: z.string().min(1).max(100).optional(),
    capabilities: z.array(z.string().max(100)).max(20).optional(),
    metadata: baseMetadata.optional()
  }),
  
  list: z.object({}),
  
  status: z.object({
    agentId: z.string().min(1).max(100)
  }),
  
  join: z.object({
    agentId: z.string().min(1).max(100),
    sessionId: z.string().uuid().optional()
  }),
  
  leave: z.object({
    agentId: z.string().min(1).max(100),
    sessionId: z.string().uuid().optional()
  }),
  
  sessions: z.object({
    agentId: z.string().min(1).max(100).optional()
  }),
  
  message: z.object({
    fromAgentId: z.string().min(1).max(100),
    content: z.string().min(1).max(5000),
    toAgentId: z.string().min(1).max(100).optional(),
    messageType: z.string().optional(),
    title: z.string().optional(),
    contextRefs: z.array(z.string()).optional(),
    taskRefs: z.array(z.string()).optional(),
    projectId: z.string().optional(),
    metadata: baseMetadata.optional()
  }),
  
  messages: z.object({
    agentId: z.string().min(1).max(100).optional(),
    limit: baseLimit,
    since: z.string().datetime().optional()
  })
};

// Task Management Schemas  
export const taskSchemas = {
  create: z.object({
    title: z.string().min(1).max(255),
    description: z.string().max(2000).optional(),
    type: z.enum(['feature', 'bug', 'bugfix', 'refactor', 'test', 'review', 'docs', 'documentation', 'devops', 'general']).optional().default('general'),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional().default('medium'),
    status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional(),
    assignedTo: z.string().optional(),
    dependencies: z.array(z.string()).max(10).optional(),
    tags: baseTags,
    projectId: z.string().optional(),
    metadata: baseMetadata
  }),
  
  list: z.object({
    status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    assignedAgent: z.string().uuid().optional(),
    limit: baseLimit
  }),
  
  update: z.object({
    taskId: z.string().uuid(),
    status: z.enum(['todo', 'in_progress', 'completed', 'blocked']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    assignedTo: z.string().uuid().optional(),
    progress: z.number().min(0).max(100).optional(),
    notes: z.string().max(2000).optional()
  }),

  bulk_update: z.object({
    task_ids: z.array(z.string().uuid()).min(1).max(50),
    status: z.enum(['todo', 'in_progress', 'blocked', 'completed', 'cancelled']).optional(),
    assignedTo: z.string().optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    metadata: baseMetadata,
    notes: z.string().max(2000).optional(),
    projectId: z.string().optional()
  }),

  details: z.object({
    taskId: z.string().uuid(),
    projectId: z.string().optional()
  }),

  progress_summary: z.object({
    groupBy: z.enum(['phase', 'status', 'priority', 'type', 'assignedTo']).optional().default('phase'),
    projectId: z.string().optional()
  })
};

// Complexity Analysis Schemas
export const complexitySchemas = {
  analyze: z.object({
    target: z.string().min(1),
    type: z.enum(['file', 'files', 'commit', 'function']),
    options: z.object({}).optional()
  }),
  insights: z.object({
    view: z.enum(['dashboard', 'hotspots', 'trends', 'debt', 'refactoring']),
    filters: z.record(z.any()).optional()
  }),
  manage: z.object({
    action: z.enum(['start_tracking', 'stop_tracking', 'get_alerts', 'acknowledge_alert', 'resolve_alert', 'set_thresholds', 'get_performance']),
    options: z.record(z.any()).optional()
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
    componentId: z.string().min(1).max(1000),
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
    type: z.enum(['naming', 'implementation', 'architecture', 'testing']).optional()
  })
};

// Session Management Schemas - DELETED (2025-10-24)
// Session MCP tools removed - sessions now auto-manage via SessionTracker service
// REST API endpoints at /api/v2/sessions/* handle UI analytics needs

// Main validation schema registry
export const validationSchemas = {
  // System Health
  aidis_ping: aidisSystemSchemas.ping,
  aidis_status: aidisSystemSchemas.status,
  aidis_help: aidisSystemSchemas.help,
  aidis_explain: aidisSystemSchemas.explain,
  aidis_examples: aidisSystemSchemas.explain, // Same schema as explain - takes toolName parameter
  
  // Context Management
  context_store: contextSchemas.store,
  context_search: contextSchemas.search,
  context_get_recent: contextSchemas.get_recent,
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
  task_bulk_update: taskSchemas.bulk_update,
  task_details: taskSchemas.details,
  task_progress_summary: taskSchemas.progress_summary,
  
  // Complexity Analysis
  complexity_analyze: complexitySchemas.analyze,
  complexity_insights: complexitySchemas.insights,
  complexity_manage: complexitySchemas.manage,

  // Code Analysis
  code_analyze: codeSchemas.analyze,
  code_components: codeSchemas.components,
  code_dependencies: codeSchemas.dependencies,
  code_impact: codeSchemas.impact,
  code_stats: codeSchemas.stats,
  
  // Smart Search & AI Recommendations
  smart_search: smartSearchSchemas.search,
  get_recommendations: smartSearchSchemas.recommendations,

  // Git Integration Tools
  git_session_commits: z.object({
    sessionId: z.string().optional()
  }),
  git_commit_sessions: z.object({
    commitHash: z.string().min(1)
  }),
  git_correlate_session: z.object({
    sessionId: z.string().optional()
  })

  // Session Management - DELETED (2025-10-24)
  // 5 session tools removed - sessions auto-manage via SessionTracker service
};

/**
 * Validate MCP tool arguments using Zod schemas
 * @param toolName Name of the MCP tool
 * @param args Arguments to validate
 * @returns Validated arguments or throws validation error
 */
export function validateToolArguments(toolName: string, args: any) {
  // Temporarily bypass validation for complexity tools
  if (toolName.startsWith('complexity_')) {
    return args;
  }

  const schema = validationSchemas[toolName as keyof typeof validationSchemas];

  if (!schema) {
    throw new Error(`No validation schema found for tool: ${toolName}`);
  }

  // Normalize synonyms for decision tools (AI-friendly parameter names)
  if (toolName === 'decision_record' || toolName === 'decision_search') {
    args = normalizeDecisionSynonyms(toolName, args);
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
    const err = error as Error;
    return {
      success: false,
      data: null,
      error: err.message
    };
  }
}

/**
 * Normalize AI-friendly synonym parameters to canonical names
 * Enables natural language parameter variations without breaking validation
 */
function normalizeDecisionSynonyms(toolName: string, args: any): any {
  const normalized = { ...args };

  if (toolName === 'decision_record') {
    // rationale synonyms
    if (args.reasoning && !args.rationale) normalized.rationale = args.reasoning;
    if (args.reason && !args.rationale) normalized.rationale = args.reason;
    if (args.why && !args.rationale) normalized.rationale = args.why;

    // impactLevel synonyms
    if (args.impact && !args.impactLevel) normalized.impactLevel = args.impact;
    if (args.severity && !args.impactLevel) normalized.impactLevel = args.severity;
    if (args.priority && !args.impactLevel) normalized.impactLevel = args.priority;

    // alternativesConsidered synonyms
    if (args.options && !args.alternativesConsidered) {
      normalized.alternativesConsidered = Array.isArray(args.options)
        ? args.options.map((opt: any) => typeof opt === 'string'
            ? { name: opt, reasonRejected: 'Not selected' }
            : opt)
        : args.options;
    }
    if (args.alternatives && !args.alternativesConsidered) {
      normalized.alternativesConsidered = args.alternatives;
    }
    if (args.choices && !args.alternativesConsidered) {
      normalized.alternativesConsidered = args.choices;
    }

    // Clean up synonyms from normalized object
    delete normalized.reasoning;
    delete normalized.reason;
    delete normalized.why;
    delete normalized.impact;
    delete normalized.severity;
    delete normalized.priority;
    delete normalized.options;
    delete normalized.alternatives;
    delete normalized.choices;
  }

  if (toolName === 'decision_search') {
    // decisionType synonyms
    if (args.type && !args.decisionType) normalized.decisionType = args.type;

    // impactLevel synonyms
    if (args.impact && !args.impactLevel) normalized.impactLevel = args.impact;
    if (args.severity && !args.impactLevel) normalized.impactLevel = args.severity;

    // Clean up synonyms
    delete normalized.type;
    delete normalized.impact;
    delete normalized.severity;
  }

  return normalized;
}

export default validationMiddleware;
