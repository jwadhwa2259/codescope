# CodeScope

## Current State

**Version:** v1.0 MVP shipped 2026-03-27 | v2.0 Phase 11 complete 2026-03-28
**Codebase:** 21,742 LOC TypeScript (source) + 20,759 LOC TypeScript (tests, 917 passing)
**Stack:** TypeScript, web-tree-sitter WASM, ast-grep CLI, better-sqlite3, graphology, enhanced-resolve, @modelcontextprotocol/sdk, vitest

## What This Is

CodeScope is a Claude Code plugin that deeply analyzes brownfield codebases once, then autonomously researches, plans, executes, verifies, evaluates, and self-corrects code changes using coordinated sub-agents. The user only steps in twice: to describe what they want, and to approve what gets shipped. It solves the core problem that AI tools write code that doesn't fit into existing systems — every session starts from zero. CodeScope gives AI persistent understanding.

## Core Value

AI-generated code changes that respect existing conventions, stay within safe blast radius, and actually work in the codebase — verified end-to-end before the user sees them.

## Requirements

### Validated

- Plugin skeleton with manifest, skills, hooks, and scripts — v1.0
- `/codescope:onboard` — interactive config creation (project detection, agent model selection, workflow preferences) — v1.0
- SQLite knowledge graph (better-sqlite3) with nodes, edges, communities tables — v1.0
- web-tree-sitter WASM parsing for TS/JS/Python — v1.0
- Import resolution: enhanced-resolve + tsconfig-paths (TS/JS), filesystem-based (Python ~80%) — v1.0
- Persistent file structure under .claude/codescope/ — v1.0
- Graph analysis: graphology (in-degree centrality, Louvain community detection, BFS blast radius) — v1.0
- Scout agent: service-manifest.md with LOC, frameworks, entry points, CI/CD — v1.0
- Researcher agent: overview.md covering structure, frameworks, entry points, key directories — v1.0
- Convention Detector: ast-grep frequency analysis, conflict detection, golden files — v1.0
- Risk Analyzer: knowledge graph construction, centrality, communities, danger zones — v1.0
- Learning Synthesizer: learnings.md schema initialization — v1.0
- `/codescope:bootstrap` — full autonomous codebase analysis pipeline with monorepo squad scaling, cross-service synthesis, AI readiness scoring — v1.0
- MCP server with 12 operational tools — v1.0 (13 tools after Phase 9, 15 tools after Phase 11: codescope_predict_impact + codescope_review added)
- Graph cache with 5-min TTL for sub-100ms tool queries — v1.0 (async staleness-aware cache after Phase 9)
- MCP response contract (ok/error/partial envelopes with staleness metadata) — v1.0
- Auto-injection artifact pipeline (danger-zones, conventions, blast-radius JSON indexes) — Phase 10
- PreToolUse/PostToolUse hooks with 500-token budget composer for invisible context injection — Phase 10
- AI readiness score (4 dimensions, A-F grades, delta tracking) — v1.0
- Incremental re-bootstrap via git diff with 50% threshold — v1.0
- Bootstrap --force confirmation — v1.0
- `/codescope:orient [task]` — full orient pipeline with graph-informed clarification, research, hybrid execution — v1.0
- Execution engine with wave-based scheduling, agent teams detection, file overlap validation — v1.0
- Agent teams onboarding detection — v1.0
- Static verify agent — convention compliance, blast radius diff, code review — v1.0
- Runtime verify agent — build, tests, E2E auto-detection, auto-smoke generation — v1.0
- Eval agent — LLM-as-judge 4-criteria scoring — v1.0
- User gate — interactive finding selection (3 modes) — v1.0
- Debug agent — targeted fix plans, max 3 cycles, design decision escalation — v1.0
- Learning system — project memory with decay, contradiction detection, global memory — v1.0
- `/codescope:review-learnings` — review and confirm/reject learnings — v1.0
- `/codescope:settings` — interactive configuration — v1.0
- `codescope_predict_impact` — reverse blast radius impact prediction with centrality-based risk — Phase 11
- `codescope_review` — structural impact analysis for PRs/diffs (risk scores, dependency changes, cycle detection, convention compliance, cross-community flagging) — Phase 11
- `/codescope:review` — user-facing review skill formatting review tool output as markdown — Phase 11
- Verify-to-eval JSON sidecar pipeline — v1.0
- Type consolidation (no local type copies or unsafe casts) — v1.0

### Active

(Defined in REQUIREMENTS.md for v2.0)

### Out of Scope

- Semantic search (@lancedb/lancedb + Ollama) — V3, structural + text covers 90% of use cases
- Cross-project learning / pattern library — V3
- ADR auto-generation — V3
- CI/CD integration (GitHub Actions hooks) — V3, different deployment/reliability model
- Cross-service HTTP linking (route detection + HTTP call matching) — V3
- Greenfield/ideation features (SEED-like) — Greenfield planning is saturated (25+ tools); CodeScope's moat is brownfield intelligence
- Session management/restore — 6+ tools in ecosystem do this; not core value
- IDE extensions — Let community build on MCP tools
- Usage/cost monitoring — Commodity; 6 tools already exist
- Own orchestrator/workflow engine — 11+ exist; would compete with potential consumers of the intelligence layer

## Current Milestone: v2.0 Intelligence Layer + Interactive Dashboard

**Goal:** Transform CodeScope from a one-time analysis tool into an always-on intelligence layer with auto-injection, graph-aware PR review, interactive visualization, and self-improving pipeline — ready for npx distribution and marketplace launch.

**Target features:**
- On-demand incremental graph updates (always-fresh intelligence)
- Auto-injection hooks (PreToolUse/PostToolUse — invisible codebase context on every edit)
- Pipeline evolution: per-task qualification, diagnostic failure routing, plan-vs-actual reconciliation, context budget awareness
- Session continuity with pause/resume skills and handoff documents
- Graph-aware PR review (structural impact analysis)
- Change impact prediction (pre-change blast radius)
- Convention enforcement hooks (opt-in pre-commit blocking)
- Full interactive visualization dashboard (sigma.js graph, convention heatmap, readiness trends, blast radius explorer, command center)
- Technical debt tracking (readiness history + trends)
- `npx codescope` install experience for marketplace readiness

## Context

- **Problem space:** GitClear's 211M-line analysis found AI-assisted code churn doubled while refactoring collapsed. METR RCT showed experienced devs 19% slower with AI in their own repos. Root cause: no persistent codebase understanding.
- **Competitive landscape:** codebase-context (convention detection, trends, golden files), codebase-memory-mcp (SQLite graph, Louvain, blast radius, detect_changes), Understand Anything (5-agent architecture), Anthropic's feature-dev plugin (official plugin patterns). CodeScope combines the best of these with a full autonomous pipeline nobody else has.
- **Architecture philosophy:** Thin orchestrator (<15K tokens), all heavy work in isolated sub-agent 200K-token contexts, filesystem coordination (not return values — Issue #5812), no agent nesting. State lives on disk, not in context.
- **Known platform constraints:** `context: fork` silently ignored on auto-invoked skills (Issue #17283) — use Task tool delegation. Sub-agents cannot return file contents to parent (Issue #5812). web-tree-sitter has memory leaks — periodic parser.delete() and recreate.
- **Build tooling:** ast-grep CLI for structural pattern matching, web-tree-sitter WASM for AST parsing, better-sqlite3 for graph storage, graphology for graph analysis, enhanced-resolve for TS/JS import resolution.
- **v1.0 shipped:** 8 phases, 34 plans, 65 tasks, 241 commits over 5 days. 103/103 requirements complete. 865 tests passing. Full pipeline: onboard → bootstrap → orient → execute → verify → eval → gate → debug → learn.
- **Known tech debt (INFO):** Readiness input approximates typedFiles/testFiles from LOC ratios. DBUG-07 (>80% debug resolution) needs runtime validation with real tasks. ~48/103 requirements have SUMMARY frontmatter metadata gaps (all verified in VERIFICATION.md).

## Constraints

- **Tech stack**: TypeScript (same as Claude Code ecosystem), web-tree-sitter WASM (not node-tree-sitter — broken, no maintainer), ast-grep CLI, better-sqlite3, graphology, enhanced-resolve, @modelcontextprotocol/sdk, vitest
- **Performance**: Bootstrap <5 min for 100K LOC, orient <60s after clarification, graph queries <100ms, plugin startup <5K tokens, orchestrator <15K tokens
- **Quality**: Convention false positive rate <5% (high-confidence), eval finding accuracy >70%, debug resolution >80% within 3 cycles
- **Language support**: TypeScript/JavaScript + Python for v1. TS/JS import resolution 95-99% accuracy, Python ~80%
- **Rate limits**: Max 3 concurrent agents (configurable), sequential spawning default on Pro plans
- **Learning bounds**: Max 50 active learnings (~4K tokens), gotcha decay 90 days, decision decay 180 days, never auto-promote to enforced conventions

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Thin orchestrator pattern | Main context stays under 15K tokens — compaction either never triggers or doesn't matter because all state is on disk | Good — all orchestrators stay within budget |
| Filesystem coordination over return values | Issue #5812: sub-agents can't return file contents. Append-only coordination.md pattern. | Good — reliable across all execution modes |
| Hybrid execution (planner-driven, no user config) | Planner always analyzes dependency graph and picks optimal execution. No user-facing mode setting. | Good — simplified UX, correct mode selection |
| Task tool delegation over context: fork | Issue #17283: context: fork silently ignored on auto-invoked skills | Good — workaround is stable |
| web-tree-sitter WASM over node-tree-sitter | node-tree-sitter is broken with no maintainer. web-tree-sitter is what Claude Code uses internally. | Good — 0.25.10 pin avoids ABI breaks |
| ast-grep for convention detection | Structural pattern matching by syntax, not text. Supports 27 languages. Zero compilation required. | Good — 0% false positive on fixtures |
| Suggestion-only conventions in v1 | Never block — build trust first. User can dismiss/correct. <5% false positive target. | Good — builds user trust |
| UNVERIFIED default for learnings | Prevents codifying LLM mistakes. Requires human confirmation. Contradiction detection against actual code. | Good — safe learning accumulation |
| Skip automated comparison testing | Manual side-by-side testing across terminals sufficient for v1. | Good — testing was adequate |
| ESM-first with NodeNext module resolution | Claude Code ecosystem is TypeScript/ESM. Consistent with plugin conventions. | Good — established in Phase 1 |
| Two-pass batch insert for graph edges | Nodes first across all files, then edges resolved, for cross-file edge resolution correctness. | Good — handles cross-file deps |
| Agent module pattern (Options + Result + async fn + artifact) | Consistent interface across all agent modules from Phase 2 onward. | Good — pattern reused in 10+ modules |
| JSON sidecar for verify-to-eval pipeline | Structured data transfer between verify and eval stages instead of markdown parsing. | Good — clean data flow |

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
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-28 after Phase 10 (auto-injection) complete*
