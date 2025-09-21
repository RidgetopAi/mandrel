# AIDIS Tool Repair & Validation Project Plan

**Project**: Complete TT009 Consolidation + Fix Tool Validation Issues
**Status**: Ready for Implementation
**Priority**: High - 64% of tools need fixes
**Timeline**: 2-3 days (systematic approach)

---

## 🎯 Executive Summary

After successful TT009 tool consolidation (96→47 tools, ~22,500 token savings), comprehensive testing revealed that **30 of 47 tools (64%) need fixes**. The primary issue is **missing validation schemas** for consolidated tools, not broken functionality. This plan systematically addresses all issues to achieve **100% tool functionality**.

**Current State**: 17/47 tools fully working (36%)
**Target State**: 47/47 tools fully working (100%)
**Risk Level**: Low (mostly schema additions, not logic changes)

---

## 📊 Issue Classification & Priority

### **Priority 1: Validation Schema Issues (Critical)**
**Impact**: 16 tools completely broken
**Effort**: Medium (schema definitions)
**Risk**: Low (no logic changes needed)

- **TT009 Consolidated Tools (8 tools)**: Missing validation schemas
  - complexity_analyze, complexity_insights, complexity_manage
  - metrics_collect, metrics_analyze, metrics_control
  - pattern_analyze, pattern_insights

- **Git Integration Tools (3 tools)**: Missing validation schemas
  - git_session_commits, git_commit_sessions, git_correlate_session

- **Session Tools (2 tools)**: Missing validation schemas
  - session_update, session_details

- **Parameter Issues (3 tools)**: Wrong parameter names in schemas
  - naming_register (missing canonicalName)
  - task_update (missing taskId parameter)

### **Priority 2: Data Quality Issues (Medium)**
**Impact**: 2 tools partially working
**Effort**: Low-Medium (output formatting)
**Risk**: Low (display issues only)

- **naming_suggest**: Returns [object Object] instead of formatted strings
- **smart_search**: Low relevance results, needs algorithm improvement

### **Priority 3: Untested Tools (Low)**
**Impact**: 12 tools status unknown
**Effort**: Low (testing only)
**Risk**: Very Low (likely working, just untested)

- Create/update operations that need validation testing
- Complex tools that require specific test data

---

## 🗺️ Implementation Strategy

### **Phase 1: Schema Validation Fixes (Day 1)**
*Priority 1 issues - restore broken tool functionality*

**Goal**: Fix all validation schema errors
**Success Criteria**: All tools accept parameters without validation errors
**Estimated Time**: 4-6 hours

#### **1.1: TT009 Consolidated Tools Schema Addition**
- **Location**: `/mcp-server/src/server.ts` tool definitions
- **Action**: Add comprehensive parameter validation schemas
- **Tools**: 8 consolidated tools (complexity, metrics, patterns)

#### **1.2: Git Integration Tools Schema Addition**
- **Location**: `/mcp-server/src/server.ts` tool definitions
- **Action**: Add validation schemas based on handler implementations
- **Tools**: 3 git correlation tools

#### **1.3: Session Tools Schema Fix**
- **Location**: `/mcp-server/src/server.ts` tool definitions
- **Action**: Add missing session_update and session_details schemas
- **Tools**: 2 session management tools

#### **1.4: Parameter Name Corrections**
- **Location**: `/mcp-server/src/server.ts` tool definitions
- **Action**: Fix parameter name mismatches
- **Tools**: naming_register, task_update

### **Phase 2: Data Quality & Output Fixes (Day 2)**
*Priority 2 issues - improve user experience*

**Goal**: Fix output formatting and search relevance
**Success Criteria**: Clean, properly formatted tool outputs
**Estimated Time**: 2-3 hours

#### **2.1: Fix naming_suggest Output Formatting**
- **Location**: `/mcp-server/src/handlers/naming.ts`
- **Issue**: Returns [object Object] instead of readable strings
- **Action**: Fix JSON serialization in response formatting

#### **2.2: Improve smart_search Relevance**
- **Location**: `/mcp-server/src/handlers/smartSearch.ts`
- **Issue**: Low relevance scores, poor result matching
- **Action**: Review and improve search algorithm parameters

### **Phase 3: Comprehensive Testing & Validation (Day 3)**
*Priority 3 items + complete system validation*

**Goal**: Test all tools and validate complete functionality
**Success Criteria**: 100% tool success rate, comprehensive documentation
**Estimated Time**: 4-5 hours

#### **3.1: Systematic Tool Testing**
- Test all 47 tools with realistic parameters
- Document expected vs actual behavior
- Create test case library for future regressions

#### **3.2: Integration Testing**
- Test tool interactions and workflows
- Validate consolidated tool delegation works correctly
- Test error handling and edge cases

#### **3.3: Documentation Update**
- Update AIDIS_TOOLS.md with 100% success rate
- Create tool usage examples and best practices
- Document any remaining limitations or known issues

---

## 🧪 Testing Strategy

### **Testing Framework**
- **Manual Testing**: Direct MCP tool calls for validation
- **Automated Testing**: Scripted test suites for regression prevention
- **Integration Testing**: Workflow-based testing across tool categories
- **Performance Testing**: Validate consolidation doesn't impact speed

### **Test Categories**

#### **1. Validation Testing**
**Purpose**: Verify all tools accept valid parameters
**Method**: Call each tool with standard parameter sets
```bash
# Example test patterns
aidis_ping()
context_store("test", "planning", ["test"])
complexity_analyze("file_analysis", "/path/to/file")
```

#### **2. Functionality Testing**
**Purpose**: Verify tools produce expected outputs
**Method**: Test core functionality with real data
```bash
# Verify outputs match expected schemas
project_current() -> should return project info
task_list("completed") -> should return completed tasks
```

#### **3. Error Handling Testing**
**Purpose**: Verify graceful error handling
**Method**: Test invalid parameters, missing files, etc.
```bash
# Test error conditions
code_analyze("/nonexistent/file") -> should return helpful error
naming_check("", "") -> should validate required parameters
```

#### **4. Performance Testing**
**Purpose**: Ensure consolidation maintains performance
**Method**: Measure response times before/after fixes
```bash
# Benchmark key operations
time complexity_analyze("file_analysis", "large_file.ts")
time metrics_collect("project_metrics")
```

### **Test Data Requirements**
- **File Paths**: Use existing AIDIS codebase files
- **Project Names**: Use "aidis-bootstrap" (current project)
- **Session IDs**: Use current session for session-related tests
- **Valid Parameters**: Reference handler implementations for parameter formats

### **Success Criteria Per Phase**

#### **Phase 1 Success Criteria**
- [ ] All 16 validation error tools now accept parameters
- [ ] Server starts without errors after schema additions
- [ ] HTTP bridge recognizes all tool definitions
- [ ] No regression in currently working tools

#### **Phase 2 Success Criteria**
- [ ] naming_suggest returns properly formatted suggestion strings
- [ ] smart_search returns relevant results with higher relevance scores
- [ ] All output formatting is consistent and readable
- [ ] No new validation errors introduced

#### **Phase 3 Success Criteria**
- [ ] All 47 tools respond without errors to valid parameters
- [ ] Comprehensive test suite created and passing
- [ ] Updated documentation reflects 100% functionality
- [ ] Performance benchmarks show no degradation

---

## 🔧 Technical Implementation Details

### **Schema Definition Pattern**
Based on working tools, use this pattern for consolidated tools:

```typescript
// Example schema structure for consolidated tools
{
  name: "complexity_analyze",
  description: "TT009-1-1: Unified complexity analysis operations",
  inputSchema: {
    type: "object",
    properties: {
      operation: {
        type: "string",
        enum: ["file_analysis", "commit_analysis", "detailed_metrics"],
        description: "Analysis operation to perform"
      },
      filePath: {
        type: "string",
        description: "File path for file_analysis operation"
      },
      // Additional operation-specific parameters...
    },
    required: ["operation"],
    additionalProperties: true
  }
}
```

### **File Locations & Modifications**

#### **Primary File**: `/mcp-server/src/server.ts`
- **Section**: Tool definitions array (~line 6000+)
- **Action**: Add missing validation schemas
- **Pattern**: Follow existing working tool schema formats

#### **Handler Files** (if output fixes needed):
- `/mcp-server/src/handlers/naming.ts` - Fix naming_suggest formatting
- `/mcp-server/src/handlers/smartSearch.ts` - Improve search relevance

#### **Testing Files**:
- Create `/tests/tool-validation-suite.ts` - Comprehensive test suite
- Update `/test-complete-aidis.ts` - Include new validation tests

### **Risk Mitigation**

#### **Backup Strategy**
- Git tag before starting: `git tag tool-repair-baseline`
- Incremental commits after each phase
- Rollback plan if issues discovered

#### **Testing Safety**
- Test in development environment first
- Use existing project data (no test data pollution)
- Validate no impact on working tools before proceeding

#### **Quality Assurance**
- Code review validation schema additions
- Cross-reference handler implementations for parameter accuracy
- Document any design decisions or trade-offs made

---

## 📈 Expected Outcomes

### **Immediate Benefits**
- **Tool Availability**: 64% → 100% (30 additional working tools)
- **User Experience**: Complete AIDIS functionality accessible
- **Consolidation Completion**: TT009 project fully delivered
- **Token Efficiency**: Maintain 22,500 token savings with full functionality

### **Long-term Benefits**
- **Regression Prevention**: Comprehensive test suite prevents future breaks
- **Documentation Accuracy**: Updated guide reflects true tool capabilities
- **Development Velocity**: All AIDIS capabilities available for future work
- **System Reliability**: Confidence in tool ecosystem stability

### **Success Metrics**
- **Tool Success Rate**: 36% → 100%
- **Validation Errors**: 16 → 0
- **User Issues**: Eliminate "tool not working" reports
- **Test Coverage**: 0% → 100% automated tool validation

---

## 🎯 Next Steps & Execution

### **Immediate Actions**
1. **Review & Approve Plan**: Validate approach and timeline
2. **Create Baseline**: Git tag current state for safety
3. **Begin Phase 1**: Start with validation schema additions
4. **Track Progress**: Use AIDIS task tracking for systematic approach

### **Success Dependencies**
- **Access**: Ability to modify `/mcp-server/src/server.ts`
- **Testing**: Ability to restart AIDIS server for validation
- **Time**: Dedicated focus for systematic implementation
- **Validation**: Test each phase before proceeding

### **Completion Criteria**
- All 47 tools functional and documented
- Comprehensive test suite created
- AIDIS_TOOLS.md updated to 100% success rate
- TT009 consolidation project fully complete

---

**Project Owner**: AI Development Team
**Timeline**: 2-3 days (systematic phases)
**Priority**: High (completes major consolidation initiative)
**Risk**: Low (mostly schema work, well-understood scope)

*This plan transforms AIDIS from 36% tool functionality to 100% tool functionality, completing the TT009 consolidation vision while establishing robust testing practices for future development.*