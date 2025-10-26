import { TechnicalDecision, DecisionSearchParams, DecisionStats, DecisionSearchResult } from '../components/decisions/types';
import decisionsClient from '../api/decisionsClient';
import type { CreateDecisionRequest, UpdateDecisionRequest } from '../api/generated';

export class DecisionApi {
  /**
   * Record a new technical decision
  */
  static async recordDecision(decision: {
    title: string;
    problem: string;
    decision: string;
    rationale?: string;
    alternatives?: string[];
  }): Promise<void> {
    const payload: CreateDecisionRequest = {
      title: decision.title,
      problem: decision.problem,
      decision: decision.decision,
      rationale: decision.rationale,
      alternatives: decision.alternatives,
    };

    await decisionsClient.createDecision(payload);
  }

  /**
   * Search decisions with filters and pagination
   */
  static async searchDecisions(params: DecisionSearchParams): Promise<DecisionSearchResult> {
    return decisionsClient.search(params);
  }

  /**
   * Get single decision by ID
   */
  static async getDecision(id: string): Promise<TechnicalDecision> {
    return decisionsClient.getDecision(id);
  }

  /**
   * Update decision
   */
  static async updateDecision(
    id: string,
    updates: UpdateDecisionRequest
  ): Promise<void> {
    await decisionsClient.updateDecision(id, updates);
    // Don't refetch - the GET /api/decisions/:id endpoint doesn't work properly
    // The caller will construct the updated decision locally
  }

  /**
   * Delete single decision
   */
  static async deleteDecision(id: string): Promise<void> {
    await decisionsClient.deleteDecision(id);
  }

  /**
   * Get decision statistics
   */
  static async getDecisionStats(project_id?: string): Promise<DecisionStats> {
    return decisionsClient.getDecisionStats(project_id);
  }

  /**
   * Format date for API
   */
  static formatDate(date: Date): string {
    return date.toISOString();
  }

  /**
   * Parse date from API
   */
  static parseDate(dateString: string): Date {
    return new Date(dateString);
  }

  /**
   * Get decision status display name
   */
  static getStatusDisplayName(status: string): string {
    const statusMap: Record<string, string> = {
      active: 'Active',
      under_review: 'Under Review',
      superseded: 'Superseded',
      deprecated: 'Deprecated'
    };
    return statusMap[status] || status;
  }

  /**
   * Get decision status color
   */
  static getStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      active: '#52c41a',
      under_review: '#1890ff',
      superseded: '#fa8c16',
      deprecated: '#8c8c8c'
    };
    return colorMap[status] || '#8c8c8c';
  }

  /**
   * Truncate content for preview
   */
  static truncateContent(content: string, maxLength = 150): string {
    if (content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength).trim() + '...';
  }

  /**
   * Highlight search terms in text
   */
  static highlightSearchTerms(text: string, searchTerm?: string): string {
    if (!searchTerm || !searchTerm.trim()) {
      return text;
    }

    const terms = searchTerm.trim().split(/\s+/);
    let highlightedText = text;

    terms.forEach(term => {
      const regex = new RegExp(`(${term})`, 'gi');
      highlightedText = highlightedText.replace(
        regex,
        '<mark style="background-color: #fff3cd; padding: 2px;">$1</mark>'
      );
    });

    return highlightedText;
  }

  /**
   * Get decision priority level based on status and age
   */
  static getDecisionPriority(decision: TechnicalDecision): 'high' | 'medium' | 'low' {
    const daysSinceCreated = Math.floor(
      (Date.now() - new Date(decision.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (decision.status === 'under_review' && daysSinceCreated > 30) {
      return 'high';
    }
    if (decision.status === 'active' && !decision.outcomeNotes) {
      return 'medium';
    }
    return 'low';
  }

  /**
   * Format alternatives for display
   */
  static formatAlternatives(alternatives?: string[]): string {
    if (!alternatives || alternatives.length === 0) {
      return 'No alternatives documented';
    }
    return alternatives.map((alt, index) => `${index + 1}. ${alt}`).join('\n');
  }
}

export default DecisionApi;
