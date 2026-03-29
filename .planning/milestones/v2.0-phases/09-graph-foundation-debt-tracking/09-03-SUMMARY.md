---
phase: 09-graph-foundation-debt-tracking
plan: 03
subsystem: database
tags: [sqlite, readiness-history, mcp-tool, trend-tracking, time-series, better-sqlite3]

# Dependency graph
requires:
  - phase: 09-01
    provides: V2 schema with readiness_history table and idx_readiness_ts index
provides:
  - Readiness snapshot storage on every bootstrap (storeReadinessSnapshot)
  - Snapshot retrieval by latest and nearest-to-timestamp queries
  - codescope_trends MCP tool with 3 period comparisons (vs_previous, vs_7_days_ago, vs_30_days_ago)
  - Per-dimension deltas and trend direction (improving/declining/stable)
affects: [14-visualization, 10-auto-injection]

# Tech tracking
tech-stack:
  added: []
  patterns: [readiness snapshot insert-per-bootstrap pattern, 1-point noise threshold for trend direction, OFFSET-based previous-row query]

key-files:
  created: [src/graph/readiness-history.ts, src/tools/trends-tool.ts, tests/graph/readiness-history.test.ts, tests/tools/trends.test.ts]
  modified: [src/bootstrap/orchestrator.ts, src/tools/index.ts, tests/tools/mcp-tool-registration.test.ts]

key-decisions:
  - "1-point threshold for trendDirection to filter noise (delta <= 1 = stable)"
  - "OFFSET 1 query for previous snapshot instead of adding a new function to readiness-history module"
  - "Snapshot storage wrapped in try/catch so failures never break bootstrap"

patterns-established:
  - "Readiness snapshot insert: one row per bootstrap completion, never upsert"
  - "Trend comparison: buildComparison(label, current, other) returns null deltas/trend when comparison snapshot is null"
  - "MCP tool count now 13 -- updated registration test and JSDoc comment"

requirements-completed: [DEBT-01, DEBT-02]

# Metrics
duration: 4min
completed: 2026-03-28
---

# Phase 9 Plan 3: Readiness Trends Tool Summary

**Readiness trend tracking with snapshot storage on every bootstrap and codescope_trends MCP tool returning 3 period comparisons with per-dimension deltas and trend directions**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T02:28:38Z
- **Completed:** 2026-03-28T02:32:33Z
- **Tasks:** 2 (both TDD: RED -> GREEN)
- **Files modified:** 7

## Accomplishments
- Readiness snapshots stored in SQLite readiness_history table on every bootstrap completion via Step 7b in orchestrator
- codescope_trends MCP tool registered as 13th tool, returns structured trend data with 3 comparison periods
- Each comparison includes per-dimension deltas (convention_coverage, type_safety, test_coverage_proxy, import_graph_health) and overall trend direction
- Edge cases handled: no history (NO_HISTORY error), single snapshot (null comparisons), not bootstrapped (NOT_BOOTSTRAPPED error)
- 17 new tests (7 readiness-history + 10 trends), all 897 tests passing (zero regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for readiness snapshot storage** - `9d4d317` (test)
2. **Task 1 (GREEN): Implement readiness snapshot storage and bootstrap integration** - `46cdf77` (feat)
3. **Task 2 (RED): Failing tests for codescope_trends MCP tool** - `04e4c18` (test)
4. **Task 2 (GREEN): Implement codescope_trends MCP tool with period comparisons** - `a1bfca7` (feat)

## Files Created/Modified
- `src/graph/readiness-history.ts` - Snapshot storage (storeReadinessSnapshot) and retrieval (getLatestSnapshot, getSnapshotNear)
- `src/tools/trends-tool.ts` - codescope_trends MCP tool with handleTrends, registerTrendsTool, trendDirection
- `src/bootstrap/orchestrator.ts` - Added Step 7b: storeReadinessSnapshot after readiness scoring (try/catch wrapped)
- `src/tools/index.ts` - Added registerTrendsTool import and call, updated tool count from 12 to 13
- `tests/graph/readiness-history.test.ts` - 7 test cases for snapshot storage and retrieval
- `tests/tools/trends.test.ts` - 10 test cases for trends tool (trendDirection, handleTrends, registration)
- `tests/tools/mcp-tool-registration.test.ts` - Updated expected tool count from 12 to 13, added codescope_trends

## Decisions Made
- **1-point noise threshold:** trendDirection returns "stable" when delta is within 1 percentage point, filtering meaningless fluctuations
- **OFFSET-based previous query:** Used `ORDER BY timestamp DESC LIMIT 1 OFFSET 1` for previous snapshot instead of adding a getPreviousSnapshot function, keeping the readiness-history module focused on generic queries
- **Try/catch wrapping:** Snapshot storage in orchestrator wrapped so failure never breaks bootstrap -- readiness snapshots are observability, not critical path

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None -- all functions are fully implemented and wired end-to-end.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Readiness trend data is now available for Phase 14 visualization dashboard (readiness trend line chart)
- 13 MCP tools operational -- future phases can add more following the established registerXTool pattern
- All 897 tests passing, zero regressions from v1.0 baseline of 880

## Self-Check: PASSED

All created files verified on disk. All commit hashes found in git log. SUMMARY.md exists.

---
*Phase: 09-graph-foundation-debt-tracking*
*Completed: 2026-03-28*
