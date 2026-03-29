# Phase 13: Pipeline Evolution - Research

**Researched:** 2026-03-28
**Domain:** Execution pipeline self-monitoring, failure classification, reconciliation, token budgeting
**Confidence:** HIGH

## Summary

Phase 13 enhances the existing execution pipeline with four self-monitoring capabilities: per-task qualification gates, diagnostic failure classification, plan-vs-actual reconciliation, and token budget warnings. All four features integrate into well-understood codebases -- the orchestrator (`src/execution/orchestrator.ts`), eval types (`src/eval/types.ts`), debug agent (`src/debug/debug-agent.ts`), and planner (`src/orient/planner.ts`). No new dependencies are required; this is purely internal TypeScript code extending existing types and control flow.

The codebase already has strong patterns for every integration point: the `executeAgent()` function in orchestrator.ts is the natural insertion point for qualification checks, `EvalFinding` in eval/types.ts is the natural home for classification tags, the execution directory is the natural home for reconciliation reports, and `AgentAssignment` in orient/types.ts is the natural home for cost tier tags. The enforcement module's `runPreCommitCheck()` (or a lighter variant) provides the convention scanning capability needed for qualification.

**Primary recommendation:** Implement all four features as extensions to existing modules (types + logic), with new standalone modules only for reconciliation report generation and failure classification heuristics. Keep the convention scan in qualification lightweight -- reuse the enforcement module's `scanRule()` pattern but scope to changed files only, and make it optional (degrade gracefully when sg is unavailable).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Qualification check runs inline in `executeAgent()` inside `src/execution/orchestrator.ts` -- after each agent completes, run git diff on expected files + scoped convention check before the pipeline moves to the next agent. Reuses existing `AgentResult.filesChanged` tracking.
- **D-02:** On qualification failure: flag and continue -- add `qualified: boolean` and `qualificationIssues: string[]` fields to `AgentResult`. Pipeline does not halt; all flags are surfaced in the reconciliation report.
- **D-03:** Qualification checks: (1) git diff confirms at least one expected file was actually modified, (2) ast-grep convention scan on changed files reports violations. Both checks produce structured issue strings.
- **D-04:** Classification uses rule-based heuristics mapping eval criteria to categories. The eval agent already scores `scope_compliance`, `convention_adherence`, `completeness`, `correctness`. Map: low scope_compliance -> SCOPE_DRIFT, low completeness -> PLAN_GAP, low correctness -> CODE_BUG, low convention_adherence -> CONVENTION_MISS.
- **D-05:** Classification stored as a `classification` field on `EvalFinding` -- each finding gets exactly one category tag.
- **D-06:** Debug agent consumes classification to prioritize fix strategy: CODE_BUG fixes first, CONVENTION_MISS second, PLAN_GAP and SCOPE_DRIFT escalated to user (design decisions, not auto-fixable).
- **D-07:** Reconciliation runs once after full execution completes -- single report comparing all planned files against actual git changes. No per-wave overhead.
- **D-08:** Report is a standalone markdown file (`reconciliation.md`) in the execution directory -- separate from execution summary so eval/debug can consume it independently.
- **D-09:** Unexpected modification detection via set difference: planned files from `AgentAssignment.targetFiles`, actual changes from `git diff --name-only`. Files in actual but not planned = unexpected. Files in planned but not actual = missed.
- **D-10:** Report sections: summary (counts), unexpected files table, missed files table, per-agent planned-vs-actual breakdown.
- **D-11:** Planner classifies each agent as LIGHT (<20K), MODERATE (20-50K), HEAVY (>50K) tokens using the existing `tokenEstimate()` (chars/4) from `src/eval/eval-agent.ts`. Tags stored alongside existing `estimatedTokens` field in `AgentAssignment`.
- **D-12:** Orchestrator warns before execution starts -- sums all agent estimates, emits warning if cumulative exceeds safe threshold. No mid-execution warnings (too late to act on).
- **D-13:** Safe threshold configurable in config.yml, default 150K tokens -- leaves headroom for verify/eval/debug within a 200K context window. Warning is informational, does not block execution.

### Claude's Discretion
- Exact convention scan implementation in qualification (reuse Phase 12's ast-grep rule runner or lighter check)
- Whether to extract `tokenEstimate()` to a shared utility or import from eval-agent
- Reconciliation report markdown formatting details
- Whether qualification issues go into the coordination log in addition to AgentResult

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PIPE-01 | Per-task qualification after each agent execution verifies files actually changed via git diff and runs scoped convention check | Qualification gate inserts into `executeAgent()` after dispatch returns; uses `execFileSync("git", ["diff", "--name-only"])` for file verification and enforcement module's `scanRule()` pattern for convention checking; extends `AgentResult` with `qualified` and `qualificationIssues` fields |
| PIPE-02 | Diagnostic failure routing classifies eval findings as SCOPE_DRIFT / PLAN_GAP / CODE_BUG / CONVENTION_MISS before attempting debug fixes | Rule-based heuristics map `EvalCriterion` to `FailureClassification` enum; extends `EvalFinding` with `classification` field; debug agent sorts findings by classification priority |
| PIPE-03 | Plan-vs-actual reconciliation report compares planned files against actual git changes, surfaces unexpected changes and scope drift | New `generateReconciliationReport()` function uses set difference between `AgentAssignment.exclusiveWriteFiles` and `git diff --name-only`; writes `reconciliation.md` to execution directory |
| PIPE-04 | Planner estimates token cost per agent and tags as LIGHT/MODERATE/HEAVY, orchestrator warns when context exceeds safe threshold | Extends `AgentAssignment` with `costTier` field; orchestrator sums `estimatedTokens` pre-execution and warns via `onProgress` callback; threshold configurable in config.yml |
</phase_requirements>

## Standard Stack

No new dependencies. All features use existing project libraries.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.7 | Primary language | All new code is TypeScript |
| vitest | ^4.1.0 | Test framework | All tests follow existing vitest patterns |
| @ast-grep/cli | ^0.40.5 | Convention scanning in qualification | Already used by enforcement module for convention checks |

### Supporting (already installed)
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| node:child_process | built-in | `execFileSync` for git diff and sg scan | Qualification gate and reconciliation report |
| node:fs | built-in | File I/O for reconciliation report | Writing reconciliation.md to execution directory |

### No New Dependencies
This phase is purely internal TypeScript code extending existing types and control flow. No npm installs needed.

## Architecture Patterns

### Recommended Project Structure
```
src/
  execution/
    orchestrator.ts       # Modified: qualification gate in executeAgent()
    types.ts              # Modified: AgentResult gets qualified + qualificationIssues
    qualification.ts      # NEW: qualification check logic (git diff + convention scan)
    reconciliation.ts     # NEW: reconciliation report generator
  eval/
    types.ts              # Modified: EvalFinding gets classification field
    classifier.ts         # NEW: rule-based failure classification heuristics
  debug/
    debug-agent.ts        # Modified: consume classification for fix priority
    fix-planner.ts        # Modified: classification-aware routing
  orient/
    types.ts              # Modified: AgentAssignment gets costTier field
    planner.ts            # Modified: compute costTier from estimatedTokens
  config/
    schema.ts             # Modified: add execute.token_budget_threshold config key
tests/
  execution/
    qualification.test.ts # NEW: tests for qualification gate
    reconciliation.test.ts # NEW: tests for reconciliation report
  eval/
    classifier.test.ts   # NEW: tests for failure classification
```

### Pattern 1: Inline Gate in executeAgent()
**What:** Insert qualification check after successful agent dispatch, before returning AgentResult.
**When to use:** After the agent succeeds (dispatchResult.success === true) but before the coordination entry is written.
**Example:**
```typescript
// In executeAgent(), after agent succeeds (line ~474 of orchestrator.ts):
// 1. Run qualification check
const qualification = await runQualification(
  assignment.exclusiveWriteFiles,
  options.projectRoot,
);

// 2. Attach to agent result
const agentResult: AgentResult = {
  name: agentName,
  status: "complete",
  durationMs,
  filesChanged: qualification.actualFiles, // Use git diff results instead of assignment
  linesAdded: qualification.linesAdded,
  linesRemoved: qualification.linesRemoved,
  retried: dispatchResult.success ? false : true,
  qualified: qualification.qualified,
  qualificationIssues: qualification.issues,
};
```

### Pattern 2: Rule-Based Classification Mapping
**What:** Map eval criterion + severity to a failure classification using simple if/else rules.
**When to use:** After eval findings are parsed, before they're passed to the debug agent.
**Example:**
```typescript
export type FailureClassification =
  | "SCOPE_DRIFT"
  | "PLAN_GAP"
  | "CODE_BUG"
  | "CONVENTION_MISS";

export function classifyFinding(finding: EvalFinding): FailureClassification {
  switch (finding.criterion) {
    case "scope_compliance":
      return "SCOPE_DRIFT";
    case "completeness":
      return "PLAN_GAP";
    case "correctness":
      return "CODE_BUG";
    case "convention_adherence":
      return "CONVENTION_MISS";
  }
}
```

### Pattern 3: Set Difference for Reconciliation
**What:** Compare planned files (from all agents) against actual git changes using set operations.
**When to use:** After all waves complete, before returning ExecutionResult from runExecution().
**Example:**
```typescript
export function computeReconciliation(
  agents: AgentAssignment[],
  actualChanges: string[],
): ReconciliationData {
  const planned = new Set(agents.flatMap(a => a.exclusiveWriteFiles));
  const actual = new Set(actualChanges);

  const unexpected = [...actual].filter(f => !planned.has(f));
  const missed = [...planned].filter(f => !actual.has(f));

  return { planned: planned.size, actual: actual.size, unexpected, missed };
}
```

### Pattern 4: Config-Driven Token Threshold
**What:** Add configurable threshold to config.yml schema and read it in orchestrator.
**When to use:** Before wave dispatch loop begins, compute cumulative estimate and warn.
**Example:**
```typescript
// In runExecution(), after reading plan:
const config = loadConfig(projectRoot);
const threshold = config?.execute?.token_budget_threshold ?? 150_000;
const totalEstimate = plan.agents.reduce((sum, a) => sum + a.estimatedTokens, 0);
if (totalEstimate > threshold) {
  onProgress(
    `WARNING: Estimated tokens (~${Math.round(totalEstimate / 1000)}K) exceed safe threshold (~${Math.round(threshold / 1000)}K).`
  );
}
```

### Anti-Patterns to Avoid
- **Blocking qualification failures:** D-02 explicitly says flag-and-continue. Do NOT halt the pipeline on qualification failure.
- **Mid-execution token warnings:** D-12 says warn before execution starts only. Mid-execution warnings are too late to act on and add noise.
- **Per-wave reconciliation:** D-07 says once after full execution. Per-wave would add overhead without actionable benefit.
- **LLM-based classification:** D-04 says rule-based heuristics. Do NOT dispatch an agent to classify findings -- the mapping is deterministic from criterion.
- **Heavy convention scanning:** The qualification convention scan should be lightweight. Full `runPreCommitCheck()` reads learnings and filters rules. For qualification, use a simpler check -- just run sg scan on changed files with available rules.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Git diff parsing | Custom git output parser | `execFileSync("git", ["diff", "--name-only", "--relative", "HEAD"])` | Git's `--name-only` flag gives clean newline-delimited output |
| Convention scanning | Custom AST pattern matcher | `scanRule()` pattern from enforcement module or `sg scan --rule --json` | ast-grep CLI already does structural matching with JSON output |
| Token estimation | Custom tokenizer | `tokenEstimate()` from `src/eval/eval-agent.ts` | chars/4 approximation is established pattern in the codebase |
| Config-driven thresholds | Hardcoded magic numbers | `loadConfig()` from `src/config/loader.ts` + schema extension | Follows existing config.yml pattern for all configurable values |

**Key insight:** Every piece of functionality needed already exists in the codebase -- git operations, convention scanning, token estimation, config loading. This phase is about wiring them together, not building new capabilities.

## Common Pitfalls

### Pitfall 1: Git Diff in Wrong Working Directory
**What goes wrong:** `execFileSync("git", ["diff", "--name-only"])` runs relative to cwd, which may not be projectRoot.
**Why it happens:** Node.js child processes inherit the parent's cwd unless explicitly set.
**How to avoid:** Always pass `{ cwd: projectRoot }` as options to `execFileSync`.
**Warning signs:** Empty git diff output when files were clearly changed, or paths don't match AgentAssignment.exclusiveWriteFiles.

### Pitfall 2: Qualification Slowing Down the Pipeline
**What goes wrong:** Convention scanning with sg CLI adds subprocess overhead per agent.
**Why it happens:** Each qualification runs sg scan as a child process, which has startup cost.
**How to avoid:** Only run convention scan if sg is available (check once, cache result). If sg is not available, skip convention check and only verify file changes. Keep the scan scoped to changed files only (not the whole codebase).
**Warning signs:** Execution time increases significantly with many agents.

### Pitfall 3: Classification of Findings Without a Matching Criterion
**What goes wrong:** If EvalFinding has an unexpected criterion value, the classifier fails.
**Why it happens:** The classifier uses a switch/case mapping. Exhaustive matching may miss future criterion types.
**How to avoid:** Use a default case that returns "CODE_BUG" as the fallback classification. TypeScript exhaustive checking with `never` can catch this at compile time.
**Warning signs:** Unclassified findings appearing in debug cycle.

### Pitfall 4: Reconciliation Report Path Conflicts
**What goes wrong:** If reconciliation.md already exists from a previous run, it gets overwritten silently.
**Why it happens:** Using `writeFileSync` without checking for existing files.
**How to avoid:** Overwriting is actually correct behavior for reconciliation (one report per execution run). Document this explicitly -- reconciliation.md is always fresh for the current execution.
**Warning signs:** None -- this is the expected behavior.

### Pitfall 5: AgentAssignment.exclusiveWriteFiles vs Actual Agent Writes
**What goes wrong:** The reconciliation compares planned files from `exclusiveWriteFiles` against git diff, but agents may create new files not listed in the plan.
**Why it happens:** The plan lists known files, but agents might create helper files, test files, etc.
**How to avoid:** This is expected behavior and is exactly what "unexpected modifications" detection surfaces. The reconciliation report should highlight these as informational, not errors.
**Warning signs:** Many "unexpected" files that are actually legitimate agent outputs.

### Pitfall 6: tokenEstimate Import Creates Circular Dependency
**What goes wrong:** Importing `tokenEstimate()` from `src/eval/eval-agent.ts` into `src/orient/planner.ts` may create an import chain issue.
**Why it happens:** eval-agent imports from eval/types which imports from verify/types, creating a transitive dependency chain.
**How to avoid:** Extract `tokenEstimate()` into a shared utility (e.g., `src/utils/tokens.ts`) or duplicate the simple one-liner. The function is `Math.ceil(text.length / 4)` -- trivial to inline.
**Warning signs:** TypeScript compilation errors about circular references.

### Pitfall 7: Config Schema Breaking Change
**What goes wrong:** Adding a new required field to the Zod config schema causes existing config.yml files to fail validation.
**Why it happens:** New fields without `.optional()` or `.default()` reject existing configs that lack the field.
**How to avoid:** New config fields MUST use `.optional()` with `?? defaultValue` at the consumption site. The `token_budget_threshold` field should be `z.number().int().positive().optional()` in the schema.
**Warning signs:** `config.yml validation failed` errors on projects with existing configs.

## Code Examples

Verified patterns from the existing codebase:

### Git Diff for File Change Verification
```typescript
// Pattern from enforcement module (uses execFileSync for git operations)
import { execFileSync } from "node:child_process";

export function getActualChangedFiles(projectRoot: string): string[] {
  try {
    const output = execFileSync(
      "git",
      ["diff", "--name-only", "--relative", "HEAD"],
      { cwd: projectRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return output.trim().split("\n").filter(f => f.length > 0);
  } catch {
    return [];
  }
}
```

### Convention Scan on Specific Files
```typescript
// Simplified from src/enforcement/pre-commit-check.ts scanRule()
import { execFileSync } from "node:child_process";

function scanFilesForConventions(
  files: string[],
  projectRoot: string,
): { file: string; line: number; rule: string }[] {
  // Check sg availability
  try {
    execFileSync("sg", ["--version"], { stdio: "pipe" });
  } catch {
    return []; // sg not available, skip convention check
  }

  // Find rule files (reuse enforcement pattern)
  const rulesDir = join(projectRoot, "src", "conventions", "rules");
  // ... scan with individual rules per the enforcement module pattern
}
```

### Extending AgentResult Type
```typescript
// Current AgentResult (from src/execution/types.ts):
export interface AgentResult {
  name: string;
  status: "complete" | "failed" | "skipped";
  durationMs: number;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
  error?: string;
  retried: boolean;
  changeReportPath?: string;
  // NEW fields for PIPE-01:
  qualified?: boolean;
  qualificationIssues?: string[];
}
```

### Extending EvalFinding Type
```typescript
// Current EvalFinding (from src/eval/types.ts):
export interface EvalFinding {
  id: string;
  criterion: EvalCriterion;
  category: FindingCategory;
  file: string;
  line: number;
  description: string;
  severity: Severity;
  evidence: string;
  goldenFileRef?: string;
  // NEW field for PIPE-02:
  classification?: FailureClassification;
}
```

### Extending AgentAssignment Type
```typescript
// Current AgentAssignment (from src/orient/types.ts):
export interface AgentAssignment {
  name: string;
  wave: number;
  task: string;
  exclusiveWriteFiles: string[];
  readOnlyFiles: string[];
  conventions: string[];
  goldenFiles: Array<{ path: string; lines: string }>;
  dependsOn: string[];
  estimatedTokens: number;
  timeoutSeconds: number;
  // NEW field for PIPE-04:
  costTier?: "LIGHT" | "MODERATE" | "HEAVY";
}
```

### Config Schema Extension
```typescript
// In src/config/schema.ts, extend execute section:
execute: z.object({
  parallel: z.enum(["auto", "sequential", "parallel"]).optional(),
  max_agents_concurrent: z.number().int().min(1).max(10),
  // NEW for PIPE-04:
  token_budget_threshold: z.number().int().positive().optional(),
}),
```

### Coordination Log Entry for Qualification
```typescript
// Following the existing appendCoordinationEntry pattern:
appendCoordinationEntry(coordinationPath, {
  timestamp: new Date().toISOString(),
  agent: agentName,
  signal: "done",
  files: qualification.actualFiles,
  detail: qualification.qualified
    ? `Qualified: +${linesAdded}/-${linesRemoved} (${durationSec}s)`
    : `QUALIFICATION ISSUES: ${qualification.issues.join("; ")} (${durationSec}s)`,
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No post-agent validation | Per-task qualification gates | Phase 13 | Catches agents that produce no actual file changes |
| Unclassified eval findings | Classified findings (SCOPE_DRIFT/PLAN_GAP/CODE_BUG/CONVENTION_MISS) | Phase 13 | Debug agent can prioritize fixes by category |
| No plan-vs-actual comparison | Reconciliation report | Phase 13 | Surfaces unexpected modifications and missed files |
| No token budget awareness | LIGHT/MODERATE/HEAVY cost tiers + threshold warning | Phase 13 | Prevents context overflow in large execution plans |

## Open Questions

1. **Convention scan scope in qualification**
   - What we know: The enforcement module's `runPreCommitCheck()` reads learnings.md, filters for VERIFIED rules, and scans with sg. The qualification check needs a lighter version.
   - What's unclear: Should qualification scan ALL convention rules or only VERIFIED ones?
   - Recommendation: Reuse `getVerifiedRuleIds()` from enforcement module to scan only VERIFIED rules. This maintains consistency with the enforcement philosophy and keeps the scan targeted. Alternatively, if no learnings.md exists, skip the convention check entirely (same pattern as enforcement module).

2. **tokenEstimate placement**
   - What we know: `tokenEstimate()` is a one-liner (`Math.ceil(text.length / 4)`) currently in `src/eval/eval-agent.ts`. The planner also needs it for cost tier computation.
   - What's unclear: Whether to extract to shared utility, duplicate, or import across module boundaries.
   - Recommendation: Extract to `src/utils/tokens.ts` as a shared utility. The function is simple but used by three modules (eval-agent, planner, orchestrator). Import from a shared utility avoids both duplication and cross-domain imports.

3. **Reconciliation git diff baseline**
   - What we know: D-09 says `git diff --name-only` for actual changes. But what's the baseline? HEAD before execution started vs HEAD after all agents complete?
   - What's unclear: Whether the orchestrator records a git baseline commit before execution begins.
   - Recommendation: Record the git HEAD commit hash at the start of `runExecution()` and diff against it at the end. This gives a clean view of what the execution run actually changed, regardless of any changes that were already staged.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.0 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/execution/qualification.test.ts tests/eval/classifier.test.ts tests/execution/reconciliation.test.ts --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PIPE-01 | Qualification verifies files changed via git diff after each agent | unit | `npx vitest run tests/execution/qualification.test.ts -x` | No -- Wave 0 |
| PIPE-01 | Qualification runs scoped convention check on changed files | unit | `npx vitest run tests/execution/qualification.test.ts -x` | No -- Wave 0 |
| PIPE-01 | Qualification failure flags AgentResult but does not halt pipeline | integration | `npx vitest run tests/execution/orchestrator.test.ts -x` | Yes -- extend existing |
| PIPE-02 | Eval findings classified as SCOPE_DRIFT/PLAN_GAP/CODE_BUG/CONVENTION_MISS | unit | `npx vitest run tests/eval/classifier.test.ts -x` | No -- Wave 0 |
| PIPE-02 | Debug agent receives classification and prioritizes fix strategy | unit | `npx vitest run tests/debug/debug-agent.test.ts -x` | Yes -- extend existing |
| PIPE-03 | Reconciliation compares planned vs actual git changes | unit | `npx vitest run tests/execution/reconciliation.test.ts -x` | No -- Wave 0 |
| PIPE-03 | Report surfaces unexpected and missed files | unit | `npx vitest run tests/execution/reconciliation.test.ts -x` | No -- Wave 0 |
| PIPE-04 | Planner tags agents as LIGHT/MODERATE/HEAVY | unit | `npx vitest run tests/orient/planner.test.ts -x` | Yes -- extend existing |
| PIPE-04 | Orchestrator warns when cumulative tokens exceed threshold | integration | `npx vitest run tests/execution/orchestrator.test.ts -x` | Yes -- extend existing |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/execution/qualification.test.ts tests/eval/classifier.test.ts tests/execution/reconciliation.test.ts --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/execution/qualification.test.ts` -- covers PIPE-01 qualification logic
- [ ] `tests/eval/classifier.test.ts` -- covers PIPE-02 classification heuristics
- [ ] `tests/execution/reconciliation.test.ts` -- covers PIPE-03 reconciliation logic

## Project Constraints (from CLAUDE.md)

- **Tech stack:** TypeScript, vitest for testing, ast-grep CLI for convention scanning
- **Performance:** Orchestrator stays under 15K tokens
- **Quality:** Convention false positive rate <5%
- **Build isolation:** Enforcement module uses lightweight inline patterns (no heavy imports from config/loader). Qualification should follow the same discipline if it needs to run standalone.
- **Config pattern:** All configurable values go through `loadConfig()` from `src/config/loader.ts` with Zod schema validation. New config fields MUST be `.optional()` to avoid breaking existing configs.
- **Agent module pattern:** Options + Result + async function (used by eval, debug, execution)
- **Coordination log:** Append-only markdown table rows via `appendCoordinationEntry()`
- **GSD workflow:** All changes go through GSD commands

## Sources

### Primary (HIGH confidence)
- `src/execution/orchestrator.ts` -- current execution flow, executeAgent() insertion point
- `src/execution/types.ts` -- current AgentResult shape
- `src/eval/types.ts` -- current EvalFinding shape
- `src/eval/eval-agent.ts` -- tokenEstimate() implementation, eval criteria constants
- `src/orient/types.ts` -- current AgentAssignment shape
- `src/orient/planner.ts` -- current planner prompt and plan parsing
- `src/debug/debug-agent.ts` -- current debug loop and finding routing
- `src/debug/fix-planner.ts` -- isDesignDecision() existing classification
- `src/enforcement/pre-commit-check.ts` -- sg scan pattern, rule resolution
- `src/enforcement/types.ts` -- EnforcementFinding shape
- `src/config/schema.ts` -- current config schema, extension pattern
- `src/config/loader.ts` -- loadConfig() pattern
- `src/execution/coordination.ts` -- appendCoordinationEntry() pattern
- `src/hooks/lib/budget-composer.ts` -- estimateTokens() shared pattern

### Secondary (MEDIUM confidence)
- `tests/execution/orchestrator.test.ts` -- test fixture patterns for execution testing
- `tests/eval/eval-agent.test.ts` -- test fixture patterns for eval testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all features use existing libraries
- Architecture: HIGH -- all integration points are well-understood, types are clear, insertion points are identified
- Pitfalls: HIGH -- based on direct code inspection of existing patterns and common Node.js/git integration issues

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- internal code changes only, no external dependencies)
