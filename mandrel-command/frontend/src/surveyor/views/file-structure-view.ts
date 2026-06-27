/**
 * File-structure view — the folder → file drilldown, ported onto the seam.
 *
 * - Root (nav.currentFolder === null): one node per folder, grid layout, no edges.
 * - Drilled in: file nodes for that folder, wired by the REAL import connections
 *   (scan.connections of type Import) between those files, dagre-laid-out.
 */

import type { ScanResult, FileNode } from '../core-types';
import type { BuiltGraph, GraphEdge, GraphNode, NavState } from './types';
import { NODE_TYPE, CONNECTION_TYPE } from '../config/contract';
import { folderNodeId } from '../config/view.config';
import { folderOf } from './graph-utils';
import { layoutDagre, layoutGrid } from './layout';
import { NODE_SIZE } from '../config/layout.config';

interface FolderGroup {
  path: string;
  files: FileNode[];
}

function fileNodesOf(scan: ScanResult): FileNode[] {
  return Object.values(scan.nodes).filter(
    (n): n is FileNode => n.type === NODE_TYPE.File
  );
}

function groupByFolder(files: FileNode[]): FolderGroup[] {
  const groups = new Map<string, FileNode[]>();
  for (const file of files) {
    const folder = folderOf(file.filePath);
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder)!.push(file);
  }
  return Array.from(groups.keys())
    .sort()
    .map((path) => ({
      path,
      files: groups.get(path)!.sort((a, b) => a.name.localeCompare(b.name)),
    }));
}

/** Warning count per folder (counted once per warning, by affected node). */
function warningCountsByFolder(scan: ScanResult): Map<string, number> {
  const counts = new Map<string, number>();
  for (const warning of scan.warnings) {
    const folders = new Set<string>();
    for (const nodeId of warning.affectedNodes) {
      const node = scan.nodes[nodeId];
      if (node) folders.add(folderOf(node.filePath));
    }
    for (const folder of folders) {
      counts.set(folder, (counts.get(folder) ?? 0) + 1);
    }
  }
  return counts;
}

function buildRoot(scan: ScanResult): BuiltGraph {
  const groups = groupByFolder(fileNodesOf(scan));
  const warningCounts = warningCountsByFolder(scan);
  const ids = groups.map((g) => folderNodeId(g.path));
  const positions = layoutGrid(ids, NODE_SIZE.folder);

  const nodes: GraphNode[] = groups.map((group) => {
    const id = folderNodeId(group.path);
    const functionCount = group.files.reduce((sum, f) => sum + f.functions.length, 0);
    return {
      id,
      type: 'folder',
      position: positions.get(id) ?? { x: 0, y: 0 },
      data: {
        label: group.path.split('/').pop() || group.path,
        folderPath: group.path,
        fileCount: group.files.length,
        functionCount,
        warningCount: warningCounts.get(group.path) ?? 0,
      },
    };
  });

  return { nodes, edges: [], meta: { folderCount: groups.length } };
}

function buildDrilled(scan: ScanResult, folder: string): BuiltGraph {
  const filesInFolder = fileNodesOf(scan).filter(
    (f) => folderOf(f.filePath) === folder
  );
  if (filesInFolder.length === 0) {
    return { nodes: [], edges: [], meta: { folder, empty: true } };
  }

  const idSet = new Set(filesInFolder.map((f) => f.id));

  // Real import edges between files in this folder.
  const importEdges = scan.connections.filter(
    (c) =>
      c.type === CONNECTION_TYPE.Import &&
      idSet.has(c.sourceId) &&
      idSet.has(c.targetId)
  );

  const positions = layoutDagre(
    filesInFolder.map((f) => ({ id: f.id, ...NODE_SIZE.file })),
    importEdges.map((c) => ({ source: c.sourceId, target: c.targetId }))
  );

  const nodes: GraphNode[] = filesInFolder
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((file) => ({
      id: file.id,
      type: 'file',
      position: positions.get(file.id) ?? { x: 0, y: 0 },
      data: {
        label: file.name,
        filePath: file.filePath,
        fileData: file,
      },
    }));

  const edges: GraphEdge[] = importEdges.map((c) => ({
    id: c.id,
    source: c.sourceId,
    target: c.targetId,
    type: 'smoothstep',
  }));

  return { nodes, edges, meta: { folder, fileCount: filesInFolder.length } };
}

export function buildFileStructureView(
  scan: ScanResult,
  nav: NavState
): BuiltGraph {
  return nav.currentFolder === null
    ? buildRoot(scan)
    : buildDrilled(scan, nav.currentFolder);
}
