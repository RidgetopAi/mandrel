/**
 * AIDIS Context Handler
 * 
 * This handles all context management operations:
 * - Storing context with automatic embedding generation
 * - Searching context using vector similarity
 * - Managing context metadata and relationships
 * 
 * This is where AI agents store their memories and retrieve them later!
 */

import { db } from '../config/database.js';
import { embeddingService } from '../services/embedding.js';
import { projectHandler } from './project.js';

export interface StoreContextRequest {
  projectId?: string;
  sessionId?: string;
  type: 'code' | 'decision' | 'error' | 'discussion' | 'planning' | 'completion';
  content: string;
  tags?: string[];
  relevanceScore?: number;
  metadata?: Record<string, any>;
}

export interface ContextEntry {
  id: string;
  projectId: string;
  sessionId: string | null;
  contextType: string;
  content: string;
  createdAt: Date;
  relevanceScore: number;
  tags: string[];
  metadata: Record<string, any>;
  embedding?: number[];
}

export interface SearchContextRequest {
  projectId?: string;
  query: string;
  type?: string;
  limit?: number;
  minSimilarity?: number;
  tags?: string[];
}

export interface SearchResult extends ContextEntry {
  similarity?: number;
  searchReason?: string;
}

export class ContextHandler {
  
  /**
   * Store new context with automatic embedding generation
   */
  async storeContext(request: StoreContextRequest): Promise<ContextEntry> {
    console.log(`📝 Storing ${request.type} context: "${request.content.substring(0, 60)}..."`);

    try {
      // Validate required fields
      if (!request.content?.trim()) {
        throw new Error('Context content cannot be empty');
      }

      if (!request.type) {
        throw new Error('Context type is required');
      }

      // Get or create project/session
      const projectId = await this.ensureProjectId(request.projectId);
      const sessionId = await this.ensureSessionId(request.sessionId, projectId);

      // Generate embedding for the content
      console.log('🔮 Generating embedding for context content...');
      const embeddingResult = await embeddingService.generateEmbedding({
        text: request.content
      });

      // Prepare context data
      const contextData = {
        project_id: projectId,
        session_id: sessionId,
        context_type: request.type,
        content: request.content.trim(),
        embedding: JSON.stringify(embeddingResult.embedding), // PostgreSQL vector format
        relevance_score: request.relevanceScore || 5.0,
        tags: request.tags || [],
        metadata: JSON.stringify(request.metadata || {})
      };

      // Insert into database
      const result = await db.query(`
        INSERT INTO contexts (
          project_id, session_id, context_type, content, 
          embedding, relevance_score, tags, metadata
        ) VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8)
        RETURNING id, created_at
      `, [
        contextData.project_id,
        contextData.session_id,
        contextData.context_type,
        contextData.content,
        `[${embeddingResult.embedding.join(',')}]`, // Convert to PostgreSQL vector format
        contextData.relevance_score,
        contextData.tags,
        contextData.metadata
      ]);

      const storedContext: ContextEntry = {
        id: result.rows[0].id,
        projectId: projectId,
        sessionId: sessionId,
        contextType: request.type,
        content: request.content,
        createdAt: result.rows[0].created_at,
        relevanceScore: request.relevanceScore || 5.0,
        tags: request.tags || [],
        metadata: request.metadata || {},
        embedding: embeddingResult.embedding
      };

      console.log(`✅ Context stored successfully! ID: ${storedContext.id}`);
      console.log(`🔍 Embedding: ${embeddingResult.dimensions}D vector (${embeddingResult.model})`);
      console.log(`🏷️  Tags: [${storedContext.tags.join(', ')}]`);
      
      return storedContext;

    } catch (error) {
      console.error('❌ Failed to store context:', error);
      throw new Error(`Context storage failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Search contexts using vector similarity and filters
   */
  async searchContext(request: SearchContextRequest): Promise<SearchResult[]> {
    console.log(`🔍 Searching contexts: "${request.query}"`);

    try {
      // Generate embedding for search query
      const queryEmbedding = await embeddingService.generateEmbedding({
        text: request.query
      });

      // Build search query with filters
      let sql = `
        SELECT 
          id, project_id, session_id, context_type, content,
          created_at, relevance_score, tags, metadata,
          embedding <-> $1::vector as distance
        FROM contexts 
        WHERE 1=1
      `;
      
      const params: any[] = [`[${queryEmbedding.embedding.join(',')}]`];
      let paramIndex = 2;

      // Add filters
      if (request.projectId) {
        sql += ` AND project_id = $${paramIndex}`;
        params.push(request.projectId);
        paramIndex++;
      }

      if (request.type) {
        sql += ` AND context_type = $${paramIndex}`;
        params.push(request.type);
        paramIndex++;
      }

      if (request.tags && request.tags.length > 0) {
        sql += ` AND tags && $${paramIndex}`;
        params.push(request.tags);
        paramIndex++;
      }

      // Order by similarity (distance) and limit results
      sql += ` ORDER BY distance ASC LIMIT $${paramIndex}`;
      params.push(request.limit || 10);

      console.log('🔍 Executing vector similarity search...');
      const result = await db.query(sql, params);

      // Convert results and calculate similarities
      const results: SearchResult[] = result.rows.map(row => {
        const distance = parseFloat(row.distance);
        const similarity = Math.max(0, (1 - distance)) * 100; // Convert distance to similarity percentage
        
        return {
          id: row.id,
          projectId: row.project_id,
          sessionId: row.session_id,
          contextType: row.context_type,
          content: row.content,
          createdAt: row.created_at,
          relevanceScore: row.relevance_score,
          tags: row.tags || [],
          metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
          similarity: Math.round(similarity * 10) / 10, // Round to 1 decimal place
          searchReason: similarity > 70 ? 'High similarity match' :
                       similarity > 40 ? 'Moderate similarity match' :
                       'Low similarity match'
        };
      });

      // Filter by minimum similarity if specified
      const filtered = request.minSimilarity 
        ? results.filter(r => r.similarity! >= request.minSimilarity!)
        : results;

      console.log(`✅ Found ${filtered.length} matching contexts`);
      if (filtered.length > 0) {
        console.log(`🎯 Top match: ${filtered[0].similarity}% similarity - "${filtered[0].content.substring(0, 60)}..."`);
      }

      return filtered;

    } catch (error) {
      console.error('❌ Context search failed:', error);
      throw new Error(`Context search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Ensure we have a valid project ID (get current project or specified project)
   */
  private async ensureProjectId(projectId?: string): Promise<string> {
    if (projectId) {
      // Verify the project exists
      const result = await db.query('SELECT id FROM projects WHERE id = $1', [projectId]);
      if (result.rows.length > 0) {
        return projectId;
      }
      throw new Error(`Project ${projectId} not found`);
    }

    // Use current active project from project handler
    await projectHandler.initializeSession(); // Ensure session is initialized
    const currentProject = await projectHandler.getCurrentProject();
    
    if (currentProject) {
      console.log(`📋 Using current project: ${currentProject.name}`);
      return currentProject.id;
    }

    throw new Error('No current project set. Use project_switch to set an active project or specify a project ID.');
  }

  /**
   * Ensure we have a valid session ID (get current or create new)
   */
  private async ensureSessionId(sessionId?: string, projectId?: string): Promise<string | null> {
    if (sessionId) {
      // Verify the session exists
      const result = await db.query('SELECT id FROM sessions WHERE id = $1', [sessionId]);
      if (result.rows.length > 0) {
        return sessionId;
      }
      throw new Error(`Session ${sessionId} not found`);
    }

    // For now, return null (context can exist without specific session)
    // In the future, we might auto-create sessions or find active ones
    return null;
  }

  /**
   * Get context statistics for a project
   */
  async getContextStats(projectId?: string): Promise<{
    totalContexts: number;
    contextsByType: Record<string, number>;
    recentContexts: number;
    embeddedContexts: number;
  }> {
    const actualProjectId = await this.ensureProjectId(projectId);

    const [total, byType, recent, embedded] = await Promise.all([
      // Total contexts
      db.query('SELECT COUNT(*) as count FROM contexts WHERE project_id = $1', [actualProjectId]),
      
      // Contexts by type
      db.query(`
        SELECT context_type, COUNT(*) as count 
        FROM contexts 
        WHERE project_id = $1 
        GROUP BY context_type
        ORDER BY count DESC
      `, [actualProjectId]),
      
      // Recent contexts (last 24 hours)
      db.query(`
        SELECT COUNT(*) as count 
        FROM contexts 
        WHERE project_id = $1 AND created_at > NOW() - INTERVAL '24 hours'
      `, [actualProjectId]),
      
      // Contexts with embeddings
      db.query(`
        SELECT COUNT(*) as count 
        FROM contexts 
        WHERE project_id = $1 AND embedding IS NOT NULL
      `, [actualProjectId])
    ]);

    const contextsByType: Record<string, number> = {};
    byType.rows.forEach(row => {
      contextsByType[row.context_type] = parseInt(row.count);
    });

    return {
      totalContexts: parseInt(total.rows[0].count),
      contextsByType,
      recentContexts: parseInt(recent.rows[0].count),
      embeddedContexts: parseInt(embedded.rows[0].count)
    };
  }
}

// Export singleton instance
export const contextHandler = new ContextHandler();
