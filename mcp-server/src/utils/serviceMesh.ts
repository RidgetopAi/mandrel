/**
 * AIDIS Service Mesh Utilities
 * Circuit breaker, retry logic, and service discovery patterns
 */

import { EventEmitter } from 'events';

interface ServiceEndpoint {
  name: string;
  url: string;
  healthCheck: string;
  timeout: number;
  retries: number;
}

interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

enum CircuitState {
  CLOSED = 'CLOSED',     // Normal operation
  OPEN = 'OPEN',         // Circuit breaker active
  HALF_OPEN = 'HALF_OPEN' // Testing if service recovered
}

class ServiceMeshClient extends EventEmitter {
  private services = new Map<string, ServiceEndpoint>();
  private circuitBreakers = new Map<string, CircuitBreakerState>();
  private healthChecks = new Map<string, boolean>();

  constructor() {
    super();
    this.initializeServices();
    this.startHealthChecking();
  }

  private initializeServices(): void {
    // Register AIDIS services with service mesh
    this.registerService({
      name: 'mcp-server',
      url: 'http://aidis-mcp-server:8080',
      healthCheck: '/healthz',
      timeout: 10000,
      retries: 3,
    });

    this.registerService({
      name: 'command-backend',
      url: 'http://aidis-command-backend:3001',
      healthCheck: '/health',
      timeout: 5000,
      retries: 3,
    });

    this.registerService({
      name: 'redis',
      url: 'redis://aidis-redis:6379',
      healthCheck: '/ping',
      timeout: 3000,
      retries: 2,
    });

    this.registerService({
      name: 'postgres',
      url: 'postgresql://aidis-postgres:5432',
      healthCheck: '/pg_isready',
      timeout: 5000,
      retries: 2,
    });
  }

  registerService(endpoint: ServiceEndpoint): void {
    this.services.set(endpoint.name, endpoint);
    this.circuitBreakers.set(endpoint.name, {
      state: CircuitState.CLOSED,
      failureCount: 0,
      lastFailure: 0,
      config: {
        failureThreshold: 5,
        resetTimeout: 60000, // 1 minute
        monitoringPeriod: 30000, // 30 seconds
      },
    });
    this.healthChecks.set(endpoint.name, false);
  }

  async callService(serviceName: string, path: string = '', options: any = {}): Promise<any> {
    const service = this.services.get(serviceName);
    if (!service) {
      throw new Error(`Service ${serviceName} not registered`);
    }

    const circuitBreaker = this.circuitBreakers.get(serviceName)!;

    // Check circuit breaker state
    if (circuitBreaker.state === CircuitState.OPEN) {
      if (Date.now() - circuitBreaker.lastFailure < circuitBreaker.config.resetTimeout) {
        throw new Error(`Circuit breaker OPEN for service ${serviceName}`);
      } else {
        // Try to transition to HALF_OPEN
        circuitBreaker.state = CircuitState.HALF_OPEN;
        this.emit('circuit-breaker-half-open', { serviceName });
      }
    }

    // Implement retry logic with exponential backoff
    const maxRetries = service.retries;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.makeHttpRequest(service, path, options);

        // Success - reset circuit breaker if needed
        if (circuitBreaker.state !== CircuitState.CLOSED) {
          circuitBreaker.state = CircuitState.CLOSED;
          circuitBreaker.failureCount = 0;
          this.emit('circuit-breaker-closed', { serviceName });
        }

        this.healthChecks.set(serviceName, true);
        return response;

      } catch (error) {
        lastError = error as Error;
        this.recordFailure(serviceName);

        if (attempt < maxRetries) {
          // Exponential backoff: 2^attempt * 100ms
          const delay = Math.pow(2, attempt) * 100;
          await new Promise(resolve => setTimeout(resolve, delay));
          console.warn(`Retry ${attempt}/${maxRetries} for ${serviceName} after ${delay}ms`);
        }
      }
    }

    // All retries exhausted
    this.healthChecks.set(serviceName, false);
    throw lastError || new Error(`Service ${serviceName} call failed after ${maxRetries} retries`);
  }

  private async makeHttpRequest(service: ServiceEndpoint, path: string, options: any): Promise<any> {
    const url = `${service.url}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), service.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'User-Agent': 'AIDIS-ServiceMesh/1.0',
          'X-Request-ID': this.generateRequestId(),
          ...options.headers,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private recordFailure(serviceName: string): void {
    const circuitBreaker = this.circuitBreakers.get(serviceName)!;
    circuitBreaker.failureCount++;
    circuitBreaker.lastFailure = Date.now();

    if (circuitBreaker.failureCount >= circuitBreaker.config.failureThreshold) {
      circuitBreaker.state = CircuitState.OPEN;
      this.emit('circuit-breaker-open', {
        serviceName,
        failureCount: circuitBreaker.failureCount
      });
      console.error(`Circuit breaker OPEN for ${serviceName} after ${circuitBreaker.failureCount} failures`);
    }
  }

  private async startHealthChecking(): Promise<void> {
    setInterval(async () => {
      for (const [name, service] of this.services) {
        try {
          await this.makeHttpRequest(service, service.healthCheck, { method: 'GET' });
          if (!this.healthChecks.get(name)) {
            this.emit('service-healthy', { serviceName: name });
          }
          this.healthChecks.set(name, true);
        } catch (error) {
          if (this.healthChecks.get(name)) {
            this.emit('service-unhealthy', { serviceName: name, error });
          }
          this.healthChecks.set(name, false);
        }
      }
    }, 30000); // Health check every 30 seconds
  }

  getServiceHealth(): Record<string, boolean> {
    return Object.fromEntries(this.healthChecks);
  }

  getCircuitBreakerStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    for (const [name, cb] of this.circuitBreakers) {
      status[name] = {
        state: cb.state,
        failureCount: cb.failureCount,
        lastFailure: cb.lastFailure,
      };
    }
    return status;
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailure: number;
  config: CircuitBreakerConfig;
}

// Singleton instance for service mesh
let serviceMeshClient: ServiceMeshClient | null = null;

export function getServiceMeshClient(): ServiceMeshClient {
  if (!serviceMeshClient) {
    serviceMeshClient = new ServiceMeshClient();
  }
  return serviceMeshClient;
}

// Health check helper
export async function isServiceHealthy(serviceName: string): Promise<boolean> {
  const client = getServiceMeshClient();
  return client.getServiceHealth()[serviceName] || false;
}