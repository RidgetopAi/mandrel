/**
 * ORACLE HARDENING: Enhanced Connection Retry Logic
 * Implements circuit breaker pattern and exponential backoff
 */

export interface RetryOptions {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  circuitBreakerThreshold: number;
  circuitBreakerTimeout: number;
}

export interface CircuitBreakerState {
  failures: number;
  lastFailureTime: number;
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

export class EnhancedRetryLogic {
  private circuitBreaker: CircuitBreakerState = {
    failures: 0,
    lastFailureTime: 0,
    state: 'CLOSED'
  };

  constructor(private options: RetryOptions = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    circuitBreakerThreshold: 5,
    circuitBreakerTimeout: 60000
  }) {}

  /**
   * Execute operation with retry logic and circuit breaker
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<T> {
    // Check circuit breaker state
    if (this.circuitBreaker.state === 'OPEN') {
      const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
      if (timeSinceLastFailure < this.options.circuitBreakerTimeout) {
        throw new Error(`Circuit breaker is OPEN for ${operationName}. Failing fast.`);
      } else {
        // Transition to HALF_OPEN for testing
        this.circuitBreaker.state = 'HALF_OPEN';
        console.log(`🔄 Circuit breaker transitioning to HALF_OPEN for ${operationName}`);
      }
    }

    let lastError: Error = new Error('No attempts made');
    let delay = this.options.initialDelay;

    for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
      try {
        console.log(`🔄 Attempt ${attempt}/${this.options.maxRetries} for ${operationName}`);
        
        const result = await operation();
        
        // Success - reset circuit breaker if in HALF_OPEN state
        if (this.circuitBreaker.state === 'HALF_OPEN') {
          this.resetCircuitBreaker();
          console.log(`✅ Circuit breaker reset to CLOSED for ${operationName}`);
        }
        
        return result;
        
      } catch (error) {
        lastError = error as Error;
        console.log(`❌ Attempt ${attempt} failed for ${operationName}: ${lastError.message}`);
        
        // Update circuit breaker on failure
        this.recordFailure();
        
        // Don't wait on last attempt
        if (attempt < this.options.maxRetries) {
          console.log(`⏳ Waiting ${delay}ms before retry...`);
          await this.sleep(delay);
          
          // Exponential backoff with jitter
          delay = Math.min(
            delay * this.options.backoffMultiplier + Math.random() * 1000,
            this.options.maxDelay
          );
        }
      }
    }

    // All retries failed
    if (this.circuitBreaker.failures >= this.options.circuitBreakerThreshold) {
      this.openCircuitBreaker();
      console.log(`🚨 Circuit breaker OPENED for ${operationName} after ${this.circuitBreaker.failures} failures`);
    }

    throw new Error(`${operationName} failed after ${this.options.maxRetries} attempts. Last error: ${lastError.message}`);
  }

  /**
   * Execute with timeout
   */
  async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string = 'operation'
  ): Promise<T> {
    return Promise.race([
      operation(),
      this.createTimeoutPromise<T>(timeoutMs, operationName)
    ]) as Promise<T>;
  }

  /**
   * Execute with both retry and timeout
   */
  async executeWithRetryAndTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string = 'operation'
  ): Promise<T> {
    const timeoutOperation = () => this.executeWithTimeout(operation, timeoutMs, operationName);
    return this.executeWithRetry(timeoutOperation, operationName);
  }

  private recordFailure() {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();
  }

  private resetCircuitBreaker() {
    this.circuitBreaker.failures = 0;
    this.circuitBreaker.lastFailureTime = 0;
    this.circuitBreaker.state = 'CLOSED';
  }

  private openCircuitBreaker() {
    this.circuitBreaker.state = 'OPEN';
    this.circuitBreaker.lastFailureTime = Date.now();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private createTimeoutPromise<T>(timeoutMs: number, operationName: string): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });
  }

  /**
   * Get current circuit breaker status
   */
  getCircuitBreakerStatus() {
    return {
      state: this.circuitBreaker.state,
      failures: this.circuitBreaker.failures,
      lastFailureTime: this.circuitBreaker.lastFailureTime,
      isHealthy: this.circuitBreaker.state === 'CLOSED'
    };
  }

  /**
   * Manually reset circuit breaker (for admin operations)
   */
  manualReset() {
    this.resetCircuitBreaker();
    console.log('🔧 Circuit breaker manually reset');
  }
}

// Global retry logic instance
export const globalRetryLogic = new EnhancedRetryLogic();

/**
 * Decorator for adding retry logic to async functions
 */
export function withRetry<T extends any[], R>(
  target: any,
  propertyKey: string,
  descriptor: TypedPropertyDescriptor<(...args: T) => Promise<R>>
) {
  const originalMethod = descriptor.value;
  
  if (originalMethod) {
    descriptor.value = async function(...args: T): Promise<R> {
      return globalRetryLogic.executeWithRetry(
        () => originalMethod.apply(this, args),
        `${target.constructor.name}.${propertyKey}`
      );
    };
  }
  
  return descriptor;
}

/**
 * Helper for database operations with retry
 */
export async function executeDbOperationWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  return globalRetryLogic.executeWithRetryAndTimeout(
    operation,
    10000, // 10 second timeout for DB operations
    `DB: ${operationName}`
  );
}

/**
 * Helper for MCP operations with retry
 */
export async function executeMcpOperationWithRetry<T>(
  operation: () => Promise<T>,
  operationName: string
): Promise<T> {
  return globalRetryLogic.executeWithRetryAndTimeout(
    operation,
    5000, // 5 second timeout for MCP operations
    `MCP: ${operationName}`
  );
}
