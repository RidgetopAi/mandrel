/**
 * AIDIS Embedding Service
 * 
 * This service converts text content into vector embeddings for semantic search.
 * It handles the magic of turning human language into mathematical vectors that
 * capture semantic meaning.
 * 
 * Supports multiple embedding backends:
 * 1. Local models via Transformers.js (FREE, runs offline!)
 * 2. OpenAI API (production grade, costs money)
 * 3. Mock embeddings (development/testing)
 */

import { pipeline } from '@xenova/transformers';

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
interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

// Performance and monitoring metrics
interface EmbeddingMetrics {
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

export class EmbeddingService {
  private model: string;
  private dimensions: number;
  private localModel: any = null;
  private localModelName: string = 'Xenova/all-MiniLM-L6-v2'; // Emits 384D embeddings which we normalize downstream
  private preferLocal: boolean;
  private targetDimensions: number;
  private retryConfig: RetryConfig;
  private metrics: EmbeddingMetrics;
  private maxTextLength: number = 8000; // Reasonable limit for embedding models
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
    this.preferLocal = process.env.EMBEDDING_PREFER_LOCAL !== 'false'; // Default to local

    // Initialize retry configuration
    this.retryConfig = {
      maxRetries: parseInt(process.env.EMBEDDING_MAX_RETRIES || '3'),
      baseDelay: parseInt(process.env.EMBEDDING_BASE_DELAY || '1000'), // 1 second
      maxDelay: parseInt(process.env.EMBEDDING_MAX_DELAY || '30000'), // 30 seconds
      backoffMultiplier: parseFloat(process.env.EMBEDDING_BACKOFF_MULTIPLIER || '2.0')
    };

    // Initialize metrics
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      localModelSuccesses: 0,
      openAiSuccesses: 0,
      mockFallbacks: 0
    };

    // Configure max text length
    this.maxTextLength = parseInt(process.env.EMBEDDING_MAX_TEXT_LENGTH || '8000');
  }

  /**
   * Validates input text before processing
   */
  private validateInput(text: string): void {
    if (!text || typeof text !== 'string') {
      throw new EmbeddingError(
        'Input text must be a non-empty string',
        EmbeddingErrorType.INPUT_VALIDATION
      );
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) {
      throw new EmbeddingError(
        'Input text cannot be empty or whitespace only',
        EmbeddingErrorType.INPUT_VALIDATION
      );
    }

    if (trimmed.length > this.maxTextLength) {
      throw new EmbeddingError(
        `Input text too long: ${trimmed.length} characters (max: ${this.maxTextLength})`,
        EmbeddingErrorType.INPUT_VALIDATION
      );
    }

    // Check for potentially problematic characters
    const controlCharsRegex = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
    if (controlCharsRegex.test(trimmed)) {
      throw new EmbeddingError(
        'Input text contains control characters that may cause processing issues',
        EmbeddingErrorType.INPUT_VALIDATION
      );
    }
  }

  /**
   * Sleep function for retry delays
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Calculate delay for retry with exponential backoff and jitter
   */
  private calculateRetryDelay(attempt: number): number {
    const delay = Math.min(
      this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt),
      this.retryConfig.maxDelay
    );

    // Add jitter (±25% random variation) to prevent thundering herd
    const jitter = delay * 0.25 * (Math.random() - 0.5);
    return Math.floor(delay + jitter);
  }

  /**
   * Determines if an error is retryable
   */
  private isRetryableError(error: any): boolean {
    if (error instanceof EmbeddingError) {
      return error.isRetryable;
    }

    // Network errors are generally retryable
    if (error.code === 'ECONNRESET' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // HTTP status codes that indicate retryable errors
    if (error.status) {
      const retryableStatuses = [408, 429, 500, 502, 503, 504];
      return retryableStatuses.includes(error.status);
    }

    // Transformers.js specific errors that might be retryable
    const errorMessage = error.message?.toLowerCase() || '';
    if (errorMessage.includes('network') ||
        errorMessage.includes('timeout') ||
        errorMessage.includes('temporary') ||
        errorMessage.includes('rate limit')) {
      return true;
    }

    return false;
  }

  /**
   * Execute a function with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const result = await operation();
        if (attempt > 0) {
          console.log(`✅ ${operationName} succeeded after ${attempt} retries`);
        }
        return result;
      } catch (error) {
        const err = error as Error;
        lastError = err;

        if (attempt === this.retryConfig.maxRetries) {
          console.error(`❌ ${operationName} failed after ${attempt} retries:`, err.message);
          break;
        }

        if (!this.isRetryableError(err)) {
          console.error(`❌ ${operationName} failed with non-retryable error:`, err.message);
          throw err;
        }

        const delay = this.calculateRetryDelay(attempt);
        console.warn(`⚠️ ${operationName} failed (attempt ${attempt + 1}/${this.retryConfig.maxRetries + 1}), retrying in ${delay}ms:`, err.message);
        await this.sleep(delay);
      }
    }

    throw lastError;
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
   * Initialize local embedding model (lazy loading)
   */
  private async initializeLocalModel(): Promise<any> {
    if (this.localModel) {
      return this.localModel;
    }

    console.log(`🔄 Loading local embedding model: ${this.localModelName}`);
    console.log('📦 First run will download model (~25MB), subsequent runs use cached version');
    
    try {
      this.localModel = await pipeline('feature-extraction', this.localModelName);
      console.log('✅ Local embedding model loaded successfully!');
      return this.localModel;
    } catch (error) {
      const err = error as Error;
      console.error('❌ Failed to load local model:', err);
      throw new Error(`Failed to initialize local embedding model: ${err.message}`);
    }
  }

  /**
   * Generate vector embedding for text content with comprehensive error handling
   *
   * Priority order:
   * 1. Local model (if preferLocal=true, which is default)
   * 2. OpenAI API (if available and preferLocal=false)
   * 3. Mock embeddings (fallback for testing - but only in development mode)
   */
  async generateEmbedding(request: EmbeddingRequest): Promise<EmbeddingVector> {
    const startTime = Date.now();
    this.metrics.totalRequests++;

    try {
      // Validate input
      this.validateInput(request.text);
      const text = request.text.trim();

      console.log(`📝 Generating embedding for text (${text.length} chars): "${text.substring(0, 60)}..."`);

      let result: EmbeddingVector;
      let errors: EmbeddingError[] = [];

      // Try local model first (if preferred)
      if (this.preferLocal) {
        try {
          const localResult = await this.generateLocalEmbedding(text);
          result = this.applyTargetDimensions(localResult, 'local');
          this.metrics.localModelSuccesses++;
          console.log(`✅ Successfully generated embedding using local model`);
        } catch (error) {
          const err = error as Error;
          const embeddingError = err instanceof EmbeddingError ? err :
            new EmbeddingError(
              `Local embedding generation failed: ${err.message}`,
              EmbeddingErrorType.MODEL_INFERENCE,
              this.isRetryableError(err),
              err
            );
          errors.push(embeddingError);
          console.warn('⚠️  Local embedding failed, trying alternatives:', embeddingError.message);
        }
      }

      // Try OpenAI API if local failed or not preferred
      if (!result) {
        const apiKey = process.env.OPENAI_API_KEY;
        if (apiKey && apiKey !== 'your_openai_api_key_here' && apiKey.startsWith('sk-')) {
          try {
            const openAIResult = await this.generateOpenAIEmbedding(text, apiKey);
            result = this.applyTargetDimensions(openAIResult, 'openai');
            this.metrics.openAiSuccesses++;
            console.log(`✅ Successfully generated embedding using OpenAI API`);
          } catch (error) {
            const err = error as Error;
            const embeddingError = err instanceof EmbeddingError ? err :
              new EmbeddingError(
                `OpenAI embedding generation failed: ${err.message}`,
                EmbeddingErrorType.API_ERROR,
                this.isRetryableError(err),
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
          const backupLocal = await this.generateLocalEmbedding(text);
          result = this.applyTargetDimensions(backupLocal, 'local-backup');
          this.metrics.localModelSuccesses++;
          console.log(`✅ Successfully generated embedding using local model (backup)`);
        } catch (error) {
          const err = error as Error;
          const embeddingError = err instanceof EmbeddingError ? err :
            new EmbeddingError(
              `Local embedding backup failed: ${err.message}`,
              EmbeddingErrorType.MODEL_INFERENCE,
              this.isRetryableError(err),
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
          // In production, don't fall back to mock - throw error
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
        const mockEmbedding = this.generateMockEmbedding(text);
        result = this.applyTargetDimensions(mockEmbedding, 'mock');
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
      // Record failed request
      const err = error as Error;
      this.metrics.failedRequests++;
      const processingTime = Date.now() - startTime;
      this.recordError(err.message);

      console.error(`❌ Embedding generation failed after ${processingTime}ms:`, err.message);

      // Re-throw as EmbeddingError if not already
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
   * Generate embedding using local Transformers.js model with retry logic
   */
  private async generateLocalEmbedding(text: string): Promise<EmbeddingVector> {
    console.log('🏠 Generating LOCAL embedding (FREE!)...');

    return this.executeWithRetry(async () => {
      const model = await this.initializeLocalModel();

      try {
        // Generate embedding using the local model
        const result = await model(text, { pooling: 'mean', normalize: true });

        // Extract the embedding array from the tensor
        const embedding = Array.from(result.data as Float32Array);

        // Validate the result
        if (!embedding || embedding.length === 0) {
          throw new EmbeddingError(
            'Local model returned empty embedding',
            EmbeddingErrorType.MODEL_INFERENCE,
            false
          );
        }

        // Check for NaN or invalid values
        const hasInvalidValues = embedding.some(val => !isFinite(val));
        if (hasInvalidValues) {
          throw new EmbeddingError(
            'Local model returned embedding with invalid values (NaN/Infinity)',
            EmbeddingErrorType.MODEL_INFERENCE,
            false
          );
        }

        console.log(`✅ Generated LOCAL embedding (${embedding.length} dimensions)`);

        return {
          embedding,
          dimensions: embedding.length,
          model: `${this.localModelName}-local`,
        };
      } catch (error) {
        const err = error as Error;
        if (err instanceof EmbeddingError) {
          throw err;
        }

        // Categorize model inference errors
        const errorMessage = err.message?.toLowerCase() || '';
        let errorType = EmbeddingErrorType.MODEL_INFERENCE;
        let isRetryable = false;

        if (errorMessage.includes('out of memory') || errorMessage.includes('memory')) {
          errorType = EmbeddingErrorType.RESOURCE_EXHAUSTED;
          isRetryable = true;
        } else if (errorMessage.includes('network') || errorMessage.includes('download')) {
          errorType = EmbeddingErrorType.NETWORK_ERROR;
          isRetryable = true;
        }

        throw new EmbeddingError(
          `Local model inference failed: ${err.message}`,
          errorType,
          isRetryable,
          err
        );
      }
    }, 'Local embedding generation');
  }

  /**
   * Generate real OpenAI embedding (when API key is available) with retry logic
   */
  private async generateOpenAIEmbedding(text: string, apiKey: string): Promise<EmbeddingVector> {
    console.log('🔮 Generating real OpenAI embedding...');

    return this.executeWithRetry(async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch('https://api.openai.com/v1/embeddings', {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            input: text,
            model: this.model,
          }),
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          let errorType = EmbeddingErrorType.API_ERROR;
          let isRetryable = false;

          // Categorize API errors
          if (response.status === 429) {
            errorType = EmbeddingErrorType.RESOURCE_EXHAUSTED;
            isRetryable = true;
          } else if (response.status >= 500) {
            isRetryable = true;
          } else if (response.status === 401 || response.status === 403) {
            errorType = EmbeddingErrorType.API_ERROR;
            isRetryable = false;
          }

          const errorText = await response.text().catch(() => response.statusText);
          throw new EmbeddingError(
            `OpenAI API error (${response.status}): ${errorText}`,
            errorType,
            isRetryable
          );
        }

        const data = await response.json();

        // Validate API response structure
        if (!data || !data.data || !Array.isArray(data.data) || data.data.length === 0) {
          throw new EmbeddingError(
            'OpenAI API returned invalid response structure',
            EmbeddingErrorType.API_ERROR,
            false
          );
        }

        const embedding = data.data[0].embedding;

        // Validate embedding data
        if (!Array.isArray(embedding) || embedding.length === 0) {
          throw new EmbeddingError(
            'OpenAI API returned invalid embedding data',
            EmbeddingErrorType.API_ERROR,
            false
          );
        }

        // Check for invalid values
        const hasInvalidValues = embedding.some((val: any) => typeof val !== 'number' || !isFinite(val));
        if (hasInvalidValues) {
          throw new EmbeddingError(
            'OpenAI API returned embedding with invalid values',
            EmbeddingErrorType.API_ERROR,
            false
          );
        }

        console.log(`✅ Generated OpenAI embedding (${embedding.length} dimensions)`);

        return {
          embedding,
          dimensions: embedding.length,
          model: this.model,
        };
      } catch (error) {
        const err = error as Error & { code?: string; name?: string };
        if (err instanceof EmbeddingError) {
          throw err;
        }

        // Handle fetch-specific errors
        if (err.name === 'AbortError') {
          throw new EmbeddingError(
            'OpenAI API request timed out',
            EmbeddingErrorType.NETWORK_ERROR,
            true,
            err
          );
        }

        if (err.code === 'ECONNRESET' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
          throw new EmbeddingError(
            `OpenAI API network error: ${err.message}`,
            EmbeddingErrorType.NETWORK_ERROR,
            true,
            err
          );
        }

        throw new EmbeddingError(
          `OpenAI API request failed: ${err.message}`,
          EmbeddingErrorType.API_ERROR,
          this.isRetryableError(err),
          err
        );
      }
    }, 'OpenAI embedding generation');
  }

  /**
   * Generate mock embedding for development/testing
   * 
   * This creates a deterministic vector based on text content.
   * While not semantically meaningful, it's perfect for testing
   * the vector search infrastructure!
   */
  private generateMockEmbedding(text: string): EmbeddingVector {
    console.log('🎭 Generating mock embedding for development...');
    
    const dimensions = this.targetDimensions;
    const embedding = new Array(dimensions);
    const textHash = this.simpleHash(text);
    
    // Use different aspects of the text to create varied dimensions
    for (let i = 0; i < dimensions; i++) {
      // Create pseudo-random values based on text content and position
      const seed = textHash + i;
      const value = Math.sin(seed * 0.001) * 0.6; // Range roughly [-0.6, 0.6] to leave room for signals
      embedding[i] = value;
    }

    // Add some content-based signals to make similar texts have similar embeddings
    this.addContentSignals(embedding, text);

    console.log(`✅ Generated mock embedding (${dimensions} dimensions before normalization)`);
    
    return {
      embedding,
      dimensions,
      model: `${this.model}-mock`,
    };
  }

  /**
   * Normalize embeddings from different sources to the canonical dimensionality
   */
  private applyTargetDimensions(result: EmbeddingVector, source: string): EmbeddingVector {
    const normalized = this.normalizeEmbedding(result.embedding);

    if (normalized.length !== result.embedding.length) {
      console.log(`🔁 Adjusted ${source} embedding from ${result.embedding.length}D to ${this.targetDimensions}D`);
    }

    return {
      embedding: normalized,
      dimensions: this.targetDimensions,
      model: result.model,
    };
  }

  /**
   * Pad or downsample embeddings so they match the configured dimensionality
   */
  private normalizeEmbedding(rawEmbedding: number[]): number[] {
    const target = this.targetDimensions;
    const source = Array.from(rawEmbedding ?? []);

    if (target <= 0) {
      return source;
    }

    if (source.length === target) {
      return source;
    }

    if (source.length === 0) {
      return new Array(target).fill(0);
    }

    const normalized = new Array<number>(target);

    if (source.length > target) {
      const step = source.length / target;
      for (let i = 0; i < target; i++) {
        normalized[i] = source[Math.floor(i * step)];
      }
    } else {
      for (let i = 0; i < target; i++) {
        normalized[i] = source[i % source.length];
      }
    }

    return normalized;
  }

  /**
   * Add content-based signals to make mock embeddings somewhat meaningful
   */
  private addContentSignals(embedding: number[], text: string): void {
    const words = text.toLowerCase().split(/\s+/);
    
    // Add signals for common development terms
    const signals: Record<string, number[]> = {
      'database': [0, 50, 100],
      'postgresql': [1, 51, 101],
      'mcp': [2, 52, 102],
      'server': [3, 53, 103],
      'typescript': [4, 54, 104],
      'context': [5, 55, 105],
      'embedding': [6, 56, 106],
      'search': [7, 57, 107],
      'vector': [8, 58, 108],
      'agent': [9, 59, 109],
      'error': [10, 60, 110],
      'code': [11, 61, 111],
      'planning': [12, 62, 112],
      'decision': [13, 63, 113],
    };

    // Boost dimensions for words found in text
    words.forEach(word => {
      const positions = signals[word];
      if (positions) {
        positions.forEach(pos => {
          if (pos < embedding.length) {
            embedding[pos] += 0.2; // Boost signal for this concept (keep within [-1,1] range)
          }
        });
      }
    });
  }

  /**
   * Simple hash function for consistent mock embeddings
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  /**
   * Calculate cosine similarity between two embeddings with robust error handling
   * This is used for finding similar contexts
   */
  calculateCosineSimilarity(a: number[], b: number[]): number {
    try {
      // Validate inputs
      if (!Array.isArray(a) || !Array.isArray(b)) {
        throw new EmbeddingError(
          'Similarity calculation requires two arrays',
          EmbeddingErrorType.INPUT_VALIDATION
        );
      }

      if (a.length !== b.length) {
        throw new EmbeddingError(
          `Embeddings must have same dimensions for similarity calculation (got ${a.length} and ${b.length})`,
          EmbeddingErrorType.INPUT_VALIDATION
        );
      }

      if (a.length === 0) {
        throw new EmbeddingError(
          'Cannot calculate similarity for empty embeddings',
          EmbeddingErrorType.INPUT_VALIDATION
        );
      }

      // Check for invalid values
      const hasInvalidA = a.some(val => !isFinite(val));
      const hasInvalidB = b.some(val => !isFinite(val));

      if (hasInvalidA || hasInvalidB) {
        throw new EmbeddingError(
          'Cannot calculate similarity for embeddings with invalid values (NaN/Infinity)',
          EmbeddingErrorType.INPUT_VALIDATION
        );
      }

      let dotProduct = 0;
      let normA = 0;
      let normB = 0;

      for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
      }

      // Handle zero vectors
      if (normA === 0 || normB === 0) {
        console.warn('⚠️  Zero vector detected in similarity calculation, returning 0');
        return 0;
      }

      const similarity = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));

      // Clamp to valid range due to floating point precision
      return Math.max(-1, Math.min(1, similarity));
    } catch (error) {
      const err = error as Error;
      if (err instanceof EmbeddingError) {
        throw err;
      }

      throw new EmbeddingError(
        `Similarity calculation failed: ${err.message}`,
        EmbeddingErrorType.UNKNOWN,
        false,
        err
      );
    }
  }

  /**
   * Validate embedding vector format with detailed error reporting
   */
  validateEmbedding(embedding: number[]): boolean {
    if (!Array.isArray(embedding)) {
      console.warn('⚠️  Embedding validation failed: not an array');
      return false;
    }

    if (embedding.length !== this.dimensions) {
      console.warn(`⚠️  Embedding validation failed: wrong dimensions (got ${embedding.length}, expected ${this.dimensions})`);
      return false;
    }

    const invalidValues = embedding.filter((val, idx) => {
      const isValid = typeof val === 'number' && !isNaN(val) && isFinite(val) && val >= -1 && val <= 1;
      if (!isValid) {
        console.warn(`⚠️  Embedding validation failed: invalid value at index ${idx}: ${val} (type: ${typeof val})`);
      }
      return !isValid;
    });

    return invalidValues.length === 0;
  }

  /**
   * Check if the embedding service is healthy and ready to process requests
   */
  async isHealthy(): Promise<boolean> {
    try {
      // Test with a simple text to verify the service works
      const testText = "health check";
      const result = await this.generateEmbedding({ text: testText });

      // Verify we got a valid embedding
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
  async getHealthStatus(): Promise<{
    healthy: boolean;
    localModelReady: boolean;
    openAiAvailable: boolean;
    lastError?: string;
    lastErrorTime?: Date;
    metrics: EmbeddingMetrics;
  }> {
    const healthy = await this.isHealthy();

    // Test local model specifically
    let localModelReady = false;
    try {
      if (this.localModel) {
        localModelReady = true;
      } else {
        // Try to initialize without throwing
        await this.initializeLocalModel();
        localModelReady = true;
      }
    } catch {
      localModelReady = false;
    }

    // Check OpenAI availability
    const apiKey = process.env.OPENAI_API_KEY;
    const openAiAvailable = !!(apiKey && apiKey !== 'your_openai_api_key_here' && apiKey.startsWith('sk-'));

    return {
      healthy,
      localModelReady,
      openAiAvailable,
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
   * Reset metrics (useful for testing or periodic resets)
   */
  resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalProcessingTime: 0,
      averageProcessingTime: 0,
      localModelSuccesses: 0,
      openAiSuccesses: 0,
      mockFallbacks: 0
    };
    console.log('🔄 Embedding service metrics reset');
  }

  /**
   * Get comprehensive service status for debugging
   */
  async getStatus(): Promise<{
    config: any;
    health: any;
    metrics: EmbeddingMetrics;
    runtime: {
      uptime: number;
      nodeVersion: string;
      memoryUsage: NodeJS.MemoryUsage;
    };
  }> {
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
  getConfig() {
    return {
      model: this.model,
      localModel: this.localModelName,
      dimensions: this.dimensions,
      preferLocal: this.preferLocal,
      maxTextLength: this.maxTextLength,
      retryConfig: { ...this.retryConfig },
      hasRealApiKey: !!(process.env.OPENAI_API_KEY &&
                        process.env.OPENAI_API_KEY.startsWith('sk-')),
      localModelLoaded: !!this.localModel,
      modelInitialized: this.modelInitialized,
      mode: this.preferLocal ? 'local' :
            (process.env.OPENAI_API_KEY?.startsWith('sk-') ? 'openai' : 'mock'),
    };
  }
}

// Export singleton instance
export const embeddingService = new EmbeddingService();
