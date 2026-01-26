/**
 * Scan non-TypeScript files for import statements
 *
 * Extracts import statements from files that ts-morph doesn't parse:
 * - Svelte (.svelte)
 * - Vue (.vue)
 * - Astro (.astro)
 * - MDX (.mdx)
 * - Other text files with JS/TS imports
 *
 * Uses regex-based extraction (not full parsing) since we only need
 * to know what names are imported from what sources.
 */

import { glob } from 'glob';
import * as fs from 'fs';
import * as path from 'path';
import type { PathAliases } from '../types/analyzer.types.js';

/**
 * File extensions to scan for imports (non-TS files that may contain imports)
 */
const NON_TS_EXTENSIONS = [
  '.svelte',
  '.vue',
  '.astro',
  '.mdx',
  '.md',
];

/**
 * Pattern to detect type-only imports (which we should skip)
 */
const TYPE_IMPORT_PATTERN = /import\s+type\s/;

interface ParsedImport {
  source: string;
  names: Set<string>;
  isNamespace: boolean;
}

/**
 * Parse import statements from file content
 */
function parseImportsFromContent(content: string): ParsedImport[] {
  const imports: ParsedImport[] = [];

  // Split into lines and process each import statement
  // This handles multiline imports better than pure regex
  const importStatements = extractImportStatements(content);

  for (const stmt of importStatements) {
    // Skip type-only imports
    if (TYPE_IMPORT_PATTERN.test(stmt)) {
      continue;
    }

    const parsed = parseImportStatement(stmt);
    if (parsed) {
      imports.push(parsed);
    }
  }

  return imports;
}

/**
 * Extract complete import statements from content
 * Handles multiline imports by tracking braces
 */
function extractImportStatements(content: string): string[] {
  const statements: string[] = [];
  const lines = content.split('\n');

  let currentStatement = '';
  let inImport = false;
  let braceDepth = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    // Check if this line starts an import
    if (!inImport && trimmed.startsWith('import ')) {
      inImport = true;
      currentStatement = trimmed;
      braceDepth = (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;

      // Check if import is complete on this line
      if (braceDepth <= 0 && (trimmed.includes("'") || trimmed.includes('"'))) {
        const hasFrom = /from\s+['"]/.test(trimmed) || /import\s+['"]/.test(trimmed);
        if (hasFrom) {
          statements.push(currentStatement);
          currentStatement = '';
          inImport = false;
        }
      }
    } else if (inImport) {
      currentStatement += ' ' + trimmed;
      braceDepth += (trimmed.match(/\{/g) || []).length - (trimmed.match(/\}/g) || []).length;

      // Check if import is complete
      if (braceDepth <= 0 && (trimmed.includes("'") || trimmed.includes('"'))) {
        statements.push(currentStatement);
        currentStatement = '';
        inImport = false;
      }
    }
  }

  return statements;
}

/**
 * Parse a single import statement and extract source and names
 */
function parseImportStatement(stmt: string): ParsedImport | null {
  const names = new Set<string>();
  let source = '';
  let isNamespace = false;

  // Extract the source (the part in quotes after 'from' or just the quoted part for side-effects)
  const fromMatch = stmt.match(/from\s+['"]([^'"]+)['"]/);
  const sideEffectMatch = stmt.match(/^import\s+['"]([^'"]+)['"]/);

  if (fromMatch) {
    source = fromMatch[1]!;
  } else if (sideEffectMatch) {
    source = sideEffectMatch[1]!;
    // Side-effect import - no names, but source is used
    return { source, names, isNamespace: false };
  } else {
    return null;
  }

  // Check for namespace import: import * as foo from 'source'
  const namespaceMatch = stmt.match(/import\s+\*\s+as\s+(\w+)/);
  if (namespaceMatch) {
    isNamespace = true;
    names.add('*');
    return { source, names, isNamespace };
  }

  // Extract default import: import foo from 'source' or import foo, { ... } from 'source'
  const defaultMatch = stmt.match(/import\s+(\w+)(?:\s*,|\s+from)/);
  if (defaultMatch && defaultMatch[1] !== 'type') {
    names.add('default');
  }

  // Extract named imports: { foo, bar as baz, default as qux }
  const namedMatch = stmt.match(/\{([^}]+)\}/);
  if (namedMatch) {
    const namedPart = namedMatch[1]!;
    // Split by comma and extract names
    const items = namedPart.split(',').map((s) => s.trim()).filter(Boolean);

    for (const item of items) {
      // Handle "foo as bar" syntax - we want the original name (foo)
      const asMatch = item.match(/^(\w+)\s+as\s+\w+$/);
      if (asMatch) {
        names.add(asMatch[1]!);
      } else if (item.match(/^\w+$/)) {
        names.add(item);
      }
    }
  }

  return { source, names, isNamespace };
}

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
 * Scan a project directory for non-TypeScript files and extract their imports
 *
 * @param projectPath - Absolute path to the project root
 * @param pathAliases - Path aliases from tsconfig.json
 * @returns Map of normalized source path -> Set of imported names
 */
export async function scanNonTsImports(
  projectPath: string,
  pathAliases: PathAliases = {}
): Promise<Map<string, Set<string>>> {
  const allImports = new Map<string, Set<string>>();

  // Find all non-TS files
  const patterns = NON_TS_EXTENSIONS.map((ext) => `**/*${ext}`);
  const ignorePatterns = [
    '**/node_modules/**',
    '**/dist/**',
    '**/build/**',
    '**/.git/**',
    '**/coverage/**',
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

  // Process each file
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const relativePath = path.relative(projectPath, filePath);
      const imports = parseImportsFromContent(content);

      for (const imp of imports) {
        // Resolve path alias and normalize
        const resolvedSource = resolvePathAlias(imp.source, pathAliases);
        const normalizedSource = normalizeImportSource(resolvedSource, relativePath);

        if (!allImports.has(normalizedSource)) {
          allImports.set(normalizedSource, new Set());
        }

        const names = allImports.get(normalizedSource)!;
        for (const name of imp.names) {
          names.add(name);
        }

        if (imp.isNamespace) {
          names.add('*');
        }
      }
    } catch {
      // Skip files that can't be read
      continue;
    }
  }

  return allImports;
}

/**
 * Merge non-TS imports into an existing import map
 */
export function mergeImportMaps(
  tsImports: Map<string, Set<string>>,
  nonTsImports: Map<string, Set<string>>
): void {
  for (const [source, names] of nonTsImports) {
    if (!tsImports.has(source)) {
      tsImports.set(source, new Set());
    }
    const existing = tsImports.get(source)!;
    for (const name of names) {
      existing.add(name);
    }
  }
}
