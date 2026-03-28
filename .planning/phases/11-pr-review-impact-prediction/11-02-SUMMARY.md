---
phase: 11-pr-review-impact-prediction
plan: 02
subsystem: tools
tags: [mcp, review, risk-scoring, dependency-analysis, convention-compliance, cross-community, cycle-detection]

# Dependency graph
requires:
  - phase: 09-incremental-graph
    provides: "getGraph() with staleness-aware cache, edges/communities tables, graph analytics"
  - phase: 10-auto-injection
    provides: "conventions.md artifact, bootstrap artifact pipeline"
provides:
  - "codescope_review MCP tool with handleReview() and registerReviewTool()"
  - "Diff resolution chain: PR > branch > working tree (D-03)"
  - "Per-file risk scoring with centrality thresholds 0.7/0.3 (D-07)"
  - "Dependency edge reporting from SQLite edges table (D-09)"
  - "DFS cycle detection on changed files + neighbors (D-10)"
  - "Convention compliance checking against conventions.md (REVIEW-03)"
  - "Cross-community boundary flagging at 3+ communities (D-08)"
affects: [11-03-skill-registration, tools-index]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Diff resolution chain with priority fallback (PR > branch > working tree)"
    - "Combined graph + SQLite analysis in single tool handler"
    - "DFS cycle detection scoped to changed file subgraph with neighbor cap"

key-files:
  created:
    - src/tools/review.ts
    - tests/tools/review.test.ts
  modified: []

key-decisions:
  - "Duplicated parseFilesFromDiff, classifyRisk, getWorkingDirChanges, parseConventions locally for module isolation"
  - "Report edges involving changed files rather than attempting before/after diff (no before-snapshot available)"
  - "Convention matching uses file path containment check against conventions.md file lists"
  - "Cycle detection capped at 50 neighbor expansion per node to stay under 100ms query time"

patterns-established:
  - "Diff resolution chain: resolveDiff() returns DiffResolution or DiffError discriminated union"
  - "Combined SQLite + graph analysis pattern: open db, query edges/communities, detect cycles on graphology graph, close db"

requirements-completed: [REVIEW-01, REVIEW-02, REVIEW-03]

# Metrics
duration: 4min
completed: 2026-03-28
---

# Phase 11 Plan 02: Review Tool Summary

**codescope_review MCP tool with diff resolution, per-file risk scoring, dependency edge reporting, DFS cycle detection, convention compliance checking, and cross-community boundary flagging**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T16:06:46Z
- **Completed:** 2026-03-28T16:10:37Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- codescope_review MCP tool that performs full structural impact analysis on git diffs
- Diff input resolution chain: explicit diff > PR number (gh CLI) > branch name > working tree
- Per-file risk classification using centrality thresholds (HIGH >0.7, MEDIUM 0.3-0.7, LOW <0.3)
- Dependency edge detection via SQLite queries on edges table
- DFS circular dependency detection scoped to changed files + immediate neighbors
- Convention compliance matching changed files against conventions.md
- Cross-community boundary flagging when 3+ Louvain communities touched
- Graceful GH_CLI_UNAVAILABLE error with recovery suggestion for missing gh CLI
- Shell injection prevention via execFileSync with array arguments
- 14 comprehensive test cases covering all code paths

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for review tool** - `33cd489` (test)
2. **Task 1 (GREEN): Implement codescope_review** - `643855d` (feat)

## Files Created/Modified
- `src/tools/review.ts` - codescope_review MCP tool handler with handleReview() and registerReviewTool(), 736 lines covering diff resolution, risk scoring, dependency analysis, convention compliance, cross-community detection
- `tests/tools/review.test.ts` - 14 unit tests covering risk scores, dependency changes, conventions, cross-community flagging, input resolution (diff/branch/PR/working tree), NOT_BOOTSTRAPPED guard, missing files graceful handling, cycle detection, response shape validation

## Decisions Made
- Duplicated helper functions (classifyRisk, parseFilesFromDiff, getWorkingDirChanges, parseConventions) locally rather than importing from detect-changes.ts/conventions.ts -- these are not exported and the functions are small (2-10 lines each), so duplication avoids coupling and keeps the module self-contained
- Reports edges involving changed files from the current graph rather than attempting before/after edge diffing -- no before-snapshot is available without re-parsing files before the change
- Convention matching checks if changed file paths are contained in convention file lists -- this is a pragmatic first pass; true violation detection (running ast-grep rules) is the verify tool's domain
- Capped neighbor expansion in cycle detection to 50 per node per Pitfall 6 to keep query time under 100ms constraint

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- codescope_review tool is ready for Plan 03 (skill registration and tool index integration)
- Tool follows the established handler extraction pattern for testability
- Response follows ReviewData shape from D-01 exactly
- All 14 tests pass

## Self-Check: PASSED

- FOUND: src/tools/review.ts
- FOUND: tests/tools/review.test.ts
- FOUND: 11-02-SUMMARY.md
- FOUND: commit 33cd489 (test RED)
- FOUND: commit 643855d (feat GREEN)

---
*Phase: 11-pr-review-impact-prediction*
*Completed: 2026-03-28*
