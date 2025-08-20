#!/usr/bin/env node

/**
 * Update AIDIS with current session context
 * This manually stores our handoff and session progress in AIDIS
 */

import { initializeDatabase, closeDatabase, db } from './src/config/database.js';
import { embeddingService } from './src/services/embedding.js';

async function updateSessionContext() {
  console.log('🔄 Updating AIDIS with current session context...\n');

  try {
    // Initialize database
    await initializeDatabase();
    console.log('✅ Database connected\n');

    // Get aidis-bootstrap project ID
    const projectResult = await db.query(
      "SELECT id FROM projects WHERE name = 'aidis-bootstrap' LIMIT 1"
    );
    
    if (projectResult.rows.length === 0) {
      throw new Error('aidis-bootstrap project not found');
    }
    
    const projectId = projectResult.rows[0].id;
    console.log(`📋 Using project: aidis-bootstrap (${projectId})\n`);

    // Context entries to store
    const contexts = [
      {
        content: "SESSION T008+: AIDIS MCP CONNECTION FIXED - Oracle's enterprise hardening recommendations implemented successfully. Fixed port conflict (8080->8081), process singleton pattern active, all 37 MCP tools now operational. Complete system test passed.",
        type: 'completion',
        tags: ['session-t008', 'mcp-fix', 'oracle-hardening', 'enterprise-stability'],
        relevanceScore: 10,
        metadata: {
          session_date: '2025-08-17',
          problem_solved: 'mcp_handshake_failure',
          solution: 'oracle_singleton_pattern',
          status: 'operational'
        }
      },
      {
        content: "HANDOFF STATUS RESTORED: T008 Task Management Complete with 100% test coverage. AIDIS COMMAND dashboard operational with full-stack React/Node.js implementation. AI agent specialization breakthrough achieved - CodeAgent, ProjectManager, QaAgent coordination working.",
        type: 'planning',
        tags: ['handoff-restore', 't008-complete', 'aidis-command', 'ai-agent-specialization'],
        relevanceScore: 9,
        metadata: {
          milestone: 'T008_complete',
          architecture: 'full_stack_dashboard',
          team: 'specialized_agents'
        }
      },
      {
        content: "ORACLE ENTERPRISE STABILITY ANALYSIS: Root cause identified as process race conditions, not database issues. Implemented process singleton pattern with PID file management (/home/ridgetop/aidis/run/aidis.pid). Health endpoints active on port 8081. MCP debug logging enabled.",
        type: 'decision',
        tags: ['oracle-consultation', 'enterprise-architecture', 'stability-hardening', 'process-management'],
        relevanceScore: 9,
        metadata: {
          consultant: 'oracle_ai_advisor',
          diagnosis: 'process_race_conditions',
          solution_implemented: 'singleton_pattern'
        }
      },
      {
        content: "AIDIS OPERATIONAL STATUS: 37 MCP tools fully functional, database aidis_dev with 13 projects and 40+ contexts. Local embeddings with Transformers.js providing zero-cost semantic search. Multi-project coordination ready for continued development.",
        type: 'completion',
        tags: ['operational-status', 'mcp-tools', 'database-health', 'semantic-search'],
        relevanceScore: 8,
        metadata: {
          tools_count: 37,
          database: 'aidis_dev',
          projects_count: 13,
          embedding_model: 'local_transformers_js'
        }
      }
    ];

    // Store each context
    for (let i = 0; i < contexts.length; i++) {
      const context = contexts[i];
      console.log(`📝 Storing context ${i + 1}/${contexts.length}: ${context.type}`);
      console.log(`   Content: "${context.content.substring(0, 60)}..."`);

      // Generate embedding
      console.log('🔮 Generating embedding...');
      const result = await embeddingService.generateEmbedding(context.content);
      const embedding = result.embedding;
      
      // Insert context
      await db.query(`
        INSERT INTO contexts (
          project_id, content, type, tags, relevance_score, 
          metadata, embedding, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      `, [
        projectId,
        context.content,
        context.type,
        context.tags,
        context.relevanceScore,
        context.metadata,
        `[${embedding.join(',')}]`
      ]);

      console.log('✅ Context stored successfully\n');
    }

    console.log('🎉 Session context updated in AIDIS!');
    console.log('📊 Added 4 context entries to aidis-bootstrap project');
    console.log('🔍 All contexts are now searchable via semantic similarity');

  } catch (error) {
    console.error('❌ Failed to update session context:', error);
    process.exit(1);
  } finally {
    await closeDatabase();
  }
}

updateSessionContext();
