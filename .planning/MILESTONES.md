# Milestones

## v2.0 Intelligence Layer + Interactive Dashboard (Shipped: 2026-03-29)

**Phases completed:** 8 phases, 27 plans, 53 tasks

**Key accomplishments:**

- SQLite v2 schema with ON DELETE CASCADE via 12-step table recreation, auto-migration using PRAGMA user_version, file_hashes and readiness_history tables, busy_timeout(5000) for concurrent access
- SHA-256 file hashing with scoped staleness detection, per-file delete-and-rebuild reparse engine, and async getGraph that blocks on stale files until reparsed -- every MCP query now serves fresh data
- Readiness trend tracking with snapshot storage on every bootstrap and codescope_trends MCP tool returning 3 period comparisons with per-dimension deltas and trend directions
- Pre-computed JSON injection artifacts (danger-zones, conventions, blast-radius) generated atomically after every bootstrap and incremental rebuild for sub-50ms hook consumption
- PreToolUse/PostToolUse hooks reading pre-computed artifact files with 500-token priority-budgeted context injection on every Edit/Write, zero heavy dependencies, graceful no-op when unbootstrapped
- Reverse BFS graph traversal via bfsFromNode inbound mode, plus codescope_predict_impact MCP tool returning per-file risk tiers with centrality-based classification
- codescope_review MCP tool with diff resolution, per-file risk scoring, dependency edge reporting, DFS cycle detection, convention compliance checking, and cross-community boundary flagging
- /codescope:review skill with argument parsing (PR/branch/working tree), markdown report formatting, and both Phase 11 tools registered in the tool index (15 total)
- VERIFIED-only rule filter and pre-commit check engine with sg scan, severity-to-exit-code mapping, and compact terminal output
- Handoff document generator/parser with pipeline phase detection from filesystem artifacts, D-17 artifact validation, and 7-day session cleanup
- Git hook install/uninstall CLIs with husky detection, existing hook chaining via backup, and marker-block-based husky integration
- PreCompact and SessionStart Claude Code hooks for auto-saving pipeline state before compaction and injecting handoff context on session resume, plus complete tsdown build config with all 9 entry points
- Pause/resume skills wired to dist/ session modules with orient --resume artifact-based phase detection and 6 unit tests
- Four standalone pipeline modules -- token utility, failure classifier, qualification gate, reconciliation reporter -- with 46 tests establishing contracts for Plan 02 integration
- Four PIPE requirements wired into live pipeline -- qualification gates, failure classification, reconciliation reports, and token budget warnings active in orchestrator/eval/debug/planner
- Vitest test stubs for dashboard server, API routes, and WebSocket with 22 skipped + 1 real assertion covering all server-side concerns
- Hono HTTP server with 7 JSON API routes, WebSocket live updates, event log tailing, and complete dark-theme CSS design system for the visualization dashboard
- Typed API/WebSocket clients, 5 shared UI components, panel routing, and sigma.js dependency graph with FA2 layout, community coloring, danger zone borders, and full node interactions
- Convention heatmap, readiness gauges with trend charts, blast radius rings, and command center action cards -- completing the 5-panel dashboard with real-time WebSocket progress feedback
- Playwright headless screenshot capture, /codescope:viz skill with browser launch, and event emission wired into bootstrap/execution pipelines for real-time WebSocket dashboard updates
- Complete `npx codescope` CLI with 6 subcommands, init flow with plugin auto-setup, UI helpers with JSON mode, and 17 tests
- Cross-platform npm distribution config with optionalDependencies for better-sqlite3 binaries, native loader with graceful fallback, and README with quickstart
- Fixed MCP server path mismatch (dist/server.js -> dist/server.mjs) in 3 locations and install-hooks fork bomb with idempotency guard and regression test
- Resolved all 24 tsc --noEmit errors across 11 files: Hono AppEnv context typing, function argument corrections, DbHandle widening, ambient module declarations, and html2canvas type assertions
- darwin-arm64 native binary extracted, ESM deep import fix for graphology-metrics, full build pipeline verified (tsc clean, 1124 tests pass, MCP server starts)
- Added postinstall build script to package.json and marked all 42 v2.0 requirements Complete in REQUIREMENTS.md traceability table
- GitHub Actions 4-platform matrix workflow for better-sqlite3 native binary builds with build process documentation

---

## v1.0 MVP (Shipped: 2026-03-27)

**Phases completed:** 8 phases, 34 plans, 65 tasks

**Key accomplishments:**

- Complete plugin scaffold with 9 core + 7 dev dependencies, 5 skill registrations, MCP config, and filesystem utilities for .claude/codescope/ directory tree creation
- Full Zod config schema with YAML round-trip, MCP server registering codescope_status and 10 stub tools with validated input schemas
- web-tree-sitter ParserPool with memory lifecycle management, structured AST extraction for TS/JS/Python, and import resolvers using enhanced-resolve (TS/JS) and filesystem probing (Python)
- SQLite knowledge graph with WAL mode, 3-table schema (nodes/edges/communities), 5 indexes, and JSONL batch writer for multi-agent graph population
- Project detection from filesystem (package.json, tsconfig, pyproject.toml, docker-compose, playwright), global memory for returning users, and complete 5-step onboarding skill prompt producing valid config.yml
- Graph builder pipeline populating SQLite knowledge graph from source code, plus graphology-based centrality, Louvain community detection, and BFS blast radius with hop-distance risk classification
- ast-grep YAML rule library (15 TS/JS + 3 Python), convention runner with adoption/conflict/golden-file analysis, validated against fixture project with 0% false positive rate
- Scout agent maps project structure with LOC/framework/CI detection producing service-manifest.md; Researcher agent analyzes project producing overview.md with 6 required sections
- Three agent modules composing Plan 01 graph analytics and Plan 02 convention detection into danger-zones.md, conventions.md, golden-files.md, and learnings.md artifacts matching UI-SPEC copywriting contracts
- Lazy-load graph cache with 5-min TTL, D-17/D-18/D-19 MCP response helpers, bootstrap metadata storage, and codescope_status updated to structured envelope format
- 4 MCP tools parsing markdown artifacts for codebase intelligence: topic-filtered recall, convention lookup with adoption data, AI readiness scores with dimension breakdown, and cross-service dependency mapping
- 4 graph-querying MCP tools (graph_query, blast_radius, search, detect_changes) with cached graphology queries, BFS hop classification, centrality-based risk tiers, and partial capability metadata
- Bootstrap orchestrator sequencing 5 agent modules with monorepo squad scaling, cross-service dependency synthesis, 4-dimension AI readiness scoring, and incremental re-bootstrap via git diff
- codescope_orient keyword-based graph walk and codescope_verify convention compliance checker with all 11 MCP tools wired and bootstrap skill body complete
- Graph-informed ambiguity detection (HIGH/MEDIUM/LOW), topic-grouped clarification questions with style support, scope contract generation, and full analysis module with blast radius, convention matching, test mapping, and cross-community impact
- Append-only coordination log, agent teams env/settings detection, and wave scheduler with dependency DAG + file overlap validation
- Config schema execute.parallel made optional per D-44, agent teams detection/enablement module with settings.json integration, onboard skill updated with agent teams step
- Impact-ranked research topic extraction from graph imports, sub-agent prompt construction with Context7/web search instructions, plan markdown parsing and generation in UI-SPEC format, and auto-fix validation for mechanical errors via wave reschedule
- Scoped agent prompt construction with SendMessage protocol, wave-based orchestrator with agent teams dispatch, retry-once failure handling, and UI-SPEC execution summary
- Verify type system with 15+ shared interfaces, blast radius diff with hop-distance severity (BFS graph distance), and markdown report writer matching UI-SPEC copywriting contract
- Convention compliance via ast-grep with golden file references and adoption percentages, blast radius diff integration, and LLM code review prompt with soft cap of 10 findings
- Runtime verify agent with build short-circuit, E2E auto-detection with server lifecycle management, web-tree-sitter AST-based endpoint detection for auto-smoke generation, and tail-biased LLM test output extraction
- CLI entry point wiring static and runtime verify with --phase support, MCP tool upgraded to all 8 check types with graceful degradation, orient skill body with Step 5: Verification dispatching code review and smoke sub-agents
- LLM-as-judge eval agent with 4-criteria scoring, large-diff chunking at 50K tokens, retry-once fallback, report appending, and learnings.md ignore pattern filtering
- Debug agent with bounded fix loop creating ExecutionPlan-compatible mini plans from eval findings, design decision escalation, scoped re-verify/re-eval, and crash-safe resolution tracking
- User gate routing logic for 3 modes (interactive/auto-debug/auto-skip-minor) with codescope_eval MCP tool featuring orient-dependent graceful degradation
- CLI entry points for eval and debug with stderr dispatch protocol, codescope_eval MCP tool registration, and orient skill body Step 6 orchestrating eval -> gate -> debug loop across all 3 gate modes
- Pure-function learning lifecycle with markdown parser (lossless roundtrip), 90/180-day confidence decay, heuristic+LLM contradiction detection, 50-entry cap with oldest-expired eviction, and 3-strike global enrichment
- LLM-driven learning synthesizer with dispatchSynthesizer callback, extended global memory with 3 new sections (tech stack, ignore patterns, cross-project gotchas), and CLI entry point with stderr dispatch_learning protocol
- Full interactive /codescope:settings skill with 6 flag handlers (reset, reset-global, set, rollback-convention, detect-teams) plus interactive section browser, all Zod-validated before write
- Review-learnings batch review skill body with confirm/reject/edit actions, convention promotion, and orient Step 7 learning capture integration
- JSON sidecar for verify-to-eval pipeline, type consolidation eliminating local copies and unsafe casts, accurate 12-tool MCP documentation, dead code removal
- Dual-path CLI args (--eval-report-path, --verify-report-path) with backward-compat fallback to --report-path, plus ROADMAP accuracy fix marking phases 1-7 complete

---
