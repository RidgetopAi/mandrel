/**
 * AI Effectiveness Analytics Handler
 * Measures AI vs human productivity, adoption rates, and cost efficiency
 */

import { database } from '../database/database';

interface AIEffectivenessResponse {
  adoptionRate: number;
  productivityGain: number;
  costEfficiency: number;
  modelPerformance: Record<string, {
    avgResponseTime: number;
    successRate: number;
    avgTokens: number;
    costPer1K: number;
  }>;
}

interface AdoptionData {
  ai_events: number;
  total_events: number;
}

interface ProductivityData {
  actor: string;
  median_duration: number;
}

interface CostData {
  total_tokens: number;
  successful_outcomes: number;
}

interface ModelPerformance {
  ai_model_used: string;
  avg_response_time: number;
  avg_tokens: number;
  success_rate: number;
}

/**
 * Get AI effectiveness analytics
 */
export async function getAIEffectiveness(): Promise<AIEffectivenessResponse> {
  try {
    // Calculate AI adoption rate
    const adoptionRate = await calculateAdoptionRate();
    
    // Calculate productivity gain (AI vs human)
    const productivityGain = await calculateProductivityGain();
    
    // Calculate cost efficiency 
    const costEfficiency = await calculateCostEfficiency();
    
    // Get model performance comparison
    const modelPerformance = await getModelPerformance();

    return {
      adoptionRate,
      productivityGain,
      costEfficiency,
      modelPerformance
    };

  } catch (error) {
    console.error('Error getting AI effectiveness analytics:', error);
    
    // Return default values for new installations
    return {
      adoptionRate: 0,
      productivityGain: 0,
      costEfficiency: 0,
      modelPerformance: {}
    };
  }
}

/**
 * Calculate AI adoption rate (AI events / total events)
 */
async function calculateAdoptionRate(): Promise<number> {
  try {
    const query = `
      SELECT 
        COUNT(*) FILTER (WHERE actor = 'ai') as ai_events,
        COUNT(*) as total_events
      FROM analytics_events
      WHERE timestamp >= NOW() - INTERVAL '30 days'
    `;

    const result = await database.query(query);
    const data: AdoptionData = result.rows[0];

    if (data.total_events === 0) return 0;
    
    return Math.round((data.ai_events / data.total_events) * 100 * 100) / 100;
  } catch (error) {
    console.error('Error calculating adoption rate:', error);
    return 0;
  }
}

/**
 * Calculate productivity gain (AI vs human performance)
 */
async function calculateProductivityGain(): Promise<number> {
  try {
    const query = `
      SELECT 
        actor,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) as median_duration
      FROM analytics_events 
      WHERE duration_ms IS NOT NULL 
        AND duration_ms > 0
        AND timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY actor
    `;

    const result = await database.query(query);
    const data: ProductivityData[] = result.rows;

    const humanData = data.find(d => d.actor === 'human');
    const aiData = data.find(d => d.actor === 'ai');

    if (!humanData || !aiData) return 0;

    const gain = (humanData.median_duration - aiData.median_duration) / humanData.median_duration * 100;
    return Math.round(gain * 100) / 100;
  } catch (error) {
    console.error('Error calculating productivity gain:', error);
    return 0;
  }
}

/**
 * Calculate cost efficiency (successful outcomes per 1000 tokens)
 */
async function calculateCostEfficiency(): Promise<number> {
  try {
    const query = `
      SELECT 
        SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) as total_tokens,
        COUNT(*) FILTER (WHERE status = 'closed') as successful_outcomes
      FROM analytics_events 
      WHERE actor = 'ai' 
        AND (prompt_tokens > 0 OR completion_tokens > 0)
        AND timestamp >= NOW() - INTERVAL '30 days'
    `;

    const result = await database.query(query);
    const data: CostData = result.rows[0];

    if (data.total_tokens === 0) return 0;
    
    const efficiency = (data.successful_outcomes / data.total_tokens) * 1000;
    return Math.round(efficiency * 100) / 100;
  } catch (error) {
    console.error('Error calculating cost efficiency:', error);
    return 0;
  }
}

/**
 * Get model performance comparison
 */
async function getModelPerformance(): Promise<Record<string, {
  avgResponseTime: number;
  successRate: number;
  avgTokens: number;
  costPer1K: number;
}>> {
  try {
    const query = `
      SELECT 
        ai_model_used,
        AVG(duration_ms) as avg_response_time,
        AVG(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) as avg_tokens,
        COUNT(*) FILTER (WHERE status = 'closed') * 100.0 / COUNT(*) as success_rate,
        COUNT(*) as total_operations
      FROM analytics_events
      WHERE ai_model_used IS NOT NULL 
        AND ai_model_used != ''
        AND timestamp >= NOW() - INTERVAL '30 days'
      GROUP BY ai_model_used
      HAVING COUNT(*) >= 5  -- Minimum sample size
    `;

    const result = await database.query(query);
    const data: ModelPerformance[] = result.rows;

    const performance: Record<string, {
      avgResponseTime: number;
      successRate: number;
      avgTokens: number;
      costPer1K: number;
    }> = {};

    data.forEach(model => {
      // Estimate cost per 1K tokens (rough estimate: $0.002 per 1K tokens)
      const costPer1K = model.avg_tokens > 0 ? (model.avg_tokens / 1000) * 0.002 : 0;

      performance[model.ai_model_used] = {
        avgResponseTime: Math.round(model.avg_response_time),
        successRate: Math.round(model.success_rate * 100) / 100,
        avgTokens: Math.round(model.avg_tokens),
        costPer1K: Math.round(costPer1K * 10000) / 10000
      };
    });

    return performance;
  } catch (error) {
    console.error('Error getting model performance:', error);
    return {};
  }
}

/**
 * Get AI trends over time (for future dashboard use)
 */
export async function getAITrends(days: number = 7): Promise<{
  adoptionTrend: Array<{ date: string; adoption_rate: number }>;
  productivityTrend: Array<{ date: string; ai_median: number; human_median: number }>;
}> {
  try {
    // AI adoption trend by day
    const adoptionQuery = `
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) FILTER (WHERE actor = 'ai') * 100.0 / COUNT(*) as adoption_rate
      FROM analytics_events
      WHERE timestamp >= NOW() - INTERVAL '${days} days'
      GROUP BY DATE(timestamp)
      ORDER BY date
    `;

    const adoptionResult = await database.query(adoptionQuery);
    
    // Productivity trend by day
    const productivityQuery = `
      SELECT 
        DATE(timestamp) as date,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE actor = 'ai') as ai_median,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms) FILTER (WHERE actor = 'human') as human_median
      FROM analytics_events
      WHERE timestamp >= NOW() - INTERVAL '${days} days'
        AND duration_ms IS NOT NULL
      GROUP BY DATE(timestamp)
      ORDER BY date
    `;

    const productivityResult = await database.query(productivityQuery);

    return {
      adoptionTrend: adoptionResult.rows,
      productivityTrend: productivityResult.rows
    };
  } catch (error) {
    console.error('Error getting AI trends:', error);
    return {
      adoptionTrend: [],
      productivityTrend: []
    };
  }
}

/**
 * Get AI usage summary statistics
 */
export async function getAIUsageSummary(): Promise<{
  totalAIOperations: number;
  totalTokensUsed: number;
  mostUsedModel: string;
  avgSessionAIUsage: number;
}> {
  try {
    const query = `
      SELECT 
        COUNT(*) as total_ai_operations,
        SUM(COALESCE(prompt_tokens, 0) + COALESCE(completion_tokens, 0)) as total_tokens,
        MODE() WITHIN GROUP (ORDER BY ai_model_used) as most_used_model,
        COUNT(DISTINCT session_id) as sessions_with_ai
      FROM analytics_events
      WHERE actor = 'ai'
        AND timestamp >= NOW() - INTERVAL '30 days'
    `;

    const result = await database.query(query);
    const data = result.rows[0];

    // Get total sessions for percentage calculation
    const sessionQuery = `
      SELECT COUNT(DISTINCT session_id) as total_sessions
      FROM analytics_events
      WHERE timestamp >= NOW() - INTERVAL '30 days'
        AND session_id IS NOT NULL
    `;

    const sessionResult = await database.query(sessionQuery);
    const totalSessions = sessionResult.rows[0].total_sessions || 1;

    return {
      totalAIOperations: parseInt(data.total_ai_operations) || 0,
      totalTokensUsed: parseInt(data.total_tokens) || 0,
      mostUsedModel: data.most_used_model || 'none',
      avgSessionAIUsage: Math.round((data.sessions_with_ai / totalSessions) * 100 * 100) / 100
    };
  } catch (error) {
    console.error('Error getting AI usage summary:', error);
    return {
      totalAIOperations: 0,
      totalTokensUsed: 0,
      mostUsedModel: 'none',
      avgSessionAIUsage: 0
    };
  }
}
