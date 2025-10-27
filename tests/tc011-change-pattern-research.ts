#!/usr/bin/env npx tsx
/**
 * TC011: Change Pattern Analysis Research Implementation
 * AIDIS Phase 2 - Development Pattern Intelligence
 * 
 * Implements comprehensive change pattern analysis algorithms to extract
 * meaningful insights from git commit history and development patterns.
 * 
 * Features:
 * - File co-occurrence pattern analysis 
 * - Temporal change pattern detection
 * - Developer change pattern analysis
 * - Change magnitude and frequency analysis
 * - Pattern confidence scoring and anomaly detection
 * 
 * Research Areas:
 * 1. Co-occurrence Matrix Analysis
 * 2. Temporal Clustering Algorithms  
 * 3. Change Velocity Calculations
 * 4. Pattern Confidence Scoring
 * 5. Anomaly Detection in Change Patterns
 * 
 * Author: AIDIS TC011 Implementation
 * Created: 2025-09-10
 */

import { db } from './mcp-server/src/config/database.js';
import { performance } from 'perf_hooks';

// ========================================================================================
// TYPE DEFINITIONS
// ========================================================================================

interface FileCooccurrencePattern {
  file1: string;
  file2: string;
  cooccurrences: number;
  confidence: number;
  lift: number;
  support: number;
  commits: string[];
  pattern_strength: 'weak' | 'moderate' | 'strong' | 'very_strong';
}

interface TemporalPattern {
  pattern_id: string;
  pattern_type: 'hourly' | 'daily' | 'weekly' | 'monthly';
  peak_periods: number[];
  commit_counts: number[];
  pattern_strength: number;
  statistical_significance: number;
  authors: string[];
  files: string[];
}

interface DeveloperPattern {
  author_email: string;
  author_name: string;
  specialty_files: string[];
  change_velocity: number;
  consistency_score: number;
  collaboration_patterns: {
    frequent_collaborators: string[];
    shared_files: string[];
    temporal_overlap: number;
  };
  change_characteristics: {
    avg_files_per_commit: number;
    avg_lines_per_commit: number;
    commit_type_distribution: Record<string, number>;
  };
}

interface ChangeMagnitudePattern {
  file_path: string;
  change_category: 'small' | 'medium' | 'large' | 'massive';
  frequency_score: number;
  volatility_score: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  anomaly_score: number;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
}

interface ChangeFrequencyPattern {
  file_path: string;
  change_frequency: number;
  hotspot_score: number;
  stability_score: number;
  contributor_diversity: number;
  change_type_distribution: Record<string, number>;
  seasonal_patterns: number[];
}

interface PatternAnalysisResult {
  algorithm: string;
  execution_time_ms: number;
  patterns_found: number;
  confidence_scores: number[];
  statistical_metrics: {
    mean_confidence: number;
    std_deviation: number;
    significance_threshold: number;
    anomaly_count: number;
  };
}

interface ChangePatternInsight {
  insight_type: string;
  description: string;
  confidence: number;
  supporting_data: any[];
  actionable_recommendations: string[];
  risk_assessment: {
    level: 'low' | 'medium' | 'high' | 'critical';
    factors: string[];
  };
}

// ========================================================================================
// ALGORITHM IMPLEMENTATIONS
// ========================================================================================

/**
 * Algorithm 1: File Co-occurrence Pattern Analysis
 * Uses market basket analysis principles to find files that frequently change together
 */
class FileCooccurrenceAnalyzer {
  private minSupport: number = 0.01; // Minimum 1% of commits
  private minConfidence: number = 0.3; // Minimum 30% confidence
  private minLift: number = 1.1; // Must be better than random

  async analyzeCooccurrencePatterns(projectId: string): Promise<{
    patterns: FileCooccurrencePattern[];
    metrics: PatternAnalysisResult;
  }> {
    const startTime = performance.now();
    console.log('🔍 Analyzing file co-occurrence patterns...');

    // Get all commit-file relationships
    const query = `
      SELECT 
        gc.commit_sha,
        gc.author_date,
        array_agg(gfc.file_path ORDER BY gfc.file_path) as changed_files
      FROM git_commits gc
      JOIN git_file_changes gfc ON gc.id = gfc.commit_id
      WHERE gc.project_id = $1
      GROUP BY gc.commit_sha, gc.author_date
      HAVING array_length(array_agg(gfc.file_path), 1) > 1
      ORDER BY gc.author_date DESC
    `;

    const result = await db.query(query, [projectId]);
    const commitFilesets = result.rows;
    const totalCommits = commitFilesets.length;

    console.log(`📊 Processing ${totalCommits} multi-file commits...`);

    // Build co-occurrence matrix
    const cooccurrenceMap = new Map<string, {
      count: number;
      commits: string[];
    }>();
    
    const fileFrequency = new Map<string, number>();

    // Count file frequencies and co-occurrences
    for (const commit of commitFilesets) {
      const files = commit.changed_files;
      
      // Count individual file frequencies
      for (const file of files) {
        fileFrequency.set(file, (fileFrequency.get(file) || 0) + 1);
      }

      // Count co-occurrences (file pairs)
      for (let i = 0; i < files.length; i++) {
        for (let j = i + 1; j < files.length; j++) {
          const file1 = files[i];
          const file2 = files[j];
          const pair = file1 < file2 ? `${file1}|${file2}` : `${file2}|${file1}`;
          
          if (!cooccurrenceMap.has(pair)) {
            cooccurrenceMap.set(pair, { count: 0, commits: [] });
          }
          
          const entry = cooccurrenceMap.get(pair)!;
          entry.count++;
          entry.commits.push(commit.commit_sha);
        }
      }
    }

    // Calculate metrics and filter patterns
    const patterns: FileCooccurrencePattern[] = [];
    
    for (const [pairKey, data] of cooccurrenceMap.entries()) {
      const [file1, file2] = pairKey.split('|');
      const cooccurrences = data.count;
      
      // Calculate market basket analysis metrics
      const support = cooccurrences / totalCommits;
      const file1Freq = fileFrequency.get(file1) || 0;
      const file2Freq = fileFrequency.get(file2) || 0;
      
      const confidence1 = cooccurrences / file1Freq; // P(file2|file1)
      const confidence2 = cooccurrences / file2Freq; // P(file1|file2)
      const confidence = Math.max(confidence1, confidence2);
      
      const lift = cooccurrences * totalCommits / (file1Freq * file2Freq);

      // Filter by thresholds
      if (support >= this.minSupport && confidence >= this.minConfidence && lift >= this.minLift) {
        let patternStrength: 'weak' | 'moderate' | 'strong' | 'very_strong';
        if (lift >= 3.0 && confidence >= 0.8) patternStrength = 'very_strong';
        else if (lift >= 2.0 && confidence >= 0.6) patternStrength = 'strong';
        else if (lift >= 1.5 && confidence >= 0.4) patternStrength = 'moderate';
        else patternStrength = 'weak';

        patterns.push({
          file1,
          file2,
          cooccurrences,
          confidence: Math.round(confidence * 100) / 100,
          lift: Math.round(lift * 100) / 100,
          support: Math.round(support * 1000) / 1000,
          commits: data.commits,
          pattern_strength: patternStrength
        });
      }
    }

    // Sort by lift (strength of association)
    patterns.sort((a, b) => b.lift - a.lift);

    const executionTime = performance.now() - startTime;
    const confidenceScores = patterns.map(p => p.confidence);

    console.log(`✅ Found ${patterns.length} co-occurrence patterns in ${Math.round(executionTime)}ms`);

    return {
      patterns,
      metrics: {
        algorithm: 'file_cooccurrence',
        execution_time_ms: Math.round(executionTime),
        patterns_found: patterns.length,
        confidence_scores: confidenceScores,
        statistical_metrics: {
          mean_confidence: confidenceScores.reduce((a, b) => a + b, 0) / (confidenceScores.length || 1),
          std_deviation: this.calculateStandardDeviation(confidenceScores),
          significance_threshold: this.minConfidence,
          anomaly_count: patterns.filter(p => p.lift > 5.0).length
        }
      }
    };
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

/**
 * Algorithm 2: Temporal Change Pattern Analysis
 * Detects patterns in when changes occur (time-based clustering)
 */
class TemporalPatternAnalyzer {
  
  async analyzeTemporalPatterns(projectId: string): Promise<{
    patterns: TemporalPattern[];
    metrics: PatternAnalysisResult;
  }> {
    const startTime = performance.now();
    console.log('⏰ Analyzing temporal change patterns...');

    // Get commit timestamps with author and file data
    const query = `
      SELECT 
        gc.commit_sha,
        gc.author_date,
        gc.author_email,
        gc.author_name,
        EXTRACT(hour FROM gc.author_date) as commit_hour,
        EXTRACT(dow FROM gc.author_date) as day_of_week,
        EXTRACT(day FROM gc.author_date) as day_of_month,
        array_agg(DISTINCT gfc.file_path) as files_changed
      FROM git_commits gc
      LEFT JOIN git_file_changes gfc ON gc.id = gfc.commit_id
      WHERE gc.project_id = $1
      GROUP BY gc.commit_sha, gc.author_date, gc.author_email, gc.author_name
      ORDER BY gc.author_date
    `;

    const result = await db.query(query, [projectId]);
    const commits = result.rows;

    console.log(`📊 Processing ${commits.length} commits for temporal patterns...`);

    const patterns: TemporalPattern[] = [];

    // 1. Hourly patterns (24-hour analysis)
    const hourlyPattern = this.analyzeHourlyPattern(commits);
    if (hourlyPattern.pattern_strength > 0.3) {
      patterns.push(hourlyPattern);
    }

    // 2. Daily patterns (day of week analysis)
    const dailyPattern = this.analyzeDailyPattern(commits);
    if (dailyPattern.pattern_strength > 0.3) {
      patterns.push(dailyPattern);
    }

    // 3. Weekly patterns (week-based clustering)
    const weeklyPattern = this.analyzeWeeklyPattern(commits);
    if (weeklyPattern.pattern_strength > 0.3) {
      patterns.push(weeklyPattern);
    }

    // 4. Monthly patterns (seasonal analysis)
    const monthlyPattern = this.analyzeMonthlyPattern(commits);
    if (monthlyPattern.pattern_strength > 0.3) {
      patterns.push(monthlyPattern);
    }

    const executionTime = performance.now() - startTime;
    const strengthScores = patterns.map(p => p.pattern_strength);

    console.log(`✅ Found ${patterns.length} temporal patterns in ${Math.round(executionTime)}ms`);

    return {
      patterns,
      metrics: {
        algorithm: 'temporal_clustering',
        execution_time_ms: Math.round(executionTime),
        patterns_found: patterns.length,
        confidence_scores: strengthScores,
        statistical_metrics: {
          mean_confidence: strengthScores.reduce((a, b) => a + b, 0) / (strengthScores.length || 1),
          std_deviation: this.calculateStandardDeviation(strengthScores),
          significance_threshold: 0.3,
          anomaly_count: patterns.filter(p => p.pattern_strength > 0.8).length
        }
      }
    };
  }

  private analyzeHourlyPattern(commits: any[]): TemporalPattern {
    const hourCounts = new Array(24).fill(0);
    const hourAuthors = Array.from({ length: 24 }, () => new Set<string>());
    const hourFiles = Array.from({ length: 24 }, () => new Set<string>());

    for (const commit of commits) {
      const hour = parseInt(commit.commit_hour);
      hourCounts[hour]++;
      hourAuthors[hour].add(commit.author_email);
      if (commit.files_changed) {
        commit.files_changed.forEach((file: string) => hourFiles[hour].add(file));
      }
    }

    const totalCommits = commits.length;
    const expectedPerHour = totalCommits / 24;
    
    // Calculate chi-square test for uniformity
    const chiSquare = hourCounts.reduce((sum, count) => {
      return sum + Math.pow(count - expectedPerHour, 2) / expectedPerHour;
    }, 0);
    
    // Statistical significance (chi-square critical value for 23 df at p=0.05 is ~35.17)
    const significance = chiSquare > 35.17 ? 1.0 : chiSquare / 35.17;
    
    // Find peak hours (above average + 1 std dev)
    const mean = expectedPerHour;
    const stdDev = Math.sqrt(hourCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / 24);
    const threshold = mean + stdDev;
    
    const peakHours = hourCounts
      .map((count, hour) => ({ hour, count }))
      .filter(({ count }) => count > threshold)
      .map(({ hour }) => hour);

    return {
      pattern_id: 'hourly_commits',
      pattern_type: 'hourly',
      peak_periods: peakHours,
      commit_counts: hourCounts,
      pattern_strength: Math.min(significance, 1.0),
      statistical_significance: significance,
      authors: Array.from(new Set(commits.map(c => c.author_email))),
      files: Array.from(new Set(commits.flatMap(c => c.files_changed || [])))
    };
  }

  private analyzeDailyPattern(commits: any[]): TemporalPattern {
    const dayCounts = new Array(7).fill(0); // 0 = Sunday, 6 = Saturday
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const commit of commits) {
      const dayOfWeek = parseInt(commit.day_of_week);
      dayCounts[dayOfWeek]++;
    }

    const totalCommits = commits.length;
    const expectedPerDay = totalCommits / 7;
    
    // Calculate pattern strength using coefficient of variation
    const mean = expectedPerDay;
    const variance = dayCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / 7;
    const stdDev = Math.sqrt(variance);
    const coefficientOfVariation = stdDev / mean;
    
    // Normalize coefficient of variation to 0-1 scale
    const patternStrength = Math.min(coefficientOfVariation / 0.5, 1.0);

    const peakDays = dayCounts
      .map((count, day) => ({ day, count }))
      .filter(({ count }) => count > mean + stdDev)
      .map(({ day }) => day);

    return {
      pattern_id: 'daily_commits',
      pattern_type: 'daily',
      peak_periods: peakDays,
      commit_counts: dayCounts,
      pattern_strength: patternStrength,
      statistical_significance: patternStrength,
      authors: Array.from(new Set(commits.map(c => c.author_email))),
      files: Array.from(new Set(commits.flatMap(c => c.files_changed || [])))
    };
  }

  private analyzeWeeklyPattern(commits: any[]): TemporalPattern {
    // Group commits by week
    const weeklyData = new Map<string, {
      count: number;
      authors: Set<string>;
      files: Set<string>;
    }>();

    for (const commit of commits) {
      const date = new Date(commit.author_date);
      const year = date.getFullYear();
      const week = this.getWeekNumber(date);
      const weekKey = `${year}-W${week.toString().padStart(2, '0')}`;

      if (!weeklyData.has(weekKey)) {
        weeklyData.set(weekKey, {
          count: 0,
          authors: new Set(),
          files: new Set()
        });
      }

      const weekData = weeklyData.get(weekKey)!;
      weekData.count++;
      weekData.authors.add(commit.author_email);
      if (commit.files_changed) {
        commit.files_changed.forEach((file: string) => weekData.files.add(file));
      }
    }

    const weeklyCounts = Array.from(weeklyData.values()).map(w => w.count);
    
    if (weeklyCounts.length < 3) {
      return {
        pattern_id: 'weekly_commits',
        pattern_type: 'weekly',
        peak_periods: [],
        commit_counts: weeklyCounts,
        pattern_strength: 0,
        statistical_significance: 0,
        authors: [],
        files: []
      };
    }

    const mean = weeklyCounts.reduce((a, b) => a + b, 0) / weeklyCounts.length;
    const variance = weeklyCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / weeklyCounts.length;
    const stdDev = Math.sqrt(variance);
    
    const patternStrength = Math.min(stdDev / mean, 1.0);

    return {
      pattern_id: 'weekly_commits',
      pattern_type: 'weekly',
      peak_periods: [], // Week analysis is more about trend than specific peaks
      commit_counts: weeklyCounts,
      pattern_strength: patternStrength,
      statistical_significance: patternStrength,
      authors: Array.from(new Set(commits.map(c => c.author_email))),
      files: Array.from(new Set(commits.flatMap(c => c.files_changed || [])))
    };
  }

  private analyzeMonthlyPattern(commits: any[]): TemporalPattern {
    const monthCounts = new Array(12).fill(0);

    for (const commit of commits) {
      const date = new Date(commit.author_date);
      const month = date.getMonth(); // 0-11
      monthCounts[month]++;
    }

    const totalCommits = commits.length;
    const expectedPerMonth = totalCommits / 12;
    
    const variance = monthCounts.reduce((sum, count) => sum + Math.pow(count - expectedPerMonth, 2), 0) / 12;
    const stdDev = Math.sqrt(variance);
    const patternStrength = Math.min(stdDev / expectedPerMonth, 1.0);

    const peakMonths = monthCounts
      .map((count, month) => ({ month, count }))
      .filter(({ count }) => count > expectedPerMonth + stdDev)
      .map(({ month }) => month);

    return {
      pattern_id: 'monthly_commits',
      pattern_type: 'monthly',
      peak_periods: peakMonths,
      commit_counts: monthCounts,
      pattern_strength: patternStrength,
      statistical_significance: patternStrength,
      authors: Array.from(new Set(commits.map(c => c.author_email))),
      files: Array.from(new Set(commits.flatMap(c => c.files_changed || [])))
    };
  }

  private getWeekNumber(date: Date): number {
    const start = new Date(date.getFullYear(), 0, 1);
    const days = Math.floor((date.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
    return Math.ceil((days + start.getDay() + 1) / 7);
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

/**
 * Algorithm 3: Developer Change Pattern Analysis
 * Analyzes developer-specific change patterns and collaboration networks
 */
class DeveloperPatternAnalyzer {
  
  async analyzeDeveloperPatterns(projectId: string): Promise<{
    patterns: DeveloperPattern[];
    metrics: PatternAnalysisResult;
  }> {
    const startTime = performance.now();
    console.log('👥 Analyzing developer change patterns...');

    // Get comprehensive developer data
    const query = `
      SELECT 
        gc.author_email,
        gc.author_name,
        gc.commit_sha,
        gc.author_date,
        gc.commit_type,
        gc.files_changed,
        gc.insertions + gc.deletions as total_lines,
        array_agg(DISTINCT gfc.file_path) as files_in_commit
      FROM git_commits gc
      LEFT JOIN git_file_changes gfc ON gc.id = gfc.commit_id
      WHERE gc.project_id = $1
      GROUP BY gc.author_email, gc.author_name, gc.commit_sha, gc.author_date, gc.commit_type, gc.files_changed, gc.insertions, gc.deletions
      ORDER BY gc.author_email, gc.author_date
    `;

    const result = await db.query(query, [projectId]);
    const commits = result.rows;

    console.log(`👤 Processing ${commits.length} commits from developers...`);

    // Group by developer
    const developerData = new Map<string, any[]>();
    for (const commit of commits) {
      if (!developerData.has(commit.author_email)) {
        developerData.set(commit.author_email, []);
      }
      developerData.get(commit.author_email)!.push(commit);
    }

    const patterns: DeveloperPattern[] = [];

    for (const [authorEmail, authorCommits] of developerData.entries()) {
      if (authorCommits.length < 3) continue; // Skip developers with too few commits

      const pattern = await this.analyzeSingleDeveloperPattern(authorEmail, authorCommits, commits);
      patterns.push(pattern);
    }

    const executionTime = performance.now() - startTime;
    const consistencyScores = patterns.map(p => p.consistency_score);

    console.log(`✅ Analyzed ${patterns.length} developer patterns in ${Math.round(executionTime)}ms`);

    return {
      patterns,
      metrics: {
        algorithm: 'developer_patterns',
        execution_time_ms: Math.round(executionTime),
        patterns_found: patterns.length,
        confidence_scores: consistencyScores,
        statistical_metrics: {
          mean_confidence: consistencyScores.reduce((a, b) => a + b, 0) / (consistencyScores.length || 1),
          std_deviation: this.calculateStandardDeviation(consistencyScores),
          significance_threshold: 0.5,
          anomaly_count: patterns.filter(p => p.change_velocity > 10).length
        }
      }
    };
  }

  private async analyzeSingleDeveloperPattern(
    authorEmail: string,
    authorCommits: any[],
    allCommits: any[]
  ): Promise<DeveloperPattern> {
    
    const authorName = authorCommits[0].author_name;
    
    // Calculate specialty files (files this developer changes most)
    const fileFrequency = new Map<string, number>();
    authorCommits.forEach(commit => {
      if (commit.files_in_commit) {
        commit.files_in_commit.forEach((file: string) => {
          fileFrequency.set(file, (fileFrequency.get(file) || 0) + 1);
        });
      }
    });

    const specialtyFiles = Array.from(fileFrequency.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([file]) => file);

    // Calculate change velocity (commits per week)
    const timeSpan = this.getTimeSpanInWeeks(authorCommits);
    const changeVelocity = timeSpan > 0 ? authorCommits.length / timeSpan : 0;

    // Calculate consistency score based on commit regularity
    const consistencyScore = this.calculateConsistencyScore(authorCommits);

    // Find collaboration patterns
    const collaborationPatterns = this.analyzeCollaborationPatterns(authorEmail, authorCommits, allCommits);

    // Calculate change characteristics
    const changeCharacteristics = {
      avg_files_per_commit: authorCommits.reduce((sum, c) => sum + (c.files_changed || 0), 0) / authorCommits.length,
      avg_lines_per_commit: authorCommits.reduce((sum, c) => sum + (c.total_lines || 0), 0) / authorCommits.length,
      commit_type_distribution: this.calculateCommitTypeDistribution(authorCommits)
    };

    return {
      author_email: authorEmail,
      author_name: authorName,
      specialty_files: specialtyFiles,
      change_velocity: Math.round(changeVelocity * 100) / 100,
      consistency_score: Math.round(consistencyScore * 100) / 100,
      collaboration_patterns: collaborationPatterns,
      change_characteristics: {
        avg_files_per_commit: Math.round(changeCharacteristics.avg_files_per_commit * 100) / 100,
        avg_lines_per_commit: Math.round(changeCharacteristics.avg_lines_per_commit * 100) / 100,
        commit_type_distribution: changeCharacteristics.commit_type_distribution
      }
    };
  }

  private getTimeSpanInWeeks(commits: any[]): number {
    if (commits.length < 2) return 0;
    
    const dates = commits.map(c => new Date(c.author_date)).sort((a, b) => a.getTime() - b.getTime());
    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    
    return (lastDate.getTime() - firstDate.getTime()) / (1000 * 60 * 60 * 24 * 7);
  }

  private calculateConsistencyScore(commits: any[]): number {
    if (commits.length < 3) return 0;

    // Calculate intervals between commits
    const dates = commits.map(c => new Date(c.author_date)).sort((a, b) => a.getTime() - b.getTime());
    const intervals: number[] = [];
    
    for (let i = 1; i < dates.length; i++) {
      const intervalDays = (dates[i].getTime() - dates[i-1].getTime()) / (1000 * 60 * 60 * 24);
      intervals.push(intervalDays);
    }

    // Lower coefficient of variation = higher consistency
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    
    const coefficientOfVariation = mean > 0 ? stdDev / mean : 1;
    return Math.max(0, Math.min(1, 1 - (coefficientOfVariation / 2))); // Normalize to 0-1
  }

  private analyzeCollaborationPatterns(authorEmail: string, authorCommits: any[], allCommits: any[]) {
    // Find files this author works on
    const authorFiles = new Set<string>();
    authorCommits.forEach(commit => {
      if (commit.files_in_commit) {
        commit.files_in_commit.forEach((file: string) => authorFiles.add(file));
      }
    });

    // Find other developers who work on the same files
    const collaborators = new Map<string, {
      sharedFiles: Set<string>;
      temporalOverlap: number;
    }>();

    for (const commit of allCommits) {
      if (commit.author_email === authorEmail || !commit.files_in_commit) continue;

      const sharedFiles = commit.files_in_commit.filter((file: string) => authorFiles.has(file));
      if (sharedFiles.length > 0) {
        if (!collaborators.has(commit.author_email)) {
          collaborators.set(commit.author_email, {
            sharedFiles: new Set(),
            temporalOverlap: 0
          });
        }
        
        const collab = collaborators.get(commit.author_email)!;
        sharedFiles.forEach((file: string) => collab.sharedFiles.add(file));
      }
    }

    // Calculate temporal overlap (simplified)
    const temporalOverlap = collaborators.size > 0 ? 0.5 : 0; // Placeholder for now

    const frequentCollaborators = Array.from(collaborators.entries())
      .sort(([,a], [,b]) => b.sharedFiles.size - a.sharedFiles.size)
      .slice(0, 5)
      .map(([email]) => email);

    const sharedFiles = Array.from(authorFiles).slice(0, 10);

    return {
      frequent_collaborators: frequentCollaborators,
      shared_files: sharedFiles,
      temporal_overlap: temporalOverlap
    };
  }

  private calculateCommitTypeDistribution(commits: any[]): Record<string, number> {
    const distribution: Record<string, number> = {};
    
    commits.forEach(commit => {
      const type = commit.commit_type || 'unknown';
      distribution[type] = (distribution[type] || 0) + 1;
    });

    // Convert to percentages
    const total = commits.length;
    for (const type in distribution) {
      distribution[type] = Math.round((distribution[type] / total) * 100);
    }

    return distribution;
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

/**
 * Algorithm 4: Change Magnitude and Frequency Analysis
 * Analyzes the size and frequency of changes to identify patterns and anomalies
 */
class ChangeMagnitudeAnalyzer {
  
  async analyzeChangeMagnitudePatterns(projectId: string): Promise<{
    magnitudePatterns: ChangeMagnitudePattern[];
    frequencyPatterns: ChangeFrequencyPattern[];
    metrics: PatternAnalysisResult;
  }> {
    const startTime = performance.now();
    console.log('📏 Analyzing change magnitude and frequency patterns...');

    // Get file change statistics
    const query = `
      WITH file_stats AS (
        SELECT 
          gfc.file_path,
          COUNT(*) as change_count,
          COUNT(DISTINCT gc.author_email) as contributor_count,
          SUM(gfc.lines_added + gfc.lines_removed) as total_lines_changed,
          AVG(gfc.lines_added + gfc.lines_removed) as avg_lines_per_change,
          STDDEV(gfc.lines_added + gfc.lines_removed) as lines_std_dev,
          array_agg(DISTINCT gc.commit_type) as change_types,
          array_agg(gc.author_date ORDER BY gc.author_date) as change_dates,
          MIN(gc.author_date) as first_change,
          MAX(gc.author_date) as last_change
        FROM git_file_changes gfc
        JOIN git_commits gc ON gfc.commit_id = gc.id
        WHERE gc.project_id = $1
        GROUP BY gfc.file_path
      )
      SELECT *,
        EXTRACT(EPOCH FROM (last_change - first_change)) / (24 * 60 * 60) as lifespan_days
      FROM file_stats
      WHERE change_count >= 2
      ORDER BY change_count DESC
    `;

    const result = await db.query(query, [projectId]);
    const fileStats = result.rows;

    console.log(`📊 Processing ${fileStats.length} files for magnitude/frequency analysis...`);

    const magnitudePatterns: ChangeMagnitudePattern[] = [];
    const frequencyPatterns: ChangeFrequencyPattern[] = [];

    for (const file of fileStats) {
      // Magnitude analysis
      const magnitudePattern = this.analyzeMagnitudePattern(file);
      magnitudePatterns.push(magnitudePattern);

      // Frequency analysis  
      const frequencyPattern = this.analyzeFrequencyPattern(file);
      frequencyPatterns.push(frequencyPattern);
    }

    // Sort by risk/importance
    magnitudePatterns.sort((a, b) => {
      const aScore = this.getRiskScore(a.risk_level);
      const bScore = this.getRiskScore(b.risk_level);
      return bScore - aScore;
    });

    frequencyPatterns.sort((a, b) => b.hotspot_score - a.hotspot_score);

    const executionTime = performance.now() - startTime;
    const riskScores = magnitudePatterns.map(p => this.getRiskScore(p.risk_level));

    console.log(`✅ Analyzed ${magnitudePatterns.length} magnitude patterns in ${Math.round(executionTime)}ms`);

    return {
      magnitudePatterns,
      frequencyPatterns,
      metrics: {
        algorithm: 'change_magnitude_frequency',
        execution_time_ms: Math.round(executionTime),
        patterns_found: magnitudePatterns.length + frequencyPatterns.length,
        confidence_scores: riskScores,
        statistical_metrics: {
          mean_confidence: riskScores.reduce((a, b) => a + b, 0) / (riskScores.length || 1),
          std_deviation: this.calculateStandardDeviation(riskScores),
          significance_threshold: 2.0, // Medium risk threshold
          anomaly_count: magnitudePatterns.filter(p => p.anomaly_score > 0.8).length
        }
      }
    };
  }

  private analyzeMagnitudePattern(fileData: any): ChangeMagnitudePattern {
    const avgLines = parseFloat(fileData.avg_lines_per_change) || 0;
    const linesStdDev = parseFloat(fileData.lines_std_dev) || 0;
    const changeCount = parseInt(fileData.change_count) || 0;
    const lifespanDays = parseFloat(fileData.lifespan_days) || 1;

    // Categorize change magnitude
    let changeCategory: 'small' | 'medium' | 'large' | 'massive';
    if (avgLines < 10) changeCategory = 'small';
    else if (avgLines < 100) changeCategory = 'medium';
    else if (avgLines < 500) changeCategory = 'large';
    else changeCategory = 'massive';

    // Calculate frequency score (changes per week)
    const weeksLifespan = Math.max(lifespanDays / 7, 1);
    const frequencyScore = changeCount / weeksLifespan;

    // Calculate volatility score (coefficient of variation)
    const volatilityScore = avgLines > 0 ? Math.min(linesStdDev / avgLines, 2.0) : 0;

    // Determine trend (simplified - based on recent vs early changes)
    let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
    if (fileData.change_dates && fileData.change_dates.length >= 4) {
      const half = Math.floor(fileData.change_dates.length / 2);
      const earlyPeriod = fileData.change_dates.slice(0, half);
      const latePeriod = fileData.change_dates.slice(half);
      
      const earlyRate = earlyPeriod.length; // Simplified
      const lateRate = latePeriod.length;
      
      if (lateRate > earlyRate * 1.5) trend = 'increasing';
      else if (lateRate < earlyRate * 0.5) trend = 'decreasing';
    }

    // Calculate anomaly score
    const anomalyScore = this.calculateAnomalyScore(avgLines, volatilityScore, frequencyScore);

    // Determine risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical';
    if (anomalyScore > 0.8 || (changeCategory === 'massive' && volatilityScore > 1.0)) {
      riskLevel = 'critical';
    } else if (anomalyScore > 0.6 || volatilityScore > 0.8) {
      riskLevel = 'high';
    } else if (anomalyScore > 0.4 || frequencyScore > 2.0) {
      riskLevel = 'medium';
    } else {
      riskLevel = 'low';
    }

    return {
      file_path: fileData.file_path,
      change_category: changeCategory,
      frequency_score: Math.round(frequencyScore * 100) / 100,
      volatility_score: Math.round(volatilityScore * 100) / 100,
      trend,
      anomaly_score: Math.round(anomalyScore * 100) / 100,
      risk_level: riskLevel
    };
  }

  private analyzeFrequencyPattern(fileData: any): ChangeFrequencyPattern {
    const changeCount = parseInt(fileData.change_count) || 0;
    const contributorCount = parseInt(fileData.contributor_count) || 1;
    const lifespanDays = parseFloat(fileData.lifespan_days) || 1;

    // Calculate hotspot score (normalized frequency)
    const changeFrequency = changeCount / Math.max(lifespanDays / 365, 0.1); // Changes per year
    const hotspotScore = Math.min(changeFrequency / 10, 1.0); // Normalize to 0-1

    // Calculate stability score (inverse of change frequency)
    const stabilityScore = Math.max(0, 1 - hotspotScore);

    // Calculate contributor diversity score
    const contributorDiversity = Math.min(contributorCount / 5, 1.0); // Normalize to max 5 contributors

    // Calculate change type distribution
    const changeTypeDistribution: Record<string, number> = {};
    if (fileData.change_types) {
      const types = fileData.change_types;
      types.forEach((type: string) => {
        changeTypeDistribution[type] = (changeTypeDistribution[type] || 0) + 1;
      });
      
      // Convert to percentages
      const total = types.length;
      for (const type in changeTypeDistribution) {
        changeTypeDistribution[type] = Math.round((changeTypeDistribution[type] / total) * 100);
      }
    }

    // Calculate seasonal patterns (placeholder - would need more sophisticated analysis)
    const seasonalPatterns = new Array(12).fill(0.5); // Placeholder

    return {
      file_path: fileData.file_path,
      change_frequency: Math.round(changeFrequency * 100) / 100,
      hotspot_score: Math.round(hotspotScore * 100) / 100,
      stability_score: Math.round(stabilityScore * 100) / 100,
      contributor_diversity: Math.round(contributorDiversity * 100) / 100,
      change_type_distribution: changeTypeDistribution,
      seasonal_patterns: seasonalPatterns
    };
  }

  private calculateAnomalyScore(avgLines: number, volatility: number, frequency: number): number {
    // Z-score based approach for anomaly detection
    // These thresholds would ideally be calculated from the dataset distribution
    const avgLineThreshold = 100;
    const volatilityThreshold = 0.5;
    const frequencyThreshold = 1.0;

    const avgLineZ = Math.abs(avgLines - avgLineThreshold) / avgLineThreshold;
    const volatilityZ = Math.abs(volatility - volatilityThreshold) / Math.max(volatilityThreshold, 0.1);
    const frequencyZ = Math.abs(frequency - frequencyThreshold) / Math.max(frequencyThreshold, 0.1);

    // Combined anomaly score
    const combinedZ = (avgLineZ + volatilityZ + frequencyZ) / 3;
    
    // Convert to 0-1 probability
    return Math.min(combinedZ / 3, 1.0);
  }

  private getRiskScore(riskLevel: string): number {
    switch (riskLevel) {
      case 'critical': return 4;
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 0;
    }
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

/**
 * Algorithm 5: Pattern Confidence Scoring and Anomaly Detection
 * Meta-algorithm that scores pattern confidence and detects anomalies across all patterns
 */
class PatternConfidenceAnalyzer {
  
  async analyzePatternConfidence(
    cooccurrencePatterns: FileCooccurrencePattern[],
    temporalPatterns: TemporalPattern[],
    developerPatterns: DeveloperPattern[],
    magnitudePatterns: ChangeMagnitudePattern[]
  ): Promise<{
    insights: ChangePatternInsight[];
    metrics: PatternAnalysisResult;
  }> {
    const startTime = performance.now();
    console.log('🎯 Analyzing pattern confidence and generating insights...');

    const insights: ChangePatternInsight[] = [];

    // 1. High-confidence co-occurrence insights
    const strongCooccurrences = cooccurrencePatterns.filter(p => 
      p.pattern_strength === 'very_strong' || p.pattern_strength === 'strong'
    );
    
    if (strongCooccurrences.length > 0) {
      insights.push({
        insight_type: 'file_coupling',
        description: `Found ${strongCooccurrences.length} strong file coupling patterns. These files frequently change together and may indicate architectural dependencies.`,
        confidence: 0.9,
        supporting_data: strongCooccurrences.slice(0, 5),
        actionable_recommendations: [
          'Consider refactoring tightly coupled files into a single module',
          'Add automated tests for coupled file changes',
          'Document architectural dependencies',
          'Consider using dependency injection to reduce coupling'
        ],
        risk_assessment: {
          level: strongCooccurrences.length > 10 ? 'high' : 'medium',
          factors: ['High coupling increases change complexity', 'Risk of breaking changes cascading']
        }
      });
    }

    // 2. Temporal pattern insights
    const significantTemporalPatterns = temporalPatterns.filter(p => p.statistical_significance > 0.7);
    
    if (significantTemporalPatterns.length > 0) {
      insights.push({
        insight_type: 'temporal_patterns',
        description: `Detected ${significantTemporalPatterns.length} significant temporal development patterns. Team has clear development rhythms.`,
        confidence: 0.8,
        supporting_data: significantTemporalPatterns,
        actionable_recommendations: [
          'Schedule critical deployments during peak development times',
          'Align code reviews with development patterns',
          'Plan maintenance windows during low-activity periods'
        ],
        risk_assessment: {
          level: 'low',
          factors: ['Predictable patterns reduce coordination risk']
        }
      });
    }

    // 3. Developer specialization insights
    const specializedDevelopers = developerPatterns.filter(p => 
      p.specialty_files.length >= 5 && p.consistency_score > 0.7
    );
    
    if (specializedDevelopers.length > 0) {
      insights.push({
        insight_type: 'developer_specialization',
        description: `${specializedDevelopers.length} developers show strong specialization patterns. This indicates good code ownership but potential knowledge silos.`,
        confidence: 0.8,
        supporting_data: specializedDevelopers.map(p => ({
          developer: p.author_name,
          specialties: p.specialty_files.slice(0, 3),
          consistency: p.consistency_score
        })),
        actionable_recommendations: [
          'Implement pair programming to share specialized knowledge',
          'Create documentation for specialized components',
          'Cross-train team members on critical components',
          'Set up code review requirements across specializations'
        ],
        risk_assessment: {
          level: specializedDevelopers.length > 3 ? 'medium' : 'low',
          factors: ['Knowledge concentration risk', 'Potential bottlenecks in development']
        }
      });
    }

    // 4. High-risk file insights
    const criticalRiskFiles = magnitudePatterns.filter(p => p.risk_level === 'critical');
    const highRiskFiles = magnitudePatterns.filter(p => p.risk_level === 'high');
    
    if (criticalRiskFiles.length > 0 || highRiskFiles.length > 3) {
      insights.push({
        insight_type: 'high_risk_files',
        description: `Found ${criticalRiskFiles.length} critical and ${highRiskFiles.length} high-risk files based on change patterns. These files need special attention.`,
        confidence: 0.95,
        supporting_data: [...criticalRiskFiles, ...highRiskFiles.slice(0, 5)],
        actionable_recommendations: [
          'Implement stricter code review processes for high-risk files',
          'Add comprehensive automated tests',
          'Consider refactoring volatile components',
          'Set up monitoring and alerting for these files',
          'Document change procedures for critical files'
        ],
        risk_assessment: {
          level: 'critical',
          factors: [
            'High change volatility increases bug risk',
            'Critical files impact system stability',
            'Change complexity may slow development'
          ]
        }
      });
    }

    // 5. Anomaly detection insights
    const anomalousPatterns = magnitudePatterns.filter(p => p.anomaly_score > 0.7);
    
    if (anomalousPatterns.length > 0) {
      insights.push({
        insight_type: 'change_anomalies',
        description: `Detected ${anomalousPatterns.length} anomalous change patterns that deviate significantly from normal development patterns.`,
        confidence: 0.7,
        supporting_data: anomalousPatterns.slice(0, 5),
        actionable_recommendations: [
          'Investigate unusual change patterns for potential issues',
          'Review code quality in anomalous files',
          'Check if anomalies indicate architectural problems',
          'Consider if unusual patterns reflect changing requirements'
        ],
        risk_assessment: {
          level: anomalousPatterns.length > 5 ? 'high' : 'medium',
          factors: ['Anomalies may indicate underlying problems', 'Unusual patterns increase unpredictability']
        }
      });
    }

    const executionTime = performance.now() - startTime;
    const confidenceScores = insights.map(i => i.confidence);

    console.log(`✅ Generated ${insights.length} pattern insights in ${Math.round(executionTime)}ms`);

    return {
      insights,
      metrics: {
        algorithm: 'pattern_confidence_analysis',
        execution_time_ms: Math.round(executionTime),
        patterns_found: insights.length,
        confidence_scores: confidenceScores,
        statistical_metrics: {
          mean_confidence: confidenceScores.reduce((a, b) => a + b, 0) / (confidenceScores.length || 1),
          std_deviation: this.calculateStandardDeviation(confidenceScores),
          significance_threshold: 0.7,
          anomaly_count: insights.filter(i => i.risk_assessment.level === 'critical').length
        }
      }
    };
  }

  private calculateStandardDeviation(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
    return Math.sqrt(variance);
  }
}

// ========================================================================================
// MAIN EXECUTION AND RESEARCH ORCHESTRATION
// ========================================================================================

/**
 * Main research orchestrator that executes all pattern analysis algorithms
 */
class ChangePatternResearcher {
  private cooccurrenceAnalyzer = new FileCooccurrenceAnalyzer();
  private temporalAnalyzer = new TemporalPatternAnalyzer();
  private developerAnalyzer = new DeveloperPatternAnalyzer();
  private magnitudeAnalyzer = new ChangeMagnitudeAnalyzer();
  private confidenceAnalyzer = new PatternConfidenceAnalyzer();

  async executeFullResearch(): Promise<void> {
    console.log('🚀 Starting TC011 Change Pattern Analysis Research');
    console.log('=' .repeat(80));

    const startTime = performance.now();

    try {
      // Get project with the most commits and file changes
      const projectResult = await db.query(`
        SELECT p.id, p.name, COUNT(gc.id) as commit_count, COUNT(gfc.id) as file_change_count
        FROM projects p
        LEFT JOIN git_commits gc ON p.id = gc.project_id
        LEFT JOIN git_file_changes gfc ON gc.id = gfc.commit_id
        GROUP BY p.id, p.name
        HAVING COUNT(gc.id) > 0
        ORDER BY COUNT(gc.id) DESC, COUNT(gfc.id) DESC
        LIMIT 1
      `);
      
      if (projectResult.rows.length === 0) {
        console.error('❌ No project with git data found in database');
        return;
      }

      const project = projectResult.rows[0];
      const projectId = project.id;
      console.log(`📂 Using project: ${project.name} (${projectId.substring(0, 8)}...)`);
      console.log(`   📊 ${project.commit_count} commits, ${project.file_change_count} file changes`);

      // Execute all algorithms in parallel for better performance
      console.log('\n🧬 Executing Pattern Analysis Algorithms...');
      
      const [
        cooccurrenceResults,
        temporalResults,
        developerResults,
        magnitudeResults
      ] = await Promise.all([
        this.cooccurrenceAnalyzer.analyzeCooccurrencePatterns(projectId),
        this.temporalAnalyzer.analyzeTemporalPatterns(projectId),
        this.developerAnalyzer.analyzeDeveloperPatterns(projectId),
        this.magnitudeAnalyzer.analyzeChangeMagnitudePatterns(projectId)
      ]);

      // Generate insights and confidence analysis
      console.log('\n🎯 Generating Pattern Insights...');
      const confidenceResults = await this.confidenceAnalyzer.analyzePatternConfidence(
        cooccurrenceResults.patterns,
        temporalResults.patterns,
        developerResults.patterns,
        magnitudeResults.magnitudePatterns
      );

      const totalExecutionTime = performance.now() - startTime;

      // Display comprehensive results
      await this.displayResults({
        cooccurrenceResults,
        temporalResults,
        developerResults,
        magnitudeResults,
        confidenceResults,
        totalExecutionTime
      });

      // Save results to database (for TC012 implementation)
      await this.saveResultsForFutureImplementation({
        cooccurrenceResults,
        temporalResults,
        developerResults,
        magnitudeResults,
        confidenceResults
      });

    } catch (error) {
      console.error('❌ Research execution failed:', error);
      throw error;
    }
  }

  private async displayResults(results: {
    cooccurrenceResults: any;
    temporalResults: any;
    developerResults: any;
    magnitudeResults: any;
    confidenceResults: any;
    totalExecutionTime: number;
  }): Promise<void> {
    
    console.log('\n' + '=' .repeat(80));
    console.log('📊 TC011 CHANGE PATTERN ANALYSIS RESULTS');
    console.log('=' .repeat(80));

    // Performance Summary
    console.log('\n⚡ PERFORMANCE METRICS:');
    console.log(`Total Execution Time: ${Math.round(results.totalExecutionTime)}ms`);
    console.log(`Co-occurrence Analysis: ${results.cooccurrenceResults.metrics.execution_time_ms}ms`);
    console.log(`Temporal Analysis: ${results.temporalResults.metrics.execution_time_ms}ms`);
    console.log(`Developer Analysis: ${results.developerResults.metrics.execution_time_ms}ms`);
    console.log(`Magnitude Analysis: ${results.magnitudeResults.metrics.execution_time_ms}ms`);
    console.log(`Confidence Analysis: ${results.confidenceResults.metrics.execution_time_ms}ms`);

    // Pattern Discovery Summary
    console.log('\n🔍 PATTERN DISCOVERY SUMMARY:');
    console.log(`File Co-occurrence Patterns: ${results.cooccurrenceResults.patterns.length}`);
    console.log(`Temporal Patterns: ${results.temporalResults.patterns.length}`);
    console.log(`Developer Patterns: ${results.developerResults.patterns.length}`);
    console.log(`Magnitude Patterns: ${results.magnitudeResults.magnitudePatterns.length}`);
    console.log(`Frequency Patterns: ${results.magnitudeResults.frequencyPatterns.length}`);
    console.log(`Generated Insights: ${results.confidenceResults.insights.length}`);

    // Top Co-occurrence Patterns
    console.log('\n🔗 TOP FILE CO-OCCURRENCE PATTERNS:');
    results.cooccurrenceResults.patterns.slice(0, 5).forEach((pattern: FileCooccurrencePattern, i: number) => {
      console.log(`${i + 1}. ${pattern.file1} ↔ ${pattern.file2}`);
      console.log(`   Confidence: ${Math.round(pattern.confidence * 100)}%, Lift: ${pattern.lift}x, Strength: ${pattern.pattern_strength}`);
    });

    // Temporal Pattern Summary
    console.log('\n⏰ TEMPORAL PATTERNS:');
    results.temporalResults.patterns.forEach((pattern: TemporalPattern) => {
      console.log(`${pattern.pattern_type.toUpperCase()}: Strength ${Math.round(pattern.pattern_strength * 100)}%`);
      if (pattern.peak_periods.length > 0) {
        console.log(`   Peak periods: ${pattern.peak_periods.join(', ')}`);
      }
    });

    // Developer Insights
    console.log('\n👥 DEVELOPER PATTERN INSIGHTS:');
    results.developerResults.patterns.slice(0, 3).forEach((dev: DeveloperPattern) => {
      console.log(`${dev.author_name} (${dev.author_email}):`);
      console.log(`   Velocity: ${dev.change_velocity} commits/week, Consistency: ${Math.round(dev.consistency_score * 100)}%`);
      console.log(`   Specializations: ${dev.specialty_files.slice(0, 3).join(', ')}`);
      console.log(`   Avg files/commit: ${dev.change_characteristics.avg_files_per_commit}`);
    });

    // High-Risk Files
    console.log('\n🚨 HIGH-RISK FILES:');
    const highRiskFiles = results.magnitudeResults.magnitudePatterns
      .filter((p: ChangeMagnitudePattern) => p.risk_level === 'critical' || p.risk_level === 'high')
      .slice(0, 5);
    
    highRiskFiles.forEach((file: ChangeMagnitudePattern) => {
      console.log(`${file.file_path} (${file.risk_level.toUpperCase()}):`);
      console.log(`   Change category: ${file.change_category}, Volatility: ${file.volatility_score}, Trend: ${file.trend}`);
      console.log(`   Anomaly score: ${file.anomaly_score}, Frequency: ${file.frequency_score} changes/week`);
    });

    // Key Insights
    console.log('\n💡 KEY INSIGHTS:');
    results.confidenceResults.insights.forEach((insight: ChangePatternInsight, i: number) => {
      console.log(`${i + 1}. ${insight.insight_type.toUpperCase()} (${Math.round(insight.confidence * 100)}% confidence):`);
      console.log(`   ${insight.description}`);
      console.log(`   Risk Level: ${insight.risk_assessment.level.toUpperCase()}`);
      if (insight.actionable_recommendations.length > 0) {
        console.log(`   Top Recommendation: ${insight.actionable_recommendations[0]}`);
      }
      console.log('');
    });

    // Algorithm Performance Comparison
    console.log('\n📈 ALGORITHM PERFORMANCE COMPARISON:');
    const algorithms = [
      { name: 'File Co-occurrence', metrics: results.cooccurrenceResults.metrics },
      { name: 'Temporal Clustering', metrics: results.temporalResults.metrics },
      { name: 'Developer Patterns', metrics: results.developerResults.metrics },
      { name: 'Magnitude Analysis', metrics: results.magnitudeResults.metrics },
      { name: 'Confidence Analysis', metrics: results.confidenceResults.metrics }
    ];

    algorithms.forEach(alg => {
      console.log(`${alg.name}:`);
      console.log(`   Patterns Found: ${alg.metrics.patterns_found}`);
      console.log(`   Execution Time: ${alg.metrics.execution_time_ms}ms`);
      console.log(`   Mean Confidence: ${Math.round(alg.metrics.statistical_metrics.mean_confidence * 100)}%`);
      console.log(`   Anomalies Detected: ${alg.metrics.statistical_metrics.anomaly_count}`);
    });

    // Recommendations Summary
    console.log('\n🎯 TOP RECOMMENDATIONS:');
    const allRecommendations = results.confidenceResults.insights
      .flatMap((insight: ChangePatternInsight) => insight.actionable_recommendations)
      .slice(0, 10);
    
    allRecommendations.forEach((rec: string, i: number) => {
      console.log(`${i + 1}. ${rec}`);
    });

    console.log('\n' + '=' .repeat(80));
    console.log('✅ TC011 CHANGE PATTERN ANALYSIS RESEARCH COMPLETE');
    console.log('🚀 Ready for TC012: Change Pattern Tracking Schema Implementation');
    console.log('=' .repeat(80));
  }

  private async saveResultsForFutureImplementation(results: any): Promise<void> {
    console.log('\n💾 Saving research results for TC012 implementation...');
    
    // Save as metadata in a special research record
    const researchSummary = {
      research_id: 'tc011_change_pattern_analysis',
      execution_date: new Date().toISOString(),
      algorithms_tested: 5,
      total_patterns_found: 
        results.cooccurrenceResults.patterns.length +
        results.temporalResults.patterns.length +
        results.developerResults.patterns.length +
        results.magnitudeResults.magnitudePatterns.length +
        results.magnitudeResults.frequencyPatterns.length,
      key_insights_count: results.confidenceResults.insights.length,
      performance_metrics: {
        total_execution_time_ms: Math.round(results.cooccurrenceResults.metrics.execution_time_ms + 
          results.temporalResults.metrics.execution_time_ms +
          results.developerResults.metrics.execution_time_ms +
          results.magnitudeResults.metrics.execution_time_ms +
          results.confidenceResults.metrics.execution_time_ms),
        algorithms_performance: [
          results.cooccurrenceResults.metrics,
          results.temporalResults.metrics,
          results.developerResults.metrics,
          results.magnitudeResults.metrics,
          results.confidenceResults.metrics
        ]
      },
      schema_recommendations: {
        pattern_storage_tables: [
          'file_cooccurrence_patterns',
          'temporal_patterns',
          'developer_patterns', 
          'change_magnitude_patterns',
          'pattern_insights'
        ],
        required_indexes: [
          'idx_patterns_confidence',
          'idx_patterns_type_strength',
          'idx_patterns_file_path',
          'idx_patterns_discovery_date'
        ],
        api_endpoints_needed: [
          'GET /patterns/cooccurrence',
          'GET /patterns/temporal',
          'GET /patterns/developer/{email}',
          'GET /patterns/risk-files',
          'GET /insights/actionable'
        ]
      }
    };

    // Store in database as context for future reference
    try {
      await db.query(`
        INSERT INTO contexts (content, context_type, tags, metadata)
        VALUES ($1, $2, $3, $4)
      `, [
        `TC011 Change Pattern Analysis Research Results: Successfully analyzed ${researchSummary.total_patterns_found} patterns using 5 different algorithms with ${researchSummary.key_insights_count} actionable insights generated.`,
        'completion',
        ['tc011', 'change_patterns', 'research', 'algorithms', 'phase2'],
        researchSummary
      ]);

      console.log('✅ Research results saved to database for TC012 implementation');
    } catch (error) {
      console.warn('⚠️ Could not save research results to database:', error);
    }
  }
}

// ========================================================================================
// SCRIPT EXECUTION
// ========================================================================================

async function main(): Promise<void> {
  const researcher = new ChangePatternResearcher();
  
  try {
    await researcher.executeFullResearch();
    console.log('\n🎉 TC011 Change Pattern Analysis Research completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('\n💥 TC011 Research failed:', error);
    process.exit(1);
  }
}

// Execute if this file is run directly
if (require.main === module) {
  main();
}

export {
  ChangePatternResearcher,
  FileCooccurrenceAnalyzer,
  TemporalPatternAnalyzer, 
  DeveloperPatternAnalyzer,
  ChangeMagnitudeAnalyzer,
  PatternConfidenceAnalyzer
};

export type {
  FileCooccurrencePattern,
  TemporalPattern,
  DeveloperPattern,
  ChangeMagnitudePattern,
  ChangeFrequencyPattern,
  PatternAnalysisResult,
  ChangePatternInsight
};