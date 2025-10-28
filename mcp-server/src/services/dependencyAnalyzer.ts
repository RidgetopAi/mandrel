/**
 * Dependency Analyzer Service
 *
 * Wraps Madge to provide dependency analysis capabilities:
 * - Generate dependency graphs (SVG/PNG)
 * - Detect circular dependencies
 * - Find orphan and leaf modules
 * - Export dependency data as JSON
 */

import madge from 'madge';
import { promises as fs } from 'fs';
import path from 'path';

export interface DependencyAnalysisOptions {
  targetPath: string;
  extensions?: string[];
  tsConfig?: string;
  excludePattern?: string;
  baseDir?: string;
}

export interface DependencyAnalysisResult {
  summary: {
    fileCount: number;
    dependencyCount: number;
    circularCount: number;
    orphanCount: number;
    leafCount: number;
    analysisTime: number;
  };
  files: {
    [fileName: string]: number; // fileName -> dependency count
  };
  circular: string[][];
  orphans: string[];
  leaves: string[];
  graphPath?: string;
  jsonPath?: string;
}

export interface CircularDependency {
  chain: string[];
  length: number;
}

export interface GraphGenerationOptions {
  targetPath: string;
  outputPath: string;
  format: 'svg' | 'png' | 'dot';
  layout?: 'dot' | 'neato' | 'fdp' | 'sfdp' | 'twopi' | 'circo';
  extensions?: string[];
  tsConfig?: string;
}

export class DependencyAnalyzerService {
  private static instance: DependencyAnalyzerService;
  private visualizationsDir: string;

  private constructor() {
    // Default visualizations directory
    this.visualizationsDir = path.join(process.cwd(), '../run/visualizations/dependencies');
  }

  static getInstance(): DependencyAnalyzerService {
    if (!DependencyAnalyzerService.instance) {
      DependencyAnalyzerService.instance = new DependencyAnalyzerService();
    }
    return DependencyAnalyzerService.instance;
  }

  /**
   * Set custom visualizations directory
   */
  setVisualizationsDir(dir: string): void {
    this.visualizationsDir = dir;
  }

  /**
   * Ensure visualizations directory exists
   */
  private async ensureVisualizationsDir(): Promise<void> {
    try {
      await fs.mkdir(this.visualizationsDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create visualizations directory:', error);
      throw error;
    }
  }

  /**
   * Perform comprehensive dependency analysis
   */
  async analyzeDependencies(options: DependencyAnalysisOptions): Promise<DependencyAnalysisResult> {
    const startTime = Date.now();

    try {
      // Configure madge options
      const madgeConfig: any = {
        fileExtensions: options.extensions || ['ts', 'js'],
        baseDir: options.baseDir,
      };

      if (options.tsConfig) {
        madgeConfig.tsConfig = options.tsConfig;
      }

      if (options.excludePattern) {
        madgeConfig.excludeRegExp = new RegExp(options.excludePattern);
      }

      // Run madge analysis
      const res = await madge(options.targetPath, madgeConfig);

      // Get dependency data
      const dependencyObj = res.obj();
      const fileCount = Object.keys(dependencyObj).length;

      // Calculate total dependencies
      let dependencyCount = 0;
      const files: { [fileName: string]: number } = {};
      for (const [file, deps] of Object.entries(dependencyObj)) {
        const depCount = (deps as string[]).length;
        files[file] = depCount;
        dependencyCount += depCount;
      }

      // Get circular dependencies
      const circular = res.circular();

      // Get orphans (modules no one depends on)
      const orphans = res.orphans() || [];

      // Get leaves (modules with no dependencies)
      const leaves = res.leaves() || [];

      const analysisTime = Date.now() - startTime;

      return {
        summary: {
          fileCount,
          dependencyCount,
          circularCount: circular.length,
          orphanCount: orphans.length,
          leafCount: leaves.length,
          analysisTime,
        },
        files,
        circular,
        orphans,
        leaves,
      };
    } catch (error) {
      console.error('Dependency analysis failed:', error);
      throw new Error(`Dependency analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Detect circular dependencies only
   */
  async detectCircularDependencies(options: DependencyAnalysisOptions): Promise<CircularDependency[]> {
    try {
      const madgeConfig: any = {
        fileExtensions: options.extensions || ['ts', 'js'],
        baseDir: options.baseDir,
      };

      if (options.tsConfig) {
        madgeConfig.tsConfig = options.tsConfig;
      }

      const res = await madge(options.targetPath, madgeConfig);
      const circular = res.circular();

      return circular.map((chain: string[]) => ({
        chain,
        length: chain.length,
      }));
    } catch (error) {
      console.error('Circular dependency detection failed:', error);
      throw new Error(`Circular dependency detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate dependency graph image
   */
  async generateGraph(options: GraphGenerationOptions): Promise<string> {
    await this.ensureVisualizationsDir();

    try {
      const madgeConfig: any = {
        fileExtensions: options.extensions || ['ts', 'js'],
        layout: options.layout || 'dot',
        imageConfig: {
          backgroundColor: '#ffffff',
          nodeColor: '#4a90e2',
          nodeShape: 'box',
          nodeStyle: 'filled',
          noDependencyColor: '#90EE90',
          cyclicNodeColor: '#ff6b6b',
          edgeColor: '#757575',
        },
      };

      if (options.tsConfig) {
        madgeConfig.tsConfig = options.tsConfig;
      }

      const res = await madge(options.targetPath, madgeConfig);

      // Generate image
      await res.image(options.outputPath);

      return options.outputPath;
    } catch (error) {
      console.error('Graph generation failed:', error);
      throw new Error(`Graph generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Export dependency data as JSON
   */
  async exportJSON(options: DependencyAnalysisOptions): Promise<string> {
    await this.ensureVisualizationsDir();

    try {
      const madgeConfig: any = {
        fileExtensions: options.extensions || ['ts', 'js'],
        baseDir: options.baseDir,
      };

      if (options.tsConfig) {
        madgeConfig.tsConfig = options.tsConfig;
      }

      const res = await madge(options.targetPath, madgeConfig);
      const dependencyObj = res.obj();

      // Save to JSON file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const jsonPath = path.join(this.visualizationsDir, `deps-${timestamp}.json`);

      await fs.writeFile(jsonPath, JSON.stringify(dependencyObj, null, 2), 'utf-8');

      return jsonPath;
    } catch (error) {
      console.error('JSON export failed:', error);
      throw new Error(`JSON export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Complete analysis with graph and JSON export
   */
  async analyzeWithOutput(
    analysisOptions: DependencyAnalysisOptions,
    generateGraph: boolean = true,
    exportJSON: boolean = true
  ): Promise<DependencyAnalysisResult> {
    const analysis = await this.analyzeDependencies(analysisOptions);

    if (generateGraph) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const graphPath = path.join(this.visualizationsDir, `deps-graph-${timestamp}.svg`);

      try {
        await this.generateGraph({
          targetPath: analysisOptions.targetPath,
          outputPath: graphPath,
          format: 'svg',
          extensions: analysisOptions.extensions,
          tsConfig: analysisOptions.tsConfig,
        });
        analysis.graphPath = graphPath;
      } catch (error) {
        console.error('Graph generation failed, continuing without graph:', error);
      }
    }

    if (exportJSON) {
      try {
        const jsonPath = await this.exportJSON(analysisOptions);
        analysis.jsonPath = jsonPath;
      } catch (error) {
        console.error('JSON export failed, continuing without JSON:', error);
      }
    }

    return analysis;
  }

  /**
   * Get most complex modules (highest dependency count)
   */
  async getMostComplexModules(
    options: DependencyAnalysisOptions,
    limit: number = 10
  ): Promise<Array<{ file: string; dependencies: number }>> {
    const analysis = await this.analyzeDependencies(options);

    const sorted = Object.entries(analysis.files)
      .map(([file, deps]) => ({ file, dependencies: deps }))
      .sort((a, b) => b.dependencies - a.dependencies)
      .slice(0, limit);

    return sorted;
  }
}

// Export singleton instance
export const dependencyAnalyzerService = DependencyAnalyzerService.getInstance();
