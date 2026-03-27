# Milestones

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
