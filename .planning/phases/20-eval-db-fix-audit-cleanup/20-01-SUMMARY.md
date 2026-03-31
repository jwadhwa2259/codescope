---
phase: 20-eval-db-fix-audit-cleanup
plan: 01
subsystem: eval
tags: [better-sqlite3, scorecard, violation-index, ast-grep, rule-metadata]

# Dependency graph
requires:
  - phase: 19-eval-skill-scoring-pipeline
    provides: deterministic scorecard, violation index builder, rule-metadata module
provides:
  - Correct DB path for eval deterministic scorecard (graph.db via getGraphDbPath)
  - ViolationEntry.ruleId uses ast-grep rule IDs or slugified fallback instead of display names
affects: [eval, violation-index, injection-artifacts, scorecard]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolveRuleId helper: RULE_NAME_TO_ID lookup with slugified fallback for unmapped conventions"

key-files:
  created: []
  modified:
    - src/tools/eval.ts
    - src/artifacts/violation-index.ts
    - tests/tools/eval.test.ts
    - tests/artifacts/violation-index.test.ts

key-decisions:
  - "Slugified fallback for unmapped convention names: lowercase, spaces to dashes, strip non-alphanum"

patterns-established:
  - "resolveRuleId: RULE_NAME_TO_ID.get() with slugified fallback for conventions not in RULE_METADATA"

requirements-completed: [EVAL-01, EVAL-02, EVAL-04]

# Metrics
duration: 3min
completed: 2026-03-31
---

# Phase 20 Plan 01: Eval DB Fix & ViolationEntry RuleId Fix Summary

**Fixed eval scorecard DB path (codescope.db -> graph.db) and ViolationEntry.ruleId (display names -> ast-grep rule IDs with slugified fallback)**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-31T14:22:49Z
- **Completed:** 2026-03-31T14:25:43Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- eval.ts deterministic mode now opens graph.db via getGraphDbPath(projectRoot), enabling real blast-radius and import-correctness metrics
- ViolationEntry.ruleId uses RULE_NAME_TO_ID lookup for known ast-grep rules, falls back to slugified convention name for LLM-detected conventions
- TDD-verified: both fixes had failing tests before implementation, passing after

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix eval.ts DB path** - `a02e1b8` (fix)
2. **Task 2: Fix ViolationEntry.ruleId** - `f9d3fc3` (fix)

_Both tasks followed TDD: RED (failing test) -> GREEN (fix) -> verify_

## Files Created/Modified
- `src/tools/eval.ts` - Changed import to include getGraphDbPath, replaced path.join(csPath, "codescope.db") with getGraphDbPath(projectRoot)
- `src/artifacts/violation-index.ts` - Added RULE_NAME_TO_ID import, resolveRuleId() helper, replaced bare conv.name with resolveRuleId(conv.name)
- `tests/tools/eval.test.ts` - Added 2 tests: graph.db path verification (with real DB data), graceful degradation without DB
- `tests/artifacts/violation-index.test.ts` - Updated assertions from display names to slugified rule IDs, added lowercase/no-spaces checks

## Decisions Made
- Slugified fallback for unmapped convention names uses simple transform: lowercase, spaces to dashes, strip non-alphanum characters. This handles LLM-detected conventions that have no RULE_METADATA entry.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - both fixes are fully wired with real data paths.

## Next Phase Readiness
- Eval scorecard now produces real metrics when graph.db exists
- Violation index emits machine-readable rule IDs compatible with ast-grep filtering
- Ready for Plan 02 (audit cleanup)

---
*Phase: 20-eval-db-fix-audit-cleanup*
*Completed: 2026-03-31*

## Self-Check: PASSED
- All 5 files exist (2 source, 2 test, 1 SUMMARY)
- Both task commits found (a02e1b8, f9d3fc3)
- 59/59 tests passing across all 3 affected test files
