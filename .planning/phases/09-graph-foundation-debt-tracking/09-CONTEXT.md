# Phase 9: Graph Foundation + Debt Tracking - Context

**Gathered:** 2026-03-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Make the knowledge graph stay fresh automatically. Every MCP tool call serves current data, incremental updates complete in under 2 seconds, schema is hardened for concurrent access, and readiness trends accumulate over time.

Requirements: GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04, DEBT-01, DEBT-02

</domain>

<decisions>
## Implementation Decisions

### Staleness Detection (GRAPH-01)
- **D-01:** Staleness checks run on **every MCP tool call** — no caching or idle-based shortcuts. The graph must never return outdated data.
- **D-02:** File changes detected via **SHA-256 content hash** stored per-file in the database. Hash column added to nodes table (or a new file_hashes table).
- **D-03:** Hash checks scoped to **queried files only** — only files relevant to the current tool query are checked, not the entire source tree. Keeps latency proportional to query scope.
- **D-04:** Stale files **block the response** until reparsed — user never sees outdated graph data. No async/background reparse with stale warnings.

### Incremental Reparse (GRAPH-02)
- **D-05:** File updates use **delete-and-rebuild per file** — delete all nodes/edges for the changed file, re-parse, insert fresh data. Simple, correct, reuses existing builder.ts patterns.
- **D-06:** Orphan cleanup via **ON DELETE CASCADE** on edges.source_id and edges.target_id — deleting nodes for a file automatically removes associated edges. Aligns with GRAPH-03.

### v1-to-v2 Schema Migration (GRAPH-03, GRAPH-04)
- **D-07:** **Auto-migrate in place** on database open. Detect schema version, apply migrations transparently (add CASCADE rules, busy_timeout pragma, file_hash column, readiness_history table). No user prompt needed.
- **D-08:** If migration fails, **fall back to full re-bootstrap** rather than leaving database in inconsistent state.
- **D-09:** Add **busy_timeout(5000)** pragma to openDatabase() for safe concurrent access between MCP server and future dashboard (GRAPH-04).

### Trends & History (DEBT-01, DEBT-02)
- **D-10:** Store readiness snapshots **per-bootstrap and per-incremental-update** — event-driven, not time-based (no cron/daily snapshots).
- **D-11:** `readiness_history` table stores: timestamp, overall grade, overall percent, and per-dimension scores (convention_coverage, type_safety, test_coverage_proxy, import_graph_health).
- **D-12:** `codescope_trends` MCP tool returns **three period comparisons**: current vs. previous snapshot, current vs. 7-day-ago, current vs. 30-day-ago. Each comparison includes deltas and trend direction (improving/declining/stable).

### Claude's Discretion
- Exact file_hash storage strategy (new column on nodes vs. separate file_hashes table) — pick what's cleanest for per-file lookup
- Schema version detection mechanism (metadata table vs. pragma user_version)
- Whether to recompute graphology centralities after incremental reparse or invalidate cache and let next full query recompute

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Graph Infrastructure
- `src/graph/database.ts` — Current openDatabase() with WAL mode pragmas (add busy_timeout here)
- `src/graph/schema.ts` — Current schema SQL (needs CASCADE migration, file_hash column, readiness_history table)
- `src/graph/builder.ts` — Full graph builder (reuse parse patterns for incremental per-file rebuild)
- `src/graph/cache.ts` — 5-min TTL cache (staleness check integrates here or replaces TTL)
- `src/graph/batch-writer.ts` — Batch insert patterns (reuse for incremental inserts)
- `src/graph/analytics.ts` — Centrality computation, loadGraphFromSQLite (may need cache invalidation after incremental)

### Existing Staleness & Change Detection
- `src/tools/helpers.ts` — Current time-based staleness (replace with hash-based per GRAPH-01)
- `src/bootstrap/incremental.ts` — Bootstrap-level git diff analysis (50% threshold — separate from new per-file incremental)
- `src/bootstrap/meta.ts` — Bootstrap metadata (timestamp tracking)

### Existing Readiness
- `src/tools/readiness-tool.ts` — Current readiness score parsing from markdown (trends tool builds on this data)

### External References (for implementation patterns)
- GitHub: `WiseLibs/better-sqlite3` — busy_timeout pragma, WAL concurrent access patterns, migration examples
- GitHub: `graphology/graphology` — Node/edge manipulation API for incremental graph updates

### Requirements
- `.planning/REQUIREMENTS.md` — GRAPH-01 through GRAPH-04, DEBT-01, DEBT-02 acceptance criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `openDatabase()` in `src/graph/database.ts` — add busy_timeout pragma here, single point of change
- `createSchema()` in `src/graph/schema.ts` — extend with migration logic and new tables
- `BatchWriter` in `src/graph/batch-writer.ts` — reuse batch insert patterns for incremental rebuilds
- `walkSourceFiles()` in `src/graph/builder.ts` — file discovery, reuse for hash computation
- `parseFile()` in `src/parser/index.ts` — AST parsing per file, core of incremental reparse
- `computeStaleness()` in `src/tools/helpers.ts` — replace internals, keep interface for backward compat

### Established Patterns
- All MCP tools use `okResponse()`/`errorResponse()` with `ToolMetadata` from `src/tools/helpers.ts`
- Graph access goes through `getGraph()` cache in `src/graph/cache.ts` — staleness check hooks in here
- Database opened synchronously via better-sqlite3 — all operations are sync (important for MCP handlers)
- Tools use `isBootstrapped()` guard before graph operations

### Integration Points
- Every MCP tool in `src/tools/` calls `getGraph()` — staleness detection intercepts here
- `src/server.ts` — MCP server entry, registers all tools
- `src/bootstrap/orchestrator.ts` — bootstrap completion triggers readiness snapshot storage

</code_context>

<specifics>
## Specific Ideas

- User wants downstream agents to reference GitHub repos (better-sqlite3, graphology) for implementation patterns
- Recommended defaults selected for all decisions — straightforward infrastructure work

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 09-graph-foundation-debt-tracking*
*Context gathered: 2026-03-27*
