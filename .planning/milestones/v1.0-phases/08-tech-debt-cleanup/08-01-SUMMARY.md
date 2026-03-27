---
phase: 08-tech-debt-cleanup
plan: 01
subsystem: core
tags: [tech-debt, json-sidecar, type-consolidation, mcp-tools, dead-code]

# Dependency graph
requires:
  - phase: 05-verification
    provides: verify report-writer and verify types
  - phase: 04-orient-and-execution-engine
    provides: wave-scheduler with local type copies, orient/types.ts canonical types
  - phase: 06-eval-user-gate-and-debug
    provides: eval tool registration, run-eval.ts JSON sidecar consumer
provides:
  - JSON sidecar file (.json) alongside verify markdown report for structured eval consumption
  - Unified type imports in wave-scheduler from orient/types.ts (no local copies)
  - Clean validation.ts with zero 'as unknown' casts
  - Accurate MCP tool documentation (12 tools including codescope_eval)
  - Dead code removal in learning-synthesizer.ts
affects: [eval-pipeline, verify-pipeline, execution-engine]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "JSON sidecar pattern: .md report + .json structured data for cross-pipeline consumption"
    - "Type re-export pattern: import type + export type for downstream consumers"

key-files:
  created: []
  modified:
    - src/verify/report-writer.ts
    - tests/verify/report-writer.test.ts
    - src/execution/wave-scheduler.ts
    - src/orient/validation.ts
    - src/server.ts
    - src/tools/index.ts
    - tests/tools/mcp-tool-registration.test.ts
    - src/agents/learning-synthesizer.ts

key-decisions:
  - "JSON sidecar writes { static, runtime } subset matching run-eval.ts expectations"
  - "wave-scheduler re-exports types to preserve existing test imports"

patterns-established:
  - "JSON sidecar pattern: writeVerifyReport emits .json alongside .md for structured pipeline data transfer"

requirements-completed: [EVAL-01, EVAL-03, VRFY-08, EXEC-07, ORNT-10, MCP-01]

# Metrics
duration: 2min
completed: 2026-03-27
---

# Phase 08 Plan 01: Tech Debt Cleanup Summary

**JSON sidecar for verify-to-eval pipeline, type consolidation eliminating local copies and unsafe casts, accurate 12-tool MCP documentation, dead code removal**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-27T19:33:39Z
- **Completed:** 2026-03-27T19:36:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- Added JSON sidecar serialization in writeVerifyReport so eval agent receives structured verify data instead of empty fallback
- Consolidated wave-scheduler types: replaced 3 local interface copies with import/re-export from orient/types.ts, preserving downstream import paths
- Removed all 3 `as unknown` casts in validation.ts now that types are unified
- Updated server.ts JSDoc and tools/index.ts comment to accurately document 12 MCP tools including codescope_eval
- Removed dead `totalActive` variable in learning-synthesizer.ts
- Full test suite passes: 865 tests, 0 failures

## Task Commits

Each task was committed atomically:

1. **Task 1: JSON sidecar serialization + type consolidation + doc fixes + dead code removal** - `b5563cf` (fix)
2. **Task 2: Full test suite validation** - no code changes (verification only)

## Files Created/Modified
- `src/verify/report-writer.ts` - Added JSON sidecar write after markdown report (VRFY-08, EVAL-01, EVAL-03)
- `tests/verify/report-writer.test.ts` - Added test for JSON sidecar output
- `src/execution/wave-scheduler.ts` - Replaced 3 local interfaces with import+re-export from orient/types.ts (EXEC-07)
- `src/orient/validation.ts` - Removed 3 `as unknown` casts for direct type usage (ORNT-10)
- `src/server.ts` - Updated JSDoc: 11 -> 12 tools, added codescope_eval to list (MCP-01)
- `src/tools/index.ts` - Updated comment: "All 10 real tools" -> "All 11 real tools" (MCP-01)
- `tests/tools/mcp-tool-registration.test.ts` - Updated to assert exactly 12 tools, added codescope_eval (MCP-01)
- `src/agents/learning-synthesizer.ts` - Removed dead totalActive variable

## Decisions Made
- JSON sidecar writes `{ static, runtime }` subset (not the full VerifyReport) to match exactly what run-eval.ts line 90 expects
- wave-scheduler uses `export type` re-export to preserve existing consumer imports (e.g., tests importing AgentAssignment from wave-scheduler)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Verify-to-eval data pipeline is now functional (JSON sidecar produced and consumed)
- Type system is cleaner with unified types across orient and execution modules
- Ready for Plan 02 (remaining tech debt items)

## Self-Check: PASSED

All 8 modified files verified on disk. Commit b5563cf verified in git log.

---
*Phase: 08-tech-debt-cleanup*
*Completed: 2026-03-27*
