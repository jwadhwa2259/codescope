---
phase: 02-scout-and-analysis-squad
plan: 01
subsystem: graph
tags: [graphology, louvain, centrality, blast-radius, bfs, sqlite, tree-sitter, knowledge-graph]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: "ParserPool, parseFile, BatchWriter, processBatchFiles, openDatabase, createSchema, resolvers"
provides:
  - "buildGraph pipeline: file walking, AST parsing, import resolution, JSONL batch, SQLite insert"
  - "loadGraphFromSQLite: loads knowledge graph into graphology DirectedGraph"
  - "computeCentrality: normalized in-degree centrality scores for all nodes"
  - "runCommunityDetection: Louvain community detection with human-readable labels in SQLite"
  - "blastRadius: BFS traversal with Red/Orange/Yellow/Green hop classification"
  - "computeDangerZones: multi-signal risk scoring combining centrality, cross-boundary edges, LOC"
affects: [02-04-risk-analyzer, 03-mcp-tools, 04-orient]

# Tech tracking
tech-stack:
  added: [graphology-communities-louvain, graphology-metrics, graphology-traversal]
  patterns: [symlink-safe path resolution, ambient type declarations for CJS graphology packages, TDD red-green for graph modules]

key-files:
  created:
    - src/graph/builder.ts
    - src/graph/analytics.ts
    - src/types/graphology-deep-imports.d.ts
    - tests/graph/builder.test.ts
    - tests/graph/analytics.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Symlink-safe path resolution: fs.realpathSync on projectRoot for macOS /var -> /private/var compatibility"
  - "Ambient type declarations for graphology CJS packages under NodeNext moduleResolution"
  - "Test fixtures use extensionless imports (./utils not ./utils.js) since enhanced-resolve handles them"

patterns-established:
  - "Graph builder pattern: walk files -> parse AST -> BatchWriter JSONL -> processBatchFiles SQLite"
  - "Graph analytics pattern: load from SQLite -> graphology DirectedGraph -> compute metrics -> write back to SQLite"
  - "Community label derivation: extract first 2 path segments, return most common directory"

requirements-completed: [BOOT-07, GRPH-02, GRPH-03, GRPH-04]

# Metrics
duration: 13min
completed: 2026-03-23
---

# Phase 02 Plan 01: Graph Builder & Analytics Summary

**Graph builder pipeline populating SQLite knowledge graph from source code, plus graphology-based centrality, Louvain community detection, and BFS blast radius with hop-distance risk classification**

## Performance

- **Duration:** 13 min
- **Started:** 2026-03-23T14:10:28Z
- **Completed:** 2026-03-23T14:23:23Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- buildGraph walks source files, parses with tree-sitter, resolves imports (TS/JS via enhanced-resolve, Python via filesystem), writes JSONL, and inserts into SQLite
- computeCentrality provides normalized 0-1 in-degree centrality for all graph nodes
- runCommunityDetection runs Louvain algorithm and writes community assignments with human-readable directory labels to SQLite communities table
- blastRadius provides BFS traversal from any node with hop-distance classification (Red/Orange/Yellow/Green)
- computeDangerZones combines centrality, cross-boundary signals, and file size into ranked risk scores

## Task Commits

Each task was committed atomically:

1. **Task 1: Graph builder module** (TDD)
   - `0287528` test(02-01): add failing tests for graph builder module (RED)
   - `eb57bee` feat(02-01): implement graph builder pipeline with file walking and import resolution (GREEN)
2. **Task 2: Graph analytics module** (TDD)
   - `289279c` test(02-01): add failing tests for graph analytics module (RED)
   - `776f05c` feat(02-01): implement graph analytics module with centrality, communities, and blast radius (GREEN)

## Files Created/Modified
- `src/graph/builder.ts` - Graph builder pipeline: walkSourceFiles, buildGraph (file walking, parsing, import resolution, JSONL batch, SQLite insert)
- `src/graph/analytics.ts` - Graph analytics: loadGraphFromSQLite, computeCentrality, runCommunityDetection, blastRadius, computeDangerZones
- `src/types/graphology-deep-imports.d.ts` - Ambient type declarations for graphology ecosystem CJS packages (metrics, louvain, traversal)
- `tests/graph/builder.test.ts` - 7 test cases for builder pipeline
- `tests/graph/analytics.test.ts` - 9 test cases for analytics module
- `package.json` - Added graphology-communities-louvain, graphology-metrics, graphology-traversal

## Decisions Made
- **Symlink-safe path resolution:** Used `fs.realpathSync` on project root to handle macOS `/var -> /private/var` symlink. Without this, enhanced-resolve returns real paths that don't match the project root, causing import edges to be silently dropped.
- **Ambient type declarations:** Created `src/types/graphology-deep-imports.d.ts` for graphology-metrics/centrality/degree, graphology-communities-louvain, and graphology-traversal. These CJS packages lack `"exports"` in package.json, which breaks TypeScript's NodeNext module resolution for subpath imports and default export detection.
- **Test fixture imports:** Used extensionless imports (`./utils` not `./utils.js`) in test fixtures because enhanced-resolve correctly resolves `.ts` files from extensionless specifiers, whereas `.js`-suffixed imports in a temp directory with `.ts` files fails.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] macOS symlink path mismatch in import resolution**
- **Found during:** Task 1 (buildGraph implementation)
- **Issue:** enhanced-resolve returns real paths (/private/var/...) but project root uses /var/... on macOS, causing path.relative to produce "../" prefixed paths that were filtered out as external
- **Fix:** Added fs.realpathSync normalization on both project root and resolved import paths
- **Files modified:** src/graph/builder.ts
- **Verification:** IMPORTS edges correctly created in test database
- **Committed in:** eb57bee

**2. [Rule 3 - Blocking] TypeScript compilation errors from CJS graphology packages under NodeNext**
- **Found during:** Task 2 (analytics implementation)
- **Issue:** graphology-metrics, graphology-communities-louvain, and graphology-traversal lack "exports" in package.json, causing TypeScript NodeNext module resolution to fail for subpath imports and default export types
- **Fix:** Created ambient declaration file src/types/graphology-deep-imports.d.ts with complete type definitions
- **Files modified:** src/types/graphology-deep-imports.d.ts
- **Verification:** npx tsc --noEmit exits 0
- **Committed in:** 776f05c

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes were necessary for correctness. The symlink fix ensures import edges are created on macOS. The type declarations ensure TypeScript compiles cleanly. No scope creep.

## Issues Encountered
- None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functions are fully implemented with no placeholder data.

## Next Phase Readiness
- Graph builder and analytics modules are ready for use by Plan 04 (Risk Analyzer agent)
- loadGraphFromSQLite, computeCentrality, runCommunityDetection, blastRadius, and computeDangerZones are all tested and exported
- Phase 3 MCP tools can import these directly
- 43 graph tests pass, TypeScript compiles cleanly

## Self-Check: PASSED

- All 5 created files exist on disk
- All 4 task commits verified in git history
- All 10 key exports verified in source files
- 43 graph tests pass, TypeScript compiles cleanly

---
*Phase: 02-scout-and-analysis-squad*
*Completed: 2026-03-23*
