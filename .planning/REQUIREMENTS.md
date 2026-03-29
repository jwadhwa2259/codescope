# Requirements: CodeScope v2.0

**Defined:** 2026-03-27
**Core Value:** AI-generated code changes that respect existing conventions, stay within safe blast radius, and actually work in the codebase -- verified end-to-end before the user sees them.

## v2.0 Requirements

Requirements for v2.0 Intelligence Layer + Interactive Dashboard. Each maps to roadmap phases.

### Graph Intelligence

- [x] **GRAPH-01**: Graph detects stale data via file hash comparison on every MCP tool call and triggers incremental reparse automatically
- [x] **GRAPH-02**: Incremental delta reparse updates only changed files' nodes/edges in <2s without full re-bootstrap
- [x] **GRAPH-03**: Schema migration adds ON DELETE CASCADE to edges table preventing dangling references
- [x] **GRAPH-04**: SQLite busy_timeout pragma (5000ms) enables safe concurrent access between MCP server and dashboard

### Auto-Injection

- [x] **INJECT-01**: PreToolUse hook on Edit/Write automatically injects file-specific conventions, blast radius, and danger zone warnings into Claude's context
- [x] **INJECT-02**: PostToolUse hook on Edit/Write validates changes against conventions and warns on blast radius expansion
- [x] **INJECT-03**: Injection budget capped at 500 tokens per file with priority queue (danger zones > conventions > blast radius > general)
- [x] **INJECT-04**: Injection triggers only for files with centrality > 0.3 OR detected conventions (medium aggressiveness)
- [x] **INJECT-05**: Hooks degrade gracefully to no-op when bootstrap hasn't run or graph.db doesn't exist

### Pipeline Evolution

- [x] **PIPE-01**: Per-task qualification after each agent execution verifies files actually changed via git diff and runs scoped convention check
- [x] **PIPE-02**: Diagnostic failure routing classifies eval findings as SCOPE_DRIFT / PLAN_GAP / CODE_BUG / CONVENTION_MISS before attempting debug fixes
- [x] **PIPE-03**: Plan-vs-actual reconciliation report compares planned files against actual git changes, surfaces unexpected changes and scope drift
- [x] **PIPE-04**: Planner estimates token cost per agent and tags as LIGHT/MODERATE/HEAVY, orchestrator warns when context exceeds safe threshold

### Session Continuity

- [x] **SESS-01**: `/codescope:pause` generates structured handoff document with completed work, remaining tasks, key decisions, and resume command
- [x] **SESS-02**: `/codescope:resume` reads handoff document and resumes orient pipeline at the correct phase/wave
- [x] **SESS-03**: `--resume {taskSlug}` flag on orient skips completed phases and loads existing artifacts
- [x] **SESS-04**: PreCompact hook auto-generates handoff before context compaction

### PR Review

- [x] **REVIEW-01**: `codescope_review` MCP tool accepts git diff/branch and returns structural impact analysis with risk scores per file
- [x] **REVIEW-02**: Review detects new dependency edges, circular dependencies, and cross-community changes in the diff
- [x] **REVIEW-03**: Review runs convention compliance on changed files and flags violations with evidence
- [x] **REVIEW-04**: `/codescope:review` skill accepts branch name, PR number (via gh), or defaults to working tree diff

### Impact Prediction

- [x] **IMPACT-01**: `codescope_predict_impact` MCP tool accepts file paths or natural language description and returns pre-change blast radius with risk assessment
- [x] **IMPACT-02**: Reverse dependency query walks import edges backward to find all callers/importers up to N hops

### Convention Enforcement

- [x] **ENFORCE-01**: Opt-in pre-commit hook runs ast-grep convention check on staged files
- [x] **ENFORCE-02**: Only VERIFIED (user-confirmed) conventions are enforced, never auto-detected
- [x] **ENFORCE-03**: Configurable severity via config.yml: suggest-only (default) / warn / block
- [x] **ENFORCE-04**: `npx codescope install-hooks` installs pre-commit without overwriting existing hooks

### Visualization Dashboard

- [x] **VIZ-01**: Local HTTP server (Hono) on port 7463 serves single-page dashboard with JSON API endpoints
- [x] **VIZ-02**: Dependency graph panel renders knowledge graph via sigma.js with nodes sized by centrality, colored by community, danger zones highlighted red
- [x] **VIZ-03**: Convention heatmap panel shows per-file compliance colored green/yellow/red with click-to-detail
- [x] **VIZ-04**: Readiness dashboard panel shows 4 gauges + historical trend line from readiness_history table
- [x] **VIZ-05**: Blast radius explorer panel shows concentric ring visualization for selected file
- [x] **VIZ-06**: WebSocket pushes real-time updates during bootstrap/orient execution (agent progress, wave completion)
- [x] **VIZ-07**: Interactive command center -- click file to trigger review or impact prediction from the UI
- [x] **VIZ-08**: Screenshot export mode for marketing (`npx codescope viz --screenshot output.png`)
- [x] **VIZ-09**: `/codescope:viz` skill launches dashboard and opens browser

### Technical Debt Tracking

- [x] **DEBT-01**: `readiness_history` SQLite table stores readiness snapshots with timestamps on every bootstrap/incremental update
- [x] **DEBT-02**: `codescope_trends` MCP tool returns period comparisons (current vs previous, deltas, trend direction)

### Distribution

- [x] **DIST-01**: `npx codescope init` detects project, creates config, runs bootstrap, shows "what you got" summary
- [x] **DIST-02**: CLI entry point with subcommands: init, bootstrap, viz, review, install-hooks, status
- [x] **DIST-03**: Plugin auto-setup configures `.claude-plugin/plugin.json` and `.mcp.json` if Claude Code detected
- [x] **DIST-04**: npm package published with bin entry, platform-appropriate better-sqlite3 prebuilds bundled

## v3.0 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Intelligence

- **ADV-01**: Semantic/embedding search via @lancedb/lancedb + Ollama
- **ADV-02**: Cross-project learning and pattern library
- **ADV-03**: ADR auto-generation from key decisions
- **ADV-04**: Cross-repository analysis for microservices
- **ADV-05**: CI/CD integration (GitHub Actions hooks)
- **ADV-06**: Cross-service HTTP linking (route detection + HTTP call matching)
- **ADV-07**: Multi-language expansion (Go, Java, Rust, C#)

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| Greenfield/ideation (SEED-like) | Greenfield planning saturated (25+ tools); CodeScope's moat is brownfield intelligence |
| Real-time filesystem watchers | web-tree-sitter memory leaks; on-demand incremental sufficient |
| Blocking all conventions by default | Destroys trust-building model; opt-in enforcement for VERIFIED only |
| Full IDE extensions (VS Code/JetBrains) | Let community build on MCP tools; Claude Code already has VS Code integration |
| Usage/cost monitoring | Commodity; 6+ tools already exist in ecosystem |
| Own orchestrator/workflow engine | 11+ exist; would compete with potential consumers of intelligence layer |
| AI-powered auto-fix for convention violations | Convention auto-fix requires understanding intent; let pipeline handle fixes |
| Session management/restore | 6+ tools do this; not core value (session continuity via handoff is different) |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| GRAPH-01 | Phase 9 + 16 | Pending |
| GRAPH-02 | Phase 9 + 16 | Pending |
| GRAPH-03 | Phase 9 + 16 | Pending |
| GRAPH-04 | Phase 9 + 16 | Pending |
| INJECT-01 | Phase 10 | Complete |
| INJECT-02 | Phase 10 | Complete |
| INJECT-03 | Phase 10 | Complete |
| INJECT-04 | Phase 10 | Complete |
| INJECT-05 | Phase 10 | Complete |
| PIPE-01 | Phase 13 | Complete |
| PIPE-02 | Phase 13 | Complete |
| PIPE-03 | Phase 13 | Complete |
| PIPE-04 | Phase 13 | Complete |
| SESS-01 | Phase 12 | Complete |
| SESS-02 | Phase 12 | Complete |
| SESS-03 | Phase 12 | Complete |
| SESS-04 | Phase 12 | Complete |
| REVIEW-01 | Phase 11 + 16 | Complete |
| REVIEW-02 | Phase 11 + 16 | Complete |
| REVIEW-03 | Phase 11 + 16 | Complete |
| REVIEW-04 | Phase 11 + 16 | Complete |
| IMPACT-01 | Phase 11 + 16 | Complete |
| IMPACT-02 | Phase 11 + 16 | Complete |
| ENFORCE-01 | Phase 12 | Complete |
| ENFORCE-02 | Phase 12 | Complete |
| ENFORCE-03 | Phase 12 | Complete |
| ENFORCE-04 | Phase 12 | Complete |
| VIZ-01 | Phase 14 | Complete |
| VIZ-02 | Phase 14 | Complete |
| VIZ-03 | Phase 14 | Complete |
| VIZ-04 | Phase 14 | Complete |
| VIZ-05 | Phase 14 | Complete |
| VIZ-06 | Phase 14 | Complete |
| VIZ-07 | Phase 14 | Complete |
| VIZ-08 | Phase 14 | Complete |
| VIZ-09 | Phase 14 | Complete |
| DEBT-01 | Phase 9 | Complete |
| DEBT-02 | Phase 9 + 16 | Complete |
| DIST-01 | Phase 15 + 16 | Pending |
| DIST-02 | Phase 15 + 16 | Pending |
| DIST-03 | Phase 15 + 16 | Complete |
| DIST-04 | Phase 15 + 16 | Pending |

**Coverage:**
- v2.0 requirements: 42 total
- Mapped to phases: 42/42
- Unmapped: 0
- Pending (Phase 16 gap closure): 15

---
*Requirements defined: 2026-03-27*
*Last updated: 2026-03-29 after gap closure phase creation (15 requirements assigned to Phase 16)*
