import { Pool } from 'pg';
import { db } from '../config/database.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

export interface CodeComponent {
    id: string;
    projectId: string;
    filePath: string;
    componentType: string;
    name: string;
    signature?: string;
    startLine?: number;
    endLine?: number;
    complexityScore: number;
    linesOfCode: number;
    documentation?: string;
    isExported: boolean;
    isDeprecated: boolean;
    tags: string[];
    metadata: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
    analyzedAt: Date;
}

export interface CodeDependency {
    id: string;
    projectId: string;
    fromComponentId: string;
    toComponentId?: string;
    dependencyType: string;
    importPath?: string;
    importAlias?: string;
    isExternal: boolean;
    confidenceScore: number;
    metadata: Record<string, any>;
    createdAt: Date;
}

export interface AnalysisSession {
    id: string;
    projectId: string;
    analyzerAgentId?: string;
    sessionType: string;
    filesAnalyzed: string[];
    componentsFound: number;
    dependenciesFound: number;
    analysisDurationMs?: number;
    status: string;
    errorMessage?: string;
    metadata: Record<string, any>;
    startedAt: Date;
    completedAt?: Date;
}

export class CodeAnalysisHandler {
    constructor(private pool: Pool = db) {}

    async analyzeFile(
        projectId: string,
        filePath: string,
        content?: string,
        forceReanalyze: boolean = false
    ): Promise<{ components: CodeComponent[]; dependencies: CodeDependency[] }> {
        console.log(`🔍 Analyzing file: ${filePath}`);
        
        const client = await this.pool.connect();
        try {
            // Read file content if not provided
            if (!content) {
                try {
                    content = await fs.readFile(filePath, 'utf-8');
                } catch (error) {
                    throw new Error(`Failed to read file ${filePath}: ${error}`);
                }
            }

            // Calculate file hash
            const fileHash = crypto.createHash('sha256').update(content).digest('hex');
            
            // Check cache unless force reanalyze
            if (!forceReanalyze) {
                const cacheResult = await client.query(
                    'SELECT analysis_result FROM file_analysis_cache WHERE project_id = $1 AND file_path = $2 AND file_hash = $3',
                    [projectId, filePath, fileHash]
                );
                
                if (cacheResult.rows.length > 0) {
                    console.log(`✅ Using cached analysis for ${filePath}`);
                    const cached = cacheResult.rows[0].analysis_result;
                    return {
                        components: cached.components || [],
                        dependencies: cached.dependencies || []
                    };
                }
            }

            // Perform analysis
            const analysis = await this.parseFileContent(content, filePath);
            
            // Store components in database
            const components: CodeComponent[] = [];
            for (const comp of analysis.components) {
                // Check if component already exists
                const existingResult = await client.query(
                    'SELECT id FROM code_components WHERE project_id = $1 AND file_path = $2 AND name = $3 AND component_type = $4',
                    [projectId, comp.filePath, comp.name, comp.componentType]
                );

                let result;
                if (existingResult.rows.length > 0) {
                    // Update existing component
                    result = await client.query(`
                        UPDATE code_components SET
                            signature = $5, start_line = $6, end_line = $7, complexity_score = $8,
                            lines_of_code = $9, documentation = $10, is_exported = $11, tags = $12,
                            metadata = $13, updated_at = CURRENT_TIMESTAMP, analyzed_at = CURRENT_TIMESTAMP
                        WHERE project_id = $1 AND file_path = $2 AND name = $3 AND component_type = $4
                        RETURNING id, project_id, file_path, component_type, name, signature, start_line, end_line,
                                  complexity_score, lines_of_code, documentation, is_exported, is_deprecated, tags, metadata,
                                  created_at, updated_at, analyzed_at
                    `, [
                        projectId, comp.filePath, comp.name, comp.componentType, comp.signature,
                        comp.startLine, comp.endLine, comp.complexityScore, comp.linesOfCode,
                        comp.documentation, comp.isExported, comp.tags, comp.metadata
                    ]);
                } else {
                    // Insert new component
                    result = await client.query(`
                        INSERT INTO code_components 
                        (project_id, file_path, component_type, name, signature, start_line, end_line, 
                         complexity_score, lines_of_code, documentation, is_exported, tags, metadata)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                        RETURNING id, project_id, file_path, component_type, name, signature, start_line, end_line,
                                  complexity_score, lines_of_code, documentation, is_exported, is_deprecated, tags, metadata,
                                  created_at, updated_at, analyzed_at
                    `, [
                        projectId, comp.filePath, comp.componentType, comp.name, comp.signature,
                        comp.startLine, comp.endLine, comp.complexityScore, comp.linesOfCode,
                        comp.documentation, comp.isExported, comp.tags, comp.metadata
                    ]);
                }
                
                components.push(this.mapComponent(result.rows[0]));
            }

            // Store dependencies (only for file-level imports for now)
            const dependencies: CodeDependency[] = [];
            
            // For import dependencies, create file-level dependency records
            for (const dep of analysis.dependencies) {
                if (dep.dependencyType === 'import') {
                    // Create a file-level component to represent the file as a whole
                    let fileComponentResult = await client.query(
                        'SELECT id FROM code_components WHERE project_id = $1 AND file_path = $2 AND component_type = $3',
                        [projectId, filePath, 'file']
                    );

                    if (fileComponentResult.rows.length === 0) {
                        fileComponentResult = await client.query(`
                            INSERT INTO code_components 
                            (project_id, file_path, component_type, name, signature, complexity_score, lines_of_code, is_exported, tags, metadata)
                            VALUES ($1, $2, 'file', $3, $4, 1, $5, true, $6, $7)
                            RETURNING id
                        `, [
                            projectId, filePath, path.basename(filePath), 
                            `File: ${path.basename(filePath)}`, analysis.linesOfCode,
                            [analysis.language], { type: 'file_container' }
                        ]);
                    }

                    const fromComponentId = fileComponentResult.rows[0].id;

                    const result = await client.query(`
                        INSERT INTO code_dependencies
                        (project_id, from_component_id, dependency_type, import_path, 
                         import_alias, is_external, confidence_score, metadata)
                        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                        RETURNING id, project_id, from_component_id, to_component_id, dependency_type,
                                  import_path, import_alias, is_external, confidence_score, metadata, created_at
                    `, [
                        projectId, fromComponentId, dep.dependencyType,
                        dep.importPath, dep.importAlias, dep.isExternal, dep.confidenceScore, dep.metadata
                    ]);
                    
                    dependencies.push(this.mapDependency(result.rows[0]));
                }
            }

            // Cache the analysis result
            await client.query(`
                INSERT INTO file_analysis_cache 
                (project_id, file_path, file_hash, language, analysis_result, components_count, dependencies_count,
                 complexity_total, lines_of_code, last_modified)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP)
                ON CONFLICT (project_id, file_path, file_hash)
                DO UPDATE SET analyzed_at = CURRENT_TIMESTAMP
            `, [
                projectId, filePath, fileHash, analysis.language,
                JSON.stringify({ components, dependencies }),
                components.length, dependencies.length,
                analysis.totalComplexity, analysis.linesOfCode
            ]);

            console.log(`✅ Analyzed ${filePath}: ${components.length} components, ${dependencies.length} dependencies`);
            return { components, dependencies };
        } finally {
            client.release();
        }
    }

    private async parseFileContent(content: string, filePath: string): Promise<{
        components: any[];
        dependencies: any[];
        language: string;
        totalComplexity: number;
        linesOfCode: number;
    }> {
        const ext = path.extname(filePath).toLowerCase();
        const language = this.detectLanguage(ext);
        
        const lines = content.split('\n');
        const linesOfCode = lines.filter(line => line.trim() && !line.trim().startsWith('//')).length;
        
        const components: any[] = [];
        const dependencies: any[] = [];
        let totalComplexity = 0;

        // Simple regex-based parsing (could be enhanced with proper AST parsing)
        if (language === 'typescript' || language === 'javascript') {
            // Extract functions
            const functionRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\([^)]*\)|(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/g;
            let match;
            while ((match = functionRegex.exec(content)) !== null) {
                const name = match[1] || match[2];
                const startLine = content.substring(0, match.index).split('\n').length;
                const isExported = match[0].includes('export');
                
                components.push({
                    filePath,
                    componentType: 'function',
                    name,
                    signature: match[0],
                    startLine,
                    endLine: startLine + 5, // Estimate
                    complexityScore: this.estimateComplexity(match[0]),
                    linesOfCode: 5, // Estimate
                    isExported,
                    tags: [language],
                    metadata: { parsed_by: 'regex' }
                });
                totalComplexity += this.estimateComplexity(match[0]);
            }

            // Extract classes
            const classRegex = /(?:export\s+)?(?:abstract\s+)?class\s+(\w+)(?:\s+extends\s+\w+)?(?:\s+implements\s+[\w,\s]+)?/g;
            while ((match = classRegex.exec(content)) !== null) {
                const name = match[1];
                const startLine = content.substring(0, match.index).split('\n').length;
                const isExported = match[0].includes('export');
                
                components.push({
                    filePath,
                    componentType: 'class',
                    name,
                    signature: match[0],
                    startLine,
                    endLine: startLine + 20, // Estimate
                    complexityScore: 3,
                    linesOfCode: 20,
                    isExported,
                    tags: [language, 'class'],
                    metadata: { parsed_by: 'regex' }
                });
                totalComplexity += 3;
            }

            // Extract interfaces  
            const interfaceRegex = /(?:export\s+)?interface\s+(\w+)/g;
            while ((match = interfaceRegex.exec(content)) !== null) {
                const name = match[1];
                const startLine = content.substring(0, match.index).split('\n').length;
                const isExported = match[0].includes('export');
                
                components.push({
                    filePath,
                    componentType: 'interface',
                    name,
                    signature: match[0],
                    startLine,
                    endLine: startLine + 10,
                    complexityScore: 1,
                    linesOfCode: 10,
                    isExported,
                    tags: [language, 'interface'],
                    metadata: { parsed_by: 'regex' }
                });
            }

            // Extract imports for dependencies
            const importRegex = /import\s+(?:{[^}]+}|\w+|\*\s+as\s+\w+)\s+from\s+['"]([^'"]+)['"]/g;
            while ((match = importRegex.exec(content)) !== null) {
                const importPath = match[1];
                const isExternal = !importPath.startsWith('.') && !importPath.startsWith('/');
                
                dependencies.push({
                    fromComponentId: null, // Will be resolved later
                    toComponentId: null,
                    dependencyType: 'import',
                    importPath,
                    isExternal,
                    confidenceScore: 1.0,
                    metadata: { 
                        full_import: match[0],
                        parsed_by: 'regex'
                    }
                });
            }
        }

        return {
            components,
            dependencies,
            language,
            totalComplexity,
            linesOfCode
        };
    }

    private detectLanguage(extension: string): string {
        const langMap: Record<string, string> = {
            '.ts': 'typescript',
            '.tsx': 'typescript',
            '.js': 'javascript', 
            '.jsx': 'javascript',
            '.py': 'python',
            '.go': 'go',
            '.rs': 'rust',
            '.java': 'java',
            '.cpp': 'cpp',
            '.c': 'c',
            '.cs': 'csharp'
        };
        return langMap[extension] || 'unknown';
    }

    private estimateComplexity(code: string): number {
        let complexity = 1; // Base complexity
        
        // Add complexity for control structures
        complexity += (code.match(/\b(if|for|while|switch|catch)\b/g) || []).length;
        complexity += (code.match(/&&|\|\|/g) || []).length;
        
        return complexity;
    }

    async getProjectComponents(
        projectId: string,
        componentType?: string,
        filePath?: string
    ): Promise<CodeComponent[]> {
        console.log(`📋 Getting components for project ${projectId}`);
        
        const client = await this.pool.connect();
        try {
            let query = `SELECT id, project_id, file_path, component_type, name, signature, start_line, end_line,
                               complexity_score, lines_of_code, documentation, is_exported, is_deprecated, tags, metadata,
                               created_at, updated_at, analyzed_at
                        FROM code_components WHERE project_id = $1`;
            const params: any[] = [projectId];
            let paramIndex = 2;

            if (componentType) {
                query += ` AND component_type = $${paramIndex}`;
                params.push(componentType);
                paramIndex++;
            }

            if (filePath) {
                query += ` AND file_path = $${paramIndex}`;
                params.push(filePath);
                paramIndex++;
            }

            query += ` ORDER BY file_path, start_line`;
            
            const result = await client.query(query, params);
            console.log(`✅ Found ${result.rows.length} components`);
            return result.rows.map(row => this.mapComponent(row));
        } finally {
            client.release();
        }
    }

    async getComponentDependencies(componentId: string): Promise<CodeDependency[]> {
        console.log(`🔗 Getting dependencies for component ${componentId}`);
        
        const client = await this.pool.connect();
        try {
            const result = await client.query(`
                SELECT id, project_id, from_component_id, to_component_id, dependency_type,
                       import_path, import_alias, is_external, confidence_score, metadata, created_at
                FROM code_dependencies 
                WHERE from_component_id = $1
                ORDER BY dependency_type, import_path
            `, [componentId]);
            
            console.log(`✅ Found ${result.rows.length} dependencies`);
            return result.rows.map(row => this.mapDependency(row));
        } finally {
            client.release();
        }
    }

    async analyzeImpact(
        projectId: string,
        componentId: string
    ): Promise<{ dependents: any[]; impactScore: number }> {
        console.log(`📊 Analyzing impact for component ${componentId}`);
        
        const client = await this.pool.connect();
        try {
            // Find all components that depend on this one
            const dependentsResult = await client.query(`
                SELECT 
                    c.id, c.name, c.file_path, c.component_type,
                    d.dependency_type, d.confidence_score
                FROM code_dependencies d
                JOIN code_components c ON d.from_component_id = c.id
                WHERE d.to_component_id = $1
                ORDER BY d.confidence_score DESC, c.name
            `, [componentId]);

            const dependents = dependentsResult.rows;
            
            // Calculate impact score based on:
            // - Number of dependents (weight: 2)
            // - Complexity of dependents (weight: 1.5) 
            // - Export status (weight: 1)
            const baseScore = dependents.length * 2;
            
            const complexityBonus = dependents.reduce((sum, dep) => {
                return sum + (dep.complexity_score || 1) * 0.5;
            }, 0);

            // Check if component is exported (affects external impact)
            const componentResult = await client.query(
                'SELECT is_exported, complexity_score FROM code_components WHERE id = $1',
                [componentId]
            );
            
            const isExported = componentResult.rows[0]?.is_exported || false;
            const exportBonus = isExported ? 5 : 0;
            
            const impactScore = Math.round(baseScore + complexityBonus + exportBonus);

            console.log(`✅ Impact analysis: ${dependents.length} dependents, score: ${impactScore}`);
            
            return {
                dependents,
                impactScore
            };
        } finally {
            client.release();
        }
    }

    async getProjectAnalysisStats(projectId: string): Promise<any> {
        console.log(`📊 Getting code analysis stats for project ${projectId}`);
        
        const client = await this.pool.connect();
        try {
            const [componentsResult, dependenciesResult, filesResult, complexityResult] = await Promise.all([
                client.query('SELECT component_type, COUNT(*) as count FROM code_components WHERE project_id = $1 GROUP BY component_type', [projectId]),
                client.query('SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_external = true) as external FROM code_dependencies WHERE project_id = $1', [projectId]),
                client.query('SELECT COUNT(DISTINCT file_path) as file_count FROM code_components WHERE project_id = $1', [projectId]),
                client.query('SELECT AVG(complexity_score) as avg_complexity, MAX(complexity_score) as max_complexity, SUM(lines_of_code) as total_loc FROM code_components WHERE project_id = $1', [projectId])
            ]);

            const componentsByType = componentsResult.rows.reduce((acc, row) => {
                acc[row.component_type] = parseInt(row.count);
                return acc;
            }, {});

            const deps = dependenciesResult.rows[0];
            const files = filesResult.rows[0];
            const complexity = complexityResult.rows[0];

            return {
                totalComponents: Object.values(componentsByType).reduce((a: any, b: any) => a + b, 0),
                componentsByType,
                totalDependencies: parseInt(deps.total) || 0,
                externalDependencies: parseInt(deps.external) || 0,
                filesAnalyzed: parseInt(files.file_count) || 0,
                averageComplexity: parseFloat(complexity.avg_complexity) || 0,
                maxComplexity: parseInt(complexity.max_complexity) || 0,
                totalLinesOfCode: parseInt(complexity.total_loc) || 0
            };
        } finally {
            client.release();
        }
    }

    private mapComponent(row: any): CodeComponent {
        return {
            id: row.id,
            projectId: row.project_id,
            filePath: row.file_path,
            componentType: row.component_type,
            name: row.name,
            signature: row.signature,
            startLine: row.start_line,
            endLine: row.end_line,
            complexityScore: row.complexity_score,
            linesOfCode: row.lines_of_code,
            documentation: row.documentation,
            isExported: row.is_exported,
            isDeprecated: row.is_deprecated,
            tags: row.tags || [],
            metadata: row.metadata || {},
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            analyzedAt: row.analyzed_at
        };
    }

    private mapDependency(row: any): CodeDependency {
        return {
            id: row.id,
            projectId: row.project_id,
            fromComponentId: row.from_component_id,
            toComponentId: row.to_component_id,
            dependencyType: row.dependency_type,
            importPath: row.import_path,
            importAlias: row.import_alias,
            isExternal: row.is_external,
            confidenceScore: row.confidence_score,
            metadata: row.metadata || {},
            createdAt: row.created_at
        };
    }
}

// Export singleton instance
export const codeAnalysisHandler = new CodeAnalysisHandler();
