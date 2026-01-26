/**
 * Parse imports from a TypeScript source file
 *
 * Extracts:
 * - Import source path
 * - Named imports
 * - Default imports
 * - Namespace imports
 * - Type-only imports
 * - Dynamic imports (import('...'))
 */

import { SourceFile, SyntaxKind } from 'ts-morph';
import type { ImportInfo, ImportItem } from '../types/node.types.js';

/**
 * Parse all import declarations from a source file (static and dynamic)
 */
export function parseImports(sourceFile: SourceFile): ImportInfo[] {
  const imports: ImportInfo[] = [];

  // Parse static import declarations
  const importDeclarations = sourceFile.getImportDeclarations();

  for (const importDecl of importDeclarations) {
    const source = importDecl.getModuleSpecifierValue();
    const isTypeOnly = importDecl.isTypeOnly();
    const items: ImportItem[] = [];

    // Default import
    const defaultImport = importDecl.getDefaultImport();
    if (defaultImport) {
      items.push({
        name: defaultImport.getText(),
        alias: null,
        isDefault: true,
        isNamespace: false,
      });
    }

    // Namespace import (import * as X)
    const namespaceImport = importDecl.getNamespaceImport();
    if (namespaceImport) {
      items.push({
        name: namespaceImport.getText(),
        alias: null,
        isDefault: false,
        isNamespace: true,
      });
    }

    // Named imports
    const namedImports = importDecl.getNamedImports();
    for (const named of namedImports) {
      const name = named.getName();
      const aliasNode = named.getAliasNode();
      items.push({
        name,
        alias: aliasNode ? aliasNode.getText() : null,
        isDefault: false,
        isNamespace: false,
      });
    }

    imports.push({
      source,
      items,
      isTypeOnly,
    });
  }

  // Parse dynamic imports: import('...') or import("...")
  // These are CallExpressions where the expression is an ImportKeyword
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);

  for (const callExpr of callExpressions) {
    const expression = callExpr.getExpression();

    // Check if this is a dynamic import (the expression is the 'import' keyword)
    if (expression.getKind() === SyntaxKind.ImportKeyword) {
      const args = callExpr.getArguments();
      if (args.length > 0) {
        const arg = args[0]!;
        // Get the string literal value (strip quotes)
        let source = arg.getText();
        // Remove surrounding quotes (', ", or `)
        if ((source.startsWith("'") && source.endsWith("'")) ||
            (source.startsWith('"') && source.endsWith('"')) ||
            (source.startsWith('`') && source.endsWith('`'))) {
          source = source.slice(1, -1);
        }

        // Dynamic imports are default imports (the whole module is imported)
        // We mark them with a special 'default' item to track that this module is used
        imports.push({
          source,
          items: [{
            name: 'default',
            alias: null,
            isDefault: true,
            isNamespace: false,
          }],
          isTypeOnly: false,
        });
      }
    }
  }

  return imports;
}
