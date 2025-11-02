/**
 * TR004-6: Backend Validation Schemas
 * Shared Zod schemas for backend API contract enforcement
 * Synchronized with frontend schemas for consistency
 */

import { z } from 'zod';

// ================================
// CORE VALIDATION UTILITIES
// ================================

// Common field validations
export const requiredString = (fieldName: string, minLength = 1, maxLength = 255) =>
  z.string()
    .min(minLength, `${fieldName} is required`)
    .max(maxLength, `${fieldName} must be less than ${maxLength} characters`)
    .trim();

export const optionalString = (maxLength = 255) =>
  z.string()
    .max(maxLength, `Field must be less than ${maxLength} characters`)
    .trim()
    .optional()
    .nullable()
    .transform(val => val === null ? undefined : val);

export const email = z.string()
  .email('Please enter a valid email address')
  .max(255, 'Email must be less than 255 characters');

export const url = z.union([
  z.string().url('Please enter a valid URL'),
  z.literal(''),
  z.null()
]).optional()
  .transform(val => val === null ? undefined : val);

export const positiveInteger = z.number()
  .int('Must be an integer')
  .positive('Must be a positive number');

export const tags = z.array(z.string().min(1).max(50))
  .max(10, 'Maximum 10 tags allowed')
  .optional();

// ================================
// PROJECT VALIDATION SCHEMAS
// ================================

export const CreateProjectSchema = z.object({
  name: requiredString('Project name', 2, 100),
  description: optionalString(500),
  git_repo_url: url,
  root_directory: optionalString(255),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const UpdateProjectSchema = z.object({
  name: optionalString(100),
  description: optionalString(500),
  status: z.enum(['active', 'inactive', 'archived']).optional(),
  git_repo_url: url,
  root_directory: optionalString(255),
  metadata: z.record(z.string(), z.any()).optional(),
});

export type CreateProjectData = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectData = z.infer<typeof UpdateProjectSchema>;

// ================================
// TASK VALIDATION SCHEMAS
// ================================

export const TaskTypeSchema = z.enum([
  'general', 'feature', 'bug', 'refactor', 'test', 'docs', 'devops'
]);

export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'urgent']);

export const TaskStatusSchema = z.enum([
  'todo', 'in_progress', 'completed', 'blocked', 'cancelled'
]);

export const CreateTaskSchema = z.object({
  title: requiredString('Task title', 2, 500),
  description: optionalString(2000),
  type: TaskTypeSchema.default('general'),
  priority: TaskPrioritySchema,
  assigned_to: optionalString(100),
  project_id: z.string().uuid('Invalid project ID'),
  tags: tags,
});

export const UpdateTaskSchema = z.object({
  title: optionalString(500),
  description: optionalString(2000),
  type: TaskTypeSchema.optional(),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  assigned_to: optionalString(100),
  tags: tags,
});

export const TaskBulkMoveSchema = z.object({
  ids: z.array(z.string().uuid('Invalid task ID format')).min(1, 'At least one task ID is required'),
  project_id: z.string().uuid('Invalid project ID'),
});

export type CreateTaskData = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskData = z.infer<typeof UpdateTaskSchema>;

// ================================
// CONTEXT VALIDATION SCHEMAS
// ================================

export const ContextTypeSchema = z.enum([
  'code', 'decision', 'research', 'issue', 'note', 'error', 'test'
]);

export const CreateContextSchema = z.object({
  content: requiredString('Content', 10, 10000),
  type: ContextTypeSchema,
  tags: tags,
  metadata: z.record(z.string(), z.any()).optional(),
});

export type CreateContextData = z.infer<typeof CreateContextSchema>;

export const UpdateContextSchema = z.object({
  content: requiredString('Content', 10, 10000).optional(),
  tags: tags,
  metadata: z.record(z.string(), z.any()).optional(),
  relevance_score: z.number().min(0).max(10).optional(),
  project_id: z.string().uuid('Invalid project ID').optional(),
});

export type UpdateContextData = z.infer<typeof UpdateContextSchema>;

export const ContextSearchQuerySchema = z.object({
  query: optionalString(2000),
  project_id: z.string().uuid().optional(),
  session_id: z.string().uuid().optional(),
  type: ContextTypeSchema.optional(),
  tags: optionalString(500),
  min_similarity: z
    .preprocess((val) => (typeof val === 'string' ? parseFloat(val) : val), z.number().min(0).max(1))
    .optional(),
  date_from: optionalString(50),
  date_to: optionalString(50),
  limit: z
    .preprocess((val) => (typeof val === 'string' ? parseInt(val, 10) : val), z.number().int().min(1).max(100))
    .optional(),
  offset: z
    .preprocess((val) => (typeof val === 'string' ? parseInt(val, 10) : val), z.number().int().min(0))
    .optional(),
  sort_by: z.enum(['created_at', 'relevance', 'updated_at']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
});

export const ContextBulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid('Invalid context ID format')).min(1, 'At least one context ID is required'),
});

export const ContextBulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid('Invalid context ID format')).min(1, 'At least one context ID is required'),
  updates: z.object({
    project_id: z.string().uuid('Invalid project ID').optional(),
    tags: tags,
    relevance_score: z.number().min(0).max(10).optional(),
  }).refine(data => Object.keys(data).length > 0, {
    message: 'At least one field must be provided in updates',
  }),
});

// ================================
// SESSION VALIDATION SCHEMAS
// ================================

export const UpdateSessionSchema = z.object({
  title: optionalString(255),
  description: optionalString(5000),
  session_goal: optionalString(5000),
  tags: z.array(z.string()).optional(),
  ai_model: optionalString(100),
  project_id: z.string().uuid().optional(),
});

export type UpdateSessionData = z.infer<typeof UpdateSessionSchema>;

// ================================
// DECISION VALIDATION SCHEMAS
// ================================

export const DecisionStatusSchema = z.enum([
  'proposed', 'accepted', 'rejected', 'superseded'
]);

export const CreateDecisionSchema = z.object({
  title: requiredString('Decision title', 5, 200),
  context: requiredString('Context', 10, 2000),
  decision: requiredString('Decision', 10, 2000),
  consequences: optionalString(2000),
  status: DecisionStatusSchema.default('proposed'),
  tags: tags,
});

export type CreateDecisionData = z.infer<typeof CreateDecisionSchema>;

// ================================
// NAMING VALIDATION SCHEMAS
// ================================

export const NamingTypeSchema = z.enum([
  'variable', 'function', 'class', 'component', 'file', 'directory', 'database', 'api'
]);

export const RegisterNamingSchema = z.object({
  name: requiredString('Name', 2, 100),
  type: NamingTypeSchema,
  description: optionalString(500),
  project_id: z.string().uuid('Invalid project ID').optional(),
});

export type RegisterNamingData = z.infer<typeof RegisterNamingSchema>;

// ================================
// VALIDATION ERROR FORMATTING
// ================================

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export const formatZodError = (error: z.ZodError): ValidationError[] => {
  return error.issues.map(issue => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
};

export const formatFieldErrors = (errors: ValidationError[]): Record<string, string> => {
  return errors.reduce((acc, error) => {
    acc[error.field] = error.message;
    return acc;
  }, {} as Record<string, string>);
};

// ================================
// SCHEMA REGISTRY
// ================================

export const SchemaRegistry = {
  // Projects
  CreateProject: CreateProjectSchema,
  UpdateProject: UpdateProjectSchema,

  // Tasks
  CreateTask: CreateTaskSchema,
  UpdateTask: UpdateTaskSchema,
  TaskBulkMove: TaskBulkMoveSchema,

  // Contexts
  CreateContext: CreateContextSchema,
  UpdateContext: UpdateContextSchema,

  // Sessions
  UpdateSession: UpdateSessionSchema,

  // Decisions
  CreateDecision: CreateDecisionSchema,

  // Naming
  RegisterNaming: RegisterNamingSchema,

  // Context bulk operations
  ContextBulkDelete: ContextBulkDeleteSchema,
  ContextBulkUpdate: ContextBulkUpdateSchema,
} as const;

export type SchemaName = keyof typeof SchemaRegistry;

export const getSchema = (schemaName: SchemaName) => {
  return SchemaRegistry[schemaName];
};

// ================================
// VALIDATION UTILITIES
// ================================

export const validateData = <T>(schema: z.ZodSchema<T>, data: any): {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
} => {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (error) {
    if (error instanceof z.ZodError) {
      return { success: false, errors: formatZodError(error) };
    }
    return {
      success: false,
      errors: [{ field: 'general', message: 'Validation failed' }]
    };
  }
};

export const validatePartial = <T>(schema: z.ZodSchema<T>, data: any): {
  success: boolean;
  data?: Partial<T>;
  errors?: ValidationError[];
} => {
  try {
    // For partial validation, we'll use a more permissive approach
    const result = validateData(schema, data);
    if (result.success) {
      return { success: true, data: result.data };
    }

    // If full validation fails, check if it's just due to missing required fields
    const missingFieldErrors = result.errors?.filter(error =>
      error.message.includes('required') || error.message.includes('is required')
    ) || [];

    const otherErrors = result.errors?.filter(error =>
      !error.message.includes('required') && !error.message.includes('is required')
    ) || [];

    // If only missing field errors, it's a successful partial validation
    if (otherErrors.length === 0) {
      return { success: true, data: data as Partial<T> };
    }

    // Otherwise, return the validation errors
    return { success: false, errors: otherErrors };
  } catch (error) {
    return {
      success: false,
      errors: [{ field: 'general', message: 'Validation failed' }]
    };
  }
};

export default SchemaRegistry;
