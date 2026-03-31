# Roadmap: CodeScope

## Overview

CodeScope is built bottom-up: infrastructure first, then codebase intelligence, then the autonomous pipeline, then the self-correcting quality loop. Each phase delivers a complete, verifiable capability that the next phase depends on.

## Milestones

- v1.0 MVP -- Phases 1-8 (shipped 2026-03-27) -- [Archive](milestones/v1.0-ROADMAP.md)
- v2.0 Intelligence Layer + Interactive Dashboard -- Phases 9-16 (shipped 2026-03-29) -- [Archive](milestones/v2.0-ROADMAP.md)
- v2.1 Eval Fixes & Real-World Quality -- Phases 17-19 (in progress)

## Phases

<details>
<summary>v1.0 MVP (Phases 1-8) -- SHIPPED 2026-03-27</summary>

- [x] **Phase 1: Plugin Foundation and Infrastructure** (5/5 plans) -- complete
- [x] **Phase 2: Scout and Analysis Squad** (4/4 plans) -- complete
- [x] **Phase 3: Bootstrap Synthesis and MCP Server** (5/5 plans) -- complete
- [x] **Phase 4: Orient and Execution Engine** (6/6 plans) -- complete
- [x] **Phase 5: Verification** (4/4 plans) -- complete
- [x] **Phase 6: Eval, User Gate, and Debug** (4/4 plans) -- complete
- [x] **Phase 7: Learning System and Settings** (4/4 plans) -- complete
- [x] **Phase 8: Tech Debt Cleanup** (2/2 plans) -- complete

</details>

<details>
<summary>v2.0 Intelligence Layer + Interactive Dashboard (Phases 9-16) -- SHIPPED 2026-03-29</summary>

- [x] **Phase 9: Graph Foundation + Debt Tracking** (3/3 plans) -- complete 2026-03-28
- [x] **Phase 10: Auto-Injection** (2/2 plans) -- complete 2026-03-28
- [x] **Phase 11: PR Review + Impact Prediction** (3/3 plans) -- complete 2026-03-28
- [x] **Phase 12: Convention Enforcement + Session Continuity** (5/5 plans) -- complete 2026-03-28
- [x] **Phase 13: Pipeline Evolution** (2/2 plans) -- complete 2026-03-29
- [x] **Phase 14: Visualization Dashboard** (5/5 plans) -- complete 2026-03-29
- [x] **Phase 15: Distribution** (2/2 plans) -- complete 2026-03-29
- [x] **Phase 16: Tech Debt Closure** (5/5 plans) -- complete 2026-03-29

</details>

### v2.1 Eval Fixes & Real-World Quality (In Progress)

**Milestone Goal:** Fix the gaps exposed by comparison testing against Fastify and h3 -- make CodeScope demonstrably better than vanilla Claude Code on real codebases.

- [x] **Phase 17: Foundation Fixes** - Fix import graph (ESM + CommonJS), convention index parsing, plugin distribution, readiness scoring, and bootstrap error surfacing (gap closure in progress) (completed 2026-03-30)
- [ ] **Phase 18: Semantic Conventions** - Framework-specific convention detection, file-role classification, and golden file quality filtering
- [ ] **Phase 19: Intelligence Features** - Reference file injection, post-edit convention validation, and the `/codescope:eval` skill

## Phase Details

### Phase 17: Foundation Fixes
**Goal**: Import graph produces accurate edges on both CommonJS and ESM codebases, convention index is populated from actual detector output, plugin installs cleanly from marketplace, and bootstrap surfaces errors instead of completing silently with empty data
**Depends on**: Phase 16 (v2.0 complete)
**Requirements**: GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04, GRAPH-05, GRAPH-06, CONV-01, CONV-02, PLUG-01, PLUG-02, PLUG-03
**Success Criteria** (what must be TRUE):
  1. Running bootstrap on a CommonJS codebase (like Fastify) produces a non-zero import graph with edges between files connected by `require()` calls
  2. Running bootstrap on an ESM TypeScript codebase (like h3) produces a non-zero import graph with edges between files connected by `import` statements
  3. The `conventions.json` artifact contains parsed conventions matching what the convention detector wrote to `conventions.md` (not empty)
  4. Installing the plugin from marketplace on a clean machine succeeds without recursive cloning or manifest validation errors
  5. When import resolution produces 0 edges on a codebase with >5 files, bootstrap emits a visible warning explaining the failure
**Plans**: 5 plans

Plans:
- [x] 17-01-PLAN.md -- CJS require() and module.exports extraction in AST parser
- [x] 17-02-PLAN.md -- Resolver null-check fix, shared graph builder, 0-edge warning
- [x] 17-03-PLAN.md -- Canonical convention parser, readiness scoring with actual data
- [x] 17-04-PLAN.md -- Plugin distribution fix, GRAPH_INCOMPLETE downstream warnings
- [x] 17-05-PLAN.md -- Gap closure: fix generator test regression from Plan 03

### Phase 18: Semantic Conventions
**Goal**: Convention detection identifies framework-specific patterns (not just generic syntax), golden files are filtered to exclude noise, and file roles are classified to prevent false-positive convention matching
**Depends on**: Phase 17 (accurate graph and populated convention index required for meaningful adoption percentages and golden file rankings)
**Requirements**: CONV-03, CONV-04, CONV-05, CONV-06, CONV-07
**Success Criteria** (what must be TRUE):
  1. Running bootstrap on Fastify detects Fastify-specific conventions (plugin signatures, route handler patterns) that would not appear on a generic TypeScript project
  2. Golden file rankings exclude deprecated, test, generated, and config files -- only production source files appear as top exemplars
  3. Golden file rankings for a TypeScript project do not penalize files for missing Python-only conventions (and vice versa)
  4. Files are classified by role (utility, route handler, test, config, deprecated) and convention matching uses role to avoid false positives (e.g., utility files not flagged for missing route handler patterns)
**Plans**: 4 plans

Plans:
- [x] 18-01-PLAN.md -- Shared RULE_METADATA module, file-role classifier, framework detection
- [x] 18-02-PLAN.md -- Framework-specific ast-grep rules (Fastify, Express, h3) and runner integration
- [x] 18-03-PLAN.md -- Golden file noise filtering and per-language density fix
- [ ] 18-04-PLAN.md -- Integration wiring: convention detector, readiness cap, pre-commit, rule validation

### Phase 19: Intelligence Features
**Goal**: CodeScope actively helps Claude write code that fits the codebase by suggesting reference files before edits, validating conventions after edits, and exposing a skill for on-demand evaluation
**Depends on**: Phase 18 (reference suggestions and validation require framework-specific conventions and file-role filtering to avoid false positives)
**Requirements**: REF-01, REF-02, REF-03, VALID-01, VALID-02, VALID-03, VALID-04, EVAL-01, EVAL-02, EVAL-03, EVAL-04
**Success Criteria** (what must be TRUE):
  1. When Claude is about to create a new file, the PreToolUse hook injects a one-line reference suggestion pointing to the most structurally similar existing file in the codebase
  2. After Claude writes a file, the PostToolUse hook checks the written code against HIGH-CONF conventions and reports deviations as advisory warnings (false positive rate below 5%)
  3. Running `/codescope:eval` on uncommitted changes produces a scorecard with convention adherence %, blast radius, violation count, import correctness, and composite score
  4. Running `/codescope:eval` in benchmark mode executes predefined tasks and produces aggregate scores comparing CodeScope-assisted output to baseline
**Plans**: TBD

Plans:
- [ ] 19-01: TBD
- [ ] 19-02: TBD
- [ ] 19-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 17 -> 18 -> 19

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Plugin Foundation and Infrastructure | v1.0 | 5/5 | Complete | 2026-03-23 |
| 2. Scout and Analysis Squad | v1.0 | 4/4 | Complete | 2026-03-23 |
| 3. Bootstrap Synthesis and MCP Server | v1.0 | 5/5 | Complete | 2026-03-24 |
| 4. Orient and Execution Engine | v1.0 | 6/6 | Complete | 2026-03-25 |
| 5. Verification | v1.0 | 4/4 | Complete | 2026-03-25 |
| 6. Eval, User Gate, and Debug | v1.0 | 4/4 | Complete | 2026-03-26 |
| 7. Learning System and Settings | v1.0 | 4/4 | Complete | 2026-03-26 |
| 8. Tech Debt Cleanup | v1.0 | 2/2 | Complete | 2026-03-27 |
| 9. Graph Foundation + Debt Tracking | v2.0 | 3/3 | Complete | 2026-03-28 |
| 10. Auto-Injection | v2.0 | 2/2 | Complete | 2026-03-28 |
| 11. PR Review + Impact Prediction | v2.0 | 3/3 | Complete | 2026-03-28 |
| 12. Convention Enforcement + Session Continuity | v2.0 | 5/5 | Complete | 2026-03-28 |
| 13. Pipeline Evolution | v2.0 | 2/2 | Complete | 2026-03-29 |
| 14. Visualization Dashboard | v2.0 | 5/5 | Complete | 2026-03-29 |
| 15. Distribution | v2.0 | 2/2 | Complete | 2026-03-29 |
| 16. Tech Debt Closure | v2.0 | 5/5 | Complete | 2026-03-29 |
| 17. Foundation Fixes | v2.1 | 5/5 | Complete    | 2026-03-30 |
| 18. Semantic Conventions | v2.1 | 3/4 | In Progress|  |
| 19. Intelligence Features | v2.1 | 0/0 | Not started | - |
