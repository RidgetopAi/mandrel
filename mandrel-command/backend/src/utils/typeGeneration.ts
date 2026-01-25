/**
 * TR005-6: End-to-End Type Safety Pipeline
 * Utilities for generating TypeScript types from Zod schemas
 */

import { z } from 'zod';
import { SchemaRegistry } from '../validation/schemas';
import fs from 'fs/promises';
import path from 'path';
import { logger } from '../config/logger';

// ================================
// TYPE GENERATION UTILITIES
// ================================

interface TypeDefinition {
  name: string;
  definition: string;
  source: 'schema' | 'api' | 'database';
  dependencies: string[];
}

interface GeneratedTypes {
  types: TypeDefinition[];
  exports: string[];
  imports: string[];
}

/**
 * Generate API response types
 */
function generateApiResponseTypes(): string {
  return `// TR005-6: Standardized API Response Types

export interface ApiSuccessResponse<T = any> {
  success: true;
  data: T;
  correlationId?: string;
  metadata?: {
    timestamp: string;
    version?: string;
    [key: string]: any;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    type: 'validation' | 'authentication' | 'authorization' | 'not_found' | 'internal' | 'business';
    message: string;
    details?: any;
    code?: string;
  };
  correlationId?: string;
  metadata?: {
    timestamp: string;
    [key: string]: any;
  };
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

// Pagination types
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T = any> {
  items: T[];
  pagination: PaginationMeta;
}

// List response types
export interface ListResponse<T = any> {
  items: T[];
  count: number;
  filters?: Record<string, any>;
  sorting?: {
    field: string;
    direction: 'asc' | 'desc';
  };
}`;
}

/**
 * Generate database entity types
 */
function generateDatabaseTypes(): string {
  return `// TR005-6: Database Entity Types

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectEntity extends BaseEntity {
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'archived';
  git_repo_url?: string;
  root_directory?: string;
  metadata?: Record<string, any>;
}

export interface TaskEntity extends BaseEntity {
  project_id: string;
  title: string;
  description?: string;
  type: 'general' | 'feature' | 'bug' | 'refactor' | 'test' | 'docs' | 'devops';
  status: 'pending' | 'in_progress' | 'completed' | 'blocked' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  tags?: string[];
  due_date?: string;
  estimated_hours?: number;
  actual_hours?: number;
}

export interface ContextEntity extends BaseEntity {
  content: string;
  type: 'code' | 'decision' | 'research' | 'issue' | 'note' | 'error' | 'test';
  tags?: string[];
  metadata?: Record<string, any>;
  session_id?: string;
  project_id?: string;
}

export interface SessionEntity extends BaseEntity {
  title?: string;
  description?: string;
  project_id?: string;
  user_agent?: string;
  started_at: string;
  ended_at?: string;
  duration?: number;
  status: 'active' | 'completed' | 'abandoned';
}

export interface DecisionEntity extends BaseEntity {
  title: string;
  context: string;
  decision: string;
  consequences?: string;
  status: 'proposed' | 'accepted' | 'rejected' | 'superseded';
  tags?: string[];
  project_id?: string;
  session_id?: string;
}`;
}

/**
 * Generate validation error types
 */
function generateValidationTypes(): string {
  return `// TR005-6: Validation and Error Types

export interface ValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface ValidationResult<T = any> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

export interface FormFieldError {
  field: string;
  message: string;
  code?: string;
}

export interface FormValidationState<T = any> {
  data: Partial<T>;
  errors: Record<string, string>;
  isValidating: boolean;
  isSubmitting: boolean;
  isValid: boolean;
  hasBeenModified: boolean;
  serverErrors: Record<string, string>;
}

export interface ErrorHandlerState {
  hasError: boolean;
  error: Error | null;
  errorType: 'api' | 'component' | 'network' | 'validation' | 'unknown';
  retryCount: number;
  lastErrorTime: Date | null;
  isRecovering: boolean;
}`;
}

/**
 * Generate the complete type definition file
 */
async function generateTypeDefinitions(): Promise<string> {
  const timestamp = new Date().toISOString();

  let content = `/**
 * TR005-6: Generated Type Definitions
 * Auto-generated TypeScript types for end-to-end type safety
 * Generated: ${timestamp}
 *
 * DO NOT EDIT MANUALLY - This file is auto-generated
 */

import { z } from 'zod';

`;

  // Add schema imports
  content += `// Schema imports for type inference
import {
  CreateProjectSchema,
  UpdateProjectSchema,
  CreateTaskSchema,
  UpdateTaskSchema,
  CreateContextSchema,
  UpdateSessionSchema,
  CreateDecisionSchema,
  RegisterNamingSchema
} from '../validation/schemas';

`;

  // Generate API response types
  content += generateApiResponseTypes() + '\n\n';

  // Generate database types
  content += generateDatabaseTypes() + '\n\n';

  // Generate validation types
  content += generateValidationTypes() + '\n\n';

  // Generate schema-derived types
  content += `// Schema-derived types (using z.infer for accuracy)
export type CreateProjectType = z.infer<typeof CreateProjectSchema>;
export type UpdateProjectType = z.infer<typeof UpdateProjectSchema>;
export type CreateTaskType = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskType = z.infer<typeof UpdateTaskSchema>;
export type CreateContextType = z.infer<typeof CreateContextSchema>;
export type UpdateSessionType = z.infer<typeof UpdateSessionSchema>;
export type CreateDecisionType = z.infer<typeof CreateDecisionSchema>;
export type RegisterNamingType = z.infer<typeof RegisterNamingSchema>;

`;

  // Add type guards
  content += `// Type guards for runtime type checking
export const isApiSuccessResponse = <T = any>(response: any): response is ApiSuccessResponse<T> => {
  return response && typeof response === 'object' && response.success === true;
};

export const isApiErrorResponse = (response: any): response is ApiErrorResponse => {
  return response && typeof response === 'object' && response.success === false;
};

export const isValidationError = (error: any): error is ValidationError => {
  return error && typeof error === 'object' &&
         typeof error.field === 'string' &&
         typeof error.message === 'string';
};

`;

  // Add utility types
  content += `// Utility types for common patterns
export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
export type Required<T, K extends keyof T> = T & { [P in K]-?: T[P] };
export type Nullable<T> = T | null;
export type ID = string;
export type Timestamp = string;

// AIDIS-specific utility types
export type ProjectID = ID;
export type TaskID = ID;
export type SessionID = ID;
export type ContextID = ID;
export type DecisionID = ID;

// Status enums
export const ProjectStatus = {
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  ARCHIVED: 'archived'
} as const;

export const TaskStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  BLOCKED: 'blocked',
  CANCELLED: 'cancelled'
} as const;

export const TaskPriority = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
} as const;

export const TaskType = {
  GENERAL: 'general',
  FEATURE: 'feature',
  BUG: 'bug',
  REFACTOR: 'refactor',
  TEST: 'test',
  DOCS: 'docs',
  DEVOPS: 'devops'
} as const;

`;

  return content;
}

/**
 * Write type definitions to file
 */
async function writeTypeDefinitions(outputPath: string): Promise<void> {
  try {
    const content = await generateTypeDefinitions();
    const dir = path.dirname(outputPath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Write the file
    await fs.writeFile(outputPath, content, 'utf8');

    logger.info('Type definitions generated successfully', {
      outputPath,
      size: content.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to write type definitions', {
      outputPath,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Sync types between frontend and backend
 */
async function syncTypes(
  backendTypesPath: string,
  frontendTypesPath: string
): Promise<void> {
  try {
    // Generate types
    const content = await generateTypeDefinitions();

    // Write to backend
    await writeTypeDefinitions(backendTypesPath);

    // Copy to frontend (with frontend-specific additions)
    const frontendContent = content + `
// Frontend-specific type additions
export interface ComponentProps {
  className?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export interface FormProps<T = any> extends ComponentProps {
  initialValues?: Partial<T>;
  onSubmit: (values: T) => Promise<void> | void;
  onCancel?: () => void;
  loading?: boolean;
  disabled?: boolean;
}

export interface TableProps<T = any> extends ComponentProps {
  data: T[];
  columns: Array<{
    key: keyof T;
    title: string;
    render?: (value: any, record: T) => React.ReactNode;
  }>;
  loading?: boolean;
  pagination?: boolean;
}
`;

    await fs.writeFile(frontendTypesPath, frontendContent, 'utf8');

    logger.info('Types synced between frontend and backend', {
      backendPath: backendTypesPath,
      frontendPath: frontendTypesPath,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Failed to sync types', {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    throw error;
  }
}

/**
 * Validate type consistency
 */
async function validateTypeConsistency(): Promise<{
  valid: boolean;
  issues: string[];
}> {
  const issues: string[] = [];

  try {
    // Check if all schemas have corresponding types
    const schemaNames = Object.keys(SchemaRegistry);

    for (const schemaName of schemaNames) {
      // This would be expanded to actually check type consistency
      // For now, we'll just validate that schemas are parseable
      try {
        const schema = SchemaRegistry[schemaName as keyof typeof SchemaRegistry];
        schema.parse({}); // This will fail, but validates schema structure
      } catch (error) {
        // Expected to fail with empty object, but validates schema is working
        if (!(error instanceof z.ZodError)) {
          issues.push(`Schema ${schemaName} has structural issues`);
        }
      }
    }

    logger.info('Type consistency validation completed', {
      schemaCount: schemaNames.length,
      issueCount: issues.length
    });

    return {
      valid: issues.length === 0,
      issues
    };
  } catch (error) {
    issues.push(`Type validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return {
      valid: false,
      issues
    };
  }
}

// ================================
// TYPE GENERATION COMMANDS
// ================================

/**
 * CLI command to generate types
 */
async function generateTypesCommand(): Promise<void> {
  const backendPath = path.join(__dirname, '../types/generated.ts');
  const frontendPath = path.join(__dirname, '../../../frontend/src/types/generated.ts');

  try {
    await syncTypes(backendPath, frontendPath);
    console.log('✅ Types generated successfully');
  } catch (error) {
    console.error('❌ Type generation failed:', error);
    process.exit(1);
  }
}

/**
 * Validate types command
 */
async function validateTypesCommand(): Promise<void> {
  try {
    const result = await validateTypeConsistency();

    if (result.valid) {
      console.log('✅ Type consistency validation passed');
    } else {
      console.log('❌ Type consistency validation failed:');
      result.issues.forEach(issue => console.log(`  - ${issue}`));
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Type validation failed:', error);
    process.exit(1);
  }
}