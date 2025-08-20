# ORACLE COMPREHENSIVE FIX PLAN - AIDIS MCP VALIDATION LAYER ALIGNMENT

## ✅ UPDATED ROOT-CAUSE ANALYSIS (Phase 2 Discovery)
────────────────────────────────────────────────
**BREAKTHROUGH**: The issue is NOT duplicate source trees, but systematic parameter mapping mismatches between validation layers!

1. **Three-Layer Validation System Identified**:
   • **Layer 1**: MCP JSON Schema (server.ts) - Client parameter definitions ✅ CORRECT
   • **Layer 2**: Zod Validation (validation.ts) - Server validation schemas ❌ MISMATCHED  
   • **Layer 3**: Handler Interfaces (handlers/*.ts) - Internal processing ✅ CORRECT

2. **Pattern Discovered**: 
   - MCP JSON Schema already has correct parameters (entityType, canonicalName)
   - Handlers expect correct parameters (entityType, canonicalName) 
   - But Zod validation.ts has wrong parameters (name, type) causing validation failures

3. **Examples of Mismatches Found**:
   ```typescript
   // naming_register - FIXED
   validation.ts: name/type          → canonicalName/entityType ✅
   
   // naming_check - FIXED  
   validation.ts: name               → proposedName ✅
   
   // decision_record - NEEDS FIX
   validation.ts: ??? → title/description/alternatives/etc
   
   // context_store - NEEDS FIX
   validation.ts: ??? → content/type enum alignment
   ```

4. **Success Pattern Confirmed**:
   - Fix validation.ts parameter names to match handler expectations
   - Restart server to pick up validation changes  
   - Restart session to reconnect MCP client
   - Test tool → SUCCESS! ✅ task_create and naming_register now work

## ✅ UPDATED SYSTEMATIC REPAIR STRATEGY (Phase 2 Approach)
─────────────────────────────────────────────────────────

**PROVEN SUCCESS PATTERN** (applied to task_create ✅ and naming_register ✅):

### Phase 2A – Systematic Parameter Alignment (IN PROGRESS)
2A.1 **For each broken tool**: 
     - Check handler interface in `handlers/*.ts` for expected parameters
     - Compare with current validation schema in `validation.ts` 
     - Fix validation.ts parameters to match handler expectations
     - Update enum values to match full specification

2A.2 **Applied Successfully**:
     ```typescript
     // naming_register - FIXED ✅
     validation.ts BEFORE: { name: baseName, type: z.enum(['variable'...]) }
     validation.ts AFTER:  { canonicalName: baseName, entityType: z.enum(['variable','type','component'...]) }
     
     // naming_check - FIXED ✅  
     validation.ts BEFORE: { name: baseName, type: z.enum(...).optional() }
     validation.ts AFTER:  { proposedName: baseName, entityType: z.enum(...) }
     
     // naming_suggest - FIXED ✅
     validation.ts BEFORE: { partialName: z.string(), type: z.enum(...).optional() }
     validation.ts AFTER:  { description: z.string(), entityType: z.enum(...) }
     ```

2A.3 **Server Restart Required**: `PORT=8080 npx tsx src/server.ts`
2A.4 **Session Restart Required**: MCP client reconnection needed

### Phase 2B – Remaining 12 Tools to Fix (TODO)
2B.1 **decision_record/decision_update** - Check handler interfaces vs validation
2B.2 **context_store** - Enum alignment (type validation)  
2B.3 **project_info** - Parameter mapping check
2B.4 **smart_search** - Parameter validation review
2B.5 **Plus 8 more tools** from original broken list

### Phase 2C – Validation & Testing (NEXT SESSION)
2C.1 **Test All Fixed Tools**:
     ```bash
     # Confirmed working 
     mcp__aidis__task_create (priority: "urgent", projectId: UUID)
     mcp__aidis__naming_register (canonicalName: "test", entityType: "function")
     
     # Need testing (schemas fixed)
     mcp__aidis__naming_check (proposedName: "test", entityType: "function")  
     mcp__aidis__naming_suggest (description: "test function", entityType: "function")
     ```

2C.2 **Integration Test Creation**:
     ```typescript
     // Add to test suite
     expect(validateToolArguments('task_create', 
       {title:'test', priority:'urgent', projectId: 'uuid'})).toBe(valid)
     
     expect(validateToolArguments('naming_register',
       {canonicalName:'test', entityType:'function'})).toBe(valid)
     ```

### Phase 3 – Systematic Tool Repair Automation  
3.1 **Create Parameter Diff Script** (Oracle's recommendation):
     ```typescript
     for each broken tool:
         spec_fields = MCP JSON Schema parameters
         validation_fields = Zod validation parameters  
         handler_fields = Handler interface parameters
         report_mismatches()
     ```

3.2 **Apply Fixes in Batches**: Group similar tools for efficiency

### Phase 4 – Prevention & Documentation
4.1 **Add Validation Layer Alignment Tests**: Prevent future mismatches
4.2 **Document Parameter Mapping Rules**: In CONTRIBUTING.md  
4.3 **Create CI Checks**: Validate three-layer parameter alignment

## ✅ UPDATED TIMELINE & PROGRESS
───────────────────────────────
**COMPLETED** ✅:
• **Phase 1**: Fresh server connection (15 min)
• **Phase 2A**: Parameter alignment pattern discovery (30 min)  
• **2 Tools Fixed**: task_create + naming_register (30 min)

**REMAINING**:
• **Phase 2B**: Fix 12 remaining tools (60-90 min)
• **Phase 2C**: Test all fixes (15 min)  
• **Phase 3**: Automation & batch fixes (30 min)
• **Phase 4**: Prevention & documentation (15 min)

**Total Remaining**: ~2-2.5 hours

## ✅ SUCCESS CHECKPOINTS ACHIEVED
──────────────────────────────────
• ✅ Server `/healthz` returns healthy status
• ✅ `task_create` with `"priority":"urgent"` + projectId UUID succeeds  
• ✅ `naming_register` with `canonicalName`/`entityType` succeeds
• ✅ Validation layer alignment pattern proven and documented
• ✅ Server restart + session restart workflow confirmed

## 🎯 NEXT SESSION IMMEDIATE PRIORITIES
────────────────────────────────────────
1. **Reconnect & Verify**: Test task_create + naming_register still work
2. **Test Naming Tools**: naming_check + naming_suggest (schemas already fixed)
3. **Fix Decision Tools**: Apply same pattern to decision_record/decision_update
4. **Fix Context Tools**: Apply same pattern to context_store enum issues
5. **Systematic Completion**: Work through remaining 8 broken tools

**SUCCESS PATTERN TO FOLLOW**:
Handler interface → Validation schema alignment → Server restart → Session restart → Test → Success! ✅
