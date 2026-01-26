/**
 * Utilities for creating connection edges between file nodes
 */

import type { Edge } from 'reactflow';
import type { FileNodeData } from './layout';

export interface EdgeConfig {
  animated?: boolean;
  strokeWidth?: number;
}

/**
 * Generates React Flow edges from file import relationships
 */
export function generateImportEdges(
  nodes: Record<string, any>,
  config: EdgeConfig = {}
): Edge[] {
  const edges: Edge[] = [];
  const fileNodes = getFileNodes(nodes);
  const filePathToId = buildFilePathIndex(fileNodes);

  for (const file of fileNodes) {
    for (const importInfo of file.imports || []) {
      const targetId = resolveImportToFileId(
        file.filePath,
        importInfo.source,
        filePathToId
      );

      if (targetId) {
        edges.push({
          id: `edge-${file.id}-${targetId}`,
          source: file.id,
          target: targetId,
          animated: config.animated ?? false,
          style: {
            strokeWidth: config.strokeWidth ?? 1,
          },
        });
      }
    }
  }

  return edges;
}

/**
 * Extracts FileNode entries from a NodeMap
 */
function getFileNodes(nodes: Record<string, any>): FileNodeData[] {
  return Object.values(nodes).filter(
    (node): node is FileNodeData => node.type === 'file'
  );
}

/**
 * Builds an index mapping file paths to node IDs
 */
function buildFilePathIndex(files: FileNodeData[]): Map<string, string> {
  const index = new Map<string, string>();

  for (const file of files) {
    // Index by full path
    index.set(file.filePath, file.id);

    // Index without extension
    const withoutExt = removeExtension(file.filePath);
    index.set(withoutExt, file.id);

    // Index as potential index file
    if (file.name === 'index.ts' || file.name === 'index.tsx') {
      const dirPath = file.filePath.replace(/\/index\.(ts|tsx|js|jsx)$/, '');
      index.set(dirPath, file.id);
    }
  }

  return index;
}

/**
 * Resolves an import source to a file node ID
 */
function resolveImportToFileId(
  importingFilePath: string,
  importSource: string,
  fileIndex: Map<string, string>
): string | null {
  // Skip external modules (no ./ or ../)
  if (!importSource.startsWith('.')) {
    return null;
  }

  // Get the directory of the importing file
  const importingDir = getDirectory(importingFilePath);

  // Resolve the relative path
  const resolvedPath = resolvePath(importingDir, importSource);

  // Try to find a match
  return (
    fileIndex.get(resolvedPath) ||
    fileIndex.get(resolvedPath + '.ts') ||
    fileIndex.get(resolvedPath + '.tsx') ||
    fileIndex.get(resolvedPath + '/index.ts') ||
    fileIndex.get(resolvedPath + '/index.tsx') ||
    null
  );
}

/**
 * Gets the directory portion of a file path
 */
function getDirectory(filePath: string): string {
  const parts = filePath.split('/');
  return parts.slice(0, -1).join('/') || '.';
}

/**
 * Removes file extension from a path
 */
function removeExtension(filePath: string): string {
  return filePath.replace(/\.(ts|tsx|js|jsx)$/, '');
}

/**
 * Resolves a relative path against a base directory
 */
function resolvePath(baseDir: string, relativePath: string): string {
  const baseParts = baseDir.split('/').filter(Boolean);
  const relParts = relativePath.split('/').filter(Boolean);

  const result = [...baseParts];

  for (const part of relParts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.') {
      result.push(part);
    }
  }

  return result.join('/');
}
