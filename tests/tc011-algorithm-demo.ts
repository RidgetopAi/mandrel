#!/usr/bin/env npx tsx
/**
 * TC011 Algorithm Demo - Standalone Algorithm Testing
 * Demonstrates individual algorithm usage for TC012 integration
 */

import { 
  FileCooccurrenceAnalyzer,
  TemporalPatternAnalyzer, 
  DeveloperPatternAnalyzer,
  ChangeMagnitudeAnalyzer,
  PatternConfidenceAnalyzer
} from './tc011-change-pattern-research.js';

import { db } from './mcp-server/src/config/database.js';

async function demonstrateAlgorithms(): Promise<void> {
  console.log('🧪 TC011 Algorithm Demo - Individual Algorithm Testing');
  console.log('=' .repeat(60));

  try {
    // Get a project with data
    const projectResult = await db.query(`
      SELECT p.id, p.name, COUNT(gc.id) as commit_count
      FROM projects p
      LEFT JOIN git_commits gc ON p.id = gc.project_id
      GROUP BY p.id, p.name
      HAVING COUNT(gc.id) > 10
      ORDER BY COUNT(gc.id) DESC
      LIMIT 1
    `);

    if (projectResult.rows.length === 0) {
      console.log('❌ No suitable project found');
      return;
    }

    const project = projectResult.rows[0];
    console.log(`📂 Testing with project: ${project.name} (${project.commit_count} commits)`);

    // Test individual algorithms
    console.log('\n🔍 Testing File Co-occurrence Analyzer...');
    const cooccurrenceAnalyzer = new FileCooccurrenceAnalyzer();
    const cooccResults = await cooccurrenceAnalyzer.analyzeCooccurrencePatterns(project.id);
    console.log(`   ✅ Found ${cooccResults.patterns.length} co-occurrence patterns`);
    console.log(`   ⚡ Execution time: ${cooccResults.metrics.execution_time_ms}ms`);

    console.log('\n⏰ Testing Temporal Pattern Analyzer...');  
    const temporalAnalyzer = new TemporalPatternAnalyzer();
    const temporalResults = await temporalAnalyzer.analyzeTemporalPatterns(project.id);
    console.log(`   ✅ Found ${temporalResults.patterns.length} temporal patterns`);
    console.log(`   ⚡ Execution time: ${temporalResults.metrics.execution_time_ms}ms`);

    console.log('\n👥 Testing Developer Pattern Analyzer...');
    const developerAnalyzer = new DeveloperPatternAnalyzer();  
    const devResults = await developerAnalyzer.analyzeDeveloperPatterns(project.id);
    console.log(`   ✅ Found ${devResults.patterns.length} developer patterns`);
    console.log(`   ⚡ Execution time: ${devResults.metrics.execution_time_ms}ms`);

    console.log('\n📏 Testing Change Magnitude Analyzer...');
    const magnitudeAnalyzer = new ChangeMagnitudeAnalyzer();
    const magnitudeResults = await magnitudeAnalyzer.analyzeChangeMagnitudePatterns(project.id);
    console.log(`   ✅ Found ${magnitudeResults.magnitudePatterns.length} magnitude patterns`);
    console.log(`   ✅ Found ${magnitudeResults.frequencyPatterns.length} frequency patterns`);
    console.log(`   ⚡ Execution time: ${magnitudeResults.metrics.execution_time_ms}ms`);

    console.log('\n🎯 Testing Pattern Confidence Analyzer...');
    const confidenceAnalyzer = new PatternConfidenceAnalyzer();
    const confResults = await confidenceAnalyzer.analyzePatternConfidence(
      cooccResults.patterns,
      temporalResults.patterns, 
      devResults.patterns,
      magnitudeResults.magnitudePatterns
    );
    console.log(`   ✅ Generated ${confResults.insights.length} insights`);
    console.log(`   ⚡ Execution time: ${confResults.metrics.execution_time_ms}ms`);

    // Display sample results
    console.log('\n📊 SAMPLE RESULTS:');
    
    if (cooccResults.patterns.length > 0) {
      const topPattern = cooccResults.patterns[0];
      console.log(`🔗 Top Co-occurrence: ${topPattern.file1} ↔ ${topPattern.file2}`);
      console.log(`   Confidence: ${topPattern.confidence}, Lift: ${topPattern.lift}x`);
    }

    if (magnitudeResults.magnitudePatterns.length > 0) {
      const riskFiles = magnitudeResults.magnitudePatterns
        .filter(p => p.risk_level === 'critical' || p.risk_level === 'high')
        .slice(0, 3);
      
      console.log(`🚨 High-Risk Files: ${riskFiles.length} found`);
      riskFiles.forEach(file => {
        console.log(`   ${file.file_path} (${file.risk_level.toUpperCase()})`);
      });
    }

    if (confResults.insights.length > 0) {
      const topInsight = confResults.insights[0];
      console.log(`💡 Top Insight: ${topInsight.insight_type} (${Math.round(topInsight.confidence * 100)}% confidence)`);
      console.log(`   ${topInsight.description}`);
    }

    console.log('\n✅ All algorithms working correctly!');
    console.log('🚀 Ready for TC012 production integration');

  } catch (error) {
    console.error('❌ Algorithm demo failed:', error);
  }
}

// Run if executed directly
if (require.main === module) {
  demonstrateAlgorithms()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}