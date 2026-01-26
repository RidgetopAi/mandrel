/**
 * Surveyor Summary Generator
 * Generates tiered AI-readable summaries for codebase scans
 * Part of MandrelV2 Surveyor Integration - Phase 2
 */

import type { StoredScan } from './surveyorService.js';
// Note: logger can be added for debugging if needed

// Summary tier definitions
export interface SummaryTiers {
  l0: string; // ~50 tokens - Quick glance
  l1: string; // ~500 tokens - Per-folder breakdown
  l2: string; // ~2000 tokens - Full file inventory
}

/**
 * Generate tiered summaries for a scan result
 */
export class SurveyorSummaryGenerator {
  /**
   * Generate all summary tiers for a scan
   */
  generateSummaries(scan: StoredScan): SummaryTiers {
    return {
      l0: this.generateL0Summary(scan),
      l1: this.generateL1Summary(scan),
      l2: this.generateL2Summary(scan),
    };
  }

  /**
   * L0 Summary: Quick glance (~50 tokens)
   * Format: "Health: X/100. Y files, Z warnings. Top issue: [category]"
   */
  private generateL0Summary(scan: StoredScan): string {
    const healthScore = scan.health_score ?? 'N/A';
    const topWarningCategory = this.getTopWarningCategory(scan.warnings_by_level);

    const parts = [
      `Health: ${healthScore}/100`,
      `${scan.total_files} files`,
      `${scan.total_functions} functions`,
      `${scan.total_warnings} warnings`,
    ];

    if (topWarningCategory) {
      parts.push(`Top: ${topWarningCategory}`);
    }

    return parts.join('. ') + '.';
  }

  /**
   * L1 Summary: Per-folder breakdown (~500 tokens)
   * Includes warning counts by category and folder distribution
   */
  private generateL1Summary(scan: StoredScan): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Codebase Scan Summary: ${scan.project_name}`);
    lines.push(`Health Score: ${scan.health_score ?? 'N/A'}/100`);
    lines.push('');

    // Statistics
    lines.push('## Statistics');
    lines.push(`- Files: ${scan.total_files}`);
    lines.push(`- Functions: ${scan.total_functions}`);
    lines.push(`- Classes: ${scan.total_classes}`);
    lines.push(`- Connections: ${scan.total_connections}`);
    lines.push('');

    // Warnings by level
    lines.push('## Warnings');
    const wbl = scan.warnings_by_level || {};
    lines.push(`- Errors: ${wbl.error || 0}`);
    lines.push(`- Warnings: ${wbl.warning || 0}`);
    lines.push(`- Info: ${wbl.info || 0}`);
    lines.push('');

    // Folder distribution (from nodes)
    if (scan.nodes && typeof scan.nodes === 'object') {
      const folderStats = this.getFolderDistribution(scan.nodes);
      if (folderStats.length > 0) {
        lines.push('## Top Folders');
        folderStats.slice(0, 10).forEach(([folder, count]) => {
          lines.push(`- ${folder}: ${count} files`);
        });
      }
    }

    return lines.join('\n');
  }

  /**
   * L2 Summary: Full file inventory (~2000 tokens)
   * Complete file list with functions and classes
   */
  private generateL2Summary(scan: StoredScan): string {
    const lines: string[] = [];

    // Header
    lines.push(`# Full Codebase Inventory: ${scan.project_name}`);
    lines.push(`Scanned: ${scan.completed_at || scan.created_at}`);
    lines.push(`Status: ${scan.status}`);
    lines.push('');

    // Complete statistics
    lines.push('## Complete Statistics');
    lines.push(`- Total Files: ${scan.total_files}`);
    lines.push(`- Total Functions: ${scan.total_functions}`);
    lines.push(`- Total Classes: ${scan.total_classes}`);
    lines.push(`- Total Connections: ${scan.total_connections}`);
    lines.push(`- Analyzed: ${scan.analyzed_count}`);
    lines.push(`- Pending Analysis: ${scan.pending_analysis}`);
    lines.push(`- Health Score: ${scan.health_score ?? 'N/A'}/100`);
    lines.push('');

    // Node type distribution
    if (scan.nodes_by_type) {
      lines.push('## Node Distribution');
      Object.entries(scan.nodes_by_type).forEach(([type, count]) => {
        lines.push(`- ${type}: ${count}`);
      });
      lines.push('');
    }

    // File inventory by folder
    if (scan.nodes && typeof scan.nodes === 'object') {
      const filesByFolder = this.groupFilesByFolder(scan.nodes);

      lines.push('## File Inventory');
      Object.entries(filesByFolder)
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(0, 50) // Limit to top 50 folders
        .forEach(([folder, files]) => {
          lines.push(`\n### ${folder || '(root)'}`);
          files.slice(0, 20).forEach((file) => { // Limit files per folder
            lines.push(`- ${file.name}`);
            if (file.functions.length > 0) {
              lines.push(`  Functions: ${file.functions.slice(0, 5).join(', ')}${file.functions.length > 5 ? '...' : ''}`);
            }
            if (file.classes.length > 0) {
              lines.push(`  Classes: ${file.classes.join(', ')}`);
            }
          });
          if (files.length > 20) {
            lines.push(`  ... and ${files.length - 20} more files`);
          }
        });
    }

    // Truncate if too long
    const result = lines.join('\n');
    if (result.length > 8000) { // Approximate 2000 tokens
      return result.substring(0, 7900) + '\n\n... (truncated)';
    }

    return result;
  }

  /**
   * Get the category with most warnings
   */
  private getTopWarningCategory(warningsByLevel: Record<string, number>): string | null {
    if (!warningsByLevel) return null;

    const entries = Object.entries(warningsByLevel)
      .filter(([_, count]) => count > 0)
      .sort(([, a], [, b]) => b - a);

    if (entries.length === 0) return null;

    // Return the level with most issues
    const [level, count] = entries[0];
    return `${count} ${level}${count > 1 ? 's' : ''}`;
  }

  /**
   * Get folder distribution from nodes
   */
  private getFolderDistribution(nodes: Record<string, any>): [string, number][] {
    const folderCounts: Record<string, number> = {};

    Object.values(nodes).forEach((node: any) => {
      if (node.type === 'file' && node.filePath) {
        const folder = this.getFolder(node.filePath);
        folderCounts[folder] = (folderCounts[folder] || 0) + 1;
      }
    });

    return Object.entries(folderCounts)
      .sort(([, a], [, b]) => b - a);
  }

  /**
   * Group files by folder
   */
  private groupFilesByFolder(nodes: Record<string, any>): Record<string, any[]> {
    const grouped: Record<string, any[]> = {};

    Object.values(nodes).forEach((node: any) => {
      if (node.type === 'file' && node.filePath) {
        const folder = this.getFolder(node.filePath);
        if (!grouped[folder]) grouped[folder] = [];
        grouped[folder].push({
          name: node.name,
          functions: node.functions || [],
          classes: node.classes || [],
        });
      }
    });

    return grouped;
  }

  /**
   * Extract folder from file path
   */
  private getFolder(filePath: string): string {
    const parts = filePath.split('/');
    parts.pop(); // Remove filename
    return parts.join('/') || '(root)';
  }
}

// Export singleton
export const summaryGenerator = new SurveyorSummaryGenerator();
