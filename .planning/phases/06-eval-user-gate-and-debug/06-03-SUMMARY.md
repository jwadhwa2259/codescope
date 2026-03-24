---
phase: 06-eval-user-gate-and-debug
plan: 03
subsystem: eval
tags: [eval, user-gate, mcp-tool, routing, interactive, auto-debug, auto-skip-minor]

# Dependency graph
requires:
  - phase: 06-eval-user-gate-and-debug
    provides: EvalFinding, EvalCriterion, groupFindingsByCriterion, appendIgnoreEntry, appendTodoEntry, loadIgnorePatterns
provides:
  - routeFindings function for 3 gate modes (interactive, auto-debug, auto-skip-minor)
  - applyGateDecisions function for interactive gate user selections (debug/ignore/defer)
  - buildGatePresentation for UI-SPEC interactive markdown format
  - codescope_eval MCP tool with graceful degradation (D-31)
  - GateAction, GateDecision, GateResult types
affects: [06-04]

# Tech tracking
tech-stack:
  added: []
  patterns: [gate routing by mode config, UI-SPEC presentation builders, MCP tool graceful degradation for orient-dependent criteria]

key-files:
  created:
    - src/eval/gate.ts
    - src/tools/eval.ts
    - tests/eval/gate.test.ts
    - tests/tools/eval.test.ts
  modified: []

key-decisions:
  - "Gate routing is a pure synchronous function that returns GateResult based on mode config, no async needed"
  - "Interactive mode returns presentation string but no pre-routed findings; caller invokes applyGateDecisions after user review"
  - "MCP tool returns static analysis results only; full LLM-as-judge eval dispatched by skill body pipeline"
  - "ORIENT_DEPENDENT criteria (scope_compliance, completeness) marked unavailable without scope contract, matching verify tool D-29 pattern"

patterns-established:
  - "Gate mode routing: switch on config mode, return structured GateResult with toDebug/ignored/deferred/skipped arrays"
  - "Presentation builders: separate functions per mode (interactive, auto-debug, auto-skip-minor) for UI-SPEC format compliance"
  - "MCP eval tool follows handleXxx + registerXxxTool extraction pattern established in Phase 3"

requirements-completed: [GATE-01, GATE-02, GATE-03]

# Metrics
duration: 4min
completed: 2026-03-24
---

# Phase 6 Plan 03: User Gate and Eval MCP Tool Summary

**User gate routing logic for 3 modes (interactive/auto-debug/auto-skip-minor) with codescope_eval MCP tool featuring orient-dependent graceful degradation**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-24T18:11:33Z
- **Completed:** 2026-03-24T18:15:37Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Gate routing logic handles all 3 eval modes: interactive groups by criterion with severity sort, auto-debug routes all to debug, auto-skip-minor filters INFO to skipped
- Interactive gate applies user decisions (debug/ignore/defer) with learnings.md persistence via appendIgnoreEntry and appendTodoEntry
- codescope_eval MCP tool with bootstrap guard, config-based criteria selection, orient artifact detection, and partial response degradation
- Presentation builders match UI-SPEC format exactly for all 3 gate modes

## Task Commits

Each task was committed atomically:

1. **Task 1: User gate routing logic** - `a583c9b` (test: RED), `621ebe5` (feat: GREEN)
2. **Task 2: codescope_eval MCP tool** - `036b913` (test: RED), `602049c` (feat: GREEN)

_TDD tasks have RED (failing test) and GREEN (implementation) commits._

## Files Created/Modified
- `src/eval/gate.ts` - GateAction/GateDecision/GateResult types, routeFindings, applyGateDecisions, buildGatePresentation, buildAutoDebugPresentation, buildAutoSkipMinorPresentation
- `src/tools/eval.ts` - handleEval MCP handler, registerEvalTool MCP registration, EvalCriterionType zod schema, ORIENT_DEPENDENT criteria, CAPABILITIES
- `tests/eval/gate.test.ts` - 15 tests for gate routing, decisions, and presentation
- `tests/tools/eval.test.ts` - 8 tests for MCP tool handler and registration

## Decisions Made
- Gate routing is a pure synchronous function (no async needed) -- mode determines routing directly from the findings array
- Interactive mode returns a presentation string but no pre-routed findings; the caller invokes applyGateDecisions separately after the user reviews
- MCP tool returns static analysis results only; the full LLM-as-judge evaluation is dispatched by the skill body pipeline via runEval
- ORIENT_DEPENDENT criteria (scope_compliance, completeness) are marked unavailable without scope contract, matching the verify tool D-29 graceful degradation pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Gate routing ready for debug agent integration (Plan 04)
- codescope_eval MCP tool ready for registration in MCP server
- All 23 tests passing across gate and eval tool test suites

## Self-Check: PASSED

All 4 created files verified on disk. All 4 task commits (a583c9b, 621ebe5, 036b913, 602049c) verified in git log. 23/23 tests pass.

---
*Phase: 06-eval-user-gate-and-debug*
*Completed: 2026-03-24*
