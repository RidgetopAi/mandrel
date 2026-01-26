/**
 * Parse functions from a TypeScript source file
 *
 * Extracts:
 * - Function name, line numbers
 * - Parameters with types
 * - Return type
 * - Async flag
 * - Export status
 */

import { SourceFile, FunctionDeclaration, ArrowFunction, SyntaxKind } from 'ts-morph';
import type { FunctionNode, ParameterInfo } from '../types/node.types.js';
import { NodeType } from '../types/node.types.js';
import { extractFunctionReferences } from './parse-references.js';

export interface ParseFunctionsResult {
  functions: FunctionNode[];
  functionIds: string[];
}

/**
 * Generate a unique ID for a function
 */
function generateFunctionId(fileId: string, name: string, line: number): string {
  return `${fileId}:fn:${name}:${line}`;
}

/**
 * Parse parameters from a function
 */
function parseParameters(params: ReturnType<FunctionDeclaration['getParameters']>): ParameterInfo[] {
  return params.map(param => ({
    name: param.getName(),
    type: param.getType().getText() || null,
    isOptional: param.isOptional(),
    defaultValue: param.getInitializer()?.getText() || null,
  }));
}

/**
 * Parse all function declarations from a source file
 */
export function parseFunctions(
  sourceFile: SourceFile,
  fileId: string,
  _filePath: string
): ParseFunctionsResult {
  const functions: FunctionNode[] = [];
  const functionIds: string[] = [];

  // Regular function declarations
  const functionDeclarations = sourceFile.getFunctions();
  for (const func of functionDeclarations) {
    const name = func.getName() || 'anonymous';
    const line = func.getStartLineNumber();
    const id = generateFunctionId(fileId, name, line);

    const node: FunctionNode = {
      id,
      type: NodeType.Function,
      name,
      filePath: sourceFile.getFilePath(),
      line,
      endLine: func.getEndLineNumber(),
      parentFileId: fileId,
      parentClassId: null,
      params: parseParameters(func.getParameters()),
      returnType: func.getReturnType().getText() || null,
      isExported: func.isExported(),
      isAsync: func.isAsync(),
      behavioral: null, // Phase 4
      source: func.getText(),
      references: extractFunctionReferences(func),
    };

    functions.push(node);
    functionIds.push(id);
  }

  // Arrow functions assigned to variables (const foo = () => {})
  const variableStatements = sourceFile.getVariableStatements();
  for (const statement of variableStatements) {
    const declarations = statement.getDeclarations();
    for (const decl of declarations) {
      const initializer = decl.getInitializer();
      if (initializer && initializer.getKind() === SyntaxKind.ArrowFunction) {
        const arrowFunc = initializer as ArrowFunction;
        const name = decl.getName();
        const line = decl.getStartLineNumber();
        const id = generateFunctionId(fileId, name, line);

        // Get the full variable declaration for arrow functions to include const/export
        const node: FunctionNode = {
          id,
          type: NodeType.Function,
          name,
          filePath: sourceFile.getFilePath(),
          line,
          endLine: arrowFunc.getEndLineNumber(),
          parentFileId: fileId,
          parentClassId: null,
          params: parseParameters(arrowFunc.getParameters()),
          returnType: arrowFunc.getReturnType().getText() || null,
          isExported: statement.isExported(),
          isAsync: arrowFunc.isAsync(),
          behavioral: null, // Phase 4
          source: statement.getText(),
          references: extractFunctionReferences(arrowFunc),
        };

        functions.push(node);
        functionIds.push(id);
      }
    }
  }

  return { functions, functionIds };
}
