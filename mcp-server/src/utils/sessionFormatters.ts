/**
 * Session Formatting Utilities - Phase 3
 * Production-ready formatters for session reporting tools
 */

import type { SessionActivity } from '../types/session.js';

export interface SessionSummaryData {
  id: string;
  display_id?: string;
  project_name?: string;
  started_at: Date;
  ended_at?: Date;
  duration_minutes: number;
  session_goal?: string | null;
  tags?: string[] | null;
  productivity_score?: number | null;
  tasks_created: number;
  tasks_completed: number;
  contexts_created: number;
  lines_added?: number | null;
  lines_deleted?: number | null;
  lines_net?: number | null;
  files_modified_count?: number | null;
  activity_count?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
  total_tokens?: number | null;
  ai_model?: string | null;
}

/**
 * Format session summary with all metrics
 */
export function formatSessionSummary(
  session: SessionSummaryData,
  activities: SessionActivity[],
  topFiles: Array<{ file_path: string; lines_added: number; lines_deleted: number }>,
  decisionsCount: number
): string {
  const duration = formatDuration(session.duration_minutes);
  const productivityEmoji = getProductivityEmoji(session.productivity_score);
  const sessionId = session.display_id || session.id.substring(0, 8);

  let output = `📊 SESSION SUMMARY: ${sessionId}\n\n`;

  // Goal and metadata
  output += `🎯 Goal: ${session.session_goal || 'No goal set'}\n`;
  output += `🏷️  Tags: ${session.tags && session.tags.length > 0 ? session.tags.join(', ') : 'No tags'}\n`;
  output += `📅 Duration: ${duration}\n`;
  output += `⭐ Productivity: ${session.productivity_score !== null && session.productivity_score !== undefined ? `${session.productivity_score}/100 ${productivityEmoji}` : 'Not calculated'}\n\n`;

  // Activity metrics
  output += `📈 ACTIVITY METRICS:\n`;
  output += `   • Tasks: ${session.tasks_created} created, ${session.tasks_completed} completed (${calcCompletionRate(session)}% completion rate)\n`;
  output += `   • Context Items: ${session.contexts_created} added\n`;
  output += `   • Decisions: ${decisionsCount} recorded\n`;
  output += `   • Activities: ${session.activity_count || 0} total events\n\n`;

  // Code metrics
  output += `💻 CODE METRICS:\n`;
  output += `   • LOC: ${formatLOC(session.lines_added, session.lines_deleted, session.lines_net)}\n`;
  output += `   • Files Modified: ${session.files_modified_count || 0} files\n`;
  if (topFiles && topFiles.length > 0) {
    output += `   • Top Files:\n`;
    topFiles.forEach((file, index) => {
      const net = file.lines_added - file.lines_deleted;
      output += `     ${index + 1}. ${file.file_path} (+${file.lines_added} -${file.lines_deleted}, net: ${net >= 0 ? '+' : ''}${net})\n`;
    });
  }
  output += '\n';

  // AI usage
  output += `🤖 AI USAGE:\n`;
  output += `   • Model: ${session.ai_model || 'Not tracked'}\n`;
  output += `   • Tokens: ${session.input_tokens || 0} input, ${session.output_tokens || 0} output (${session.total_tokens || 0} total)\n\n`;

  // Session highlights
  if (activities && activities.length > 0) {
    output += `🎯 SESSION HIGHLIGHTS:\n`;
    activities.forEach((activity, index) => {
      const time = new Date(activity.occurred_at).toLocaleTimeString();
      output += `   ${index + 1}. [${time}] ${activity.activity_type}\n`;
    });
  } else {
    output += `🎯 SESSION HIGHLIGHTS:\n   (No activity timeline data)\n`;
  }
  output += '\n';

  output += `📁 PROJECT: ${session.project_name || 'No project assigned'}`;

  return output;
}

/**
 * Format sessions list with filtering info
 */
export function formatSessionsList(
  sessions: SessionSummaryData[],
  totalCount: number,
  filters: any,
  _limit: number,
  offset: number
): string {
  let output = `📋 SESSIONS LIST (Showing ${sessions.length} of ${totalCount})\n\n`;

  // Show applied filters
  output += `Filters Applied:\n`;
  output += `  • Project: ${filters.projectId ? '(Filtered)' : 'All projects'}\n`;
  output += `  • Date Range: ${filters.dateFrom || filters.dateTo ? 'Custom range' : 'All time'}\n`;
  output += `  • Tags: ${filters.tags && filters.tags.length > 0 ? filters.tags.join(', ') : 'Any tags'}\n`;
  output += `  • Status: ${filters.status || 'All'}\n\n`;

  if (sessions.length === 0) {
    output += `No sessions found matching filters.\n\n`;
    output += `💡 Try adjusting filters or use sessions_stats() for aggregate view`;
    return output;
  }

  // Table header
  output += `#  | ID       | Project      | Started    | Duration | Score | LOC   | Tags\n`;
  output += `---|----------|--------------|------------|----------|-------|-------|------\n`;

  // Table rows
  sessions.forEach((session, index) => {
    const num = String(offset + index + 1).padEnd(2);
    const id = (session.display_id || session.id.substring(0, 8)).padEnd(8);
    const project = (session.project_name || 'None').substring(0, 12).padEnd(12);
    const started = new Date(session.started_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).padEnd(10);
    const duration = formatDurationShort(session.duration_minutes).padEnd(8);
    const score = session.productivity_score !== null && session.productivity_score !== undefined ? `${session.productivity_score}/100`.padEnd(5) : 'N/A  '.padEnd(5);
    const loc = session.lines_net !== null && session.lines_net !== undefined ? (session.lines_net >= 0 ? `+${session.lines_net}` : String(session.lines_net)).padEnd(5) : 'N/A  '.padEnd(5);
    const tags = session.tags && session.tags.length > 0 ? session.tags.slice(0, 2).join(', ') : '-';

    output += `${num} | ${id} | ${project} | ${started} | ${duration} | ${score} | ${loc} | ${tags}\n`;
  });

  output += '\n';
  output += `💡 Use session_details("${sessions[0].id}") to see full details\n`;
  output += `💡 Use sessions_compare("id1", "id2") to compare sessions`;

  return output;
}

/**
 * Format session statistics
 */
export function formatSessionStats(stats: any, filters: any): string {
  let output = `📊 SESSION STATISTICS\n\n`;

  // Period and filters
  output += `📅 Period: ${filters.period === 'all' ? 'All time' : `Last ${filters.period}`}\n`;
  output += `📁 Project: ${filters.projectId ? '(Filtered)' : 'All projects'}\n`;
  if (filters.phase2Only) {
    output += `🔍 Filter: Phase 2 Sessions Only (${stats.overall.totalSessions} of ${stats.overall.totalSessionsUnfiltered || 'N/A'} total sessions)\n`;
  }
  output += '\n';

  // Overall metrics
  output += `📈 OVERALL METRICS:\n`;
  output += `   • Total Sessions: ${stats.overall.totalSessions}\n`;
  output += `   • Avg Duration: ${formatDurationShort(stats.overall.avgDuration)}\n`;
  output += `   • Avg Productivity: ${stats.overall.avgProductivity !== null ? `${stats.overall.avgProductivity}/100 ${getProductivityEmoji(stats.overall.avgProductivity)}` : 'N/A'}\n`;
  output += `   • Total LOC: ${stats.overall.totalLOC !== null ? (stats.overall.totalLOC >= 0 ? '+' : '') + stats.overall.totalLOC + ' lines (net)' : 'N/A'}\n`;
  output += `   • Total Tokens: ${formatNumber(stats.overall.totalTokens)}\n\n`;

  // Productivity breakdown
  output += `💪 PRODUCTIVITY BREAKDOWN:\n`;
  output += `   • Tasks: ${stats.overall.totalTasksCreated} created, ${stats.overall.totalTasksCompleted} completed (${calcTaskCompletionRate(stats.overall)}% completion)\n`;
  output += `   • Contexts: ${stats.overall.totalContextsCreated} items added\n`;
  output += `   • Decisions: ${stats.overall.totalDecisions || 0} recorded\n`;
  output += `   • Files: ${stats.overall.totalFiles || 0} modified\n\n`;

  // Grouped stats
  if (stats.groups && stats.groups.length > 0) {
    const groupType = filters.groupBy === 'project' ? 'PROJECT' : filters.groupBy === 'agent' ? 'AGENT' : 'TAG';
    output += `📊 BY ${groupType}:\n`;
    stats.groups.slice(0, 5).forEach((group: any, index: number) => {
      const avgProd = group.avgProductivity !== null ? `, avg ${group.avgProductivity}/100 productivity` : '';
      output += `   ${index + 1}. ${group.groupKey}: ${group.count} sessions${avgProd}\n`;
    });
    output += '\n';
  }

  // Top tags
  if (stats.topTags && stats.topTags.length > 0) {
    output += `🏷️  TOP TAGS:\n`;
    stats.topTags.slice(0, 5).forEach((tag: string, index: number) => {
      output += `   ${index + 1}. ${tag}\n`;
    });
    output += '\n';
  }

  // Time series
  if (stats.timeSeries && stats.timeSeries.length > 0) {
    output += `📈 TREND (Last 7 days):\n`;
    stats.timeSeries.slice(0, 7).forEach((day: any) => {
      const avgProd = day.avgProductivity !== null ? `, avg ${day.avgProductivity}/100` : '';
      output += `   ${day.date}: ${day.sessionCount} sessions${avgProd}\n`;
    });
    output += '\n';
  }

  // Insights
  if (stats.overall.avgProductivity !== null) {
    output += `💡 Avg productivity across all sessions: ${stats.overall.avgProductivity}/100\n`;
  }
  if (filters.phase2Only === false && stats.overall.avgProductivity === null) {
    output += `💡 Use phase2Only: true to see stats for sessions with Phase 2 tracking\n`;
  }

  return output;
}

/**
 * Format session comparison
 */
export function formatSessionComparison(session1: SessionSummaryData, session2: SessionSummaryData): string {
  let output = `🔍 SESSION COMPARISON\n\n`;

  const id1 = session1.display_id || session1.id.substring(0, 8);
  const id2 = session2.display_id || session2.id.substring(0, 8);

  // Header
  output += `                          Session 1                    Session 2\n`;
  output += `                          ---------                    ---------\n`;
  output += `ID                        ${id1.padEnd(28)} ${id2}\n`;
  output += `Project                   ${(session1.project_name || 'None').padEnd(28)} ${session2.project_name || 'None'}\n`;
  output += `Started                   ${new Date(session1.started_at).toLocaleString().padEnd(28)} ${new Date(session2.started_at).toLocaleString()}\n`;

  const dur1 = formatDurationShort(session1.duration_minutes);
  const dur2 = formatDurationShort(session2.duration_minutes);
  const durDiff = calcPercentDiff(session1.duration_minutes, session2.duration_minutes);
  output += `Duration                  ${dur1.padEnd(28)} ${dur2}${durDiff}\n\n`;

  // Goals
  output += `🎯 GOALS:\n`;
  output += `Session 1: ${session1.session_goal || 'No goal set'}\n`;
  output += `Session 2: ${session2.session_goal || 'No goal set'}`;
  if (!session1.session_goal && !session2.session_goal) {
    output += `                                          ⚠️  Both missing\n`;
  } else if (!session2.session_goal) {
    output += `                                          ⚠️  Missing\n`;
  } else {
    output += `\n`;
  }
  output += '\n';

  // Productivity
  output += `⭐ PRODUCTIVITY:\n`;
  const prod1 = session1.productivity_score !== null ? `${session1.productivity_score}/100` : 'N/A';
  const prod2 = session2.productivity_score !== null ? `${session2.productivity_score}/100` : 'N/A';
  output += `Session 1: ${prod1}\n`;
  output += `Session 2: ${prod2}`;
  if (session1.productivity_score !== null && session1.productivity_score !== undefined && session2.productivity_score !== null && session2.productivity_score !== undefined) {
    const diff = session2.productivity_score - session1.productivity_score;
    output += `                                                  ${diff > 0 ? '⬆' : diff < 0 ? '⬇' : '➡'} ${Math.abs(diff).toFixed(1)} points ${diff > 0 ? 'better' : diff < 0 ? 'worse' : 'same'}\n`;
  } else if (session1.productivity_score === null && session2.productivity_score === null) {
    output += `                                          ⚠️  Not calculated for either\n`;
  } else {
    output += `                                          ⚠️  Not calculated for one\n`;
  }
  output += '\n';

  // Tasks
  output += `📋 TASKS:\n`;
  output += `           Created    Completed    Completion Rate\n`;
  output += `Session 1: ${String(session1.tasks_created).padEnd(10)} ${String(session1.tasks_completed).padEnd(12)} ${calcCompletionRate(session1)}%\n`;
  const comp2Rate = calcCompletionRate(session2);
  const comp1Rate = calcCompletionRate(session1);
  output += `Session 2: ${String(session2.tasks_created).padEnd(10)} ${String(session2.tasks_completed).padEnd(12)} ${comp2Rate}%`;
  if (comp2Rate > comp1Rate) {
    output += `                          ⬆ Better completion\n`;
  } else if (comp2Rate < comp1Rate) {
    output += `                          ⬇ Worse completion\n`;
  } else {
    output += `\n`;
  }
  output += '\n';

  // Code
  output += `💻 CODE:\n`;
  output += `           LOC Added   LOC Deleted   Net LOC\n`;
  const loc1 = session1.lines_added !== null ? `+${session1.lines_added}`.padEnd(11) + `-${session1.lines_deleted}`.padEnd(13) + (session1.lines_net! >= 0 ? '+' : '') + session1.lines_net : 'N/A         N/A           N/A';
  const loc2 = session2.lines_added !== null ? `+${session2.lines_added}`.padEnd(11) + `-${session2.lines_deleted}`.padEnd(13) + (session2.lines_net! >= 0 ? '+' : '') + session2.lines_net : 'N/A         N/A           N/A';
  output += `Session 1: ${loc1}\n`;
  output += `Session 2: ${loc2}`;
  if ((session1.lines_net === null || session1.lines_net === undefined) && (session2.lines_net === null || session2.lines_net === undefined)) {
    output += `                                          ⚠️  Not tracked for either\n`;
  } else if (session1.lines_net !== null && session1.lines_net !== undefined && session2.lines_net !== null && session2.lines_net !== undefined) {
    const diff = session2.lines_net - session1.lines_net;
    output += `                                                  ${diff > 0 ? '⬆' : diff < 0 ? '⬇' : '➡'} ${Math.abs(diff)} lines ${diff > 0 ? 'more' : diff < 0 ? 'less' : 'same'}\n`;
  } else {
    output += `                                          ⚠️  Not tracked for one\n`;
  }
  output += '\n';

  // Tokens
  output += `🤖 AI USAGE:\n`;
  output += `           Tokens In   Tokens Out    Total\n`;
  output += `Session 1: ${String(session1.input_tokens || 0).padEnd(11)} ${String(session1.output_tokens || 0).padEnd(13)} ${session1.total_tokens || 0}\n`;
  output += `Session 2: ${String(session2.input_tokens || 0).padEnd(11)} ${String(session2.output_tokens || 0).padEnd(13)} ${session2.total_tokens || 0}`;
  if (session1.total_tokens && session2.total_tokens) {
    const tokenDiff = calcPercentDiff(session1.total_tokens, session2.total_tokens);
    output += tokenDiff + '\n';
  } else {
    output += '\n';
  }
  output += '\n';

  // Tags
  output += `🏷️  TAGS:\n`;
  output += `Session 1: ${session1.tags && session1.tags.length > 0 ? session1.tags.join(', ') : 'None'}\n`;
  output += `Session 2: ${session2.tags && session2.tags.length > 0 ? session2.tags.join(', ') : 'None'}`;
  if ((!session1.tags || session1.tags.length === 0) && (!session2.tags || session2.tags.length === 0)) {
    output += `                                                   ⚠️  No tags for either\n`;
  } else {
    output += '\n';
  }

  return output;
}

// ========== HELPER FUNCTIONS ==========

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  return `${hours}h ${mins}m`;
}

function formatDurationShort(minutes: number | null | undefined): string {
  if (!minutes) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const mins = Math.floor(minutes % 60);
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatLOC(added: number | null | undefined, deleted: number | null | undefined, net: number | null | undefined): string {
  if (added === null || added === undefined) return 'Not tracked';
  return `+${added} -${deleted} (net: ${net! >= 0 ? '+' : ''}${net})`;
}

function formatNumber(num: number | null | undefined): string {
  if (!num) return '0';
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

function getProductivityEmoji(score: number | null | undefined): string {
  if (score === null || score === undefined) return '';
  if (score >= 80) return '🔥';
  if (score >= 60) return '💪';
  if (score >= 40) return '👍';
  return '📈';
}

function calcCompletionRate(session: { tasks_created: number; tasks_completed: number }): number {
  if (session.tasks_created === 0) return 0;
  return Math.round((session.tasks_completed / session.tasks_created) * 100);
}

function calcTaskCompletionRate(stats: { totalTasksCreated: number; totalTasksCompleted: number }): number {
  if (stats.totalTasksCreated === 0) return 0;
  return Math.round((stats.totalTasksCompleted / stats.totalTasksCreated) * 100);
}

function calcPercentDiff(val1: number, val2: number): string {
  if (!val1 || !val2) return '';
  const diff = ((val2 - val1) / val1) * 100;
  if (Math.abs(diff) < 1) return '';
  return `                          ${diff > 0 ? '⬇' : '⬆'} ${Math.abs(diff).toFixed(0)}% ${diff > 0 ? 'more' : 'fewer'}`;
}
