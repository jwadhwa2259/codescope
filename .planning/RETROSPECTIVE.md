# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-27
**Phases:** 8 | **Plans:** 34 | **Tasks:** 65 | **Commits:** 241

### What Was Built
- Complete Claude Code plugin with 5 skills (onboard, bootstrap, orient, review-learnings, settings) and 12 MCP tools
- Autonomous bootstrap pipeline: Scout + Researcher + Convention Detector + Risk Analyzer + Learning Synthesizer with monorepo squad scaling
- Full orient-to-learn pipeline: clarification -> research -> analysis -> planning -> execution -> verification -> eval -> user gate -> debug -> learning capture
- Knowledge graph infrastructure: web-tree-sitter AST parsing, SQLite storage, graphology analytics (centrality, communities, BFS blast radius)
- Self-correcting feedback loop: LLM-as-judge eval, 3-mode user gate, bounded debug cycles with design decision escalation
- Persistent learning system with confidence decay, contradiction detection, global memory

### What Worked
- **Bottom-up phase ordering** — each phase delivered testable capabilities the next phase depended on; no rework or circular dependencies
- **Agent module pattern** (Options + Result + async fn + artifact output) — established in Phase 2, reused consistently across 10+ modules through Phase 7
- **handleX() extraction pattern** for MCP tool testability — all 12 tools testable without MCP transport
- **Parallel plan execution within phases** — Plans 01/02 in Phase 4 ran concurrently with local type copies, later consolidated in Phase 8
- **Filesystem-first coordination** — append-only coordination.md, JSONL batch writers, artifact-based data flow all proved reliable
- **GSD workflow** — 34 plans completed with consistent discuss -> plan -> execute -> verify cycle

### What Was Inefficient
- **Phase 8 added for tech debt** — verify-to-eval JSON sidecar and type consolidation should have been caught during Phase 5/6 planning, not discovered during milestone audit
- **~48/103 SUMMARY frontmatter metadata gaps** — requirement tracking in plan summaries was inconsistent; all verified via VERIFICATION.md but metadata trail incomplete
- **Some MCP tool stubs persisted longer than needed** — stub tools created in Phase 1 could have been converted to real implementations earlier
- **Readiness scoring approximations** — LOC-based heuristics for typedFiles/testFiles were a known shortcut that will need improvement

### Patterns Established
- ESM-first with NodeNext module resolution across all source and test files
- Dependency injection (projectRoot, homeDir params) for testability in filesystem utilities
- stderr dispatch protocol for CLI entry points that skill bodies orchestrate via sub-agents
- handleXxx() / registerXxxTool() split for MCP tool handler testability
- Two-pass batch insert (nodes first, edges second) for cross-file graph resolution
- Convention confidence tiers: HIGH-CONF (>=80% + >=10 files), MEDIUM-CONF (>=50%), LOW-CONF (<50%)
- UI-SPEC copywriting contracts for agent-produced markdown artifacts

### Key Lessons
1. **Plan for structured data handoff between pipeline stages from the start** — the verify-to-eval markdown-only path required a Phase 8 JSON sidecar fix. Design structured interfaces between stages during initial planning.
2. **Requirement tracking metadata needs to be enforced per-plan, not audited post-hoc** — the 48-requirement metadata gap shows that SUMMARY frontmatter fields need validation during plan completion.
3. **Platform constraint workarounds should be documented as first-class decisions** — Issue #5812, #17283, #9458 workarounds were essential but scattered across phase decisions rather than centralized.
4. **Type consolidation should be a plan completion gate, not tech debt** — local type copies for parallel execution are fine, but consolidation should be a task in the same phase, not deferred.
5. **ast-grep YAML rules per-file execution** — `--rule` takes single file not directory; this surprised multiple phases and should be documented as a gotcha upfront.

### Cost Observations
- Model mix: predominantly sonnet for execution agents, opus for planning/review
- Sessions: ~15 sessions over 5 days
- Notable: Average plan execution was 5.6 minutes (190min total across 34 plans). Phase 8 cleanup plans were fastest at 2min each — well-scoped targeted fixes.

---

## Milestone: v2.0 — Intelligence Layer + Interactive Dashboard

**Shipped:** 2026-03-29
**Phases:** 8 | **Plans:** 27 | **Tasks:** 53 | **Commits:** 177

### What Was Built
- Always-fresh knowledge graph with SHA-256 staleness detection, incremental delta reparse (<2s), and schema migration with ON DELETE CASCADE
- Invisible auto-injection via PreToolUse/PostToolUse hooks with 500-token budget composer and pre-computed JSON artifacts
- PR review and impact prediction: structural diff analysis, reverse BFS blast radius, risk scoring, cycle detection, convention compliance
- Convention enforcement: VERIFIED-only pre-commit hooks with configurable severity, husky-compatible install/uninstall
- Session continuity: pause/resume skills, handoff documents, PreCompact/SessionStart hooks
- Self-improving pipeline: per-task qualification gates, failure classification, plan-vs-actual reconciliation, token budget warnings
- Interactive dashboard: sigma.js graph explorer, convention heatmap, readiness gauges, blast radius rings, command center with WebSocket live updates
- `npx codescope` CLI with 6 subcommands, plugin auto-setup, cross-platform npm distribution

### What Worked
- **Build isolation pattern** — duplicating types/logic in hooks/lib/ and enforcement modules prevented heavy transitive imports. Applied consistently across Phases 10, 12, 14.
- **Pre-computed artifacts** — JSON indexes built at bootstrap time for sub-50ms hook consumption. Decoupled heavy graph analysis from time-critical hook paths.
- **Hono sub-router pattern** — each API route as independent Hono() instance mounted via app.route() kept dashboard code modular and testable
- **PanelContext/PanelInstance contract** — standardized panel interface (api, ws, container, onSelectFile in, destroy() out) made adding 5 panels straightforward
- **Event log as JSON lines** — decoupled dashboard from orchestrator imports. Events appended to events.log, tailed by server. Simple and reliable.
- **2-day velocity** — 8 phases, 27 plans, 177 commits in 2 days. Build isolation and pre-computed patterns reduced integration friction.

### What Was Inefficient
- **Phase 16 added for tech debt (again)** — MCP path mismatch, TypeScript errors, and fork bomb should have been caught during Phase 15 verification, not post-audit
- **DIST-04 platform binaries** — CI workflow authored but never executed. Hard to verify cross-platform builds without CI access.
- **VIZ-08 screenshot dependency** — Uses `npx tsx` (devDependency) which won't work in published npm package without source tree. Known tech debt.
- **SUMMARY frontmatter gaps persisted** — Despite being a v1.0 lesson, 6 requirements needed post-hoc patching in quick task 260329-m4f

### Patterns Established
- Build isolation: hooks/lib/ never imports from src/ -- types and logic duplicated for independence
- Pre-computed artifacts: heavy analysis at bootstrap time, lightweight JSON reads at hook time
- Hono sub-router mounting for modular API routes
- PanelContext/PanelInstance contract for dashboard panels
- JSON lines event log for decoupled real-time updates
- Dynamic imports for CLI bundle size management (graphology ESM subpath issues)
- Content marker string detection for idempotent hook installation

### Key Lessons
1. **Tech debt phases keep recurring** — both v1.0 and v2.0 needed a cleanup phase. Consider adding integration verification as a plan completion gate rather than a separate phase.
2. **SUMMARY frontmatter enforcement still not solved** — despite being lesson #2 from v1.0, gaps recurred. Needs tooling enforcement, not process.
3. **Cross-platform distribution is hard to verify locally** — CI workflow is the right approach but needs to be run as part of the milestone, not left as "exists but untested."
4. **Build isolation is a first-class architectural pattern** — hooks, enforcement, and dashboard all independently discovered the need. Should be documented as a project convention.
5. **Pre-computed artifacts beat runtime computation for hooks** — 50ms budget is too tight for graph queries. Pre-computing at bootstrap time was the right call.

### Cost Observations
- Model mix: predominantly sonnet for execution, opus for planning/review/milestone-level work
- Sessions: ~8 sessions over 2 days
- Notable: Average plan execution was 4.1min (110min total across 27 plans). Fastest phase was Phase 16 at 15min for 5 plans -- well-scoped targeted fixes.

---

## Milestone: v2.1 — Eval Fixes & Real-World Quality

**Shipped:** 2026-03-31
**Phases:** 4 | **Plans:** 14 | **Tasks:** 26 | **Commits:** 89

### What Was Built
- Accurate import graph for both ESM (import statements) and CommonJS (require()/module.exports) codebases with shared graph builder
- Framework-specific convention detection: 9 ast-grep YAML rules for Fastify, Express, h3 with file-role classification and golden file noise filtering
- Intelligence hooks: PreToolUse reference file suggestion (structurally similar exemplar) and PostToolUse convention validation warnings
- `/codescope:eval` skill with 3 modes: deterministic scorecard, task+score+revert, benchmark suite
- Eval scorecard with 6 metrics: convention adherence, blast radius, violation count, import correctness, risk files, composite score
- Plugin distribution fix, bootstrap 0-edge warning, GRAPH_INCOMPLETE downstream guards

### What Worked
- **Root cause-driven phase scoping** — comparison testing on real codebases (Fastify, h3) identified specific failures (0 edges, empty conventions, generic patterns), and each phase targeted a specific layer of the fix
- **Phase 20 as gap closure** — instead of a generic tech debt phase, Phase 20 was scoped directly from milestone audit findings. Fast to plan and execute (2 plans, ~5min total)
- **Milestone audit + Nyquist validation** — catching the eval DB path bug and ViolationEntry.ruleId issue before archival prevented shipping known-broken features
- **Quick task workflow for audit fixes** — 3 quick tasks (260331-8m5, 260331-939, 260331-auc) cleaned up audit findings without full phase overhead
- **Canonical parser pattern** — establishing parseDetectorConventions as the single convention parsing path in Phase 17 prevented format drift in Phases 18-19
- **Pure data module pattern** — RULE_METADATA with zero imports for build isolation, adopted in Phase 18 and reused by hooks and enforcement

### What Was Inefficient
- **VALID-02/VALID-03 only scoped out in Phase 20** — these requirements needed parser-level type reference and failed import tracking that was never in scope. Should have been flagged as "requires parser changes" during v2.1 requirements definition, not discovered during implementation
- **Phase 18 Progress table typo** — ROADMAP.md showed "4/1" for Phase 18 plans (should be 4/4). Minor but shows manual progress tracking is error-prone
- **Adversarial review findings** — quick task 260331-939 fixed scorecard violation paths and false positive filtering that should have been caught by Phase 19 verification

### Patterns Established
- Canonical parser: single convention parsing path (parser.ts) for all consumers
- Pure data modules: zero-import metadata modules for build isolation in hooks
- 3-tier file-role signal chain: filename (0.95) > path (0.85) > fallback (0.50)
- Pre-computed reference/violation indexes as JSON artifacts for hook consumption
- Server-side scorecard computation in MCP tools (not inline in skill agents)
- Slugified fallback for convention name-to-ruleId mapping

### Key Lessons
1. **Real-codebase comparison testing finds issues that unit tests miss** — v2.0 passed all tests but produced 0 import edges on actual repos. Eval against Fastify/h3 should be a standard milestone verification step.
2. **Requirements that need parser-level changes should be flagged at requirements time** — VALID-02/VALID-03 were reasonable requirements but impossible without graph schema changes. Better upfront feasibility analysis would have prevented mid-milestone scope reduction.
3. **Milestone audit as a formal step pays off** — the audit found the eval DB path bug, ViolationEntry.ruleId issue, and SUMMARY frontmatter inaccuracies. All fixed before shipping.
4. **Gap closure phases are faster than tech debt phases** — Phase 20 (2 plans, scoped from audit) was faster than Phase 8 or 16 (generic tech debt). Specific scoping from audit findings is more efficient.
5. **Quick task workflow handles audit fixes well** — small targeted fixes that don't warrant a full phase can be handled efficiently with quick tasks.

### Cost Observations
- Model mix: predominantly sonnet for execution, opus for planning/audit/milestone
- Sessions: ~5 sessions over 2 days
- Notable: Average plan execution was fast. Phase 20 completed in ~5min total (2 plans). Entire milestone was 2 calendar days for 14 plans.

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Plans | Key Change |
|-----------|----------|--------|-------|------------|
| v1.0 | ~15 | 8 | 34 | Established bottom-up phase ordering, agent module pattern, GSD workflow |
| v2.0 | ~8 | 8 | 27 | Build isolation pattern, pre-computed artifacts, 2x velocity increase |
| v2.1 | ~5 | 4 | 14 | Root cause-driven scoping from real-codebase eval, gap closure from audit |

### Cumulative Quality

| Milestone | Tests | Test LOC | Source LOC | Test Ratio |
|-----------|-------|----------|------------|------------|
| v1.0 | 865 | 20,759 | 21,742 | 0.95:1 |
| v2.0 | 1,124 | ~25,000 | ~33,657 | ~0.74:1 |
| v2.1 | 1,357+ | ~28,000 | ~35,000 | ~0.80:1 |

### Top Lessons (Verified Across Milestones)

1. Design structured data interfaces between pipeline stages from the start
2. Validate requirement metadata at plan completion, not milestone audit -- tooling needed, process insufficient
3. Consolidate parallel-execution type copies in the same phase, not later
4. Tech debt phases are recurring -- gap closure phases scoped from audit findings are faster and more targeted
5. Build isolation (duplicated types/logic for independent modules) is a first-class pattern, not a shortcut
6. Test against real codebases, not just unit tests -- comparison testing on Fastify/h3 found critical failures invisible to the test suite
7. Milestone audit before archival catches shipping-blocking bugs -- invest the time
