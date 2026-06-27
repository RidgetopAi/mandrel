/**
 * Pure aggregation for the folder/group summary card.
 *
 * Given a scan and a folder path, roll up the files directly in that folder and
 * their declared functions/classes, plus the warnings that touch the folder.
 * Warning counting matches the file-structure view (`warningCountsByFolder`):
 * a warning is counted ONCE for the folder if any of its affected nodes live
 * there. No React/DOM — fully unit-testable.
 */
import type { ScanResult, FileNode } from '../../core-types';
import { NODE_TYPE } from '../../config/contract';
import { folderOf } from '../../views/graph-utils';
import type { FindingLevel } from '../../config/findings.config';

export interface FolderSummary {
  folderPath: string;
  fileCount: number;
  functionCount: number;
  classCount: number;
  warningCount: number;
  warningsByLevel: Record<FindingLevel, number>;
}

function emptyByLevel(): Record<FindingLevel, number> {
  return { error: 0, warning: 0, info: 0 };
}

/** The file nodes whose parent folder is exactly `folderPath`. */
export function filesInFolder(scan: ScanResult, folderPath: string): FileNode[] {
  return Object.values(scan.nodes).filter(
    (n): n is FileNode =>
      n.type === NODE_TYPE.File && folderOf(n.filePath) === folderPath
  );
}

export function aggregateFolder(
  scan: ScanResult,
  folderPath: string
): FolderSummary {
  const files = filesInFolder(scan, folderPath);

  const functionCount = files.reduce((sum, f) => sum + f.functions.length, 0);
  const classCount = files.reduce((sum, f) => sum + f.classes.length, 0);

  const warningsByLevel = emptyByLevel();
  let warningCount = 0;

  for (const warning of scan.warnings) {
    const folders = new Set<string>();
    for (const nodeId of warning.affectedNodes) {
      const node = scan.nodes[nodeId];
      if (node) folders.add(folderOf(node.filePath));
    }
    if (folders.has(folderPath)) {
      warningCount += 1;
      const level = warning.level as FindingLevel;
      if (level in warningsByLevel) warningsByLevel[level] += 1;
    }
  }

  return {
    folderPath,
    fileCount: files.length,
    functionCount,
    classCount,
    warningCount,
    warningsByLevel,
  };
}
