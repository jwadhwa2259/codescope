---
phase: 17-foundation-fixes
plan: 02
subsystem: graph
tags: [import-resolution, resolver, shared-builder, fallback-resolver, 0-edge-warning]

# Dependency graph
requires:
  - phase: 17-01
    provides: CJS require() extraction as ImportInfo objects
  - phase: 17-03
    provides: Readiness scoring using actual graph DB counts
provides:
  - Shared per-file graph-building function (processFileForGraph) used by both builder.ts and incremental.ts
  - Resolver always assigned (never null) with fallback for missing tsconfig
  - CRITICAL 0-edge warning when bootstrap produces 0 import edges from >5 files
  - No-tsconfig integration test proving ESM resolver works without tsconfig.json
affects: [bootstrap, graph-builder, incremental, readiness, blast-radius, review]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Shared graph-building function pattern: all per-file node/edge creation in shared-builder.ts"
    - "Fallback resolver pattern: ResolverFactory.createResolver with standard extensions when tsconfig missing"

key-files:
  created:
    - src/graph/shared-builder.ts
  modified:
    - src/graph/builder.ts
    - src/graph/incremental.ts
    - src/bootstrap/orchestrator.ts
    - tests/graph/builder.test.ts

key-decisions:
  - "tsResolver typed as Resolver (not Resolver | null), enforcing non-null at the type level"
  - "Fallback resolver uses same extensions/mainFields/conditionNames as primary resolver but without path aliases"
  - "Plan 03's DB-based file counting preserved -- processFileForGraph does not include file categorization counters"

patterns-established:
  - "Shared graph-building function: processFileForGraph in shared-builder.ts used by both builder.ts and incremental.ts"
  - "Fallback resolver pattern: always create a resolver even when tsconfig is missing"

requirements-completed: [GRAPH-01, GRAPH-04, GRAPH-05, GRAPH-06]

# Metrics
duration: 4min
completed: 2026-03-30
---

# Phase 17 Plan 02: Resolver Fix & Shared Graph Builder Summary

**Fallback resolver eliminates 0-edge ESM bug, shared-builder.ts deduplicates ~200 lines of node/edge creation across builder.ts and incremental.ts**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-30T21:18:55Z
- **Completed:** 2026-03-30T21:23:19Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Extracted ~200 lines of duplicated per-file node/edge creation logic into src/graph/shared-builder.ts with a single processFileForGraph function
- Fixed the resolver null-check gate that caused 0 IMPORTS edges on ESM projects without tsconfig.json -- tsResolver is now always assigned with a fallback resolver
- Added CRITICAL 0-edge warning in bootstrap orchestrator when totalEdgesAll === 0 and totalSourceFiles > 5
- Added no-tsconfig integration test proving ESM resolver works without tsconfig.json (3-file fixture, verifies >= 2 IMPORTS edges)

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract shared graph-building function and fix resolver null-check** - `b642617` (feat)
2. **Task 2 RED: No-tsconfig integration test** - `df9bd6c` (test, TDD)
3. **Task 2 GREEN: 0-edge bootstrap warning** - `a0c849b` (feat)

## Files Created/Modified
- `src/graph/shared-builder.ts` - New shared per-file graph-building function (processFileForGraph)
- `src/graph/builder.ts` - Refactored to use processFileForGraph, fallback resolver, removed null-check gate
- `src/graph/incremental.ts` - Refactored to use processFileForGraph, fallback resolver, removed null-check gate
- `src/bootstrap/orchestrator.ts` - Added CRITICAL 0-edge warning when totalEdgesAll === 0 and totalSourceFiles > 5
- `tests/graph/builder.test.ts` - Added no-tsconfig integration test verifying IMPORTS edges without tsconfig.json

## Decisions Made
- tsResolver typed as `Resolver` (never `Resolver | null`) -- enforces non-null at the type level so the `else if (tsResolver)` gate is impossible
- Fallback resolver uses `ResolverFactory.createResolver` with standard TS/JS extensions, mainFields, and conditionNames but without path aliases (since no tsconfig to read aliases from)
- Plan 03's DB-based file counting (totalSourceFiles, typedFiles, testFiles) preserved in orchestrator -- processFileForGraph does not include these categorization counters; they belong in the outer loop or DB query layer

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Graph builder and incremental rebuild now share a single processFileForGraph function
- Any future per-file logic (e.g., new node types, edge types) goes in shared-builder.ts once
- CJS require() imports from Plan 01 now flow through the same resolver path as ESM imports
- Bootstrap warns when 0 edges are produced, complementing the D-03 0% import graph health diagnostic

## Self-Check: PASSED

- All 5 key files: FOUND
- All 3 commits: FOUND (b642617, df9bd6c, a0c849b)
- Test suite: 1222 passing, 8 pre-existing failures (plugin manifest + dashboard API)

---
*Phase: 17-foundation-fixes*
*Completed: 2026-03-30*
