# Phase 3: Bootstrap Synthesis and MCP Server - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

The `/codescope:bootstrap` command works end-to-end for both single projects and monorepos. For monorepos, per-service analysis squads run sequentially with a configurable cap, and a Synthesis agent produces a cross-service dependency map with merged conventions. The AI readiness score provides a letter-grade assessment across 4 dimensions with actionable improvement steps. All 11 MCP tools are operational with structured JSON responses, graph queries under 100ms via lazy-loaded caching, and consistent error handling with recovery hints. Incremental re-bootstrap detects changes since last run. High-confidence conventions can be confirmed to conventions-enforced.md via the Phase 7 review command (never auto-promoted).

</domain>

<decisions>
## Implementation Decisions

### AI Readiness Score
- **D-01:** Score measures 4 dimensions with equal weighting (25% each): convention coverage, type safety coverage, test coverage proxy, import graph health.
- **D-02:** Letter grade presentation (A-F) with per-dimension scores using standard academic thresholds (A: 90-100%, B: 80-89%, C: 70-79%, D: 60-69%, F: <60%). Include +/- granularity.
- **D-03:** Top 3 actionable improvement steps citing specific files/patterns. Regenerates after each bootstrap to show next 3.
- **D-04:** Brief one-sentence "what this means for AI" explainer per dimension (e.g., "High type safety means AI can infer intent from signatures without guessing").
- **D-05:** Delta tracking on re-bootstrap: compare current scores to previous run and show changes (e.g., "Convention coverage: 72% -> 85% (+13%)").

### Bootstrap Experience
- **D-06:** Progress reporting uses phase banners + agent completion status. Shows major phases ("Scanning services...", "Running analysis squad [service]...") with per-agent checkmarks and timing. Not file-level.
- **D-07:** Monorepo squads run sequentially per service (one squad at a time). Rate-limit safe, matches Pro plan constraints. Sequential agents within each squad.
- **D-08:** Completion summary shows artifact list with paths, key stats (nodes/edges, patterns detected), AI readiness grade with per-dimension breakdown, and "Next: /codescope:orient [task]" call-to-action.
- **D-09:** Incremental re-bootstrap by default: detect what changed since last run via git diff, only re-analyze affected services/files. Falls back to full if >50% changed. Full re-bootstrap available via --force flag.
- **D-10:** Cross-service synthesis captures shared type imports only (most reliable signal from import graph). Single merged conventions.md with per-service adoption tags (e.g., "async/await: api 95%, web 88%, shared 100%").
- **D-11:** Cross-service dependency map written as both markdown artifact (cross-service-map.md) and queryable via codescope_service_map MCP tool.

### Convention Enforcement
- **D-12:** Promotion via interactive /codescope:review-learnings command (Phase 7 skill). Shows detected conventions with adoption %, user confirms/rejects each. Confirmed ones move to conventions-enforced.md.
- **D-13:** "Enforced" means warning with evidence in verify reports (Phase 5). Never blocks. Shows file:line, golden file reference, adoption %. Suggestion-only in v1 (PROJECT.md constraint).
- **D-14:** conventions-enforced.md starts completely empty. No auto-promotion ever (LRNG-06). All enforcement requires explicit user confirmation.
- **D-15:** Only high-confidence conventions (>=80% adoption, >=10 files) are eligible for enforcement. Prevents enforcing patterns that aren't truly established.
- **D-16:** Rollback via /codescope:settings command (Phase 7). Lists enforced conventions, user can remove any.

### MCP Tool Responses
- **D-17:** All tools return structured JSON with consistent schema: `{ status: "ok"|"error"|"partial", data: {...}, metadata: {...} }`.
- **D-18:** Staleness tracking in every response metadata: `last_bootstrap` timestamp and `staleness` field ("fresh"/"stale"/"very_stale"). Stale = >7 days, very_stale = >30 days. Warning note suggests re-bootstrap.
- **D-19:** Structured errors with recovery hints: `{ status: "error", error: { code, message, recovery } }`. Recovery field tells the agent what to do. Partial results use `{ status: "partial", data: {...}, warnings: [...] }`.
- **D-20:** codescope_recall returns combined inline response: reads relevant sections from overview.md, conventions.md, learnings.md and returns a merged context block. One tool call = full context for a topic.
- **D-21:** Graph-querying tools (graph_query, blast_radius, detect_changes) use lazy-load + cache with 5-minute TTL. First call loads graph from SQLite (~200ms), subsequent calls use cached graphology instance (~5ms). Cache invalidated by bootstrap re-run or inactivity timeout.
- **D-22:** codescope_search in Phase 3 supports graph-based search only (by symbol name, file path, or relationship type). Text-based and hybrid search deferred to Phase 4.

### Change Detection
- **D-23:** codescope_detect_changes classifies risk using graph-based tiers: HIGH (in-degree centrality > 0.7), MEDIUM (0.3-0.7), LOW (< 0.3). Reuses existing graph data.
- **D-24:** Response includes risk level AND blast_radius_count per changed file, but not the full list of affected files. Full list available via codescope_blast_radius.

### Monorepo Squad Cap
- **D-25:** Squad cap configured in config.yml as `bootstrap.squad_cap: 10` (default). Set during onboarding or manually edited.
- **D-26:** When services exceed cap, analyze the N largest services by LOC. Remaining services get lightweight scan (file list + import edges only, no convention detection). All services included in cross-service map.

### codescope_orient Tool
- **D-27:** MCP tool returns a lightweight orient brief (NOT the full orient pipeline). Contains: relevant files with risk level, applicable conventions, danger zones, community context, golden files.
- **D-28:** File matching uses keyword extraction from task description + graph walk: extract keywords, match against node names/paths, walk 1-2 hop neighbors, rank by centrality + keyword relevance.

### Bootstrap --force
- **D-29:** --force resets all analysis artifacts (graph.db, service artifacts, readiness.md, service-manifest.md). Preserves user data (config.yml, conventions-enforced.md, learnings.md, orient/, plans/, execution/, reports/).
- **D-30:** --force shows brief confirmation before wiping: lists what will be rebuilt and what's preserved. User confirms or cancels.

### Performance Budget
- **D-31:** Parsing-heavy budget allocation for 100K LOC (~260s / 4.3min target): file walking 10s, AST parsing 120s, import resolution 30s, graph construction 20s, graph analytics 10s, convention detection 30s, artifact generation 10s, synthesis 30s.
- **D-32:** If bootstrap exceeds 5-minute budget, complete the full analysis and report timing warning with slowdown analysis and suggestions (not a hard cutoff).

### Service Map
- **D-33:** codescope_service_map returns service list with LOC, framework, analysis status, plus dependency edges with shared types and import counts.
- **D-34:** For single-service projects, returns a one-service response with empty dependencies array. Consistent schema.

### Tool Discoverability
- **D-35:** Rich MCP tool descriptions with use-case examples and "Related tools" pointers. No separate discovery mechanism — MCP protocol surfaces tool descriptions to agents.

### Verify/Search Tool Scope
- **D-36:** codescope_verify has partial functionality in Phase 3: convention compliance check only. Blast radius diff, build/test verification added in Phase 5.
- **D-37:** codescope_search has partial functionality in Phase 3: graph-based search only. Text and hybrid search added in Phase 4.
- **D-38:** Partial tools include `capabilities` and `upcoming` arrays in metadata so agents know what's available vs. coming later.

### Claude's Discretion
- No areas deferred to Claude's discretion — all gray areas received explicit user decisions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Specification
- `CODESCOPE-SPEC-V6.md` -- Full product spec. Bootstrap synthesis, MCP tool definitions, readiness score rubric, cross-service dependency map format.

### Build Instructions
- `CODESCOPE-BUILD-INSTRUCTIONS.md` -- Environment setup, dependency versions, MCP server build with tsdown.

### Project Context
- `.planning/PROJECT.md` -- Thin orchestrator pattern, filesystem coordination, key constraints, suggestion-only conventions.
- `.planning/REQUIREMENTS.md` -- Phase 3 requirements: BOOT-11 through BOOT-16, GRPH-05, GRPH-06, MCP-01 through MCP-12.
- `.planning/ROADMAP.md` -- Phase 3 goal, success criteria, dependency on Phase 2.

### Technology Stack
- `CLAUDE.md` SS Technology Stack -- @modelcontextprotocol/sdk v1.x, graphology ecosystem, better-sqlite3 sync API, web-tree-sitter memory management, ast-grep CLI.

### Prior Phase Context & Code
- `.planning/phases/01-plugin-foundation-and-infrastructure/01-CONTEXT.md` -- Phase 1 decisions: D-45 (tsdown build), D-46 (all tools registered as stubs), D-47 (codescope_status always works), D-48 (Zod validation).
- `.planning/phases/02-scout-and-analysis-squad/02-CONTEXT.md` -- Phase 2 decisions: D-05 (agents as callable modules), D-15 (graphology in-memory), D-17 (builder.ts separate), D-19 (graphology on-demand).
- `src/tools/stubs.ts` -- 10 stub MCP tool definitions with Zod schemas (to be replaced with real implementations).
- `src/tools/status.ts` -- codescope_status tool (already functional).
- `src/tools/index.ts` -- Tool registration pattern (registerStatusTool + registerStubTools).
- `src/graph/analytics.ts` -- loadGraphFromSQLite, centrality, communities, blastRadius functions.
- `src/graph/builder.ts` -- Graph construction pipeline (file walking, parsing, edge creation).
- `src/graph/batch-writer.ts` -- JSONL batch write + SQLite insert.
- `src/graph/database.ts` -- openDatabase with WAL mode.
- `src/agents/` -- Scout, Researcher, Convention Detector, Risk Analyzer, Learning Synthesizer modules.
- `src/conventions/runner.ts` -- ast-grep convention detection runner.
- `src/server.ts` -- MCP server entry point (14 lines, needs expansion).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Agent modules** (src/agents/*.ts): All 5 bootstrap agents exist as callable TypeScript modules. Phase 3 wires them into the bootstrap skill orchestration.
- **Graph analytics** (src/graph/analytics.ts): loadGraphFromSQLite, computeCentrality, detectCommunities, blastRadius already implemented. Phase 3 adds caching layer.
- **Stub tools** (src/tools/stubs.ts): 10 MCP tools with Zod input schemas already registered. Phase 3 replaces stubs with real implementations reusing the same schemas.
- **Status tool** (src/tools/status.ts): codescope_status already functional. Pattern to follow for other tools.
- **Convention runner** (src/conventions/runner.ts): ast-grep CLI execution and result parsing. Reuse for codescope_conventions and codescope_verify tools.
- **Graph builder** (src/graph/builder.ts): Full file walking, parsing, edge creation pipeline. Reuse for incremental re-bootstrap.
- **BatchWriter** (src/graph/batch-writer.ts): JSONL append + SQLite batch insert. Reuse for graph reconstruction.

### Established Patterns
- Agent module pattern: Options interface + Result interface + async function + markdown artifact output (Phase 2 D-05)
- Two-pass batch insert: nodes first, then edges resolved by name+file_path (Phase 1 D-40)
- Issue #5812 filesystem coordination: agents write files, parent reads files
- Stub tool pattern: makeStubResponse + registerStubTools for consistent "not bootstrapped" errors
- ESM-first with type:module and NodeNext module resolution
- Dependency injection (projectRoot param) for testability

### Integration Points
- New `src/bootstrap/` -- orchestrator module for /codescope:bootstrap skill
- New `src/bootstrap/synthesis.ts` -- cross-service analysis, merged conventions, readiness score
- New `src/tools/*.ts` -- real implementations for each MCP tool (replacing stubs)
- New `src/graph/cache.ts` -- lazy-load + TTL cache for graphology instance
- Modified `src/tools/index.ts` -- register real tools instead of stubs
- Modified `src/server.ts` -- expanded MCP server setup
- New `skills/bootstrap/SKILL.md` -- bootstrap skill body (already registered in Phase 1)

</code_context>

<specifics>
## Specific Ideas

- Graph caching: lazy-load from SQLite on first query, cache with 5-minute TTL, invalidate on bootstrap re-run. Balances <100ms target with memory safety.
- Incremental bootstrap detects changes via git diff since last bootstrap timestamp stored in config/metadata. Falls back to full if >50% files changed.
- AI readiness score uses equal-weight 4-dimension model with standard academic grading. Delta tracking shows progress between bootstraps.
- codescope_orient MCP tool is a lightweight brief (conventions + danger zones + relevant files), NOT the full orient pipeline. Full pipeline is the /codescope:orient skill (Phase 4).
- Partial tools (verify, search) include capabilities/upcoming arrays in metadata so agents know what's available. Convention-only verify is useful even without full verification.
- Cross-service map captures shared type imports only (most reliable from import graph). Written as both markdown artifact and MCP tool response.
- All MCP tools follow consistent JSON schema with status/data/metadata. Errors include recovery hints. Partial results use warnings array.

</specifics>

<deferred>
## Deferred Ideas

- Text-based and hybrid search for codescope_search -- Phase 4
- Full verification (blast radius diff, build/test) for codescope_verify -- Phase 5
- Convention enforcement rollback via /codescope:settings -- Phase 7
- Convention promotion via /codescope:review-learnings -- Phase 7
- @ast-grep/napi programmatic API -- defer unless CLI subprocess overhead becomes bottleneck
- Persistent in-memory graphology graph (replaced by TTL cache approach)

</deferred>

---

*Phase: 03-bootstrap-synthesis-and-mcp-server*
*Context gathered: 2026-03-23*
