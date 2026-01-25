/**
 * Decision Tool Handlers - decision_record, decision_search, decision_update, decision_stats
 */

import { decisionsHandler } from '../../handlers/decisions.js';

export const decisionHandlers = {
  async handleDecisionRecord(args: any) {
    return decisionsHandler.recordDecision({
      title: args.title,
      description: args.description,
      rationale: args.rationale || '',
      alternativesConsidered: args.alternatives ?
        (Array.isArray(args.alternatives) ? args.alternatives.map((alt: any) => ({
          name: typeof alt === 'string' ? alt : (alt.name || 'Alternative'),
          description: typeof alt === 'string' ? alt : (alt.description || ''),
          pros: typeof alt === 'object' && alt.pros ? alt.pros : [],
          cons: typeof alt === 'object' && alt.cons ? alt.cons : []
        })) : []) : [],
      decisionType: args.decisionType || 'technical',
      impactLevel: args.impactLevel || 'medium',
      projectId: args.projectId
    });
  },

  async handleDecisionSearch(args: any) {
    return decisionsHandler.searchDecisions({
      query: args.query,
      limit: args.limit,
      projectId: args.projectId
    });
  },

  async handleDecisionUpdate(args: any) {
    return decisionsHandler.updateDecision({
      decisionId: args.decisionId,
      status: args.status,
      outcomeNotes: args.outcome
    });
  },

  async handleDecisionStats(args: any) {
    return decisionsHandler.getDecisionStats(args.sessionId || 'default-session');
  }
};
