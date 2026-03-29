---
phase: 13-pipeline-evolution
plan: 02
subsystem: execution
tags: [qualification, classification, reconciliation, token-budget, pipeline-evolution]

# Dependency graph
requires:
  - phase: 13-pipeline-evolution-01
    provides: Standalone modules (tokens.ts, classifier.ts, qualification.ts, reconciliation.ts)
  - phase: 04-execution
    provides: Orchestrator, AgentResult, AgentAssignment types, coordination module
  - phase: 06-eval
    provides: EvalFinding, EvalCriterion types, eval-agent parseEvalFindings
provides:
  - Qualification gate integrated into orchestrator executeAgent
  - Failure classification applied to parsed eval findings
  - Debug agent sort by classification priority
  - Reconciliation report generated after execution
  - Token budget warning before execution starts
  - CostTier computed per agent assignment in planner
affects: [execution, eval, debug, orient]

# Tech tracking
tech-stack:
  added: []
  patterns: [qualification-then-continue, classification-based-sort, pre-execution-budget-warning]

key-files:
  created: []
  modified:
    - src/execution/types.ts
    - src/eval/types.ts
    - src/orient/types.ts
    - src/config/schema.ts
    - src/execution/orchestrator.ts
    - src/orient/planner.ts
    - src/eval/eval-agent.ts
    - src/debug/debug-agent.ts
    - tests/execution/orchestrator.test.ts
    - tests/debug/debug-agent.test.ts

key-decisions:
  - "Qualification gate runs after each agent but pipeline continues on failure (flag-and-continue per D-02)"
  - "Token budget default threshold of 150K applied at consumption site (orchestrator) not in schema default"
  - "wasRetried tracking variable added to fix retried field accuracy in success path"
  - "tokenEstimate re-exported from eval-agent via const assignment for backward compatibility"

patterns-established:
  - "Flag-and-continue pattern: qualification issues flagged on AgentResult but execution continues"
  - "Classification-based sort: debug agent processes CODE_BUG(0) before PLAN_GAP(2) before SCOPE_DRIFT(3)"
  - "Pre-execution budget warning: check cumulative token estimate before any agent dispatch"

requirements-completed: [PIPE-01, PIPE-02, PIPE-03, PIPE-04]

# Metrics
duration: 6min
completed: 2026-03-29
---

# Phase 13 Plan 02: Pipeline Evolution Integration Summary

**Four PIPE requirements wired into live pipeline -- qualification gates, failure classification, reconciliation reports, and token budget warnings active in orchestrator/eval/debug/planner**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-29T02:35:22Z
- **Completed:** 2026-03-29T02:41:13Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Extended AgentResult, EvalFinding, AgentAssignment, ExecutionResult, and config schema with new fields for all four PIPE requirements
- Wired qualification gate into orchestrator's executeAgent -- runs after each agent, populates qualified/qualificationIssues, continues on failure
- Integrated reconciliation into runExecution -- records git baseline, computes plan-vs-actual file sets, generates reconciliation.md
- Added token budget warning to runExecution -- checks cumulative token estimate against configurable threshold before execution starts
- Applied classifyFinding to parsed eval findings for automatic failure classification
- Added CLASSIFICATION_PRIORITY sort to debug agent for prioritized fix ordering
- Added classifyCostTier computation to planner's parseAgentSection for per-agent cost tier tagging
- Re-exported tokenEstimate from eval-agent via shared utility for backward compatibility
- 8 new tests (6 orchestrator, 2 debug-agent) covering all PIPE requirements, 1065 total tests passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types and config schema** - `f66edee` (feat)
2. **Task 2: Wire qualification, reconciliation, classification, and token budget into pipeline** - `ee35f8d` (feat)

## Files Created/Modified
- `src/execution/types.ts` - Added qualified, qualificationIssues, reconciliationPath fields
- `src/eval/types.ts` - Added classification field with FailureClassification import
- `src/orient/types.ts` - Added costTier field with CostTier import
- `src/config/schema.ts` - Added token_budget_threshold to execute section
- `src/execution/orchestrator.ts` - Qualification gate, reconciliation, token budget warning, wasRetried tracking
- `src/orient/planner.ts` - classifyCostTier import and computation in parseAgentSection
- `src/eval/eval-agent.ts` - Re-export tokenEstimate from shared utility, classifyFinding on parsed findings
- `src/debug/debug-agent.ts` - CLASSIFICATION_PRIORITY import and sort in runDebug
- `tests/execution/orchestrator.test.ts` - 6 new tests for qualification, reconciliation, token budget
- `tests/debug/debug-agent.test.ts` - 2 new tests for classification sort and no-classification fallback

## Decisions Made
- Qualification gate follows flag-and-continue pattern: issues are recorded on AgentResult but execution is not halted. This matches D-02 design intent.
- Token budget default threshold (150K) applied at consumption site in orchestrator.ts via `?? 150_000` rather than as a Zod default in the schema, since the schema field is optional and existing configs must not break.
- Added `wasRetried` variable to accurately track whether an agent went through the retry path before succeeding, fixing the `retried` field on AgentResult in the success path.
- tokenEstimate re-exported as `const tokenEstimate = sharedTokenEstimate` to maintain backward compatibility for all code importing from eval-agent.ts.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed retried field accuracy in executeAgent success path**
- **Found during:** Task 2 (orchestrator integration)
- **Issue:** The plan's code snippet used `retried: !dispatchResult.success ? false : false` which always returns false even when the agent was retried successfully
- **Fix:** Added `wasRetried` boolean variable set to true in the retry path, used in the AgentResult construction
- **Files modified:** src/execution/orchestrator.ts
- **Verification:** Existing retry tests still pass correctly
- **Committed in:** ee35f8d (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Bug fix was necessary for correct retried tracking. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None -- all integrations are fully wired with no placeholder data or TODO markers.

## Next Phase Readiness
- All four PIPE requirements are active in the live pipeline
- Qualification gate runs after every agent dispatch in orchestrator
- Failure classification is applied automatically during eval finding parsing
- Debug agent prioritizes CODE_BUG fixes before PLAN_GAP and SCOPE_DRIFT
- Reconciliation report is generated after every execution run
- Token budget warning fires before execution starts when estimate exceeds threshold
- Phase 13 is complete -- all standalone modules (Plan 01) are integrated (Plan 02)

## Self-Check: PASSED

- All 10 modified files verified present on disk
- Commit f66edee (Task 1) verified in git log
- Commit ee35f8d (Task 2) verified in git log
- 1065 total tests passing (8 new + 1057 existing), 0 failures

---
*Phase: 13-pipeline-evolution*
*Completed: 2026-03-29*
