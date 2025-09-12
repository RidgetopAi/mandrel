# AIDIS MCP Server Performance Baseline Report

**Generated**: 2025-09-12T19:41:01.342Z  
**Test Duration**: 3s  
**Tools Tested**: 17 core tools  
**Success Rate**: 82%

---

## Executive Summary

⚡ **Overall Performance**: Good  
📊 **Average Response Time**: 12.87ms  
📊 **95th Percentile**: 59.350271ms  
📊 **99th Percentile**: 59.350271ms  
💾 **Memory Usage**: 2MB avg, 2MB peak  
🔄 **Memory Growth**: 0MB during test

---

## Response Time Statistics

| Metric | Value | Assessment |
|--------|-------|------------|
| Average | 12.87ms | ✅ Excellent |
| P95 | 59.350271ms | ✅ Good |
| P99 | 59.350271ms | ✅ Good |
| Min | 2.104043ms | Fastest response |
| Max | 59.350271ms | Slowest response |

---

## System Health Endpoints

| Endpoint | Response Time | Status |
|----------|---------------|---------|
| http://localhost:8080/healthz | 23.35ms | ✅ 200 |
| http://localhost:8080/readyz | 1.49ms | ✅ 200 |

---

## Database Performance

| Query | Response Time | Status |
|-------|---------------|---------|
| SELECT current_database(); | 27.94ms | ✅ |
| SELECT COUNT(*) FROM contexts; | 25.08ms | ✅ |
| SELECT COUNT(*) FROM projects; | 24.37ms | ✅ |
| SELECT COUNT(*) FROM sessions; | 25.22ms | ✅ |

---

## Memory Usage Analysis

| Metric | Value |
|--------|-------|
| Initial Memory | 2MB |
| Peak Memory | 2MB |
| Average Memory | 2MB |
| Memory Growth | 0MB |
| Memory Efficiency | ✅ Stable |

### Memory Usage Timeline
- 2025-09-12T19:40:58.610Z: 2MB (CPU: 0%)
- 2025-09-12T19:40:58.795Z: 2MB (CPU: 0%)
- 2025-09-12T19:40:59.278Z: 2MB (CPU: 0%)
- 2025-09-12T19:40:59.717Z: 2MB (CPU: 0%)
- 2025-09-12T19:41:00.134Z: 2MB (CPU: 0%)
- 2025-09-12T19:41:00.580Z: 2MB (CPU: 0%)
- 2025-09-12T19:41:01.073Z: 2MB (CPU: 0%)
- 2025-09-12T19:41:01.342Z: 2MB (CPU: 0%)

---

## Tool Performance Details

### Successful Tools (14)
- **aidis_ping**: 4.8ms
- **aidis_status**: 3.4ms
- **aidis_help**: 2.1ms
- **context_search**: 59.4ms
- **context_get_recent**: 6.8ms
- **context_stats**: 11.4ms
- **project_list**: 7.5ms
- **project_current**: 3.2ms
- **project_info**: 3.8ms
- **session_status**: 3.7ms
- **naming_stats**: 6.1ms
- **decision_stats**: 10.0ms
- **code_stats**: 12.3ms
- **smart_search**: 45.6ms



### Failed Tools (3)
- **metrics_get_performance**: HTTP 500 ❌
- **complexity_get_performance**: HTTP 500 ❌
- **pattern_get_performance**: HTTP 500 ❌

---

## Performance Assessment

### Strengths
- ⚡ Excellent average response times (<200ms)
- 📊 Good 95th percentile performance (<500ms)
- 💾 Efficient memory usage (<300MB peak)
- 🔒 Stable memory profile (minimal growth during testing)

### Areas for Improvement
- ❌ Tool failures (3) - investigate error handling and parameter validation

---

## Recommendations

- 🎯 **Error Handling**: Improve parameter validation and error responses
- 📊 **Monitoring**: Set up continuous performance monitoring with alerting
- 🔄 **Regular Testing**: Run performance baselines weekly to track trends
- 📈 **Scaling Preparation**: Document current limits for capacity planning

---

**Baseline Timestamp**: 2025-09-12T19:41:01.342Z  
**Next Recommended Test**: 24-48 hours for trend analysis
## Additional System Metrics

### PostgreSQL Slow Query Analysis

### System Resource Utilization
- **AIDIS Server Process**:   43263  3168  0.0       00:00
- **Database Connections**: 3
- **Database Size**: 25MB

### Table Statistics
 schemaname |                       relname                        | n_tup_ins | n_tup_upd | n_tup_del | seq_scan 
------------+------------------------------------------------------+-----------+-----------+-----------+----------
 public     | sessions                                             |       195 |        54 |         0 |     3871
 public     | user_sessions                                        |         4 |         0 |         0 |     2436
 public     | projects                                             |        74 |        11 |        63 |     2288
 public     | admin_users                                          |         0 |         4 |         0 |      462
 public     | contexts                                             |         7 |         0 |         0 |      365
 public     | tasks                                                |        11 |         9 |         0 |      178
 public     | technical_decisions                                  |         0 |         0 |         0 |      128
 public     | code_components                                      |         0 |         0 |         0 |       93
