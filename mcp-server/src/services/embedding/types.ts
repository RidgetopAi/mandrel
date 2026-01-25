/**
 * Embedding Service Types
 * 
 * Core types, error classes, and interfaces for the embedding service.
 */

// Error types for better error handling
export enum EmbeddingErrorType {
  INPUT_VALIDATION = 'INPUT_VALIDATION',
  MODEL_INITIALIZATION = 'MODEL_INITIALIZATION',
  MODEL_INFERENCE = 'MODEL_INFERENCE',
  NETWORK_ERROR = 'NETWORK_ERROR',
  API_ERROR = 'API_ERROR',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  UNKNOWN = 'UNKNOWN'
}

export class EmbeddingError extends Error {
  constructor(
    message: string,
    public type: EmbeddingErrorType,
    public isRetryable: boolean = false,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'EmbeddingError';
  }
}

// Retry configuration
export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

// Performance and monitoring metrics
export interface EmbeddingMetrics {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalProcessingTime: number;
  averageProcessingTime: number;
  localModelSuccesses: number;
  openAiSuccesses: number;
  mockFallbacks: number;
  lastError?: string;
  lastErrorTime?: Date;
}

export interface EmbeddingVector {
  embedding: number[];
  dimensions: number;
  model: string;
}

export interface EmbeddingRequest {
  text: string;
  model?: string;
}

export interface EmbeddingHealthStatus {
  healthy: boolean;
  localModelReady: boolean;
  openAiAvailable: boolean;
  lastError?: string;
  lastErrorTime?: Date;
  metrics: EmbeddingMetrics;
}

export interface EmbeddingStatus {
  config: EmbeddingConfig;
  health: EmbeddingHealthStatus;
  metrics: EmbeddingMetrics;
  runtime: {
    uptime: number;
    nodeVersion: string;
    memoryUsage: NodeJS.MemoryUsage;
  };
}

export interface EmbeddingConfig {
  model: string;
  localModel: string;
  dimensions: number;
  preferLocal: boolean;
  maxTextLength: number;
  retryConfig: RetryConfig;
  hasRealApiKey: boolean;
  localModelLoaded: boolean;
  modelInitialized: boolean;
  mode: string;
}

// Create default metrics
export function createDefaultMetrics(): EmbeddingMetrics {
  return {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalProcessingTime: 0,
    averageProcessingTime: 0,
    localModelSuccesses: 0,
    openAiSuccesses: 0,
    mockFallbacks: 0
  };
}
