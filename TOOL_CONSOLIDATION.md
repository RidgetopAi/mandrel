# AIDIS MCP Tool Consolidation Plan
## Token Optimization & System Streamlining

**Created**: 2025-09-20
**Goal**: Reduce MCP tool token usage by 15,000+ tokens (42% reduction)
**Current**: 96 tools (~36k tokens) → **Target**: 57 tools (~21k tokens)
**Impact**: <5% functionality loss, zero building capability impact

---

## 📊 EXECUTIVE SUMMARY

AIDIS has evolved into an over-engineered system with massive tool redundancy in analytics layers. The core building tools (39 tools) are excellent and should be preserved. The optimization targets 57 redundant analytics tools that provide overlapping functionality while consuming 60% of token space.

**Key Insight**: We built an academic research platform when we needed a practical development tool.

---

## 🎯 OPTIMIZATION PHASES

### **Phase 1: Complexity Tools Consolidation**
**Target**: 16 tools → 3 tools
**Token Savings**: ~6,000 tokens
**Risk**: Low (pure consolidation)
**Duration**: 2-3 hours

#### Current Complexity Tools (16)
```
complexity_analyze_files          complexity_get_dashboard
complexity_get_file_metrics       complexity_get_function_metrics
complexity_get_hotspots           complexity_get_alerts
complexity_acknowledge_alert      complexity_resolve_alert
complexity_get_refactoring_opportunities
complexity_get_trends             complexity_get_technical_debt
complexity_analyze_commit         complexity_set_thresholds
complexity_get_performance        complexity_start_tracking
complexity_stop_tracking
```

#### Consolidated Complexity Tools (3)
1. **`complexity_analyze`** - Combines file, commit, and function analysis
   ```typescript
   // Replaces: analyze_files, analyze_commit, get_file_metrics, get_function_metrics
   complexity_analyze(target: string, type: 'file' | 'commit' | 'function', options?: AnalysisOptions)
   ```

2. **`complexity_insights`** - Dashboard, hotspots, trends, technical debt
   ```typescript
   // Replaces: get_dashboard, get_hotspots, get_trends, get_technical_debt, get_refactoring_opportunities
   complexity_insights(view: 'dashboard' | 'hotspots' | 'trends' | 'debt' | 'refactoring', filters?: InsightFilters)
   ```

3. **`complexity_manage`** - Control, alerts, thresholds
   ```typescript
   // Replaces: start_tracking, stop_tracking, get_alerts, acknowledge_alert, resolve_alert, set_thresholds, get_performance
   complexity_manage(action: 'start' | 'stop' | 'alerts' | 'acknowledge' | 'resolve' | 'thresholds' | 'performance', params?: ManageParams)
   ```

---

### **Phase 2: Metrics Tools Consolidation**
**Target**: 17 tools → 3 tools
**Token Savings**: ~6,500 tokens
**Risk**: Low (pure consolidation)
**Duration**: 2-3 hours

#### Current Metrics Tools (17)
```
metrics_collect_project           metrics_get_dashboard
metrics_get_core_metrics          metrics_get_pattern_intelligence
metrics_get_productivity_health   metrics_get_alerts
metrics_acknowledge_alert         metrics_resolve_alert
metrics_get_trends                metrics_get_performance
metrics_start_collection          metrics_stop_collection
metrics_aggregate_projects        metrics_aggregate_timeline
metrics_calculate_correlations    metrics_get_executive_summary
metrics_export_data
```

#### Consolidated Metrics Tools (3)
1. **`metrics_collect`** - Data collection and core metrics
   ```typescript
   // Replaces: collect_project, get_core_metrics, get_pattern_intelligence, get_productivity_health
   metrics_collect(scope: 'project' | 'core' | 'patterns' | 'productivity', target?: string)
   ```

2. **`metrics_analyze`** - Dashboard, trends, correlations
   ```typescript
   // Replaces: get_dashboard, get_trends, aggregate_projects, aggregate_timeline, calculate_correlations, get_executive_summary
   metrics_analyze(analysis: 'dashboard' | 'trends' | 'correlations' | 'executive', aggregation?: AggregationOptions)
   ```

3. **`metrics_control`** - Collection control, alerts, export
   ```typescript
   // Replaces: start_collection, stop_collection, get_alerts, acknowledge_alert, resolve_alert, get_performance, export_data
   metrics_control(operation: 'start' | 'stop' | 'alerts' | 'acknowledge' | 'resolve' | 'performance' | 'export', params?: ControlParams)
   ```

---

### **Phase 3: Pattern Detection Consolidation**
**Target**: 17 tools → 2 tools
**Token Savings**: ~7,000 tokens
**Risk**: Low (pure consolidation)
**Duration**: 2-3 hours

#### Current Pattern Detection Tools (17)
```
pattern_detection_start           pattern_detection_stop
pattern_detection_status          pattern_detect_commits
pattern_track_git_activity        pattern_get_alerts
pattern_get_session_insights      pattern_analyze_project
pattern_analyze_session           pattern_analyze_commit
pattern_get_discovered            pattern_get_insights
pattern_get_trends                pattern_get_correlations
pattern_get_anomalies             pattern_get_recommendations
pattern_get_performance
```

#### Consolidated Pattern Tools (2)
1. **`pattern_analyze`** - Detection, analysis, tracking
   ```typescript
   // Replaces: detection_start, detection_stop, detection_status, detect_commits, track_git_activity, analyze_project, analyze_session, analyze_commit, get_discovered, get_performance
   pattern_analyze(target: 'project' | 'session' | 'commit' | 'git', action: 'start' | 'stop' | 'status' | 'analyze', options?: PatternOptions)
   ```

2. **`pattern_insights`** - Insights, correlations, recommendations
   ```typescript
   // Replaces: get_alerts, get_session_insights, get_insights, get_trends, get_correlations, get_anomalies, get_recommendations
   pattern_insights(type: 'alerts' | 'session' | 'trends' | 'correlations' | 'anomalies' | 'recommendations', filters?: InsightFilters)
   ```

---

### **Phase 4: Academic Feature Removal**
**Target**: 7 tools → 0 tools
**Token Savings**: ~3,000 tokens
**Risk**: Low (academic features, not used for building)
**Duration**: 30 minutes

#### Academic Tools to Remove (7)
```
outcome_record                    outcome_track_metric
outcome_analyze_impact            outcome_conduct_retrospective
outcome_get_insights              outcome_get_analytics
outcome_predict_success
```

**Justification**: These are academic research tools that don't support practical project building:
- Retrospective analysis is overhead for active development
- Predictive success modeling is academic research
- Impact analysis can be done through existing metrics tools
- Decision tracking already covers practical outcomes

---

### **Phase 5: Final Validation & Documentation**
**Target**: Update documentation and test consolidated tools
**Duration**: 1 hour

1. Update CLAUDE.md with new tool inventory
2. Test all consolidated tools for functionality
3. Update any integration tests
4. Document migration guide for existing usage

---

## 🔧 IMPLEMENTATION STRATEGY

### **Backward Compatibility Approach**
1. **Implement new consolidated tools** alongside existing tools
2. **Add deprecation warnings** to old tools
3. **Test consolidated functionality** thoroughly
4. **Remove old tools** after validation
5. **Update documentation** to reflect changes

### **Tool Implementation Priority**
1. **Phase 1 (Complexity)** - Lowest risk, highest token savings
2. **Phase 2 (Metrics)** - Medium complexity, high savings
3. **Phase 3 (Patterns)** - Most complex, but high value
4. **Phase 4 (Academic)** - Simple removal, immediate savings

### **Rollback Strategy**
- Keep old tool implementations commented out for 1 week
- Git tag before each phase: `tool-consolidation-phase-N`
- Quick rollback script to restore old tools if needed

---

## 📊 EXPECTED OUTCOMES

### **Token Usage Reduction**
| Phase | Tools Removed | Token Savings | Cumulative Savings |
|-------|---------------|---------------|-------------------|
| Phase 1 | 13 complexity | ~6,000 | 6,000 (17%) |
| Phase 2 | 14 metrics | ~6,500 | 12,500 (35%) |
| Phase 3 | 15 patterns | ~7,000 | 19,500 (54%) |
| Phase 4 | 7 academic | ~3,000 | 22,500 (63%) |
| **Total** | **49 tools** | **22,500** | **22,500 (63%)** |

**Conservative Estimate**: 15,000 token reduction (42%)
**Optimistic Estimate**: 22,500 token reduction (63%)

### **Functionality Preservation**
- ✅ **Core Building Tools**: 100% preserved (39 tools)
- ✅ **Analytics Capability**: 95% preserved through consolidation
- ✅ **System Health**: 100% preserved
- ✅ **Development Workflow**: Zero impact

### **Developer Experience Improvements**
- **Simpler API**: Fewer tools to remember
- **Consistent Patterns**: Unified parameter structures
- **Better Documentation**: Clearer tool purposes
- **Faster Context Loading**: 15k+ fewer tokens per session

---

## ⚠️ RISKS & MITIGATION

### **Low Risk Items**
- **Tool Consolidation**: Pure functional merging, no logic changes
- **Academic Removal**: Features not used for practical building
- **Documentation Updates**: Straightforward updates

### **Medium Risk Items**
- **Parameter Changes**: New unified parameter structures
- **Integration Updates**: Existing code may reference old tools

### **Mitigation Strategies**
1. **Comprehensive Testing**: Test all consolidated tools before removal
2. **Gradual Migration**: Implement alongside existing tools first
3. **Documentation**: Clear migration guide for any existing usage
4. **Rollback Plan**: Quick restore capability for 1 week

---

## 🚀 SUCCESS CRITERIA

### **Phase Completion Criteria**
- [ ] All consolidated tools implemented and tested
- [ ] Token usage reduced by target amount
- [ ] No loss of critical functionality
- [ ] Documentation updated
- [ ] Integration tests passing

### **Overall Success Metrics**
- **Token Reduction**: ≥15,000 tokens (42% minimum)
- **Tool Count**: ≤57 tools total
- **Functionality**: ≥95% capability preservation
- **Performance**: No degradation in response times
- **Usability**: Improved developer experience

---

## 📋 EXECUTION CHECKLIST

### **Pre-Implementation**
- [ ] Back up current MCP server implementation
- [ ] Create `tool-consolidation-baseline` git tag
- [ ] Document current tool usage patterns
- [ ] Set up testing environment

### **Phase 1: Complexity Tools**
- [ ] Implement `complexity_analyze` tool
- [ ] Implement `complexity_insights` tool
- [ ] Implement `complexity_manage` tool
- [ ] Test all complexity functionality
- [ ] Add deprecation warnings to old tools
- [ ] Remove old complexity tools
- [ ] Update documentation

### **Phase 2: Metrics Tools**
- [ ] Implement `metrics_collect` tool
- [ ] Implement `metrics_analyze` tool
- [ ] Implement `metrics_control` tool
- [ ] Test all metrics functionality
- [ ] Add deprecation warnings to old tools
- [ ] Remove old metrics tools
- [ ] Update documentation

### **Phase 3: Pattern Tools**
- [ ] Implement `pattern_analyze` tool
- [ ] Implement `pattern_insights` tool
- [ ] Test all pattern functionality
- [ ] Add deprecation warnings to old tools
- [ ] Remove old pattern tools
- [ ] Update documentation

### **Phase 4: Academic Removal**
- [ ] Remove all outcome_* tools
- [ ] Update documentation
- [ ] Clean up handler files
- [ ] Test system functionality

### **Phase 5: Final Validation**
- [ ] Run comprehensive integration tests
- [ ] Validate token count reduction
- [ ] Update CLAUDE.md
- [ ] Create migration guide
- [ ] Performance benchmark comparison

---

## 🎯 CONCLUSION

This consolidation plan transforms AIDIS from an over-engineered academic research platform into a streamlined, practical development tool. By eliminating redundancy and consolidating overlapping functionality, we achieve:

1. **Massive Token Savings**: 15-22k token reduction
2. **Improved Usability**: Simpler, more intuitive API
3. **Preserved Functionality**: All practical building capabilities retained
4. **Better Performance**: Faster context loading and processing

The key insight is that **we built a research platform when we needed a development tool**. This consolidation aligns the tool set with practical project building needs while dramatically improving efficiency.

**Estimated Total Implementation Time**: 8-10 hours across all phases
**Risk Level**: Low (mostly consolidation with clear rollback paths)
**Impact**: Transformational improvement in system efficiency

---

*This plan maintains AIDIS's core strength as a development intelligence system while eliminating the academic overhead that was consuming excessive token space without supporting practical project building.*
