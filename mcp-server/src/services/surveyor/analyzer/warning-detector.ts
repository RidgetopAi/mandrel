/**
 * Warning detector - analyzes scan results for potential issues
 *
 * Detects:
 * - Circular dependencies (file and function level)
 * - Orphaned code (unreferenced functions)
 * - Unused exports
 * - Large files
 */

import { v4 as uuidv4 } from 'uuid';
import type { ScanResult, NodeMap, FileNode, FunctionNode } from '../types/index.js';
import type { Warning } from '../types/warning.types.js';
import { WarningLevel, WarningCategory } from '../types/warning.types.js';
import { NodeType } from '../types/node.types.js';
import type { WarningDetectorOptions, PathAliases } from '../types/analyzer.types.js';
import { DEFAULT_WARNING_OPTIONS } from '../types/analyzer.types.js';
import { scanNonTsImports, mergeImportMaps } from './scan-non-ts-imports.js';
import { scanTestFileImports } from './scan-test-imports.js';

/**
 * Next.js framework conventions - exports that are used by the framework
 * Maps export name -> file patterns where they're valid
 */
const NEXTJS_CONVENTIONS: Record<string, RegExp[]> = {
  // Route segment config
  dynamic: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],
  revalidate: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],
  fetchCache: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],
  runtime: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],
  preferredRegion: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],
  maxDuration: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],

  // Metadata
  metadata: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/],
  generateMetadata: [/page\.(tsx?|jsx?)$/, /layout\.(tsx?|jsx?)$/],
  viewport: [/layout\.(tsx?|jsx?)$/],
  generateViewport: [/layout\.(tsx?|jsx?)$/],

  // Static generation
  generateStaticParams: [/page\.(tsx?|jsx?)$/],

  // API routes
  GET: [/route\.(tsx?|jsx?)$/],
  POST: [/route\.(tsx?|jsx?)$/],
  PUT: [/route\.(tsx?|jsx?)$/],
  DELETE: [/route\.(tsx?|jsx?)$/],
  PATCH: [/route\.(tsx?|jsx?)$/],
  HEAD: [/route\.(tsx?|jsx?)$/],
  OPTIONS: [/route\.(tsx?|jsx?)$/],

  // Middleware
  middleware: [/middleware\.(tsx?|jsx?)$/],
  config: [/middleware\.(tsx?|jsx?)$/, /route\.(tsx?|jsx?)$/],

  // Special files
  manifest: [/manifest\.(tsx?|jsx?)$/],

  // Error/Loading boundaries and special files (default exports)
  default: [
    /error\.(tsx?|jsx?)$/,
    /loading\.(tsx?|jsx?)$/,
    /not-found\.(tsx?|jsx?)$/,
    /layout\.(tsx?|jsx?)$/,
    /page\.(tsx?|jsx?)$/,
    /template\.(tsx?|jsx?)$/,
    /manifest\.(tsx?|jsx?)$/,
  ],
};

/**
 * Config file patterns - exports from these are used by build tools
 */
const CONFIG_FILE_PATTERNS = [
  /^next\.config\.(ts|js|mjs)$/,
  /^vitest\.config\.(ts|js|mjs)$/,
  /^vite\.config\.(ts|js|mjs)$/,
  /^jest\.config\.(ts|js|mjs)$/,
  /^tailwind\.config\.(ts|js|mjs)$/,
  /^postcss\.config\.(ts|js|mjs)$/,
  /^eslint\.config\.(ts|js|mjs)$/,
  /^tsconfig\..*\.json$/,
];

/**
 * Check if an export is a framework convention
 */
function isFrameworkConvention(exportName: string, filePath: string): boolean {
  // Check if it's a config file
  const fileName = filePath.split('/').pop() || '';
  if (CONFIG_FILE_PATTERNS.some(p => p.test(fileName))) {
    return true;
  }

  // Check Next.js conventions
  const patterns = NEXTJS_CONVENTIONS[exportName];
  if (patterns) {
    return patterns.some(p => p.test(filePath));
  }

  return false;
}

/**
 * Resolve a path alias to its actual path
 * e.g., "@/components/Foo" with paths {"@/*": ["./src/*"]} -> "src/components/Foo"
 */
function resolvePathAlias(source: string, pathAliases: PathAliases): string {
  for (const [alias, targets] of Object.entries(pathAliases)) {
    // Convert alias pattern to regex (e.g., "@/*" -> /^@\/(.*)$/)
    const aliasPattern = alias
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // Escape special regex chars
      .replace(/\\\*/g, '(.*)');  // Convert * to capture group

    const regex = new RegExp(`^${aliasPattern}$`);
    const match = source.match(regex);

    if (match && targets.length > 0) {
      // Use the first target path
      const target = targets[0]!;
      // Replace * with the captured group
      let resolved = target;
      if (match[1] !== undefined) {
        resolved = target.replace('*', match[1]);
      }
      // Remove leading ./ if present
      return resolved.replace(/^\.\//, '');
    }
  }

  return source;
}

/**
 * Detect all warnings in a scan result
 */
export async function detectWarnings(
  scanResult: ScanResult,
  options: WarningDetectorOptions = {}
): Promise<Warning[]> {
  const opts = { ...DEFAULT_WARNING_OPTIONS, ...options };
  const warnings: Warning[] = [];
  const now = new Date().toISOString();

  // Circular dependencies (file level)
  if (opts.detectFileCircular) {
    warnings.push(...detectFileCircularDependencies(scanResult.nodes, opts, now));
  }

  // Circular dependencies (function level) - more expensive
  if (opts.detectFunctionCircular) {
    warnings.push(...detectFunctionCircularDependencies(scanResult.nodes, now));
  }

  // Orphaned code
  if (opts.detectOrphaned) {
    warnings.push(...detectOrphanedCode(scanResult.nodes, opts, now));
  }

  // Unused exports - scan non-TS files for imports too
  if (opts.detectUnusedExports) {
    warnings.push(...await detectUnusedExports(scanResult.nodes, scanResult.projectPath, opts, now));
  }

  // Large files
  if (opts.detectLargeFiles) {
    warnings.push(...detectLargeFiles(scanResult.nodes, opts.largeFileThreshold, now));
  }

  return warnings;
}

/**
 * Detect circular dependencies at file level (import cycles)
 */
function detectFileCircularDependencies(
  nodes: NodeMap,
  opts: Required<WarningDetectorOptions>,
  detectedAt: string
): Warning[] {
  const warnings: Warning[] = [];
  const fileNodes = Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );

  // Build adjacency list from imports
  const graph = new Map<string, Set<string>>();

  for (const file of fileNodes) {
    const deps = new Set<string>();
    for (const imp of file.imports) {
      // Resolve import source to file ID
      const targetId = resolveImportToFileId(imp.source, file.filePath, nodes, opts.pathAliases);
      if (targetId) {
        deps.add(targetId);
      }
    }
    graph.set(file.id, deps);
  }

  // Find cycles using DFS
  const cycles = findCycles(graph);

  for (const cycle of cycles) {
    const fileNames = cycle.map((id) => {
      const node = nodes[id];
      return node ? node.name : id;
    });

    warnings.push({
      id: uuidv4(),
      category: WarningCategory.CircularDependency,
      level: WarningLevel.Warning,
      title: `Circular import: ${fileNames.join(' → ')} → ${fileNames[0]}`,
      description: `These files form a circular dependency chain. This can cause issues with module initialization order and makes the codebase harder to understand.`,
      affectedNodes: cycle,
      suggestion: {
        summary: 'Break the cycle by extracting shared code into a separate module',
        reasoning: 'Circular dependencies can cause runtime issues and make refactoring difficult. Extract the shared functionality into a new file that both modules can import.',
        codeExample: null,
        autoFixable: false,
      },
      detectedAt,
    });
  }

  return warnings;
}

/**
 * Detect circular dependencies at function level (call cycles)
 */
function detectFunctionCircularDependencies(_nodes: NodeMap, _detectedAt: string): Warning[] {
  // This is a placeholder - function-level circular detection requires
  // analyzing function call graphs which we don't have yet
  // Would need to parse function bodies for call expressions

  // For now, return empty - this can be implemented when we have call graph data
  return [];
}

/**
 * Detect orphaned code (functions not called by anything)
 *
 * Uses reference tracking to accurately detect:
 * - Functions called within the same file
 * - Functions passed as callbacks (e.g., process.on('SIGTERM', shutdown))
 * - Functions referenced in object literals
 */
function detectOrphanedCode(
  nodes: NodeMap,
  opts: Required<WarningDetectorOptions>,
  detectedAt: string
): Warning[] {
  const warnings: Warning[] = [];

  const fileNodes = Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );
  const functionNodes = Object.values(nodes).filter(
    (n): n is FunctionNode => n.type === NodeType.Function
  );

  // Build set of all exported function names
  const exportedNames = new Set<string>();
  for (const file of fileNodes) {
    for (const exp of file.exports) {
      exportedNames.add(exp.name);
    }
  }

  // Build set of all imported names
  const importedNames = new Set<string>();
  for (const file of fileNodes) {
    for (const imp of file.imports) {
      for (const item of imp.items) {
        importedNames.add(item.name);
        if (item.alias) {
          importedNames.add(item.alias);
        }
      }
    }
  }

  // Build a map of fileId -> functions in that file for quick lookup
  const functionsByFile = new Map<string, FunctionNode[]>();
  for (const func of functionNodes) {
    const existing = functionsByFile.get(func.parentFileId) || [];
    existing.push(func);
    functionsByFile.set(func.parentFileId, existing);
  }

  // Find functions that are not exported and not commonly named entry points
  const entryPointPatterns = [
    /^main$/i,
    /^index$/i,
    /^app$/i,
    /^init/i,
    /^setup/i,
    /^bootstrap/i,
    /^handler$/i,
    /^middleware$/i,
    /^router$/i,
  ];

  for (const func of functionNodes) {
    // Skip if exported
    if (func.isExported) continue;

    // Skip if it's a class method
    if (func.parentClassId) continue;

    // Skip if it matches entry point patterns
    const isEntryPoint = entryPointPatterns.some((p) => p.test(func.name));
    if (isEntryPoint) continue;

    // Skip common utility patterns
    if (func.name.startsWith('_')) continue; // Private by convention

    // Skip framework conventions
    if (opts.frameworkConventions && isFrameworkConvention(func.name, func.filePath)) {
      continue;
    }

    // Check if imported/exported elsewhere (cross-file usage)
    const isUsedCrossFile = importedNames.has(func.name) || exportedNames.has(func.name);
    if (isUsedCrossFile) continue;

    // Check if used within the same file (intra-file usage)
    const parentFile = nodes[func.parentFileId] as FileNode | undefined;
    if (parentFile) {
      // Check top-level references (e.g., process.on('SIGTERM', shutdown))
      if (parentFile.topLevelReferences?.includes(func.name)) {
        continue;
      }

      // Check if any other function in the same file references this function
      const siblingFunctions = functionsByFile.get(func.parentFileId) || [];
      const isCalledBySibling = siblingFunctions.some(
        (sibling) =>
          sibling.id !== func.id && // Don't check self-references
          sibling.references?.includes(func.name)
      );
      if (isCalledBySibling) continue;
    }

    // This function is likely orphaned
    warnings.push({
      id: uuidv4(),
      category: WarningCategory.OrphanedCode,
      level: WarningLevel.Info,
      title: `Potentially unused function: ${func.name}`,
      description: `The function "${func.name}" in ${func.filePath} is not exported and may not be called from anywhere. Consider removing it if unused, or export it if needed elsewhere.`,
      affectedNodes: [func.id],
      suggestion: {
        summary: 'Remove if unused, or export if needed',
        reasoning: 'Dead code increases maintenance burden and can confuse developers. If the function is needed, consider exporting it.',
        codeExample: `export function ${func.name}(...) { ... }`,
        autoFixable: false,
      },
      detectedAt,
    });
  }

  return warnings;
}

/**
 * Re-export info: tracks both the exported name (what consumers import) and original name (what source exports)
 */
interface ReexportInfo {
  source: string;        // Normalized source path
  originalName: string;  // Name in the source file (e.g., 'default', 'Foo')
}

/**
 * Build a map of re-exports from barrel files
 * Returns: Map<barrelFilePath, Map<exportedName, ReexportInfo>>
 * For index files, maps both 'src/foo/index' and 'src/foo' to the same exports
 *
 * Handles:
 * - Named re-exports: export { Foo } from './Foo' -> maps 'Foo' to {source:'./Foo', originalName:'Foo'}
 * - Aliased re-exports: export { Foo as Bar } from './Foo' -> maps 'Bar' to {source:'./Foo', originalName:'Foo'}
 * - Default re-exports: export { default as X } from './Y' -> maps 'X' to {source:'./Y', originalName:'default'}
 */
function buildReexportMap(
  fileNodes: FileNode[],
  pathAliases: PathAliases
): Map<string, Map<string, ReexportInfo>> {
  const reexportMap = new Map<string, Map<string, ReexportInfo>>();

  for (const file of fileNodes) {
    // Look for re-export entries that have a source path
    const reexports: Array<{ exportedName: string; info: ReexportInfo }> = [];

    for (const exp of file.exports) {
      if (exp.kind === 'reexport' && exp.source && exp.name !== '*') {
        // Resolve and normalize the original source
        const resolvedSource = resolvePathAlias(exp.source, pathAliases);
        const originalSource = normalizeImportSource(resolvedSource, file.filePath);

        // exportedName is what consumers import (alias if present, otherwise original name)
        // originalName is what the source file exports
        const exportedName = exp.alias || exp.name;
        const originalName = exp.name;

        reexports.push({
          exportedName,
          info: { source: originalSource, originalName }
        });
      }
    }

    if (reexports.length > 0) {
      const [normalizedFile, directoryPath] = getNormalizedPaths(file.filePath);

      // Add under the full path
      if (!reexportMap.has(normalizedFile)) {
        reexportMap.set(normalizedFile, new Map());
      }
      for (const { exportedName, info } of reexports) {
        reexportMap.get(normalizedFile)!.set(exportedName, info);
      }

      // Also add under the directory path for index files
      if (directoryPath) {
        if (!reexportMap.has(directoryPath)) {
          reexportMap.set(directoryPath, new Map());
        }
        for (const { exportedName, info } of reexports) {
          reexportMap.get(directoryPath)!.set(exportedName, info);
        }
      }
    }
  }

  return reexportMap;
}

/**
 * Build a map of star re-exports: barrel file path -> list of source paths
 * Used to handle "export * from './utils'" patterns
 */
function buildStarReexportMap(
  fileNodes: FileNode[],
  pathAliases: PathAliases
): Map<string, string[]> {
  const starReexportMap = new Map<string, string[]>();

  for (const file of fileNodes) {
    const starSources: string[] = [];

    for (const exp of file.exports) {
      // Star re-exports have name === '*'
      if (exp.kind === 'reexport' && exp.name === '*' && exp.source) {
        const resolvedSource = resolvePathAlias(exp.source, pathAliases);
        const originalSource = normalizeImportSource(resolvedSource, file.filePath);
        starSources.push(originalSource);
      }
    }

    if (starSources.length > 0) {
      const [normalizedFile, directoryPath] = getNormalizedPaths(file.filePath);

      starReexportMap.set(normalizedFile, starSources);
      if (directoryPath) {
        starReexportMap.set(directoryPath, starSources);
      }
    }
  }

  return starReexportMap;
}

/**
 * Detect exports that aren't imported anywhere in the project
 * Scans both TypeScript files and non-TS files (.svelte, .vue, .astro, etc.)
 */
async function detectUnusedExports(
  nodes: NodeMap,
  projectPath: string,
  opts: Required<WarningDetectorOptions>,
  detectedAt: string
): Promise<Warning[]> {
  const warnings: Warning[] = [];

  const fileNodes = Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );

  // Build re-export maps to track barrel file re-exports
  const reexportMap = buildReexportMap(fileNodes, opts.pathAliases);
  const starReexportMap = buildStarReexportMap(fileNodes, opts.pathAliases);

  // Collect all imports across the project
  // Maps normalized file path -> set of imported names
  const allImportedNames = new Map<string, Set<string>>();

  // Scan non-TS files for imports (.svelte, .vue, .astro, etc.)
  const nonTsImports = await scanNonTsImports(projectPath, opts.pathAliases);
  mergeImportMaps(allImportedNames, nonTsImports);

  // Scan test files for imports (two-pass scanning)
  // Test files are excluded from structural analysis but we need their imports
  // to avoid false "unused export" warnings for exports used only by tests
  if (opts.includeTestImports) {
    const testImports = await scanTestFileImports(projectPath, opts.pathAliases);
    mergeImportMaps(allImportedNames, testImports);
  }

  for (const file of fileNodes) {
    for (const imp of file.imports) {
      // Resolve path alias first, then normalize
      const resolvedSource = resolvePathAlias(imp.source, opts.pathAliases);
      const normalizedSource = normalizeImportSource(resolvedSource, file.filePath);

      if (!allImportedNames.has(normalizedSource)) {
        allImportedNames.set(normalizedSource, new Set());
      }
      const names = allImportedNames.get(normalizedSource)!;

      for (const item of imp.items) {
        if (item.isNamespace) {
          // Namespace import uses everything
          names.add('*');
        } else if (item.isDefault) {
          names.add('default');
        } else {
          names.add(item.name);

          // If this import is from a barrel file with named re-exports, credit the original source
          const barrelReexports = reexportMap.get(normalizedSource);
          if (barrelReexports) {
            const reexportInfo = barrelReexports.get(item.name);
            if (reexportInfo) {
              if (!allImportedNames.has(reexportInfo.source)) {
                allImportedNames.set(reexportInfo.source, new Set());
              }
              // Credit with the ORIGINAL name (what the source file exports), not the alias
              allImportedNames.get(reexportInfo.source)!.add(reexportInfo.originalName);
            }
          }

          // If this import is from a barrel file with star re-exports, credit those sources too
          const starSources = starReexportMap.get(normalizedSource);
          if (starSources) {
            for (const starSource of starSources) {
              if (!allImportedNames.has(starSource)) {
                allImportedNames.set(starSource, new Set());
              }
              // Credit this name to the star-exported source
              allImportedNames.get(starSource)!.add(item.name);
            }
          }
        }
      }
    }
  }

  // Check each file's exports
  for (const file of fileNodes) {
    // Skip index files - they're often re-export hubs
    if (file.name === 'index.ts' || file.name === 'index.js') continue;

    // Get what's imported from this file
    const normalizedPath = normalizeFilePath(file.filePath);
    const importedFromThisFile = allImportedNames.get(normalizedPath) || new Set();

    // If namespace import, all exports are used
    if (importedFromThisFile.has('*')) continue;

    for (const exp of file.exports) {
      // Skip re-exports
      if (exp.kind === 'reexport') continue;

      // Skip type exports - they're often imported as types elsewhere
      if (exp.isTypeOnly || exp.kind === 'type' || exp.kind === 'interface') continue;

      const exportName = exp.isDefault ? 'default' : exp.name;

      // Skip framework conventions (check both the export name and 'default' for default exports)
      if (opts.frameworkConventions) {
        if (isFrameworkConvention(exportName, file.filePath)) {
          continue;
        }
      }

      if (!importedFromThisFile.has(exportName)) {
        warnings.push({
          id: uuidv4(),
          category: WarningCategory.UnusedExport,
          level: WarningLevel.Info,
          title: `Unused export: ${exp.name}`,
          description: `The export "${exp.name}" in ${file.filePath} is not imported anywhere in the project. It may be dead code or intended for external use.`,
          affectedNodes: [file.id],
          suggestion: {
            summary: 'Remove export if unused, or document if public API',
            reasoning: 'Unused exports can indicate dead code. If this is part of a public API, consider documenting it.',
            codeExample: null,
            autoFixable: false,
          },
          detectedAt,
        });
      }
    }
  }

  return warnings;
}

/**
 * Detect files that exceed the line threshold
 */
function detectLargeFiles(
  nodes: NodeMap,
  threshold: number,
  detectedAt: string
): Warning[] {
  const warnings: Warning[] = [];

  const fileNodes = Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );

  for (const file of fileNodes) {
    const lineCount = file.endLine;

    if (lineCount > threshold) {
      const severity = lineCount > threshold * 2
        ? WarningLevel.Warning
        : WarningLevel.Info;

      warnings.push({
        id: uuidv4(),
        category: WarningCategory.LargeFile,
        level: severity,
        title: `Large file: ${file.name} (${lineCount} lines)`,
        description: `The file ${file.filePath} has ${lineCount} lines, exceeding the threshold of ${threshold}. Large files are harder to maintain and understand.`,
        affectedNodes: [file.id],
        suggestion: {
          summary: 'Consider splitting into smaller, focused modules',
          reasoning: 'Smaller files are easier to understand, test, and maintain. Look for logical groupings of functionality that could be extracted.',
          codeExample: null,
          autoFixable: false,
        },
        detectedAt,
      });
    }
  }

  return warnings;
}

/**
 * Find all cycles in a directed graph using DFS
 */
function findCycles(graph: Map<string, Set<string>>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const neighbors = graph.get(node) || new Set();
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (recursionStack.has(neighbor)) {
        // Found a cycle - extract it from path
        const cycleStart = path.indexOf(neighbor);
        if (cycleStart !== -1) {
          const cycle = path.slice(cycleStart);
          // Only add if we haven't seen this cycle before
          const cycleKey = [...cycle].sort().join(',');
          const existingKeys = cycles.map((c) => [...c].sort().join(','));
          if (!existingKeys.includes(cycleKey)) {
            cycles.push(cycle);
          }
        }
      }
    }

    path.pop();
    recursionStack.delete(node);
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

/**
 * Resolve an import source to a file ID
 */
function resolveImportToFileId(
  source: string,
  currentFilePath: string,
  nodes: NodeMap,
  pathAliases: PathAliases
): string | null {
  // First try to resolve path alias
  const resolvedSource = resolvePathAlias(source, pathAliases);

  // Skip external packages (those that don't start with . or / and weren't resolved by alias)
  if (!resolvedSource.startsWith('.') && !resolvedSource.startsWith('/') && resolvedSource === source) {
    return null;
  }

  const fileNodes = Object.values(nodes).filter(
    (n): n is FileNode => n.type === NodeType.File
  );

  // Normalize the import path
  const normalizedSource = normalizeImportSource(resolvedSource, currentFilePath);

  // Try to find matching file
  for (const file of fileNodes) {
    const normalizedFile = normalizeFilePath(file.filePath);
    if (normalizedFile === normalizedSource) {
      return file.id;
    }
  }

  return null;
}

/**
 * Normalize an import source relative to the importing file
 */
function normalizeImportSource(source: string, importingFilePath: string): string {
  if (!source.startsWith('.')) {
    // Not a relative import - return as-is (already resolved by alias or absolute)
    return source.replace(/\.(ts|tsx|js|jsx)$/, '');
  }

  // Get directory of importing file
  const dir = importingFilePath.includes('/')
    ? importingFilePath.substring(0, importingFilePath.lastIndexOf('/'))
    : '';

  // Resolve relative path
  const parts = (dir ? dir + '/' + source : source).split('/');
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      resolved.pop();
    } else {
      resolved.push(part);
    }
  }

  return resolved.join('/').replace(/\.(ts|tsx|js|jsx)$/, '');
}

/**
 * Normalize a file path for comparison
 * Also returns the directory form for index files (e.g., src/components/ui/index -> src/components/ui)
 */
function normalizeFilePath(filePath: string): string {
  // Remove extension
  return filePath.replace(/\.(ts|tsx|js|jsx)$/, '');
}

/**
 * Get both the full path and directory path for index files
 * Returns [normalPath, directoryPath] where directoryPath is null for non-index files
 */
function getNormalizedPaths(filePath: string): [string, string | null] {
  const normalized = normalizeFilePath(filePath);

  // Check if this is an index file
  if (normalized.endsWith('/index')) {
    // Return both the full path and the directory path
    return [normalized, normalized.slice(0, -6)]; // Remove '/index'
  }

  return [normalized, null];
}

/**
 * Update scan result stats with warning counts
 */
export function updateWarningStats(scanResult: ScanResult): void {
  const warnings = scanResult.warnings;

  scanResult.stats.totalWarnings = warnings.length;
  scanResult.stats.warningsByLevel = {
    [WarningLevel.Info]: warnings.filter((w) => w.level === WarningLevel.Info).length,
    [WarningLevel.Warning]: warnings.filter((w) => w.level === WarningLevel.Warning).length,
    [WarningLevel.Error]: warnings.filter((w) => w.level === WarningLevel.Error).length,
  };
}
