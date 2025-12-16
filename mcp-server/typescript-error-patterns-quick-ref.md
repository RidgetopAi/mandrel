# TypeScript Error Patterns - Quick Reference

## TOP 5 ERROR PATTERNS WITH FIXES

### 1. TS18046: 'error' is of type 'unknown' (72 occurrences)

**Problem:**
```typescript
try {
  // some code
} catch (error) {
  console.log(error.message); // TS18046: 'error' is of type 'unknown'
}
```

**Solution:**
```typescript
try {
  // some code
} catch (error) {
  const err = error instanceof Error ? error : new Error(String(error));
  console.log(err.message);
}

// Or for logging:
catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.log(message);
}
```

---

### 2. TS2345: Handler type mismatch (70 occurrences, 33 in mcpRoutes.ts)

**Problem:**
```typescript
// src/api/v2/mcpRoutes.ts
router.post('/context/store', contextHandler.storeContext); 
// TS2345: Argument of type 'ContextHandler' is not assignable to parameter of type 'Function'
```

**Root Cause:** Express expects `(req, res, next) => void` but getting class methods

**Solution Option 1 - Bind methods:**
```typescript
router.post('/context/store', contextHandler.storeContext.bind(contextHandler));
```

**Solution Option 2 - Wrapper functions:**
```typescript
router.post('/context/store', (req, res, next) => 
  contextHandler.storeContext(req, res, next)
);
```

**Solution Option 3 - Update handler class:**
```typescript
class ContextHandler {
  storeContext = async (req: Request, res: Response, next: NextFunction) => {
    // Use arrow function to preserve 'this' binding
  }
}
```

---

### 3. TS2339 & TS2551: Property/method doesn't exist (69 occurrences)

**Problem:**
```typescript
// core-server.ts
contextHandler.searchContexts(query); // TS2551: Did you mean 'searchContext'?
contextHandler.getRecentContexts(10); // TS2551: Did you mean 'getRecentContext'?
namingHandler.registerNaming(name);   // TS2551: Did you mean 'registerName'?
```

**Solution:** Use correct method names (check handler class definition)
```typescript
contextHandler.searchContext(query);  // Correct
contextHandler.getRecentContext(10);  // Correct
namingHandler.registerName(name);     // Correct
```

**Action Required:** Search and replace:
- `searchContexts` → `searchContext` 
- `getRecentContexts` → `getRecentContext`
- `registerNaming` → `registerName`
- `getProjectInfo` → verify correct name in ProjectHandler

---

### 4. TS2304: Cannot find name 'agentsHandler' (42 occurrences)

**Problem:**
```typescript
// core-server.ts (lines 804, 812, 816, 823, 834, 842, 855, etc.)
const result = await agentsHandler.someMethod(); 
// TS2304: Cannot find name 'agentsHandler'
```

**Root Cause:** Handler not imported or instantiated

**Solution:**
```typescript
// At top of file
import { AgentsHandler } from './handlers/agents';

// In initialization section
const agentsHandler = new AgentsHandler(db);

// If agents functionality was removed, delete all agentsHandler references
```

**Verification Needed:** Check if `src/handlers/agents.ts` exists and should be used

---

### 5. TS6133: Declared but never used (289 occurrences)

**Problem:**
```typescript
import { Server, CallToolRequestSchema, ListResourcesRequestSchema } from '@modelcontextprotocol/sdk/types.js';
// TS6133: 'Server' is declared but its value is never read
// TS6133: 'CallToolRequestSchema' is declared but its value is never read
```

**Solution:** Auto-fix with ESLint
```bash
npx eslint --fix "src/**/*.ts"
```

**Manual cleanup for unused variables:**
```typescript
// Before:
const result = await someFunction();
const unused = 123; // TS6133

// After:
const result = await someFunction();
// Remove the unused variable
```

---

## SPECIALIZED PATTERNS

### TS7053: Implicit 'any' index access (50 occurrences)

**Problem:**
```typescript
const obj = { foo: 'bar', baz: 'qux' };
const key = 'foo';
const value = obj[key]; // TS7053: Element implicitly has an 'any' type
```

**Solution:**
```typescript
// Option 1: Type assertion
const value = obj[key as keyof typeof obj];

// Option 2: Proper typing
const obj: Record<string, string> = { foo: 'bar', baz: 'qux' };
const value = obj[key];

// Option 3: Type guard
if (key in obj) {
  const value = obj[key]; // Now properly typed
}
```

---

### TS2322: Type 'null' not assignable to 'string' (26 occurrences)

**Problem:**
```typescript
const result: string = await db.query('SELECT name FROM users');
// Returns string | null but assigned to string
```

**Solution:**
```typescript
// Option 1: Update type
const result: string | null = await db.query('SELECT name FROM users');

// Option 2: Provide default
const result: string = await db.query('SELECT name FROM users') ?? '';

// Option 3: Type narrowing
const dbResult = await db.query('SELECT name FROM users');
if (dbResult !== null) {
  const result: string = dbResult;
}
```

---

### TS2353: Object literal unknown properties (24 occurrences)

**Problem:**
```typescript
logger.log({
  requestId: req.id,  // TS2353: 'requestId' does not exist in type 'LogEntry'
  toolName: tool      // TS2353: 'toolName' does not exist in type 'LogEntry'
});
```

**Solution:**
```typescript
// Update LogEntry interface
interface LogEntry {
  level: string;
  message: string;
  requestId?: string;  // Add missing properties
  toolName?: string;   // Add missing properties
}
```

---

### TS2307: Cannot find module (11 occurrences)

**Problem:**
```typescript
import { db } from '../database/database'; 
// TS2307: Cannot find module '../database/database'
```

**Solution:**
```typescript
// Check if file exists at path
ls src/database/database.ts

// If doesn't exist, find correct path
find src -name "database.ts"

// Update import to correct path
import { db } from '../config/database';
```

---

## FILES REQUIRING SPECIAL ATTENTION

### src/server.ts (72 errors)
- Main entry point - test thoroughly after fixes
- Mix of unused imports (auto-fix) and critical errors
- Priority: HIGH

### src/api/v2/mcpRoutes.ts (45 errors)
- 33 handler type mismatches (TS2345)
- All on lines 61-103 (route definitions)
- Fix strategy: Bind handlers or wrap in arrow functions
- Priority: HIGH

### src/core-server.ts (40 errors)
- 12 agentsHandler missing errors
- Multiple method name mismatches
- Priority: HIGH

### src/services/embedding.ts (35 errors)
- Check error handling patterns
- Likely TS18046 errors
- Priority: MEDIUM

---

## AUTOMATION OPPORTUNITIES

### Quick automated fixes (< 5 minutes):
```bash
# 1. Auto-fix unused variables/imports
npx eslint --fix "src/**/*.ts"

# 2. Check remaining errors
npm run type-check 2>&1 | tee typescript-errors-after-eslint.log

# 3. Count reduction
grep -c "error TS" typescript-errors-after-eslint.log
```

### Bulk find-and-replace (via sed or IDE):
```bash
# Fix method name mismatches
find src -name "*.ts" -exec sed -i 's/\.searchContexts(/\.searchContext(/g' {} \;
find src -name "*.ts" -exec sed -i 's/\.getRecentContexts(/\.getRecentContext(/g' {} \;
find src -name "*.ts" -exec sed -i 's/\.registerNaming(/\.registerName(/g' {} \;
```

---

## TESTING CHECKLIST AFTER FIXES

After each phase, run:
```bash
# 1. Type check
npm run type-check

# 2. Lint
npm run lint

# 3. Build
npm run build

# 4. Run tests (if available)
npm test

# 5. Start server and verify functionality
npm start
```

---

**Last Updated**: 2025-10-04  
**Total Errors**: 718  
**Quick Win Potential**: 322 errors (45%) in < 1 hour
