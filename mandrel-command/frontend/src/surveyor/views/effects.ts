/**
 * Behavioral-flag → effect-group classification (data-flow view).
 *
 * Pure and deterministic. A function can carry several behavioral flags; it is
 * assigned to the single highest-priority group present (priority = the order
 * in EFFECT_GROUP_ORDER). When no AI behavioral data exists (behavioral is
 * null), the function is 'unknown' — we never fabricate a DB/HTTP label.
 */

import type { BehavioralSummary } from '../core-types';
import type { EffectGroup } from '../config/view.config';

export function classifyEffect(
  behavioral: BehavioralSummary | null | undefined
): EffectGroup {
  if (!behavioral || !behavioral.flags) return 'unknown';
  const f = behavioral.flags;
  if (f.databaseRead || f.databaseWrite) return 'database';
  if (f.httpCall) return 'network';
  if (f.fileRead || f.fileWrite) return 'filesystem';
  if (f.sendsNotification) return 'notification';
  if (f.modifiesGlobalState || f.hasSideEffects) return 'state';
  return 'pure';
}
