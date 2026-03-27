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

## Cross-Milestone Trends

### Process Evolution

| Milestone | Sessions | Phases | Plans | Key Change |
|-----------|----------|--------|-------|------------|
| v1.0 | ~15 | 8 | 34 | Established bottom-up phase ordering, agent module pattern, GSD workflow |

### Cumulative Quality

| Milestone | Tests | Test LOC | Source LOC | Test Ratio |
|-----------|-------|----------|------------|------------|
| v1.0 | 865 | 20,759 | 21,742 | 0.95:1 |

### Top Lessons (Verified Across Milestones)

1. Design structured data interfaces between pipeline stages from the start
2. Validate requirement metadata at plan completion, not milestone audit
3. Consolidate parallel-execution type copies in the same phase, not later
