/**
 * Connection-related type definitions
 * See CONTRACTS.md for full documentation
 */

export enum ConnectionType {
  Import = 'import',
  FunctionCall = 'function_call',
  Inheritance = 'inheritance',
  Implementation = 'implementation',
  TypeReference = 'type_reference',
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
  type: ConnectionType;
  weight: number;
  metadata: ConnectionMetadata;
}

export interface ConnectionMetadata {
  isCircular: boolean;
  callCount: number;
  locations: ConnectionLocation[];
}

export interface ConnectionLocation {
  filePath: string;
  line: number;
  column: number;
}
