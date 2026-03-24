# Roadmap: CodeScope

## Overview

CodeScope is built bottom-up: infrastructure first, then codebase intelligence, then the autonomous pipeline, then the self-correcting quality loop. Each phase delivers a complete, verifiable capability that the next phase depends on. The plugin skeleton and AST/graph infrastructure come first because every subsequent agent and tool needs them. The bootstrap pipeline (Scout, analysis squad, synthesis) comes next because orient cannot work without codebase intelligence. MCP tools wrap the intelligence layer so agents can query it. The orient-execute pipeline is the product's core differentiator. Verification, eval, debug, and learning close the feedback loop that makes CodeScope self-correcting.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Plugin Foundation and Infrastructure** - Plugin skeleton, onboarding, AST parsing, graph schema, and filesystem-first coordination patterns
- [ ] **Phase 2: Scout and Analysis Squad** - Scout maps project structure, analysis agents build codebase intelligence (conventions, graph, danger zones, golden files)
- [ ] **Phase 3: Bootstrap Synthesis and MCP Server** - Monorepo scaling, cross-service synthesis, AI readiness score, and all 11 MCP tools operational
- [ ] **Phase 4: Orient and Execution Engine** - Graph-informed clarification, research, planning, and dual-mode multi-agent execution (sequential sub-agents + agent teams with SendMessage coordination)
- [ ] **Phase 5: Verification** - Static convention compliance, blast radius diff, runtime build/test verification, E2E auto-detection, and auto-smoke generation
- [ ] **Phase 6: Eval, User Gate, and Debug** - LLM-as-judge scoring, interactive finding selection, and self-correcting debug cycles with escalation
- [ ] **Phase 7: Learning System and Settings** - Persistent project memory with decay and contradiction detection, global memory, and management skills

## Phase Details

### Phase 1: Plugin Foundation and Infrastructure
**Goal**: A working Claude Code plugin that installs cleanly, creates its filesystem structure, walks the user through onboarding, and has the AST parsing and graph storage infrastructure ready for bootstrap agents
**Depends on**: Nothing (first phase)
**Requirements**: PLUG-01, PLUG-02, PLUG-03, PLUG-04, ONBD-01, ONBD-02, ONBD-03, ONBD-04, ONBD-05, PARS-01, PARS-02, PARS-03, PARS-04, GRPH-01
**Success Criteria** (what must be TRUE):
  1. Plugin installs via Claude Code plugin system and MCP server starts without errors
  2. Running /codescope:onboard detects the project type, languages, and build commands, then produces a valid config.yml
  3. The .claude/codescope/ directory tree exists with all required subdirectories after first use
  4. web-tree-sitter can parse TypeScript, JavaScript, and Python files with proper memory lifecycle (no leaks after 500+ files)
  5. SQLite graph database is created with nodes, edges, and communities tables and responds to basic queries
**Plans**: 5 plans

Plans:
- [x] 01-01-PLAN.md -- Project scaffolding + plugin skeleton + filesystem utilities
- [x] 01-02-PLAN.md -- Config system (Zod schema, loader, writer) + MCP server with 11 tools
- [x] 01-03-PLAN.md -- AST parsing (web-tree-sitter pool, extraction API) + import resolution (TS/JS, Python)
- [x] 01-04-PLAN.md -- SQLite graph schema (nodes, edges, communities) + JSONL batch writer
- [x] 01-05-PLAN.md -- Onboarding skill (project detection, global memory, full interactive flow)

### Phase 2: Scout and Analysis Squad
**Goal**: The bootstrap pipeline's individual agents work end-to-end: Scout maps project structure, Researcher writes overview, Convention Detector produces conventions with evidence, Risk Analyzer builds the knowledge graph with centrality and communities, and golden files are identified
**Depends on**: Phase 1
**Requirements**: BOOT-01, BOOT-02, BOOT-03, BOOT-04, BOOT-05, BOOT-06, BOOT-07, BOOT-08, BOOT-09, BOOT-10, GRPH-02, GRPH-03, GRPH-04
**Success Criteria** (what must be TRUE):
  1. Running Scout on a real codebase produces a service-manifest.md with services, paths, LOC, and frameworks in under 30 seconds
  2. Researcher produces an overview.md describing structure, frameworks, and entry points
  3. Convention Detector produces conventions.md with adoption percentages, trend directions, golden files, and conflict detection -- with under 5% false positive rate on high-confidence patterns
  4. Risk Analyzer populates the knowledge graph with file/class/function nodes and dependency edges, computes in-degree centrality, runs Louvain community detection, and produces danger-zones.md
  5. BFS blast radius traversal returns hop-distance classifications (Red/Orange/Yellow/Green) for any given node
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md -- Graph builder pipeline + graph analytics (centrality, communities, BFS blast radius)
- [x] 02-02-PLAN.md -- Convention detection (ast-grep rules, runner, adoption calculator, golden files)
- [x] 02-03-PLAN.md -- Scout agent (service-manifest.md) + Researcher agent (overview.md)
- [x] 02-04-PLAN.md -- Risk Analyzer, Convention Detector, and Learning Synthesizer agents

### Phase 3: Bootstrap Synthesis and MCP Server
**Goal**: The /codescope:bootstrap command works end-to-end for both single projects and monorepos, the full analysis pipeline produces all artifacts with an AI readiness score, and all 11 MCP tools are operational with graph queries under 100ms
**Depends on**: Phase 2
**Requirements**: BOOT-11, BOOT-12, BOOT-13, BOOT-14, BOOT-15, BOOT-16, GRPH-05, GRPH-06, MCP-01, MCP-02, MCP-03, MCP-04, MCP-05, MCP-06, MCP-07, MCP-08, MCP-09, MCP-10, MCP-11, MCP-12
**Success Criteria** (what must be TRUE):
  1. Running /codescope:bootstrap on a monorepo spawns per-service analysis squads (with configurable cap) and the Synthesis agent produces a cross-service dependency map with merged conventions
  2. Full bootstrap completes in under 5 minutes for a 100K LOC codebase and produces readiness.md with a transparent rubric
  3. All 11 MCP tools respond correctly when called (codescope_recall through codescope_service_map) with Zod-validated inputs and structured error responses
  4. Graph queries (codescope_graph_query, codescope_blast_radius) respond in under 100ms on graphs with 10K+ nodes
  5. High-confidence conventions can be confirmed to conventions-enforced.md (never auto-promoted)
**Plans**: 5 plans

Plans:
- [x] 03-01-PLAN.md -- Graph cache with TTL, MCP response helpers, bootstrap metadata, codescope_status D-17 update
- [x] 03-02-PLAN.md -- File-reading MCP tools (recall, conventions, readiness, service-map)
- [x] 03-03-PLAN.md -- Graph-querying MCP tools (graph-query, blast-radius, search, detect-changes)
- [x] 03-04-PLAN.md -- Bootstrap orchestrator, synthesis, readiness scoring, incremental re-bootstrap
- [x] 03-05-PLAN.md -- Orient + verify tools, tool registration wiring, MCP server, bootstrap skill body

### Phase 4: Orient and Execution Engine
**Goal**: The /codescope:orient command takes a user task description and autonomously produces a scope contract, researches external context, analyzes graph impact, generates a dependency-ordered execution plan, and spawns agents using hybrid execution — the planner always analyzes the dependency graph and picks agent teams for independent work, sequential for dependent work, and wave-based for mixed workloads, with filesystem coordination as the universal audit trail
**Depends on**: Phase 3
**Requirements**: ONBD-06, ORNT-01, ORNT-02, ORNT-03, ORNT-04, ORNT-05, ORNT-06, ORNT-07, ORNT-08, ORNT-09, ORNT-10, ORNT-11, EXEC-01, EXEC-02, EXEC-03, EXEC-04, EXEC-05, EXEC-06, EXEC-07, EXEC-08, EXEC-09, EXEC-10
**Success Criteria** (what must be TRUE):
  1. Running /codescope:orient with a vague task triggers graph-informed clarification questions and produces a scope contract (In Scope / Out of Scope); specific tasks skip clarification
  2. Research sub-agent produces scoped research output using Context7 and web search, written to the execution directory
  3. Plan sub-agent produces an execution plan with agent assignments, dependency ordering, estimated changes, and hybrid execution strategy (agent teams for independent tasks, sequential for dependent, wave-based for mixed)
  4. Execution agents run per the planner's hybrid analysis: agent teams with SendMessage for independent tasks, sequential sub-agents for dependent tasks, wave-based for mixed; max 3 concurrent agents
  5. Plan validation gate rejects plans where agents in the same team wave write to overlapping files
  6. Orchestrator detects agent teams availability at runtime and falls back to sequential transparently
  7. Orient completes in under 60 seconds after clarification, and the orchestrator stays under 15K tokens throughout execution
**Plans**: 6 plans

Plans:
- [ ] 04-01-PLAN.md -- Orient types + clarification module + analysis module (graph-informed ambiguity, scope contracts)
- [ ] 04-02-PLAN.md -- Execution types + coordination + teams detector + wave scheduler (execution infrastructure)
- [ ] 04-03-PLAN.md -- Config schema D-44 update + agent teams onboarding detection (ONBD-06)
- [ ] 04-04-PLAN.md -- Research module + planner module + plan validation with auto-fix
- [ ] 04-05-PLAN.md -- Agent spawner + execution orchestrator (wave dispatch, failure handling)
- [ ] 04-06-PLAN.md -- Orient pipeline + CLI entry points + orient skill body (full integration)

### Phase 5: Verification
**Goal**: After execution, static and runtime verification agents validate that changes comply with conventions, stay within predicted blast radius, build successfully, pass tests, and work end-to-end
**Depends on**: Phase 4
**Requirements**: VRFY-01, VRFY-02, VRFY-03, VRFY-04, VRFY-05, VRFY-06, VRFY-07, VRFY-08
**Success Criteria** (what must be TRUE):
  1. Static verify agent scans all changed files against conventions-enforced.md using ast-grep and reports violations
  2. Static verify agent compares predicted blast radius (from orient) against actual files changed (git diff) and reports surprises and skips
  3. Runtime verify agent runs the project build command and unit/integration tests, reporting pass/fail with file and line references
  4. Runtime verify agent auto-detects and runs E2E verification (Playwright, Xcode, Gradle, HTTP, or Shell) based on project type
  5. A verify report is written to .claude/codescope/reports/ with all check results, including auto-generated smoke tests for new untested endpoints
**Plans**: TBD

Plans:
- [ ] 05-01: TBD
- [ ] 05-02: TBD

### Phase 6: Eval, User Gate, and Debug
**Goal**: An LLM-as-judge eval agent scores changes on 4 dimensions, the user can interactively triage findings, and a debug agent autonomously fixes issues through targeted re-execution with a 3-cycle limit and design decision escalation
**Depends on**: Phase 5
**Requirements**: EVAL-01, EVAL-02, EVAL-03, EVAL-04, GATE-01, GATE-02, GATE-03, GATE-04, DBUG-01, DBUG-02, DBUG-03, DBUG-04, DBUG-05, DBUG-06, DBUG-07
**Success Criteria** (what must be TRUE):
  1. Eval agent reads scope contract, plan, coordination log, git diff, and verify report, then scores on scope compliance, convention adherence, completeness, and correctness with severity-classified findings citing file and line evidence
  2. In interactive mode, user sees findings and can select which to debug, ignore, or defer to TODO; auto-debug and auto-skip-minor modes work as configured
  3. Debug agent creates targeted fix plans (not full re-orient), re-executes only broken agents, re-verifies only changed files, and re-evals only fixed findings
  4. Debug cycles cap at 3 (configurable) with design decisions escalated to user, and resolution rate exceeds 80% of findings fixed within 3 cycles
  5. User ignore patterns are captured for future eval tuning
**Plans**: TBD

Plans:
- [ ] 06-01: TBD
- [ ] 06-02: TBD
- [ ] 06-03: TBD

### Phase 7: Learning System and Settings
**Goal**: CodeScope accumulates project memory that improves over time -- learnings from completed tasks are captured with confidence decay and contradiction detection, global memory tracks user preferences across projects, and management skills let the user curate and configure everything
**Depends on**: Phase 6
**Requirements**: LRNG-01, LRNG-02, LRNG-03, LRNG-04, LRNG-05, LRNG-06, LRNG-07, LRNG-08, MGMT-01, MGMT-02, MGMT-03
**Success Criteria** (what must be TRUE):
  1. After a completed orient-to-debug pipeline, learnings.md updates with what worked, what failed, and gotchas -- all starting as UNVERIFIED and never auto-promoting to enforced conventions
  2. Running /codescope:review-learnings presents accumulated learnings for the user to confirm, reject, or edit
  3. Confidence decay removes gotchas after 90 days and decisions after 180 days; contradiction detection flags learnings that conflict with existing learnings or actual code
  4. Global memory at ~/.codescope/global-memory.md captures user preferences and cross-project patterns, updated automatically from eval gate behavior
  5. Running /codescope:settings allows interactive configuration changes, and reset commands (--reset, --reset-global, bootstrap --force) work correctly

**Plans**: TBD

Plans:
- [ ] 07-01: TBD
- [ ] 07-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Plugin Foundation and Infrastructure | 5/5 | Complete | - |
| 2. Scout and Analysis Squad | 4/4 | Complete    |  |
| 3. Bootstrap Synthesis and MCP Server | 5/5 | Complete    |  |
| 4. Orient and Execution Engine | 0/6 | Planned | - |
| 5. Verification | 0/2 | Not started | - |
| 6. Eval, User Gate, and Debug | 0/3 | Not started | - |
| 7. Learning System and Settings | 0/2 | Not started | - |
