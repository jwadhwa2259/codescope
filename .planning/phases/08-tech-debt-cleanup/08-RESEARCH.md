# Phase 8: Tech Debt Cleanup - Research

**Researched:** 2026-03-27
**Domain:** Cross-phase integration gaps, type consolidation, documentation accuracy, dead code removal
**Confidence:** HIGH

## Summary

Phase 8 addresses 12 accumulated tech debt items identified by the v1.0 milestone audit (`.planning/v1.0-MILESTONE-AUDIT.md`). All items are LOW or INFO severity with no blockers. The work is entirely within the existing codebase -- no new libraries, no new architectural patterns, no external dependencies. Every change has a clear, verifiable before/after state.

The 7 success criteria map to 6 distinct source files plus the ROADMAP.md documentation artifact. Changes are isolated: no fix requires modifying another fix's files (zero overlap). The dominant pattern is "read current code, apply targeted edit, verify with existing tests + new assertions."

**Primary recommendation:** Organize as 2-3 small plans. Group by dependency: (1) verify-to-eval JSON sidecar pipeline fix (run-verify.ts + run-eval.ts -- these are coupled), (2) type consolidation + dead code + doc fixes (wave-scheduler.ts, validation.ts, server.ts, tools/index.ts, learning-synthesizer.ts, run-learning-capture.ts), (3) ROADMAP.md progress table update.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVAL-01 | Eval agent reads scope contract, plan, coordination log, git diff, and verify report | JSON sidecar enables structured verify data consumption; currently eval falls back to empty structure (lines 88-109 of run-eval.ts) |
| EVAL-03 | Each finding has severity and categorization | Structured verify data from JSON sidecar enables programmatic criterion scoring instead of LLM-only markdown reading |
| VRFY-08 | Verify report written to reports directory with all check results | JSON sidecar serialization completes the verify output contract -- markdown report exists but structured data missing |
| EXEC-07 | Plan sub-agent performs hybrid dependency analysis | wave-scheduler.ts local type copies must be replaced with imports from orient/types.ts to ensure type consistency |
| ORNT-10 | Plan saved to plans directory before execution starts | validation.ts `as unknown` casts must be removed when types are unified -- fragile to field renames |
| MCP-01 | MCP server implemented with SDK using StdioServerTransport | server.ts JSDoc must accurately list all 12 tools (currently says 11) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

### Key Directives
- **Tech stack**: TypeScript, vitest for testing, ESM-first with NodeNext module resolution
- **Testing**: vitest ^4.1.0 for all tests, test files in `tests/` directory mirroring `src/` structure
- **Build**: tsdown for bundling, tsx for development execution
- **Patterns**: handleX() extraction for testability, filesystem-first coordination, stderr dispatch protocol for CLI entry points
- **MCP**: @modelcontextprotocol/sdk ^1.27.1 (v1.x), StdioServerTransport
- **No**: jest, node-tree-sitter, web-tree-sitter 0.26.x, tsup

## Architecture Patterns

### Relevant Existing Patterns

**CLI entry point pattern** (run-verify.ts, run-eval.ts, run-learning-capture.ts):
- Shebang line, parseArgs function, main function, stderr dispatch protocol
- JSON output to stdout, progress/dispatch messages to stderr
- process.exit(0) on success, process.exit(1) on error

**Type import pattern** (orient/types.ts canonical exports):
- Types defined in one canonical location
- Other modules import via `import type { ... } from "../orient/types.js"`
- No local type copies (the wave-scheduler violation of this pattern is the debt being fixed)

**Report writer pattern** (verify/report-writer.ts):
- Receives structured data, writes markdown to `reports/` directory
- Returns absolute path to written file
- Uses `getCodescopePath()` for path resolution

### Recommended Project Structure (no changes needed)
```
src/
  verify/          # run-verify.ts, report-writer.ts, types.ts
  eval/            # run-eval.ts, eval-agent.ts, types.ts
  execution/       # wave-scheduler.ts
  orient/          # types.ts (canonical), validation.ts
  agents/          # learning-synthesizer.ts
  learning/        # run-learning-capture.ts
  tools/           # index.ts (tool registration)
  server.ts        # MCP server entry point
```

## Detailed Change Analysis

### Change 1: JSON Sidecar Serialization (EVAL-01, EVAL-03, VRFY-08)

**Files affected:** `src/verify/run-verify.ts`, `src/verify/report-writer.ts`, `src/eval/run-eval.ts`

**Current state of run-verify.ts (lines 193-206):**
```typescript
const report: VerifyReport = {
  taskSlug,
  taskDescription,
  date: new Date().toISOString().split("T")[0],
  static: staticResult,
  runtime: runtimeResult,
  totalDuration_ms,
};
const reportPath = writeVerifyReport(projectRoot, report);
console.log(JSON.stringify({ status: "complete", reportPath, report }));
```
The `report` object contains structured `StaticVerifyResult` and `RuntimeVerifyResult` data but is only written as markdown via `writeVerifyReport`. No JSON sidecar is produced.

**Current state of run-eval.ts (lines 88-109):**
```typescript
// Try to read from the report path JSON sidecar
const jsonPath = reportPath.replace(/\.md$/, ".json");
try {
  verifyResult = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
} catch {
  // Provide empty verify result structure as fallback
  verifyResult = { static: { ... }, runtime: { ... } };
}
```
The eval CLI already expects a JSON sidecar at `{reportPath}.json`. The consumer code exists and works -- it just falls back to empty data because the producer never writes the file.

**Required change:** After `writeVerifyReport` returns `reportPath`, serialize the verify report's `static` and `runtime` fields to `{reportPath}.json`. This can be done either:
- (a) Inside `writeVerifyReport` (add a JSON sidecar write after the markdown write) -- preferred, keeps report writing encapsulated
- (b) In `run-verify.ts` after `writeVerifyReport` returns -- simpler but splits report-writing responsibility

**Option (a) is recommended** because `writeVerifyReport` already owns the report path construction and file I/O. The JSON sidecar should contain `{ static: report.static, runtime: report.runtime }` to match what `run-eval.ts` expects.

**No changes needed to run-eval.ts** -- it already reads the JSON sidecar correctly (line 90). The fallback path (lines 93-109) should remain as a safety net.

**Impact on existing tests:**
- `tests/verify/report-writer.test.ts` -- needs new test assertions for JSON sidecar file creation
- `tests/eval/run-eval.test.ts` -- existing tests are structural checks on the CLI file, not affected by the runtime change
- No test breakage expected

### Change 2: Wave-Scheduler Type Consolidation (EXEC-07, ORNT-10)

**Files affected:** `src/execution/wave-scheduler.ts`, `src/orient/validation.ts`

**Current state of wave-scheduler.ts (lines 7-30):**
```typescript
// Local type definitions for AgentAssignment and ExecutionWave.
// These mirror src/orient/types.ts (Plan 01). Once orient types are
// available, replace with: import type { AgentAssignment, ExecutionWave }
// from "../orient/types.js";

export interface AgentAssignment {
  name: string;
  wave: number;
  // ... (identical to orient/types.ts)
}

export interface ExecutionWave {
  waveNumber: number;
  agents: string[];
  mode: "parallel" | "sequential";
}
```
The comment even says "replace with import". The types in `src/orient/types.ts` (lines 108-125) are structurally identical.

Also exports `ValidationCheck` (lines 36-40) which has a slightly different shape from orient's `ValidationCheck`:
- wave-scheduler: `status: "PASS" | "FAIL" | "WARNING"`
- orient/types.ts: `status: "PASS" | "FAIL" | "AUTO-FIXED" | "WARNING"`

The wave-scheduler's `ValidationCheck` is used only internally by `validateFileOverlap`, `validateDependencyOrdering`, and `validateScopeCoverage`. These functions only produce `"PASS"`, `"FAIL"`, or `"WARNING"` statuses. The orient `ValidationCheck` adds `"AUTO-FIXED"` which is set by `autoFixPlan` in validation.ts. The wave-scheduler functions never produce `"AUTO-FIXED"`, so using the orient type (which is a superset) is safe.

**Current state of validation.ts (lines 39-46):**
```typescript
const agents = plan.agents as unknown as Parameters<
  typeof validateFileOverlap
>[0];
const waves = plan.waves as unknown as Parameters<
  typeof validateFileOverlap
>[1];
```
These `as unknown` casts exist because `plan.agents` has type `AgentAssignment[]` from `orient/types.ts` while `validateFileOverlap` expects `AgentAssignment[]` from `wave-scheduler.ts` -- structurally identical but TypeScript treats them as distinct nominal types.

**Required change:**
1. In `wave-scheduler.ts`: Remove local `AgentAssignment`, `ExecutionWave`, and `ValidationCheck` interface declarations. Add: `import type { AgentAssignment, ExecutionWave, ValidationCheck } from "../orient/types.js"`. Re-export them for consumers: `export type { AgentAssignment, ExecutionWave, ValidationCheck }`.
2. In `validation.ts`: Remove all `as unknown as Parameters<...>` casts. The types now originate from the same module.
3. Also update `validation.ts` line 126 which has the same cast pattern in `autoFixPlan`.

**Impact on existing tests:**
- `tests/execution/wave-scheduler.test.ts` (line 8): imports `AgentAssignment` from wave-scheduler -- this will still work because wave-scheduler re-exports the type
- `tests/orient/validation.test.ts`: imports types from `orient/types.ts` -- already correct, no change needed
- No test breakage expected

### Change 3: Server.ts JSDoc Update (MCP-01)

**File affected:** `src/server.ts`

**Current state (lines 6-16):**
```typescript
/**
 * CodeScope MCP Server
 *
 * Registers all 11 MCP tools and connects via StdioServerTransport.
 * ...
 * Tools registered:
 *   codescope_status, codescope_recall, codescope_graph_query,
 *   codescope_blast_radius, codescope_conventions, codescope_orient,
 *   codescope_verify, codescope_search, codescope_readiness,
 *   codescope_detect_changes, codescope_service_map
 */
```

**Required change:** Update JSDoc to say "12 MCP tools" and add `codescope_eval` to the tools list.

**Note:** `src/tools/index.ts` (line 16) already says "12 CodeScope MCP tools" and lists all 12 correctly. But the comment on line 42 says "All 10 real tools" -- should be "All 11 real tools" (status is always functional + 11 data-dependent = 12 total).

**Impact:** Pure documentation change, no test impact. The existing `tests/tools/mcp-tool-registration.test.ts` checks for >= 11 tools and lists all 11 Phase 3 tools. This test should be updated to verify exactly 12 tools and include `codescope_eval` in the required list.

### Change 4: Dead Variable in learning-synthesizer.ts

**File affected:** `src/agents/learning-synthesizer.ts`

**Current state (lines 254-255):**
```typescript
const totalActive = addResult.added.length + (maxActive - addResult.evicted.length);
const capStatus = `${addResult.added.length + (await countCurrentActive(options.projectRoot))}/${maxActive} active`;
```
The `totalActive` variable is computed but never used. The `capStatus` string on the next line computes the active count differently (via `countCurrentActive`).

**Required change:** Remove the `totalActive` line entirely. The `capStatus` computation is correct and does not reference `totalActive`.

**Impact:** No functional change, no test impact.

### Change 5: Learning Capture Dual-Path Fix

**File affected:** `src/learning/run-learning-capture.ts`

**Current state (lines 120-130):**
```typescript
const result = await runLearningSynthesizer({
  projectRoot: args.projectRoot,
  outputDir: csPath,
  coordinationLogPath: args.coordinationPath || undefined,
  evalReportPath: args.reportPath || undefined,
  verifyReportPath: args.reportPath || undefined,  // <-- same value as evalReportPath!
  scopeContractPath: args.scopeContractPath || undefined,
  decayConfig,
  maxActive,
  dispatchSynthesizer,
});
```
Both `evalReportPath` and `verifyReportPath` receive `args.reportPath`. Currently this works because eval appends to the verify report (single file). But the intent is clearly for separate paths.

**Required change:** The `LearningCaptureArgs` interface needs separate `evalReportPath` and `verifyReportPath` fields (currently only has `reportPath`). The CLI argument parsing needs to accept `--eval-report-path` and `--verify-report-path` as separate arguments, with `--report-path` as a fallback for backward compatibility.

The `parseArgs` function (lines 51-74) and `LearningCaptureArgs` interface (lines 23-31) need updating:
```typescript
export interface LearningCaptureArgs {
  projectRoot: string;
  taskSlug: string;
  scopeContractPath: string;
  planPath: string;
  coordinationPath: string;
  evalReportPath: string;   // NEW (was: reportPath)
  verifyReportPath: string; // NEW
  executionDir: string;
}
```

The skill body that calls this CLI (`/codescope:orient` Step 7) also passes `--report-path`. The skill body should be updated to pass `--eval-report-path` and `--verify-report-path` separately. However, since skill bodies are natural language prompts (not TypeScript code), this requires updating the skill instruction text.

For backward compatibility: if only `--report-path` is provided, use it for both (preserving current behavior). If `--eval-report-path` or `--verify-report-path` are provided, use them.

**Impact on existing tests:**
- `tests/learning/run-learning-capture.test.ts` -- needs update for new argument names
- Skill body text update required (in skills/ directory)

### Change 6: ROADMAP.md Progress Table

**File affected:** `.planning/ROADMAP.md`

**Current state (lines 182-192):**
The progress table exists and mostly shows "Complete" for phases 1-7, but is missing completion dates. Phase 8 shows "0/1 Planned". Additionally, the audit noted that Phase 4 was "0/6 Planned" at some point (now fixed to "6/6 Complete").

The roadmap phase descriptions (lines 15-22) still show `- [ ]` unchecked markers for all phases including completed ones.

**Required change:** Update all `- [ ]` to `- [x]` for completed phases (1-7). Verify the progress table completion counts and dates are accurate. Phase 8 stays as "Planned" or "In Progress."

**Impact:** Pure documentation change, no test impact.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON serialization | Custom serializer | `JSON.stringify(report, null, 2)` + `fs.writeFileSync` | Standard JSON serialization is all that is needed for the sidecar |
| Type re-export | Wrapper types | `export type { X } from "..."` | TypeScript re-export syntax handles this cleanly |

**Key insight:** Every change in this phase uses existing Node.js/TypeScript primitives. No new libraries or patterns needed.

## Common Pitfalls

### Pitfall 1: Breaking wave-scheduler test imports
**What goes wrong:** When removing local types from wave-scheduler.ts, test files that `import type { AgentAssignment } from "../../src/execution/wave-scheduler.js"` would break if the type is not re-exported.
**Why it happens:** The test file (line 8) imports AgentAssignment from wave-scheduler, not from orient/types.
**How to avoid:** Use `export type { AgentAssignment, ExecutionWave, ValidationCheck } from "../orient/types.js"` in wave-scheduler.ts so it still exports these types.
**Warning signs:** TypeScript compilation errors in test files after the change.

### Pitfall 2: ValidationCheck status union mismatch
**What goes wrong:** wave-scheduler.ts ValidationCheck has `"PASS" | "FAIL" | "WARNING"` while orient/types.ts has `"PASS" | "FAIL" | "AUTO-FIXED" | "WARNING"`. If wave-scheduler functions are typed against the orient version, they could theoretically produce "AUTO-FIXED" -- but they never do.
**Why it happens:** The types evolved separately during parallel plan execution.
**How to avoid:** Use the orient/types.ts ValidationCheck (superset). The wave-scheduler functions only produce PASS/FAIL/WARNING which are all valid in the superset type. No runtime behavior changes.
**Warning signs:** None expected -- this is purely a type safety improvement.

### Pitfall 3: JSON sidecar path construction
**What goes wrong:** The eval CLI constructs the sidecar path as `reportPath.replace(/\.md$/, ".json")`. If `writeVerifyReport` changes the report path format, the sidecar path won't match.
**Why it happens:** The path construction is split across two modules without a shared constant.
**How to avoid:** Have `writeVerifyReport` construct the JSON sidecar path using the same pattern: `reportPath.replace(/\.md$/, ".json")`, matching exactly what `run-eval.ts` expects.
**Warning signs:** Eval agent falling back to empty verify structure despite sidecar existing.

### Pitfall 4: Backward compatibility for run-learning-capture args
**What goes wrong:** Existing skill body invocations use `--report-path`. If we only accept `--eval-report-path` and `--verify-report-path`, existing calls break.
**Why it happens:** The skill body is a natural language prompt that was written before the dual-path requirement.
**How to avoid:** Accept all three flags: `--report-path` (legacy, used for both), `--eval-report-path`, `--verify-report-path`. If the specific flags are not provided, fall back to `--report-path` for both.
**Warning signs:** Learning capture returning "error" status in the pipeline.

## Code Examples

### JSON Sidecar Write (in report-writer.ts)
```typescript
// After writing the markdown report:
const jsonSidecarPath = reportPath.replace(/\.md$/, ".json");
fs.writeFileSync(
  jsonSidecarPath,
  JSON.stringify({ static: report.static, runtime: report.runtime }, null, 2),
  "utf-8",
);
```
Source: Pattern derived from run-eval.ts line 90 consumer expectation.

### Type Re-export (in wave-scheduler.ts)
```typescript
// Replace local interface declarations with:
import type {
  AgentAssignment,
  ExecutionWave,
  ValidationCheck,
} from "../orient/types.js";

export type { AgentAssignment, ExecutionWave, ValidationCheck };
```
Source: Existing pattern in orient/validation.ts line 6-19.

### Dead Variable Removal (in learning-synthesizer.ts)
```typescript
// REMOVE this line (254):
// const totalActive = addResult.added.length + (maxActive - addResult.evicted.length);

// KEEP this line (255) -- correctly computes cap status:
const capStatus = `${addResult.added.length + (await countCurrentActive(options.projectRoot))}/${maxActive} active`;
```

## Dependency Graph Between Fixes

```
Change 1 (JSON sidecar)         -- standalone, no deps on other changes
Change 2 (type consolidation)   -- standalone, no deps on other changes
Change 3 (server.ts JSDoc)      -- standalone, no deps on other changes
Change 4 (dead variable)        -- standalone, no deps on other changes
Change 5 (dual-path args)       -- standalone, no deps on other changes
Change 6 (ROADMAP.md)           -- standalone, no deps on other changes
```

No fix depends on another fix. All 6 changes can be done in any order. The recommended grouping is by logical cohesion, not dependency:
- **Plan 1:** Changes 1 (JSON sidecar) -- most impactful, touches the verify-to-eval data flow
- **Plan 2:** Changes 2-5 (type consolidation, JSDoc, dead code, dual-path) -- mechanical cleanup
- **Plan 3:** Change 6 (ROADMAP.md) -- documentation only

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.0 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VRFY-08 | JSON sidecar written alongside markdown report | unit | `npx vitest run tests/verify/report-writer.test.ts -x` | Exists, needs new assertions |
| EVAL-01 | run-eval.ts reads JSON sidecar successfully | unit | `npx vitest run tests/eval/run-eval.test.ts -x` | Exists, needs new assertions |
| EVAL-03 | Structured verify data available in eval options | unit | `npx vitest run tests/eval/types.test.ts -x` | Exists (untracked), may need update |
| EXEC-07 | wave-scheduler imports types from orient/types.ts | unit | `npx vitest run tests/execution/wave-scheduler.test.ts -x` | Exists, should still pass after re-export |
| ORNT-10 | validation.ts has no `as unknown` casts | unit | `npx vitest run tests/orient/validation.test.ts -x` | Exists, should still pass |
| MCP-01 | server.ts JSDoc lists 12 tools, registration test validates 12 | unit | `npx vitest run tests/tools/mcp-tool-registration.test.ts -x` | Exists (untracked), needs update to check 12 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/verify/report-writer.test.ts` -- add assertion that JSON sidecar file is created with correct structure
- [ ] `tests/tools/mcp-tool-registration.test.ts` -- update to assert exactly 12 tools and include `codescope_eval`
- [ ] `tests/learning/run-learning-capture.test.ts` -- update for new `evalReportPath` / `verifyReportPath` args

*(Existing test infrastructure covers all phase requirements -- gaps are assertion additions, not framework setup)*

## Environment Availability

Step 2.6: SKIPPED (no external dependencies identified). This phase is purely code/config/documentation changes within the existing TypeScript codebase. All tools (vitest, tsx, TypeScript compiler) are already installed and verified through 7 prior phases.

## Sources

### Primary (HIGH confidence)
- `src/verify/run-verify.ts` -- Direct code reading, lines 193-206 (report assembly, no JSON write)
- `src/eval/run-eval.ts` -- Direct code reading, lines 88-109 (JSON sidecar read with fallback)
- `src/execution/wave-scheduler.ts` -- Direct code reading, lines 7-30 (local type copies)
- `src/orient/types.ts` -- Direct code reading, lines 108-131 (canonical type definitions)
- `src/orient/validation.ts` -- Direct code reading, lines 39-46, 126-127, 202-207 (`as unknown` casts)
- `src/server.ts` -- Direct code reading, lines 6-16 (stale JSDoc)
- `src/tools/index.ts` -- Direct code reading, lines 16, 42 (12 tools registered, comment says 10)
- `src/agents/learning-synthesizer.ts` -- Direct code reading, line 254 (dead `totalActive` variable)
- `src/learning/run-learning-capture.ts` -- Direct code reading, lines 124-125 (same path for both args)
- `.planning/v1.0-MILESTONE-AUDIT.md` -- Audit report identifying all debt items

### Secondary (MEDIUM confidence)
- `.planning/ROADMAP.md` -- Progress table current state (lines 182-192)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries, all changes use existing stack
- Architecture: HIGH -- no new patterns, all changes follow established patterns
- Pitfalls: HIGH -- all verified by direct code reading of affected files and their tests
- Change scope: HIGH -- every changed file and line identified precisely

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable -- tech debt items are well-defined and won't change)
