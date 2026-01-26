/**
 * Analyzer module - behavioral analysis and connection building
 */

export { analyzeBehavior, analyzeSingleFunction, type AnalyzeOptions } from './behavioral-analyzer.js';
export { LLMClient, createLLMClientFromEnv } from './llm-client.js';
export {
  loadCache,
  saveCache,
  createCache,
  getCachedResult,
  setCachedResult,
  hashFunctionContent,
  pruneCache,
  getCacheStats,
} from './analysis-cache.js';
export {
  analyzeBehaviorBrowser,
  createBrowserLLMClient,
  type BrowserAnalyzeOptions,
  type SimpleLLMClient,
} from './browser-analyzer.js';
// export { buildConnections } from './connection-builder';
export { detectWarnings, updateWarningStats } from './warning-detector.js';
