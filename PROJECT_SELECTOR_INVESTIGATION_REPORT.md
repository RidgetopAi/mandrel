# Project Selector Settings Persistence Investigation Report
## Root Cause Analysis and Targeted Fix Recommendation

---

## Executive Summary

**ISSUE**: Project selector defaults to "aidis-bootstrap" on page refresh/server restart despite user setting "aidis-alpha" as default project. The setting saves correctly but is ignored during initialization.

**ROOT CAUSE**: Timing race condition in ProjectContext initialization where settings load detection logic fires before useSettings hook state propagation completes.

**IMPACT**:
- ✅ Logout/Login flow: Works correctly (uses saved "aidis-alpha")
- ❌ Page refresh: Ignores setting (defaults to "aidis-bootstrap")
- ❌ Server restart: Ignores setting (defaults to "aidis-bootstrap")

**SOLUTION**: Fix the settings load detection timing logic in ProjectContext.tsx

---

## Detailed Investigation Results

### 1. "aidis-bootstrap" Hardcode References Found

**Primary Reference** (The problematic fallback):
- `/home/ridgetop/aidis/aidis-command/frontend/src/contexts/ProjectContext.tsx:11`
  ```typescript
  const DEFAULT_BOOTSTRAP_PROJECT_NAME = 'aidis-bootstrap';
  ```
  - Used in line 166: `projectList.find((project: Project) => project.name === DEFAULT_BOOTSTRAP_PROJECT_NAME)`
  - This is the hardcoded fallback that's being triggered incorrectly

**Other References** (Documentation/Tests - Not problematic):
- Documentation files: `TOOL_PR.md`, `AIDIS_TOOLS.md`
- Test files: Various `test-*.ts` files
- Settings UI: `/home/ridgetop/aidis/aidis-command/frontend/src/pages/Settings.tsx:113` (user-facing documentation)

### 2. Project Selection Trigger Points Identified

**All locations where project can be set/changed:**

1. **ProjectContext initialization** (THE PROBLEM AREA)
   - `loadCurrentProjectFromSession()` - Multiple `setCurrentProject()` calls
   - `selectBootstrapProject()` - The faulty logic choosing hardcode over user preference

2. **User-initiated changes** (Working correctly)
   - `AppLayout.tsx:219` - ProjectSwitcher dropdown: `onProjectChange={(projectId, project) => setCurrentProject(project)}`
   - `Settings.tsx:35-43` - Default project setting via `setDefaultProject(projectName)`

3. **API-driven changes** (Working correctly)
   - `switchProjectViaAidis()` - AIDIS V2 API project switching
   - Session recovery - Loading project from backend session data

### 3. Code Flow Analysis: Why Login Works vs Refresh Fails

#### 🟢 LOGIN FLOW (WORKS)
```
Timeline: Sequential Initialization
1. User clicks login → AuthContext.login() called
2. Authentication completes → isAuthenticated = true
3. ProjectContext useEffect triggered → waits for settingsLoaded
4. useSettings hook has time to fully initialize → defaultProject = "aidis-alpha"
5. Settings detection: defaultProject !== undefined ✅
6. settingsLoaded = true → ProjectContext proceeds
7. selectBootstrapProject() called with defaultProject = "aidis-alpha" ✅
8. User preference found → Returns "aidis-alpha" project ✅
```

#### 🔴 PAGE REFRESH FLOW (BROKEN)
```
Timeline: Simultaneous Race Condition
1. Page loads → All contexts initialize simultaneously
2. AuthContext: token exists → isAuthenticated = true (immediate)
3. useSettings: useState(() => { /* sync localStorage read */ }) starts
4. ProjectContext: Settings detection triggers immediately:
   - defaultProject = undefined (useState hasn't propagated yet)
   - hasStoredSettings = "{"defaultProject":"aidis-alpha"}" (localStorage read)
   - Condition: defaultProject !== undefined || hasStoredSettings !== null ✅ (true because hasStoredSettings !== null)
   - settingsLoaded = true (PREMATURELY!)
5. ProjectContext initialization proceeds with defaultProject = undefined ❌
6. selectBootstrapProject() called with defaultProject = undefined
7. User preference check fails → Falls back to hardcode "aidis-bootstrap" ❌
8. useSettings finishes propagating → defaultProject = "aidis-alpha" (TOO LATE!)
```

### 4. Root Cause: Faulty Settings Load Detection

**The Problematic Code** - `/home/ridgetop/aidis/aidis-command/frontend/src/contexts/ProjectContext.tsx:44-66`:

```typescript
// Settings load tracking - wait for settings to be fully initialized
useEffect(() => {
  // Settings are loaded when:
  // - defaultProject has a value, OR        ❌ WRONG ASSUMPTION
  // - localStorage has been checked (even if no saved setting exists)
  const hasStoredSettings = localStorage.getItem('aidis_user_settings');

  if (defaultProject !== undefined || hasStoredSettings !== null) {
    setSettingsLoaded(true);  // ❌ FIRES TOO EARLY ON REFRESH
    console.log('🔧 ProjectContext: Settings loaded:', {
      defaultProject,         // undefined on refresh!
      hasStoredSettings: !!hasStoredSettings,
      settingsLoaded: true
    });
  } else {
    // Fallback timer logic...
  }
}, [defaultProject]);
```

**The Logic Flaw**:
- `defaultProject !== undefined` - Only true if settings have actual value
- `hasStoredSettings !== null` - True immediately on refresh (localStorage is synchronous)
- The OR condition `||` means if localStorage has ANY stored settings, it considers settings "loaded"
- But `defaultProject` state from useSettings hasn't propagated yet!

### 5. Why Our Previous Fix Was Incomplete

The previous guard `settingsLoaded` concept was correct, but the detection mechanism is wrong:

**Current broken logic**: "If localStorage has settings OR defaultProject has value, consider loaded"
**What we need**: "Wait until localStorage settings have been read AND propagated to React state"

---

## Targeted Fix Recommendation

### Option 1: Fix Settings Load Detection (RECOMMENDED)

**Change in `/home/ridgetop/aidis/aidis-command/frontend/src/contexts/ProjectContext.tsx`**:

```typescript
// BEFORE (Lines 44-66) - BROKEN
useEffect(() => {
  const hasStoredSettings = localStorage.getItem('aidis_user_settings');

  if (defaultProject !== undefined || hasStoredSettings !== null) {
    setSettingsLoaded(true);
  }
  // ...
}, [defaultProject]);

// AFTER - FIXED
useEffect(() => {
  const hasStoredSettings = localStorage.getItem('aidis_user_settings');

  if (hasStoredSettings) {
    // We have stored settings, wait for them to be loaded into React state
    if (defaultProject !== undefined) {
      // Settings have been parsed and propagated to state
      setSettingsLoaded(true);
    }
  } else {
    // No stored settings exist, consider loaded immediately
    setSettingsLoaded(true);
  }
}, [defaultProject]);
```

**Why this fixes it**:
- If localStorage has settings: Wait for `defaultProject` to be non-undefined (actual propagation)
- If no localStorage settings: Proceed immediately (nothing to wait for)
- Eliminates the race condition timing window

### Option 2: Add Loading State to useSettings Hook (ALTERNATIVE)

Add an explicit loading state to the `useSettings` hook:

```typescript
// In useSettings.ts
const [isLoading, setIsLoading] = useState(true);

// In initialization
useEffect(() => {
  setIsLoading(false); // Mark as loaded after first render
}, []);

return { defaultProject, isLoading, /* ... */ };
```

Then use `!isLoading` in ProjectContext instead of the complex detection logic.

### Option 3: Synchronous Settings Read (SIMPLEST)

Since localStorage is synchronous anyway, read it directly in ProjectContext:

```typescript
const getDefaultProjectFromStorage = (): string | undefined => {
  try {
    const stored = localStorage.getItem('aidis_user_settings');
    if (stored) {
      const parsed = JSON.parse(stored);
      return parsed.defaultProject;
    }
  } catch (error) {
    console.warn('Failed to read default project from storage:', error);
  }
  return undefined;
};

// Use in selectBootstrapProject instead of relying on hook timing
const defaultProjectFromStorage = getDefaultProjectFromStorage();
```

---

## Recommended Implementation

**I recommend Option 1** (Fix Settings Load Detection) because:
1. ✅ Minimal code change
2. ✅ Preserves existing architecture
3. ✅ Fixes the root cause directly
4. ✅ Maintains separation of concerns
5. ✅ No breaking changes to useSettings hook

**Implementation Steps**:
1. Update the settings load detection logic in ProjectContext.tsx lines 44-66
2. Test the fix with page refresh scenarios
3. Verify logout/login still works (should be unaffected)
4. Add integration test to prevent regression

---

## Verification Plan

**Test Scenarios**:
1. ✅ Set default to "aidis-alpha" in Settings → Save → Logout → Login (should work - regression test)
2. 🧪 Set default to "aidis-alpha" in Settings → Save → Page refresh (should now work)
3. 🧪 Set default to "aidis-alpha" in Settings → Save → Restart server → Refresh (should now work)
4. 🧪 Clear default project → Page refresh (should default to "aidis-bootstrap" - existing behavior)

**Success Criteria**:
- Page refresh respects saved default project setting
- Login flow continues to work correctly
- Fallback to "aidis-bootstrap" still works when no setting is saved

---

## Files To Change

1. **Primary Fix**: `/home/ridgetop/aidis/aidis-command/frontend/src/contexts/ProjectContext.tsx`
   - Lines 44-66: Update settings load detection logic

2. **Optional Enhancement**: Add debug logging to verify fix

**Estimated Impact**: Low risk, high value fix - addresses core user experience issue with minimal code change.