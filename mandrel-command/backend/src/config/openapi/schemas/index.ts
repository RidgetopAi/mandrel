/**
 * OpenAPI Schemas - Barrel Export
 * Combines all schema modules into a single schemas object
 */

import { baseSchemas } from './base.js';
import { projectSchemas } from './projects.js';
import { taskSchemas } from './tasks.js';
import { mcpSchemas } from './mcp.js';
import { contextSchemas } from './contexts.js';
import { decisionSchemas } from './decisions.js';
import { namingSchemas } from './naming.js';
import { sessionSchemas } from './sessions.js';
import { monitoringSchemas } from './monitoring.js';
import { embeddingSchemas } from './embeddings.js';

export const schemas = {
  ...baseSchemas,
  ...projectSchemas,
  ...taskSchemas,
  ...mcpSchemas,
  ...contextSchemas,
  ...decisionSchemas,
  ...namingSchemas,
  ...sessionSchemas,
  ...monitoringSchemas,
  ...embeddingSchemas
};

export {
  baseSchemas,
  projectSchemas,
  taskSchemas,
  mcpSchemas,
  contextSchemas,
  decisionSchemas,
  namingSchemas,
  sessionSchemas,
  monitoringSchemas,
  embeddingSchemas
};
