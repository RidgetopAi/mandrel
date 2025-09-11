/**
 * AIDIS Decision Outcome Tracker Service
 * 
 * TC016: Decision outcome tracking framework
 * 
 * This is the INTELLIGENCE ENGINE for decision learning - transforming
 * raw decision data into actionable insights that prevent repeated mistakes
 * and amplify successful patterns.
 * 
 * Core Functions:
 * - Track and measure decision outcomes over time
 * - Analyze impact relationships between decisions
 * - Extract learning patterns from successful/failed decisions
 * - Generate predictive insights for future decisions
 * - Automate outcome monitoring and alerting
 * - Provide comprehensive decision analytics
 * 
 * This solves critical organizational learning problems:
 * - "Are our technical decisions actually successful?"
 * - "What patterns lead to good/bad outcomes?"
 * - "How do decisions impact each other?"
 * - "What can we learn from our decision history?"
 * - "How can we make better decisions going forward?"
 */

import { db } from '../config/database.js';
import { projectHandler } from '../handlers/project.js';
import { logEvent } from '../middleware/eventLogger.js';

// =============================================
// CORE INTERFACES
// =============================================

export interface DecisionOutcome {
  id: string;
  decisionId: string;
  projectId: string;
  outcomeType: OutcomeType;
  predictedValue?: number;
  actualValue?: number;
  variancePercentage?: number;
  outcomeScore: number; // 1-10 scale
  outcomeStatus: OutcomeStatus;
  measuredAt: Date;
  measurementPeriodDays?: number;
  evidenceType?: EvidenceType;
  evidenceData?: Record<string, any>;
  notes?: string;
  measuredBy?: string;
  confidenceLevel: ConfidenceLevel;
  createdAt: Date;
  updatedAt: Date;
}

export interface DecisionImpact {
  id: string;
  sourceDecisionId: string;
  impactedDecisionId: string;
  projectId: string;
  impactType: ImpactType;
  impactStrength: ImpactStrength;
  impactDirection: ImpactDirection;
  timeImpactDays?: number;
  costImpactAmount?: number;
  complexityImpactScore?: number;
  analysisMethod: AnalysisMethod;
  description?: string;
  confidenceScore: number; // 0-1 scale
  discoveredAt: Date;
  discoveredBy?: string;
  validated: boolean;
  validationNotes?: string;
}

export interface LearningInsight {
  id: string;
  projectId: string;
  insightType: InsightType;
  patternName: string;
  patternDescription: string;
  patternConditions: Record<string, any>;
  confidenceScore: number; // 0-1 scale
  supportingEvidenceCount: number;
  contradictingEvidenceCount: number;
  recommendation?: string;
  preventionStrategy?: string;
  enhancementStrategy?: string;
  decisionTypes: string[];
  impactLevels: string[];
  applicableComponents: string[];
  contextualFactors: Record<string, any>;
  firstObserved: Date;
  lastConfirmed: Date;
  status: InsightStatus;
  sourceDecisions: string[];
  derivedFromInsights: string[];
  timesApplied: number;
  lastApplied?: Date;
  applicationSuccessRate?: number;
}

export interface MetricTimeline {
  id: string;
  decisionId: string;
  projectId: string;
  metricName: string;
  metricCategory: MetricCategory;
  metricValue: number;
  metricUnit?: string;
  baselineValue?: number;
  targetValue?: number;
  measurementTimestamp: Date;
  daysSinceDecision: number;
  phase: DecisionPhase;
  dataSource?: string;
  collectionMethod?: string;
  sampleSize?: number;
  confidenceInterval?: number;
  externalFactors: Record<string, any>;
}

export interface DecisionRetrospective {
  id: string;
  decisionId: string;
  projectId: string;
  retrospectiveDate: Date;
  retrospectiveType: RetrospectiveType;
  participants: string[];
  facilitator?: string;
  overallSatisfaction: number; // 1-10 scale
  wouldDecideSameAgain: boolean;
  recommendationToOthers: number; // 1-10 scale
  whatWentWell?: string;
  whatWentPoorly?: string;
  whatWeLearned?: string;
  whatWeWouldDoDifferently?: string;
  recommendationsForSimilarDecisions?: string;
  processImprovements?: string;
  toolsOrResourcesNeeded?: string;
  unforeseenRisks?: string;
  riskMitigationEffectiveness?: string;
  newRisksDiscovered?: string;
  timeToValueActualDays?: number;
  timeToValuePredictedDays?: number;
  totalEffortActualHours?: number;
  totalEffortPredictedHours?: number;
  stakeholderFeedback: Record<string, any>;
  adoptionChallenges?: string;
  changeManagementLessons?: string;
  retrospectiveQualityScore: number; // 1-10 scale
  actionItems: ActionItem[];
  followUpRequired: boolean;
  followUpDate?: Date;
}

// =============================================
// TYPE DEFINITIONS
// =============================================

export type OutcomeType = 
  | 'implementation' | 'performance' | 'maintenance' | 'cost' | 'adoption'
  | 'security' | 'scalability' | 'developer_experience' | 'user_experience';

export type OutcomeStatus = 
  | 'in_progress' | 'successful' | 'failed' | 'mixed' | 'abandoned' | 'superseded';

export type EvidenceType = 
  | 'metrics' | 'user_feedback' | 'performance_data' | 'cost_analysis'
  | 'developer_survey' | 'incident_report' | 'code_review' | 'automated_test';

export type ConfidenceLevel = 'low' | 'medium' | 'high';

export type ImpactType = 
  | 'enables' | 'conflicts_with' | 'depends_on' | 'supersedes' | 'complements'
  | 'complicates' | 'simplifies' | 'blocks' | 'accelerates';

export type ImpactStrength = 'low' | 'medium' | 'high';

export type ImpactDirection = 'positive' | 'negative' | 'neutral';

export type AnalysisMethod = 
  | 'manual_review' | 'automated_analysis' | 'stakeholder_feedback'
  | 'performance_correlation' | 'timeline_analysis' | 'dependency_graph';

export type InsightType = 
  | 'success_pattern' | 'failure_pattern' | 'risk_indicator' | 'best_practice'
  | 'anti_pattern' | 'correlation' | 'threshold' | 'timing_pattern';

export type InsightStatus = 'active' | 'deprecated' | 'under_review';

export type MetricCategory = 
  | 'performance' | 'cost' | 'quality' | 'velocity' | 'satisfaction'
  | 'adoption' | 'maintenance' | 'security' | 'reliability';

export type DecisionPhase = 
  | 'pre_implementation' | 'implementation' | 'early_adoption'
  | 'steady_state' | 'optimization' | 'migration' | 'deprecation';

export type RetrospectiveType = 
  | 'quarterly' | 'post_implementation' | 'incident_driven' | 'milestone' | 'ad_hoc';

export interface ActionItem {
  description: string;
  assignee?: string;
  dueDate?: Date;
  completed: boolean;
}

// =============================================
// REQUEST/RESPONSE INTERFACES
// =============================================

export interface RecordOutcomeRequest {
  decisionId: string;
  projectId?: string;
  outcomeType: OutcomeType;
  predictedValue?: number;
  actualValue?: number;
  outcomeScore: number;
  outcomeStatus: OutcomeStatus;
  measurementPeriodDays?: number;
  evidenceType?: EvidenceType;
  evidenceData?: Record<string, any>;
  notes?: string;
  measuredBy?: string;
  confidenceLevel?: ConfidenceLevel;
}

export interface AnalyzeImpactRequest {
  sourceDecisionId: string;
  impactedDecisionId: string;
  projectId?: string;
  impactType: ImpactType;
  impactStrength?: ImpactStrength;
  impactDirection?: ImpactDirection;
  timeImpactDays?: number;
  costImpactAmount?: number;
  complexityImpactScore?: number;
  analysisMethod: AnalysisMethod;
  description?: string;
  confidenceScore: number;
  discoveredBy?: string;
}

export interface TrackMetricRequest {
  decisionId: string;
  projectId?: string;
  metricName: string;
  metricCategory: MetricCategory;
  metricValue: number;
  metricUnit?: string;
  baselineValue?: number;
  targetValue?: number;
  daysSinceDecision: number;
  phase: DecisionPhase;
  dataSource?: string;
  collectionMethod?: string;
  sampleSize?: number;
  confidenceInterval?: number;
  externalFactors?: Record<string, any>;
}

export interface ConductRetrospectiveRequest {
  decisionId: string;
  projectId?: string;
  retrospectiveType: RetrospectiveType;
  participants: string[];
  facilitator?: string;
  overallSatisfaction: number;
  wouldDecideSameAgain: boolean;
  recommendationToOthers: number;
  whatWentWell?: string;
  whatWentPoorly?: string;
  whatWeLearned?: string;
  whatWeWouldDoDifferently?: string;
  recommendationsForSimilarDecisions?: string;
  processImprovements?: string;
  toolsOrResourcesNeeded?: string;
  unforeseenRisks?: string;
  riskMitigationEffectiveness?: string;
  newRisksDiscovered?: string;
  timeToValueActualDays?: number;
  timeToValuePredictedDays?: number;
  totalEffortActualHours?: number;
  totalEffortPredictedHours?: number;
  stakeholderFeedback?: Record<string, any>;
  adoptionChallenges?: string;
  changeManagementLessons?: string;
  retrospectiveQualityScore: number;
  actionItems?: ActionItem[];
  followUpRequired?: boolean;
  followUpDate?: Date;
}

// =============================================
// OUTCOME TRACKER SERVICE
// =============================================

export class OutcomeTracker {

  /**
   * Record a decision outcome measurement
   */
  async recordOutcome(request: RecordOutcomeRequest): Promise<DecisionOutcome> {
    console.log(`📊 Recording outcome for decision: ${request.decisionId.substring(0, 8)}...`);

    try {
      const projectId = await this.ensureProjectId(request.projectId);
      
      // Validate the decision exists
      await this.validateDecisionExists(request.decisionId);
      
      // Calculate variance if both predicted and actual values exist
      let variancePercentage: number | undefined;
      if (request.predictedValue && request.actualValue) {
        variancePercentage = ((request.actualValue - request.predictedValue) / request.predictedValue) * 100;
      }
      
      // Calculate measurement period if not provided
      let measurementPeriodDays = request.measurementPeriodDays;
      if (!measurementPeriodDays) {
        const decisionResult = await db.query(
          'SELECT decision_date FROM technical_decisions WHERE id = $1',
          [request.decisionId]
        );
        if (decisionResult.rows.length > 0) {
          const decisionDate = new Date(decisionResult.rows[0].decision_date);
          const now = new Date();
          measurementPeriodDays = Math.ceil((now.getTime() - decisionDate.getTime()) / (1000 * 60 * 60 * 24));
        }
      }

      const result = await db.query(`
        INSERT INTO decision_outcomes (
          decision_id, project_id, outcome_type, predicted_value, actual_value,
          variance_percentage, outcome_score, outcome_status, measurement_period_days,
          evidence_type, evidence_data, notes, measured_by, confidence_level
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING *
      `, [
        request.decisionId,
        projectId,
        request.outcomeType,
        request.predictedValue || null,
        request.actualValue || null,
        variancePercentage || null,
        request.outcomeScore,
        request.outcomeStatus,
        measurementPeriodDays || null,
        request.evidenceType || null,
        JSON.stringify(request.evidenceData || {}),
        request.notes || null,
        request.measuredBy || 'ai_system',
        request.confidenceLevel || 'medium'
      ]);

      const outcome = this.mapDatabaseRowToOutcome(result.rows[0]);

      console.log(`✅ Outcome recorded: ${outcome.outcomeStatus} (Score: ${outcome.outcomeScore}/10)`);
      console.log(`📈 Variance: ${outcome.variancePercentage ? outcome.variancePercentage.toFixed(1) + '%' : 'N/A'}`);

      // Log the outcome recording event
      await logEvent({
        actor: 'ai',
        event_type: 'outcome_recorded',
        payload: {
          decision_id: request.decisionId,
          outcome_type: request.outcomeType,
          outcome_status: request.outcomeStatus,
          outcome_score: request.outcomeScore,
          variance_percentage: variancePercentage,
          measurement_period_days: measurementPeriodDays,
          evidence_type: request.evidenceType
        },
        status: 'closed',
        tags: ['outcome', 'measurement', 'decision-tracking']
      });

      return outcome;

    } catch (error) {
      console.error('❌ Failed to record outcome:', error);
      throw new Error(`Outcome recording failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze and record impact relationship between decisions
   */
  async analyzeImpact(request: AnalyzeImpactRequest): Promise<DecisionImpact> {
    console.log(`🔗 Analyzing impact: ${request.sourceDecisionId.substring(0, 8)} → ${request.impactedDecisionId.substring(0, 8)}`);

    try {
      const projectId = await this.ensureProjectId(request.projectId);
      
      // Validate both decisions exist
      await this.validateDecisionExists(request.sourceDecisionId);
      await this.validateDecisionExists(request.impactedDecisionId);
      
      // Check for existing relationship
      const existingImpact = await this.findExistingImpact(
        request.sourceDecisionId, 
        request.impactedDecisionId, 
        request.impactType
      );
      
      if (existingImpact) {
        console.log(`⚠️  Impact relationship already exists: ${existingImpact.id}`);
        return existingImpact;
      }

      const result = await db.query(`
        INSERT INTO decision_impact_analysis (
          source_decision_id, impacted_decision_id, project_id, impact_type,
          impact_strength, impact_direction, time_impact_days, cost_impact_amount,
          complexity_impact_score, analysis_method, description, confidence_score,
          discovered_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING *
      `, [
        request.sourceDecisionId,
        request.impactedDecisionId,
        projectId,
        request.impactType,
        request.impactStrength || 'medium',
        request.impactDirection || 'neutral',
        request.timeImpactDays || null,
        request.costImpactAmount || null,
        request.complexityImpactScore || null,
        request.analysisMethod,
        request.description || null,
        request.confidenceScore,
        request.discoveredBy || 'ai_system'
      ]);

      const impact = this.mapDatabaseRowToImpact(result.rows[0]);

      console.log(`✅ Impact relationship recorded: ${impact.impactType} (${impact.impactStrength})`);
      console.log(`🎯 Confidence: ${(impact.confidenceScore * 100).toFixed(0)}%`);

      // Log the impact analysis event
      await logEvent({
        actor: 'ai',
        event_type: 'impact_analyzed',
        payload: {
          source_decision_id: request.sourceDecisionId,
          impacted_decision_id: request.impactedDecisionId,
          impact_type: request.impactType,
          impact_strength: request.impactStrength,
          impact_direction: request.impactDirection,
          confidence_score: request.confidenceScore,
          analysis_method: request.analysisMethod
        },
        status: 'closed',
        tags: ['impact', 'analysis', 'decision-relationships']
      });

      return impact;

    } catch (error) {
      console.error('❌ Failed to analyze impact:', error);
      throw new Error(`Impact analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Track metrics over time for a decision
   */
  async trackMetric(request: TrackMetricRequest): Promise<MetricTimeline> {
    console.log(`📈 Tracking metric "${request.metricName}" for decision: ${request.decisionId.substring(0, 8)}...`);

    try {
      const projectId = await this.ensureProjectId(request.projectId);
      
      // Validate the decision exists
      await this.validateDecisionExists(request.decisionId);

      const result = await db.query(`
        INSERT INTO decision_metrics_timeline (
          decision_id, project_id, metric_name, metric_category, metric_value,
          metric_unit, baseline_value, target_value, days_since_decision, phase,
          data_source, collection_method, sample_size, confidence_interval,
          external_factors
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *
      `, [
        request.decisionId,
        projectId,
        request.metricName,
        request.metricCategory,
        request.metricValue,
        request.metricUnit || null,
        request.baselineValue || null,
        request.targetValue || null,
        request.daysSinceDecision,
        request.phase,
        request.dataSource || null,
        request.collectionMethod || null,
        request.sampleSize || null,
        request.confidenceInterval || null,
        JSON.stringify(request.externalFactors || {})
      ]);

      const metric = this.mapDatabaseRowToMetric(result.rows[0]);

      // Calculate progress toward target if available
      let progressInfo = '';
      if (metric.baselineValue && metric.targetValue) {
        const totalChange = metric.targetValue - metric.baselineValue;
        const currentChange = metric.metricValue - metric.baselineValue;
        const progressPercent = (currentChange / totalChange) * 100;
        progressInfo = ` | Progress: ${progressPercent.toFixed(1)}% toward target`;
      }

      console.log(`✅ Metric tracked: ${metric.metricValue} ${metric.metricUnit || ''}${progressInfo}`);
      console.log(`📊 Phase: ${metric.phase} | Days since decision: ${metric.daysSinceDecision}`);

      // Log the metric tracking event
      await logEvent({
        actor: 'ai',
        event_type: 'metric_tracked',
        payload: {
          decision_id: request.decisionId,
          metric_name: request.metricName,
          metric_category: request.metricCategory,
          metric_value: request.metricValue,
          metric_unit: request.metricUnit,
          phase: request.phase,
          days_since_decision: request.daysSinceDecision,
          baseline_value: request.baselineValue,
          target_value: request.targetValue
        },
        status: 'closed',
        tags: ['metrics', 'tracking', 'decision-monitoring']
      });

      return metric;

    } catch (error) {
      console.error('❌ Failed to track metric:', error);
      throw new Error(`Metric tracking failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Conduct a decision retrospective
   */
  async conductRetrospective(request: ConductRetrospectiveRequest): Promise<DecisionRetrospective> {
    console.log(`🔍 Conducting retrospective for decision: ${request.decisionId.substring(0, 8)}...`);

    try {
      const projectId = await this.ensureProjectId(request.projectId);
      
      // Validate the decision exists
      await this.validateDecisionExists(request.decisionId);

      const result = await db.query(`
        INSERT INTO decision_retrospectives (
          decision_id, project_id, retrospective_type, participants, facilitator,
          overall_satisfaction, would_decide_same_again, recommendation_to_others,
          what_went_well, what_went_poorly, what_we_learned, what_we_would_do_differently,
          recommendations_for_similar_decisions, process_improvements, tools_or_resources_needed,
          unforeseen_risks, risk_mitigation_effectiveness, new_risks_discovered,
          time_to_value_actual_days, time_to_value_predicted_days,
          total_effort_actual_hours, total_effort_predicted_hours,
          stakeholder_feedback, adoption_challenges, change_management_lessons,
          retrospective_quality_score, action_items, follow_up_required, follow_up_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, 
                  $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29)
        RETURNING *
      `, [
        request.decisionId,
        projectId,
        request.retrospectiveType,
        request.participants,
        request.facilitator || null,
        request.overallSatisfaction,
        request.wouldDecideSameAgain,
        request.recommendationToOthers,
        request.whatWentWell || null,
        request.whatWentPoorly || null,
        request.whatWeLearned || null,
        request.whatWeWouldDoDifferently || null,
        request.recommendationsForSimilarDecisions || null,
        request.processImprovements || null,
        request.toolsOrResourcesNeeded || null,
        request.unforeseenRisks || null,
        request.riskMitigationEffectiveness || null,
        request.newRisksDiscovered || null,
        request.timeToValueActualDays || null,
        request.timeToValuePredictedDays || null,
        request.totalEffortActualHours || null,
        request.totalEffortPredictedHours || null,
        JSON.stringify(request.stakeholderFeedback || {}),
        request.adoptionChallenges || null,
        request.changeManagementLessons || null,
        request.retrospectiveQualityScore,
        JSON.stringify(request.actionItems || []),
        request.followUpRequired || false,
        request.followUpDate || null
      ]);

      const retrospective = this.mapDatabaseRowToRetrospective(result.rows[0]);

      console.log(`✅ Retrospective completed: Overall satisfaction ${retrospective.overallSatisfaction}/10`);
      console.log(`📋 ${retrospective.actionItems.length} action items | Follow-up: ${retrospective.followUpRequired ? 'Yes' : 'No'}`);

      // Log the retrospective event
      await logEvent({
        actor: 'ai',
        event_type: 'retrospective_conducted',
        payload: {
          decision_id: request.decisionId,
          retrospective_type: request.retrospectiveType,
          participants_count: request.participants.length,
          overall_satisfaction: request.overallSatisfaction,
          would_decide_same_again: request.wouldDecideSameAgain,
          recommendation_to_others: request.recommendationToOthers,
          retrospective_quality_score: request.retrospectiveQualityScore,
          action_items_count: request.actionItems?.length || 0,
          follow_up_required: request.followUpRequired
        },
        status: 'closed',
        tags: ['retrospective', 'learning', 'decision-review']
      });

      return retrospective;

    } catch (error) {
      console.error('❌ Failed to conduct retrospective:', error);
      throw new Error(`Retrospective failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get learning insights for a project
   */
  async getLearningInsights(
    projectId?: string, 
    insightType?: InsightType,
    limit: number = 20
  ): Promise<LearningInsight[]> {
    console.log(`🧠 Getting learning insights...`);

    try {
      const actualProjectId = await this.ensureProjectId(projectId);
      
      let sql = `
        SELECT * FROM decision_learning_insights 
        WHERE project_id = $1 AND status = 'active'
      `;
      const params: any[] = [actualProjectId];
      let paramIndex = 2;

      if (insightType) {
        sql += ` AND insight_type = $${paramIndex}`;
        params.push(insightType);
        paramIndex++;
      }

      sql += ` ORDER BY confidence_score DESC, supporting_evidence_count DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await db.query(sql, params);
      const insights = result.rows.map(row => this.mapDatabaseRowToInsight(row));

      console.log(`✅ Found ${insights.length} learning insights`);
      
      // Log the insights retrieval event
      await logEvent({
        actor: 'ai',
        event_type: 'insights_retrieved',
        payload: {
          project_id: actualProjectId,
          insight_type: insightType,
          insights_count: insights.length,
          avg_confidence: insights.length > 0 ? insights.reduce((sum, i) => sum + i.confidenceScore, 0) / insights.length : 0
        },
        status: 'closed',
        tags: ['insights', 'learning', 'patterns']
      });

      return insights;

    } catch (error) {
      console.error('❌ Failed to get learning insights:', error);
      throw new Error(`Learning insights retrieval failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get comprehensive decision analytics
   */
  async getDecisionAnalytics(
    projectId?: string,
    timeframeDays: number = 90
  ): Promise<{
    summary: DecisionAnalyticsSummary;
    outcomeDistribution: Record<string, number>;
    impactNetwork: DecisionImpact[];
    trendsOverTime: MetricTrend[];
    topInsights: LearningInsight[];
    riskPatterns: RiskPattern[];
  }> {
    console.log(`📊 Generating comprehensive decision analytics...`);

    try {
      const actualProjectId = await this.ensureProjectId(projectId);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - timeframeDays);

      // Get summary statistics
      const summaryResult = await db.query(`
        SELECT 
          COUNT(DISTINCT td.id) as total_decisions,
          COUNT(DISTINCT outcomes.id) as measured_decisions,
          AVG(outcomes.outcome_score) as avg_outcome_score,
          COUNT(CASE WHEN outcomes.outcome_status = 'successful' THEN 1 END) as successful_count,
          COUNT(CASE WHEN outcomes.outcome_status = 'failed' THEN 1 END) as failed_count,
          COUNT(DISTINCT impacts.id) as impact_relationships,
          COUNT(DISTINCT insights.id) as learning_insights,
          COUNT(DISTINCT retros.id) as retrospectives_conducted
        FROM technical_decisions td
        LEFT JOIN decision_outcomes outcomes ON td.id = outcomes.decision_id
        LEFT JOIN decision_impact_analysis impacts ON td.id = impacts.source_decision_id OR td.id = impacts.impacted_decision_id
        LEFT JOIN decision_learning_insights insights ON td.project_id = insights.project_id
        LEFT JOIN decision_retrospectives retros ON td.id = retros.decision_id
        WHERE td.project_id = $1 AND td.decision_date >= $2
      `, [actualProjectId, cutoffDate]);

      const summaryData = summaryResult.rows[0];
      const summary: DecisionAnalyticsSummary = {
        totalDecisions: parseInt(summaryData.total_decisions) || 0,
        measuredDecisions: parseInt(summaryData.measured_decisions) || 0,
        avgOutcomeScore: parseFloat(summaryData.avg_outcome_score) || 0,
        successfulCount: parseInt(summaryData.successful_count) || 0,
        failedCount: parseInt(summaryData.failed_count) || 0,
        impactRelationships: parseInt(summaryData.impact_relationships) || 0,
        learningInsights: parseInt(summaryData.learning_insights) || 0,
        retrospectivesConducted: parseInt(summaryData.retrospectives_conducted) || 0,
        measurementCoverage: summaryData.total_decisions > 0 ? 
          (parseInt(summaryData.measured_decisions) / parseInt(summaryData.total_decisions)) * 100 : 0,
        successRate: (parseInt(summaryData.successful_count) + parseInt(summaryData.failed_count)) > 0 ?
          (parseInt(summaryData.successful_count) / (parseInt(summaryData.successful_count) + parseInt(summaryData.failed_count))) * 100 : 0
      };

      // Get outcome distribution
      const outcomeResult = await db.query(`
        SELECT outcome_status, COUNT(*) as count
        FROM decision_outcomes outcomes
        JOIN technical_decisions td ON outcomes.decision_id = td.id
        WHERE td.project_id = $1 AND outcomes.measured_at >= $2
        GROUP BY outcome_status
      `, [actualProjectId, cutoffDate]);

      const outcomeDistribution: Record<string, number> = {};
      outcomeResult.rows.forEach(row => {
        outcomeDistribution[row.outcome_status] = parseInt(row.count);
      });

      // Get impact network
      const impactResult = await db.query(`
        SELECT * FROM decision_impact_analysis
        WHERE project_id = $1 AND discovered_at >= $2
        ORDER BY confidence_score DESC
        LIMIT 50
      `, [actualProjectId, cutoffDate]);
      
      const impactNetwork = impactResult.rows.map(row => this.mapDatabaseRowToImpact(row));

      // Get metric trends
      const trendResult = await db.query(`
        SELECT 
          metric_name,
          metric_category,
          AVG(metric_value) as avg_value,
          COUNT(*) as measurement_count,
          MIN(measurement_timestamp) as first_measurement,
          MAX(measurement_timestamp) as last_measurement,
          STDDEV(metric_value) as value_stddev
        FROM decision_metrics_timeline dmt
        JOIN technical_decisions td ON dmt.decision_id = td.id
        WHERE td.project_id = $1 AND dmt.measurement_timestamp >= $2
        GROUP BY metric_name, metric_category
        HAVING COUNT(*) >= 3
        ORDER BY measurement_count DESC
      `, [actualProjectId, cutoffDate]);

      const trendsOverTime: MetricTrend[] = trendResult.rows.map(row => ({
        metricName: row.metric_name,
        metricCategory: row.metric_category,
        avgValue: parseFloat(row.avg_value),
        measurementCount: parseInt(row.measurement_count),
        firstMeasurement: new Date(row.first_measurement),
        lastMeasurement: new Date(row.last_measurement),
        valueStddev: parseFloat(row.value_stddev) || 0,
        trend: 'stable' // TODO: Calculate actual trend direction
      }));

      // Get top insights
      const topInsights = await this.getLearningInsights(actualProjectId, undefined, 10);

      // Analyze risk patterns
      const riskPatterns = await this.analyzeRiskPatterns(actualProjectId, cutoffDate);

      console.log(`✅ Analytics generated: ${summary.totalDecisions} decisions analyzed`);
      console.log(`📊 Success rate: ${summary.successRate.toFixed(1)}% | Avg score: ${summary.avgOutcomeScore.toFixed(1)}/10`);

      return {
        summary,
        outcomeDistribution,
        impactNetwork,
        trendsOverTime,
        topInsights,
        riskPatterns
      };

    } catch (error) {
      console.error('❌ Failed to generate decision analytics:', error);
      throw new Error(`Decision analytics failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // =============================================
  // PRIVATE HELPER METHODS
  // =============================================

  private async ensureProjectId(projectId?: string): Promise<string> {
    if (projectId) {
      return projectId;
    }

    await projectHandler.initializeSession();
    const currentProject = await projectHandler.getCurrentProject();
    
    if (currentProject) {
      return currentProject.id;
    }

    throw new Error('No current project set. Use project_switch to set an active project or specify a project ID.');
  }

  private async validateDecisionExists(decisionId: string): Promise<void> {
    const result = await db.query('SELECT id FROM technical_decisions WHERE id = $1', [decisionId]);
    if (result.rows.length === 0) {
      throw new Error(`Decision ${decisionId} not found`);
    }
  }

  private async findExistingImpact(
    sourceId: string, 
    impactedId: string, 
    impactType: ImpactType
  ): Promise<DecisionImpact | null> {
    const result = await db.query(`
      SELECT * FROM decision_impact_analysis 
      WHERE source_decision_id = $1 AND impacted_decision_id = $2 AND impact_type = $3
    `, [sourceId, impactedId, impactType]);
    
    if (result.rows.length > 0) {
      return this.mapDatabaseRowToImpact(result.rows[0]);
    }
    
    return null;
  }

  private async analyzeRiskPatterns(projectId: string, cutoffDate: Date): Promise<RiskPattern[]> {
    // Analyze failed decisions for common risk patterns
    const failedDecisionsResult = await db.query(`
      SELECT 
        td.decision_type,
        td.impact_level,
        STRING_AGG(DISTINCT unnest(td.affected_components), ', ') as common_components,
        COUNT(*) as failure_count,
        AVG(do.outcome_score) as avg_failure_score,
        STRING_AGG(DISTINCT do.notes, ' | ') as failure_reasons
      FROM technical_decisions td
      JOIN decision_outcomes do ON td.id = do.decision_id
      WHERE td.project_id = $1 
      AND td.decision_date >= $2 
      AND do.outcome_status = 'failed'
      GROUP BY td.decision_type, td.impact_level
      HAVING COUNT(*) >= 2
      ORDER BY failure_count DESC
    `, [projectId, cutoffDate]);

    const riskPatterns: RiskPattern[] = failedDecisionsResult.rows.map(row => ({
      patternName: `High failure rate in ${row.decision_type} decisions (${row.impact_level} impact)`,
      description: `${row.failure_count} failed decisions of type '${row.decision_type}' with ${row.impact_level} impact`,
      riskLevel: row.failure_count >= 5 ? 'high' : row.failure_count >= 3 ? 'medium' : 'low',
      affectedComponents: row.common_components?.split(', ') || [],
      failureCount: parseInt(row.failure_count),
      avgFailureScore: parseFloat(row.avg_failure_score),
      commonFailureReasons: row.failure_reasons?.split(' | ') || [],
      recommendedMitigation: `Review process for ${row.decision_type} decisions and implement additional validation steps`
    }));

    return riskPatterns;
  }

  // Database row mapping methods
  private mapDatabaseRowToOutcome(row: any): DecisionOutcome {
    return {
      id: row.id,
      decisionId: row.decision_id,
      projectId: row.project_id,
      outcomeType: row.outcome_type,
      predictedValue: row.predicted_value ? parseFloat(row.predicted_value) : undefined,
      actualValue: row.actual_value ? parseFloat(row.actual_value) : undefined,
      variancePercentage: row.variance_percentage ? parseFloat(row.variance_percentage) : undefined,
      outcomeScore: parseInt(row.outcome_score),
      outcomeStatus: row.outcome_status,
      measuredAt: new Date(row.measured_at),
      measurementPeriodDays: row.measurement_period_days ? parseInt(row.measurement_period_days) : undefined,
      evidenceType: row.evidence_type,
      evidenceData: typeof row.evidence_data === 'string' ? JSON.parse(row.evidence_data) : row.evidence_data,
      notes: row.notes,
      measuredBy: row.measured_by,
      confidenceLevel: row.confidence_level,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapDatabaseRowToImpact(row: any): DecisionImpact {
    return {
      id: row.id,
      sourceDecisionId: row.source_decision_id,
      impactedDecisionId: row.impacted_decision_id,
      projectId: row.project_id,
      impactType: row.impact_type,
      impactStrength: row.impact_strength,
      impactDirection: row.impact_direction,
      timeImpactDays: row.time_impact_days ? parseInt(row.time_impact_days) : undefined,
      costImpactAmount: row.cost_impact_amount ? parseFloat(row.cost_impact_amount) : undefined,
      complexityImpactScore: row.complexity_impact_score ? parseInt(row.complexity_impact_score) : undefined,
      analysisMethod: row.analysis_method,
      description: row.description,
      confidenceScore: parseFloat(row.confidence_score),
      discoveredAt: new Date(row.discovered_at),
      discoveredBy: row.discovered_by,
      validated: row.validated,
      validationNotes: row.validation_notes
    };
  }

  private mapDatabaseRowToInsight(row: any): LearningInsight {
    return {
      id: row.id,
      projectId: row.project_id,
      insightType: row.insight_type,
      patternName: row.pattern_name,
      patternDescription: row.pattern_description,
      patternConditions: typeof row.pattern_conditions === 'string' ? JSON.parse(row.pattern_conditions) : row.pattern_conditions,
      confidenceScore: parseFloat(row.confidence_score),
      supportingEvidenceCount: parseInt(row.supporting_evidence_count),
      contradictingEvidenceCount: parseInt(row.contradicting_evidence_count),
      recommendation: row.recommendation,
      preventionStrategy: row.prevention_strategy,
      enhancementStrategy: row.enhancement_strategy,
      decisionTypes: row.decision_types || [],
      impactLevels: row.impact_levels || [],
      applicableComponents: row.applicable_components || [],
      contextualFactors: typeof row.contextual_factors === 'string' ? JSON.parse(row.contextual_factors) : row.contextual_factors,
      firstObserved: new Date(row.first_observed),
      lastConfirmed: new Date(row.last_confirmed),
      status: row.status,
      sourceDecisions: row.source_decisions || [],
      derivedFromInsights: row.derived_from_insights || [],
      timesApplied: parseInt(row.times_applied),
      lastApplied: row.last_applied ? new Date(row.last_applied) : undefined,
      applicationSuccessRate: row.application_success_rate ? parseFloat(row.application_success_rate) : undefined
    };
  }

  private mapDatabaseRowToMetric(row: any): MetricTimeline {
    return {
      id: row.id,
      decisionId: row.decision_id,
      projectId: row.project_id,
      metricName: row.metric_name,
      metricCategory: row.metric_category,
      metricValue: parseFloat(row.metric_value),
      metricUnit: row.metric_unit,
      baselineValue: row.baseline_value ? parseFloat(row.baseline_value) : undefined,
      targetValue: row.target_value ? parseFloat(row.target_value) : undefined,
      measurementTimestamp: new Date(row.measurement_timestamp),
      daysSinceDecision: parseInt(row.days_since_decision),
      phase: row.phase,
      dataSource: row.data_source,
      collectionMethod: row.collection_method,
      sampleSize: row.sample_size ? parseInt(row.sample_size) : undefined,
      confidenceInterval: row.confidence_interval ? parseFloat(row.confidence_interval) : undefined,
      externalFactors: typeof row.external_factors === 'string' ? JSON.parse(row.external_factors) : row.external_factors
    };
  }

  private mapDatabaseRowToRetrospective(row: any): DecisionRetrospective {
    return {
      id: row.id,
      decisionId: row.decision_id,
      projectId: row.project_id,
      retrospectiveDate: new Date(row.retrospective_date),
      retrospectiveType: row.retrospective_type,
      participants: row.participants || [],
      facilitator: row.facilitator,
      overallSatisfaction: parseInt(row.overall_satisfaction),
      wouldDecideSameAgain: row.would_decide_same_again,
      recommendationToOthers: parseInt(row.recommendation_to_others),
      whatWentWell: row.what_went_well,
      whatWentPoorly: row.what_went_poorly,
      whatWeLearned: row.what_we_learned,
      whatWeWouldDoDifferently: row.what_we_would_do_differently,
      recommendationsForSimilarDecisions: row.recommendations_for_similar_decisions,
      processImprovements: row.process_improvements,
      toolsOrResourcesNeeded: row.tools_or_resources_needed,
      unforeseenRisks: row.unforeseen_risks,
      riskMitigationEffectiveness: row.risk_mitigation_effectiveness,
      newRisksDiscovered: row.new_risks_discovered,
      timeToValueActualDays: row.time_to_value_actual_days ? parseInt(row.time_to_value_actual_days) : undefined,
      timeToValuePredictedDays: row.time_to_value_predicted_days ? parseInt(row.time_to_value_predicted_days) : undefined,
      totalEffortActualHours: row.total_effort_actual_hours ? parseFloat(row.total_effort_actual_hours) : undefined,
      totalEffortPredictedHours: row.total_effort_predicted_hours ? parseFloat(row.total_effort_predicted_hours) : undefined,
      stakeholderFeedback: typeof row.stakeholder_feedback === 'string' ? JSON.parse(row.stakeholder_feedback) : row.stakeholder_feedback,
      adoptionChallenges: row.adoption_challenges,
      changeManagementLessons: row.change_management_lessons,
      retrospectiveQualityScore: parseInt(row.retrospective_quality_score),
      actionItems: typeof row.action_items === 'string' ? JSON.parse(row.action_items) : row.action_items || [],
      followUpRequired: row.follow_up_required,
      followUpDate: row.follow_up_date ? new Date(row.follow_up_date) : undefined
    };
  }
}

// =============================================
// ADDITIONAL INTERFACES
// =============================================

export interface DecisionAnalyticsSummary {
  totalDecisions: number;
  measuredDecisions: number;
  avgOutcomeScore: number;
  successfulCount: number;
  failedCount: number;
  impactRelationships: number;
  learningInsights: number;
  retrospectivesConducted: number;
  measurementCoverage: number; // Percentage of decisions with outcome measurements
  successRate: number; // Percentage of measured decisions that were successful
}

export interface MetricTrend {
  metricName: string;
  metricCategory: MetricCategory;
  avgValue: number;
  measurementCount: number;
  firstMeasurement: Date;
  lastMeasurement: Date;
  valueStddev: number;
  trend: 'improving' | 'declining' | 'stable';
}

export interface RiskPattern {
  patternName: string;
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  affectedComponents: string[];
  failureCount: number;
  avgFailureScore: number;
  commonFailureReasons: string[];
  recommendedMitigation: string;
}

// Export singleton instance
export const outcomeTracker = new OutcomeTracker();