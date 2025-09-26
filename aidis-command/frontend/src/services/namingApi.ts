import { NamingEntry, NamingSearchParams, NamingStats, NamingSearchResult, NamingSuggestion, NamingRegistrationData } from '../components/naming/types';
import namingClient from '../api/namingClient';
import type { UpdateNamingRequest } from '../api/generated';

export class NamingApi {
  /**
   * Search naming entries with filters and pagination
   */
  static async searchEntries(params: NamingSearchParams): Promise<NamingSearchResult> {
    return namingClient.search(params);
  }

  /**
   * Get single naming entry by ID
   */
  static async getEntry(id: number): Promise<NamingEntry> {
    return namingClient.getEntry(String(id));
  }

  /**
   * Register a new name
   */
  static async registerName(data: NamingRegistrationData): Promise<NamingEntry> {
    return namingClient.registerEntry({
      name: data.name,
      type: data.type as any,
      context: data.context,
    });
  }

  /**
   * Check name availability
   */
  static async checkNameAvailability(name: string): Promise<{ available: boolean; conflicts?: NamingEntry[]; message?: string }> {
    return namingClient.checkName(name);
  }

  /**
   * Get naming suggestions
   */
  static async getSuggestions(baseName: string, type?: string): Promise<NamingSuggestion[]> {
    return namingClient.getSuggestions(baseName, type);
  }

  /**
   * Update naming entry
   */
  static async updateEntry(
    id: number, 
    updates: {
      status?: string;
      context?: string;
    }
  ): Promise<NamingEntry> {
    await namingClient.updateEntry(String(id), {
      status: updates.status as any,
      context: updates.context,
    });

    return namingClient.getEntry(String(id));
  }

  /**
   * Delete naming entry
   */
  static async deleteEntry(id: number): Promise<void> {
    await namingClient.deleteEntry(String(id));
  }

  /**
   * Get naming statistics
   */
  static async getNamingStats(project_id?: string): Promise<NamingStats> {
    return namingClient.getStats(project_id);
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
   * Get entry type display name
   */
  static getTypeDisplayName(type: string): string {
    const typeMap: Record<string, string> = {
      variable: 'Variable',
      function: 'Function',
      component: 'Component',
      class: 'Class',
      interface: 'Interface',
      module: 'Module',
      file: 'File'
    };
    return typeMap[type] || type;
  }

  /**
   * Get entry type color
   */
  static getTypeColor(type: string): string {
    const colorMap: Record<string, string> = {
      variable: '#52c41a',
      function: '#1890ff',
      component: '#722ed1',
      class: '#fa8c16',
      interface: '#13c2c2',
      module: '#eb2f96',
      file: '#8c8c8c'
    };
    return colorMap[type] || '#8c8c8c';
  }

  /**
   * Get entry status display name
   */
  static getStatusDisplayName(status: string): string {
    const statusMap: Record<string, string> = {
      active: 'Active',
      deprecated: 'Deprecated',
      conflicted: 'Conflicted',
      pending: 'Pending'
    };
    return statusMap[status] || status;
  }

  /**
   * Get entry status color
   */
  static getStatusColor(status: string): string {
    const colorMap: Record<string, string> = {
      active: '#52c41a',
      deprecated: '#8c8c8c',
      conflicted: '#ff4d4f',
      pending: '#fa8c16'
    };
    return colorMap[status] || '#8c8c8c';
  }

  /**
   * Get compliance score color
   */
  static getComplianceColor(score: number): string {
    if (score >= 90) return '#52c41a';
    if (score >= 70) return '#fa8c16';
    return '#ff4d4f';
  }

  /**
   * Get priority level based on usage and compliance
   */
  static getEntryPriority(entry: NamingEntry): 'high' | 'medium' | 'low' {
    if (entry.status === 'conflicted') {
      return 'high';
    }
    if (entry.compliance_score < 70) {
      return 'medium';
    }
    return 'low';
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
   * Format context for display
   */
  static formatContext(context?: string): string {
    if (!context || context.trim().length === 0) {
      return 'No context provided';
    }
    return context;
  }

  /**
   * Get usage display text
   */
  static getUsageDisplay(usageCount: number): string {
    if (usageCount === 0) return 'No usage';
    if (usageCount === 1) return '1 usage';
    return `${usageCount} usages`;
  }
}

export default NamingApi;
