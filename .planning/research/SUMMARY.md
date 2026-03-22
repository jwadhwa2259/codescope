# Project Research Summary

**Project:** CodeScope — Claude Code Plugin with Codebase Intelligence & Autonomous Code Change Pipeline
**Domain:** Claude Code plugin, MCP server, multi-agent orchestration, knowledge graph
**Researched:** 2026-03-22
**Confidence:** HIGH

## Executive Summary

CodeScope is a Claude Code plugin that solves a fundamental problem with AI coding agents: they have no persistent understanding of the codebase they are changing. Every session starts from zero, conventions are unknown, blast radius is unquantified, and there is no institutional memory. The research confirms this is a genuine gap — no existing tool combines persistent codebase intelligence (graph, conventions, memory) with an autonomous orient-to-ship pipeline (clarify, research, plan, execute, verify, eval, debug). The closest competitors each own one dimension: codebase-context owns convention detection, codebase-memory-mcp owns knowledge graphs, feature-dev owns structured workflow pipelines — but nobody has integrated all three with a self-correcting eval and debug loop.

The recommended approach is a Claude Code-native plugin using the platform's skill, agent, and MCP conventions directly. The MCP server (TypeScript, @modelcontextprotocol/sdk v1.x) provides stateful codebase intelligence via 11 tools. The orchestrator layer (SKILL.md bodies, <15K tokens) delegates all heavy work to sub-agents via the Task tool, with all inter-agent communication going through the filesystem rather than through context return values. The storage layer uses better-sqlite3 for the knowledge graph (synchronous API critical for MCP handlers) and web-tree-sitter WASM for AST parsing. This is a bottom-up build: infrastructure first, bootstrap pipeline second, orient-to-debug pipeline third.

The top risks are platform-level constraints that must be addressed in Phase 1: sub-agents cannot return file contents to the parent (Issue #5812, closed as NOT_PLANNED), context:fork is silently ignored on auto-invoked skills (Issue #17283), and sub-agent Write tool operations can fail silently (Issue #9458). All three require the same solution — filesystem-first coordination from day one. Secondary risks include web-tree-sitter WASM memory leaks, SQLite concurrent write contention from multiple agents, and LLM-as-judge scoring inconsistency. None of these are showstoppers; all have clear prevention strategies documented in research.

## Key Findings

### Recommended Stack

The stack is entirely TypeScript on Node.js 22.x, tightly constrained by the Claude Code ecosystem. The MCP SDK (@modelcontextprotocol/sdk@^1.27.1) is the mandatory interface layer — v2 is pre-alpha and must not be used yet. Graph storage uses better-sqlite3@^12.8.0 for its synchronous API (critical: MCP tool handlers are synchronous and cannot wait on async SQLite). In-memory graph analysis uses graphology@^0.26.0 with its standard library (Louvain community detection, BFS traversal, centrality metrics). AST parsing uses web-tree-sitter@^0.25.10 — pinned to 0.25.x explicitly because 0.26.x breaks WASM ABI compatibility with grammar files. Structural pattern matching uses @ast-grep/cli@^0.40.5 (CLI for batch bootstrap, optional @ast-grep/napi for hot paths). Import resolution uses enhanced-resolve@^5.20.1 + tsconfig-paths@^4.2.0. Build tooling is tsdown@^0.20.3 (tsup's successor, Rolldown-powered) with vitest@^4.1.0 for tests.

**Core technologies:**
- `@modelcontextprotocol/sdk@^1.27.1`: MCP server framework — only stable production version; v2 is pre-alpha
- `better-sqlite3@^12.8.0`: Knowledge graph storage — synchronous API is a feature, not a limitation, for MCP handlers targeting <100ms
- `web-tree-sitter@^0.25.10`: AST parsing via WASM — pinned to 0.25.x; 0.26.x has confirmed ABI break (issue #5171)
- `graphology@^0.26.0` + ecosystem: In-memory graph analysis — Louvain, BFS, centrality all via standard library
- `@ast-grep/cli@^0.40.5`: Structural convention detection — 27 language support, pattern syntax is isomorphic to code
- `enhanced-resolve@^5.20.1` + `tsconfig-paths@^4.2.0`: TypeScript/JS import resolution — handles path aliases, monorepo tsconfigs
- `zod@^3.25` (import from `zod/v4`): Schema validation — required peer dependency of MCP SDK
- `tsdown@^0.20.3`: Build — tsup successor, Rolldown-powered, ESM-first
- `vitest@^4.1.0`: Testing — native TypeScript, ESM-first, replaces Jest

**Critical version constraints:**
- web-tree-sitter and tree-sitter-cli MUST match ABI version (pin both to 0.25.x)
- WASM grammar files must be built from source with matching tree-sitter-cli, not from pre-built packages
- @modelcontextprotocol/sdk v2.x is NOT production-ready; stay on v1.x until v2 stabilizes

### Expected Features

The research produced a clear three-tier feature model across FEATURES.md.

**Must have (table stakes — launch blockers):**
- Codebase structure analysis (tree-sitter parsing) — expected by every user
- Dependency/import graph — required by blast radius and convention analysis
- Convention detection with adoption percentages — the codebase-context benchmark to match
- Golden file identification — exemplars for AI agents writing new code
- Knowledge graph (SQLite + graphology) — persistent cross-session intelligence
- Blast radius/impact analysis — BFS from changed nodes with risk classification
- Danger zone mapping — persistent danger-zones.md consulted before high-risk changes
- MCP server with 11 tools — MCP is table stakes in 2026
- Project memory (learnings.md) — the core problem CodeScope solves
- /codescope:onboard — interactive setup, nobody reads docs
- /codescope:bootstrap — the full analysis pipeline
- /codescope:orient — the full autonomous pipeline (clarify -> research -> plan -> execute -> verify -> eval -> debug)
- Multi-agent execution engine — parallel agents with filesystem coordination
- Static verify agent — convention compliance + blast radius diff
- Runtime verify agent — build, unit tests, integration tests
- Eval agent (LLM-as-judge) — 4-dimension scoring before user sees results
- User gate — interactive finding selection
- Debug agent — max 3 cycles with escalation

**Should have (differentiators to build next):**
- /codescope:review-learnings — curation workflow for accumulated learnings
- /codescope:settings — interactive config without manual file editing
- Global memory (~/.codescope/global-memory.md) — cross-project personal preferences
- Squad scaling (per-service squads above 100K LOC)
- Auto-smoke test generation for untested codebases
- Convention trend analysis (rising/declining over time)

**Defer (v2+):**
- Visual knowledge graph dashboard (sigma + React Flow) — impressive in demos, rarely used daily
- Semantic/vector search (@lancedb + Ollama) — structural search covers 90% of v1 needs
- CI/CD integration (GitHub Actions hooks) — different deployment model
- Cross-project learning / pattern library — conflation risk without curation
- ADR auto-generation — learnings.md is the v1 alternative
- Additional languages beyond TS/JS/Python — import resolution quality varies too much

**Deliberate anti-features:**
- No real-time continuous re-indexing (WASM memory leak risk, no tool has nailed incremental real-time updates)
- No blocking convention enforcement (suggestion-only; blocking on probabilistic analysis destroys trust)
- No all-language support on launch day (honest accuracy matters more than breadth)

### Architecture Approach

The architecture is a strict 5-layer system: Plugin Entry (SKILL.md slash commands) -> Orchestrator (thin routing, <15K tokens) -> Sub-Agents (isolated 200K-token contexts, all heavy work) -> Filesystem Coordination (.claude/codescope/ as communication bus and state store) -> MCP Server (stateful TypeScript process, stdio transport, owns SQLite + graphology + WASM parser pool). The defining constraint is that the orchestrator never does computation and never relies on agent return values — all state flows through well-known filesystem paths. This solves the three critical platform constraints (Issues #5812, #17283, #9458) at the architectural level. The MCP server's layered internal structure (Tool Handlers -> Services -> Database) ensures testability and prevents tight coupling between the 11 tools and the storage layer.

**Major components:**
1. **Plugin Entry Layer** — SKILL.md files at `skills/*/SKILL.md`; user-facing slash commands that bootstrap the orchestrator
2. **Orchestrator** — Inline logic in SKILL.md bodies; reads disk state, spawns agents via Task tool, reads results from disk; stays under 15K tokens by never inlining data
3. **Sub-Agents** — `agents/*.md` definitions with YAML frontmatter (model, tools, permissions); Scout/Researcher on Haiku, others inherited; cannot nest; cannot return file contents to parent
4. **Filesystem Coordination** — `.claude/codescope/` tree; append-only coordination.md during execution; pipeline-state.json for orchestrator state persistence; per-agent output files at well-known paths
5. **MCP Server** — Long-running TypeScript process (stdio); owns better-sqlite3, graphology, web-tree-sitter, enhanced-resolve; exposes 11 tools; single writer for graph.db preventing SQLITE_BUSY
6. **Storage Layer** — `graph.db` (nodes, edges, communities) via better-sqlite3 + WAL mode; markdown artifacts (overview.md, conventions.md, danger-zones.md, learnings.md) for human-readable state

**Architectural build order (dependency layers):**
- Layer 0: Plugin skeleton, database schema, type definitions (no dependencies)
- Layer 1: AST Parser Service, Import Resolver Service, MCP Server shell
- Layer 2: Graph Service, Convention Service, Config Service
- Layer 3: All 11 MCP tools, Onboard skill, Scout + Researcher agents
- Layer 4: Convention Detector, Risk Analyzer, Learning Synthesizer, Bootstrap skill
- Layer 5: Orient clarify, Research agent, Planner agent, Executor agents
- Layer 6: Static Verify, Runtime Verify, Synthesis agent
- Layer 7: Eval agent, User Gate, Debug agent, Settings skill, Review-Learnings skill

### Critical Pitfalls

The top pitfalls are architectural, not implementation details. Getting these wrong requires rewrites, not patches.

1. **Sub-Agent File Content Blindness (Issue #5812, NOT_PLANNED)** — Sub-agents write files but parent agents have zero knowledge of contents, only completion. Prevention: filesystem coordination exclusively; every output to well-known path; orchestrator reads files directly after task completion; never rely on return values for file data.

2. **context:fork Silently Ignored (Issue #17283)** — `context: fork` in SKILL.md frontmatter is ignored when skills are auto-invoked, so exploration-heavy skills pollute main context. Prevention: never rely on context:fork; have skills explicitly delegate to sub-agents via Task tool from within their body; skills are thin dispatchers, not executors.

3. **Sub-Agent Write Operations Silently Failing (Issue #9458)** — Sub-agents report successful Write tool calls but files do not persist to filesystem. Prevention: use Bash tool `cat <<'EOF' > file.txt` as fallback; orchestrator verifies file existence after every sub-agent completes; test Write persistence in sub-agents in Phase 1 prototype.

4. **SQLite Concurrent Write Contention** — Multiple agents attempting simultaneous writes to graph.db produce SQLITE_BUSY errors or corrupted data. Prevention: designate a single writer process; sub-agents write graph data to per-agent JSONL files; orchestrator or Graph Builder agent batch-inserts sequentially; set `PRAGMA busy_timeout = 5000` as safety net.

5. **web-tree-sitter WASM Memory Leaks** — WASM operates outside JavaScript GC; `tree.delete()` must be called after every parse; parser must be recreated periodically (every ~500 files). Prevention: strict resource lifecycle with try/finally; monitor WASM heap; consider worker thread isolation for long bootstrap sessions.

6. **LLM-as-Judge Scoring Inconsistency** — Eval agent produces hallucinated findings, unstable scores, and unverifiable references. Prevention: binary or 3-point scale (not 1-10); chain-of-thought before score; every finding must cite verifiable file + line evidence; split evaluation by dimension; low temperature; validate against golden dataset before production use.

7. **Orchestrator Context Exhaustion** — Even a thin orchestrator accumulates context through coordination reads, status checks, and error handling; compaction loses pipeline state. Prevention: persist ALL orchestrator state to disk (pipeline-state.json); reconstruct state from disk if compaction occurs; keep orchestrator prompts under 5K tokens by referencing paths, not inlining content.

## Implications for Roadmap

Based on the architectural build-order dependency layers and the feature prioritization matrix, the research strongly suggests a 5-phase roadmap that builds bottom-up.

### Phase 1: Foundation — Plugin Skeleton + MCP Infrastructure

**Rationale:** Layers 0-2 must exist before any other component can function. This phase establishes the filesystem-first coordination pattern, validates the three platform constraints (Issues #5812, #17283, #9458) with a working prototype, and builds the MCP server infrastructure that all subsequent phases depend on. Getting the orchestrator state persistence and sub-agent coordination patterns right here prevents rewrites later. This phase has the highest architectural risk and must be done first.

**Delivers:** Working plugin that loads in Claude Code, MCP server responding to tool calls, database schema with indexes, AST parser with WASM memory lifecycle management, import resolver with path alias support, onboarding skill (/codescope:onboard), validated sub-agent write patterns.

**Addresses features:** Plugin skeleton, interactive onboarding, MCP server shell, database foundation.

**Must avoid:** Fat orchestrator anti-pattern, relying on context:fork, missing tree.delete() in parser loops, shared mutable state between agents.

**Needs research during planning:** MCP Inspector debugging workflow, sub-agent frontmatter validation, exact plugin.json manifest schema.

### Phase 2: Codebase Intelligence — AST Parsing + Convention Detection + Graph Construction

**Rationale:** Layer 1-2 services translate to the full bootstrap analysis pipeline. Convention detection (ast-grep frequency analysis), import graph construction (enhanced-resolve), and knowledge graph building (graphology + SQLite) are the core intelligence layer. These are complex, have clear pitfalls (WASM ABI mismatch, SQLite write contention, convention false positives), and are prerequisites for all downstream features. This phase delivers the persistent codebase understanding that CodeScope promises.

**Delivers:** /codescope:bootstrap skill, Scout + Researcher + Convention Detector + Risk Analyzer agents, conventions.md, golden-files.md, danger-zones.md, graph.db with full symbol graph, community detection, danger zone classification, learnings.md initialization, AI readiness score.

**Uses:** web-tree-sitter@^0.25.10 + tree-sitter-cli@^0.25.x (pinned together), @ast-grep/cli for convention detection, graphology-communities-louvain for Louvain detection, enhanced-resolve + tsconfig-paths for import resolution.

**Must avoid:** WASM version mismatch (grammar WASM must be built with matching tree-sitter-cli), parser memory leaks (tree.delete() in every loop), SQLite concurrent writes (single-writer pattern via JSONL batch insert), convention false positives (frequency threshold: >60% adoption, >5 file sample), Louvain communities without tuning resolution parameter.

**Needs research during planning:** Convention detection frequency thresholds, ast-grep rule YAML syntax for the target languages, graphology Louvain resolution parameter tuning.

### Phase 3: MCP Tool Surface — All 11 Tools Operational

**Rationale:** With services built, wrapping them in MCP tool handlers is the prerequisite for agents using graph intelligence during execution. This phase is relatively straightforward (Layer 3: thin wrappers around Layer 2 services) but must be complete before the orient pipeline can use graph data. Completing this phase also provides the first integration test of the full stack.

**Delivers:** All 11 MCP tools operational (codescope_recall, codescope_graph_query, codescope_blast_radius, codescope_conventions, codescope_orient, codescope_verify, codescope_search, codescope_readiness, codescope_status, codescope_detect_changes, codescope_service_map). Tool input validation via Zod schemas. Structured error responses (isError: true with human-readable messages, no stack traces). Graph query performance under 100ms on 10K+ node graphs (requires SQLite indexes).

**Avoids:** MCP tools returning raw error objects, tools returning full file contents (return summaries + paths only), missing Zod input validation, unindexed graph queries.

**Standard patterns:** MCP tool registration follows @modelcontextprotocol/sdk documented patterns — skip deep research-phase for this phase.

### Phase 4: Orient Pipeline — Research, Plan, Execute, Verify

**Rationale:** Layers 5-6, the orient pipeline is the product's core differentiator. It depends on all previous phases. The pipeline phases (Clarify -> Research -> Analyze -> Plan -> Execute -> Verify) must be built and integrated as a unit because they form a DAG with validation gates between every stage. This is the highest complexity phase — multi-agent coordination, filesystem IPC, blast radius-informed planning, parallel execution with dependency ordering. Validation gates between stages are not optional; they prevent the 17x error amplification trap.

**Delivers:** /codescope:orient skill, graph-informed clarification (Phase A with scope contract), Research agent (Context7 + web search), Planner agent (dependency-ordered execution plan), Executor agents (parallel where safe, sequential where overlapping), Static Verify agent (convention compliance, blast radius diff), Runtime Verify agent (build + tests + E2E auto-detection). Append-only coordination.md for execution audit trail. Pipeline-state.json for compaction recovery.

**Must avoid:** Missing validation gates between pipeline stages, agent nesting (sub-agents cannot spawn sub-agents), parallel agents writing to the same files (dependency ordering from plan prevents this), rate limit exhaustion from concurrent agents (default to 3 max concurrent, sequential on Pro plans), orchestrator context exceeding 100K tokens (pipeline-state.json recovery).

**Needs research during planning:** Execution plan schema design (how to express agent dependencies), rate limit detection and backoff strategy, test auto-detection heuristics for Runtime Verify.

### Phase 5: Quality Loop — Eval Agent, User Gate, Debug Agent + Learning Capture

**Rationale:** Layer 7 closes the feedback loop. The Eval agent (LLM-as-judge), User Gate (interactive finding selection), and Debug agent (max 3 cycles, escalation) are what separate CodeScope from "another code intelligence tool that stops at execution." This phase also adds the persistent learning system (confidence decay, contradiction detection, UNVERIFIED default) that makes the project memory meaningful over time. The eval agent must be calibrated against a golden dataset before user-facing release — building it in binary scoring mode first is non-negotiable.

**Delivers:** Eval agent with 4-dimension scoring (scope compliance, convention adherence, completeness, correctness) using binary/3-point scale + chain-of-thought + cited evidence. User gate with auto-skip-minor mode. Debug agent with 3-cycle max + design decision escalation. Learning capture post-completion (decision type, gotcha type with 90d/180d decay, UNVERIFIED default, max 50 active learnings, contradiction detection). /codescope:review-learnings skill.

**Must avoid:** 1-10 scoring scale (high variance, inconsistent), eval findings without verifiable evidence citations, debug cycles without cycle limit, learning accumulation without decay and contradiction detection.

**Needs research during planning:** Eval agent golden dataset creation strategy, binary scoring rubric calibration, debug agent fix plan structure.

### Phase Ordering Rationale

- **Bottom-up dependency chain:** Every phase directly depends on all prior phases. There is no reordering opportunity — the ARCHITECTURE.md build-order layers dictate the sequence.
- **Platform constraint validation early:** The three Claude Code platform constraints (Issues #5812, #17283, #9458) must be validated in Phase 1. Discovering them in Phase 4 would require architectural rewrites.
- **Bootstrap before orient:** The orient pipeline reads bootstrap artifacts (conventions.md, danger-zones.md, graph.db). Bootstrap must be complete and tested before orient is built.
- **Tools before pipeline:** Agents in the orient pipeline call MCP tools. All 11 tools must be operational before the orient pipeline agents can be built.
- **Eval last:** The eval agent scores the output of execution and verification. It cannot be built or tested meaningfully until execution and verification are working.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 1:** Sub-agent frontmatter validation (exact schema for model, tools, permissionMode fields). MCP Inspector workflow for debugging tool call responses. Plugin manifest exact format (hooks placement in hooks/hooks.json, NOT plugin.json).
- **Phase 2:** Optimal ast-grep rule YAML structure for convention frequency detection. Graphology Louvain resolution parameter values for typical software module structures (default may produce poor communities). Incremental re-parse strategy (mtime + content hash comparison).
- **Phase 4:** Execution plan schema — how to express parallelism and dependency constraints in a file that agents can parse. Context7 integration for Research agent (exact tool call patterns). Rate limit detection and exponential backoff for multi-agent execution.
- **Phase 5:** Eval agent calibration strategy — what constitutes a golden dataset for a code intelligence eval agent. Evidence citation format (how to structure "cite the file and line" requirement in the eval prompt).

Phases with standard/well-documented patterns (can skip research-phase or abbreviate):
- **Phase 3 (MCP Tools):** @modelcontextprotocol/sdk tool registration, Zod schema validation, and error response format are thoroughly documented. Standard patterns, no novel integration required.
- **Phase 5 (Learning system):** learnings.md structure (UNVERIFIED default, decay timers, contradiction detection, max 50 entries) is fully specified in the project research. No additional pattern research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All core packages verified against official npm, GitHub releases, and documented issues. Version constraints (web-tree-sitter 0.25.x, MCP SDK v1.x, zod 3.25+) verified against real issues and changelogs. |
| Features | HIGH | Competitor analysis based on actual GitHub repos (codebase-context, codebase-memory-mcp, GitNexus, feature-dev, Understand Anything). Feature prioritization grounded in observed competitor gaps. |
| Architecture | HIGH | Directly grounded in Claude Code official documentation for plugins, sub-agents, Task tool constraints. Platform constraints (Issues #5812, #17283, #9458) are documented GitHub issues. Layered build order is a direct output of dependency analysis. |
| Pitfalls | HIGH | Issues #5812 and #9458 are closed GitHub issues (NOT_PLANNED, permanent constraints). LLM-as-judge biases documented across multiple independent research sources (CodeJudgeBench, Evidently AI, Monte Carlo Data). SQLite concurrency behavior is canonical. |

**Overall confidence:** HIGH

### Gaps to Address

- **Louvain community quality:** Research confirms Louvain works (50K nodes + 1M edges in ~940ms) but does not specify optimal resolution parameter values for typical software module structures. Needs empirical tuning during Phase 2. Default resolution often produces sparse communities on codebases with clear module separation. Recommendation: start with resolution=1.0, adjust based on community sizes relative to known service boundaries.

- **Rate limit handling on Pro plans:** Research flags that >3 concurrent agents causes 429 errors on Pro plans but does not provide exact retry timing or backoff intervals. Recommendation: implement exponential backoff starting at 1s with max 32s, detect 429 at the orchestrator level, reduce concurrency to 1 when rate limiting is detected.

- **Sub-agent Write tool persistence:** Issue #9458 confirms this is a real problem in affected versions but does not specify which Claude Code versions are affected. Recommendation: validate Write tool persistence in Phase 1 prototype (write file in sub-agent, parent verifies content). If failing, implement Bash tool cat-heredoc fallback as documented in PITFALLS.md.

- **Import resolution accuracy targets:** Research targets 95-99% for TS/JS and ~80% for Python, but actual accuracy depends heavily on tsconfig path alias complexity and monorepo structure. Recommendation: measure against a real test fixture with known imports during Phase 2, adjust approach if accuracy falls below targets.

- **Convention detection thresholds:** Research recommends >60% adoption + >5 file sample size before flagging a pattern as a convention, but these thresholds are based on general static analysis practices, not CodeScope-specific tuning. Recommendation: validate with <5% false positive rate target on a known test codebase during Phase 2, adjust thresholds empirically.

## Sources

### Primary (HIGH confidence)
- [Claude Code Plugins Documentation](https://code.claude.com/docs/en/plugins) — plugin structure, manifest, skills, hooks, agents
- [Claude Code Sub-Agent Documentation](https://code.claude.com/docs/en/sub-agents) — Task tool, agent frontmatter, nesting constraints
- [Issue #5812: Sub-agent file content blindness](https://github.com/anthropics/claude-code/issues/5812) — closed NOT_PLANNED, permanent platform constraint
- [Issue #17283: context:fork ignored on auto-invoked skills](https://github.com/anthropics/claude-code/issues/17283) — confirmed behavior
- [Issue #9458: Sub-agent Write tool operations don't persist](https://github.com/anthropics/claude-code/issues/9458) — confirmed failure mode
- [Issue #5171: web-tree-sitter 0.26.x WASM ABI incompatibility](https://github.com/tree-sitter/tree-sitter/issues/5171) — confirmed version constraint
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) — v1.27.1 production stable
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) — v2 pre-alpha status confirmed
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) — v12.8.0, March 2026
- [graphology standard library](https://graphology.github.io/standard-library/) — ecosystem packages, benchmarks
- [web-tree-sitter npm](https://www.npmjs.com/package/web-tree-sitter) — v0.25.10 recommended

### Secondary (MEDIUM confidence)
- [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) — reference architecture for SQLite graph + 14 MCP tools
- [codebase-context](https://github.com/PatrickSys/codebase-context) — convention detection, golden files, memory system
- [feature-dev plugin](https://deepwiki.com/anthropics/claude-plugins-official/7.2.3-feature-dev-and-agent-sdk-dev) — 7-phase agent workflow reference
- [GitNexus](https://github.com/abhigyanpatwari/GitNexus) — zero-config graph intelligence with Claude Code hooks
- [Understand Anything](https://github.com/Lum1104/Understand-Anything) — 5-agent analysis pipeline, onboarding
- [CodeJudgeBench](https://arxiv.org/abs/2507.10535) — LLM-as-judge point-wise vs pair-wise comparison for code
- [LLM-as-a-Judge for Software Engineering](https://arxiv.org/pdf/2510.24367) — agent-as-judge evaluation patterns
- [Why Multi-Agent Systems Fail: The 17x Error Trap](https://towardsdatascience.com/why-your-multi-agent-system-is-failing-escaping-the-17x-error-trap-of-the-bag-of-agents/) — validation gates rationale
- [Anthropic 2026 Agentic Coding Trends Report](https://resources.anthropic.com/hubfs/2026%20Agentic%20Coding%20Trends%20Report.pdf) — repository intelligence, multi-agent patterns
- [Mike Mason: AI Coding Agents in 2026](https://mikemason.ca/writing/ai-coding-agents-jan-2026/) — Planner/Worker/Judge pattern

### Tertiary (LOW confidence — needs validation during implementation)
- Convention detection frequency thresholds (>60%, >5 files) — derived from static analysis best practices, not CodeScope-specific data
- Louvain resolution parameter defaults — community sizes for typical software graphs need empirical tuning
- Rate limit backoff intervals for Pro plans — exact timing not documented

---
*Research completed: 2026-03-22*
*Ready for roadmap: yes*
