# Requirements: CodeScope

**Defined:** 2026-03-22
**Core Value:** AI-generated code changes that respect existing conventions, stay within safe blast radius, and actually work in the codebase — verified end-to-end before the user sees them.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Plugin Foundation

- [x] **PLUG-01**: Plugin skeleton with manifest (plugin.json), skills directory, hooks, scripts, and .mcp.json for MCP server configuration
- [x] **PLUG-02**: Plugin installs cleanly via Claude Code plugin system and MCP server starts automatically
- [x] **PLUG-03**: Persistent file structure created at .claude/codescope/ with all required subdirectories (services/, orient/, plans/, execution/, reports/)
- [x] **PLUG-04**: Global memory directory created at ~/.codescope/ on first use

### Onboarding

- [x] **ONBD-01**: `/codescope:onboard` detects project type (single/monorepo), languages, build/test/E2E commands from existing config files
- [x] **ONBD-02**: User can select agent model assignments (researcher, convention detector, risk analyzer, learning synthesizer, eval judge, debug) during onboarding
- [x] **ONBD-03**: User can configure workflow preferences (orient verbosity, clarification style, eval gate mode, convention strictness) during onboarding
- [x] **ONBD-04**: Onboard produces .claude/codescope/config.yml with all settings in structured YAML format
- [x] **ONBD-05**: Onboard pulls from global memory (~/.codescope/global-memory.md) for returning users to pre-populate preferences
- [x] **ONBD-06**: Onboard detects agent teams availability (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var) and guides user through enabling it in `~/.claude/settings.json` if not set — required for parallel execution in the orient pipeline

### Bootstrap — Scout

- [x] **BOOT-01**: Scout agent (Haiku, read-only) maps top-level project structure from root configs (package.json, docker-compose.yml, workspace configs, CI/CD files)
- [x] **BOOT-02**: Scout produces service-manifest.md with list of services, paths, approximate LOC, detected frameworks
- [x] **BOOT-03**: Scout completes in under 30 seconds for typical projects

### Bootstrap — Analysis Squad

- [x] **BOOT-04**: Researcher agent maps structure, frameworks, entry points and writes overview.md (~200 lines)
- [x] **BOOT-05**: Convention Detector runs ast-grep frequency analysis and produces conventions.md with adoption %, trend direction (Rising/Declining/Stable), golden files, conflict detection (>20% competing patterns), and evidence chains
- [x] **BOOT-06**: Convention detection false positive rate below 5% for high-confidence patterns (>80% adoption, >10 files)
- [x] **BOOT-07**: Risk Analyzer builds SQLite knowledge graph (better-sqlite3) with nodes, edges, communities tables and calculates in-degree centrality for file importance
- [x] **BOOT-08**: Risk Analyzer produces danger-zones.md with high-centrality nodes, high-churn files, and cross-boundary dependencies
- [x] **BOOT-09**: Learning Synthesizer initializes learnings.md (empty or minimal initial observations)
- [x] **BOOT-10**: Golden files identified and written to golden-files.md ranked by modern pattern density

### Bootstrap — Synthesis & Scaling

- [x] **BOOT-11**: For monorepos (>100K LOC, multiple services): one analysis squad per service, writing to .claude/codescope/services/[service-name]/
- [x] **BOOT-12**: Squad cap configurable (default 10) to prevent runaway on massive monorepos
- [x] **BOOT-13**: Synthesis agent produces cross-service dependency map, merged convention summary, global danger zones
- [x] **BOOT-14**: AI readiness score produced in readiness.md with transparent rubric and actionable improvement steps
- [x] **BOOT-15**: High-confidence conventions promoted to conventions-enforced.md (never auto-promoted — requires explicit confirmation)
- [x] **BOOT-16**: Full bootstrap completes in under 5 minutes for 100K LOC

### AST Parsing & Import Resolution

- [x] **PARS-01**: web-tree-sitter WASM parsing for TypeScript, JavaScript, and Python source files
- [x] **PARS-02**: Import resolution for TS/JS using enhanced-resolve + tsconfig-paths with 95-99% accuracy
- [x] **PARS-03**: Import resolution for Python using filesystem-based resolution with ~80% accuracy
- [x] **PARS-04**: Parser lifecycle management: periodic parser.delete() and recreate to prevent memory leaks

### Knowledge Graph

- [x] **GRPH-01**: SQLite schema with nodes (file, class, function, method, variable, module), edges (CONTAINS, CALLS, IMPORTS, EXTENDS, IMPLEMENTS, USES_TYPE), and communities tables
- [x] **GRPH-02**: In-degree centrality calculation for all nodes to identify critical files
- [x] **GRPH-03**: Louvain community detection via graphology-communities-louvain for module grouping
- [x] **GRPH-04**: BFS blast radius traversal with hop-distance classification (hop 0 Red, hop 1 Orange, hop 2 Yellow, hop 3+ Green)
- [x] **GRPH-05**: Graph queries respond in under 100ms
- [x] **GRPH-06**: Cross-service dependency map for monorepos (which services call which, shared types, API contracts)

### MCP Server

- [x] **MCP-01**: MCP server implemented with @modelcontextprotocol/sdk using StdioServerTransport
- [x] **MCP-02**: `codescope_recall` tool — retrieve conventions, learnings, overview for a topic
- [x] **MCP-03**: `codescope_graph_query` tool — query knowledge graph (neighbors, paths, communities)
- [x] **MCP-04**: `codescope_blast_radius` tool — BFS traversal with hop-distance classification
- [x] **MCP-05**: `codescope_conventions` tool — get conventions for specific files/modules
- [x] **MCP-06**: `codescope_orient` tool — generate orient brief programmatically
- [x] **MCP-07**: `codescope_verify` tool — run verification checks programmatically
- [x] **MCP-08**: `codescope_search` tool — hybrid search (graph + text) across the codebase
- [x] **MCP-09**: `codescope_readiness` tool — get AI readiness score
- [x] **MCP-10**: `codescope_status` tool — current state (last bootstrap, active task, etc.)
- [x] **MCP-11**: `codescope_detect_changes` tool — map git diff to affected symbols with risk classification
- [x] **MCP-12**: `codescope_service_map` tool — cross-service dependency overview

### Orient — Clarification

- [x] **ORNT-01**: `/codescope:orient [task]` skill triggers the full autonomous pipeline
- [x] **ORNT-02**: Clarification uses knowledge graph to ask graph-informed questions (affected modules, convention conflicts, danger zones in blast radius, missing test coverage)
- [x] **ORNT-03**: Clarification triggers on vague tasks (<4 words, vague terms, ambiguous graph matches) and skips on specific tasks (>6 words with concrete nouns, --no-clarify flag)
- [x] **ORNT-04**: Clarification produces a scope contract (In Scope / Out of Scope) that locks down exactly what gets built
- [x] **ORNT-05**: Clarification respects user's configured style (thorough vs minimal)

### Orient — Research & Planning

- [x] **ORNT-06**: Research sub-agent investigates external domain using Context7 (current library docs) and web search (best practices, known issues)
- [x] **ORNT-07**: Research output scoped to what the task needs, written to .claude/codescope/execution/research.md
- [x] **ORNT-08**: Analysis phase runs graph traversal for all affected files, hop-distance blast radius, convention matching, test mapping, cross-service impact
- [x] **ORNT-09**: Plan sub-agent produces execution plan with agents to spawn, execution order, estimated changes, per-agent tasks, verify criteria
- [x] **ORNT-10**: Plan saved to .claude/codescope/plans/[task-slug].md before execution starts
- [x] **ORNT-11**: Orient completes in under 60 seconds after clarification

### Execution

- [x] **EXEC-01**: Orchestrator spawns execution agents using the planner's hybrid analysis: agent teams (parallel with SendMessage) for independent tasks, sequential sub-agents for dependent tasks, wave-based execution for mixed workloads
- [x] **EXEC-02**: Each agent receives scope contract, relevant conventions, golden files, coordination context, and research output
- [x] **EXEC-03**: Coordination file (.claude/codescope/execution/coordination.md) is the append-only audit trail in all modes — sequential agents read before starting; agent team members append on completion but use SendMessage for real-time coordination
- [x] **EXEC-04**: No-dependency agents run as agent teams with direct messaging when available; max concurrent still configurable (default 3); sequential fallback when agent teams unavailable
- [x] **EXEC-05**: Per-agent change reports written to .claude/codescope/execution/[agent-name]-changes.md
- [x] **EXEC-06**: Orchestrator stays under 15K tokens throughout execution (thin orchestrator pattern)
- [x] **EXEC-07**: Plan sub-agent always performs hybrid dependency analysis: independent tasks with exclusive file assignments → agent teams; blockedBy chains or shared files → sequential; mixed → wave-based execution. No user-facing mode config — the planner always picks the optimal strategy
- [x] **EXEC-08**: Agent team members use SendMessage for real-time handoff signals (file readiness, completion, blocking issues) with structured messages: `{type: "ready" | "done" | "blocked", files: [], detail: ""}`
- [x] **EXEC-09**: Orchestrator detects agent teams availability at runtime (env var, feature flag); if unavailable, falls back to sequential mode transparently with no user intervention required
- [x] **EXEC-10**: Plan validation gate: before execution starts, orchestrator verifies no two agents in the same team wave write to overlapping files; rejects plan and triggers re-plan if violated

### Verification

- [x] **VRFY-01**: Static verify agent checks convention compliance by scanning all new/modified files against conventions-enforced.md using ast-grep
- [x] **VRFY-02**: Static verify agent compares predicted blast radius (from orient) against actual files changed (git diff --name-only) and reports surprises/skips
- [x] **VRFY-03**: Static verify agent performs semantic code review of changes
- [x] **VRFY-04**: Runtime verify agent runs project build command and reports clean build or errors with file/line
- [x] **VRFY-05**: Runtime verify agent runs unit/integration test commands and reports pass/fail with output
- [x] **VRFY-06**: Runtime verify agent runs E2E verification using auto-detected tool (Playwright for web, Xcode for iOS/macOS, Gradle for Android, HTTP for API, Shell for CLI)
- [x] **VRFY-07**: Auto-smoke test generation for new routes/views/endpoints that lack E2E tests (minimal smoke, not full test suite)
- [x] **VRFY-08**: Verify report written to .claude/codescope/reports/[task]-[date].md with all check results

### Evaluation

- [x] **EVAL-01**: Eval agent (LLM-as-judge) reads scope contract, plan, coordination log, git diff, verify report, and research output
- [x] **EVAL-02**: Eval scores on 4 criteria: scope compliance, convention adherence, completeness, correctness
- [x] **EVAL-03**: Each finding has severity (LOW/MEDIUM/HIGH) and categorization (missing implementation, incorrect implementation, design decision)
- [x] **EVAL-04**: Eval report appended to verify report at .claude/codescope/reports/[task]-[date].md

### User Gate

- [x] **GATE-01**: In interactive mode, user sees eval findings and can select which to debug, ignore, or defer to TODO
- [x] **GATE-02**: Auto-debug mode sends all findings directly to debug (configurable in config.md)
- [x] **GATE-03**: Auto-skip-minor mode only sends MEDIUM+ findings to debug, auto-ignores LOW
- [x] **GATE-04**: User ignore patterns captured by learning system for future eval tuning

### Debug

- [x] **DBUG-01**: Debug agent reads findings and creates targeted fix plans (not full re-orient)
- [x] **DBUG-02**: Debug agent has full tool access: file tools, Bash, CodeScope MCP tools, Context7, web search
- [x] **DBUG-03**: Fix plan goes to execution agents — only agents responsible for broken pieces re-execute
- [x] **DBUG-04**: Re-verify runs on just changed files, re-eval runs on just fixed findings
- [x] **DBUG-05**: Design decisions escalate to user with concrete options
- [x] **DBUG-06**: Max 3 debug cycles (configurable), then defer to user with status report
- [x] **DBUG-07**: Debug resolution rate >80% of findings fixed within 3 cycles

### Learning

- [x] **LRNG-01**: After task completion, project memory (learnings.md) updates with what worked, what didn't, and gotchas discovered
- [x] **LRNG-02**: New learnings start as UNVERIFIED and must be confirmed via /codescope:review-learnings
- [x] **LRNG-03**: Confidence decay: gotchas expire after 90 days, decisions after 180 days
- [x] **LRNG-04**: Contradiction detection: new learning that contradicts existing learning or actual code is flagged
- [x] **LRNG-05**: Max 50 active learnings (~4,000 tokens when fully loaded)
- [x] **LRNG-06**: Learnings NEVER auto-promote to enforced conventions
- [x] **LRNG-07**: Global memory (~/.codescope/global-memory.md) captures user preferences, tech stack tendencies, ignore patterns, cross-project patterns
- [x] **LRNG-08**: Global memory updated automatically from observed behavior at eval gate

### Settings & Management

- [x] **MGMT-01**: `/codescope:settings` skill allows interactive or direct configuration changes with immediate feedback
- [x] **MGMT-02**: `/codescope:review-learnings` skill presents learnings for user to confirm, reject, or edit
- [x] **MGMT-03**: Reset commands available: --reset (config), --reset-global (global memory), bootstrap --force (re-analyze)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Visualization

- **VIS-01**: Interactive knowledge graph visualization using sigma + @react-sigma/core
- **VIS-02**: MCP Apps inline rendering for visual blast radius overlays

### Advanced Search

- **SRCH-01**: Semantic search using @lancedb/lancedb + Ollama for "find code related to X" by meaning

### Cross-Project

- **XPRJ-01**: Cross-project learning / pattern library with curation workflow
- **XPRJ-02**: ADR auto-generation seeded from accumulated learnings

### Integration

- **INTG-01**: CI/CD integration (GitHub Actions) for automated PR analysis
- **INTG-02**: Cross-service HTTP linking (route detection + HTTP call matching)
- **INTG-03**: Convention drift monitoring over time

### Language Support

- **LANG-01**: Additional language support beyond TS/JS/Python (Go, Rust, Java, etc.)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Real-time / continuous re-indexing | web-tree-sitter memory leaks with persistent parsing; on-demand re-indexing at orient time is sufficient |
| Blocking convention enforcement | Destroys trust; probabilistic detection + blocking = frustration; suggestion-only in v1 |
| Semantic / embedding-based search | Requires Ollama or cloud API (cost, latency, privacy); structural + text covers 90% of cases |
| Visual knowledge graph dashboard | Significant frontend effort; core value is autonomous pipeline, not visualization |
| All-language support from day one | Import resolution quality varies dramatically; honest accuracy claims for TS/JS + Python only |
| Automated comparison testing harness | Manual side-by-side testing across terminals sufficient for v1 |
| CI/CD pipeline integration | Scope creep from dev tool into infrastructure; different deployment/reliability model |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| PLUG-01 | Phase 1 | Complete |
| PLUG-02 | Phase 1 | Complete |
| PLUG-03 | Phase 1 | Complete |
| PLUG-04 | Phase 1 | Complete |
| ONBD-01 | Phase 1 | Complete |
| ONBD-02 | Phase 1 | Complete |
| ONBD-03 | Phase 1 | Complete |
| ONBD-04 | Phase 1 | Complete |
| ONBD-05 | Phase 1 | Complete |
| BOOT-01 | Phase 2 | Complete |
| BOOT-02 | Phase 2 | Complete |
| BOOT-03 | Phase 2 | Complete |
| BOOT-04 | Phase 2 | Complete |
| BOOT-05 | Phase 2 | Complete |
| BOOT-06 | Phase 2 | Complete |
| BOOT-07 | Phase 2 | Complete |
| BOOT-08 | Phase 2 | Complete |
| BOOT-09 | Phase 2 | Complete |
| BOOT-10 | Phase 2 | Complete |
| BOOT-11 | Phase 3 | Complete |
| BOOT-12 | Phase 3 | Complete |
| BOOT-13 | Phase 3 | Complete |
| BOOT-14 | Phase 3 | Complete |
| BOOT-15 | Phase 3 | Complete |
| BOOT-16 | Phase 3 | Complete |
| PARS-01 | Phase 1 | Complete |
| PARS-02 | Phase 1 | Complete |
| PARS-03 | Phase 1 | Complete |
| PARS-04 | Phase 1 | Complete |
| GRPH-01 | Phase 1 | Complete |
| GRPH-02 | Phase 2 | Complete |
| GRPH-03 | Phase 2 | Complete |
| GRPH-04 | Phase 2 | Complete |
| GRPH-05 | Phase 3 | Complete |
| GRPH-06 | Phase 3 | Complete |
| MCP-01 | Phase 3 | Complete |
| MCP-02 | Phase 3 | Complete |
| MCP-03 | Phase 3 | Complete |
| MCP-04 | Phase 3 | Complete |
| MCP-05 | Phase 3 | Complete |
| MCP-06 | Phase 3 | Complete |
| MCP-07 | Phase 3 | Complete |
| MCP-08 | Phase 3 | Complete |
| MCP-09 | Phase 3 | Complete |
| MCP-10 | Phase 3 | Complete |
| MCP-11 | Phase 3 | Complete |
| MCP-12 | Phase 3 | Complete |
| ONBD-06 | Phase 4 | Complete |
| ORNT-01 | Phase 4 | Complete |
| ORNT-02 | Phase 4 | Complete |
| ORNT-03 | Phase 4 | Complete |
| ORNT-04 | Phase 4 | Complete |
| ORNT-05 | Phase 4 | Complete |
| ORNT-06 | Phase 4 | Complete |
| ORNT-07 | Phase 4 | Complete |
| ORNT-08 | Phase 4 | Complete |
| ORNT-09 | Phase 4 | Complete |
| ORNT-10 | Phase 4 | Complete |
| ORNT-11 | Phase 4 | Complete |
| EXEC-01 | Phase 4 | Complete |
| EXEC-02 | Phase 4 | Complete |
| EXEC-03 | Phase 4 | Complete |
| EXEC-04 | Phase 4 | Complete |
| EXEC-05 | Phase 4 | Complete |
| EXEC-06 | Phase 4 | Complete |
| EXEC-07 | Phase 4 | Complete |
| EXEC-08 | Phase 4 | Complete |
| EXEC-09 | Phase 4 | Complete |
| EXEC-10 | Phase 4 | Complete |
| VRFY-01 | Phase 5 | Complete |
| VRFY-02 | Phase 5 | Complete |
| VRFY-03 | Phase 5 | Complete |
| VRFY-04 | Phase 5 | Complete |
| VRFY-05 | Phase 5 | Complete |
| VRFY-06 | Phase 5 | Complete |
| VRFY-07 | Phase 5 | Complete |
| VRFY-08 | Phase 5 | Complete |
| EVAL-01 | Phase 6 | Complete |
| EVAL-02 | Phase 6 | Complete |
| EVAL-03 | Phase 6 | Complete |
| EVAL-04 | Phase 6 | Complete |
| GATE-01 | Phase 6 | Complete |
| GATE-02 | Phase 6 | Complete |
| GATE-03 | Phase 6 | Complete |
| GATE-04 | Phase 6 | Complete |
| DBUG-01 | Phase 6 | Complete |
| DBUG-02 | Phase 6 | Complete |
| DBUG-03 | Phase 6 | Complete |
| DBUG-04 | Phase 6 | Complete |
| DBUG-05 | Phase 6 | Complete |
| DBUG-06 | Phase 6 | Complete |
| DBUG-07 | Phase 6 | Complete |
| LRNG-01 | Phase 7 | Complete |
| LRNG-02 | Phase 7 | Complete |
| LRNG-03 | Phase 7 | Complete |
| LRNG-04 | Phase 7 | Complete |
| LRNG-05 | Phase 7 | Complete |
| LRNG-06 | Phase 7 | Complete |
| LRNG-07 | Phase 7 | Complete |
| LRNG-08 | Phase 7 | Complete |
| MGMT-01 | Phase 7 | Complete |
| MGMT-02 | Phase 7 | Complete |
| MGMT-03 | Phase 7 | Complete |

**Coverage:**
- v1 requirements: 103 total
- Mapped to phases: 103
- Unmapped: 0

---
*Requirements defined: 2026-03-22*
*Last updated: 2026-03-23 — added EXEC-07 through EXEC-10 for dual-mode execution (agent teams + sequential)*
