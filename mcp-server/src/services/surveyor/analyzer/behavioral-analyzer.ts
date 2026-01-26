/**
 * Behavioral analyzer - processes functions through LLM for behavioral summaries
 */

import { readFileSync } from 'node:fs';
import type { ScanResult, FunctionNode, SummarySource } from '../types/index.js';
import type { AnalysisProgressCallback, AnalysisCache } from '../types/analyzer.types.js';
import { NodeType } from '../types/node.types.js';
import { LLMClient } from './llm-client.js';
import {
  loadCache,
  saveCache,
  createCache,
  getCachedResult,
  setCachedResult,
  hashFunctionContent,
} from './analysis-cache.js';

/**
 * Options for behavioral analysis
 */
export interface AnalyzeOptions {
  /** Progress callback for UI updates */
  onProgress?: AnalysisProgressCallback;
  /** Skip functions that already have behavioral data */
  skipAnalyzed?: boolean;
  /** Maximum functions to analyze (for testing/limits) */
  maxFunctions?: number;
  /** Directory to store cache (default: .surveyor in project) */
  cacheDir?: string;
  /** Model name for cache tracking */
  model?: string;
  /** Number of concurrent LLM requests (default: 5) */
  concurrency?: number;
}

/**
 * Process items with concurrency limit
 */
async function processWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const currentIndex = index++;
      const item = items[currentIndex]!;
      results[currentIndex] = await processor(item, currentIndex);
    }
  }

  // Start workers up to concurrency limit
  const workers = Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(() => worker());

  await Promise.all(workers);
  return results;
}

/**
 * Extract function code from source file using line numbers
 */
function extractFunctionCode(
  filePath: string,
  startLine: number,
  endLine: number
): string {
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    // Line numbers are 1-indexed
    return lines.slice(startLine - 1, endLine).join('\n');
  } catch {
    return '';
  }
}

/**
 * Analyze all functions in a scan result using LLM
 */
export async function analyzeBehavior(
  scanResult: ScanResult,
  client: LLMClient,
  options: AnalyzeOptions = {}
): Promise<ScanResult> {
  const {
    onProgress,
    skipAnalyzed = true,
    maxFunctions,
    cacheDir,
    model = 'unknown',
    concurrency = 5,
  } = options;

  // Load or create cache
  let cache: AnalysisCache | null = null;
  if (cacheDir) {
    cache = loadCache(cacheDir) || createCache(scanResult.projectPath);
  }

  // Collect all function nodes that need analysis
  const functionsToAnalyze: FunctionNode[] = [];

  for (const node of Object.values(scanResult.nodes)) {
    if (node.type === NodeType.Function) {
      const funcNode = node as FunctionNode;
      // Skip if already analyzed and skipAnalyzed is true
      if (skipAnalyzed && funcNode.behavioral) {
        continue;
      }
      functionsToAnalyze.push(funcNode);
    }
  }

  // Apply max functions limit
  const targetFunctions = maxFunctions
    ? functionsToAnalyze.slice(0, maxFunctions)
    : functionsToAnalyze;

  const total = targetFunctions.length;
  let completed = 0;
  let analyzedCount = scanResult.stats.analyzedCount || 0;

  // Process functions with concurrency
  await processWithConcurrency(
    targetFunctions,
    concurrency,
    async (funcNode, _index) => {
      // Extract function code
      const code = extractFunctionCode(
        funcNode.filePath,
        funcNode.line,
        funcNode.endLine
      );

      if (!code) {
        completed++;
        return;
      }

      const contentHash = hashFunctionContent(code);

      // Check cache first
      if (cache) {
        const cachedResult = getCachedResult(cache, funcNode.id, contentHash);
        if (cachedResult) {
          funcNode.behavioral = {
            summary: cachedResult.summary,
            source: 'ai' as SummarySource,
            analyzedAt: new Date().toISOString(),
            flags: cachedResult.flags,
          };
          analyzedCount++;
          completed++;

          if (onProgress) {
            onProgress({
              current: completed,
              total,
              functionName: funcNode.name,
              filePath: funcNode.filePath,
              fromCache: true,
            });
          }
          return;
        }
      }

      // Report progress (will call LLM)
      if (onProgress) {
        onProgress({
          current: completed,
          total,
          functionName: funcNode.name,
          filePath: funcNode.filePath,
          fromCache: false,
        });
      }

      try {
        // Call LLM for analysis
        const result = await client.analyzeFunction(
          funcNode.name,
          code,
          funcNode.filePath
        );

        funcNode.behavioral = {
          summary: result.summary,
          source: 'ai' as SummarySource,
          analyzedAt: new Date().toISOString(),
          flags: result.flags,
        };

        if (cache) {
          setCachedResult(cache, funcNode.id, contentHash, result, model);
        }

        analyzedCount++;
      } catch (error) {
        console.error(
          `Failed to analyze ${funcNode.name} in ${funcNode.filePath}:`,
          error instanceof Error ? error.message : error
        );
      }

      completed++;
    }
  );

  // Save cache if we have one
  if (cache && cacheDir) {
    saveCache(cacheDir, cache);
  }

  // Update stats
  scanResult.stats.analyzedCount = analyzedCount;
  scanResult.stats.pendingAnalysis = functionsToAnalyze.length - analyzedCount;

  return scanResult;
}

/**
 * Analyze a single function (useful for incremental analysis)
 */
export async function analyzeSingleFunction(
  funcNode: FunctionNode,
  client: LLMClient
): Promise<FunctionNode> {
  const code = extractFunctionCode(
    funcNode.filePath,
    funcNode.line,
    funcNode.endLine
  );

  if (!code) {
    throw new Error(`Could not extract code for ${funcNode.name}`);
  }

  const result = await client.analyzeFunction(
    funcNode.name,
    code,
    funcNode.filePath
  );

  funcNode.behavioral = {
    summary: result.summary,
    source: 'ai' as SummarySource,
    analyzedAt: new Date().toISOString(),
    flags: result.flags,
  };

  return funcNode;
}
