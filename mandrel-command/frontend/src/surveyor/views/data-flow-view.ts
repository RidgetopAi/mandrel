/**
 * Data-flow view — "where the logic lives".
 *
 * Nodes = functions, grouped into lanes by side-effect (Database / Network /
 * File System / Notifications / Global State / Pure), colored per group.
 * Edges = the REAL function-call connections (scan.connections of type
 * FunctionCall). Layout = one lane (column) per effect group.
 *
 * Graceful degradation: behavioral flags come from an AI scan. When a function
 * has no behavioral data it lands in the 'unknown' lane — we never fabricate a
 * DB/HTTP classification. `meta.hasBehavioralData` tells the UI whether any
 * real effect data was present so it can prompt for an AI scan.
 */

import type { ScanResult, FunctionNode } from '../core-types';
import type { BuiltGraph, GraphEdge, GraphNode } from './types';
import { NODE_TYPE, CONNECTION_TYPE } from '../config/contract';
import { classifyEffect } from './effects';
import { layoutLanes } from './layout';
import { NODE_SIZE } from '../config/layout.config';
import {
  EFFECT_GROUP_ORDER,
  EFFECT_GROUP_STYLES,
  type EffectGroup,
} from '../config/view.config';

export function buildDataFlowView(scan: ScanResult): BuiltGraph {
  const functions = Object.values(scan.nodes).filter(
    (n): n is FunctionNode => n.type === NODE_TYPE.Function
  );

  // Classify each function into an effect group.
  const byGroup = new Map<EffectGroup, FunctionNode[]>();
  let hasBehavioralData = false;

  for (const fn of functions) {
    if (fn.behavioral) hasBehavioralData = true;
    const group = classifyEffect(fn.behavioral);
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group)!.push(fn);
  }

  // Build lanes in priority order, only for groups that have members; sort
  // members within a lane deterministically.
  const lanes = EFFECT_GROUP_ORDER.filter((g) => byGroup.has(g)).map((g) => {
    const members = byGroup
      .get(g)!
      .slice()
      .sort((a, b) =>
        a.filePath === b.filePath
          ? a.name.localeCompare(b.name)
          : a.filePath.localeCompare(b.filePath)
      );
    return { key: g, ids: members.map((m) => m.id) };
  });

  const positions = layoutLanes(lanes, { height: NODE_SIZE.effect.height });
  const fnById = new Map(functions.map((f) => [f.id, f]));

  const nodes: GraphNode[] = [];
  for (const lane of lanes) {
    const group = lane.key as EffectGroup;
    const style = EFFECT_GROUP_STYLES[group];
    for (const id of lane.ids) {
      const fn = fnById.get(id)!;
      nodes.push({
        id,
        type: 'effect',
        position: positions.get(id) ?? { x: 0, y: 0 },
        data: {
          label: fn.name,
          filePath: fn.filePath,
          effectGroup: group,
          effectLabel: style.label,
          color: style.color,
          isAsync: fn.isAsync,
          flags: fn.behavioral?.flags ?? null,
          fnData: fn,
        },
      });
    }
  }

  // Real function-call edges between included functions.
  const idSet = new Set(functions.map((f) => f.id));
  const callEdges = scan.connections.filter(
    (c) =>
      c.type === CONNECTION_TYPE.FunctionCall &&
      idSet.has(c.sourceId) &&
      idSet.has(c.targetId)
  );

  const edges: GraphEdge[] = callEdges.map((c) => ({
    id: c.id,
    source: c.sourceId,
    target: c.targetId,
    type: 'smoothstep',
    data: { callCount: c.metadata.callCount },
  }));

  // Lane composition summary (deterministic, group-order keyed).
  const groupCounts: Record<string, number> = {};
  for (const lane of lanes) groupCounts[lane.key] = lane.ids.length;

  return {
    nodes,
    edges,
    meta: {
      hasBehavioralData,
      functionCount: functions.length,
      callCount: callEdges.length,
      laneCount: lanes.length,
      groupCounts,
    },
  };
}
