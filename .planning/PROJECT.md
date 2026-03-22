# CodeScope

## What This Is

CodeScope is a Claude Code plugin that deeply analyzes brownfield codebases once, then autonomously researches, plans, executes, verifies, evaluates, and self-corrects code changes using coordinated sub-agents. The user only steps in twice: to describe what they want, and to approve what gets shipped. It solves the core problem that AI tools write code that doesn't fit into existing systems — every session starts from zero. CodeScope gives AI persistent understanding.

## Core Value

AI-generated code changes that respect existing conventions, stay within safe blast radius, and actually work in the codebase — verified end-to-end before the user sees them.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Plugin skeleton with manifest, skills, hooks, and scripts
- [ ] `/codescope:onboard` — interactive config creation (project detection, agent model selection, workflow preferences)
- [ ] `/codescope:bootstrap` — full autonomous codebase analysis pipeline
  - Scout agent: maps service boundaries, produces service manifest
  - Researcher agent: maps structure, frameworks, entry points → overview.md
  - Convention Detector: ast-grep frequency analysis, trend detection, golden files, conflict detection → conventions.md
  - Risk Analyzer: knowledge graph construction, in-degree centrality, danger zones → danger-zones.md, graph.db
  - Learning Synthesizer: initialize learnings.md
  - Synthesis agent: cross-service dependency map, merged conventions, AI readiness score
  - Squad scaling: 1 squad under 100K LOC, per-service squads above, configurable cap
- [ ] MCP server with 11 tools (codescope_recall, codescope_graph_query, codescope_blast_radius, codescope_conventions, codescope_orient, codescope_verify, codescope_search, codescope_readiness, codescope_status, codescope_detect_changes, codescope_service_map)
- [ ] `/codescope:orient [task]` — full autonomous pipeline trigger
  - Phase A: Graph-informed deep clarification (scope contract: in-scope / out-of-scope)
  - Phase B: Research sub-agent (Context7 + web search)
  - Phase C: Internal analysis (graph traversal, blast radius, convention matching, test mapping)
  - Phase D: Plan sub-agent (execution plan with agent assignments, dependency ordering)
- [ ] Execution engine — sub-agents per concern with filesystem coordination
  - Coordination file (append-only agent communication log)
  - Dependency-ordered and parallel execution (configurable max concurrent agents)
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
- [ ] SQLite knowledge graph (better-sqlite3) with nodes, edges, communities tables
- [ ] web-tree-sitter WASM parsing for TS/JS/Python
- [ ] Import resolution: enhanced-resolve + tsconfig-paths (TS/JS), ast-grep patterns (Python ~80%)
- [ ] Graph analysis: graphology (in-degree centrality, Louvain community detection, BFS blast radius)
- [ ] Persistent file structure under .claude/codescope/ (config.md, overview.md, conventions.md, conventions-enforced.md, danger-zones.md, readiness.md, golden-files.md, learnings.md, graph.db, services/, orient/, plans/, execution/, reports/)

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
*Last updated: 2026-03-22 after initialization*
