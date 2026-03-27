---
phase: 04-orient-and-execution-engine
plan: 01
subsystem: orient
tags: [graphology, clarification, ambiguity, scope-contract, blast-radius, conventions, analysis]

requires:
  - phase: 03-bootstrap-synthesis-mcp
    provides: "Graph cache (getGraph), analytics (blastRadius, computeDangerZones, computeCentrality), conventions.md parsing, MCP orient tool"
provides:
  - "Orient shared types for entire orient pipeline (ScopeContract, ClarificationQuestion, AnalysisResult, ExecutionPlan, etc.)"
  - "Graph-informed ambiguity detection (assessAmbiguity with HIGH/MEDIUM/LOW thresholds)"
  - "Clarification module with style support (thorough/minimal/auto) and question generation"
  - "Scope contract builder and markdown artifact writer (UI-SPEC format)"
  - "Analysis module: affected files, blast radius, convention matching, test mapping, cross-community impact"
affects: [04-02-PLAN, 04-03-PLAN, 04-04-PLAN, 04-05-PLAN, 04-06-PLAN]

tech-stack:
  added: []
  patterns:
    - "Orient module pattern: Options interface + async function + artifact writer"
    - "Graph keyword matching: walk all nodes, match name/filePath lowercase against keywords"
    - "Ambiguity thresholds: HIGH (matchedNodes<3 OR communities>3 OR dangerZones>2), MEDIUM (communities>1 OR dangerZones>0), LOW (else)"
    - "Question generation grouped by topic: scope_boundary, convention_conflict, danger_zone, test_coverage"
    - "Soft guardrail: max 5 clarification questions (D-05)"

key-files:
  created:
    - src/orient/types.ts
    - src/orient/clarification.ts
    - src/orient/analysis.ts
    - tests/orient/types.test.ts
    - tests/orient/clarification.test.ts
    - tests/orient/analysis.test.ts
  modified: []

key-decisions:
  - "Re-implemented readRelevantConventions inline in analysis.ts (same parsing as orient.ts) rather than extracting to shared util -- avoids circular dependency risk, keeps modules self-contained"
  - "generateQuestions adds vague-task scope_boundary question when matchedNodes<3 (not in original plan, needed for HIGH ambiguity with no graph matches)"
  - "classifyRisk duplicated in both clarification.ts and analysis.ts (same 3-line function) to avoid coupling to orient.ts MCP tool"

patterns-established:
  - "Orient module pattern: Options interface + async run function + artifact writer"
  - "Mock graph pattern for orient tests: vi.mock graph/cache.js with DirectedGraph + centralities Map"
  - "Ambiguity assessment as pure function consuming graph data"

requirements-completed: [ORNT-02, ORNT-03, ORNT-04, ORNT-05, ORNT-08]

duration: 7min
completed: 2026-03-24
---

# Phase 04 Plan 01: Orient Types, Clarification, and Analysis Summary

**Graph-informed ambiguity detection (HIGH/MEDIUM/LOW), topic-grouped clarification questions with style support, scope contract generation, and full analysis module with blast radius, convention matching, test mapping, and cross-community impact**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-24T00:26:50Z
- **Completed:** 2026-03-24T00:33:40Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Defined all shared types for the orient pipeline (18 types/interfaces consumed by 5+ future modules)
- Implemented graph-informed ambiguity detection with 3-level thresholds (HIGH/MEDIUM/LOW) based on node matching, community spread, and danger zone overlap
- Built clarification module supporting thorough/minimal/auto styles, respecting config and --no-clarify flag
- Implemented analysis module with 5 analysis dimensions: affected files, blast radius, convention matching, test file discovery, cross-community impact
- Full TDD: 40 tests across 3 test files, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Orient shared types and clarification module** - `b1a6a8d` (test), `d021b7a` (feat)
2. **Task 2: Analysis module for graph traversal and convention matching** - `df34c99` (test), `73b4437` (feat)

_Note: TDD tasks have RED (test) + GREEN (feat) commits_

## Files Created/Modified
- `src/orient/types.ts` - All shared types for the orient pipeline (18 types/interfaces)
- `src/orient/clarification.ts` - Ambiguity detection, question generation, scope contract building, artifact writing
- `src/orient/analysis.ts` - Graph traversal analysis: affected files, blast radius, conventions, test mapping, cross-community impact
- `tests/orient/types.test.ts` - Type shape validation tests (9 tests)
- `tests/orient/clarification.test.ts` - Clarification module tests: ambiguity, questions, scope contract, runClarification (20 tests)
- `tests/orient/analysis.test.ts` - Analysis module tests: all 5 dimensions + artifact writing (11 tests)

## Decisions Made
- Re-implemented readRelevantConventions inline in analysis.ts (same parsing logic as orient.ts) rather than extracting to a shared util to avoid coupling between the orient pipeline module and the MCP tool module
- Added vague-task scope_boundary question in generateQuestions when matchedNodes < 3, ensuring HIGH ambiguity from vague tasks always produces at least one question
- Duplicated the 3-line classifyRisk helper in both clarification.ts and analysis.ts to keep modules self-contained

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added vague-task scope_boundary question for HIGH ambiguity**
- **Found during:** Task 1 (clarification module GREEN phase)
- **Issue:** When ambiguity is HIGH due to matchedNodes < 3 (vague task), no questions were generated because all question generators checked for community spread or affected files, which are empty for vague tasks
- **Fix:** Added a scope_boundary question when matchedNodes < 3 asking for more specific details
- **Files modified:** src/orient/clarification.ts
- **Verification:** Test "generates questions when ambiguity is HIGH" now passes
- **Committed in:** d021b7a (Task 1 feat commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Auto-fix necessary for correctness -- vague tasks must produce questions when ambiguity is HIGH. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functions are fully implemented with working graph queries.

## Next Phase Readiness
- All orient shared types defined and available for Plan 02 (research module) and beyond
- Clarification and analysis modules ready for integration into the orient pipeline (Plan 04)
- The orient pipeline orchestrator can now call runClarification and runAnalysis as pipeline steps

## Self-Check: PASSED

All 6 created files verified on disk. All 4 commit hashes verified in git log.

---
*Phase: 04-orient-and-execution-engine*
*Completed: 2026-03-24*
