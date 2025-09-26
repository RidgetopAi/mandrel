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
import { logContextEvent, logEvent } from '../middleware/eventLogger.js';
import { SessionTracker, ensureActiveSession } from '../services/sessionTracker.js';

export interface StoreContextRequest {
  projectId?: string;
  sessionId?: string;
  type: 'code' | 'decision' | 'error' | 'discussion' | 'planning' | 'completion' | 'milestone' | 'reflections' | 'handoff';
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
   * Extract meaningful title from content for hybrid embeddings
   */
  private extractTitle(content: string): string {
    const trimmed = content.trim();

    // Look for markdown-style headers or bold text
    const markdownTitleMatch = trimmed.match(/^#{1,6}\s*(.+)|^\*\*(.+?)\*\*/);
    if (markdownTitleMatch) {
      return markdownTitleMatch[1] || markdownTitleMatch[2];
    }

    // Look for lines that look like titles (short first lines)
    const firstLine = trimmed.split('\n')[0];
    if (firstLine && firstLine.length <= 100 && firstLine.length >= 10) {
      // Check if it's likely a title (no punctuation at end except : or -)
      if (!/[.!?]$/.test(firstLine) || /[:-]$/.test(firstLine)) {
        return firstLine;
      }
    }

    // Fall back to first 50 characters
    return trimmed.substring(0, 50).replace(/\s+$/, '');
  }

  /**
   * Store new context with automatic hybrid embedding generation
   * Combines title + tags + type + content for better semantic search
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

      // Create hybrid embedding text combining title, tags, type, and content
      const extractedTitle = this.extractTitle(request.content);
      const embeddingText = [
        `Type: ${request.type}`,
        request.tags?.length ? `Tags: ${request.tags.join(', ')}` : '',
        extractedTitle,
        request.content.substring(0, 1000) // Limit content to avoid dilution
      ].filter(Boolean).join('\n');

      // Generate hybrid embedding
      console.log('🔮 Generating hybrid embedding (title + tags + content)...');
      console.log(`📋 Extracted title: "${extractedTitle}"`);
      const embeddingResult = await embeddingService.generateEmbedding({
        text: embeddingText
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

      console.log(`🔍 DEBUG: About to insert context_type = "${contextData.context_type}" (type: ${typeof contextData.context_type})`);
      console.log(`🔍 DEBUG: context_type length = ${contextData.context_type.length}`);
      console.log(`🔍 DEBUG: context_type char codes = [${Array.from(contextData.context_type).map(c => c.charCodeAt(0)).join(',')}]`);

      // Insert into database
      const sqlQuery = `
        INSERT INTO contexts (
          project_id, session_id, context_type, content, 
          embedding, relevance_score, tags, metadata
        ) VALUES ($1, $2, $3, $4, $5::vector, $6, $7, $8)
        RETURNING id, created_at
      `;
      
      const sqlParams = [
        contextData.project_id,
        contextData.session_id,
        contextData.context_type,
        contextData.content,
        `[${embeddingResult.embedding.join(',')}]`, // Convert to PostgreSQL vector format
        contextData.relevance_score,
        contextData.tags,
        contextData.metadata
      ];

      console.log(`🔍 DEBUG: Executing SQL query with parameters:`);
      console.log(`🔍 DEBUG: SQL: ${sqlQuery.replace(/\s+/g, ' ').trim()}`);
      console.log(`🔍 DEBUG: Param $3 (context_type): "${sqlParams[2]}" (${typeof sqlParams[2]})`);
      
      const result = await db.query(sqlQuery, sqlParams);

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
      
      // Log the context creation event
      await logContextEvent(storedContext.id, 'stored', {
        context_type: storedContext.contextType,
        content_length: storedContext.content.length,
        tags: storedContext.tags,
        relevance_score: storedContext.relevanceScore,
        embedding_model: embeddingResult.model,
        embedding_dimensions: embeddingResult.dimensions
      });
      
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
          1 - (embedding <=> $1::vector) as similarity
        FROM contexts
        WHERE embedding IS NOT NULL
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

      // Order by similarity (highest first) and limit results
      sql += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
      params.push(request.limit || 10);

      console.log('🔍 Executing vector similarity search...');
      const result = await db.query(sql, params);

      // Convert results and calculate similarities with substring boosting
      const results: SearchResult[] = result.rows.map(row => {
        // Handle potential null/undefined similarity values to prevent NaN
        const rawSimilarity = row.similarity;
        let similarity = Math.max(0, (rawSimilarity && !isNaN(parseFloat(rawSimilarity))) ? parseFloat(rawSimilarity) : 0) * 100;

        // Apply substring boosting for exact matches
        const queryLower = request.query.toLowerCase();
        const contentLower = row.content.toLowerCase();
        const tagsLower = (row.tags || []).join(' ').toLowerCase();

        let boost = 0;
        let boostReason = '';

        // +20% boost for content substring matches
        if (contentLower.includes(queryLower)) {
          boost += 20;
          boostReason = 'Content substring match';
        }

        // +15% boost for tag substring matches
        if (tagsLower.includes(queryLower)) {
          boost += 15;
          boostReason = boostReason ? boostReason + ' + Tag substring match' : 'Tag substring match';
        }

        // Apply boost
        if (boost > 0) {
          similarity = Math.min(100, similarity + boost); // Cap at 100%
        }

        const finalSearchReason = boostReason ?
          `${similarity > 70 ? 'High' : similarity > 40 ? 'Moderate' : 'Low'} similarity match (${boostReason})` :
          similarity > 70 ? 'High similarity match' :
          similarity > 40 ? 'Moderate similarity match' :
          'Low similarity match';

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
          searchReason: finalSearchReason
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

      // Log the search event
      await logEvent({
        actor: 'ai',
        event_type: 'context_search',
        payload: {
          query: request.query,
          filters: {
            projectId: request.projectId,
            type: request.type,
            tags: request.tags,
            minSimilarity: request.minSimilarity
          },
          results_count: filtered.length,
          top_similarity: filtered.length > 0 ? filtered[0].similarity : 0
        },
        status: 'closed',
        tags: ['context', 'search']
      });

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

    // Get or create an active session using the SessionTracker
    try {
      const activeSessionId = await ensureActiveSession(projectId);
      console.log(`📋 Using active session: ${activeSessionId.substring(0, 8)}... for context storage`);
      return activeSessionId;
    } catch (error) {
      console.warn('⚠️  Failed to get/create session, storing context without session:', error);
      return null; // Fallback to no session if session tracking fails
    }
  }

  /**
   * Get recent contexts in chronological order (newest first)
   */
  async getRecentContext(projectId?: string, limit: number = 5): Promise<SearchResult[]> {
    console.log(`📋 Getting ${limit} most recent contexts`);

    try {
      // Ensure we have a valid project
      const actualProjectId = await this.ensureProjectId(projectId);

      // Build query to get recent contexts
      const sql = `
        SELECT 
          id, project_id, session_id, context_type, content,
          created_at, relevance_score, tags, metadata
        FROM contexts 
        WHERE project_id = $1
        ORDER BY created_at DESC 
        LIMIT $2
      `;
      
      console.log('🔍 Executing recent contexts query...');
      const result = await db.query(sql, [actualProjectId, limit]);

      // Convert results to SearchResult format (same as searchContext)
      const results: SearchResult[] = result.rows.map(row => ({
        id: row.id,
        projectId: row.project_id,
        sessionId: row.session_id,
        contextType: row.context_type,
        content: row.content,
        createdAt: row.created_at,
        relevanceScore: row.relevance_score,
        tags: row.tags || [],
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
        searchReason: 'Recent context (chronological order)'
      }));

      console.log(`✅ Found ${results.length} recent contexts`);
      if (results.length > 0) {
        console.log(`📅 Most recent: ${results[0].createdAt} - "${results[0].content.substring(0, 60)}..."`);
      }

      return results;

    } catch (error) {
      console.error('❌ Failed to get recent contexts:', error);
      throw new Error(`Recent context retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
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
