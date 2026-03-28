# Roadmap: CodeScope

## Overview

CodeScope is built bottom-up: infrastructure first, then codebase intelligence, then the autonomous pipeline, then the self-correcting quality loop. Each phase delivers a complete, verifiable capability that the next phase depends on.

v2.0 transforms CodeScope from a one-time analysis tool into an always-on intelligence layer. The dependency chain is strict: incremental graph freshness enables auto-injection, which enables review and enforcement, which generates the data the dashboard visualizes. Distribution wraps it all for marketplace launch.

## Milestones

- v1.0 MVP -- Phases 1-8 (shipped 2026-03-27) -- [Archive](milestones/v1.0-ROADMAP.md)
- v2.0 Intelligence Layer + Interactive Dashboard -- Phases 9-15 (in progress)

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

### v2.0 Intelligence Layer + Interactive Dashboard (In Progress)

- [ ] **Phase 9: Graph Foundation + Debt Tracking** - Always-fresh incremental graph with staleness detection, delta reparse, and readiness history
- [ ] **Phase 10: Auto-Injection** - Invisible codebase context injected on every file edit via Claude Code hooks
- [ ] **Phase 11: PR Review + Impact Prediction** - Structural impact analysis for PRs and pre-change blast radius prediction
- [ ] **Phase 12: Convention Enforcement + Session Continuity** - Opt-in pre-commit convention blocking and pause/resume workflow
- [ ] **Phase 13: Pipeline Evolution** - Per-task qualification, diagnostic failure routing, and plan-vs-actual reconciliation
- [ ] **Phase 14: Visualization Dashboard** - Interactive sigma.js graph explorer, convention heatmap, readiness trends, and command center
- [ ] **Phase 15: Distribution** - npx codescope install experience and npm package for marketplace launch

## Phase Details

### Phase 9: Graph Foundation + Debt Tracking
**Goal**: The knowledge graph stays fresh automatically -- every MCP tool call serves current data, incremental updates complete in under 2 seconds, and readiness trends accumulate over time
**Depends on**: Phase 8 (v1.0 complete)
**Requirements**: GRAPH-01, GRAPH-02, GRAPH-03, GRAPH-04, DEBT-01, DEBT-02
**Success Criteria** (what must be TRUE):
  1. MCP tool calls detect stale files and trigger automatic reparse before returning results -- user never sees outdated graph data
  2. Editing a single file and querying the graph completes the incremental update in under 2 seconds without re-bootstrapping
  3. Deleting or renaming a file leaves no dangling edges or orphaned nodes in the graph
  4. Multiple processes (MCP server + future dashboard) can read/write the database without SQLITE_BUSY errors
  5. After each bootstrap or incremental update, a readiness snapshot is stored and the trends MCP tool returns period-over-period comparisons
**Plans**: 3 plans

Plans:
- [x] 09-01-PLAN.md -- Schema migration system (v1-to-v2, CASCADE, busy_timeout, file_hashes, readiness_history tables)
- [ ] 09-02-PLAN.md -- File hashing, staleness detection, incremental reparse engine, staleness-aware cache
- [x] 09-03-PLAN.md -- Readiness snapshot storage, codescope_trends MCP tool with period comparisons

### Phase 10: Auto-Injection
**Goal**: Claude receives relevant codebase context (conventions, blast radius, danger zones) automatically on every file edit -- invisible to the user, bounded to avoid context bloat
**Depends on**: Phase 9
**Requirements**: INJECT-01, INJECT-02, INJECT-03, INJECT-04, INJECT-05
**Success Criteria** (what must be TRUE):
  1. When Claude edits a file with known conventions or high centrality, the user sees convention warnings and danger zone alerts in Claude's reasoning without having asked for them
  2. After Claude writes a file, PostToolUse feedback surfaces blast radius expansion or convention violations as immediate warnings
  3. Injection never exceeds 500 tokens per file, with danger zones prioritized over general context
  4. Files with low centrality and no detected conventions produce zero injection overhead
  5. On a fresh project with no bootstrap data, hooks silently no-op -- no errors, no warnings, no degraded experience
**Plans**: TBD

Plans:
- [ ] 10-01: TBD
- [ ] 10-02: TBD

### Phase 11: PR Review + Impact Prediction
**Goal**: Users can get structural impact analysis on any PR or proposed change, with risk scores, dependency edge changes, and convention compliance -- before committing
**Depends on**: Phase 9, Phase 10
**Requirements**: REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04, IMPACT-01, IMPACT-02
**Success Criteria** (what must be TRUE):
  1. User can run `/codescope:review` on a branch, PR number, or working tree diff and receive a structured report with per-file risk scores and flagged danger zones
  2. Review detects new dependency edges, circular dependencies, and changes that cross community boundaries in the diff
  3. Changed files are checked against conventions with violations shown alongside evidence (adoption rate, golden file references)
  4. User can call `codescope_predict_impact` with file paths and receive a pre-change blast radius showing all transitive callers/importers up to N hops
**Plans**: TBD

Plans:
- [ ] 11-01: TBD
- [ ] 11-02: TBD

### Phase 12: Convention Enforcement + Session Continuity
**Goal**: Developers can opt into pre-commit convention enforcement that only blocks on user-verified patterns, and can pause/resume CodeScope workflows across sessions without losing context
**Depends on**: Phase 9, Phase 10
**Requirements**: ENFORCE-01, ENFORCE-02, ENFORCE-03, ENFORCE-04, SESS-01, SESS-02, SESS-03, SESS-04
**Success Criteria** (what must be TRUE):
  1. Running `npx codescope install-hooks` adds a pre-commit hook that checks staged files against VERIFIED conventions without overwriting existing hooks
  2. Only user-confirmed conventions are enforced -- auto-detected patterns never block commits
  3. User can configure enforcement severity (suggest-only / warn / block) per project via config.yml
  4. Running `/codescope:pause` produces a structured handoff document; `/codescope:resume` picks up exactly where the workflow left off, including correct phase and wave position
  5. Context compaction automatically triggers handoff generation so session state survives compaction events
**Plans**: TBD

Plans:
- [ ] 12-01: TBD
- [ ] 12-02: TBD

### Phase 13: Pipeline Evolution
**Goal**: The orient/execute pipeline self-monitors with per-task qualification, classifies failures by root cause, and detects scope drift -- producing higher autonomous execution reliability
**Depends on**: Phase 11, Phase 12
**Requirements**: PIPE-01, PIPE-02, PIPE-03, PIPE-04
**Success Criteria** (what must be TRUE):
  1. After each agent execution, qualification verifies files actually changed via git diff and runs a scoped convention check -- failing tasks are flagged before the pipeline continues
  2. Eval findings are classified as SCOPE_DRIFT / PLAN_GAP / CODE_BUG / CONVENTION_MISS, and the debug agent receives the classification to inform its fix strategy
  3. After execution completes, a reconciliation report compares planned files against actual git changes and surfaces unexpected modifications
  4. The planner estimates token cost per agent (LIGHT/MODERATE/HEAVY) and the orchestrator warns when cumulative context approaches the safe threshold
**Plans**: TBD

Plans:
- [ ] 13-01: TBD
- [ ] 13-02: TBD

### Phase 14: Visualization Dashboard
**Goal**: Users can explore their codebase intelligence through an interactive local dashboard -- dependency graph, convention heatmap, readiness trends, blast radius explorer, and a command center that triggers reviews and impact predictions from the UI
**Depends on**: Phase 9, Phase 11
**Requirements**: VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05, VIZ-06, VIZ-07, VIZ-08, VIZ-09
**Success Criteria** (what must be TRUE):
  1. Running `/codescope:viz` launches a local HTTP server and opens a browser showing the dashboard with live data from the knowledge graph
  2. User can see and interact with the dependency graph -- nodes sized by centrality, colored by community, danger zones highlighted red -- with zoom, pan, and click-to-detail
  3. Convention heatmap shows per-file compliance (green/yellow/red) and clicking a file reveals specific convention details
  4. Readiness dashboard shows 4 gauge metrics with historical trend lines drawn from the readiness_history table
  5. During bootstrap or orient execution, the dashboard receives real-time progress updates via WebSocket without manual refresh
**Plans**: TBD
**UI hint**: yes

Plans:
- [ ] 14-01: TBD
- [ ] 14-02: TBD
- [ ] 14-03: TBD

### Phase 15: Distribution
**Goal**: Users can install and set up CodeScope with a single npx command -- project detection, config creation, bootstrap, and Claude Code plugin wiring all happen automatically
**Depends on**: Phase 14
**Requirements**: DIST-01, DIST-02, DIST-03, DIST-04
**Success Criteria** (what must be TRUE):
  1. Running `npx codescope init` in any supported project detects the project type, creates config, runs bootstrap, and shows a summary of what was analyzed
  2. The CLI supports subcommands (init, bootstrap, viz, review, install-hooks, status) with help text and error handling
  3. If Claude Code is detected, plugin manifest and MCP config are auto-generated without manual setup
  4. The npm package installs successfully on macOS (Intel + ARM), Linux (x64), and Windows (x64) with pre-bundled better-sqlite3 binaries
**Plans**: TBD

Plans:
- [ ] 15-01: TBD
- [ ] 15-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 9 > 10 > 11 > 12 > 13 > 14 > 15

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
| 9. Graph Foundation + Debt Tracking | v2.0 | 0/3 | Planning complete | - |
| 10. Auto-Injection | v2.0 | 0/0 | Not started | - |
| 11. PR Review + Impact Prediction | v2.0 | 0/0 | Not started | - |
| 12. Convention Enforcement + Session Continuity | v2.0 | 0/0 | Not started | - |
| 13. Pipeline Evolution | v2.0 | 0/0 | Not started | - |
| 14. Visualization Dashboard | v2.0 | 0/0 | Not started | - |
| 15. Distribution | v2.0 | 0/0 | Not started | - |
