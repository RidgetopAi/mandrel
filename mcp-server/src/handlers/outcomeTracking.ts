/**
 * AIDIS Decision Outcome Tracking Handler
 * 
 * TC016: Decision outcome tracking framework - MCP Tools Layer
 * 
 * This handler provides MCP tools for the decision outcome tracking framework,
 * extending our technical decisions system with advanced outcome monitoring,
 * impact analysis, and learning capabilities.
 * 
 * MCP Tools Provided:
 * - outcome_record: Record decision outcomes and measurements
 * - outcome_track_metric: Track metrics over time for decisions
 * - outcome_analyze_impact: Analyze relationships between decisions
 * - outcome_conduct_retrospective: Conduct structured retrospectives
 * - outcome_get_insights: Retrieve learning insights and patterns
 * - outcome_get_analytics: Get comprehensive decision analytics
 * - outcome_predict_success: Predict decision success using patterns
 * 
 * This transforms decision tracking from passive recording to active learning,
 * helping teams make better decisions based on historical outcomes.
 */

import { outcomeTracker, RecordOutcomeRequest, AnalyzeImpactRequest, TrackMetricRequest, ConductRetrospectiveRequest } from '../services/outcomeTracker.js';
import { logEvent } from '../middleware/eventLogger.js';

export class OutcomeTrackingHandler {

  /**
   * MCP Tool: outcome_record
   * Record a decision outcome measurement
   */
  async recordOutcome(params: any) {
    console.log('🎯 MCP: outcome_record called');
    
    try {
      // Validate required parameters
      if (!params.decisionId) {
        throw new Error('decisionId is required');
      }
      if (!params.outcomeType) {
        throw new Error('outcomeType is required');
      }
      if (params.outcomeScore === undefined || params.outcomeScore === null) {
        throw new Error('outcomeScore is required (1-10 scale)');
      }
      if (!params.outcomeStatus) {
        throw new Error('outcomeStatus is required');
      }

      // Validate outcomeScore range
      if (params.outcomeScore < 1 || params.outcomeScore > 10) {
        throw new Error('outcomeScore must be between 1 and 10');
      }

      const request: RecordOutcomeRequest = {
        decisionId: params.decisionId,
        projectId: params.projectId,
        outcomeType: params.outcomeType,
        predictedValue: params.predictedValue,
        actualValue: params.actualValue,
        outcomeScore: params.outcomeScore,
        outcomeStatus: params.outcomeStatus,
        measurementPeriodDays: params.measurementPeriodDays,
        evidenceType: params.evidenceType,
        evidenceData: params.evidenceData,
        notes: params.notes,
        measuredBy: params.measuredBy,
        confidenceLevel: params.confidenceLevel || 'medium'
      };

      const outcome = await outcomeTracker.recordOutcome(request);

      return {
        success: true,
        outcome: {
          id: outcome.id,
          decisionId: outcome.decisionId,
          outcomeType: outcome.outcomeType,
          outcomeScore: outcome.outcomeScore,
          outcomeStatus: outcome.outcomeStatus,
          measuredAt: outcome.measuredAt.toISOString(),
          variancePercentage: outcome.variancePercentage,
          measurementPeriodDays: outcome.measurementPeriodDays,
          evidenceType: outcome.evidenceType,
          confidenceLevel: outcome.confidenceLevel,
          notes: outcome.notes
        },
        message: `Outcome recorded successfully with score ${outcome.outcomeScore}/10`,
        metadata: {
          tool: 'outcome_record',
          decisionId: params.decisionId,
          outcomeType: params.outcomeType,
          recordedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('❌ Failed to record outcome:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        tool: 'outcome_record'
      };
    }
  }

  /**
   * MCP Tool: outcome_track_metric
   * Track metrics over time for a decision
   */
  async trackMetric(params: any) {
    console.log('📊 MCP: outcome_track_metric called');
    
    try {
      // Validate required parameters
      if (!params.decisionId) {
        throw new Error('decisionId is required');
      }
      if (!params.metricName) {
        throw new Error('metricName is required');
      }
      if (!params.metricCategory) {
        throw new Error('metricCategory is required');
      }
      if (params.metricValue === undefined || params.metricValue === null) {
        throw new Error('metricValue is required');
      }
      if (params.daysSinceDecision === undefined || params.daysSinceDecision === null) {
        throw new Error('daysSinceDecision is required');
      }
      if (!params.phase) {
        throw new Error('phase is required');
      }

      const request: TrackMetricRequest = {
        decisionId: params.decisionId,
        projectId: params.projectId,
        metricName: params.metricName,
        metricCategory: params.metricCategory,
        metricValue: params.metricValue,
        metricUnit: params.metricUnit,
        baselineValue: params.baselineValue,
        targetValue: params.targetValue,
        daysSinceDecision: params.daysSinceDecision,
        phase: params.phase,
        dataSource: params.dataSource,
        collectionMethod: params.collectionMethod,
        sampleSize: params.sampleSize,
        confidenceInterval: params.confidenceInterval,
        externalFactors: params.externalFactors
      };

      const metric = await outcomeTracker.trackMetric(request);

      // Calculate progress if baseline and target exist
      let progressInfo: any = {};
      if (metric.baselineValue && metric.targetValue) {
        const totalChange = metric.targetValue - metric.baselineValue;
        const currentChange = metric.metricValue - metric.baselineValue;
        const progressPercent = totalChange !== 0 ? (currentChange / totalChange) * 100 : 0;
        
        progressInfo = {
          progressTowardTarget: Math.round(progressPercent * 100) / 100,
          distanceFromTarget: metric.targetValue - metric.metricValue,
          improvementFromBaseline: metric.metricValue - metric.baselineValue
        };
      }

      return {
        success: true,
        metric: {
          id: metric.id,
          decisionId: metric.decisionId,
          metricName: metric.metricName,
          metricCategory: metric.metricCategory,
          metricValue: metric.metricValue,
          metricUnit: metric.metricUnit,
          phase: metric.phase,
          daysSinceDecision: metric.daysSinceDecision,
          measurementTimestamp: metric.measurementTimestamp.toISOString(),
          baselineValue: metric.baselineValue,
          targetValue: metric.targetValue,
          dataSource: metric.dataSource,
          ...progressInfo
        },
        message: `Metric "${metric.metricName}" tracked: ${metric.metricValue} ${metric.metricUnit || ''}`,
        metadata: {
          tool: 'outcome_track_metric',
          decisionId: params.decisionId,
          metricName: params.metricName,
          phase: params.phase,
          trackedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('❌ Failed to track metric:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        tool: 'outcome_track_metric'
      };
    }
  }

  /**
   * MCP Tool: outcome_analyze_impact
   * Analyze and record impact relationship between decisions
   */
  async analyzeImpact(params: any) {
    console.log('🔗 MCP: outcome_analyze_impact called');
    
    try {
      // Validate required parameters
      if (!params.sourceDecisionId) {
        throw new Error('sourceDecisionId is required');
      }
      if (!params.impactedDecisionId) {
        throw new Error('impactedDecisionId is required');
      }
      if (!params.impactType) {
        throw new Error('impactType is required');
      }
      if (!params.analysisMethod) {
        throw new Error('analysisMethod is required');
      }
      if (params.confidenceScore === undefined || params.confidenceScore === null) {
        throw new Error('confidenceScore is required (0-1 scale)');
      }

      // Validate confidenceScore range
      if (params.confidenceScore < 0 || params.confidenceScore > 1) {
        throw new Error('confidenceScore must be between 0 and 1');
      }

      const request: AnalyzeImpactRequest = {
        sourceDecisionId: params.sourceDecisionId,
        impactedDecisionId: params.impactedDecisionId,
        projectId: params.projectId,
        impactType: params.impactType,
        impactStrength: params.impactStrength || 'medium',
        impactDirection: params.impactDirection || 'neutral',
        timeImpactDays: params.timeImpactDays,
        costImpactAmount: params.costImpactAmount,
        complexityImpactScore: params.complexityImpactScore,
        analysisMethod: params.analysisMethod,
        description: params.description,
        confidenceScore: params.confidenceScore,
        discoveredBy: params.discoveredBy
      };

      const impact = await outcomeTracker.analyzeImpact(request);

      return {
        success: true,
        impact: {
          id: impact.id,
          sourceDecisionId: impact.sourceDecisionId,
          impactedDecisionId: impact.impactedDecisionId,
          impactType: impact.impactType,
          impactStrength: impact.impactStrength,
          impactDirection: impact.impactDirection,
          timeImpactDays: impact.timeImpactDays,
          costImpactAmount: impact.costImpactAmount,
          complexityImpactScore: impact.complexityImpactScore,
          analysisMethod: impact.analysisMethod,
          description: impact.description,
          confidenceScore: impact.confidenceScore,
          discoveredAt: impact.discoveredAt.toISOString(),
          validated: impact.validated
        },
        message: `Impact relationship analyzed: ${impact.impactType} (${impact.impactStrength} strength, ${Math.round(impact.confidenceScore * 100)}% confidence)`,
        metadata: {
          tool: 'outcome_analyze_impact',
          sourceDecisionId: params.sourceDecisionId,
          impactedDecisionId: params.impactedDecisionId,
          impactType: params.impactType,
          analyzedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('❌ Failed to analyze impact:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        tool: 'outcome_analyze_impact'
      };
    }
  }

  /**
   * MCP Tool: outcome_conduct_retrospective
   * Conduct a structured decision retrospective
   */
  async conductRetrospective(params: any) {
    console.log('🔍 MCP: outcome_conduct_retrospective called');
    
    try {
      // Validate required parameters
      if (!params.decisionId) {
        throw new Error('decisionId is required');
      }
      if (!params.retrospectiveType) {
        throw new Error('retrospectiveType is required');
      }
      if (!params.participants || !Array.isArray(params.participants)) {
        throw new Error('participants array is required');
      }
      if (params.overallSatisfaction === undefined || params.overallSatisfaction === null) {
        throw new Error('overallSatisfaction is required (1-10 scale)');
      }
      if (params.wouldDecideSameAgain === undefined || params.wouldDecideSameAgain === null) {
        throw new Error('wouldDecideSameAgain is required (boolean)');
      }
      if (params.recommendationToOthers === undefined || params.recommendationToOthers === null) {
        throw new Error('recommendationToOthers is required (1-10 scale)');
      }
      if (params.retrospectiveQualityScore === undefined || params.retrospectiveQualityScore === null) {
        throw new Error('retrospectiveQualityScore is required (1-10 scale)');
      }

      // Validate score ranges
      if (params.overallSatisfaction < 1 || params.overallSatisfaction > 10) {
        throw new Error('overallSatisfaction must be between 1 and 10');
      }
      if (params.recommendationToOthers < 1 || params.recommendationToOthers > 10) {
        throw new Error('recommendationToOthers must be between 1 and 10');
      }
      if (params.retrospectiveQualityScore < 1 || params.retrospectiveQualityScore > 10) {
        throw new Error('retrospectiveQualityScore must be between 1 and 10');
      }

      const request: ConductRetrospectiveRequest = {
        decisionId: params.decisionId,
        projectId: params.projectId,
        retrospectiveType: params.retrospectiveType,
        participants: params.participants,
        facilitator: params.facilitator,
        overallSatisfaction: params.overallSatisfaction,
        wouldDecideSameAgain: params.wouldDecideSameAgain,
        recommendationToOthers: params.recommendationToOthers,
        whatWentWell: params.whatWentWell,
        whatWentPoorly: params.whatWentPoorly,
        whatWeLearned: params.whatWeLearned,
        whatWeWouldDoDifferently: params.whatWeWouldDoDifferently,
        recommendationsForSimilarDecisions: params.recommendationsForSimilarDecisions,
        processImprovements: params.processImprovements,
        toolsOrResourcesNeeded: params.toolsOrResourcesNeeded,
        unforeseenRisks: params.unforeseenRisks,
        riskMitigationEffectiveness: params.riskMitigationEffectiveness,
        newRisksDiscovered: params.newRisksDiscovered,
        timeToValueActualDays: params.timeToValueActualDays,
        timeToValuePredictedDays: params.timeToValuePredictedDays,
        totalEffortActualHours: params.totalEffortActualHours,
        totalEffortPredictedHours: params.totalEffortPredictedHours,
        stakeholderFeedback: params.stakeholderFeedback,
        adoptionChallenges: params.adoptionChallenges,
        changeManagementLessons: params.changeManagementLessons,
        retrospectiveQualityScore: params.retrospectiveQualityScore,
        actionItems: params.actionItems || [],
        followUpRequired: params.followUpRequired || false,
        followUpDate: params.followUpDate ? new Date(params.followUpDate) : undefined
      };

      const retrospective = await outcomeTracker.conductRetrospective(request);

      // Calculate insights from retrospective data
      const insights = {
        timeVariance: retrospective.timeToValueActualDays && retrospective.timeToValuePredictedDays ?
          retrospective.timeToValueActualDays - retrospective.timeToValuePredictedDays : undefined,
        effortVariance: retrospective.totalEffortActualHours && retrospective.totalEffortPredictedHours ?
          retrospective.totalEffortActualHours - retrospective.totalEffortPredictedHours : undefined,
        netPromoterScore: retrospective.recommendationToOthers - 5, // Simplified NPS calculation
        satisfactionLevel: retrospective.overallSatisfaction >= 8 ? 'high' : 
                          retrospective.overallSatisfaction >= 6 ? 'medium' : 'low'
      };

      return {
        success: true,
        retrospective: {
          id: retrospective.id,
          decisionId: retrospective.decisionId,
          retrospectiveType: retrospective.retrospectiveType,
          retrospectiveDate: retrospective.retrospectiveDate.toISOString(),
          participants: retrospective.participants,
          facilitator: retrospective.facilitator,
          overallSatisfaction: retrospective.overallSatisfaction,
          wouldDecideSameAgain: retrospective.wouldDecideSameAgain,
          recommendationToOthers: retrospective.recommendationToOthers,
          whatWentWell: retrospective.whatWentWell,
          whatWentPoorly: retrospective.whatWentPoorly,
          whatWeLearned: retrospective.whatWeLearned,
          whatWeWouldDoDifferently: retrospective.whatWeWouldDoDifferently,
          recommendationsForSimilarDecisions: retrospective.recommendationsForSimilarDecisions,
          actionItems: retrospective.actionItems,
          followUpRequired: retrospective.followUpRequired,
          followUpDate: retrospective.followUpDate?.toISOString(),
          retrospectiveQualityScore: retrospective.retrospectiveQualityScore
        },
        insights,
        message: `Retrospective completed with ${retrospective.participants.length} participants (satisfaction: ${retrospective.overallSatisfaction}/10)`,
        metadata: {
          tool: 'outcome_conduct_retrospective',
          decisionId: params.decisionId,
          retrospectiveType: params.retrospectiveType,
          conductedAt: new Date().toISOString(),
          participantsCount: retrospective.participants.length,
          actionItemsCount: retrospective.actionItems.length
        }
      };

    } catch (error) {
      console.error('❌ Failed to conduct retrospective:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        tool: 'outcome_conduct_retrospective'
      };
    }
  }

  /**
   * MCP Tool: outcome_get_insights
   * Get learning insights and patterns from decision outcomes
   */
  async getInsights(params: any) {
    console.log('🧠 MCP: outcome_get_insights called');
    
    try {
      const insights = await outcomeTracker.getLearningInsights(
        params.projectId,
        params.insightType,
        params.limit || 20
      );

      // Categorize insights by effectiveness
      const categorizedInsights = {
        highlyEffective: insights.filter(i => (i.applicationSuccessRate || 0) >= 0.8),
        effective: insights.filter(i => (i.applicationSuccessRate || 0) >= 0.6 && (i.applicationSuccessRate || 0) < 0.8),
        needsReview: insights.filter(i => (i.applicationSuccessRate || 0) < 0.6 || i.contradictingEvidenceCount > i.supportingEvidenceCount)
      };

      // Generate summary statistics
      const summary = {
        totalInsights: insights.length,
        avgConfidenceScore: insights.length > 0 ? 
          insights.reduce((sum, i) => sum + i.confidenceScore, 0) / insights.length : 0,
        patternsWithHighConfidence: insights.filter(i => i.confidenceScore >= 0.8).length,
        mostSuccessfulPattern: insights.reduce((best, current) => 
          (current.applicationSuccessRate || 0) > (best.applicationSuccessRate || 0) ? current : best, 
          insights[0] || null
        ),
        insightTypes: [...new Set(insights.map(i => i.insightType))],
        totalApplications: insights.reduce((sum, i) => sum + i.timesApplied, 0)
      };

      return {
        success: true,
        insights: insights.map(insight => ({
          id: insight.id,
          insightType: insight.insightType,
          patternName: insight.patternName,
          patternDescription: insight.patternDescription,
          confidenceScore: insight.confidenceScore,
          supportingEvidenceCount: insight.supportingEvidenceCount,
          contradictingEvidenceCount: insight.contradictingEvidenceCount,
          recommendation: insight.recommendation,
          preventionStrategy: insight.preventionStrategy,
          enhancementStrategy: insight.enhancementStrategy,
          decisionTypes: insight.decisionTypes,
          impactLevels: insight.impactLevels,
          applicableComponents: insight.applicableComponents,
          status: insight.status,
          timesApplied: insight.timesApplied,
          applicationSuccessRate: insight.applicationSuccessRate,
          lastConfirmed: insight.lastConfirmed.toISOString(),
          effectiveness: (insight.applicationSuccessRate || 0) >= 0.8 ? 'highly_effective' :
                        (insight.applicationSuccessRate || 0) >= 0.6 ? 'effective' :
                        (insight.applicationSuccessRate || 0) >= 0.4 ? 'moderately_effective' : 'needs_review'
        })),
        categorizedInsights,
        summary,
        message: `Retrieved ${insights.length} learning insights`,
        metadata: {
          tool: 'outcome_get_insights',
          projectId: params.projectId,
          insightType: params.insightType,
          retrievedAt: new Date().toISOString(),
          insightsCount: insights.length
        }
      };

    } catch (error) {
      console.error('❌ Failed to get insights:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        tool: 'outcome_get_insights'
      };
    }
  }

  /**
   * MCP Tool: outcome_get_analytics
   * Get comprehensive decision analytics and reporting
   */
  async getAnalytics(params: any) {
    console.log('📊 MCP: outcome_get_analytics called');
    
    try {
      const timeframeDays = params.timeframeDays || 90;
      const analytics = await outcomeTracker.getDecisionAnalytics(
        params.projectId,
        timeframeDays
      );

      // Calculate additional insights
      const additionalInsights = {
        decisionVelocity: analytics.summary.totalDecisions > 0 ? 
          (analytics.summary.totalDecisions / timeframeDays) * 30 : 0, // Decisions per month
        outcomeMaturity: analytics.summary.measurementCoverage,
        learningVelocity: analytics.summary.learningInsights > 0 ? 
          (analytics.summary.learningInsights / Math.max(analytics.summary.measuredDecisions, 1)) : 0,
        riskLevel: analytics.riskPatterns.length > 0 ? 
          analytics.riskPatterns.filter(p => p.riskLevel === 'high').length > 0 ? 'high' :
          analytics.riskPatterns.filter(p => p.riskLevel === 'medium').length > 0 ? 'medium' : 'low' : 'unknown'
      };

      // Identify key recommendations
      const recommendations = [];
      
      if (analytics.summary.measurementCoverage < 50) {
        recommendations.push("Increase outcome measurement coverage - less than 50% of decisions have outcome data");
      }
      
      if (analytics.summary.successRate < 70) {
        recommendations.push("Review decision-making process - success rate below 70%");
      }
      
      if (analytics.summary.retrospectivesConducted / Math.max(analytics.summary.totalDecisions, 1) < 0.3) {
        recommendations.push("Conduct more retrospectives - less than 30% of decisions have retrospectives");
      }
      
      if (analytics.riskPatterns.some(p => p.riskLevel === 'high')) {
        recommendations.push("Address high-risk patterns immediately to prevent repeated failures");
      }

      return {
        success: true,
        analytics: {
          timeframe: {
            days: timeframeDays,
            startDate: new Date(Date.now() - timeframeDays * 24 * 60 * 60 * 1000).toISOString(),
            endDate: new Date().toISOString()
          },
          summary: {
            ...analytics.summary,
            decisionVelocity: Math.round(additionalInsights.decisionVelocity * 100) / 100,
            learningVelocity: Math.round(additionalInsights.learningVelocity * 100) / 100,
            riskLevel: additionalInsights.riskLevel
          },
          outcomes: {
            distribution: analytics.outcomeDistribution,
            totalMeasured: Object.values(analytics.outcomeDistribution).reduce((sum, count) => sum + count, 0)
          },
          impacts: {
            networkSize: analytics.impactNetwork.length,
            relationships: analytics.impactNetwork.map(impact => ({
              id: impact.id,
              sourceDecisionId: impact.sourceDecisionId,
              impactedDecisionId: impact.impactedDecisionId,
              impactType: impact.impactType,
              impactStrength: impact.impactStrength,
              impactDirection: impact.impactDirection,
              confidenceScore: impact.confidenceScore
            }))
          },
          trends: {
            metricsTracked: analytics.trendsOverTime.length,
            trends: analytics.trendsOverTime.map(trend => ({
              metricName: trend.metricName,
              metricCategory: trend.metricCategory,
              avgValue: trend.avgValue,
              measurementCount: trend.measurementCount,
              trend: trend.trend,
              timespan: {
                start: trend.firstMeasurement.toISOString(),
                end: trend.lastMeasurement.toISOString()
              }
            }))
          },
          learningInsights: {
            totalInsights: analytics.topInsights.length,
            highConfidenceInsights: analytics.topInsights.filter(i => i.confidenceScore >= 0.8).length,
            patterns: analytics.topInsights.map(insight => ({
              patternName: insight.patternName,
              insightType: insight.insightType,
              confidenceScore: insight.confidenceScore,
              applicableToTypes: insight.decisionTypes,
              recommendation: insight.recommendation
            }))
          },
          risks: {
            totalPatterns: analytics.riskPatterns.length,
            highRiskPatterns: analytics.riskPatterns.filter(p => p.riskLevel === 'high').length,
            patterns: analytics.riskPatterns.map(pattern => ({
              patternName: pattern.patternName,
              riskLevel: pattern.riskLevel,
              failureCount: pattern.failureCount,
              avgFailureScore: pattern.avgFailureScore,
              recommendedMitigation: pattern.recommendedMitigation
            }))
          }
        },
        recommendations,
        message: `Analytics generated for ${analytics.summary.totalDecisions} decisions over ${timeframeDays} days`,
        metadata: {
          tool: 'outcome_get_analytics',
          projectId: params.projectId,
          timeframeDays,
          generatedAt: new Date().toISOString(),
          dataPoints: {
            decisions: analytics.summary.totalDecisions,
            outcomes: analytics.summary.measuredDecisions,
            impacts: analytics.impactNetwork.length,
            insights: analytics.topInsights.length,
            risks: analytics.riskPatterns.length
          }
        }
      };

    } catch (error) {
      console.error('❌ Failed to get analytics:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        tool: 'outcome_get_analytics'
      };
    }
  }

  /**
   * MCP Tool: outcome_predict_success
   * Predict decision success probability using historical patterns
   */
  async predictSuccess(params: any) {
    console.log('🔮 MCP: outcome_predict_success called');
    
    try {
      if (!params.decisionType) {
        throw new Error('decisionType is required');
      }
      if (!params.impactLevel) {
        throw new Error('impactLevel is required');
      }

      // Get historical data for similar decisions
      const insights = await outcomeTracker.getLearningInsights(params.projectId);
      
      // Filter insights relevant to this decision type and impact level
      const relevantInsights = insights.filter(insight => 
        insight.decisionTypes.includes(params.decisionType) &&
        insight.impactLevels.includes(params.impactLevel)
      );

      // Calculate base success probability from historical outcomes
      // This would typically query decision_outcomes for similar decisions
      // For now, we'll use a simplified approach based on insights
      
      let baseSuccessProbability = 0.5; // Default 50%
      let confidenceLevel = 'low';
      let riskFactors: string[] = [];
      let successFactors: string[] = [];
      
      if (relevantInsights.length > 0) {
        // Calculate weighted average success rate from relevant patterns
        const successPatterns = relevantInsights.filter(i => i.insightType === 'success_pattern');
        const failurePatterns = relevantInsights.filter(i => i.insightType === 'failure_pattern');
        
        if (successPatterns.length > 0) {
          const weightedSuccess = successPatterns.reduce((sum, pattern) => 
            sum + (pattern.applicationSuccessRate || 0.7) * pattern.confidenceScore, 0
          );
          const totalWeight = successPatterns.reduce((sum, pattern) => sum + pattern.confidenceScore, 0);
          
          if (totalWeight > 0) {
            baseSuccessProbability = Math.min(0.95, Math.max(0.05, weightedSuccess / totalWeight));
            confidenceLevel = totalWeight > 2 ? 'high' : totalWeight > 1 ? 'medium' : 'low';
          }
          
          successFactors = successPatterns.map(p => p.enhancementStrategy || p.recommendation).filter(Boolean) as string[];
        }
        
        if (failurePatterns.length > 0) {
          // Reduce probability based on failure patterns
          const failureRisk = failurePatterns.reduce((risk, pattern) => 
            risk + (1 - (pattern.applicationSuccessRate || 0.3)) * pattern.confidenceScore, 0
          ) / failurePatterns.length;
          
          baseSuccessProbability = Math.max(0.05, baseSuccessProbability - (failureRisk * 0.3));
          riskFactors = failurePatterns.map(p => p.preventionStrategy || p.recommendation).filter(Boolean) as string[];
        }
      }

      // Adjust probability based on provided context
      let adjustedProbability = baseSuccessProbability;
      const adjustmentFactors: string[] = [];
      
      // Adjust for team experience
      if (params.teamExperience === 'high') {
        adjustedProbability = Math.min(0.95, adjustedProbability + 0.1);
        adjustmentFactors.push('High team experience (+10%)');
      } else if (params.teamExperience === 'low') {
        adjustedProbability = Math.max(0.05, adjustedProbability - 0.15);
        adjustmentFactors.push('Low team experience (-15%)');
      }
      
      // Adjust for timeline pressure
      if (params.timelinePressure === 'high') {
        adjustedProbability = Math.max(0.05, adjustedProbability - 0.2);
        adjustmentFactors.push('High timeline pressure (-20%)');
      } else if (params.timelinePressure === 'low') {
        adjustedProbability = Math.min(0.95, adjustedProbability + 0.1);
        adjustmentFactors.push('Adequate timeline (+10%)');
      }
      
      // Adjust for complexity
      if (params.complexity === 'high') {
        adjustedProbability = Math.max(0.05, adjustedProbability - 0.15);
        adjustmentFactors.push('High complexity (-15%)');
      } else if (params.complexity === 'low') {
        adjustedProbability = Math.min(0.95, adjustedProbability + 0.1);
        adjustmentFactors.push('Low complexity (+10%)');
      }
      
      // Adjust for stakeholder alignment
      if (params.stakeholderAlignment === 'high') {
        adjustedProbability = Math.min(0.95, adjustedProbability + 0.15);
        adjustmentFactors.push('High stakeholder alignment (+15%)');
      } else if (params.stakeholderAlignment === 'low') {
        adjustedProbability = Math.max(0.05, adjustedProbability - 0.25);
        adjustmentFactors.push('Low stakeholder alignment (-25%)');
      }

      // Generate specific recommendations
      const recommendations = [];
      
      if (adjustedProbability < 0.6) {
        recommendations.push("Consider delaying decision to address risk factors");
        recommendations.push("Conduct additional stakeholder alignment sessions");
        if (params.complexity === 'high') {
          recommendations.push("Break down the decision into smaller, less complex components");
        }
      }
      
      if (riskFactors.length > 0) {
        recommendations.push("Implement risk mitigation strategies based on historical failures");
      }
      
      if (successFactors.length > 0) {
        recommendations.push("Apply success factors from similar past decisions");
      }

      const prediction = {
        baseProbability: Math.round(baseSuccessProbability * 100),
        adjustedProbability: Math.round(adjustedProbability * 100),
        confidenceLevel,
        riskLevel: adjustedProbability < 0.4 ? 'high' : adjustedProbability < 0.7 ? 'medium' : 'low',
        historicalDataPoints: relevantInsights.length,
        adjustmentFactors,
        riskFactors,
        successFactors,
        recommendations
      };

      await logEvent({
        actor: 'ai',
        event_type: 'decision_success_predicted',
        payload: {
          decision_type: params.decisionType,
          impact_level: params.impactLevel,
          predicted_probability: adjustedProbability,
          confidence_level: confidenceLevel,
          historical_data_points: relevantInsights.length,
          risk_level: prediction.riskLevel
        },
        status: 'closed',
        tags: ['prediction', 'decision-support', 'ml-insights']
      });

      return {
        success: true,
        prediction,
        message: `Success probability: ${prediction.adjustedProbability}% (${prediction.confidenceLevel} confidence)`,
        metadata: {
          tool: 'outcome_predict_success',
          decisionType: params.decisionType,
          impactLevel: params.impactLevel,
          predictedAt: new Date().toISOString(),
          basedOnInsights: relevantInsights.length
        }
      };

    } catch (error) {
      console.error('❌ Failed to predict success:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        tool: 'outcome_predict_success'
      };
    }
  }
}

// Export singleton instance
export const outcomeTrackingHandler = new OutcomeTrackingHandler();