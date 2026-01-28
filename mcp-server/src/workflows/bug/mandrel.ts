/**
 * Bug Workflow Mandrel Hooks Implementation
 *
 * Implements the required WorkflowMandrelHooks interface.
 * Each hook stores context to Mandrel for institutional memory.
 */

import type {
  WorkflowMandrelHooks,
  InvestigationEvent,
  BugWorkflow,
  BugAnalysis,
  Review,
  ImplementationResult,
} from '../contracts/index.js';
import { contextHandler } from '../../handlers/context.js';

/**
 * Format workflow for Mandrel storage
 */
function formatWorkflowContent(workflow: BugWorkflow): string {
  return `# Bug Workflow Started

**Workflow ID:** ${workflow.id}
**Project:** ${workflow.projectPath}
**State:** ${workflow.state}

## Bug Report
**Title:** ${workflow.bugReport.title}
**Severity:** ${workflow.bugReport.severity}

${workflow.bugReport.description}

${workflow.bugReport.stepsToReproduce ? `### Steps to Reproduce\n${workflow.bugReport.stepsToReproduce}` : ''}
${workflow.bugReport.expectedBehavior ? `### Expected\n${workflow.bugReport.expectedBehavior}` : ''}
${workflow.bugReport.actualBehavior ? `### Actual\n${workflow.bugReport.actualBehavior}` : ''}`;
}

/**
 * Format investigation event for Mandrel storage
 */
function formatEventContent(workflowId: string, event: InvestigationEvent): string {
  const details = Object.entries(event.details)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `- **${k}:** ${v}`)
    .join('\n');

  return `# Investigation Step

**Workflow:** ${workflowId}
**Action:** ${event.action}
**Sequence:** ${event.sequence}
**Time:** ${event.timestamp.toISOString()}

${details}`;
}

/**
 * Format analysis proposal for Mandrel storage
 */
function formatProposalContent(workflowId: string, analysis: BugAnalysis): string {
  const changes = analysis.proposedFix?.changes
    .map((c, i) => `### Change ${i + 1}: ${c.file}\n\`\`\`\n${c.proposed}\n\`\`\`\n${c.explanation || ''}`)
    .join('\n\n') || 'No changes proposed';

  return `# Bug Fix Proposal

**Workflow:** ${workflowId}
**Confidence:** ${analysis.confidence}

## Root Cause
${analysis.rootCause}

## Evidence
${analysis.evidence}

## Proposed Changes
${changes}

${analysis.proposedFix?.risks?.length ? `## Risks\n${analysis.proposedFix.risks.map(r => `- ${r}`).join('\n')}` : ''}
${analysis.proposedFix?.testNeeds?.length ? `## Tests Needed\n${analysis.proposedFix.testNeeds.map(t => `- ${t}`).join('\n')}` : ''}`;
}

/**
 * Format review decision for Mandrel storage
 */
function formatDecisionContent(workflowId: string, review: Review): string {
  return `# Review Decision

**Workflow:** ${workflowId}
**Decision:** ${review.decision}
**Reviewed At:** ${review.reviewedAt.toISOString()}

${review.feedback ? `## Feedback\n${review.feedback}` : ''}`;
}

/**
 * Format implementation result for Mandrel storage
 */
function formatCompletionContent(workflowId: string, result: ImplementationResult): string {
  return `# Implementation Complete

**Workflow:** ${workflowId}
**Success:** ${result.success}

## Changed Files
${result.changedFiles.map(f => `- ${f}`).join('\n') || 'None'}

${result.buildResult ? `## Build Result\n- **Command:** ${result.buildResult.command}\n- **Success:** ${result.buildResult.success}` : ''}

${result.testResults ? `## Test Results\n- **Passed:** ${result.testResults.passed}\n- **Failed:** ${result.testResults.failed}\n- **Skipped:** ${result.testResults.skipped}` : ''}

${result.warnings.length ? `## Warnings\n${result.warnings.map(w => `- ${w}`).join('\n')}` : ''}
${result.errors.length ? `## Errors\n${result.errors.map(e => `- ${e}`).join('\n')}` : ''}`;
}

/**
 * Format failure for Mandrel storage
 */
function formatFailureContent(workflowId: string, error: Error, stage: string): string {
  return `# Workflow Failed

**Workflow:** ${workflowId}
**Stage:** ${stage}
**Error:** ${error.message}

## Stack Trace
\`\`\`
${error.stack || 'No stack trace available'}
\`\`\``;
}

/**
 * Implementation of WorkflowMandrelHooks
 */
export const bugWorkflowHooks: WorkflowMandrelHooks = {
  async onWorkflowStart(workflow: BugWorkflow): Promise<void> {
    console.log(`[MandrelHooks] Storing workflow start: ${workflow.id}`);

    await contextHandler.storeContext({
      content: formatWorkflowContent(workflow),
      type: 'planning',
      tags: ['bug-workflow', 'workflow-start', workflow.id],
    });
  },

  async onInvestigationStep(workflowId: string, event: InvestigationEvent): Promise<void> {
    console.log(`[MandrelHooks] Storing investigation step: ${workflowId} - ${event.action}`);

    await contextHandler.storeContext({
      content: formatEventContent(workflowId, event),
      type: 'discussion',
      tags: ['bug-workflow', 'investigation', workflowId, event.action],
    });
  },

  async onProposalGenerated(workflowId: string, analysis: BugAnalysis): Promise<void> {
    console.log(`[MandrelHooks] Storing proposal: ${workflowId}`);

    await contextHandler.storeContext({
      content: formatProposalContent(workflowId, analysis),
      type: 'code',
      tags: ['bug-workflow', 'proposal', workflowId, `confidence-${analysis.confidence}`],
    });
  },

  async onHumanDecision(workflowId: string, review: Review): Promise<void> {
    console.log(`[MandrelHooks] Storing decision: ${workflowId} - ${review.decision}`);

    await contextHandler.storeContext({
      content: formatDecisionContent(workflowId, review),
      type: 'decision',
      tags: ['bug-workflow', 'review', workflowId, review.decision],
    });
  },

  async onImplementationComplete(workflowId: string, result: ImplementationResult): Promise<void> {
    console.log(`[MandrelHooks] Storing completion: ${workflowId}`);

    await contextHandler.storeContext({
      content: formatCompletionContent(workflowId, result),
      type: 'completion',
      tags: ['bug-workflow', 'implementation', workflowId, result.success ? 'success' : 'failed'],
    });
  },

  async onWorkflowFail(workflowId: string, error: Error, stage: string): Promise<void> {
    console.log(`[MandrelHooks] Storing failure: ${workflowId} at ${stage}`);

    await contextHandler.storeContext({
      content: formatFailureContent(workflowId, error, stage),
      type: 'error',
      tags: ['bug-workflow', 'failure', workflowId, stage],
    });
  },
};

/**
 * Query Mandrel for relevant past bug fixes
 */
export async function getContextForBugAnalysis(
  bugReport: { title: string; description: string }
): Promise<string> {
  try {
    const searchQuery = `${bugReport.title} ${bugReport.description}`.substring(0, 200);
    const results = await contextHandler.searchContext({
      query: searchQuery,
      limit: 3,
      type: 'completion',
    });

    if (results && results.length > 0) {
      const contextBlock = results
        .map((r: { content: string }) => r.content.substring(0, 500))
        .join('\n\n---\n\n');

      return `\n## Relevant Past Work (from Mandrel)\n\n${contextBlock}\n`;
    }

    return '';
  } catch (error) {
    console.warn('[MandrelHooks] Failed to retrieve context:', error);
    return '';
  }
}
