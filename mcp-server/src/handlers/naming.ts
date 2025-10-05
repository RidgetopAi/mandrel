/**
 * AIDIS Naming Registry Handler
 * 
 * This is the CONSISTENCY ENFORCER - preventing the naming chaos that kills projects!
 * 
 * Functions:
 * - Register canonical names for entities (variables, functions, components, etc.)
 * - Detect naming conflicts and suggest alternatives
 * - Track usage patterns and enforce conventions
 * - Manage deprecation and migration of old names
 * - Suggest names based on patterns and context
 * 
 * This solves problems like:
 * - userId vs user_id vs userID inconsistencies
 * - Conflicting component names across teams
 * - Lost naming conventions when teams scale
 * - Difficulty refactoring due to inconsistent naming
 */

import { db } from '../config/database.js';
import { projectHandler } from './project.js';

export interface NamingEntry {
  id: string;
  projectId: string;
  entityType: string;
  canonicalName: string;
  aliases: string[];
  description: string | null;
  namingConvention: Record<string, any>;
  firstSeen: Date;
  lastUsed: Date;
  usageCount: number;
  deprecated: boolean;
  deprecatedReason: string | null;
  replacementId: string | null;
  contextTags: string[];
  relatedEntities: string[];
}

export interface RegisterNameRequest {
  projectId?: string;
  entityType: 'variable' | 'function' | 'class' | 'interface' | 'type' | 'component' | 
              'file' | 'directory' | 'module' | 'service' | 'endpoint' | 'database_table' | 
              'database_column' | 'config_key' | 'environment_var' | 'css_class' | 'html_id';
  canonicalName: string;
  aliases?: string[];
  description?: string;
  namingConvention?: Record<string, any>;
  contextTags?: string[];
  relatedEntities?: string[];
}

export interface CheckNameRequest {
  projectId?: string;
  entityType: string;
  proposedName: string;
  contextTags?: string[];
}

export interface NameConflict {
  type: 'exact_match' | 'similar_name' | 'alias_conflict' | 'convention_violation';
  existingEntry: NamingEntry;
  conflictReason: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
}

export interface SuggestNameRequest {
  projectId?: string;
  entityType: string;
  description: string;
  contextTags?: string[];
  preferredPattern?: string;
}

export interface NamingSuggestion {
  suggestedName: string;
  explanation: string;
  confidence: number;
  similarExamples: string[];
}

export class NamingHandler {

  /**
   * Register a new name in the naming registry
   */
  async registerName(request: RegisterNameRequest): Promise<NamingEntry> {
    console.log(`📝 Registering ${request.entityType}: "${request.canonicalName}"`);

    try {
      // Get current project if not specified
      const projectId = await this.ensureProjectId(request.projectId);

      // Check for conflicts first
      const conflicts = await this.checkNameConflicts({
        projectId,
        entityType: request.entityType,
        proposedName: request.canonicalName,
        contextTags: request.contextTags
      });

      // Handle conflicts
      const errors = conflicts.filter(c => c.severity === 'error');
      if (errors.length > 0) {
        throw new Error(`Name registration failed: ${errors.map(e => e.conflictReason).join(', ')}`);
      }

      // Log warnings but continue
      const warnings = conflicts.filter(c => c.severity === 'warning');
      if (warnings.length > 0) {
        console.log(`⚠️  Warnings: ${warnings.map(w => w.conflictReason).join(', ')}`);
      }

      // Insert into database
      const result = await db.query(`
        INSERT INTO naming_registry (
          project_id, entity_type, canonical_name, aliases, description,
          naming_convention, context_tags, related_entities
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `, [
        projectId,
        request.entityType,
        request.canonicalName,
        request.aliases || [],
        request.description || null,
        JSON.stringify(request.namingConvention || {}),
        request.contextTags || [],
        request.relatedEntities || []
      ]);

      const entry = this.mapDatabaseRowToNamingEntry(result.rows[0]);
      
      console.log(`✅ Registered name: ${entry.canonicalName} (ID: ${entry.id.substring(0, 8)}...)`);
      if (warnings.length > 0) {
        console.log(`⚠️  ${warnings.length} warnings logged`);
      }

      return entry;

    } catch (error) {
      console.error('❌ Failed to register name:', error);
      throw new Error(`Name registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check for naming conflicts with a proposed name
   */
  async checkNameConflicts(request: CheckNameRequest): Promise<NameConflict[]> {
    console.log(`🔍 Checking conflicts for ${request.entityType}: "${request.proposedName}"`);

    try {
      const projectId = await this.ensureProjectId(request.projectId);
      const conflicts: NameConflict[] = [];

      // Check for exact canonical name match
      const exactMatch = await db.query(`
        SELECT * FROM naming_registry 
        WHERE project_id = $1 AND entity_type = $2 AND canonical_name = $3
      `, [projectId, request.entityType, request.proposedName]);

      if (exactMatch.rows.length > 0) {
        conflicts.push({
          type: 'exact_match',
          existingEntry: this.mapDatabaseRowToNamingEntry(exactMatch.rows[0]),
          conflictReason: `Name "${request.proposedName}" already exists as ${request.entityType}`,
          severity: 'error',
          suggestion: this.generateAlternativeName(request.proposedName)
        });
      }

      // Check for alias conflicts
      const aliasConflict = await db.query(`
        SELECT * FROM naming_registry 
        WHERE project_id = $1 AND entity_type = $2 AND $3 = ANY(aliases)
      `, [projectId, request.entityType, request.proposedName]);

      if (aliasConflict.rows.length > 0) {
        conflicts.push({
          type: 'alias_conflict',
          existingEntry: this.mapDatabaseRowToNamingEntry(aliasConflict.rows[0]),
          conflictReason: `Name "${request.proposedName}" conflicts with existing alias`,
          severity: 'error',
          suggestion: this.generateAlternativeName(request.proposedName)
        });
      }

      // Check for similar names (Levenshtein distance or fuzzy matching)
      const similarNames = await db.query(`
        SELECT *, 
               similarity(canonical_name, $3) as sim_score
        FROM naming_registry 
        WHERE project_id = $1 AND entity_type = $2 
          AND similarity(canonical_name, $3) > 0.6
          AND canonical_name != $3
        ORDER BY sim_score DESC
        LIMIT 3
      `, [projectId, request.entityType, request.proposedName]);

      for (const row of similarNames.rows) {
        conflicts.push({
          type: 'similar_name',
          existingEntry: this.mapDatabaseRowToNamingEntry(row),
          conflictReason: `Similar name exists: "${row.canonical_name}" (${Math.round(row.sim_score * 100)}% similar)`,
          severity: 'warning',
          suggestion: `Consider using "${row.canonical_name}" or make the difference more clear`
        });
      }

      // Check naming convention violations
      const conventionViolations = await this.checkNamingConventions(
        projectId, 
        request.entityType, 
        request.proposedName
      );
      conflicts.push(...conventionViolations);

      console.log(`✅ Conflict check complete: ${conflicts.length} issues found`);
      return conflicts;

    } catch (error) {
      console.error('❌ Failed to check conflicts:', error);
      throw new Error(`Conflict check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Suggest names based on description and context
   */
  async suggestNames(request: SuggestNameRequest): Promise<NamingSuggestion[]> {
    console.log(`💡 Suggesting names for ${request.entityType}: "${request.description}"`);

    try {
      const projectId = await this.ensureProjectId(request.projectId);
      const suggestions: string[] = [];

      // Get existing patterns for this entity type
      const patterns = await db.query(`
        SELECT canonical_name, naming_convention, context_tags
        FROM naming_registry
        WHERE project_id = $1 AND entity_type = $2
        ORDER BY usage_count DESC, last_used DESC
        LIMIT 10
      `, [projectId, request.entityType]);

      // Analyze common patterns
      const commonPrefixes = new Map<string, number>();
      const commonSuffixes = new Map<string, number>();
      const commonPatterns = new Map<string, number>();

      patterns.rows.forEach(row => {
        const _name = row.canonical_name;
        const convention = typeof row.naming_convention === 'string' 
          ? JSON.parse(row.naming_convention) 
          : row.naming_convention;

        // Track patterns
        if (convention.pattern) {
          commonPatterns.set(convention.pattern, (commonPatterns.get(convention.pattern) || 0) + 1);
        }
        if (convention.prefix) {
          commonPrefixes.set(convention.prefix, (commonPrefixes.get(convention.prefix) || 0) + 1);
        }
        if (convention.suffix) {
          commonSuffixes.set(convention.suffix, (commonSuffixes.get(convention.suffix) || 0) + 1);
        }
      });

      // Generate suggestions based on description
      const expectedPattern = this.getExpectedPattern(request.entityType);
      const baseWords = this.extractKeywords(request.description, expectedPattern);

      for (const word of baseWords) {
        const baseSuggestion = this.applyNamingPattern(word, expectedPattern);
        
        // Add base suggestion
        suggestions.push(baseSuggestion);

        // Only add prefix/suffix variations for meaningful, non-generic patterns
        const commonPrefix = this.getMostCommon(commonPrefixes);
        const commonSuffix = this.getMostCommon(commonSuffixes);

        // Filter out generic prefixes like "generate"
        if (commonPrefix && 
            request.entityType !== 'variable' && 
            !this.isGenericPrefix(commonPrefix)) {
          suggestions.push(this.applyNamingPattern(`${commonPrefix}${this.capitalize(word)}`, expectedPattern));
        }
        
        if (commonSuffix && 
            request.entityType !== 'variable' && 
            !this.isGenericSuffix(commonSuffix)) {
          suggestions.push(this.applyNamingPattern(`${word}${this.capitalize(commonSuffix)}`, expectedPattern));
        }

        // Context-specific suggestions (only if meaningful)
        if (request.contextTags) {
          for (const tag of request.contextTags) {
            if (tag !== word.toLowerCase() && tag.length > 2) {
              suggestions.push(this.applyNamingPattern(`${word}${this.capitalize(tag)}`, expectedPattern));
            }
          }
        }
      }

      // Remove duplicates and check availability
      const uniqueSuggestions = Array.from(new Set(suggestions)).slice(0, 8);
      const availableSuggestions: NamingSuggestion[] = [];

      for (const suggestion of uniqueSuggestions) {
        const conflicts = await this.checkNameConflicts({
          projectId,
          entityType: request.entityType,
          proposedName: suggestion
        });
        
        if (conflicts.filter(c => c.severity === 'error').length === 0) {
          // Find similar examples from patterns
          const similarExamples = patterns.rows
            .map(row => row.canonical_name)
            .filter(name => name !== suggestion)
            .slice(0, 3);

          // Calculate confidence based on pattern match and conflicts
          const warningCount = conflicts.filter(c => c.severity === 'warning').length;
          const confidence = Math.max(0.3, Math.min(0.95, 
            (similarExamples.length > 0 ? 0.8 : 0.6) - (warningCount * 0.1)
          ));

          // Generate explanation
          const explanation = this.generateExplanation(suggestion, request.entityType, similarExamples, expectedPattern);

          availableSuggestions.push({
            suggestedName: suggestion,
            explanation,
            confidence,
            similarExamples
          });
        }
      }

      console.log(`✅ Generated ${availableSuggestions.length} available name suggestions`);
      return availableSuggestions;

    } catch (error) {
      console.error('❌ Failed to suggest names:', error);
      throw new Error(`Name suggestion failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update usage tracking for a name
   */
  async recordUsage(projectId: string | undefined, entityType: string, name: string): Promise<void> {
    try {
      const actualProjectId = await this.ensureProjectId(projectId);
      
      await db.query(`
        UPDATE naming_registry 
        SET usage_count = usage_count + 1, last_used = CURRENT_TIMESTAMP
        WHERE project_id = $1 AND entity_type = $2 AND (canonical_name = $3 OR $3 = ANY(aliases))
      `, [actualProjectId, entityType, name]);

      console.log(`📊 Usage recorded for ${entityType}: ${name}`);
    } catch (error) {
      console.warn('⚠️  Failed to record usage:', error);
      // Don't fail the main operation for usage tracking
    }
  }

  /**
   * Get naming statistics for a project
   */
  async getNamingStats(projectId?: string): Promise<{
    totalNames: number;
    namesByType: Record<string, number>;
    deprecatedCount: number;
    conventionCompliance: number;
    recentActivity: number;
  }> {
    const actualProjectId = await this.ensureProjectId(projectId);

    const [total, byType, deprecated, recent] = await Promise.all([
      // Total names
      db.query('SELECT COUNT(*) as count FROM naming_registry WHERE project_id = $1', [actualProjectId]),
      
      // Names by type
      db.query(`
        SELECT entity_type, COUNT(*) as count 
        FROM naming_registry 
        WHERE project_id = $1 
        GROUP BY entity_type
        ORDER BY count DESC
      `, [actualProjectId]),
      
      // Deprecated count
      db.query(`
        SELECT COUNT(*) as count 
        FROM naming_registry 
        WHERE project_id = $1 AND deprecated = true
      `, [actualProjectId]),
      
      // Recent activity (last 7 days)
      db.query(`
        SELECT COUNT(*) as count 
        FROM naming_registry 
        WHERE project_id = $1 AND last_used > NOW() - INTERVAL '7 days'
      `, [actualProjectId])
    ]);

    const namesByType: Record<string, number> = {};
    byType.rows.forEach(row => {
      namesByType[row.entity_type] = parseInt(row.count);
    });

    // Calculate convention compliance (simplified)
    const conventionCompliance = Math.min(100, Math.max(0, 
      100 - (parseInt(deprecated.rows[0].count) * 10)
    ));

    return {
      totalNames: parseInt(total.rows[0].count),
      namesByType,
      deprecatedCount: parseInt(deprecated.rows[0].count),
      conventionCompliance,
      recentActivity: parseInt(recent.rows[0].count)
    };
  }

  /**
   * Private helper methods
   */

  private async ensureProjectId(projectId?: string): Promise<string> {
    if (projectId) {
      return projectId;
    }

    await projectHandler.initializeSession();
    const currentProject = await projectHandler.getCurrentProject();
    
    if (currentProject) {
      return currentProject.id;
    }

    throw new Error('No current project set. Use project_switch to set an active project or specify a project ID.');
  }

  private mapDatabaseRowToNamingEntry(row: any): NamingEntry {
    return {
      id: row.id,
      projectId: row.project_id,
      entityType: row.entity_type,
      canonicalName: row.canonical_name,
      aliases: row.aliases || [],
      description: row.description,
      namingConvention: typeof row.naming_convention === 'string' 
        ? JSON.parse(row.naming_convention) 
        : row.naming_convention,
      firstSeen: row.first_seen,
      lastUsed: row.last_used,
      usageCount: row.usage_count,
      deprecated: row.deprecated,
      deprecatedReason: row.deprecated_reason,
      replacementId: row.replacement_id,
      contextTags: row.context_tags || [],
      relatedEntities: row.related_entities || []
    };
  }

  private generateAlternativeName(originalName: string): string {
    // Simple alternative generation - in production could be more sophisticated
    const variations = [
      `${originalName}Alt`,
      `${originalName}V2`,
      `new${originalName.charAt(0).toUpperCase() + originalName.slice(1)}`,
      `${originalName}2`
    ];
    
    return variations[Math.floor(Math.random() * variations.length)];
  }

  private async checkNamingConventions(
    _projectId: string, 
    entityType: string, 
    name: string
  ): Promise<NameConflict[]> {
    const conflicts: NameConflict[] = [];

    // Basic convention checks
    const conventions = {
      'variable': /^[a-z][a-zA-Z0-9]*$/, // camelCase
      'function': /^[a-z][a-zA-Z0-9]*$/, // camelCase
      'class': /^[A-Z][a-zA-Z0-9]*$/, // PascalCase
      'interface': /^[A-Z][a-zA-Z0-9]*$/, // PascalCase
      'component': /^[A-Z][a-zA-Z0-9]*$/, // PascalCase
      'config_key': /^[A-Z][A-Z0-9_]*$/, // SCREAMING_SNAKE_CASE
      'environment_var': /^[A-Z][A-Z0-9_]*$/ // SCREAMING_SNAKE_CASE
    };

    const expectedPattern = conventions[entityType as keyof typeof conventions];
    if (expectedPattern && !expectedPattern.test(name)) {
      conflicts.push({
        type: 'convention_violation',
        existingEntry: {} as NamingEntry, // No existing entry for convention violations
        conflictReason: `Name "${name}" violates ${entityType} naming convention`,
        severity: 'warning',
        suggestion: this.applyNamingPattern(name, this.getExpectedPattern(entityType))
      });
    }

    return conflicts;
  }

  private extractKeywords(description: string, pattern: string = 'camelCase'): string[] {
    // Enhanced semantic name generation from description
    const words = description
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !this.isStopWord(word));
    
    // Generate meaningful compound names from the description
    const suggestions: string[] = [];
    
    if (words.length >= 2) {
      // Create properly formatted compound names based on pattern
      const twoWords = this.formatWords(words.slice(0, 2), pattern);
      suggestions.push(twoWords);
      
      if (words.length >= 3) {
        const threeWords = this.formatWords(words.slice(0, 3), pattern);
        suggestions.push(threeWords);
        
        // Combine first and third word
        const firstThirdCombo = this.formatWords([words[0], words[2]], pattern);
        suggestions.push(firstThirdCombo);
      }
      
      // Add semantic variations
      const mainVerb = words[0];
      const mainNoun = words[1];
      
      // Create alternative verb + noun combinations
      if (mainVerb === 'authenticate') {
        suggestions.push(this.formatWords(['verify', mainNoun], pattern));
        suggestions.push(this.formatWords(['validate', mainNoun], pattern));
        if (mainNoun === 'user') {
          suggestions.push(this.formatWords(['login', 'user'], pattern));
          suggestions.push(this.formatWords(['check', 'credentials'], pattern));
        }
      }
      
    } else if (words.length === 1) {
      const word = words[0];
      suggestions.push(this.applyNamingPattern(word, pattern));
    }
    
    // Remove duplicates and return reasonable number of suggestions
    return Array.from(new Set(suggestions)).slice(0, 6);
  }

  /**
   * Convert array of words to proper camelCase
   */
  private toCamelCase(words: string[]): string {
    if (words.length === 0) return '';
    if (words.length === 1) return words[0];
    
    return words[0] + words.slice(1)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  /**
   * Format words according to the specified pattern
   */
  private formatWords(words: string[], pattern: string): string {
    if (words.length === 0) return '';
    
    switch (pattern) {
      case 'PascalCase':
        return words.map(word => this.capitalize(word)).join('');
      case 'camelCase':
        return this.toCamelCase(words);
      case 'snake_case':
        return words.join('_').toLowerCase();
      case 'SCREAMING_SNAKE_CASE':
        return words.join('_').toUpperCase();
      default:
        return this.toCamelCase(words);
    }
  }

  /**
   * Check if a prefix is too generic to be useful
   */
  private isGenericPrefix(prefix: string): boolean {
    const genericPrefixes = ['generate', 'create', 'make', 'do', 'get', 'set', 'handle', 'process'];
    return genericPrefixes.includes(prefix.toLowerCase());
  }

  /**
   * Check if a suffix is too generic to be useful
   */
  private isGenericSuffix(suffix: string): boolean {
    const genericSuffixes = ['thing', 'item', 'object', 'data', 'info'];
    return genericSuffixes.includes(suffix.toLowerCase());
  }

  /**
   * Capitalize first letter of a word
   */
  private capitalize(word: string): string {
    if (!word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  private isStopWord(word: string): boolean {
    const stopWords = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'its', 'may', 'new', 'now', 'old', 'see', 'two', 'who', 'boy', 'did', 'she', 'use', 'her', 'now', 'air', 'any', 'may', 'say'];
    return stopWords.includes(word);
  }

  private applyNamingPattern(word: string, pattern: string): string {
    switch (pattern) {
      case 'camelCase':
        return word.charAt(0).toLowerCase() + word.slice(1).replace(/\W+(.)/g, (_match, chr) => chr.toUpperCase());
      case 'PascalCase':
        return word.charAt(0).toUpperCase() + word.slice(1).replace(/\W+(.)/g, (_match, chr) => chr.toUpperCase());
      case 'snake_case':
        return word.toLowerCase().replace(/\W+/g, '_');
      case 'SCREAMING_SNAKE_CASE':
        return word.toUpperCase().replace(/\W+/g, '_');
      default:
        return word;
    }
  }

  private getExpectedPattern(entityType: string): string {
    const patterns: Record<string, string> = {
      'variable': 'camelCase',
      'function': 'camelCase', 
      'class': 'PascalCase',
      'interface': 'PascalCase',
      'component': 'PascalCase',
      'config_key': 'SCREAMING_SNAKE_CASE',
      'environment_var': 'SCREAMING_SNAKE_CASE'
    };
    
    return patterns[entityType] || 'camelCase';
  }

  private generateExplanation(_suggestion: string, entityType: string, similarExamples: string[], expectedPattern: string): string {
    const explanations: string[] = [];
    
    // Pattern-based explanation
    explanations.push(`Follows ${expectedPattern} pattern for ${entityType} naming`);
    
    // Similar examples context
    if (similarExamples.length > 0) {
      explanations.push(`Consistent with existing names like: ${similarExamples.join(', ')}`);
    }
    
    // Entity type specific guidance
    if (entityType === 'function') {
      explanations.push('Uses descriptive verb naming convention');
    } else if (entityType === 'variable') {
      explanations.push('Clear and concise variable naming');
    } else if (entityType === 'class') {
      explanations.push('Noun-based class naming convention');
    }
    
    return explanations.join('. ');
  }

  private getMostCommon<T>(map: Map<T, number>): T | undefined {
    let maxCount = 0;
    let mostCommon: T | undefined;
    
    map.forEach((count, item) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = item;
      }
    });
    
    return mostCommon;
  }
}

// Export singleton instance
export const namingHandler = new NamingHandler();
