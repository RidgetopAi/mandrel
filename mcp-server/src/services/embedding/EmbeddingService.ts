/**
 * Embedding Service
 * 
 * Main service class that orchestrates embedding generation.
 * Supports multiple backends: local Transformers.js, OpenAI, and mock.
 */

import {
  EmbeddingError,
  EmbeddingErrorType,
  EmbeddingVector,
  EmbeddingRequest,
  EmbeddingMetrics,
  EmbeddingHealthStatus,
  EmbeddingStatus,
  EmbeddingConfig,
  RetryConfig,
  createDefaultMetrics
} from './types.js';
import { createRetryConfig, isRetryableError } from './retry.js';
import { generateLocalEmbedding, initializeLocalModel, isLocalModelLoaded, getLocalModelName } from './localModel.js';
import { generateOpenAIEmbedding, isOpenAIAvailable } from './openai.js';
import { generateMockEmbedding } from './mock.js';
import { applyTargetDimensions } from './normalize.js';
import { calculateCosineSimilarity, validateEmbedding } from './similarity.js';
import { validateInput } from './validation.js';

export class EmbeddingService {
  private model: string;
  private dimensions: number;
  private preferLocal: boolean;
  private targetDimensions: number;
  private retryConfig: RetryConfig;
  private metrics: EmbeddingMetrics;
  private maxTextLength: number;
  private modelInitialized: boolean = false;

  constructor() {
    this.model = process.env.EMBEDDING_MODEL || 'text-embedding-ada-002';
    const configuredTarget = parseInt(
      process.env.EMBEDDING_TARGET_DIMENSIONS || process.env.EMBEDDING_DIMENSIONS || '1536'
    );
    this.targetDimensions = Number.isFinite(configuredTarget) && configuredTarget > 0
      ? configuredTarget
      : 1536;

    this.dimensions = this.targetDimensions;
    this.preferLocal = process.env.EMBEDDING_PREFER_LOCAL !== 'false';
    this.retryConfig = createRetryConfig();
    this.metrics = createDefaultMetrics();
    this.maxTextLength = parseInt(process.env.EMBEDDING_MAX_TEXT_LENGTH || '8000');
  }

  /**
   * Record error for monitoring and debugging
   */
  private recordError(message: string): void {
    this.metrics.lastError = message;
    this.metrics.lastErrorTime = new Date();
    console.error(`🔍 EMBEDDING ERROR RECORDED: ${message}`);
  }

  /**
   * Generate vector embedding for text content with comprehensive error handling
   */
  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingVector> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Validate input
      validateInput(request.text, this.maxTextLength);
      const text = request.text.trim();

      console.log(`📝 Generating embedding for text (${text.length} chars): "${text.substring(0, 60)}..."`);

      let result: EmbeddingVector | undefined;
      let errors: EmbeddingError[] = [];

      // Try local model first (if preferred)
      if (this.preferLocal) {
        try {
          const localResult = await generateLocalEmbedding(text, this.retryConfig);
          result = applyTargetDimensions(localResult, 'local', this.targetDimensions);
          this.metrics.localModelSuccesses++;
          this.modelInitialized = true;
          console.log(`✅ Successfully generated embedding using local model`);
        } catch (error) {
          const err = error as Error;
          const embeddingError = err instanceof EmbeddingError ? err :
            new EmbeddingError(
              `Local embedding generation failed: ${err.message}`,
              EmbeddingErrorType.MODEL_INFERENCE,
              isRetryableError(err),
              err
            );
          errors.push(embeddingError);
          console.warn('⚠️  Local embedding failed, trying alternatives:', embeddingError.message);
        }
      }

      // Try OpenAI API if local failed or not preferred
      if (!result) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (isOpenAIAvailable() && apiKey) {
          try {
            const openAIResult = await generateOpenAIEmbedding(text, apiKey, this.model, this.retryConfig);
            result = applyTargetDimensions(openAIResult, 'openai', this.targetDimensions);
            this.metrics.openAiSuccesses++;
            console.log(`✅ Successfully generated embedding using OpenAI API`);
          } catch (error) {
            const err = error as Error;
            const embeddingError = err instanceof EmbeddingError ? err :
              new EmbeddingError(
                `OpenAI embedding generation failed: ${err.message}`,
                EmbeddingErrorType.API_ERROR,
                isRetryableError(err),
                err
              );
            errors.push(embeddingError);
            console.warn('⚠️  OpenAI embedding failed, trying alternatives:', embeddingError.message);
          }
        }
      }

      // If local wasn't preferred, try it as backup
      if (!result && !this.preferLocal) {
        try {
          const backupLocal = await generateLocalEmbedding(text, this.retryConfig);
          result = applyTargetDimensions(backupLocal, 'local-backup', this.targetDimensions);
          this.metrics.localModelSuccesses++;
          this.modelInitialized = true;
          console.log(`✅ Successfully generated embedding using local model (backup)`);
        } catch (error) {
          const err = error as Error;
          const embeddingError = err instanceof EmbeddingError ? err :
            new EmbeddingError(
              `Local embedding backup failed: ${err.message}`,
              EmbeddingErrorType.MODEL_INFERENCE,
              isRetryableError(err),
              err
            );
          errors.push(embeddingError);
          console.warn('⚠️  Local embedding backup failed:', embeddingError.message);
        }
      }

      // In production, throw error if all methods failed
      if (!result) {
        const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

        if (!isDevelopment) {
          const combinedMessage = errors.map(e => e.message).join('; ');
          this.recordError(`All embedding methods failed: ${combinedMessage}`);
          this.metrics.failedRequests++;

          throw new EmbeddingError(
            `Failed to generate embedding using all available methods: ${combinedMessage}`,
            EmbeddingErrorType.UNKNOWN,
            false
          );
        }

        // In development/testing, allow mock fallback
        console.warn('⚠️  All embedding methods failed, using mock embeddings (development mode only)');
        const mockEmbedding = generateMockEmbedding(text, this.targetDimensions, this.model);
        result = applyTargetDimensions(mockEmbedding, 'mock', this.targetDimensions);
        this.metrics.mockFallbacks++;
      }

      // Record successful request
      this.metrics.successfulRequests++;
      const processingTime = Date.now() - startTime;
      this.metrics.totalProcessingTime += processingTime;
      this.metrics.averageProcessingTime = this.metrics.totalProcessingTime / this.metrics.successfulRequests;

      console.log(`⏱️  Embedding generated in ${processingTime}ms (${result.dimensions}D, model: ${result.model})`);
      return result;

    } catch (error) {
      const err = error as Error;
      this.metrics.failedRequests++;
      const processingTime = Date.now() - startTime;
      this.recordError(err.message);

      console.error(`❌ Embedding generation failed after ${processingTime}ms:`, err.message);

      if (err instanceof EmbeddingError) {
        throw err;
      }

      throw new EmbeddingError(
        `Embedding generation failed: ${err.message}`,
        EmbeddingErrorType.UNKNOWN,
        false,
        err
      );
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateCosineSimilarity(a: number[], b: number[]): number {
    return calculateCosineSimilarity(a, b);
  }

  /**
   * Validate embedding vector format
   */
  validateEmbedding(embedding: number[]): boolean {
    return validateEmbedding(embedding, this.dimensions);
  }

  /**
   * Check if the embedding service is healthy
   */
  async isHealthy(): Promise<boolean> {
    try {
      const testText = "health check";
      const result = await this.generateEmbedding({ text: testText });
      return result &&
             Array.isArray(result.embedding) &&
             result.embedding.length > 0 &&
             result.embedding.every(val => isFinite(val));
    } catch (error) {
      const err = error as Error;
      console.error('🌡️  Health check failed:', err.message);
      return false;
    }
  }

  /**
   * Get detailed health status including model readiness
   */
  async getHealthStatus(): Promise<EmbeddingHealthStatus> {
    const healthy = await this.isHealthy();

    let localModelReady = false;
    try {
      if (isLocalModelLoaded()) {
        localModelReady = true;
      } else {
        await initializeLocalModel();
        localModelReady = true;
      }
    } catch {
      localModelReady = false;
    }

    return {
      healthy,
      localModelReady,
      openAiAvailable: isOpenAIAvailable(),
      lastError: this.metrics.lastError,
      lastErrorTime: this.metrics.lastErrorTime,
      metrics: { ...this.metrics }
    };
  }

  /**
   * Get performance metrics for monitoring
   */
  getMetrics(): EmbeddingMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = createDefaultMetrics();
    console.log('🔄 Embedding service metrics reset');
  }

  /**
   * Get comprehensive service status for debugging
   */
  async getStatus(): Promise<EmbeddingStatus> {
    const config = this.getConfig();
    const health = await this.getHealthStatus();
    const metrics = this.getMetrics();

    return {
      config,
      health,
      metrics,
      runtime: {
        uptime: process.uptime(),
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage()
      }
    };
  }

  /**
   * Get service configuration info
   */
  getConfig(): EmbeddingConfig {
    return {
      model: this.model,
      localModel: getLocalModelName(),
      dimensions: this.dimensions,
      preferLocal: this.preferLocal,
      maxTextLength: this.maxTextLength,
      retryConfig: { ...this.retryConfig },
      hasRealApiKey: isOpenAIAvailable(),
      localModelLoaded: isLocalModelLoaded(),
      modelInitialized: this.modelInitialized,
      mode: this.preferLocal ? 'local' :
            (isOpenAIAvailable() ? 'openai' : 'mock'),
    };
  }
}
