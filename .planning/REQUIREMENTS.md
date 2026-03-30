# Requirements — v2.1 Eval Fixes & Real-World Quality

## Import Graph

- [x] **GRAPH-01**: Parser extracts ESM `import` statements and creates edges in the knowledge graph (fix existing bug — 0 edges on TypeScript ESM repos like h3)
- [x] **GRAPH-02**: Parser extracts CommonJS `require()` calls from `call_expression` AST nodes and creates edges (supports `const x = require('y')`, `const { a } = require('y')`, `module.exports = require('y')`)
- [x] **GRAPH-03**: Parser extracts `module.exports` and `exports.*` assignments as export declarations
- [x] **GRAPH-04**: Resolver handles projects without tsconfig.json (currently silently returns null, producing 0 edges)
- [x] **GRAPH-05**: Shared graph-building function extracted from `builder.ts` and `incremental.ts` to eliminate ~150 lines of duplicated node/edge creation logic
- [x] **GRAPH-06**: Bootstrap surfaces errors when graph produces 0 edges (instead of completing silently with empty graph)

## Convention Pipeline

- [x] **CONV-01**: Convention index parser matches the format the convention detector actually writes (fix format mismatch — `conventions.json` is currently always empty)
- [x] **CONV-02**: Readiness scoring uses actual data from bootstrap (not hardcoded approximations like `Math.round(totalConventions * 0.6)`)
- [ ] **CONV-03**: Golden file ranking excludes deprecated, test, generated, and config files from top exemplars
- [ ] **CONV-04**: Golden file ranking filters convention applicability by language (TS files not penalized for missing Python conventions)
- [ ] **CONV-05**: Framework detection from package.json dependencies determines which framework-specific convention rules to load
- [ ] **CONV-06**: Framework-specific ast-grep rules detect patterns beyond generic syntax (e.g., Fastify plugin signatures, h3 event handler patterns, Express middleware patterns) — minimum 3 frameworks supported
- [ ] **CONV-07**: File-role classification (utility, route handler, test, config, deprecated) prevents false positives in convention matching

## Plugin Distribution

- [ ] **PLUG-01**: Marketplace.json source does not cause recursive cloning loop
- [ ] **PLUG-02**: Plugin manifest passes Claude Code validation without errors (skills, hooks, mcpServers fields)
- [ ] **PLUG-03**: End-to-end plugin install works via `/plugin marketplace add` + `/plugin install` on a clean machine

## Reference File Injection

- [ ] **REF-01**: MCP tool identifies the most similar existing file when Claude is about to create a new file, using structural similarity (shared imports, community, directory, conventions, LOC)
- [ ] **REF-02**: PreToolUse hook injects a one-line reference suggestion ("Reference: see `src/utils/session.ts` for this codebase's utility pattern") within the existing token budget
- [ ] **REF-03**: Reference file suggestion excludes deprecated, generated, and test files

## Post-Edit Validation

- [ ] **VALID-01**: PostToolUse hook validates written code against HIGH-CONF conventions and reports deviations as advisory warnings
- [ ] **VALID-02**: Validation catches wrong type names (e.g., `HTTPEvent` vs `H3Event`) by comparing against types detected in the codebase
- [ ] **VALID-03**: Validation catches import path errors by checking against the resolved import graph
- [ ] **VALID-04**: False positive rate below 5% on HIGH-CONF conventions (only validated conventions trigger warnings)

## Eval Skill

- [ ] **EVAL-01**: `/codescope:eval` skill Mode 2 — score existing uncommitted changes against codebase conventions and produce a scorecard
- [ ] **EVAL-02**: `/codescope:eval` skill Mode 1 — run a task, score the output, and optionally revert changes
- [ ] **EVAL-03**: `/codescope:eval` skill Mode 3 — run a benchmark suite of predefined tasks and produce aggregate scores
- [ ] **EVAL-04**: Scorecard includes convention adherence %, blast radius size, violation count, import correctness, risk files modified, composite score

## Future Requirements

- Vector embeddings for semantic search (v3.0)
- Cross-project learning / pattern library (v3.0)
- Additional framework-specific rules beyond initial 3 (ongoing)

## Out of Scope

- Full CommonJS dynamic `require(variable)` resolution — cannot be statically analyzed
- `require.resolve()` extraction — different semantics from `require()`
- Post-edit `decision: "block"` enforcement — starting with advisory only, upgrade to blocking after FP rate validated
- Non-TS/JS/Python language support — v3.0

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| GRAPH-01 | Phase 17 | Complete |
| GRAPH-02 | Phase 17 | Complete |
| GRAPH-03 | Phase 17 | Complete |
| GRAPH-04 | Phase 17 | Complete |
| GRAPH-05 | Phase 17 | Complete |
| GRAPH-06 | Phase 17 | Complete |
| CONV-01 | Phase 17 | Complete |
| CONV-02 | Phase 17 | Complete |
| CONV-03 | Phase 18 | Pending |
| CONV-04 | Phase 18 | Pending |
| CONV-05 | Phase 18 | Pending |
| CONV-06 | Phase 18 | Pending |
| CONV-07 | Phase 18 | Pending |
| PLUG-01 | Phase 17 | Pending |
| PLUG-02 | Phase 17 | Pending |
| PLUG-03 | Phase 17 | Pending |
| REF-01 | Phase 19 | Pending |
| REF-02 | Phase 19 | Pending |
| REF-03 | Phase 19 | Pending |
| VALID-01 | Phase 19 | Pending |
| VALID-02 | Phase 19 | Pending |
| VALID-03 | Phase 19 | Pending |
| VALID-04 | Phase 19 | Pending |
| EVAL-01 | Phase 19 | Pending |
| EVAL-02 | Phase 19 | Pending |
| EVAL-03 | Phase 19 | Pending |
| EVAL-04 | Phase 19 | Pending |
