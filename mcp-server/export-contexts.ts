#!/usr/bin/env tsx
/**
 * Export Context Data for 3D Visualization
 *
 * Exports all contexts with 3D coordinates, project info, and embeddings
 * for the Forge Live landing page visualization.
 */

import pkg from 'pg';
const { Pool } = pkg;
import * as fs from 'fs';
import * as path from 'path';

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'aidis_production',
  user: 'ridgetop',
});

interface ContextData {
  id: string;
  project_id: string;
  project_name: string;
  context_type: string;
  content_preview: string;
  created_at: string;
  vector_x: number;
  vector_y: number;
  vector_z: number;
  embedding: number[];
  tags: string[];
}

async function exportContexts() {
  console.log('📊 Exporting context data for visualization...\n');

  try {
    // Fetch all contexts with coordinates and project info
    const result = await pool.query(`
      SELECT
        c.id,
        c.project_id,
        p.name as project_name,
        c.context_type,
        LEFT(c.content, 200) as content_preview,
        c.created_at,
        c.vector_x,
        c.vector_y,
        c.vector_z,
        c.embedding,
        c.tags
      FROM contexts c
      LEFT JOIN projects p ON c.project_id = p.id
      WHERE c.vector_x IS NOT NULL
        AND c.vector_y IS NOT NULL
        AND c.vector_z IS NOT NULL
      ORDER BY c.created_at
    `);

    console.log(`✅ Found ${result.rows.length} contexts with coordinates`);

    // Transform data
    const contexts: ContextData[] = result.rows.map(row => ({
      id: row.id,
      project_id: row.project_id,
      project_name: row.project_name || 'Unknown',
      context_type: row.context_type,
      content_preview: row.content_preview,
      created_at: row.created_at,
      vector_x: parseFloat(row.vector_x),
      vector_y: parseFloat(row.vector_y),
      vector_z: parseFloat(row.vector_z),
      embedding: typeof row.embedding === 'string'
        ? JSON.parse(row.embedding)
        : row.embedding,
      tags: row.tags || [],
    }));

    // Calculate project statistics
    const projectStats = new Map<string, number>();
    contexts.forEach(ctx => {
      const count = projectStats.get(ctx.project_name) || 0;
      projectStats.set(ctx.project_name, count + 1);
    });

    console.log('\n📈 Project Distribution:');
    Array.from(projectStats.entries())
      .sort((a, b) => b[1] - a[1])
      .forEach(([name, count]) => {
        console.log(`   ${name}: ${count}`);
      });

    // Export to JSON
    const outputPath = path.join(process.cwd(), 'forge-web', 'data', 'contexts.json');
    const outputDir = path.dirname(outputPath);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const output = {
      metadata: {
        total_contexts: contexts.length,
        exported_at: new Date().toISOString(),
        projects: Array.from(projectStats.entries()).map(([name, count]) => ({
          name,
          count,
        })),
        coordinate_range: { min: -10, max: 10 },
      },
      contexts,
    };

    fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));

    console.log(`\n✅ Data exported to: ${outputPath}`);
    console.log(`📦 File size: ${(fs.statSync(outputPath).size / 1024 / 1024).toFixed(2)} MB`);

  } catch (error) {
    console.error('❌ Error exporting contexts:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  exportContexts()
    .then(() => {
      console.log('\n🎉 Export complete!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Export failed:', error);
      process.exit(1);
    });
}

export { exportContexts };
