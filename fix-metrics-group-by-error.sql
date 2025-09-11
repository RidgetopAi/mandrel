-- Fix for PostgreSQL GROUP BY error in calculate_metric_classifications function
-- The issue is in the percentile rank calculation - it needs to use a proper subquery join

CREATE OR REPLACE FUNCTION calculate_metric_classifications() 
RETURNS TRIGGER AS $$
BEGIN
    -- Update timestamps
    IF TG_OP = 'INSERT' THEN
        NEW.created_at = CURRENT_TIMESTAMP;
        NEW.updated_at = CURRENT_TIMESTAMP;
    ELSIF TG_OP = 'UPDATE' THEN
        NEW.updated_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Auto-calculate percentile ranks for core metrics
    IF TG_TABLE_NAME = 'core_development_metrics' THEN
        -- Calculate percentile rank within same metric type
        -- Fixed: Use proper subquery instead of cross join
        NEW.percentile_rank = (
            WITH total_metrics AS (
                SELECT COUNT(*) as total_count
                FROM core_development_metrics 
                WHERE metric_type = NEW.metric_type 
                    AND project_id = NEW.project_id
                    AND is_active = TRUE
            ),
            rank_calculation AS (
                SELECT COUNT(*) as rank_count
                FROM core_development_metrics cdm
                WHERE cdm.metric_type = NEW.metric_type 
                    AND cdm.project_id = NEW.project_id
                    AND cdm.is_active = TRUE
                    AND cdm.metric_value <= NEW.metric_value
            )
            SELECT 
                CASE 
                    WHEN tm.total_count = 0 THEN 0::DECIMAL
                    ELSE rc.rank_count::DECIMAL / tm.total_count::DECIMAL
                END
            FROM total_metrics tm, rank_calculation rc
        );
        
        -- Auto-classify change significance
        IF NEW.baseline_value IS NOT NULL AND NEW.baseline_value > 0 THEN
            NEW.percent_change_from_baseline = ((NEW.metric_value - NEW.baseline_value) / NEW.baseline_value) * 100;
            
            NEW.change_significance = CASE 
                WHEN ABS(NEW.percent_change_from_baseline) >= 50 THEN 'major'
                WHEN ABS(NEW.percent_change_from_baseline) >= 25 THEN 'significant'
                WHEN ABS(NEW.percent_change_from_baseline) >= 10 THEN 'moderate'
                WHEN ABS(NEW.percent_change_from_baseline) >= 5 THEN 'minor'
                ELSE 'insignificant'
            END;
        END IF;
        
        -- Check for threshold alerts
        IF (NEW.threshold_high IS NOT NULL AND NEW.metric_value > NEW.threshold_high) OR
           (NEW.threshold_low IS NOT NULL AND NEW.metric_value < NEW.threshold_low) THEN
            NEW.alert_triggered = TRUE;
            NEW.alert_severity = CASE 
                WHEN NEW.threshold_high IS NOT NULL AND NEW.metric_value > NEW.threshold_high * 1.5 THEN 'critical'
                WHEN NEW.threshold_low IS NOT NULL AND NEW.metric_value < NEW.threshold_low * 0.5 THEN 'critical'
                WHEN NEW.threshold_high IS NOT NULL AND NEW.metric_value > NEW.threshold_high * 1.2 THEN 'high'
                WHEN NEW.threshold_low IS NOT NULL AND NEW.metric_value < NEW.threshold_low * 0.8 THEN 'high'
                ELSE 'medium'
            END;
        ELSE
            NEW.alert_triggered = FALSE;
            NEW.alert_severity = NULL;
        END IF;
    END IF;
    
    -- Similar classification logic for other metric types would go here
    -- (pattern_intelligence_metrics, productivity_health_metrics)
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;