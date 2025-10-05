import { Pool } from 'pg';
import { db } from '../config/database.js';
import { contextHandler } from './context.js';
import { namingHandler } from './naming.js';
import { decisionsHandler } from './decisions.js';
import { codeAnalysisHandler } from './codeAnalysis.js';

export interface SmartSearchResult {
    type: 'context' | 'component' | 'decision' | 'naming' | 'task' | 'agent';
    id: string;
    title: string;
    summary: string;
    relevanceScore: number;
    metadata: Record<string, any>;
    source: string;
}

export interface Recommendation {
    type: 'naming' | 'pattern' | 'decision' | 'refactor' | 'task';
    title: string;
    description: string;
    confidence: number;
    actionable: boolean;
    references: string[];
    metadata: Record<string, any>;
}

export class SmartSearchHandler {
    constructor(private pool: Pool = db) {}

    async smartSearch(
        projectId: string,
        query: string,
        includeTypes: string[] = ['context', 'component', 'decision', 'naming'],
        limit: number = 10
    ): Promise<SmartSearchResult[]> {
        console.log(`🔍 Smart search for: "${query}" in project ${projectId}`);
        console.log(`📋 Include types: [${includeTypes.join(', ')}]`);
        console.log(`🎯 Limit: ${limit}`);
        
        const results: SmartSearchResult[] = [];

        try {
            // Search contexts using semantic search
            if (includeTypes.includes('context')) {
                console.log(`🔍 Searching contexts...`);
                const contextLimit = Math.ceil(limit / 2);
                console.log(`📊 Context search limit: ${contextLimit}`);
                
                const contextResults = await contextHandler.searchContext({
                    projectId,
                    query, 
                    limit: contextLimit
                });
                
                console.log(`📝 Context search returned ${contextResults.length} results`);
                
                for (const context of contextResults) {
                    console.log(`   - Context ${context.id}: similarity=${context.similarity}%, type=${context.contextType}`);

                    // Improved relevance scoring with fallback
                    let relevanceScore = (context.similarity || 0) / 100;

                    // If semantic similarity is 0, use text matching as fallback
                    if (relevanceScore === 0) {
                        const content = context.content.toLowerCase();
                        const queryLower = query.toLowerCase();
                        const queryWords = queryLower.split(/\s+/);

                        // Calculate text-based relevance
                        let textRelevance = 0;
                        for (const word of queryWords) {
                            if (content.includes(word)) {
                                textRelevance += 0.2; // Each matching word adds 20%
                            }
                        }

                        // Boost for exact phrase matches
                        if (content.includes(queryLower)) {
                            textRelevance += 0.3;
                        }

                        // Boost based on context type relevance
                        const typeBoost = context.contextType === 'planning' || context.contextType === 'decision' ? 0.2 : 0.1;

                        relevanceScore = Math.min(0.8, textRelevance + typeBoost); // Cap at 80% for text matching
                    }

                    results.push({
                        type: 'context',
                        id: context.id,
                        title: `${context.contextType.toUpperCase()}: ${context.content.substring(0, 60)}...`,
                        summary: context.content,
                        relevanceScore,
                        metadata: {
                            tags: context.tags,
                            type: context.contextType,
                            createdAt: context.createdAt
                        },
                        source: relevanceScore > 0.8 ? 'semantic_search' : 'text_matching'
                    });
                }
                console.log(`✅ Added ${contextResults.length} context results to smart search`);
            } else {
                console.log(`⏭️  Skipping context search (not in includeTypes)`);
            }

            // Search technical decisions
            if (includeTypes.includes('decision')) {
                console.log(`🎯 Searching decisions...`);
                const decisionLimit = Math.ceil(limit / 4);
                console.log(`📊 Decision search limit: ${decisionLimit}`);
                
                const decisions = await decisionsHandler.searchDecisions({
                    projectId,
                    query,
                    limit: decisionLimit
                });
                
                console.log(`🎯 Decision search returned ${decisions.length} results`);
                
                for (const decision of decisions) {
                    console.log(`   - Decision ${decision.id}: ${decision.title}`);

                    // Calculate decision relevance based on content matching
                    const title = decision.title.toLowerCase();
                    const description = decision.description.toLowerCase();
                    const queryLower = query.toLowerCase();
                    const queryWords = queryLower.split(/\s+/);

                    let relevanceScore = 0.6; // Base score for decisions

                    // Boost for matching words in title (more important)
                    for (const word of queryWords) {
                        if (title.includes(word)) {
                            relevanceScore += 0.15;
                        }
                        if (description.includes(word)) {
                            relevanceScore += 0.05;
                        }
                    }

                    // Boost for exact query matches
                    if (title.includes(queryLower)) {
                        relevanceScore += 0.2;
                    }

                    // Cap at 95% for decisions
                    relevanceScore = Math.min(0.95, relevanceScore);

                    results.push({
                        type: 'decision',
                        id: decision.id,
                        title: `DECISION: ${decision.title}`,
                        summary: decision.description,
                        relevanceScore,
                        metadata: {
                            decisionType: decision.decisionType,
                            impactLevel: decision.impactLevel,
                            tags: decision.tags
                        },
                        source: 'decision_search'
                    });
                }
                console.log(`✅ Added ${decisions.length} decision results to smart search`);
            } else {
                console.log(`⏭️  Skipping decision search (not in includeTypes)`);
            }

            // Search naming registry
            if (includeTypes.includes('naming')) {
                const client = await this.pool.connect();
                try {
                    const namingResult = await client.query(`
                        SELECT canonical_name, entity_type, description, naming_convention
                        FROM naming_registry
                        WHERE project_id = $1 AND (
                            canonical_name ILIKE $2 OR
                            description ILIKE $2 OR
                            $2 = ANY(context_tags)
                        )
                        LIMIT $3
                    `, [projectId, `%${query}%`, Math.ceil(limit / 4)]);

                    for (const naming of namingResult.rows) {
                        // Calculate naming relevance based on match quality
                        const nameLower = naming.canonical_name.toLowerCase();
                        const descLower = (naming.description || '').toLowerCase();
                        const queryLower = query.toLowerCase();
                        const queryWords = queryLower.split(/\s+/);

                        let relevanceScore = 0.4; // Base score for naming matches

                        // Boost for exact name matches (highest priority)
                        if (nameLower === queryLower) {
                            relevanceScore = 0.95;
                        } else if (nameLower.includes(queryLower)) {
                            relevanceScore += 0.3;
                        } else {
                            // Partial word matches in name
                            for (const word of queryWords) {
                                if (nameLower.includes(word)) {
                                    relevanceScore += 0.1;
                                }
                                if (descLower.includes(word)) {
                                    relevanceScore += 0.05;
                                }
                            }
                        }

                        results.push({
                            type: 'naming',
                            id: naming.canonical_name,
                            title: `NAME: ${naming.canonical_name}`,
                            summary: naming.description || `${naming.entity_type} name`,
                            relevanceScore: Math.min(0.95, relevanceScore),
                            metadata: {
                                entityType: naming.entity_type,
                                namingConvention: naming.naming_convention
                            },
                            source: 'naming_registry'
                        });
                    }
                } finally {
                    client.release();
                }
            }

            // Search code components
            if (includeTypes.includes('component')) {
                const client = await this.pool.connect();
                try {
                    const componentResult = await client.query(`
                        SELECT id, name, component_type, file_path, signature, complexity_score, documentation
                        FROM code_components 
                        WHERE project_id = $1 AND (
                            name ILIKE $2 OR
                            signature ILIKE $2 OR
                            documentation ILIKE $2 OR
                            $2 = ANY(tags)
                        )
                        ORDER BY complexity_score DESC
                        LIMIT $3
                    `, [projectId, `%${query}%`, Math.ceil(limit / 4)]);

                    for (const component of componentResult.rows) {
                        results.push({
                            type: 'component',
                            id: component.id,
                            title: `CODE: ${component.name} (${component.component_type})`,
                            summary: component.documentation || component.signature || `${component.component_type} in ${component.file_path}`,
                            relevanceScore: Math.min(component.complexity_score / 10, 1.0),
                            metadata: {
                                componentType: component.component_type,
                                filePath: component.file_path,
                                complexity: component.complexity_score
                            },
                            source: 'code_analysis'
                        });
                    }
                } finally {
                    client.release();
                }
            }
        } catch (error) {
            console.error('❌ Error in smart search:', error);
        }

        console.log(`📊 Total results before sorting: ${results.length}`);
        results.forEach((result, index) => {
            console.log(`   ${index + 1}. [${result.type}] ${result.title.substring(0, 50)}... (score: ${result.relevanceScore})`);
        });

        // Sort by relevance score and limit
        results.sort((a, b) => b.relevanceScore - a.relevanceScore);
        const limitedResults = results.slice(0, limit);
        
        console.log(`✅ Smart search found ${limitedResults.length} final results (after sorting and limiting)`);
        limitedResults.forEach((result, index) => {
            console.log(`   ${index + 1}. [${result.type}] ${result.title.substring(0, 50)}... (score: ${result.relevanceScore})`);
        });
        
        return limitedResults;
    }

    async getRecommendations(
        projectId: string,
        context: string,
        type: 'naming' | 'implementation' | 'architecture' | 'testing' = 'implementation'
    ): Promise<Recommendation[]> {
        console.log(`💡 Generating ${type} recommendations for project ${projectId}`);
        
        const recommendations: Recommendation[] = [];

        try {
            if (type === 'naming' || type === 'implementation') {
                // Naming recommendations based on existing patterns
                const suggestedNames = await namingHandler.suggestNames({
                    projectId,
                    entityType: 'function',
                    description: context
                });
                for (const suggestion of suggestedNames) {
                    recommendations.push({
                        type: 'naming',
                        title: `Use consistent naming: ${suggestion.suggestedName}`,
                        description: suggestion.explanation,
                        confidence: suggestion.confidence,
                        actionable: true,
                        references: suggestion.similarExamples,
                        metadata: { 
                            entityType: 'function',
                            pattern: suggestion.suggestedName 
                        }
                    });
                }
            }

            if (type === 'implementation' || type === 'architecture') {
                // Find similar implementations using semantic search
                const similarContexts = await contextHandler.searchContext({
                    projectId,
                    query: context, 
                    limit: 3
                });
                for (const ctx of similarContexts) {
                    if (ctx.contextType === 'code' && ctx.similarity && ctx.similarity > 0.7) {
                        recommendations.push({
                            type: 'pattern',
                            title: `Consider similar implementation pattern`,
                            description: `Found similar code: ${ctx.content.substring(0, 100)}...`,
                            confidence: ctx.similarity,
                            actionable: true,
                            references: [ctx.id],
                            metadata: {
                                contextType: ctx.contextType,
                                tags: ctx.tags
                            }
                        });
                    }
                }

                // Architecture recommendations from decisions
                const archDecisions = await decisionsHandler.searchDecisions({
                    projectId,
                    decisionType: 'architecture',
                    limit: 2
                });

                for (const decision of archDecisions) {
                    recommendations.push({
                        type: 'decision',
                        title: `Follow architecture decision: ${decision.title}`,
                        description: decision.rationale,
                        confidence: 0.9,
                        actionable: true,
                        references: [decision.id],
                        metadata: {
                            impactLevel: decision.impactLevel,
                            components: decision.affectedComponents
                        }
                    });
                }
            }

            if (type === 'testing') {
                // Find components that might need testing
                const client = await this.pool.connect();
                try {
                    const untested = await client.query(`
                        SELECT name, component_type, complexity_score, file_path
                        FROM code_components 
                        WHERE project_id = $1 AND is_exported = true 
                        AND complexity_score > 2
                        ORDER BY complexity_score DESC
                        LIMIT 3
                    `, [projectId]);

                    for (const component of untested.rows) {
                        recommendations.push({
                            type: 'task',
                            title: `Add tests for complex component: ${component.name}`,
                            description: `${component.component_type} has complexity score ${component.complexity_score} and should have comprehensive tests`,
                            confidence: Math.min(component.complexity_score / 5, 1.0),
                            actionable: true,
                            references: [],
                            metadata: {
                                componentType: component.component_type,
                                filePath: component.file_path,
                                complexity: component.complexity_score
                            }
                        });
                    }
                } finally {
                    client.release();
                }
            }
        } catch (error) {
            console.error('Error generating recommendations:', error);
        }

        recommendations.sort((a, b) => b.confidence - a.confidence);
        console.log(`✅ Generated ${recommendations.length} recommendations`);
        return recommendations;
    }

    async getProjectInsights(projectId: string): Promise<any> {
        console.log(`🔍 Analyzing project insights for ${projectId}`);
        
        const client = await this.pool.connect();
        try {
            // Get high-level project metrics
            const [codeStats, contextStats, decisionStats, taskStats] = await Promise.all([
                codeAnalysisHandler.getProjectAnalysisStats(projectId),
                this.getContextInsights(projectId),
                this.getDecisionInsights(projectId),
                this.getTaskInsights(projectId)
            ]);

            // Generate insights
            const insights = {
                codeHealth: this.assessCodeHealth(codeStats),
                knowledgeGaps: this.identifyKnowledgeGaps(contextStats),
                decisionGaps: this.identifyDecisionGaps(decisionStats),
                teamEfficiency: this.assessTeamEfficiency(taskStats),
                recommendations: await this.getRecommendations(projectId, 'project overview', 'architecture')
            };

            return {
                projectId,
                generatedAt: new Date(),
                codeStats,
                contextStats,
                decisionStats,
                taskStats,
                insights
            };
        } finally {
            client.release();
        }
    }

    private async getContextInsights(projectId: string): Promise<any> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT 
                    context_type as type,
                    COUNT(*) as count,
                    AVG(relevance_score) as avg_relevance
                FROM contexts 
                WHERE project_id = $1 
                GROUP BY context_type
            `, [projectId]);
            
            return result.rows.reduce((acc, row) => {
                acc[row.type] = {
                    count: parseInt(row.count),
                    avgRelevance: parseFloat(row.avg_relevance)
                };
                return acc;
            }, {});
        } finally {
            client.release();
        }
    }

    private async getDecisionInsights(projectId: string): Promise<any> {
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT 
                    decision_type,
                    impact_level,
                    COUNT(*) as count
                FROM technical_decisions 
                WHERE project_id = $1 
                GROUP BY decision_type, impact_level
            `, [projectId]);
            
            return {
                total: result.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
                byType: result.rows.reduce((acc, row) => {
                    if (!acc[row.decision_type]) acc[row.decision_type] = {};
                    acc[row.decision_type][row.impact_level] = parseInt(row.count);
                    return acc;
                }, {})
            };
        } finally {
            client.release();
        }
    }

    private async getTaskInsights(projectId: string): Promise<any> {
        const client = await this.pool.connect();
        try {
            // Check if agent_tasks table exists before querying
            const tableCheck = await client.query(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'agent_tasks'
                );
            `);
            
            if (!tableCheck.rows[0].exists) {
                // Return empty task insights if table doesn't exist
                return {
                    total: 0,
                    byStatus: {}
                };
            }
            
            const result = await client.query(`
                SELECT 
                    status,
                    priority,
                    COUNT(*) as count
                FROM agent_tasks 
                WHERE project_id = $1 
                GROUP BY status, priority
            `, [projectId]);
            
            return {
                total: result.rows.reduce((sum, row) => sum + parseInt(row.count), 0),
                byStatus: result.rows.reduce((acc, row) => {
                    if (!acc[row.status]) acc[row.status] = {};
                    acc[row.status][row.priority] = parseInt(row.count);
                    return acc;
                }, {})
            };
        } finally {
            client.release();
        }
    }

    private assessCodeHealth(codeStats: any): any {
        const avgComplexity = codeStats.averageComplexity || 0;
        const maxComplexity = codeStats.maxComplexity || 0;
        const totalComponents = codeStats.totalComponents || 0;
        
        return {
            score: Math.max(0, Math.min(100, 100 - (avgComplexity * 10) - (maxComplexity > 8 ? 20 : 0))),
            level: avgComplexity < 3 ? 'healthy' : avgComplexity < 5 ? 'moderate' : 'needs_attention',
            issues: [
                ...(avgComplexity > 5 ? ['High average complexity'] : []),
                ...(maxComplexity > 8 ? ['Very complex components exist'] : []),
                ...(totalComponents === 0 ? ['No code analyzed yet'] : [])
            ]
        };
    }

    private identifyKnowledgeGaps(contextStats: any): string[] {
        const gaps = [];
        
        if (!contextStats.error || contextStats.error.count < 2) {
            gaps.push('Limited error context - consider documenting more troubleshooting scenarios');
        }
        
        if (!contextStats.decision || contextStats.decision.count < 3) {
            gaps.push('Few decisions documented - record more architectural choices');
        }
        
        if (!contextStats.planning || contextStats.planning.count < 2) {
            gaps.push('Limited planning context - document more project planning decisions');
        }
        
        return gaps;
    }

    private identifyDecisionGaps(decisionStats: any): string[] {
        const gaps = [];
        
        if (decisionStats.total < 5) {
            gaps.push('Low decision count - consider documenting more technical choices');
        }
        
        if (!decisionStats.byType.architecture) {
            gaps.push('No architecture decisions recorded - document system design choices');
        }
        
        if (!decisionStats.byType.technology) {
            gaps.push('No technology decisions recorded - document library and framework choices');
        }
        
        return gaps;
    }

    private assessTeamEfficiency(taskStats: any): any {
        if (taskStats.total === 0) {
            return {
                score: 0,
                level: 'no_data',
                issues: ['No tasks created yet']
            };
        }

        const completed = taskStats.byStatus.completed || {};

        const completedCount = Object.values(completed).reduce((a: any, b: any) => a + b, 0) as number;
        const totalCount = taskStats.total;
        const completionRate = completedCount / totalCount;
        
        return {
            score: Math.round(completionRate * 100),
            level: completionRate > 0.7 ? 'efficient' : completionRate > 0.4 ? 'moderate' : 'needs_improvement',
            completionRate,
            totalTasks: totalCount,
            completedTasks: completedCount
        };
    }
}

// Export singleton instance
export const smartSearchHandler = new SmartSearchHandler();
