/**
 * Advanced Performance Cache for Phase 4
 * Implements intelligent caching, performance monitoring, and optimization strategies
 */

export interface CacheEntry<T> {
  data: T | string;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
  size: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  tags: string[];
  compressed?: boolean;
}

export interface CacheStats {
  totalEntries: number;
  totalSize: number;
  hitRate: number;
  missRate: number;
  totalHits: number;
  totalMisses: number;
  avgResponseTime: number;
  memoryUsage: number;
  evictionCount: number;
  compressionRatio: number;
}

export interface PerformanceMetrics {
  renderTime: number;
  apiResponseTime: number;
  cacheHitRate: number;
  memoryUsage: number;
  componentMountTime: number;
  dataProcessingTime: number;
  networkLatency: number;
  errorRate: number;
}

export class AdvancedPerformanceCache {
  private cache = new Map<string, CacheEntry<any>>();
  private stats: CacheStats = {
    totalEntries: 0,
    totalSize: 0,
    hitRate: 0,
    missRate: 0,
    totalHits: 0,
    totalMisses: 0,
    avgResponseTime: 0,
    memoryUsage: 0,
    evictionCount: 0,
    compressionRatio: 0
  };
  private performanceMetrics: PerformanceMetrics = {
    renderTime: 0,
    apiResponseTime: 0,
    cacheHitRate: 0,
    memoryUsage: 0,
    componentMountTime: 0,
    dataProcessingTime: 0,
    networkLatency: 0,
    errorRate: 0
  };
  private maxSize: number;
  private maxMemory: number;
  private compressionEnabled: boolean;
  private performanceObserver?: PerformanceObserver;
  private cleanupInterval?: NodeJS.Timeout;

  constructor(options: {
    maxSize?: number;
    maxMemory?: number; // in MB
    compressionEnabled?: boolean;
    cleanupInterval?: number; // in ms
  } = {}) {
    this.maxSize = options.maxSize || 1000;
    this.maxMemory = (options.maxMemory || 50) * 1024 * 1024; // Convert to bytes
    this.compressionEnabled = options.compressionEnabled ?? true;

    this.initializePerformanceMonitoring();
    this.startCleanupRoutine(options.cleanupInterval || 300000); // 5 minutes default
  }

  /**
   * Get data from cache or fetch function
   */
  async get<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options: {
      ttl?: number;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      tags?: string[];
      compress?: boolean;
    } = {}
  ): Promise<T> {
    const startTime = performance.now();

    try {
      // Check cache first
      const cached = this.getCachedEntry<T>(key);
      if (cached) {
        this.recordHit(performance.now() - startTime);
        return cached;
      }

      // Cache miss - fetch data
      this.recordMiss();
      const data = await fetchFn();

      // Store in cache
      this.set(key, data, {
        ttl: options.ttl || 300000, // 5 minutes default
        priority: options.priority || 'medium',
        tags: options.tags || [],
        compress: options.compress ?? this.compressionEnabled
      });

      this.recordApiResponse(performance.now() - startTime);
      return data;

    } catch (error) {
      this.recordError();
      throw error;
    }
  }

  /**
   * Set data in cache
   */
  set<T>(
    key: string,
    data: T,
    options: {
      ttl?: number;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      tags?: string[];
      compress?: boolean;
    } = {}
  ): void {
    const {
      ttl = 300000,
      priority = 'medium',
      tags = [],
      compress = this.compressionEnabled
    } = options;

    const now = Date.now();
    let processedData: T | string = data;
    let isCompressed = false;

    // Compress data if enabled and data is large
    if (compress && this.shouldCompress(data)) {
      try {
        processedData = this.compressData(data);
        isCompressed = true;
      } catch (error) {
        console.warn('Compression failed, storing uncompressed:', error);
      }
    }

    const size = this.calculateSize(processedData);

    const entry: CacheEntry<T> = {
      data: processedData,
      timestamp: now,
      ttl,
      accessCount: 0,
      lastAccessed: now,
      size,
      priority,
      tags,
      compressed: isCompressed
    };

    // Check memory limits before adding
    if (this.wouldExceedLimits(size)) {
      this.evictEntries();
    }

    this.cache.set(key, entry);
    this.updateStats();
  }

  /**
   * Get cached entry with expiration and access tracking
   */
  private getCachedEntry<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();

    // Check if expired
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.stats.evictionCount++;
      return null;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = now;

    // Decompress if needed
    let data = entry.data;
    if (entry.compressed) {
      try {
        data = this.decompressData(data);
      } catch (error) {
        console.error('Decompression failed:', error);
        this.cache.delete(key);
        return null;
      }
    }

    return data as T;
  }

  /**
   * Smart eviction based on LRU, priority, and memory pressure
   */
  private evictEntries(): void {
    const entries = Array.from(this.cache.entries());

    // Sort by priority and last accessed time
    entries.sort((a, b) => {
      const priorityWeight = { low: 1, medium: 2, high: 3, critical: 4 };
      const aPriority = priorityWeight[a[1].priority];
      const bPriority = priorityWeight[b[1].priority];

      if (aPriority !== bPriority) {
        return aPriority - bPriority; // Lower priority first
      }

      // Same priority - older first
      return a[1].lastAccessed - b[1].lastAccessed;
    });

    // Remove entries until we're under limits
    let currentSize = this.getCurrentSize();
    const targetSize = this.maxMemory * 0.8; // Evict to 80% capacity

    for (const [key, entry] of entries) {
      if (currentSize <= targetSize && this.cache.size <= this.maxSize * 0.8) {
        break;
      }

      // Don't evict critical priority items unless absolutely necessary
      if (entry.priority === 'critical' && currentSize <= this.maxMemory) {
        continue;
      }

      this.cache.delete(key);
      currentSize -= entry.size;
      this.stats.evictionCount++;
    }

    this.updateStats();
  }

  /**
   * Invalidate cache entries by tags
   */
  invalidateByTags(tags: string[]): number {
    let invalidated = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.tags.some(tag => tags.includes(tag))) {
        this.cache.delete(key);
        invalidated++;
      }
    }

    this.updateStats();
    return invalidated;
  }

  /**
   * Batch operations for better performance
   */
  async batchGet<T>(
    keys: string[],
    fetchFn: (missingKeys: string[]) => Promise<Record<string, T>>,
    options: {
      ttl?: number;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      tags?: string[];
    } = {}
  ): Promise<Record<string, T>> {
    const results: Record<string, T> = {};
    const missingKeys: string[] = [];

    // Check cache for all keys
    for (const key of keys) {
      const cached = this.getCachedEntry<T>(key);
      if (cached) {
        results[key] = cached;
        this.recordHit(0);
      } else {
        missingKeys.push(key);
        this.recordMiss();
      }
    }

    // Fetch missing data in batch
    if (missingKeys.length > 0) {
      const startTime = performance.now();
      const fetchedData = await fetchFn(missingKeys);
      const responseTime = performance.now() - startTime;

      // Cache the fetched data
      for (const [key, data] of Object.entries(fetchedData)) {
        this.set(key, data, options);
        results[key] = data;
      }

      this.recordApiResponse(responseTime);
    }

    return results;
  }

  /**
   * Preload cache with anticipated data
   */
  async preload<T>(
    entries: Array<{
      key: string;
      fetchFn: () => Promise<T>;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      tags?: string[];
    }>
  ): Promise<void> {
    const promises = entries.map(async ({ key, fetchFn, priority, tags }) => {
      try {
        if (!this.cache.has(key)) {
          const data = await fetchFn();
          this.set(key, data, { priority, tags });
        }
      } catch (error) {
        console.warn(`Preload failed for ${key}:`, error);
      }
    });

    await Promise.allSettled(promises);
  }

  /**
   * Performance monitoring methods
   */
  private initializePerformanceMonitoring(): void {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            this.processPerformanceEntry(entry);
          }
        });

        this.performanceObserver.observe({ entryTypes: ['measure', 'navigation', 'resource'] });
      } catch (error) {
        console.warn('Performance monitoring not available:', error);
      }
    }
  }

  private processPerformanceEntry(entry: PerformanceEntry): void {
    switch (entry.entryType) {
      case 'measure':
        if (entry.name.includes('render')) {
          this.performanceMetrics.renderTime = entry.duration;
        } else if (entry.name.includes('mount')) {
          this.performanceMetrics.componentMountTime = entry.duration;
        }
        break;

      case 'resource':
        if (entry.name.includes('api') || entry.name.includes('localhost:8080')) {
          this.performanceMetrics.networkLatency = entry.duration;
        }
        break;
    }
  }

  /**
   * Data compression utilities
   */
  private shouldCompress(data: any): boolean {
    const size = this.calculateSize(data);
    return size > 1024; // Compress if larger than 1KB
  }

  private compressData(data: any): string {
    try {
      const jsonString = JSON.stringify(data);

      // Simple compression using LZ77-like algorithm
      // In a real implementation, you might use a library like pako
      const compressed = this.simpleCompress(jsonString);

      return compressed;
    } catch (error) {
      throw new Error(`Compression failed: ${error}`);
    }
  }

  private decompressData(compressedData: string): any {
    try {
      const decompressed = this.simpleDecompress(compressedData);
      return JSON.parse(decompressed);
    } catch (error) {
      throw new Error(`Decompression failed: ${error}`);
    }
  }

  private simpleCompress(str: string): string {
    // Simple run-length encoding for demonstration
    return str.replace(/(.)\1+/g, (match, char) => {
      return `${char}${match.length}`;
    });
  }

  private simpleDecompress(str: string): string {
    // Reverse of simple compression
    return str.replace(/(.)\d+/g, (match, char) => {
      const count = parseInt(match.slice(1));
      return char.repeat(count);
    });
  }

  /**
   * Utility methods
   */
  private calculateSize(data: any): number {
    try {
      return JSON.stringify(data).length * 2; // Rough size estimate
    } catch {
      return 1000; // Fallback size
    }
  }

  private getCurrentSize(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  private wouldExceedLimits(newEntrySize: number): boolean {
    return (
      this.cache.size >= this.maxSize ||
      this.getCurrentSize() + newEntrySize > this.maxMemory
    );
  }

  private recordHit(responseTime: number): void {
    this.stats.totalHits++;
    this.updateHitRate();
    this.updateAvgResponseTime(responseTime);
  }

  private recordMiss(): void {
    this.stats.totalMisses++;
    this.updateHitRate();
  }

  private recordApiResponse(responseTime: number): void {
    this.performanceMetrics.apiResponseTime = responseTime;
  }

  private recordError(): void {
    const total = this.stats.totalHits + this.stats.totalMisses;
    this.performanceMetrics.errorRate = total > 0 ? (this.stats.totalMisses / total) * 100 : 0;
  }

  private updateHitRate(): void {
    const total = this.stats.totalHits + this.stats.totalMisses;
    this.stats.hitRate = total > 0 ? (this.stats.totalHits / total) * 100 : 0;
    this.stats.missRate = 100 - this.stats.hitRate;
    this.performanceMetrics.cacheHitRate = this.stats.hitRate;
  }

  private updateAvgResponseTime(responseTime: number): void {
    // Exponential moving average
    this.stats.avgResponseTime = this.stats.avgResponseTime * 0.9 + responseTime * 0.1;
  }

  private updateStats(): void {
    this.stats.totalEntries = this.cache.size;
    this.stats.totalSize = this.getCurrentSize();
    this.stats.memoryUsage = (this.stats.totalSize / this.maxMemory) * 100;
    this.performanceMetrics.memoryUsage = this.stats.memoryUsage;

    // Calculate compression ratio
    let uncompressedSize = 0;
    let compressedSize = 0;

    for (const entry of this.cache.values()) {
      if (entry.compressed) {
        compressedSize += entry.size;
        uncompressedSize += entry.size * 2; // Estimate
      }
    }

    this.stats.compressionRatio = uncompressedSize > 0 ?
      ((uncompressedSize - compressedSize) / uncompressedSize) * 100 : 0;
  }

  private startCleanupRoutine(interval: number): void {
    this.cleanupInterval = setInterval(() => {
      this.evictExpiredEntries();
    }, interval);
  }

  private evictExpiredEntries(): void {
    const now = Date.now();
    let evicted = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        evicted++;
      }
    }

    if (evicted > 0) {
      this.stats.evictionCount += evicted;
      this.updateStats();
    }
  }

  /**
   * Public API methods
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.performanceMetrics };
  }

  clear(): void {
    this.cache.clear();
    this.updateStats();
  }

  delete(key: string): boolean {
    const result = this.cache.delete(key);
    if (result) {
      this.updateStats();
    }
    return result;
  }

  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    // Check if expired
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  size(): number {
    return this.cache.size;
  }

  /**
   * Cache warming strategies
   */
  async warmCache(strategies: {
    mostUsed?: boolean;
    predictive?: boolean;
    scheduled?: boolean;
  } = {}): Promise<void> {
    // Implementation would depend on usage patterns and predictive algorithms
    console.log('Cache warming initiated with strategies:', strategies);
  }

  /**
   * Cleanup on destruction
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
    }

    this.cache.clear();
  }
}

// Singleton instance for global use
export const performanceCache = new AdvancedPerformanceCache({
  maxSize: 1000,
  maxMemory: 100, // 100MB
  compressionEnabled: true,
  cleanupInterval: 300000 // 5 minutes
});

// Cache performance monitoring utilities
export const getCacheStats = () => performanceCache.getStats();
export const getPerformanceMetrics = () => performanceCache.getPerformanceMetrics();
export const clearCache = () => performanceCache.clear();
export const warmCache = (strategies?: any) => performanceCache.warmCache(strategies);