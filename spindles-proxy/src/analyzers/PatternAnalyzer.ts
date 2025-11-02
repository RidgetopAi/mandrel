/**
 * PatternAnalyzer v1 - Deterministic Regex-Based Pattern Detection
 * Detects 8 reasoning pattern types in thinking blocks
 * Phase 2.1 - Foundation
 * Tasks: TS-015 through TS-022
 *
 * Pattern Types:
 * 1. enumerated_list - Numbered lists (1. 2. 3.)
 * 2. bullet_list - Bullet points (-, *, •)
 * 3. conditional - If/when/unless constructs
 * 4. sequential - First/then/next sequences
 * 5. question_driven - Questions and exploration
 * 6. conclusion - Therefore/thus/so conclusions
 * 7. alternative - Alternatively/instead options
 * 8. evidence - Evidence-based reasoning
 *
 * Design Principles (Oracle v1):
 * - Deterministic regex only (confidence = 1.0)
 * - Frozen algorithm (patterns-v1)
 * - Position tracking for matched text
 * - No fuzzy/NLP features (deferred to v2)
 */

import { pool } from '../db/client.js';

const ANALYZER_VERSION = 'patterns-v1';

// Frozen pattern definitions for v1 (Oracle requirement)
const PATTERN_DEFINITIONS_V1 = {
  enumerated_list: /^\s*\d+[\.)]\s+/gm,
  bullet_list: /^\s*[-*•]\s+/gm,
  conditional: /\b(if|when|unless)\b.*\b(then|otherwise)\b/gi,
  sequential: /\b(first|second|third|then|next|finally)\b/gi,
  question_driven: /\?/g,
  conclusion: /\b(therefore|thus|so|hence|consequently)\b/gi,
  alternative: /\b(alternatively|instead|or|another option)\b/gi,
  evidence: /\b(based on|research shows|data indicates|according to|evidence suggests)\b/gi,
} as const;

export type PatternType = keyof typeof PATTERN_DEFINITIONS_V1;

export interface DetectedPattern {
  patternType: PatternType;
  startPos: number;
  endPos: number;
  matchedText: string;
  confidence: number; // Always 1.0 for regex patterns
  metadata?: Record<string, any>;
}

export interface PatternAnalysisResult {
  spindleId: string;
  patterns: DetectedPattern[];
  analyzerVersion: string;
  analyzedAt: string;
}

export class PatternAnalyzer {
  /**
   * Analyze a spindle for all 8 pattern types
   */
  async analyze(spindleId: string, content: string): Promise<PatternAnalysisResult> {
    const patterns: DetectedPattern[] = [];

    // Detect all 8 pattern types
    patterns.push(...this.detectEnumeratedLists(content));
    patterns.push(...this.detectBulletLists(content));
    patterns.push(...this.detectConditionals(content));
    patterns.push(...this.detectSequential(content));
    patterns.push(...this.detectQuestions(content));
    patterns.push(...this.detectConclusions(content));
    patterns.push(...this.detectAlternatives(content));
    patterns.push(...this.detectEvidence(content));

    return {
      spindleId,
      patterns,
      analyzerVersion: ANALYZER_VERSION,
      analyzedAt: new Date().toISOString(),
    };
  }

  /**
   * Pattern 1: Enumerated Lists
   * Detects: "1. First", "2) Second", etc.
   */
  private detectEnumeratedLists(content: string): DetectedPattern[] {
    return this.matchPattern(content, 'enumerated_list', PATTERN_DEFINITIONS_V1.enumerated_list);
  }

  /**
   * Pattern 2: Bullet Lists
   * Detects: "- Item", "* Item", "• Item"
   */
  private detectBulletLists(content: string): DetectedPattern[] {
    return this.matchPattern(content, 'bullet_list', PATTERN_DEFINITIONS_V1.bullet_list);
  }

  /**
   * Pattern 3: Conditionals
   * Detects: "if X then Y", "when X, Y", "unless X, otherwise Y"
   */
  private detectConditionals(content: string): DetectedPattern[] {
    return this.matchPattern(content, 'conditional', PATTERN_DEFINITIONS_V1.conditional);
  }

  /**
   * Pattern 4: Sequential Reasoning
   * Detects: "first", "then", "next", "finally"
   */
  private detectSequential(content: string): DetectedPattern[] {
    return this.matchPattern(content, 'sequential', PATTERN_DEFINITIONS_V1.sequential);
  }

  /**
   * Pattern 5: Question-Driven Reasoning
   * Detects: Questions ending with "?"
   */
  private detectQuestions(content: string): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];
    const regex = PATTERN_DEFINITIONS_V1.question_driven;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      // Extract surrounding context (sentence containing the ?)
      const start = Math.max(0, content.lastIndexOf('\n', match.index));
      const end = Math.min(content.length, content.indexOf('\n', match.index + 1));
      const sentence = content.substring(start, end === -1 ? content.length : end).trim();

      patterns.push({
        patternType: 'question_driven',
        startPos: start + 1,
        endPos: end === -1 ? content.length : end + 1,
        matchedText: sentence,
        confidence: 1.0,
        metadata: { questionMark: match[0] },
      });
    }

    return patterns;
  }

  /**
   * Pattern 6: Conclusions
   * Detects: "therefore", "thus", "so", "hence", "consequently"
   */
  private detectConclusions(content: string): DetectedPattern[] {
    return this.matchPattern(content, 'conclusion', PATTERN_DEFINITIONS_V1.conclusion);
  }

  /**
   * Pattern 7: Alternatives
   * Detects: "alternatively", "instead", "or", "another option"
   */
  private detectAlternatives(content: string): DetectedPattern[] {
    return this.matchPattern(content, 'alternative', PATTERN_DEFINITIONS_V1.alternative);
  }

  /**
   * Pattern 8: Evidence-Based Reasoning
   * Detects: "based on", "research shows", "data indicates", etc.
   */
  private detectEvidence(content: string): DetectedPattern[] {
    return this.matchPattern(content, 'evidence', PATTERN_DEFINITIONS_V1.evidence);
  }

  /**
   * Generic pattern matcher
   */
  private matchPattern(
    content: string,
    patternType: PatternType,
    regex: RegExp
  ): DetectedPattern[] {
    const patterns: DetectedPattern[] = [];

    // Reset regex state
    regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = regex.exec(content)) !== null) {
      patterns.push({
        patternType,
        startPos: match.index + 1, // 1-indexed per schema
        endPos: match.index + match[0].length,
        matchedText: match[0],
        confidence: 1.0, // Regex patterns = 100% confidence
      });
    }

    return patterns;
  }

  /**
   * Save analysis results to database
   */
  async saveResults(result: PatternAnalysisResult): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Delete existing patterns for this spindle (if reprocessing)
      await client.query(
        'DELETE FROM reasoning_patterns WHERE spindle_id = $1 AND analyzer_version = $2',
        [result.spindleId, result.analyzerVersion]
      );

      // Insert new patterns
      for (const pattern of result.patterns) {
        await client.query(
          `INSERT INTO reasoning_patterns (
            spindle_id,
            pattern_type,
            start_pos,
            end_pos,
            matched_text,
            confidence,
            metadata,
            analyzer_version
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (spindle_id, pattern_type, start_pos) DO NOTHING`,
          [
            result.spindleId,
            pattern.patternType,
            pattern.startPos,
            pattern.endPos,
            pattern.matchedText,
            pattern.confidence,
            JSON.stringify(pattern.metadata || {}),
            result.analyzerVersion,
          ]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Analyze and save in one operation
   */
  async analyzeAndSave(spindleId: string, content: string): Promise<PatternAnalysisResult> {
    const result = await this.analyze(spindleId, content);
    await this.saveResults(result);
    return result;
  }

  /**
   * Get pattern statistics for a spindle
   */
  static async getPatternStats(spindleId: string): Promise<Record<PatternType, number>> {
    const result = await pool.query(
      `SELECT pattern_type, COUNT(*) as count
       FROM reasoning_patterns
       WHERE spindle_id = $1
       GROUP BY pattern_type`,
      [spindleId]
    );

    const stats: any = {};
    result.rows.forEach(row => {
      stats[row.pattern_type] = parseInt(row.count);
    });

    return stats;
  }

  /**
   * Get global pattern distribution
   */
  static async getGlobalPatternDistribution(): Promise<Record<PatternType, number>> {
    const result = await pool.query(
      `SELECT pattern_type, COUNT(*) as count
       FROM reasoning_patterns
       GROUP BY pattern_type
       ORDER BY count DESC`
    );

    const stats: any = {};
    result.rows.forEach(row => {
      stats[row.pattern_type] = parseInt(row.count);
    });

    return stats;
  }
}

export const patternAnalyzer = new PatternAnalyzer();
