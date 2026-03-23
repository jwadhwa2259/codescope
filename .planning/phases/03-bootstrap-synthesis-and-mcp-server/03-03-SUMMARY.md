---
phase: 03-bootstrap-synthesis-and-mcp-server
plan: 03
subsystem: api
tags: [graphology, mcp, graph-query, blast-radius, search, detect-changes, bfs, centrality, louvain]

# Dependency graph
requires:
  - phase: 03-bootstrap-synthesis-and-mcp-server
    plan: 01
    provides: "Graph cache (getGraph), response helpers (okResponse, errorResponse, partialResponse), isBootstrapped, buildMetadata"
  - phase: 02-scout-and-analysis-squad
    provides: "Graph analytics (blastRadius, computeCentrality, runCommunityDetection, loadGraphFromSQLite)"
provides:
  - "codescope_graph_query MCP tool: neighbors, paths, communities queries on cached graph (src/tools/graph-query.ts)"
  - "codescope_blast_radius MCP tool: BFS hop-distance classification Red/Orange/Yellow/Green (src/tools/blast-radius.ts)"
  - "codescope_search MCP tool: graph-based symbol/file/relationship search with D-38 capabilities metadata (src/tools/search.ts)"
  - "codescope_detect_changes MCP tool: centrality-based risk classification HIGH/MEDIUM/LOW with blast_radius_count (src/tools/detect-changes.ts)"
affects: [03-04, 03-05, mcp-server-registration, orient-tool, verify-tool]

# Tech tracking
tech-stack:
  added: []
  patterns: ["handler extraction pattern for MCP tools (handleXxx exported for test, registerXxxTool for MCP)", "graph cache + analytics composition for sub-100ms queries", "centrality-based risk tiering (D-23)", "partial capability metadata (D-38)"]

key-files:
  created:
    - src/tools/graph-query.ts
    - src/tools/blast-radius.ts
    - src/tools/search.ts
    - src/tools/detect-changes.ts
    - tests/tools/graph-query.test.ts
    - tests/tools/blast-radius.test.ts
    - tests/tools/search.test.ts
    - tests/tools/detect-changes.test.ts
  modified: []

key-decisions:
  - "Louvain community detection runs in-memory on cached graph (no database required) for communities query type"
  - "Handler extraction pattern: handleGraphQuery/handleBlastRadius/handleSearch/handleDetectChanges exported for unit testing without MCP transport"
  - "Search matches by name substring OR filePath substring OR edge type, sorted by centrality descending"
  - "Detect-changes parses diff lines matching 'diff --git a/ b/' pattern; falls back to git diff --name-only HEAD"

patterns-established:
  - "MCP tool handler extraction: export handleXxx for tests + registerXxxTool for MCP server registration"
  - "Risk tiering constants: HIGH_RISK_THRESHOLD = 0.7, MEDIUM_RISK_THRESHOLD = 0.3 (D-23)"
  - "Search result limiting: MAX_RESULTS = 50 with total_matches count"
  - "Partial capability metadata: capabilities/upcoming arrays in tool responses (D-38)"

requirements-completed: [MCP-03, MCP-04, MCP-08, MCP-11]

# Metrics
duration: 6min
completed: 2026-03-23
---

# Phase 03 Plan 03: Graph-Querying MCP Tools Summary

**4 graph-querying MCP tools (graph_query, blast_radius, search, detect_changes) with cached graphology queries, BFS hop classification, centrality-based risk tiers, and partial capability metadata**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-23T21:19:13Z
- **Completed:** 2026-03-23T21:25:17Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- codescope_graph_query supports neighbors/paths/communities via cached graphology (MCP-03)
- codescope_blast_radius returns BFS hop-distance classification Red/Orange/Yellow/Green (MCP-04)
- codescope_search provides graph-based symbol search with capabilities:["graph"] and upcoming:["text","hybrid"] per D-38 (MCP-08)
- codescope_detect_changes classifies risk per centrality tiers (HIGH >0.7, MEDIUM 0.3-0.7, LOW <0.3) with blast_radius_count per D-23/D-24 (MCP-11)
- All 4 tools use graph cache (getGraph) for sub-100ms queries per GRPH-05
- All 27 new tests pass, full suite green (244 passed, 37 skipped)

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: codescope_graph_query and codescope_blast_radius tools**
   - `f6ad5bc` (test) - Failing tests for graph-query and blast-radius (12 tests)
   - `7c6e738` (feat) - Implement graph-query and blast-radius MCP tools
2. **Task 2: codescope_search and codescope_detect_changes tools**
   - `6ee40a6` (test) - Failing tests for search and detect-changes (15 tests)
   - `db3e918` (feat) - Implement search and detect-changes MCP tools

## Files Created/Modified
- `src/tools/graph-query.ts` - codescope_graph_query: neighbors, paths (BFS), communities (Louvain) via cached graph
- `src/tools/blast-radius.ts` - codescope_blast_radius: BFS hop-distance classification using analytics.blastRadius()
- `src/tools/search.ts` - codescope_search: graph-based symbol/file/relationship search with 50-result limit
- `src/tools/detect-changes.ts` - codescope_detect_changes: git diff parsing, centrality risk tiers, blast_radius_count per file
- `tests/tools/graph-query.test.ts` - 6 tests: neighbors, communities, paths, NODE_NOT_FOUND, NOT_BOOTSTRAPPED, query_ms
- `tests/tools/blast-radius.test.ts` - 6 tests: hop classification, max_hops, NODE_NOT_FOUND, NOT_BOOTSTRAPPED, isolated node, count+timing
- `tests/tools/search.test.ts` - 8 tests: exact/partial name, file_path, relationship, empty results, NOT_BOOTSTRAPPED, capabilities, limit
- `tests/tools/detect-changes.test.ts` - 7 tests: risk mapping, tiers, blast_radius_count, diff parsing, git diff, NOT_BOOTSTRAPPED, unknown files

## Decisions Made
- Louvain community detection runs in-memory on the cached graph rather than requiring a database handle -- the existing `runCommunityDetection(graph, db)` in analytics.ts writes to SQLite which is unnecessary for a read-only query. Used `louvain.detailed(graph)` directly instead.
- Handler extraction pattern (`handleXxx` exported separately from `registerXxxTool`) enables unit testing with mocked graph cache without requiring MCP transport setup -- consistent with the `formatStatusResponse`/`registerStatusTool` pattern from Plan 01.
- Search iterates all graph nodes for substring matching (suitable for typical graphs under 100K nodes); edge-type queries check all edges. Both return results sorted by centrality descending.
- Detect-changes diff parser matches `diff --git a/path b/path` lines and uses the `b/` path (new file path).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Louvain community detection without database parameter**
- **Found during:** Task 1 (codescope_graph_query implementation)
- **Issue:** The plan's interface section showed `runCommunityDetection(graph)` but the actual implementation in analytics.ts requires `(graph, db)` to write communities to SQLite. MCP tool handlers should not write to the database.
- **Fix:** Used `louvain.detailed(graph)` directly from the graphology-communities-louvain package instead of calling runCommunityDetection. This provides read-only community detection suitable for query handlers.
- **Files modified:** src/tools/graph-query.ts
- **Verification:** Community detection test passes; graph-query returns community assignments correctly.
- **Committed in:** 7c6e738 (Task 1 feat commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Auto-fix necessary because MCP tool handlers must not write to SQLite. Using Louvain directly is the correct read-only approach. No scope creep.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- All 4 graph-querying MCP tools operational with consistent error handling and metadata
- Handler extraction pattern established for remaining MCP tool implementations (03-04, 03-05)
- Graph cache integration pattern validated across all 4 tools
- D-17/D-18/D-19 response format consistently applied
- Ready for Plan 04 (remaining MCP tools: recall, conventions, orient, verify, readiness, service_map)

## Self-Check: PASSED

- All 8 created files exist on disk
- All 4 commit hashes verified in git log
- SUMMARY.md exists at expected path

---
*Phase: 03-bootstrap-synthesis-and-mcp-server*
*Completed: 2026-03-23*
