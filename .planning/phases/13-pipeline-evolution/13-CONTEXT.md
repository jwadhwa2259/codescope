# Phase 13: Pipeline Evolution - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

The orient/execute pipeline self-monitors with per-task qualification after each agent, classifies eval failures by root cause to inform debug strategy, detects scope drift via plan-vs-actual reconciliation, and warns when cumulative token cost approaches the context budget -- producing higher autonomous execution reliability.

Requirements: PIPE-01, PIPE-02, PIPE-03, PIPE-04

</domain>

<decisions>
## Implementation Decisions

### Qualification Gate (PIPE-01)
- **D-01:** Qualification check runs **inline in `executeAgent()`** inside `src/execution/orchestrator.ts` -- after each agent completes, run git diff on expected files + scoped convention check before the pipeline moves to the next agent. Reuses existing `AgentResult.filesChanged` tracking.
- **D-02:** On qualification failure: **flag and continue** -- add `qualified: boolean` and `qualificationIssues: string[]` fields to `AgentResult`. Pipeline does not halt; all flags are surfaced in the reconciliation report.
- **D-03:** Qualification checks: (1) git diff confirms at least one expected file was actually modified, (2) ast-grep convention scan on changed files reports violations. Both checks produce structured issue strings.

### Failure Classification (PIPE-02)
- **D-04:** Classification uses **rule-based heuristics** mapping eval criteria to categories. The eval agent already scores `scope_compliance`, `convention_adherence`, `completeness`, `correctness`. Map: low scope_compliance -> SCOPE_DRIFT, low completeness -> PLAN_GAP, low correctness -> CODE_BUG, low convention_adherence -> CONVENTION_MISS.
- **D-05:** Classification stored as a `classification` field on `EvalFinding` -- each finding gets exactly one category tag.
- **D-06:** Debug agent consumes classification to **prioritize fix strategy**: CODE_BUG fixes first, CONVENTION_MISS second, PLAN_GAP and SCOPE_DRIFT escalated to user (design decisions, not auto-fixable).

### Reconciliation Report (PIPE-03)
- **D-07:** Reconciliation runs **once after full execution completes** -- single report comparing all planned files against actual git changes. No per-wave overhead.
- **D-08:** Report is a **standalone markdown file** (`reconciliation.md`) in the execution directory -- separate from execution summary so eval/debug can consume it independently.
- **D-09:** Unexpected modification detection via **set difference**: planned files from `AgentAssignment.targetFiles`, actual changes from `git diff --name-only`. Files in actual but not planned = unexpected. Files in planned but not actual = missed.
- **D-10:** Report sections: summary (counts), unexpected files table, missed files table, per-agent planned-vs-actual breakdown.

### Token Budget & Warning (PIPE-04)
- **D-11:** Planner classifies each agent as **LIGHT (<20K), MODERATE (20-50K), HEAVY (>50K)** tokens using the existing `tokenEstimate()` (chars/4) from `src/eval/eval-agent.ts`. Tags stored alongside existing `estimatedTokens` field in `AgentAssignment`.
- **D-12:** Orchestrator warns **before execution starts** -- sums all agent estimates, emits warning if cumulative exceeds safe threshold. No mid-execution warnings (too late to act on).
- **D-13:** Safe threshold **configurable in config.yml, default 150K tokens** -- leaves headroom for verify/eval/debug within a 200K context window. Warning is informational, does not block execution.

### Claude's Discretion
- Exact convention scan implementation in qualification (reuse Phase 12's ast-grep rule runner or lighter check)
- Whether to extract `tokenEstimate()` to a shared utility or import from eval-agent
- Reconciliation report markdown formatting details
- Whether qualification issues go into the coordination log in addition to AgentResult

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Execution Engine (primary integration target)
- `src/execution/orchestrator.ts` -- `runExecution()`, `executeAgent()`, wave dispatch loop, `AgentResult` tracking
- `src/execution/types.ts` -- `AgentResult`, `ExecutionResult`, `ExecutionOptions`, `CoordinationEntry` types
- `src/execution/agent-spawner.ts` -- `buildAgentPrompt()`, `buildAgentInvocation()`, `writeChangeReport()`
- `src/execution/coordination.ts` -- coordination log append-only entries

### Eval & Debug (classification consumers)
- `src/eval/eval-agent.ts` -- `tokenEstimate()`, `EvalFinding`, `EvalCriterion`, `parseEvalFindings()`, criteria scoring
- `src/eval/types.ts` -- `EvalFinding`, `EvalCriterionResult`, `Severity` types
- `src/debug/debug-agent.ts` -- `runDebug()`, `isDesignDecision()` classification, fix loop
- `src/debug/fix-planner.ts` -- `createFixPlan()`, `buildFixPrompt()`
- `src/debug/types.ts` -- `DebugOptions`, `FixTask`, `DesignDecision`

### Planner (token estimation source)
- `src/orient/planner.ts` -- `buildPlannerPrompt()`, `AgentAssignment.estimatedTokens`
- `src/orient/types.ts` -- `AgentAssignment`, `ExecutionPlan`, `ExecutionWave`

### Convention Scanning (qualification reuse)
- `src/tools/conventions.ts` -- `parseConventions()`, `ParsedConvention` -- convention data access
- `src/hooks/lib/budget-composer.ts` -- token budget composition pattern (reference for budget strategy)

### Requirements
- `.planning/REQUIREMENTS.md` -- PIPE-01 through PIPE-04 acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tokenEstimate()` in `src/eval/eval-agent.ts` -- chars/4 approximation, reuse for PIPE-04 LIGHT/MODERATE/HEAVY classification
- `AgentResult` type already has `filesChanged`, `linesAdded`, `linesRemoved` -- extend with `qualified` and `qualificationIssues`
- `EvalFinding` type in `src/eval/types.ts` -- extend with `classification` field for PIPE-02
- `isDesignDecision()` in `src/debug/fix-planner.ts` -- existing classification logic, augment with new PIPE-02 categories
- `parseConventions()` in `src/tools/conventions.ts` -- convention data access for qualification scans

### Established Patterns
- Agent module pattern: Options + Result + async function (used by eval, debug, execution)
- Coordination log: append-only markdown table rows via `appendCoordinationEntry()`
- Execution summary: standalone markdown file in execution directory
- Config-driven thresholds: `loadConfig()` from `src/config/loader.ts` for all configurable values

### Integration Points
- `executeAgent()` in orchestrator.ts -- insert qualification check after agent dispatch returns
- `EvalFinding` type -- add classification field, populate in eval-agent.ts scoring logic
- `AgentAssignment` type -- planner already writes `estimatedTokens`, add `costTier` field
- `runExecution()` return path -- generate reconciliation report before returning `ExecutionResult`
- Debug agent entry point -- consume `EvalFinding.classification` to route fix strategy

</code_context>

<specifics>
## Specific Ideas

No specific requirements -- open to standard approaches based on existing codebase patterns.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 13-pipeline-evolution*
*Context gathered: 2026-03-28*
