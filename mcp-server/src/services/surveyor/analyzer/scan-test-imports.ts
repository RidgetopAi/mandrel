/**
 * Scan test files for import statements (two-pass scanning)
 *
 * This module enables accurate unused export detection by collecting imports
 * from test files that are excluded from the main structural scan.
 *
 * The main parser excludes test files (*.test.ts, *.spec.ts, etc.) from
 * structural analysis (exports, functions, classes) because test code isn't
 * part of the production dependency graph. However, we still need to know
 * what test files import to avoid false "unused export" warnings for code
 * that IS used - just by tests.
 *
 * Two-pass scanning:
 * - Pass 1: Collect imports from ALL files (including test files) - this module
 * - Pass 2: Analyze structure from non-test files only - existing parser
 */

import { glob } from 'glob';
import { Project } from 'ts-morph';
import * as path from 'path';
import type { PathAliases } from '../types/analyzer.types.js';
import { parseImports } from '../parser/parse-imports.js';

/**
 * Test file patterns to scan for imports
 */
const TEST_FILE_PATTERNS = [
  '**/*.test.ts',
  '**/*.test.tsx',
  '**/*.spec.ts',
  '**/*.spec.tsx',
  '**/*.test.js',
  '**/*.test.jsx',
  '**/*.spec.js',
  '**/*.spec.jsx',
];

/**
 * Directories to ignore when scanning
 */
const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/coverage/**',
];

/**
 * Resolve a path alias to its actual path
 * Duplicated from warning-detector.ts for module independence
 */
function resolvePathAlias(source: string, pathAliases: PathAliases): string {
  for (const [alias, targets] of Object.entries(pathAliases)) {
    const aliasPattern = alias
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\\\*/g, '(.*)');

    const regex = new RegExp(`^${aliasPattern}$`);
    const match = source.match(regex);

    if (match && targets.length > 0) {
      const target = targets[0]!;
      let resolved = target;
      if (match[1] !== undefined) {
        resolved = target.replace('*', match[1]);
      }
      return resolved.replace(/^\.\//, '');
    }
  }

  return source;
}

/**
 * Normalize an import source relative to the importing file
 */
function normalizeImportSource(source: string, importingFilePath: string): string {
  if (!source.startsWith('.')) {
    return source.replace(/\.(ts|tsx|js|jsx)$/, '');
  }

  const dir = importingFilePath.includes('/')
    ? importingFilePath.substring(0, importingFilePath.lastIndexOf('/'))
    : '';

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
 * Scan test files for imports using ts-morph for accurate parsing
 *
 * This function finds all test files in a project and extracts their imports
 * using the same parsing logic as the main TypeScript parser. This ensures
 * accuracy - we're using actual AST parsing, not regex.
 *
 * @param projectPath - Absolute path to the project root
 * @param pathAliases - Path aliases from tsconfig.json for resolving imports
 * @returns Map of normalized source path -> Set of imported names
 */
export async function scanTestFileImports(
  projectPath: string,
  pathAliases: PathAliases = {}
): Promise<Map<string, Set<string>>> {
  const allImports = new Map<string, Set<string>>();

  // Find all test files
  const testFiles: string[] = [];
  for (const pattern of TEST_FILE_PATTERNS) {
    const matches = await glob(pattern, {
      cwd: projectPath,
      ignore: IGNORE_PATTERNS,
      absolute: true,
    });
    testFiles.push(...matches);
  }

  // Skip if no test files found
  if (testFiles.length === 0) {
    return allImports;
  }

  // Create ts-morph project for parsing
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  // Add test files to project
  for (const filePath of testFiles) {
    try {
      project.addSourceFileAtPath(filePath);
    } catch {
      // Skip files that can't be added (e.g., syntax errors)
      continue;
    }
  }

  // Parse imports from each test file
  for (const sourceFile of project.getSourceFiles()) {
    const filePath = sourceFile.getFilePath();
    const relativePath = path.relative(projectPath, filePath);

    try {
      const imports = parseImports(sourceFile);

      for (const imp of imports) {
        // Skip type-only imports - they don't count as "using" the export
        if (imp.isTypeOnly) {
          continue;
        }

        // Resolve path alias and normalize
        const resolvedSource = resolvePathAlias(imp.source, pathAliases);
        const normalizedSource = normalizeImportSource(resolvedSource, relativePath);

        if (!allImports.has(normalizedSource)) {
          allImports.set(normalizedSource, new Set());
        }

        const names = allImports.get(normalizedSource)!;

        for (const item of imp.items) {
          if (item.isNamespace) {
            // Namespace import uses everything
            names.add('*');
          } else if (item.isDefault) {
            names.add('default');
          } else {
            names.add(item.name);
          }
        }
      }
    } catch {
      // Skip files that can't be parsed
      continue;
    }
  }

  return allImports;
}
