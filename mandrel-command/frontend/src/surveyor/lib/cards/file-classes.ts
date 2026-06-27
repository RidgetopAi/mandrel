/**
 * Pure data-shaping for the CLASSES section of the file card.
 *
 * A FileNode carries `classes: string[]` (ids of its ClassNodes). This resolves
 * those ids against the node map into render-ready shapes (name, methods,
 * extends/implements), tolerating missing/mistyped ids. No React/DOM.
 */
import type { ScanResult, FileNode, ClassNode } from '../../core-types';
import { NODE_TYPE } from '../../config/contract';

export interface ClassCardData {
  id: string;
  name: string;
  methods: string[];
  extends: string | null;
  implements: string[];
  isExported: boolean;
}

/**
 * Resolve a file's class ids to ClassNode shapes. Ids that don't resolve to a
 * class node are skipped (defensive against a partial/forward-compat scan).
 * Order follows the file's declared `classes` order.
 */
export function shapeFileClasses(
  file: FileNode,
  nodes: ScanResult['nodes']
): ClassCardData[] {
  const out: ClassCardData[] = [];
  for (const classId of file.classes) {
    const node = nodes[classId];
    // NODE_TYPE.Class is a contract-cast value (typed as the widened enum), so
    // it can't auto-narrow the discriminated union — assert to ClassNode once
    // the runtime tag matches.
    if (!node || node.type !== NODE_TYPE.Class) continue;
    const cls = node as ClassNode;
    out.push({
      id: cls.id,
      name: cls.name,
      methods: [...cls.methods],
      extends: cls.extends,
      implements: [...cls.implements],
      isExported: cls.isExported,
    });
  }
  return out;
}
