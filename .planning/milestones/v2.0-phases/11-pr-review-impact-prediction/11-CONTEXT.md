# Phase 11: PR Review + Impact Prediction - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can get structural impact analysis on any PR or proposed change, with risk scores, dependency edge changes, and convention compliance -- before committing. Includes a `codescope_review` MCP tool, `/codescope:review` skill, and `codescope_predict_impact` MCP tool with reverse dependency walking.

Requirements: REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04, IMPACT-01, IMPACT-02

</domain>

<decisions>
## Implementation Decisions

### Review Report Structure
- **D-01:** Review output follows existing `okResponse()` envelope with structured sections: `summary` (totals, risk breakdown), `files` (per-file risk table with centrality + blast_radius_count), `dependency_changes` (new/removed edges, circular deps), `convention_violations` (per-file with evidence), `cross_community_changes` (flagged boundary crossings).
- **D-02:** `/codescope:review` skill formats MCP tool output into readable markdown report -- the MCP tool (`codescope_review`) is the engine, the skill is the UX. Consistent with existing tool/skill separation pattern.

### Diff Input Sources
- **D-03:** Input priority: PR number (via `gh pr diff`) > branch name (via `git diff main...{branch}`) > working tree diff (default `git diff --name-only HEAD`). Matches REVIEW-04 exactly. Working tree diff is the default when no args provided, consistent with existing `handleDetectChanges()` behavior.
- **D-04:** `gh` CLI failure (not installed, not authenticated) returns `errorResponse("GH_CLI_UNAVAILABLE", ...)` with suggestion to use branch name or working tree diff instead. Never hard-fail on missing external tools.

### Impact Prediction Scope
- **D-05:** `codescope_predict_impact` defaults to 4 hops, configurable via `max_hops` param (same interface as existing `codescope_blast_radius` tool).
- **D-06:** Reverse dependency walk uses graphology's `inNeighbors` / `forEachInNeighbor` to traverse import edges backward (callers/importers). Returns the same `BlastRadiusNode` shape (`nodeId`, `name`, `filePath`, `hop`, `risk`) for consistency with existing blast radius tool.
- **D-07:** Risk scoring included -- each node in the reverse walk gets centrality-based risk classification (HIGH >0.7, MEDIUM 0.3-0.7, LOW <0.3), matching `classifyRisk()` in `src/tools/detect-changes.ts`.

### Cross-Boundary Detection
- **D-08:** Cross-community threshold: flag when a diff touches files in **3+ distinct communities**. Below that is normal refactoring. Community data comes from existing `communities` SQLite table populated by Louvain.
- **D-09:** New edge detection: parse changed files from diff, resolve their imports, compare against stored edges in the `edges` table. Report added/removed edges with source/target file paths.
- **D-10:** Circular dependency detection: after computing new edges, run DFS cycle detection on the subgraph of changed files + their immediate neighbors. Only report **new** cycles (not pre-existing ones).

### Claude's Discretion
- Internal implementation of reverse BFS (custom walker vs graphology-traversal adaptation)
- Exact markdown formatting of the `/codescope:review` skill report
- Whether to cache community lookups per-review or query SQLite per-file
- Convention violation severity ordering in the report
- Token estimation for review output size

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Tools (primary reuse targets)
- `src/tools/detect-changes.ts` -- `handleDetectChanges()`, `classifyRisk()`, `parseFilesFromDiff()`, `getWorkingDirChanges()` -- core patterns for diff parsing, risk classification, and per-file analysis
- `src/tools/blast-radius.ts` -- `handleBlastRadius()` -- MCP tool registration pattern, `getGraph()` + `blastRadius()` usage, `okResponse()` envelope
- `src/tools/conventions.ts` -- `parseConventions()`, `ParsedConvention` type -- convention data access and filtering

### Graph Analytics (computation engine)
- `src/graph/analytics.ts` -- `blastRadius()` BFS traversal, `computeCentrality()`, `computeDangerZones()`, `runCommunityDetection()`, `BlastRadiusNode` / `DangerZoneEntry` / `CentralityResult` / `CommunityResult` types
- `src/graph/cache.ts` -- `getGraph()` with staleness-aware cache, `CachedGraph` interface with centralities map
- `src/graph/database.ts` -- `openDatabase()` for direct SQLite queries (communities table, edges table)

### Tool Infrastructure
- `src/tools/helpers.ts` -- `okResponse()`, `errorResponse()`, `isBootstrapped()`, `buildMetadata()`, `ToolMetadata` type
- `src/tools/index.ts` -- Tool registration pattern (add new tools here)
- `src/server.ts` -- MCP server entry point

### Plugin Infrastructure
- `.claude-plugin/plugin.json` -- Plugin manifest (needs skill addition for `/codescope:review`)

### Requirements
- `.planning/REQUIREMENTS.md` -- REVIEW-01 through REVIEW-04, IMPACT-01, IMPACT-02 acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `handleDetectChanges()` in `src/tools/detect-changes.ts` -- already parses git diffs, classifies risk by centrality tiers, computes blast radius counts per file. Directly reusable for the review tool's per-file analysis.
- `blastRadius()` in `src/graph/analytics.ts` -- forward BFS traversal with hop-distance classification. Reverse BFS for impact prediction is a traversal direction flip using the same graph.
- `classifyRisk()` in `src/tools/detect-changes.ts` -- HIGH/MEDIUM/LOW thresholds (0.7/0.3) reusable for impact prediction risk scoring.
- `parseFilesFromDiff()` and `getWorkingDirChanges()` in `src/tools/detect-changes.ts` -- diff parsing utilities reusable for review input handling.
- `parseConventions()` in `src/tools/conventions.ts` -- convention data access for convention compliance checking in reviews.
- `computeDangerZones()` in `src/graph/analytics.ts` -- danger zone scoring reusable for flagging high-risk files in review output.
- `CachedGraph.centralities` in `src/graph/cache.ts` -- pre-computed centrality map for risk classification without recomputation.

### Established Patterns
- All MCP tools use `okResponse()`/`errorResponse()` with `ToolMetadata` from `src/tools/helpers.ts`
- Graph access goes through `getGraph()` from cache with staleness-aware queries
- Tools registered via `server.tool()` with Zod schemas for input validation
- `isBootstrapped()` guard at top of every tool handler
- Handler functions extracted from MCP registration for testability (e.g., `handleBlastRadius()`, `handleDetectChanges()`)

### Integration Points
- `src/tools/index.ts` -- register `codescope_review` and `codescope_predict_impact` tools
- `src/server.ts` -- MCP server where tools are registered
- `.claude-plugin/plugin.json` -- add `/codescope:review` skill reference
- `src/graph/analytics.ts` -- add reverse BFS function alongside existing `blastRadius()`

</code_context>

<specifics>
## Specific Ideas

- Use the existing codebase as the primary reference for how to build -- follow established patterns in detect-changes, blast-radius, and conventions tools
- Review tool is essentially an enhanced detect-changes that adds convention checking and cross-boundary analysis
- Impact prediction is a reverse-direction blast radius -- same shape, opposite traversal direction
- `gh` CLI integration should be optional/graceful -- working tree diff works without any external tools

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 11-pr-review-impact-prediction*
*Context gathered: 2026-03-28*
