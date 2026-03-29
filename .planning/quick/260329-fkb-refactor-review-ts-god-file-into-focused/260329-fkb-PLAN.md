---
phase: quick
plan: 260329-fkb
type: execute
wave: 1
depends_on: []
files_modified:
  - src/tools/review.ts              # Deleted (replaced by directory)
  - src/tools/review/index.ts        # Barrel: re-exports handleReview + registerReviewTool
  - src/tools/review/diff-resolver.ts
  - src/tools/review/convention-parser.ts
  - src/tools/review/graph-queries.ts
  - src/tools/review/cycle-detector.ts
  - src/tools/review/handler.ts
  - src/tools/review/register.ts
  - src/tools/review/types.ts
autonomous: true
requirements: []

must_haves:
  truths:
    - "All 14 existing tests in tests/tools/review.test.ts pass without modification"
    - "All external consumers (src/tools/index.ts, src/dashboard/api/review.ts) resolve imports unchanged"
    - "No behavioral difference: every function produces identical output for identical input"
  artifacts:
    - path: "src/tools/review/index.ts"
      provides: "Barrel re-export of handleReview and registerReviewTool"
      exports: ["handleReview", "registerReviewTool"]
    - path: "src/tools/review/diff-resolver.ts"
      provides: "parseFilesFromDiff, getWorkingDirChanges, detectDefaultBranch, resolveDiff"
      exports: ["resolveDiff"]
    - path: "src/tools/review/convention-parser.ts"
      provides: "parseConventions"
      exports: ["parseConventions"]
    - path: "src/tools/review/graph-queries.ts"
      provides: "getFileCommunities, getEdgesForFiles, getNodeIdsForFiles"
      exports: ["getFileCommunities", "getEdgesForFiles", "getNodeIdsForFiles"]
    - path: "src/tools/review/cycle-detector.ts"
      provides: "detectCycles, MAX_NEIGHBOR_EXPANSION"
      exports: ["detectCycles"]
    - path: "src/tools/review/handler.ts"
      provides: "handleReview (main orchestrator)"
      exports: ["handleReview"]
    - path: "src/tools/review/register.ts"
      provides: "registerReviewTool (MCP registration)"
      exports: ["registerReviewTool"]
    - path: "src/tools/review/types.ts"
      provides: "Shared types: RiskTier, ParsedConvention, DiffResolution, DiffError, DbHandle"
      exports: ["RiskTier", "ParsedConvention", "DiffResolution", "DiffError", "DbHandle"]
  key_links:
    - from: "src/tools/review/index.ts"
      to: "src/tools/review/handler.ts, src/tools/review/register.ts"
      via: "re-export"
      pattern: "export.*from.*handler|export.*from.*register"
    - from: "src/tools/review/handler.ts"
      to: "src/tools/review/diff-resolver.ts, convention-parser.ts, graph-queries.ts, cycle-detector.ts"
      via: "import"
      pattern: "import.*from.*diff-resolver|convention-parser|graph-queries|cycle-detector"
    - from: "src/tools/index.ts"
      to: "src/tools/review/index.ts"
      via: "import './review.js' resolves to review/index.ts"
      pattern: "import.*from.*./review.js"
---

<objective>
Refactor src/tools/review.ts (736 lines, 8 responsibilities) into focused modules under src/tools/review/.

Purpose: Eliminate the last HIGH severity audit finding (AUDIT_CUSTOM_REPORT.md Finding 1). Each extracted module owns one concern, improving testability, navigability, and reducing merge conflict surface.

Output: 8 focused files under src/tools/review/ replacing the monolithic review.ts. Zero behavioral changes -- pure structural refactor.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/tools/review.ts
@tests/tools/review.test.ts
@src/tools/index.ts
@src/dashboard/api/review.ts
@AUDIT_CUSTOM_REPORT.md

<interfaces>
<!-- External consumers that must continue to work with unchanged import paths -->

From src/tools/index.ts:
```typescript
import { registerReviewTool } from "./review.js";
// Called as: registerReviewTool(server, projectRoot)
```

From src/dashboard/api/review.ts:
```typescript
import { handleReview } from "../../tools/review.js";
// Called as: handleReview({ diff_source, file_paths }, projectRoot)
```

From tests/tools/review.test.ts:
```typescript
const reviewModule = await import("../../src/tools/review.js");
handleReview = reviewModule.handleReview;
// Also imports registerReviewTool (same path, but only handleReview is used in tests)
```

<!-- TypeScript module resolution: when review.ts is deleted and review/ directory with index.ts exists,
     import "./review.js" resolves to "./review/index.ts". All three consumers work unchanged. -->

From src/tools/helpers.js (used by handler):
```typescript
export function okResponse(data: unknown, metadata?: Record<string, unknown>): { content: Array<{ type: "text"; text: string }> };
export function errorResponse(code: string, message: string, recovery: string): { content: Array<{ type: "text"; text: string }> };
export function isBootstrapped(projectRoot: string): boolean;
export function buildMetadata(projectRoot: string, startMs: number): Record<string, unknown>;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create types.ts and extract all 4 helper modules</name>
  <files>
    src/tools/review/types.ts
    src/tools/review/diff-resolver.ts
    src/tools/review/convention-parser.ts
    src/tools/review/graph-queries.ts
    src/tools/review/cycle-detector.ts
  </files>
  <action>
Create `src/tools/review/` directory and 5 files by extracting directly from the existing `src/tools/review.ts`. Every function body is a verbatim copy -- no logic changes.

**types.ts** -- Shared type definitions used across modules:
```typescript
export type RiskTier = "HIGH" | "MEDIUM" | "LOW";

export interface ParsedConvention {
  name: string;
  adoption_pct: number;
  confidence: string;
  category: string;
  files: string[];
  evidence: string[];
}

export interface DiffResolution {
  files: string[];
  diffText: string;
  source: string;
}

export interface DiffError {
  error: true;
  code: string;
  message: string;
  recovery: string;
}

/** Minimal db interface matching better-sqlite3 prepare/all pattern used by graph query functions */
export interface DbHandle {
  prepare: (sql: string) => { all: (...args: unknown[]) => unknown[] };
}
```

**diff-resolver.ts** -- Lines 70-235 of review.ts:
- Import `execFileSync` from `node:child_process`
- Import `DiffResolution`, `DiffError` from `./types.js`
- Contains 4 functions: `parseFilesFromDiff` (not exported -- internal), `getWorkingDirChanges` (not exported -- internal), `detectDefaultBranch` (not exported -- internal), `resolveDiff` (exported)
- Only `resolveDiff` is called externally (by handler.ts). The other 3 are private helpers.

**convention-parser.ts** -- Lines 241-301 of review.ts:
- Import `ParsedConvention` from `./types.js`
- Export `parseConventions` function (verbatim from lines 241-301)

**graph-queries.ts** -- Lines 306-399 of review.ts:
- Import `DbHandle` from `./types.js`
- Export 3 functions: `getFileCommunities`, `getEdgesForFiles`, `getNodeIdsForFiles`
- Replace the inline `db: { prepare: ... }` parameter type annotation with `DbHandle` in all 3 function signatures. This is a pure type alias -- no runtime change.

**cycle-detector.ts** -- Lines 410-479 of review.ts:
- Export `MAX_NEIGHBOR_EXPANSION` constant (value: 50)
- Export `detectCycles` function (verbatim from lines 410-479)
- Import type `DirectedGraph` from `graphology` for the parameter type annotation
  </action>
  <verify>
    <automated>cd /Users/jaywadhwa/codescope && npx tsc --noEmit src/tools/review/types.ts src/tools/review/diff-resolver.ts src/tools/review/convention-parser.ts src/tools/review/graph-queries.ts src/tools/review/cycle-detector.ts 2>&1 | head -30</automated>
  </verify>
  <done>5 files exist under src/tools/review/ and type-check cleanly. Each contains only its designated responsibility. No function bodies differ from the original review.ts.</done>
</task>

<task type="auto">
  <name>Task 2: Create handler.ts, register.ts, barrel index.ts, and delete old review.ts</name>
  <files>
    src/tools/review/handler.ts
    src/tools/review/register.ts
    src/tools/review/index.ts
    src/tools/review.ts
  </files>
  <action>
**handler.ts** -- Lines 494-699 of review.ts (the `handleReview` function):
- Import from sibling modules:
  ```typescript
  import * as fs from "node:fs";
  import * as path from "node:path";
  import { getGraph } from "../../graph/cache.js";
  import { blastRadius } from "../../graph/analytics.js";
  import { openDatabase, closeDatabase } from "../../graph/database.js";
  import { getGraphDbPath, getCodescopePath } from "../../utils/paths.js";
  import { okResponse, errorResponse, isBootstrapped, buildMetadata } from "../helpers.js";
  import type { RiskTier } from "./types.js";
  import { resolveDiff } from "./diff-resolver.js";
  import { parseConventions } from "./convention-parser.js";
  import { getFileCommunities, getEdgesForFiles, getNodeIdsForFiles } from "./graph-queries.js";
  import { detectCycles } from "./cycle-detector.js";
  ```
- Keep `classifyRisk` as a private function in this file (lines 60-64 of review.ts) along with `HIGH_RISK_THRESHOLD` and `MEDIUM_RISK_THRESHOLD` constants (lines 20-24). These are only used by `handleReview`.
- Export `handleReview` (verbatim function body from lines 494-699).

**register.ts** -- Lines 711-736 of review.ts:
- Import `McpServer` type from `@modelcontextprotocol/sdk/server/mcp.js`
- Import `z` from `zod/v4`
- Import `handleReview` from `./handler.js`
- Export `registerReviewTool` (verbatim from lines 711-736)

**index.ts** -- Barrel file with re-exports:
```typescript
export { handleReview } from "./handler.js";
export { registerReviewTool } from "./register.js";
```
This is the critical file: when `src/tools/review.ts` is deleted, TypeScript resolves `import "./review.js"` to `./review/index.ts`, so all 3 external consumers (src/tools/index.ts, src/dashboard/api/review.ts, tests/tools/review.test.ts) continue to work without any import path changes.

**Delete old file:** Remove `src/tools/review.ts` after all new files are in place. Use `git rm src/tools/review.ts` (or just `rm`).

Do NOT modify any consumer files (src/tools/index.ts, src/dashboard/api/review.ts, tests/tools/review.test.ts). Their imports must resolve via the barrel.
  </action>
  <verify>
    <automated>cd /Users/jaywadhwa/codescope && npx tsc --noEmit && npx vitest run tests/tools/review.test.ts 2>&1 | tail -30</automated>
  </verify>
  <done>
- src/tools/review.ts no longer exists (replaced by src/tools/review/ directory)
- `npx tsc --noEmit` passes with zero errors (all consumers resolve via barrel)
- All 14 tests in tests/tools/review.test.ts pass
- No import path changes in any consumer file
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` -- full project type-check passes
2. `npx vitest run tests/tools/review.test.ts` -- all 14 tests pass
3. `npx vitest run` -- full test suite passes (no collateral damage)
4. `ls src/tools/review.ts` -- file does not exist (replaced by directory)
5. `ls src/tools/review/` -- contains: index.ts, types.ts, diff-resolver.ts, convention-parser.ts, graph-queries.ts, cycle-detector.ts, handler.ts, register.ts
6. `wc -l src/tools/review/*.ts` -- each file is under 220 lines; handler.ts is the largest (~210 lines)
7. No import path changes in src/tools/index.ts, src/dashboard/api/review.ts, or tests/tools/review.test.ts
</verification>

<success_criteria>
- The 736-line god file is replaced by 8 focused modules, each owning a single responsibility
- All 14 existing review tests pass without modification
- Full project type-check passes
- AUDIT_CUSTOM_REPORT.md Finding 1 (HIGH severity) is resolved
- Zero behavioral changes -- pure structural refactor
</success_criteria>

<output>
After completion, create `.planning/quick/260329-fkb-refactor-review-ts-god-file-into-focused/260329-fkb-SUMMARY.md`
</output>
