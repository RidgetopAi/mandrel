/**
 * Parse exports from a TypeScript source file
 *
 * Extracts:
 * - Export names and aliases
 * - Default exports
 * - Type-only exports
 * - Export kind (function, class, variable, type, interface, enum, reexport)
 */

import { SourceFile, SyntaxKind, ExportedDeclarations } from 'ts-morph';
import type { ExportInfo } from '../types/node.types.js';

/**
 * Parse all export declarations from a source file
 */
export function parseExports(sourceFile: SourceFile): ExportInfo[] {
  const exports: ExportInfo[] = [];

  // Exported declarations (export function, export class, etc.)
  for (const [name, declarations] of sourceFile.getExportedDeclarations()) {
    for (const decl of declarations) {
      const kind = getExportKind(decl.getKind());
      const isDefault = name === 'default';

      // Check if it's a type export
      const isTypeOnly = decl.getKind() === SyntaxKind.InterfaceDeclaration ||
                         decl.getKind() === SyntaxKind.TypeAliasDeclaration;

      exports.push({
        name: isDefault ? getDefaultExportName(decl) : name,
        alias: null,
        isDefault,
        isTypeOnly,
        kind,
      });
    }
  }

  // Re-exports (export { x } from './module' and export * from './module')
  const exportDeclarations = sourceFile.getExportDeclarations();
  for (const exportDecl of exportDeclarations) {
    const moduleSpecifier = exportDecl.getModuleSpecifierValue();
    if (moduleSpecifier) {
      // Check for star re-export (export * from './module')
      if (exportDecl.isNamespaceExport()) {
        exports.push({
          name: '*',
          alias: null,
          isDefault: false,
          isTypeOnly: exportDecl.isTypeOnly(),
          kind: 'reexport',
          source: moduleSpecifier,
        });
      } else {
        // Named re-exports (export { x, y } from './module')
        const namedExports = exportDecl.getNamedExports();
        for (const named of namedExports) {
          const exportName = named.getName();
          const aliasNode = named.getAliasNode();
          exports.push({
            name: exportName,
            alias: aliasNode ? aliasNode.getText() : null,
            isDefault: false,
            isTypeOnly: exportDecl.isTypeOnly(),
            kind: 'reexport',
            source: moduleSpecifier,
          });
        }
      }
    }
  }

  return exports;
}

/**
 * Determine the kind of export based on syntax kind
 */
function getExportKind(syntaxKind: SyntaxKind): ExportInfo['kind'] {
  switch (syntaxKind) {
    case SyntaxKind.FunctionDeclaration:
    case SyntaxKind.ArrowFunction:
      return 'function';
    case SyntaxKind.ClassDeclaration:
      return 'class';
    case SyntaxKind.VariableDeclaration:
      return 'variable';
    case SyntaxKind.TypeAliasDeclaration:
      return 'type';
    case SyntaxKind.InterfaceDeclaration:
      return 'interface';
    case SyntaxKind.EnumDeclaration:
      return 'enum';
    default:
      return 'variable';
  }
}

/**
 * Get the name for a default export
 */
function getDefaultExportName(decl: ExportedDeclarations): string {
  // Try to get the name if it's a named declaration
  if ('getName' in decl && typeof decl.getName === 'function') {
    const name = decl.getName();
    if (name) return name;
  }
  return 'default';
}
