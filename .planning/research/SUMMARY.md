# Project Research Summary

**Project:** CodeScope v2.1 — Eval Fixes & Real-World Quality
**Domain:** Claude Code plugin — codebase intelligence layer
**Researched:** 2026-03-30
**Confidence:** HIGH

## Executive Summary

CodeScope v2.1 is a quality milestone, not a feature milestone. Comparison eval testing against real-world codebases (Fastify/CommonJS, h3/ESM TypeScript) revealed that v2.0 produces 0 import graph edges on both — making the entire intelligence layer non-functional for any codebase that is not a pure ESM TypeScript project. The root causes are specific and fixable: the parser only handles `import_statement` AST nodes (missing `call_expression` for CommonJS `require()`), and the convention index artifact builder parses a markdown format that the convention detector never writes. Both are silent failures with no user-visible errors, which makes them particularly dangerous.

The recommended approach is to fix these foundational bugs before building any new capabilities. The dependency order is strict: accurate import edges are required for blast radius and readiness scoring to produce meaningful output; a correctly-populated `conventions.json` is required for hook injection to work at all; framework-specific convention rules require accurate conventions infrastructure to be useful; and reference file injection and post-edit validation both depend on high-quality convention data. Attempting to build new capabilities before fixing the foundation produces a faster path to a still-broken product.

The key risk is calibration and trust. Post-edit validation is the feature most likely to erode user trust if shipped before accurate convention data is available — a single false positive on a utility file ("this file doesn't follow Fastify plugin patterns") teaches users to disable the feature permanently. The research is clear: only validate against HIGH-CONF conventions (>80% adoption, >10 files), apply file-role filtering, and prefer omitting suggestions over providing bad ones.

## Key Findings

### Recommended Stack

The v2.1 milestone requires **zero new npm dependencies**. Every feature maps to existing infrastructure: web-tree-sitter for CommonJS AST extraction, ast-grep YAML rules for semantic convention detection, the existing SQLite schema and graphology for reference file similarity ranking, and the documented Claude Code marketplace schema for plugin distribution. The core problem in v2.0 was not missing technology — it was incomplete use of the technology already present.

**Core technologies (no changes):**
- `web-tree-sitter@0.25.10`: Add `call_expression` extraction to `src/parser/extract.ts` — CommonJS `require()` calls are `call_expression` nodes, not `import_statement` nodes
- `ast-grep@^0.40.5`: Add framework-specific YAML rules (Fastify plugins, Express middleware, Hono handlers, React hooks); the existing scanner infrastructure requires no changes
- `better-sqlite3@^12.8.0`: No schema changes; existing `nodes`/`edges` tables support all v2.1 features
- `enhanced-resolve@^5.20.1`: Already configured with `conditionNames: ["import", "require", "node", "default"]` — no changes needed for CJS resolution
- `graphology@^0.26.0`: Existing BFS and centrality sufficient for reference file similarity via weighted Jaccard on pre-computed features

**Weight tuning note:** The similarity weights (community: 0.30, shared imports: 0.25, conventions: 0.20, directory: 0.15, LOC: 0.10) are heuristic. They are sound in principle but need empirical validation against eval results.

### Expected Features

**Must have — table stakes (broken in v2.0, fix required):**
- CommonJS `require()` import extraction — Fastify, Express, Koa and most Node.js libraries use CJS; 0 edges = broken product
- ESM edge creation fix — even h3 (pure ESM TypeScript) produced 0 edges; this is a resolver/path-normalization bug, not a parser problem
- `module.exports` extraction — CJS exports are how modules declare their public API; without them the graph is structurally incomplete
- Convention index format fix — `convention-index.ts` parses `**Convention:**` headers but `convention-detector.ts` writes `### Name` + markdown tables; the index is always empty

**Must have — competitive differentiators:**
- Semantic convention detection (framework-specific rules) — generic patterns that match every TypeScript project identically provide zero value
- Reference file injection ("write this like X") — no competing tool auto-suggests reference files based on detected conventions
- Post-edit convention validation with `decision: "block"` — current PostToolUse hook returns advisory text that is silently discarded without the `decision` field

**Should have (significant value, v2.1 scope):**
- `/codescope:eval` skill (3 modes: pre-commit, post-change, on-demand)
- Bootstrap error surfacing — "0 edges" with no explanation is actively harmful to user trust
- Plugin distribution fixes — `${CLAUDE_PLUGIN_ROOT}` paths, marketplace.json schema correctness

**Defer to v2+:**
- Vector embeddings / semantic search (lancedb + Ollama) — graph-structural similarity is sufficient for reference file selection
- TypeScript compiler API (type-aware analysis) — structural analysis covers 95%+ of cases
- Auto-fix convention violations — PostToolUse `decision: "block"` is the correct pattern; auto-fix lacks sufficient context
- Dynamic `require()` resolution — unresolvable by static analysis; log as unresolvable, do not attempt

### Architecture Approach

CodeScope uses a layered pipeline with a strict isolation boundary between hook scripts and the heavy infrastructure (tree-sitter, graphology, SQLite). This boundary is non-negotiable: hooks read pre-computed JSON artifacts only, never import from `src/graph/`, `src/parser/`, or `src/conventions/`. All v2.1 changes must preserve this boundary. The canonical fix pattern for reference file injection in hooks is to inject only the reference file path (a string), not the file content — content reading is Claude's job via the Read tool.

**Major components and their v2.1 changes:**

1. **Parser (`src/parser/extract.ts`)** — Add `call_expression` handling for `require()` at depth 2 from root (inside `variable_declarator.value` and bare `expression_statement`). This is the single highest-impact change: the graph builder, batch writer, and resolver are already correct and require no modification.

2. **Convention index builder (`src/artifacts/convention-index.ts`)** — Rewrite `parseConventions()` to match the actual `### Name` + markdown table format. This is HIGH-risk because convention injection is currently silently broken; fixing it will activate hook injection for all v2.0 users on next bootstrap.

3. **Convention runner + new YAML rules (`src/conventions/rules/frameworks/`)** — Additive: new framework-specific `.yml` files plus a `framework-detector.ts` that reads `package.json` to scope which rules to load. No changes to the scanning infrastructure.

4. **Pre-tool-use hook (`src/hooks/pre-tool-use.ts`)** — Add priority 2.5 injection item: reference file path and one-line description within the existing 500-token budget. Inject path only, not content.

5. **Post-tool-use hook (`src/hooks/post-tool-use.ts`)** — Add lightweight string-based validation (not ast-grep, which is an MCP tool concern) returning `decision: "block"` for HIGH-CONF violations only.

6. **Bootstrap orchestrator (`src/bootstrap/orchestrator.ts`)** — Fix hardcoded approximations (`* 0.6`, `* 0.9`, `* 0.2`) in readiness score computation (lines 350-363); thread actual counts from convention detector and graph builder results.

**Non-negotiable constraint:** `src/graph/incremental.ts` duplicates ~150 lines of `src/graph/builder.ts` parsing logic. Any parser change in Phase 1 must be applied to both files or incremental rebuilds will continue to produce 0 CJS edges even after the bootstrap fix.

### Critical Pitfalls

1. **Silent 0-edge failure on ESM and CJS codebases** — The graph builder silently catches resolver errors and pushes them to an errors array that nobody reads. Fix: add a post-build sanity check that emits a prominent WARNING when `edgesCreated === 0` and `filesProcessed > 5`. Add a naive fallback resolver for relative imports that works without tsconfig.json (Fastify has none).

2. **Nested `require()` invisible at root level** — `const foo = require('bar')` is a `lexical_declaration` at root, not a `call_expression`. The `call_expression` is at `variable_declarator.value` — depth 2. The parser must walk depth-2 from root-level `variable_declaration` and `lexical_declaration` children.

3. **Convention index format mismatch (currently broken in production)** — The existing `convention-index.ts` parser expects `**Convention:**` headers. The convention detector writes `### Name` + markdown tables. This means `conventions.json` is always empty, and convention injection has never worked. Fix the parser; add an integration test that generates conventions.md and asserts non-empty parsed output.

4. **Post-edit validation calibration erodes trust** — Only validate HIGH-CONF conventions (>80% adoption, >10 files). Apply file-role filtering (do not check route conventions on utility files). Trust damage from false positives is not recoverable within a session; a single bad warning teaches users to disable the feature.

5. **Reference file injection blows the 500-token hook budget** — Injecting file content (even a 50-line file = ~300-500 tokens) leaves no room for danger zone warnings. Inject only path + one-line description. Use an MCP tool (`codescope_suggest_reference`) for full reference content delivery.

6. **Recursive marketplace clone (already occurred in v2.0)** — marketplace.json self-referencing the same repo causes `claude /install-plugin` to recursively clone. Use explicit commit hashes; never reference the same repo as both marketplace root and plugin source.

7. **Hook build isolation breakage** — Adding any import from `src/conventions/`, `src/graph/`, `src/parser/`, or `src/tools/` to a hook file transitively loads native addons and breaks hook startup. Validate after every hook change with a cold-start timing test.

## Implications for Roadmap

Based on the dependency graph established across all four research files, the phase structure is dictated by hard dependencies. Building Phase 3 capabilities without Phase 1 and Phase 2 foundations produces broken features.

### Phase 1: Foundation Fixes — Import Graph, Convention Index, Plugin Distribution

**Rationale:** Everything downstream depends on these two foundational bugs being fixed. Import graph accuracy is required for blast radius, danger zones, and readiness scoring. A populated `conventions.json` is required for hook injection to work at all. Both are silent failures — no crashes, just empty data — and are the sole reason v2.0 scored no better than vanilla Claude Code on the Fastify and h3 evals. Plugin distribution fixes are independent and low-cost; address them in parallel.

**Delivers:** Functional import graph on both CommonJS (Fastify) and ESM (h3) codebases; populated `conventions.json` that actually drives hook injection; visible bootstrap diagnostics when import resolution fails; correct `${CLAUDE_PLUGIN_ROOT}` paths for marketplace installation.

**Features addressed:**
- ESM edge creation fix (bug, LOW complexity, HIGH impact)
- CommonJS `require()` extraction (parser change, MEDIUM complexity)
- `module.exports` export extraction (parser change, MEDIUM complexity)
- Convention index format fix (artifact parser rewrite, HIGH risk)
- Bootstrap error surfacing (orchestrator change, LOW complexity)
- Plugin distribution fixes (independent, LOW complexity)

**Pitfalls to avoid:** Pitfall 1 (missing `call_expression` handling), Pitfall 2 (nested require in variable declaration), Pitfall 3 (ESM resolver silent failure), Pitfall 9 (circular require cycles during BFS — add cycle detection as part of edge creation), Anti-Pattern 1 (duplicated builder logic in incremental.ts — must apply parser changes to BOTH files).

**Research flag:** Standard patterns — well-documented tree-sitter grammar, existing resolver infrastructure. No phase-level research needed. Verify directly against source code.

---

### Phase 2: Semantic Convention Detection

**Rationale:** Generic conventions ("uses async/await," "uses named exports") match every TypeScript project identically and provide zero differentiation value. Framework-specific rules are the feature that justifies CodeScope's existence for real codebases. This phase requires Phase 1 to be complete so that convention adoption percentages are computed against a real graph, not phantom data.

**Delivers:** Framework-specific convention detection for Fastify, Express, h3, React, Next.js; accurate golden file ranking filtered by file role (excludes deprecated, generated, test, barrel files); readiness scoring that uses actual convention counts instead of hardcoded approximations.

**Features addressed:**
- Framework detection from `package.json` (new `framework-detector.ts`, LOW complexity)
- Framework-specific YAML rules (additive, MEDIUM complexity per framework)
- Golden file ranking fix (filter deprecated/generated/test/barrel, per-language counting, MEDIUM)
- Readiness scoring fix (orchestrator lines 350-363 rewrite, MEDIUM)

**Pitfalls to avoid:** Pitfall 4 (conventions detecting language features, not framework patterns), Pitfall 5 (over-fitting to one file type — apply file-role classification), Pitfall 6 (deprecated/generated/irrelevant reference files), Anti-Pattern 2 (hardcoded orchestrator approximations).

**Research flag:** YAML rule accuracy will need iteration per framework. Start with Fastify (eval target) and h3 (eval target) before expanding to Express, React, Next.js. Each framework needs 3-5 targeted rules using ast-grep composite patterns (`all`, `any`, `has`, `inside`). Rule testing against real codebase samples is the bulk of the work.

---

### Phase 3: Reference File Injection, Post-Edit Validation, Eval Skill

**Rationale:** These are the user-facing capabilities that demonstrate CodeScope's value over vanilla Claude Code. All three depend on conventions.json being populated (Phase 1) and conventions being semantically meaningful (Phase 2). Building them before Phase 2 produces reference suggestions that are worse than useless and validation that generates false positives.

**Delivers:** PreToolUse hook injects golden file path references within the existing 500-token budget; PostToolUse hook validates just-written files against HIGH-CONF conventions and returns `decision: "block"` with specific violations and reference file guidance; `/codescope:eval` skill exposes three-mode evaluation to users.

**Features addressed:**
- Reference file injection in PreToolUse (path only, one-line description, MEDIUM)
- Post-edit convention validation with `decision: "block"` (HIGH-CONF only, file-role filtered, MEDIUM)
- `/codescope:eval` skill — three modes: pre-commit, post-change, on-demand (HIGH complexity)
- `codescope_suggest_reference` MCP tool for full reference content delivery (MEDIUM)

**Pitfalls to avoid:** Pitfall 7 (reference content blowing 500-token budget — inject path not content), Pitfall 8 (post-edit validation calibration — HIGH-CONF only, file-role filtered, advisory with dismissal), Hook build isolation (never import from conventions/graph/parser in hook files).

**Research flag:** The `decision: "block"` PostToolUse pattern is well-documented. Calibration testing (false positive rate <5% on Fastify and h3 across 50+ edits) is the acceptance criterion for post-edit validation, not a research question.

---

### Phase Ordering Rationale

- Phase 1 before Phase 2: Convention adoption percentages are only meaningful if the import graph correctly identifies which files import which modules. Without real edges, community assignments are wrong, proximity scoring is wrong, and golden file rankings are meaningless.
- Phase 2 before Phase 3: Reference file injection and post-edit validation both depend on HIGH-CONF conventions that are framework-relevant. Without framework-specific rules, you get high-confidence detection of "uses async/await" — correct, but not useful as a reference criterion.
- Plugin distribution fixes (Phase 1) are independent and can be shipped at any point. Addressing the recursive clone issue (Pitfall 10) and `CLAUDE_PLUGIN_ROOT` availability (Pitfall 11) in Phase 1 unblocks testing from a clean marketplace install.
- `incremental.ts` code duplication is the highest-risk implementation trap. The parser change in Phase 1 must be applied to both `builder.ts` and `incremental.ts` simultaneously or incremental rebuilds will silently produce 0 CJS edges — a failure that only surfaces during incremental usage, not on a fresh bootstrap.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (framework rules):** Each framework's specific rule patterns need validation against real codebase samples. Fastify and h3 are the eval targets — start there. React and Next.js rules need testing against TypeScript + JSX before committing to final patterns.

Phases with standard patterns (skip research-phase):
- **Phase 1 (import graph + convention index fix):** Direct source code bugs with confirmed root causes and located line numbers. Research is complete — execution is the remaining work.
- **Phase 3 (injection + validation):** The `decision: "block"` PostToolUse pattern is thoroughly documented. Hook architecture constraints are established. Implementation is execution of known patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No new dependencies. All technologies already in use; implementation paths verified against source code. The only MEDIUM-confidence items are similarity weight tuning (heuristic, needs empirical validation) and tsdown (pre-1.0 but functional). |
| Features | HIGH | Root causes confirmed via direct source inspection (`extract.ts` line 572, `convention-index.ts` parser, `orchestrator.ts` lines 350-363). Feature dependencies are unambiguous. Anti-features clearly articulated with strong rationale. |
| Architecture | HIGH | Based on direct source code analysis of all affected modules with specific file paths and line numbers. Component boundaries, isolation constraints, and build-order dependencies are verified, not inferred. |
| Pitfalls | HIGH | Grounded in actual v2.0 eval failures (0 edges on both Fastify and h3) and specific source code line references. Not speculative — the bugs are confirmed and located. |

**Overall confidence:** HIGH

### Gaps to Address

- **Similarity weight validation:** The 0.30/0.25/0.20/0.15/0.10 weights for reference file similarity are theoretically justified but not empirically validated. Plan for an iteration cycle in Phase 3 where golden file suggestions are evaluated against actual developer judgment. If the weights produce poor suggestions on the Fastify eval, adjust before shipping.

- **Convention rule accuracy per framework:** The research documents the approach (ast-grep composite rules) but specific rule correctness for Fastify, h3, Express, and React requires testing against real codebases. Each rule set needs an acceptance criterion (e.g., "Fastify plugin pattern rule matches 80%+ of plugin files without false-positive-ing utility files").

- **macOS symlink normalization:** The ESM 0-edge bug likely involves `/var` vs. `/private/var` path normalization inconsistency. The fix is identified in the research but needs verification on macOS to confirm it is the actual root cause versus another resolver failure mode.

- **incremental.ts duplication scope:** The file duplicates ~150 lines of `builder.ts` logic. Parser changes in Phase 1 must be applied to both files. Factor in the duplication effort when estimating Phase 1 scope; consider refactoring to a shared `buildFileGraph()` function as part of the Phase 1 work.

## Sources

### Primary (HIGH confidence)
- CodeScope source code (direct analysis) — `src/parser/extract.ts`, `src/graph/builder.ts`, `src/artifacts/convention-index.ts`, `src/bootstrap/orchestrator.ts`, `src/hooks/pre-tool-use.ts`, `src/hooks/post-tool-use.ts`, `src/conventions/runner.ts`, `src/conventions/golden-files.ts`
- [tree-sitter-javascript grammar](https://github.com/tree-sitter/tree-sitter-javascript) — `call_expression` structure for `require()`, `variable_declarator` nesting verified against node-types.json
- [ast-grep pattern syntax](https://ast-grep.github.io/guide/pattern-syntax.html) — composite rules (`all`, `any`, `has`, `inside`), metavariables (`$`, `$$$`)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) — `decision: "block"`, PostToolUse API, additionalContext
- [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) — marketplace.json schema, source types, `${CLAUDE_PLUGIN_ROOT}`
- [enhanced-resolve GitHub](https://github.com/webpack/enhanced-resolve) — `conditionNames: ["import", "require"]` CJS support verified

### Secondary (MEDIUM confidence)
- [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) — 66-language IMPORTS edge approach; confirms tree-sitter-based CJS handling is standard practice
- [code-review-graph](https://github.com/tirth8205/code-review-graph) — `_IMPORT_TYPES`/`_CALL_TYPES` mapping approach for multi-language import extraction
- [Revisiting Code Similarity with AST Edit Distance](https://arxiv.org/abs/2404.08817) — confirms weighted structural feature comparison is practical alternative to tree edit distance; validates Jaccard approach
- [Make Claude Code Fix Its Own Lint Errors](https://boehs.com/blog/2026/03/17/claude-code-lint-hooks/) — PostToolUse lint validation pattern with `decision: "block"` in production use
- [Context Engineering: The AI Coding Revolution](https://www.blog.brightcoding.dev/2026/03/28/context-engineering-the-ai-coding-revolution) — reference file exemplar patterns for AI code generation

### Tertiary (reference)
- [Fastify plugin reference](https://fastify.dev/docs/latest/Reference/Plugins/) — `module.exports = function(fastify, opts, done)` pattern used in framework rule design
- CodeScope PROJECT.md v2.1 eval findings — 0 edges on both Fastify (CJS) and h3 (ESM), vanilla Claude Code scored equal or better

---
*Research completed: 2026-03-30*
*Ready for roadmap: yes*
