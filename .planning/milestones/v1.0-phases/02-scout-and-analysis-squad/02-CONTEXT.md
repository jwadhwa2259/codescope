# Phase 2: Scout and Analysis Squad - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

The bootstrap pipeline's individual agents work end-to-end: Scout maps project structure (extending onboard's detectProject), Researcher writes overview, Convention Detector produces conventions with evidence using ast-grep, Risk Analyzer builds the knowledge graph with centrality and communities using graphology, and golden files are identified. This phase delivers the agent modules and supporting infrastructure — the `/codescope:bootstrap` orchestration skill and synthesis are Phase 3.

</domain>

<decisions>
## Implementation Decisions

### Agent Orchestration
- **D-01:** `/codescope:bootstrap` is a skill that runs as the orchestrator itself — spawns agents sequentially via Task tool, reads results from filesystem (Issue #5812 pattern). Thin orchestrator stays in the skill body.
- **D-02:** Agent prompts written inline in the skill markdown body. Matches Phase 1's onboard skill pattern (skill body is detailed natural language prompt).
- **D-03:** On agent failure or timeout, skip that agent's artifact, log the failure, continue with remaining agents. Produces partial results rather than nothing. Matches D-20 graceful degradation from Phase 1.
- **D-04:** Scout agent extends onboard's detectProject output — reads config.yml + does targeted file reads to enrich with LOC counts, framework versions, entry points, CI/CD info. Avoids duplicating detection.
- **D-05:** Phase 2 builds each agent as a callable module (Scout, Researcher, Convention Detector, Risk Analyzer, Learning Synthesizer). Phase 3 wires them into the bootstrap skill with orchestration and synthesis. Individual agents only — no full bootstrap E2E in Phase 2.
- **D-06:** Agents access existing infrastructure (parser, resolver, graph) via direct TypeScript imports. Agent code is TypeScript that runs in-process. Simple, type-safe.
- **D-07:** Convention Detector uses ast-grep CLI via Bash (`sg scan --rule rules.yml --json ./src`). CLI for batch analysis during bootstrap, matching CLAUDE.md recommendation. Rules defined in YAML.

### Convention Detection
- **D-08:** Ship a bundled rule library of curated ast-grep YAML rules for common TS/JS/Python patterns. Agent runs them all, reports adoption %. Extensible — users can add custom rules later.
- **D-09:** Core TS/JS patterns (~15-20 rules): error handling (custom error classes vs throw strings), import style (named vs default vs barrel), async patterns (async/await vs .then), export style (named vs default), component patterns (functional vs class for React).
- **D-10:** Adoption % calculated as file-count ratio: (files matching pattern / total files where pattern could apply). Simple, explainable, matches spec's >80% threshold for high-confidence.
- **D-11:** Snapshot-only for v1 — calculate adoption % from current codebase state. Mark all trends as "Stable." Git-based trend analysis deferred to a future iteration.
- **D-12:** Golden files selected by highest convention density — rank files by how many detected conventions they follow. Top 3-5 per service. Matches spec: "ranked by modern pattern density."
- **D-13:** Convention conflicts detected via competing pattern pairs defined in the rule library (e.g., arrow vs function, Zustand vs Redux, class vs functional). When both sides exceed 20% adoption, flag as conflict. Report both percentages and trend directions.
- **D-14:** Python convention rules: minimal parity with 3-5 rules (import style, class patterns, error handling, type hints). Python files still get parsed for graph nodes/edges. Full parity deferred.

### Graph Analytics
- **D-15:** Graph analytics run in graphology in-memory: load nodes/edges from SQLite into graphology, run algorithms (graphology-metrics for centrality, graphology-communities-louvain for communities, graphology-traversal for BFS blast radius), write results back to SQLite communities table.
- **D-16:** Danger zones identified by multi-signal scoring: combine in-degree centrality (many dependents), cross-boundary edges (connects different communities), and file size/complexity. Score each file, top N are danger zones. Ranked list with reasons.
- **D-17:** Dedicated `src/graph/builder.ts` module walks files, calls extractFromSource + resolver, produces BatchWriter JSONL. Risk Analyzer agent invokes this module, then runs graphology analytics on the populated graph. Separation of concerns: building vs analyzing.
- **D-18:** `src/graph/analytics.ts` module exposes blastRadius(nodeId, maxHops) returning hop-distance classified results (Red/Orange/Yellow/Green per spec). BFS via graphology-traversal. Available for MCP tools in Phase 3 and orient in Phase 4.
- **D-19:** graphology loaded on demand — load from SQLite when analytics needed, run algorithms, write results back, discard in-memory graph. Keeps memory bounded. For Phase 3 MCP tools, reload per-query.
- **D-20:** Community detection results stored in SQLite communities table with node_id, community_id, and modularity_class (human-readable label derived from most common directory/namespace in that community).

### Output Artifacts
- **D-21:** All artifacts use structured markdown with consistent sections (## headers, tables, YAML frontmatter for metadata). Human-readable AND grep-able by downstream agents.
- **D-22:** Researcher's overview.md targets ~200 lines, scannable format: structure, frameworks, entry points, key directories, test setup. Organized by sections with bullet points. A map, not a tutorial.
- **D-23:** conventions.md includes evidence chains: adoption %, trend direction, and top 3 representative file:line references per convention. Downstream agents can read golden files to understand the pattern.
- **D-24:** learnings.md initialized with header/schema structure but no entries. Learning Synthesizer's real work happens in Phase 7 when learnings accumulate from completed tasks.

### Testing & Performance
- **D-25:** Unit tests with vitest for each module (graph builder, analytics, convention rules). Small fixture project (test/fixtures/sample-project/) with known patterns for integration tests. Convention detector tested against fixtures with known adoption %.
- **D-26:** Convention detection accuracy (<5% false positive) validated via fixture project with ground truth — files with intentional patterns + intentional violations. Test asserts detected conventions match ground truth.
- **D-27:** File walking uses glob patterns respecting .gitignore (skip node_modules, dist, build, vendor). Process files in batches. Shallow parsing for large files (D-37 from Phase 1).
- **D-28:** Progress reporting at agent level: "Scout complete (12s) -> Researcher running..." No file-level progress bars. Clean orchestrator output.

### Claude's Discretion
- No areas deferred to Claude's discretion — all gray areas received explicit user decisions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Specification
- `CODESCOPE-SPEC-V6.md` — Full product spec. Lines 124-167 define bootstrap phases (Scout, Squad Deployment, Synthesis). Line 140 defines squad composition (4 agents). Lines 144-147 define agent roles/models/tools/outputs. Lines 161-166 define parent-child communication pattern (Issue #5812).

### Build Instructions
- `CODESCOPE-BUILD-INSTRUCTIONS.md` — Environment setup, ast-grep installation, tree-sitter-cli, dependency versions.

### Project Context
- `.planning/PROJECT.md` — Thin orchestrator pattern, filesystem coordination, key constraints.
- `.planning/REQUIREMENTS.md` — Phase 2 requirements: BOOT-01 through BOOT-10, GRPH-02 through GRPH-04.
- `.planning/ROADMAP.md` — Phase 2 goal, success criteria, dependency on Phase 1.

### Technology Stack
- `CLAUDE.md` §Technology Stack — graphology ecosystem (communities-louvain, metrics, traversal), ast-grep CLI/NAPI, web-tree-sitter memory management, better-sqlite3 sync API.

### Phase 1 Context & Code
- `.planning/phases/01-plugin-foundation-and-infrastructure/01-CONTEXT.md` — All Phase 1 decisions that carry forward (D-34 parser lifecycle, D-36 extract API, D-37 shallow parsing, D-38 node granularity, D-40 JSONL batch writes).
- `src/parser/extract.ts` — extractFromSource API (ParseResult with imports/exports/classes/functions/variables).
- `src/graph/batch-writer.ts` — BatchWriter JSONL append + processBatchFiles for SQLite insert (two-pass: nodes first, then edges).
- `src/graph/schema.ts` — SQLite schema with nodes, edges, communities tables.
- `src/graph/database.ts` — openDatabase with WAL mode and performance pragmas.
- `src/resolver/typescript.ts` — enhanced-resolve based import resolution.
- `src/resolver/python.ts` — Filesystem-based Python import resolution.
- `src/onboard/detect.ts` — detectProject function (project type, languages, services, build/test commands).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **ParserPool** (src/parser/lifecycle.ts): manages web-tree-sitter parsers with memory lifecycle — Phase 2 graph builder uses this to parse all source files
- **extractFromSource** (src/parser/extract.ts): returns ParseResult with imports/exports/classes/functions/variables — direct input for graph node/edge creation
- **Import resolvers** (src/resolver/typescript.ts, python.ts): resolve import paths to filesystem paths — needed for IMPORTS edges in the graph
- **BatchWriter** (src/graph/batch-writer.ts): JSONL append for nodes/edges, processBatchFiles for SQLite insert — graph builder writes via this
- **Graph database** (src/graph/database.ts): openDatabase with WAL mode — analytics module opens the same DB
- **Graph schema** (src/graph/schema.ts): nodes, edges, communities tables already created — communities table ready for Louvain results
- **detectProject** (src/onboard/detect.ts): detects project type, languages, services — Scout enriches this output

### Established Patterns
- Two-pass batch insert (nodes first across all files, then edges resolved by name+file_path)
- Issue #5812 parent-child communication: agent writes file, returns summary message, parent reads file
- Sequential agent spawning for rate limit protection
- Dependency injection (projectRoot param) for testability
- ESM-first with type:module and NodeNext module resolution

### Integration Points
- New `src/graph/builder.ts` — walks files, uses parser + resolver, writes JSONL via BatchWriter
- New `src/graph/analytics.ts` — loads graph into graphology, runs centrality/communities/BFS, writes back to SQLite
- New `src/conventions/` — ast-grep rule library + runner + output formatter
- New `src/agents/` — Scout, Researcher, Convention Detector, Risk Analyzer, Learning Synthesizer modules
- `test/fixtures/sample-project/` — fixture project for convention detection accuracy testing

</code_context>

<specifics>
## Specific Ideas

- Scout extends detectProject rather than re-scanning from scratch — avoids duplicating work already done in onboard. Config.yml contains project detection results.
- Convention detection uses snapshot-only approach for v1 (no git-based trends). Git trend analysis is valuable but adds significant complexity for marginal v1 benefit.
- graphology loaded on demand, not persisted in memory — keeps MCP server footprint small. Can be changed in Phase 3 if performance requires it.
- Fixture project with ground truth for convention accuracy testing — deterministic, CI-runnable, no external dependencies.
- Agent modules are callable TypeScript, not just prompt templates — direct imports of parser/resolver/graph infrastructure.

</specifics>

<deferred>
## Deferred Ideas

- Git-based trend detection for conventions (Rising/Declining/Stable from commit history) — future iteration
- Full Python convention parity with TS/JS rule count — defer until Python usage patterns are better understood
- @ast-grep/napi programmatic API — defer unless CLI subprocess overhead becomes a bottleneck
- Persistent in-memory graphology graph — revisit in Phase 3 if per-query reload doesn't meet <100ms target

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 02-scout-and-analysis-squad*
*Context gathered: 2026-03-22*
