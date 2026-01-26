/**
 * Parse identifier references from TypeScript AST nodes
 *
 * Extracts identifiers that are REFERENCED (used) rather than DECLARED.
 * This enables accurate detection of:
 * - Functions called within the same file
 * - Functions passed as callbacks (e.g., process.on('SIGTERM', shutdown))
 * - Functions referenced in object literals
 *
 * Uses ts-morph AST traversal to find all Identifier nodes in value positions.
 */

import {
  SourceFile,
  Node,
  SyntaxKind,
  FunctionDeclaration,
  ArrowFunction,
  VariableStatement,
} from 'ts-morph';

/**
 * TypeScript/JavaScript keywords that should never be treated as references
 */
const KEYWORDS = new Set([
  // Reserved words
  'break', 'case', 'catch', 'continue', 'debugger', 'default', 'delete',
  'do', 'else', 'finally', 'for', 'function', 'if', 'in', 'instanceof',
  'new', 'return', 'switch', 'this', 'throw', 'try', 'typeof', 'var',
  'void', 'while', 'with', 'class', 'const', 'enum', 'export', 'extends',
  'import', 'super', 'implements', 'interface', 'let', 'package', 'private',
  'protected', 'public', 'static', 'yield', 'await', 'async',
  // Literals
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity',
  // TypeScript
  'any', 'boolean', 'number', 'string', 'symbol', 'unknown', 'never', 'object',
  'type', 'namespace', 'module', 'declare', 'abstract', 'as', 'from', 'is',
  'readonly', 'keyof', 'infer', 'asserts',
]);

/**
 * Common global identifiers that exist in all JS/TS environments
 * We still track these but they're less interesting for orphan detection
 */
const COMMON_GLOBALS = new Set([
  'console', 'process', 'global', 'globalThis', 'window', 'document',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'Promise', 'Array', 'Object', 'String', 'Number', 'Boolean', 'Symbol',
  'Map', 'Set', 'WeakMap', 'WeakSet', 'Date', 'RegExp', 'Error',
  'JSON', 'Math', 'Intl', 'Reflect', 'Proxy',
  'Buffer', 'require', 'module', 'exports', '__dirname', '__filename',
]);

/**
 * Check if a node is in a type-only position (not a value reference)
 */
function isInTypePosition(node: Node): boolean {
  let current: Node | undefined = node;
  let child: Node | undefined = undefined;

  while (current) {
    const kind = current.getKind();

    // For AsExpression and SatisfiesExpression, only the TYPE part is a type position
    // The expression part (the value being asserted) contains actual value references
    if (kind === SyntaxKind.AsExpression || kind === SyntaxKind.SatisfiesExpression) {
      // Check if we came from the type node (type position) or expression (value position)
      const asExpr = current as any;
      const typeNode = asExpr.getTypeNode?.();
      if (typeNode && child) {
        // If our path came through the type node, it's a type position
        // Otherwise (expression part), continue checking ancestors
        if (typeNode === child || typeNode.containsRange(child.getPos(), child.getEnd())) {
          return true;
        }
      }
      // We're in the expression part, continue checking ancestors
      child = current;
      current = current.getParent();
      continue;
    }

    // Type annotations and type references
    if (
      kind === SyntaxKind.TypeReference ||
      kind === SyntaxKind.TypeAliasDeclaration ||
      kind === SyntaxKind.InterfaceDeclaration ||
      kind === SyntaxKind.TypeParameter ||
      kind === SyntaxKind.TypeQuery ||
      kind === SyntaxKind.IndexedAccessType ||
      kind === SyntaxKind.MappedType ||
      kind === SyntaxKind.ConditionalType ||
      kind === SyntaxKind.IntersectionType ||
      kind === SyntaxKind.UnionType ||
      kind === SyntaxKind.TupleType ||
      kind === SyntaxKind.ArrayType ||
      kind === SyntaxKind.FunctionType ||
      kind === SyntaxKind.ConstructorType ||
      kind === SyntaxKind.TypeLiteral ||
      kind === SyntaxKind.TypePredicate
    ) {
      return true;
    }

    // Type imports
    if (kind === SyntaxKind.ImportSpecifier) {
      const importDecl = current.getFirstAncestorByKind(SyntaxKind.ImportDeclaration);
      if (importDecl?.isTypeOnly()) {
        return true;
      }
    }

    child = current;
    current = current.getParent();
  }

  return false;
}

/**
 * Check if an identifier is being declared rather than referenced
 */
function isDeclaration(node: Node): boolean {
  const parent = node.getParent();
  if (!parent) return false;

  const parentKind = parent.getKind();

  // Function/method/variable declarations where this is the name
  if (
    parentKind === SyntaxKind.FunctionDeclaration ||
    parentKind === SyntaxKind.MethodDeclaration ||
    parentKind === SyntaxKind.VariableDeclaration ||
    parentKind === SyntaxKind.Parameter ||
    parentKind === SyntaxKind.ClassDeclaration ||
    parentKind === SyntaxKind.InterfaceDeclaration ||
    parentKind === SyntaxKind.TypeAliasDeclaration ||
    parentKind === SyntaxKind.EnumDeclaration ||
    parentKind === SyntaxKind.EnumMember ||
    parentKind === SyntaxKind.PropertyDeclaration ||
    parentKind === SyntaxKind.PropertySignature ||
    parentKind === SyntaxKind.MethodSignature
  ) {
    // Check if this identifier is the 'name' of the declaration
    const nameNode = (parent as any).getNameNode?.();
    if (nameNode === node) {
      return true;
    }
  }

  // Property assignments in object literals where this is the key
  if (parentKind === SyntaxKind.PropertyAssignment) {
    const propAssign = parent as any;
    const nameNode = propAssign.getNameNode?.();
    if (nameNode === node) {
      return true;
    }
  }

  // Shorthand property assignments (e.g., { foo } where foo is both key and value)
  // In this case, foo IS a reference, so return false
  if (parentKind === SyntaxKind.ShorthandPropertyAssignment) {
    return false;
  }

  // Import specifiers - these are declarations, not references
  if (parentKind === SyntaxKind.ImportSpecifier) {
    return true;
  }

  // Named imports binding
  if (parentKind === SyntaxKind.ImportClause) {
    return true;
  }

  // Export specifiers - the local name is a reference, but we handle exports separately
  if (parentKind === SyntaxKind.ExportSpecifier) {
    return true;
  }

  return false;
}

/**
 * Check if identifier is part of a property access (e.g., 'log' in 'console.log')
 * We want to capture the base object (console) but not property names (log)
 */
function isPropertyName(node: Node): boolean {
  const parent = node.getParent();
  if (!parent) return false;

  if (parent.getKind() === SyntaxKind.PropertyAccessExpression) {
    // Check if this is the 'name' part (right side) vs the 'expression' part (left side)
    const propAccess = parent as any;
    const nameNode = propAccess.getNameNode?.();
    return nameNode === node;
  }

  return false;
}

/**
 * Extract all referenced identifiers from a node (function body, statement, etc.)
 * Returns unique identifier names that are actual references (not declarations/types)
 */
export function extractReferences(node: Node, excludeNames: Set<string> = new Set()): string[] {
  const references = new Set<string>();

  // Get all identifier descendants, plus the node itself if it's an identifier
  // (getDescendantsOfKind only returns descendants, not the node itself)
  const identifiers = node.getDescendantsOfKind(SyntaxKind.Identifier);
  if (node.getKind() === SyntaxKind.Identifier) {
    identifiers.unshift(node as any);
  }

  for (const identifier of identifiers) {
    const name = identifier.getText();

    // Skip keywords
    if (KEYWORDS.has(name)) continue;

    // Skip explicitly excluded names (e.g., function's own parameters)
    if (excludeNames.has(name)) continue;

    // Skip type positions
    if (isInTypePosition(identifier)) continue;

    // Skip declarations
    if (isDeclaration(identifier)) continue;

    // Skip property names in property access (but keep the base object)
    if (isPropertyName(identifier)) continue;

    references.add(name);
  }

  return Array.from(references);
}

/**
 * Extract references from a function body, excluding its own parameters
 */
export function extractFunctionReferences(
  func: FunctionDeclaration | ArrowFunction
): string[] {
  const paramNames = new Set(func.getParameters().map((p) => p.getName()));

  // For the function body, extract references
  const body = func.getBody();
  if (!body) return [];

  return extractReferences(body, paramNames);
}

/**
 * Extract top-level references from a source file
 * These are identifiers referenced outside of any function or class body
 */
export function extractTopLevelReferences(sourceFile: SourceFile): string[] {
  const references = new Set<string>();

  // Collect names that are defined in this file (to potentially exclude)
  const localDefinitions = new Set<string>();

  // Get all imported names
  const importedNames = new Set<string>();
  for (const importDecl of sourceFile.getImportDeclarations()) {
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport) {
      importedNames.add(defaultImport.getText());
    }

    const namespaceImport = importDecl.getNamespaceImport();
    if (namespaceImport) {
      importedNames.add(namespaceImport.getText());
    }

    for (const namedImport of importDecl.getNamedImports()) {
      importedNames.add(namedImport.getAliasNode()?.getText() || namedImport.getName());
    }
  }

  // Get all function/class/variable declarations at top level
  for (const func of sourceFile.getFunctions()) {
    const name = func.getName();
    if (name) localDefinitions.add(name);
  }

  for (const cls of sourceFile.getClasses()) {
    const name = cls.getName();
    if (name) localDefinitions.add(name);
  }

  for (const stmt of sourceFile.getVariableStatements()) {
    for (const decl of stmt.getDeclarations()) {
      localDefinitions.add(decl.getName());
    }
  }

  // Now find top-level statements that are NOT function/class declarations
  // and extract references from them
  for (const statement of sourceFile.getStatements()) {
    const kind = statement.getKind();

    // Skip function and class declarations (their bodies are handled separately)
    if (kind === SyntaxKind.FunctionDeclaration) continue;
    if (kind === SyntaxKind.ClassDeclaration) continue;

    // Skip import/export declarations
    if (kind === SyntaxKind.ImportDeclaration) continue;
    if (kind === SyntaxKind.ExportDeclaration) continue;
    if (kind === SyntaxKind.ExportAssignment) continue;

    // Skip type-only declarations
    if (kind === SyntaxKind.InterfaceDeclaration) continue;
    if (kind === SyntaxKind.TypeAliasDeclaration) continue;

    // For variable statements, check if it's an arrow function (handled by function parser)
    if (kind === SyntaxKind.VariableStatement) {
      const varStmt = statement as VariableStatement;

      for (const decl of varStmt.getDeclarations()) {
        const init = decl.getInitializer();

        // If it's an arrow function, skip the body (handled by function parser)
        // but still extract references from the initializer if it's not an arrow function
        if (init && init.getKind() === SyntaxKind.ArrowFunction) {
          // Arrow function - skip, handled by function parser
          continue;
        }

        // For non-arrow-function initializers, extract references
        if (init) {
          const refs = extractReferences(init, importedNames);
          refs.forEach((r) => references.add(r));
        }
      }
      continue;
    }

    // For expression statements (like process.on('SIGTERM', shutdown))
    // and other top-level code, extract references
    const refs = extractReferences(statement, importedNames);
    refs.forEach((r) => references.add(r));
  }

  return Array.from(references);
}

/**
 * Check if a reference is to a common global (less interesting for orphan detection)
 */
export function isCommonGlobal(name: string): boolean {
  return COMMON_GLOBALS.has(name);
}
