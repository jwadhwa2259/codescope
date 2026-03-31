# CodeScope

## Current State

**Version:** v2.1 shipped 2026-03-31
**Codebase:** ~35K LOC TypeScript (source + tests, 1,357 passing)
**Stack:** TypeScript, web-tree-sitter WASM, ast-grep CLI, better-sqlite3, graphology, enhanced-resolve, @modelcontextprotocol/sdk, Hono, sigma.js, vitest

## What This Is

CodeScope is a Claude Code plugin that deeply analyzes brownfield codebases once, then autonomously researches, plans, executes, verifies, evaluates, and self-corrects code changes using coordinated sub-agents. The user only steps in twice: to describe what they want, and to approve what gets shipped.

v2.0 transforms CodeScope from a one-time analysis tool into an always-on intelligence layer with auto-injection, graph-aware PR review, interactive visualization, convention enforcement, and self-improving pipeline -- ready for `npx codescope` distribution.

## Core Value

AI-generated code changes that respect existing conventions, stay within safe blast radius, and actually work in the codebase -- verified end-to-end before the user sees them.

## Requirements

### Validated

- Plugin skeleton with manifest, skills, hooks, and scripts -- v1.0
- `/codescope:onboard` -- interactive config creation -- v1.0
- SQLite knowledge graph (better-sqlite3) with nodes, edges, communities tables -- v1.0
- web-tree-sitter WASM parsing for TS/JS/Python -- v1.0
- Import resolution: enhanced-resolve + tsconfig-paths (TS/JS), filesystem-based (Python ~80%) -- v1.0
- Graph analysis: graphology (centrality, Louvain community detection, BFS blast radius) -- v1.0
- Scout + Researcher + Convention Detector + Risk Analyzer + Learning Synthesizer agents -- v1.0
- `/codescope:bootstrap` -- full autonomous analysis pipeline with monorepo squad scaling -- v1.0
- MCP server with 15 operational tools -- v2.0
- Graph cache with async staleness-aware cache -- v2.0
- AI readiness score (4 dimensions, A-F grades, delta tracking) -- v1.0
- Incremental re-bootstrap via git diff with 50% threshold -- v1.0
- `/codescope:orient [task]` -- full orient pipeline with graph-informed clarification -- v1.0
- Execution engine with wave-based scheduling, agent teams detection -- v1.0
- Static + Runtime verify agents, Eval agent, User gate, Debug agent -- v1.0
- Learning system with decay, contradiction detection, global memory -- v1.0
- Incremental delta reparse with SHA-256 staleness detection (<2s updates) -- v2.0
- Schema migration (v1-to-v2) with ON DELETE CASCADE, busy_timeout concurrency -- v2.0
- Readiness trend tracking with snapshot storage and period comparisons -- v2.0
- Auto-injection hooks (PreToolUse/PostToolUse) with 500-token budget composer -- v2.0
- Pre-computed JSON injection artifacts for sub-50ms hook consumption -- v2.0
- `codescope_predict_impact` -- reverse BFS blast radius prediction -- v2.0
- `codescope_review` -- structural PR impact analysis with risk scoring -- v2.0
- `/codescope:review` skill -- PR/branch/working tree review formatting -- v2.0
- Convention enforcement: VERIFIED-only pre-commit hooks with configurable severity -- v2.0
- Session continuity: pause/resume with handoff documents and PreCompact hooks -- v2.0
- Pipeline evolution: qualification gates, failure classification, reconciliation, token budget -- v2.0
- Visualization dashboard: sigma.js graph, convention heatmap, readiness trends, blast radius, command center -- v2.0
- WebSocket real-time updates during bootstrap/execution -- v2.0
- Screenshot export via Playwright -- v2.0
- CLI entry point (`npx codescope`): init, bootstrap, viz, review, install-hooks, status -- v2.0
- Plugin auto-wiring for Claude Code integration -- v2.0
- Cross-platform npm distribution with better-sqlite3 prebuilds -- v2.0

## Current Milestone: v2.1 Eval Fixes & Real-World Quality

**Goal:** Fix the gaps exposed by comparison testing against Fastify and h3 — make CodeScope demonstrably better than vanilla Claude Code on real codebases.

**Target features:**
- Fix import graph (ESM edge creation + CommonJS require() support)
- Semantic convention detection (framework-specific patterns, not just generic syntax)
- Fix plugin distribution (marketplace, manifest, hooks, CLAUDE_PLUGIN_ROOT)
- Fix readiness scoring, golden file ranking, bootstrap error surfacing
- Build `/codescope:eval` skill (score changes against conventions, 3 modes)
- Reference file injection ("write this like X" exemplar suggestion)
- Post-edit convention validation (catch deviations before task completion)

### Active

(Requirements defined in REQUIREMENTS.md)

### Out of Scope

- Semantic search (@lancedb/lancedb + Ollama) -- V3, structural + text covers 90% of use cases
- Cross-project learning / pattern library -- V3
- ADR auto-generation -- V3
- CI/CD integration (GitHub Actions hooks) -- V3, different deployment/reliability model
- Cross-service HTTP linking (route detection + HTTP call matching) -- V3
- Multi-language expansion (Go, Java, Rust, C#) -- V3
- Greenfield/ideation features -- Greenfield planning is saturated (25+ tools); CodeScope's moat is brownfield intelligence
- Session management/restore -- 6+ tools in ecosystem do this; not core value
- IDE extensions -- Let community build on MCP tools
- Usage/cost monitoring -- Commodity; 6 tools already exist
- Own orchestrator/workflow engine -- 11+ exist; would compete with potential consumers of the intelligence layer
- AI-powered auto-fix for convention violations -- Convention auto-fix requires understanding intent; let pipeline handle fixes

## Context

- **Problem space:** GitClear's 211M-line analysis found AI-assisted code churn doubled while refactoring collapsed. METR RCT showed experienced devs 19% slower with AI in their own repos. Root cause: no persistent codebase understanding.
- **Competitive landscape:** codebase-context (convention detection, trends, golden files), codebase-memory-mcp (SQLite graph, Louvain, blast radius, detect_changes), Understand Anything (5-agent architecture), Anthropic's feature-dev plugin (official plugin patterns). CodeScope combines the best of these with a full autonomous pipeline nobody else has.
- **Architecture philosophy:** Thin orchestrator (<15K tokens), all heavy work in isolated sub-agent 200K-token contexts, filesystem coordination (not return values -- Issue #5812), no agent nesting. State lives on disk, not in context.
- **Known platform constraints:** `context: fork` silently ignored on auto-invoked skills (Issue #17283) -- use Task tool delegation. Sub-agents cannot return file contents to parent (Issue #5812). web-tree-sitter has memory leaks -- periodic parser.delete() and recreate.
- **v1.0 shipped:** 2026-03-27. 8 phases, 34 plans, 65 tasks. 103/103 requirements. Full pipeline: onboard > bootstrap > orient > execute > verify > eval > gate > debug > learn.
- **v2.0 shipped:** 2026-03-29. 8 phases, 27 plans, 53 tasks. 42/42 requirements. Always-fresh graph, auto-injection, PR review, convention enforcement, session continuity, pipeline evolution, interactive dashboard, npx distribution.
- **Total shipped:** 16 phases, 61 plans, 118 tasks over 7 days (2026-03-22 to 2026-03-29).
- **v2.1 eval findings (2026-03-30):** Comparison testing on Fastify (CommonJS) and h3 (TypeScript ESM) showed import graph producing 0 edges on both. Convention detection found generic patterns but missed framework-specific conventions. Vanilla Claude scored equal or better by simply reading source files. Root causes: parser only extracts `import_statement` AST nodes (not `require()` or graph edge creation bugs), convention rules too generic, no reference file injection, readiness scoring disconnected from convention detection output.

## Constraints

- **Tech stack**: TypeScript (same as Claude Code ecosystem), web-tree-sitter WASM (not node-tree-sitter -- broken, no maintainer), ast-grep CLI, better-sqlite3, graphology, enhanced-resolve, @modelcontextprotocol/sdk, vitest
- **Performance**: Bootstrap <5 min for 100K LOC, orient <60s after clarification, graph queries <100ms, plugin startup <5K tokens, orchestrator <15K tokens
- **Quality**: Convention false positive rate <5% (high-confidence), eval finding accuracy >70%, debug resolution >80% within 3 cycles
- **Language support**: TypeScript/JavaScript + Python for v1. TS/JS import resolution 95-99% accuracy, Python ~80%
- **Rate limits**: Max 3 concurrent agents (configurable), sequential spawning default on Pro plans
- **Learning bounds**: Max 50 active learnings (~4K tokens), gotcha decay 90 days, decision decay 180 days, never auto-promote to enforced conventions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Thin orchestrator pattern | Main context stays under 15K tokens -- compaction either never triggers or doesn't matter because all state is on disk | Good |
| Filesystem coordination over return values | Issue #5812: sub-agents can't return file contents. Append-only coordination.md pattern. | Good |
| Hybrid execution (planner-driven, no user config) | Planner always analyzes dependency graph and picks optimal execution. No user-facing mode setting. | Good |
| Task tool delegation over context: fork | Issue #17283: context: fork silently ignored on auto-invoked skills | Good |
| web-tree-sitter WASM over node-tree-sitter | node-tree-sitter is broken with no maintainer. web-tree-sitter is what Claude Code uses internally. | Good |
| ast-grep for convention detection | Structural pattern matching by syntax, not text. Supports 27 languages. Zero compilation required. | Good |
| Suggestion-only conventions in v1 | Never block -- build trust first. User can dismiss/correct. <5% false positive target. | Good |
| UNVERIFIED default for learnings | Prevents codifying LLM mistakes. Requires human confirmation. | Good |
| ESM-first with NodeNext module resolution | Claude Code ecosystem is TypeScript/ESM. Consistent with plugin conventions. | Good |
| Two-pass batch insert for graph edges | Nodes first across all files, then edges resolved, for cross-file edge resolution correctness. | Good |
| Agent module pattern (Options + Result + async fn + artifact) | Consistent interface across all agent modules from Phase 2 onward. | Good |
| JSON sidecar for verify-to-eval pipeline | Structured data transfer between verify and eval stages instead of markdown parsing. | Good |
| Build isolation for hooks | Hook scripts never transitively import heavy modules (duplicated types/logic in hooks/lib/) | Good |
| Pre-computed injection artifacts | JSON indexes built at bootstrap/incremental time for sub-50ms hook consumption | Good |
| Hono for dashboard server | Lightweight, fast, TypeScript-native HTTP framework with built-in WebSocket support | Good |
| sigma.js for graph visualization | Interactive graph rendering with FA2 layout, community coloring, and hover highlighting | Good |
| Dynamic imports for heavy CLI deps | Keeps CLI bundle clean and avoids graphology ESM subpath resolution issues | Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? -> Move to Out of Scope with reason
2. Requirements validated? -> Move to Validated with phase reference
3. New requirements emerged? -> Add to Active
4. Decisions to log? -> Add to Key Decisions
5. "What This Is" still accurate? -> Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check -- still the right priority?
3. Audit Out of Scope -- reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-31 after Phase 19 complete — v2.1 milestone fully executed*
