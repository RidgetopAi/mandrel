/**
 * TypeScript Parser - Core parsing engine using ts-morph
 *
 * Extracts structural information from TypeScript/JavaScript files:
 * - File imports and exports
 * - Function declarations
 * - Class declarations
 *
 * Phase 1: No behavioral analysis, no clusters, no warnings
 */

import { Project, SourceFile } from 'ts-morph';
import { glob } from 'glob';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import * as fs from 'fs';

import type { ScanResult, ScanStats, ScanError } from '../types/scan.types.js';
import { ScanStatus } from '../types/scan.types.js';
import type { FileNode, FunctionNode, ClassNode, NodeMap } from '../types/node.types.js';
import { NodeType } from '../types/node.types.js';
import { WarningLevel } from '../types/warning.types.js';
import type { WarningDetectorOptions, PathAliases, ScanProgressCallback } from '../types/analyzer.types.js';
import { detectWarnings, updateWarningStats } from '../analyzer/warning-detector.js';

import { parseImports } from './parse-imports.js';
import { parseExports } from './parse-exports.js';
import { parseFunctions } from './parse-functions.js';
import { parseClasses } from './parse-classes.js';
import { extractTopLevelReferences } from './parse-references.js';

export interface ScanOptions {
  verbose?: boolean;
  /** Skip warning detection */
  skipWarnings?: boolean;
  /** Warning detector options */
  warningOptions?: WarningDetectorOptions;
  /** Progress callback for real-time updates during scanning */
  onProgress?: ScanProgressCallback;
}

/**
 * Strip JSON comments while respecting string boundaries
 * Handles both line comments (//) and block comments
 * Does NOT strip comments inside string literals
 */
function stripJsonComments(content: string): string {
  const result: string[] = [];
  let i = 0;
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;

  while (i < content.length) {
    const char = content[i]!;
    const nextChar = content[i + 1];

    // Handle string boundaries (only when not in a comment)
    if (!inLineComment && !inBlockComment) {
      if (char === '"' && (i === 0 || content[i - 1] !== '\\')) {
        inString = !inString;
        result.push(char);
        i++;
        continue;
      }
    }

    // When inside a string, just copy characters
    if (inString) {
      result.push(char);
      i++;
      continue;
    }

    // Handle line comment start
    if (!inBlockComment && char === '/' && nextChar === '/') {
      inLineComment = true;
      i += 2;
      continue;
    }

    // Handle line comment end (newline)
    if (inLineComment && (char === '\n' || char === '\r')) {
      inLineComment = false;
      result.push(char); // Keep the newline
      i++;
      continue;
    }

    // Handle block comment start
    if (!inLineComment && char === '/' && nextChar === '*') {
      inBlockComment = true;
      i += 2;
      continue;
    }

    // Handle block comment end
    if (inBlockComment && char === '*' && nextChar === '/') {
      inBlockComment = false;
      i += 2;
      continue;
    }

    // Skip characters inside comments
    if (inLineComment || inBlockComment) {
      i++;
      continue;
    }

    // Regular character - copy it
    result.push(char);
    i++;
  }

  return result.join('');
}

/**
 * Read a single tsconfig.json and extract path aliases
 */
function readTsconfigPaths(tsconfigPath: string): PathAliases | null {
  try {
    if (!fs.existsSync(tsconfigPath)) {
      return null;
    }

    const content = fs.readFileSync(tsconfigPath, 'utf-8');
    const jsonContent = stripJsonComments(content);
    const tsconfig = JSON.parse(jsonContent);

    const paths = tsconfig?.compilerOptions?.paths;
    if (!paths || typeof paths !== 'object') {
      return null;
    }

    return paths as PathAliases;
  } catch {
    return null;
  }
}

/**
 * Find all tsconfig.json files in a directory (recursively)
 * Returns paths relative to projectPath
 */
function findTsconfigFiles(projectPath: string): string[] {
  const configs: string[] = [];
  const ignorePatterns = ['node_modules', 'dist', 'build', '.git', 'coverage'];

  function scan(dir: string) {
    const tsconfigPath = path.join(dir, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      configs.push(tsconfigPath);
    }

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !ignorePatterns.includes(entry.name)) {
          scan(path.join(dir, entry.name));
        }
      }
    } catch {
      // Ignore permission errors etc.
    }
  }

  scan(projectPath);
  return configs;
}

/**
 * Read path aliases from all tsconfig.json files in the project
 * Handles monorepo structures with multiple tsconfig files
 *
 * For each tsconfig, adjusts path targets to be relative to project root.
 * E.g., web/tsconfig.json with "@/*": ["./src/*"] becomes "@/*": ["web/src/*"]
 */
function readPathAliases(projectPath: string): PathAliases {
  const allPaths: PathAliases = {};
  const tsconfigFiles = findTsconfigFiles(projectPath);

  for (const tsconfigPath of tsconfigFiles) {
    const paths = readTsconfigPaths(tsconfigPath);
    if (!paths) continue;

    // Get the directory containing this tsconfig, relative to project root
    const tsconfigDir = path.relative(projectPath, path.dirname(tsconfigPath));

    for (const [alias, targets] of Object.entries(paths)) {
      // Adjust targets to be relative to project root
      const adjustedTargets = targets.map((target) => {
        // Remove leading ./
        const cleanTarget = target.replace(/^\.\//, '');
        // Prefix with tsconfig directory
        return tsconfigDir ? `${tsconfigDir}/${cleanTarget}` : cleanTarget;
      });

      // If this alias already exists, add these targets to it
      // More specific paths (longer prefixes) should come first for matching
      if (allPaths[alias]) {
        allPaths[alias] = [...adjustedTargets, ...allPaths[alias]];
      } else {
        allPaths[alias] = adjustedTargets;
      }
    }
  }

  return allPaths;
}

/**
 * Generate a deterministic node ID from file path
 */
function generateFileId(filePath: string, projectPath: string): string {
  const relativePath = path.relative(projectPath, filePath);
  return `file:${relativePath}`;
}

/**
 * Extract project name from path or package.json
 */
function getProjectName(projectPath: string): string {
  return path.basename(path.resolve(projectPath));
}

/**
 * Find all TypeScript/JavaScript files in a directory
 */
async function findSourceFiles(projectPath: string): Promise<string[]> {
  const patterns = [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
  ];

  const ignorePatterns = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
    '**/*.test.ts',
    '**/*.test.tsx',
    '**/*.spec.ts',
    '**/*.spec.tsx',
    '**/*.d.ts',
  ];

  const files: string[] = [];

  for (const pattern of patterns) {
    const matches = await glob(pattern, {
      cwd: projectPath,
      ignore: ignorePatterns,
      absolute: true,
    });
    files.push(...matches);
  }

  return [...new Set(files)].sort();
}

/**
 * Parse a single source file and extract all structural information
 */
function parseSourceFile(
  sourceFile: SourceFile,
  projectPath: string,
  _errors: ScanError[]
): { fileNode: FileNode; functionNodes: FunctionNode[]; classNodes: ClassNode[] } {
  const filePath = sourceFile.getFilePath();
  const relativePath = path.relative(projectPath, filePath);
  const fileId = generateFileId(filePath, projectPath);

  // Parse imports
  const imports = parseImports(sourceFile);

  // Parse exports
  const exports = parseExports(sourceFile);

  // Parse functions
  const { functions: functionNodes, functionIds } = parseFunctions(
    sourceFile,
    fileId,
    relativePath
  );

  // Parse classes (includes methods as FunctionNodes)
  const { classes: classNodes, classIds, methods: methodNodes } = parseClasses(
    sourceFile,
    fileId,
    relativePath
  );

  // Merge standalone functions and class methods
  const allFunctionNodes = [...functionNodes, ...methodNodes];

  // Extract top-level references (identifiers used outside functions/classes)
  const topLevelReferences = extractTopLevelReferences(sourceFile);

  // Build FileNode
  const fileNode: FileNode = {
    id: fileId,
    type: NodeType.File,
    name: path.basename(filePath),
    filePath: relativePath,
    line: 1,
    endLine: sourceFile.getEndLineNumber(),
    imports,
    exports,
    functions: functionIds,
    classes: classIds,
    topLevelReferences,
  };

  return { fileNode, functionNodes: allFunctionNodes, classNodes };
}

/**
 * Calculate statistics from the parsed nodes
 */
function calculateStats(nodes: NodeMap): ScanStats {
  let totalFiles = 0;
  let totalFunctions = 0;
  let totalClasses = 0;

  const nodesByType: Record<string, number> = {
    [NodeType.File]: 0,
    [NodeType.Function]: 0,
    [NodeType.Class]: 0,
    [NodeType.Cluster]: 0,
  };

  for (const node of Object.values(nodes)) {
    const currentCount = nodesByType[node.type];
    if (currentCount !== undefined) {
      nodesByType[node.type] = currentCount + 1;
    }

    switch (node.type) {
      case NodeType.File:
        totalFiles++;
        break;
      case NodeType.Function:
        totalFunctions++;
        break;
      case NodeType.Class:
        totalClasses++;
        break;
    }
  }

  return {
    totalFiles,
    totalFunctions,
    totalClasses,
    totalConnections: 0, // Connections built later
    totalWarnings: 0,    // Warnings detected in Phase 5
    warningsByLevel: {
      [WarningLevel.Info]: 0,
      [WarningLevel.Warning]: 0,
      [WarningLevel.Error]: 0,
    },
    nodesByType,
    analyzedCount: 0,     // Behavioral analysis in Phase 4
    pendingAnalysis: totalFunctions,
  };
}

/**
 * Scan a project directory and extract structural information
 *
 * @param projectPath - Path to the project root directory
 * @param options - Scan configuration options
 * @returns ScanResult with all parsed nodes
 */
export async function scanProject(
  projectPath: string,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const { verbose = false, onProgress } = options;
  const absolutePath = path.resolve(projectPath);
  const scanId = uuidv4();
  const startTime = new Date().toISOString();

  if (verbose) {
    console.log(`Starting scan of: ${absolutePath}`);
  }

  // Initialize result structure
  const errors: ScanError[] = [];
  const nodes: NodeMap = {};

  // Find all source files
  const sourceFilePaths = await findSourceFiles(absolutePath);

  if (verbose) {
    console.log(`Found ${sourceFilePaths.length} source files`);
  }

  // Create ts-morph Project
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  // Add source files to project
  for (const filePath of sourceFilePaths) {
    try {
      project.addSourceFileAtPath(filePath);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errors.push({
        filePath: path.relative(absolutePath, filePath),
        line: null,
        message: `Failed to add file: ${error}`,
        recoverable: true,
      });
    }
  }

  // Parse each source file
  const sourceFiles = project.getSourceFiles();
  const totalFiles = sourceFiles.length;
  let fileIndex = 0;

  for (const sourceFile of sourceFiles) {
    const filePath = sourceFile.getFilePath();
    const relativePath = path.relative(absolutePath, filePath);

    // Emit progress before parsing
    if (onProgress) {
      onProgress({
        phase: 'scanning',
        current: fileIndex + 1,
        total: totalFiles,
        filePath: relativePath,
      });
    }

    try {
      const { fileNode, functionNodes, classNodes } = parseSourceFile(
        sourceFile,
        absolutePath,
        errors
      );

      // Add file node
      nodes[fileNode.id] = fileNode;

      // Add function nodes
      for (const fn of functionNodes) {
        nodes[fn.id] = fn;
      }

      // Add class nodes
      for (const cls of classNodes) {
        nodes[cls.id] = cls;
      }

      if (verbose) {
        console.log(`  Parsed: ${fileNode.filePath} (${functionNodes.length} functions, ${classNodes.length} classes)`);
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      errors.push({
        filePath: relativePath,
        line: null,
        message: `Failed to parse file: ${error}`,
        recoverable: true,
      });
    }

    fileIndex++;
  }

  // Calculate statistics
  const stats = calculateStats(nodes);

  // Build final result
  const result: ScanResult = {
    id: scanId,
    projectPath: absolutePath,
    projectName: getProjectName(absolutePath),
    status: errors.length > 0 && Object.keys(nodes).length === 0
      ? ScanStatus.Failed
      : ScanStatus.Complete,
    createdAt: startTime,
    completedAt: new Date().toISOString(),
    stats,
    nodes,
    connections: [], // Phase 2: Build connections from imports
    warnings: [],    // Populated below
    clusters: [],    // Phase 7: Build clusters
    errors,
  };

  // Detect warnings (unless skipped)
  if (!options.skipWarnings) {
    if (verbose) {
      console.log(`\nDetecting warnings...`);
    }

    // Read path aliases from tsconfig.json
    const pathAliases = readPathAliases(absolutePath);
    if (verbose && Object.keys(pathAliases).length > 0) {
      console.log(`  Found path aliases: ${Object.keys(pathAliases).join(', ')}`);
    }

    // Merge path aliases with user-provided options
    const warningOptions: WarningDetectorOptions = {
      ...options.warningOptions,
      pathAliases: {
        ...pathAliases,
        ...options.warningOptions?.pathAliases,
      },
    };

    result.warnings = await detectWarnings(result, warningOptions);
    updateWarningStats(result);

    if (verbose) {
      console.log(`  Found ${result.warnings.length} warnings`);
    }
  }

  if (verbose) {
    console.log(`\nScan complete:`);
    console.log(`  Files: ${stats.totalFiles}`);
    console.log(`  Functions: ${stats.totalFunctions}`);
    console.log(`  Classes: ${stats.totalClasses}`);
    console.log(`  Warnings: ${result.stats.totalWarnings}`);
    console.log(`  Errors: ${errors.length}`);
  }

  return result;
}

/**
 * Parse a single file (for testing or targeted parsing)
 */
export async function parseFile(
  filePath: string,
  projectPath?: string
): Promise<FileNode> {
  const absoluteFilePath = path.resolve(filePath);
  const resolvedProjectPath = projectPath
    ? path.resolve(projectPath)
    : path.dirname(absoluteFilePath);

  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  const sourceFile = project.addSourceFileAtPath(absoluteFilePath);
  const errors: ScanError[] = [];

  const { fileNode } = parseSourceFile(sourceFile, resolvedProjectPath, errors);

  return fileNode;
}
