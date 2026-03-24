# CodeScope

## What This Is

CodeScope is a Claude Code plugin that deeply analyzes brownfield codebases once, then autonomously researches, plans, executes, verifies, evaluates, and self-corrects code changes using coordinated sub-agents. The user only steps in twice: to describe what they want, and to approve what gets shipped. It solves the core problem that AI tools write code that doesn't fit into existing systems — every session starts from zero. CodeScope gives AI persistent understanding.

## Core Value

AI-generated code changes that respect existing conventions, stay within safe blast radius, and actually work in the codebase — verified end-to-end before the user sees them.

## Requirements

### Validated

- [x] Plugin skeleton with manifest, skills, hooks, and scripts — *Validated in Phase 1: Plugin Foundation and Infrastructure*
- [x] `/codescope:onboard` — interactive config creation (project detection, agent model selection, workflow preferences) — *Validated in Phase 1*
- [x] SQLite knowledge graph (better-sqlite3) with nodes, edges, communities tables — *Validated in Phase 1*
- [x] web-tree-sitter WASM parsing for TS/JS/Python — *Validated in Phase 1*
- [x] Import resolution: enhanced-resolve + tsconfig-paths (TS/JS), filesystem-based (Python ~80%) — *Validated in Phase 1*
- [x] Persistent file structure under .claude/codescope/ — *Validated in Phase 1 (directory tree creation)*
- [x] Graph analysis: graphology (in-degree centrality, Louvain community detection, BFS blast radius) — *Validated in Phase 2: Scout and Analysis Squad*
- [x] Scout agent: service-manifest.md with LOC, frameworks, entry points, CI/CD — *Validated in Phase 2*
- [x] Researcher agent: overview.md covering structure, frameworks, entry points, key directories — *Validated in Phase 2*
- [x] Convention Detector: ast-grep frequency analysis, conflict detection, golden files → conventions.md — *Validated in Phase 2*
- [x] Risk Analyzer: knowledge graph construction, centrality, communities, danger zones → danger-zones.md — *Validated in Phase 2*
- [x] Learning Synthesizer: learnings.md schema initialization — *Validated in Phase 2*
- [x] `/codescope:bootstrap` — full autonomous codebase analysis pipeline with monorepo squad scaling, cross-service synthesis, AI readiness scoring — *Validated in Phase 3: Bootstrap Synthesis and MCP Server*
- [x] MCP server with 11 operational tools (status, recall, graph_query, blast_radius, conventions, orient, verify, search, readiness, detect_changes, service_map) — *Validated in Phase 3*
- [x] Graph cache with 5-min TTL for sub-100ms tool queries — *Validated in Phase 3*
- [x] D-17/D-18/D-19 MCP response contract (ok/error/partial envelopes with staleness metadata) — *Validated in Phase 3*
- [x] AI readiness score (4 dimensions, A-F grades, delta tracking, improvement suggestions) — *Validated in Phase 3*
- [x] Incremental re-bootstrap via git diff with 50% threshold — *Validated in Phase 3*
- [x] Bootstrap --force confirmation (D-30: shows rebuilt vs preserved before proceeding) — *Validated in Phase 3*
- [x] `/codescope:orient [task]` — full orient pipeline with two-gate approval (scope + plan), graph-informed clarification, research sub-agent, hybrid execution engine — *Validated in Phase 4: Orient and Execution Engine*
- [x] Execution engine with wave-based scheduling, agent teams detection, file overlap validation, coordination audit trail, failure retry/skip — *Validated in Phase 4*
- [x] Agent teams onboarding detection (ONBD-06), config D-44 (execute.parallel deprecated) — *Validated in Phase 4*

### Active

- [x] Plugin skeleton with manifest, skills, hooks, and scripts
- [x] `/codescope:onboard` — interactive config creation (project detection, agent model selection, workflow preferences)
- [x] `/codescope:orient [task]` — full autonomous pipeline trigger — *Validated in Phase 4: Orient and Execution Engine*
  - Phase A: Graph-informed deep clarification (scope contract: in-scope / out-of-scope)
  - Phase B: Research sub-agent (Context7 + web search)
  - Phase C: Internal analysis (graph traversal, blast radius, convention matching, test mapping)
  - Phase D: Plan sub-agent (execution plan with agent assignments, dependency ordering)
- [x] Execution engine — hybrid multi-agent execution, planner always picks optimal strategy — *Validated in Phase 4*
  - Planner analyzes dependency graph: agent teams for independent tasks, sequential for dependent, wave-based for mixed
  - Agent teams: parallel agents with SendMessage for real-time handoff signals
  - Sequential: dependency-ordered sub-agents with filesystem coordination
  - Coordination file (append-only audit trail in all modes)
  - Plan validation gate: no overlapping file writes within a team wave
  - Runtime fallback: agent teams → sequential if feature unavailable
  - No user-facing execution mode config — planner always does the right thing
  - Each agent gets scope contract, conventions, golden files, coordination context
- [ ] Static verify agent — convention compliance (ast-grep), blast radius diff, code review
- [ ] Runtime verify agent — build verification, unit/integration tests, E2E (Playwright/Xcode/Gradle auto-detection), auto-smoke generation
- [ ] Eval agent — LLM-as-judge scoring scope compliance, convention adherence, completeness, correctness
- [ ] User gate — interactive finding selection (debug selected / ignore all / defer to TODO)
- [ ] Auto-debug and auto-skip-minor modes
- [ ] Debug agent — targeted fix plans, re-execute, re-verify, re-eval (max 3 cycles), design decision escalation
- [ ] Learning system — project memory (learnings.md, max 50, UNVERIFIED default, confidence decay, contradiction detection) + global memory (~/.codescope/global-memory.md)
- [ ] `/codescope:review-learnings` — review and confirm/reject accumulated learnings
- [ ] `/codescope:settings` — interactive configuration changes
- [x] SQLite knowledge graph (better-sqlite3) with nodes, edges, communities tables
- [x] web-tree-sitter WASM parsing for TS/JS/Python
- [x] Import resolution: enhanced-resolve + tsconfig-paths (TS/JS), filesystem-based (Python ~80%)
- [x] Graph analysis: graphology (in-degree centrality, Louvain community detection, BFS blast radius)
- [x] Persistent file structure under .claude/codescope/ (directory tree creation, .gitignore management)

### Out of Scope

- Visual map (sigma + @react-sigma/core) — V2, requires additional research
- MCP Apps (inline visual rendering) — V2
- Semantic search (@lancedb/lancedb + Ollama) — V2
- Cross-project learning / pattern library — V2
- ADR auto-generation — V2
- CI/CD integration (GitHub Actions hooks) — V2
- Cross-service HTTP linking (route detection + HTTP call matching) — V2
- Convention drift monitoring — V2
- Automated comparison testing harness — manual testing across terminals is sufficient for v1
- OAuth/social login in onboarding — not applicable
- Mobile app — not applicable

## Context

- **Problem space:** GitClear's 211M-line analysis found AI-assisted code churn doubled while refactoring collapsed. METR RCT showed experienced devs 19% slower with AI in their own repos. Root cause: no persistent codebase understanding.
- **Competitive landscape:** codebase-context (convention detection, trends, golden files), codebase-memory-mcp (SQLite graph, Louvain, blast radius, detect_changes), Understand Anything (5-agent architecture), Anthropic's feature-dev plugin (official plugin patterns). CodeScope combines the best of these with a full autonomous pipeline nobody else has.
- **Architecture philosophy:** Thin orchestrator (<15K tokens), all heavy work in isolated sub-agent 200K-token contexts, filesystem coordination (not return values — Issue #5812), no agent nesting. State lives on disk, not in context.
- **Known platform constraints:** `context: fork` silently ignored on auto-invoked skills (Issue #17283) — use Task tool delegation. Sub-agents cannot return file contents to parent (Issue #5812). web-tree-sitter has memory leaks — periodic parser.delete() and recreate.
- **Build tooling:** ast-grep CLI for structural pattern matching, web-tree-sitter WASM for AST parsing, better-sqlite3 for graph storage, graphology for graph analysis, enhanced-resolve for TS/JS import resolution.
- **Reference spec:** CODESCOPE-SPEC-V6.md contains the full product specification with detailed examples, schemas, and gate tests.
- **Build instructions:** CODESCOPE-BUILD-INSTRUCTIONS.md contains environment setup, tooling installation, competitor study guide, and common problems.

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
| Thin orchestrator pattern | Main context stays under 15K tokens — compaction either never triggers or doesn't matter because all state is on disk | — Pending |
| Filesystem coordination over return values | Issue #5812: sub-agents can't return file contents. Append-only coordination.md pattern. | — Pending |
| Hybrid execution (planner-driven, no user config) | Planner always analyzes dependency graph and picks optimal execution: agent teams for independent tasks, sequential for dependent, wave-based for mixed. No user-facing mode setting — planner always does the right thing. Onboarding guides enabling agent teams env var. | — Decided 2026-03-23 |
| Task tool delegation over context: fork | Issue #17283: context: fork silently ignored on auto-invoked skills | — Pending |
| web-tree-sitter WASM over node-tree-sitter | node-tree-sitter is broken with no maintainer. web-tree-sitter is what Claude Code uses internally. | — Pending |
| ast-grep for convention detection | Structural pattern matching by syntax, not text. Supports 27 languages. Zero compilation required. | — Pending |
| Suggestion-only conventions in v1 | Never block — build trust first. User can dismiss/correct. <5% false positive target for high-confidence. | — Pending |
| UNVERIFIED default for learnings | Prevents codifying LLM mistakes. Requires human confirmation via review command. Contradiction detection against actual code. | — Pending |
| Skip automated comparison testing | Manual side-by-side testing across terminals sufficient for v1. Automated harness is v2. | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-23 — Phase 4 complete: orient pipeline (clarification, research, analysis, planning, validation), execution engine (wave scheduling, agent spawning, coordination, failure handling), 556 tests passing*
