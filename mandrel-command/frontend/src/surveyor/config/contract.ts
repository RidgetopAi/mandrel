/**
 * UI-local, typed mirror of the surveyor-core data-contract enum VALUES.
 *
 * The string values ARE the serialized wire contract (the same JSON the backend
 * READ endpoints emit). The `as` casts are checked against the core enum *types*
 * (from `core-types.ts`), and the view unit tests run against fixtures built from
 * the REAL core enums — so a drift between this mirror and the contract surfaces
 * as a failing view test. Runtime comparisons use these constants instead of the
 * enum objects to keep the comparison values plain strings.
 */

import type { NodeType, ConnectionType } from '../core-types';

export const NODE_TYPE = {
  File: 'file' as NodeType,
  Function: 'function' as NodeType,
  Class: 'class' as NodeType,
  Cluster: 'cluster' as NodeType,
} as const;

export const CONNECTION_TYPE = {
  Import: 'import' as ConnectionType,
  FunctionCall: 'function_call' as ConnectionType,
  Inheritance: 'inheritance' as ConnectionType,
  Implementation: 'implementation' as ConnectionType,
  TypeReference: 'type_reference' as ConnectionType,
} as const;
