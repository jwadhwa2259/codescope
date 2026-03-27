# Feature Research: CodeScope v2.0

**Domain:** Codebase intelligence layer features -- auto-injection, graph-aware review, interactive visualization, convention enforcement, session continuity, change impact prediction, technical debt tracking, npx distribution
**Researched:** 2026-03-27
**Confidence:** HIGH (most features have clear ecosystem precedents and v1 foundations to build on)

## Feature Landscape

### Table Stakes (Users Expect These)

Features that v2 users will expect given v1's capabilities and the competitive landscape. Missing these makes v2 feel like a point release, not a real upgrade.

| Feature | Why Expected | Complexity | v1 Dependency | Notes |
|---------|--------------|------------|---------------|-------|
| Incremental graph updates on demand | v1 has incremental re-bootstrap via git diff with 50% threshold, but it's a manual trigger. codebase-memory-mcp does incremental updates automatically. Users who bootstrapped once expect the graph to stay fresh without re-running the full pipeline. | MEDIUM | `bootstrap/incremental.ts`, `graph/builder.ts`, `graph/batch-writer.ts` | On-demand via detect-changes MCP tool trigger. Hash-based file change detection (like code-review-graph's SHA-256 approach). Sub-2-second update for changed files. |
| Auto-injection of codebase context on file edits | Claude Code's hook system (PreToolUse/PostToolUse) is specifically designed for this. Windsurf's Cascade, Cursor, and Augment Code all auto-inject codebase context. Any "intelligence layer" that requires manual MCP tool calls for every edit is not an intelligence layer -- it's a tool collection. This is the single most important v2 feature. | HIGH | All 12 MCP tools (as context sources), `graph/cache.ts`, `conventions/types.ts`, `graph/analytics.ts` | PreToolUse hook on Write/Edit matching `*.ts,*.js,*.py`. Return `additionalContext` with conventions, blast radius neighbors, and danger zone warnings for the target file. PostToolUse hook for post-edit validation feedback. Must be invisible -- zero user action required. |
| Session continuity (pause/resume) | Session Context Management MCP for Claude already exists with `/start` and `/handoff` commands. Developers expect multi-hour tasks to survive context compaction and session interrupts. Claude Code has PreCompact/PostCompact hooks. The filesystem coordination pattern (coordination.md) already provides the foundation. | MEDIUM | `execution/coordination.ts`, `orient/types.ts`, orient pipeline state files | Handoff document generation at PreCompact hook. Resume skill that reads handoff document and restores execution state. All critical state already lives on disk (filesystem-first architecture). |
| Change impact prediction (pre-change blast radius) | v1 has blast radius for existing files. Blast Radius (blast-radius.dev) and GitNexus both offer pre-change impact analysis on PRs. Users expect to know what will break before they make changes, not after. | MEDIUM | `graph/analytics.ts` (blastRadius), `tools/blast-radius.ts`, `tools/detect-changes.ts` | Extend existing BFS blast radius to accept proposed changes (file list + change type) and predict downstream impact. Return risk-scored impact report before execution starts. Integrate into orient pipeline's analysis phase. |
| npx codescope install experience | Claude Code plugin marketplace uses `/plugin marketplace add` + `/plugin install`. The community already has `npx claude-plugins install` for single-command installs. Every serious Claude Code plugin needs frictionless first-run. Over 9,000 plugins in the ecosystem means discoverability matters. | LOW | `.claude-plugin/plugin.json`, `config/loader.ts`, `onboard/detect.ts` | `npx codescope` should: detect project, install plugin to project scope, trigger onboard skill, run first bootstrap. Single command, under 30 seconds to working state. Package published to npm with bin entry point. |
| Technical debt tracking (readiness history) | v1 computes readiness scores with A-F grades across 4 dimensions. NDepend tracks metrics over time. McKinsey research shows 20-40% productivity gains from systematic debt tracking. Users who see a score want to see it improve. | LOW | `bootstrap/readiness.ts` (ReadinessScore), `tools/readiness-tool.ts` | Store readiness snapshots in SQLite with timestamp. Compute deltas between runs. The delta tracking field already exists in DimensionScore (`delta: string | null`). Just needs persistence and history query. |

### Differentiators (Competitive Advantage)

Features that set v2 apart. These create the gap between "another code intelligence MCP" and "the always-on intelligence layer that makes every edit smarter."

| Feature | Value Proposition | Complexity | v1 Dependency | Notes |
|---------|-------------------|------------|---------------|-------|
| Graph-aware PR review with structural impact | code-review-graph achieves 6.8x token reduction and 49x on daily tasks by providing structural context. Greptile V3 uses multi-hop graph investigation. Macroscope uses AST + LLM hybrid analysis. CodeScope already has the graph, AST parsing, and convention detection -- but no PR review skill. Combining all three into a review that understands structural dependencies, not just text diffs, is unique. | HIGH | `graph/analytics.ts`, `conventions/runner.ts`, `verify/static-verify.ts`, `verify/blast-radius-diff.ts` | New `/codescope:review-pr` skill. Diff parsing -> graph lookup for changed symbols -> BFS blast radius of changes -> convention check on new/modified code -> structural risk assessment (touching danger zones? crossing community boundaries?). Output: review findings with structural evidence, not just LLM opinions. |
| Convention enforcement hooks (opt-in pre-commit) | v1 is suggestion-only by design (trust-building). v2 users who have verified conventions want optional enforcement. ast-grep already has pre-commit hook integration (boidolr/ast-grep-pre-commit). Husky + lint-staged is the standard JS/TS approach. The difference: CodeScope's conventions are detected from actual code patterns, not manually written rules. | MEDIUM | `conventions/runner.ts`, `conventions/golden-files.ts`, `conventions/types.ts`, detected conventions in `conventions.md` | Optional hook that runs `sg scan` with CodeScope's detected convention rules on staged files. Only enforces VERIFIED conventions (user-confirmed). Uses lint-staged for file filtering. Husky for git hook management. Never enables by default -- explicit opt-in via `/codescope:settings`. Exit code 2 (blocking) for violations, with `--fix` suggestions. |
| Full interactive visualization dashboard | v1 explicitly deferred this as an anti-feature. But the competitive landscape has shifted: code-review-graph, GitNexus, and Understand Anything all have visualization. sigma.js + graphology is the standard pairing (graphology is already in the stack). sigma.js renders thousands of nodes via WebGL. @react-sigma/core is production-ready for React. The key differentiator: CodeScope's dashboard includes convention heatmaps and readiness trends, not just a node-link diagram. | VERY HIGH | `graph/database.ts` (SQLite data), `graph/analytics.ts` (centrality, communities), `bootstrap/readiness.ts`, `conventions/types.ts` | Local dev server (Hono) serving React + sigma.js dashboard. Views: dependency graph explorer (sigma.js), convention heatmap (which files follow which conventions), readiness trends (line chart over time), blast radius explorer (interactive BFS from selected node), command center (pipeline status). ForceAtlas2 layout. Community coloring via Louvain results. |
| Pipeline evolution (qualification, diagnostics, reconciliation) | No competitor has per-task qualification (is this task suitable for autonomous execution?), diagnostic failure routing (why did this fail?), or plan-vs-actual reconciliation (did we do what we planned?). These are the difference between "runs a pipeline" and "runs a reliable pipeline that learns from failures." | HIGH | `orient/pipeline.ts`, `execution/orchestrator.ts`, `eval/eval-agent.ts`, `debug/debug-agent.ts`, `learning/manager.ts` | Pre-execution qualification: complexity estimation, risk assessment, confidence scoring. If confidence < threshold, add checkpoints or request user guidance. Post-execution reconciliation: compare planned changes vs actual changes, surface drift. Diagnostic routing: classify failures (build error, test failure, convention violation, design error) and route to appropriate fix strategy. |
| Context budget awareness | Claude Code's orchestrator constraint is <15K tokens. No competitor manages context budgets explicitly. As auto-injection adds context, the risk of blowing the budget increases. Context budget awareness means the system knows how much context it can afford and prioritizes accordingly. | MEDIUM | `tools/helpers.ts` (response formatting), all MCP tool responses | Token counting for auto-injected context. Priority queue: danger zone warnings > convention violations > blast radius neighbors > general context. Truncation strategy when budget exceeded. Staleness metadata (already in MCP responses) used to deprioritize stale context. |
| Always-on intelligence (invisible to user) | The transition from "tool you invoke" to "intelligence that's always there." Auto-injection + incremental updates + session continuity together create this. No single competitor achieves all three. Cursor comes closest with its codebase indexing, but it doesn't have convention awareness or structural graph analysis. | HIGH (aggregate) | All v1 systems | This is the combination of auto-injection + incremental graph updates + session continuity. Not a single feature but the emergent property of the other features working together. The marketing narrative for v2. |

### Anti-Features (Commonly Requested, Often Problematic)

Features to explicitly NOT build in v2. Some are v1 anti-features that remain valid; others are new temptations.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Real-time filesystem watchers for continuous re-indexing | "Keep the graph always current." codebase-memory-mcp uses filesystem watchers. | web-tree-sitter memory leaks with persistent parsing (documented constraint in PROJECT.md). Continuous indexing during active development creates thrashing -- files change rapidly during editing. Battery/CPU impact on developer machines. The field consensus remains: "no tool has nailed incremental, real-time graph updates." | On-demand incremental updates triggered by hook events (PostToolUse on Write/Edit) or explicit MCP tool call. Hash-based change detection for efficiency. Batch updates, not per-keystroke. |
| Blocking all conventions by default | "If you detected it, enforce it." Enterprise compliance teams want this. | Destroys the trust-building approach that differentiates CodeScope. Detected conventions have confidence levels -- enforcing LOW confidence patterns causes false positive blocks. Even at <5% false positive rate, blocking creates developer friction. | Opt-in enforcement for VERIFIED conventions only. Suggestion-only by default. Progressive trust: detect -> suggest -> verify -> optionally enforce. Never auto-promote. |
| Full IDE extension (VS Code, JetBrains) | "I want to see this in my editor." Every developer tool eventually gets this request. | Massive engineering surface. VS Code extension API is complex. JetBrains plugin API is different. CodeScope already works through Claude Code which runs in terminals and has VS Code integration. Building a standalone IDE extension would duplicate effort and fragment the product. | Let the community build on MCP tools. Claude Code already has VS Code integration. sigma.js dashboard opens in browser. The MCP interface is the universal adapter. |
| Cross-repository analysis | "Analyze my microservices across repos." Blast Radius (blast-radius.dev) does cross-repo impact analysis. | Different git histories, different bootstrap states, different convention sets. Cross-repo analysis requires a coordination layer that doesn't exist. The complexity scales quadratically with repo count. | Single-repo analysis with service boundary awareness (already in v1 via monorepo squad scaling). Cross-repo deferred to v3 when the single-repo experience is perfected. |
| AI-powered auto-fix for convention violations | "Don't just tell me it's wrong, fix it." GitHub Copilot does auto-fix suggestions. | Convention auto-fix requires understanding intent, not just pattern. ast-grep has rewrite rules but they're mechanical transforms. LLM-generated fixes need verification, creating a recursive loop. | Surface violations with specific guidance (golden file references, pattern examples). Let the developer or Claude Code agent apply the fix with full context. Convention enforcement shows the problem; the existing pipeline fixes it. |
| Semantic/embedding search in v2 | "Natural language code search." Augment Code and GitNexus have this. | Still requires Ollama (large dependency) or cloud API calls (cost, privacy). Structural + text search covers the core use cases. Adding embeddings doubles the storage requirements. | Defer to v3. v2 improvements focus on making structural search smarter with graph-informed ranking (files with high centrality rank higher). |
| Usage/cost monitoring dashboard | "How many tokens is CodeScope using?" 6+ tools already exist for this. | Commodity feature. Not core value. Claude Code itself may add this. | Expose token usage metadata in MCP tool responses (already partially there with timing metadata). Let external tools aggregate. |

## Feature Dependencies

```
[Incremental Graph Updates]
    |
    +--required-by--> [Auto-Injection Hooks]
    |                     |
    |                     +--required-by--> [Always-On Intelligence]
    |                     |
    |                     +--enhances--> [Convention Enforcement]
    |
    +--required-by--> [Change Impact Prediction]
    |                     |
    |                     +--enhances--> [Graph-Aware PR Review]
    |
    +--required-by--> [Technical Debt Tracking]

[Session Continuity]
    |
    +--required-by--> [Always-On Intelligence]
    +--requires--> [v1 filesystem coordination]

[Pipeline Evolution]
    |
    +--requires--> [v1 orient pipeline]
    +--enhances--> [Auto-Injection Hooks] (context budget awareness)
    +--enhances--> [Graph-Aware PR Review] (qualification scoring)

[Convention Enforcement Hooks]
    |
    +--requires--> [v1 convention detection]
    +--requires--> [Incremental Graph Updates] (fresh conventions)
    +--conflicts-with--> [Blocking All Conventions] (anti-feature)

[Interactive Visualization Dashboard]
    |
    +--requires--> [Incremental Graph Updates] (fresh data)
    +--requires--> [Technical Debt Tracking] (readiness history)
    +--enhances--> [Graph-Aware PR Review] (visual blast radius)
    +--independent-of--> [Auto-Injection Hooks]

[npx Install Experience]
    |
    +--independent-of--> [all other v2 features]
    +--requires--> [npm package publishing]
    +--enhances--> [marketplace discoverability]

[Graph-Aware PR Review]
    |
    +--requires--> [v1 graph analytics + verify pipeline]
    +--requires--> [Change Impact Prediction]
    +--enhances--> [Convention Enforcement]
```

### Dependency Notes

- **Auto-Injection requires Incremental Updates:** You cannot inject stale context. If the graph is outdated, auto-injected conventions and blast radius data will be wrong. Incremental updates must ship first or concurrently.
- **Interactive Dashboard requires Tech Debt Tracking:** The readiness trends view is a core dashboard panel. Without history, it's just a static score display (which v1 already has via MCP tool).
- **Convention Enforcement requires Incremental Updates:** Conventions must reflect current codebase state, not last bootstrap. Enforcing stale conventions creates false positives.
- **npx Install is fully independent:** Can ship in any phase. No dependency on other v2 features. Pure packaging/distribution concern.
- **Dashboard is independent of Auto-Injection:** The dashboard reads from SQLite and the graph. Auto-injection reads the same data but injects it into Claude's context. They share data sources but don't depend on each other.
- **Pipeline Evolution enhances everything:** Better qualification, diagnostics, and reconciliation improve every pipeline execution. But nothing strictly requires it -- v1 pipeline works without it.

## v2 Phase Recommendations

### Phase 1: Foundation (Incremental Updates + Session Continuity)

Must-ship-first features that everything else depends on.

- [ ] **Incremental graph updates** -- Hash-based file change detection, on-demand re-parse of changed files, sub-2-second update latency. Foundation for auto-injection, impact prediction, and fresh conventions.
- [ ] **Session continuity** -- Handoff document generation at PreCompact, resume skill, execution state serialization. Foundation for always-on intelligence.
- [ ] **npx codescope install** -- npm package with bin entry, project detection, plugin install, first bootstrap trigger. Independent feature, easy win, enables marketplace distribution.

### Phase 2: Intelligence Layer (Auto-Injection + Impact Prediction)

The core value proposition of v2: invisible codebase intelligence on every edit.

- [ ] **Auto-injection hooks** -- PreToolUse on Write/Edit, PostToolUse validation feedback, context budget management, priority queue for context items. This is the flagship v2 feature.
- [ ] **Change impact prediction** -- Pre-change blast radius, risk-scored impact report, integration into orient analysis phase. Extends v1 blast radius from reactive to predictive.
- [ ] **Context budget awareness** -- Token counting, priority queue, truncation strategy. Required for auto-injection to not blow up the orchestrator's 15K token budget.

### Phase 3: Review + Enforcement (PR Review + Convention Hooks)

Build on the intelligence layer to improve code review and optionally enforce conventions.

- [ ] **Graph-aware PR review** -- `/codescope:review-pr` skill, diff parsing, structural impact, convention check, danger zone flagging. Uses auto-injection infrastructure.
- [ ] **Convention enforcement hooks** -- Opt-in pre-commit via husky + lint-staged + ast-grep, VERIFIED conventions only, `--fix` suggestions. Trust escalation from suggestion to enforcement.

### Phase 4: Visualization + Tracking (Dashboard + Tech Debt)

The most engineering-heavy but least blocking features.

- [ ] **Interactive visualization dashboard** -- sigma.js + @react-sigma/core, convention heatmap, readiness trends, blast radius explorer. Local dev server via Hono.
- [ ] **Technical debt tracking** -- Readiness history in SQLite, trend computation, delta tracking over time.

### Phase 5: Pipeline Maturity (Evolution + Refinement)

Improve the autonomous pipeline based on v2 usage patterns.

- [ ] **Pipeline evolution** -- Per-task qualification, diagnostic failure routing, plan-vs-actual reconciliation. Makes the pipeline more reliable and self-improving.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| Auto-injection hooks | HIGH | HIGH | P1 | 2 |
| Incremental graph updates | HIGH | MEDIUM | P1 | 1 |
| Session continuity | HIGH | MEDIUM | P1 | 1 |
| Change impact prediction | HIGH | MEDIUM | P1 | 2 |
| npx install experience | MEDIUM | LOW | P1 | 1 |
| Graph-aware PR review | HIGH | HIGH | P2 | 3 |
| Convention enforcement hooks | MEDIUM | MEDIUM | P2 | 3 |
| Technical debt tracking | MEDIUM | LOW | P2 | 4 |
| Interactive visualization | MEDIUM | VERY HIGH | P2 | 4 |
| Pipeline evolution | HIGH | HIGH | P2 | 5 |
| Context budget awareness | HIGH | MEDIUM | P1 | 2 |

**Priority key:**
- P1: Must have for v2 launch -- these define the "always-on intelligence layer" narrative
- P2: Should have -- adds significant value but v2 is viable without them
- P3: Nice to have (none in this list -- all are planned features)

## Competitor Feature Analysis

| Feature | code-review-graph | codebase-memory-mcp | Blast Radius (SaaS) | Augment Code | CodeScope v2 Approach |
|---------|-------------------|---------------------|---------------------|--------------|----------------------|
| Graph construction | Tree-sitter, 18 languages, SHA-256 incremental | 66 languages, sub-ms queries, single binary | API/schema/contract analysis | Multi-repo Context Engine | Tree-sitter (TS/JS/Python), graphology, SQLite. Fewer languages but deeper analysis (conventions, communities, danger zones). |
| Auto-context injection | MCP tools, manual invocation | MCP tools, manual invocation | N/A (CI tool) | Automatic, IDE-integrated | Claude Code hooks (PreToolUse/PostToolUse). Invisible injection without MCP tool calls. Unique in the Claude Code plugin ecosystem. |
| PR review | `/code-review-graph:review-pr`, 6.8x token reduction | No PR review | PR comment with impact summary | IDE-integrated review | Structural impact + convention compliance + danger zone flagging. Graph-aware, not just diff-aware. |
| Convention detection | No | No | No | No | ast-grep frequency analysis with confidence levels. Unique in the space. |
| Convention enforcement | No | No | No | No | Opt-in pre-commit hooks for VERIFIED conventions. Progressive trust model. |
| Visualization | No | No | No | No | sigma.js + graphology dashboard with convention heatmaps and readiness trends. |
| Session continuity | No | No | N/A | IDE manages sessions | Handoff documents + resume skill. Filesystem-first, survives compaction. |
| Impact prediction | Blast radius via graph | detect_changes with risk scoring | Cross-repo API/schema impact | Dependency tracing | Pre-change BFS blast radius + risk scoring. Extends v1 from reactive to predictive. |
| Install experience | npm install + MCP config | Download binary, add to MCP config | SaaS signup | IDE extension install | `npx codescope` single command. Detects project, installs plugin, runs onboard + bootstrap. |
| Pipeline autonomy | No pipeline | No pipeline | No pipeline | No pipeline | Full orient-to-ship pipeline (v1) + qualification + diagnostics + reconciliation (v2). Unique. |

## Detailed Feature Specifications

### 1. Auto-Injection Hooks

**How it works in the ecosystem:**
Claude Code hooks fire on 24 events. PreToolUse hooks receive `tool_name` and `tool_input` (including `file_path` for Write/Edit). Hooks return `additionalContext` as a string that gets injected into Claude's conversation context. PostToolUse hooks receive `tool_response` and can inject post-edit feedback. The hook system supports command, HTTP, prompt, and agent handler types.

**CodeScope implementation:**
- PreToolUse hook on `Write|Edit` matcher, with `if: "Edit(*.ts)|Edit(*.js)|Edit(*.py)|Write(*.ts)|Write(*.js)|Write(*.py)"` filtering
- Hook handler reads the target file path from `tool_input.file_path`
- Queries graph cache for: conventions applicable to this file, blast radius neighbors (1-hop), danger zone status, community membership
- Returns `additionalContext` with a compact context brief (~500-1000 tokens max)
- PostToolUse hook runs convention check on the written file, returns violation feedback as `additionalContext`
- All context goes through priority queue with token budget enforcement

**Key insight from research:** The `updatedInput` field in PreToolUse can modify tool parameters before execution. This opens the door for future enhancements like injecting convention-aware code templates, but v2 should start with read-only context injection only.

**Confidence:** HIGH -- Claude Code hooks API is well-documented with 24 event types, `additionalContext` is the standard injection mechanism.

### 2. Graph-Aware PR Review

**How it works in the ecosystem:**
code-review-graph builds a structural map and achieves 6.8x token reduction by providing only relevant context. Greptile V3 uses multi-hop graph investigation. Macroscope uses AST + LLM hybrid analysis. The 2026 trend: system-aware tools that understand relationships between services, shared libraries, and contracts across repositories.

**CodeScope implementation:**
- New `/codescope:review-pr` skill
- Input: git diff (staged or branch comparison)
- Step 1: Parse diff to extract changed files and changed symbols (functions, classes, exports)
- Step 2: Query knowledge graph for each changed symbol -- find callers, dependents, community membership
- Step 3: BFS blast radius from each changed symbol to find downstream impact
- Step 4: Check changed code against detected conventions
- Step 5: Flag changes in danger zones (high centrality, cross-community boundaries)
- Step 6: Generate structured review with severity-ranked findings and structural evidence
- Output: Review findings with graph-backed reasoning, not just LLM opinions

**Key insight from research:** The 2026 shift in code review is from "text diff analysis" to "semantic/structural analysis." GitHub's Octoverse report shows 32% faster merge times and 28% fewer post-merge defects with AI-assisted review. The differentiator is structural evidence.

**Confidence:** HIGH -- v1 already has blast radius, convention checking, danger zone detection, and static verify. PR review is composing these existing capabilities into a new skill.

### 3. Interactive Visualization Dashboard

**How it works in the ecosystem:**
sigma.js renders graphs via WebGL (handles thousands of nodes). graphology serves as the data layer (already in CodeScope's stack). @react-sigma/core provides React integration with hooks and composable components. ForceAtlas2 is the standard layout algorithm. Production deployments show interactive centrality calculation, dynamic data updates, and neighborhood exploration on hover.

**CodeScope implementation:**
- Local dev server: Hono (lightweight, already peer to the ecosystem) serving static React app
- Graph view: sigma.js + @react-sigma/core with graphology data from SQLite
- Layout: ForceAtlas2 (force-directed, clusters communities naturally)
- Coloring: Louvain community assignments (already computed in v1)
- Node sizing: in-degree centrality (already computed in v1)
- Convention heatmap: overlay showing convention adherence per file/module
- Readiness trends: line chart showing readiness score dimensions over time (requires tech debt tracking)
- Blast radius explorer: click a node, see BFS expansion with risk-colored layers
- Command center: pipeline status, last bootstrap time, active learnings count

**Key insight from research:** sigma.js + graphology is the only production-ready graph visualization stack in the JS ecosystem that handles the scale of real codebases (1000+ nodes). React Flow (used by Understand Anything) is better for small, structured diagrams but struggles with large dependency graphs.

**Confidence:** MEDIUM -- sigma.js + graphology integration is well-documented, but the full dashboard (5 views, interactive features) is significant frontend engineering. The VERY HIGH complexity rating reflects this.

### 4. Convention Enforcement Hooks

**How it works in the ecosystem:**
Husky manages git hooks. lint-staged filters staged files for efficient checking. ast-grep has native pre-commit integration (boidolr/ast-grep-pre-commit). ESLint + Prettier + Husky is the standard JS/TS pre-commit stack. ast-grep's lint rule format (YAML with tree-sitter patterns) matches CodeScope's convention detection format.

**CodeScope implementation:**
- Opt-in activation via `/codescope:settings` (never default-enabled)
- Generates `.husky/pre-commit` hook that runs `sg scan` with CodeScope's convention rules
- Only enforces conventions with status VERIFIED in learnings
- Convention rules auto-generated from detected patterns (already in `conventions/runner.ts`)
- lint-staged config for file filtering (only staged TS/JS/Python files)
- Exit code 2 for violations (standard blocking), exit 0 for pass
- `--fix` mode uses ast-grep rewrite rules where applicable
- Bypass with `git commit --no-verify` (standard git escape hatch)

**Key insight from research:** The progressive trust model is critical. v1 builds trust (detect, suggest, verify). v2 optionally enforces. The user must explicitly opt in at each escalation level. This is what differentiates CodeScope from tools that impose conventions.

**Confidence:** HIGH -- Husky + lint-staged + ast-grep is a well-established pattern. The novel part is auto-generating ast-grep rules from detected conventions, which v1 already does.

### 5. Session Continuity

**How it works in the ecosystem:**
Session Context Management MCP for Claude uses `/start` and `/handoff` commands. Claude Code has PreCompact and PostCompact hooks. The filesystem coordination pattern (coordination.md) from v1 already serializes execution state to disk. The core challenge is not "how to save state" (already solved) but "how to restore context efficiently after a compaction or session restart."

**CodeScope implementation:**
- PreCompact hook: generate handoff document summarizing current pipeline state, pending tasks, completed tasks, active findings
- SessionStart hook (matcher: `resume`): detect handoff document, inject as `additionalContext` for the resumed session
- `/codescope:resume` skill: read handoff document, display summary, offer to continue or start fresh
- Handoff document format: structured markdown with frontmatter (task, phase, progress, next steps)
- State stored in `.claude/codescope/sessions/` directory
- Automatic cleanup of sessions older than 7 days

**Key insight from research:** Claude Code's hook system already has `SessionStart` with `source: "resume"` matcher. This fires exactly when we need it. The `PostCompact` hook fires after context compaction, which is the primary cause of state loss. Both hooks support `additionalContext` injection.

**Confidence:** HIGH -- The hook API supports this directly. The v1 filesystem-first architecture means all state already persists to disk.

### 6. Change Impact Prediction

**How it works in the ecosystem:**
Blast Radius (blast-radius.dev) maps downstream impact of PRs by analyzing API, schema, and contract changes. GitNexus assesses blast radius by mapping symbol-level dependencies and execution flows. AI-powered approaches model call graphs, data flows, and historical change patterns to generate blast-radius reports listing files, tests, and services likely to break.

**CodeScope implementation:**
- Extend `handleBlastRadius` to accept a "proposed changes" mode
- Input: list of files + change descriptions (from orient analysis phase)
- For each proposed change: identify affected symbols, BFS from each symbol through graph
- Aggregate blast radii across all proposed changes (union of affected nodes)
- Risk scoring: weight by centrality, community boundary crossings, danger zone overlap
- Output: pre-change impact report with risk classification per affected component
- Integration: orient pipeline's analysis phase calls impact prediction before planning

**Key insight from research:** The difference between v1 blast radius (reactive -- "this file affects these files") and v2 impact prediction (proactive -- "these planned changes will affect these components with these risks") is the difference between a diagnostic tool and a planning tool.

**Confidence:** HIGH -- v1 blast radius BFS is the core algorithm. The extension is straightforward: accept multiple entry points, aggregate results, add risk scoring.

### 7. Technical Debt Tracking

**How it works in the ecosystem:**
NDepend tracks code metrics over time and predicts which technical debts will cause problems. SonarQube provides a "technical debt" metric based on rule violations. Zenhub tracks debt as GitHub issues. The 2026 trend: historical tracking with trend visualization, not just point-in-time snapshots.

**CodeScope implementation:**
- New SQLite table: `readiness_history` (timestamp, dimension, percent, grade, delta)
- On every bootstrap/re-bootstrap: snapshot current readiness scores
- On every incremental update: snapshot affected dimension changes
- Query API: readiness over time, per-dimension trends, improvement velocity
- MCP tool enhancement: `codescope_readiness` returns history and trends alongside current score
- Dashboard integration: line chart showing readiness dimensions over time

**Key insight from research:** v1 already has `DimensionScore.delta` field but it only tracks the delta from the previous run, not historical trends. The gap is persistent history storage. SQLite is already in the stack; adding a table is trivial.

**Confidence:** HIGH -- Simple data model extension to existing readiness system.

### 8. npx Install Experience

**How it works in the ecosystem:**
Claude Code plugins are distributed via marketplaces (GitHub repos with `marketplace.json`) or direct npm packages. The official Anthropic marketplace is auto-available. Community registries like claude-plugins.dev exist. The `npx claude-plugins install` pattern handles marketplace + plugin installation in one command. Best practice: zero-install execution, latest version guaranteed, progressive disclosure (simple first, configure later).

**CodeScope implementation:**
- npm package: `codescope` with `bin: { codescope: "./bin/codescope.js" }`
- `npx codescope` entry point: detect project root, check Claude Code availability
- Step 1: Install plugin to project scope (`/plugin install codescope@...` equivalent)
- Step 2: Offer to run onboard (interactive config)
- Step 3: Offer to run initial bootstrap
- Progress indicators: chalk for colored output, ora for spinners
- Error handling: clear messages if Claude Code not installed, if project not detected
- Marketplace entry: publish to official Anthropic marketplace for discoverability

**Key insight from research:** The best `npx` experiences (create-next-app, create-vite) follow a pattern: detect environment -> ask minimal questions -> execute setup -> show next steps. The worst ones dump configuration options upfront. CodeScope should detect first, ask later.

**Confidence:** HIGH -- npm packaging and npx execution are well-established patterns. The novel part is orchestrating Claude Code plugin installation programmatically.

## Sources

### Claude Code Hooks & Plugins
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- 24 hook events, PreToolUse/PostToolUse API, additionalContext injection, permission decisions
- [Claude Code Plugin Discovery](https://code.claude.com/docs/en/discover-plugins) -- marketplace distribution, /plugin commands, installation scopes
- [Claude Code Hooks Automation Guide](https://www.gend.co/blog/configure-claude-code-hooks-automation) -- practical patterns for hook configuration
- [Claude Code Hooks Production Patterns](https://www.pixelmojo.io/blogs/claude-code-hooks-production-quality-ci-cd-patterns) -- CI/CD integration patterns
- [Claude Code Hooks Complete Guide (March 2026)](https://smartscope.blog/en/generative-ai/claude/claude-code-hooks-guide/) -- comprehensive walkthrough

### Graph Visualization
- [sigma.js](https://www.sigmajs.org/) -- WebGL graph rendering library
- [React Sigma.js Practical Guide](https://www.menudo.com/react-sigma-js-the-practical-guide-to-interactive-graph-visualization-in-react/) -- production-ready React integration
- [Sigma React Graph Visualization](https://lyonwj.com/blog/sigma-react-graph-visualization) -- architecture with graphology
- [Graphology + Sigma.js Exploration](https://dev.to/gabetronic/exploring-network-graph-visualization-graphology-and-sigmajs-5fcg) -- integration patterns
- [sigma.js GitHub](https://github.com/jacomyal/sigma.js/) -- library source and examples

### Code Review & Impact Analysis
- [code-review-graph GitHub](https://github.com/tirth8205/code-review-graph) -- 6.8x token reduction, Tree-sitter graph, MCP integration
- [Blast Radius](https://blast-radius.dev/) -- cross-repo impact analysis for PRs
- [AI Code Review Tools 2026](https://dev.to/heraldofsolace/the-best-ai-code-review-tools-of-2026-2mb3) -- ecosystem overview
- [State of AI Code Review 2026](https://dev.to/rahulxsingh/the-state-of-ai-code-review-in-2026-trends-tools-and-whats-next-2gfh) -- shift to structural analysis

### Convention Enforcement
- [Pre-commit Framework](https://pre-commit.com/) -- multi-language pre-commit hooks
- [ast-grep Pre-commit](https://github.com/boidolr/ast-grep-pre-commit) -- structural lint with pre-commit
- [Husky + lint-staged Guide](https://builtin.com/articles/lint-staged-with-husky-pre-commit) -- standard JS/TS pre-commit pattern
- [ast-grep Lint Rules](https://ast-grep.github.io/guide/project/lint-rule.html) -- YAML rule format for convention enforcement
- [Pre-commit Hooks Code Quality (2026)](https://oneuptime.com/blog/post/2026-01-25-pre-commit-hooks-code-quality/view) -- modern best practices

### Technical Debt & Readiness
- [Technical Debt Management Tools 2025](https://www.zenhub.com/blog-posts/the-top-technical-debt-management-tools-2025) -- ecosystem overview
- [Technical Debt Measurement Tools 2026](https://www.codeant.ai/blogs/tools-measure-technical-debt) -- modern tools
- [Developer's Guide to Technical Debt](https://medium.com/@hackastak/the-developers-guide-to-technical-debt-tools-that-actually-help-285c53240a84) -- practical approaches

### Competitive Intelligence
- [codebase-memory-mcp GitHub](https://github.com/DeusData/codebase-memory-mcp) -- 66 languages, sub-ms queries, single binary
- [Claude Code Plugin Ecosystem 2026](https://aitoolanalysis.com/claude-code-plugins/) -- 9,000+ extensions
- [AI Code Editors 2026](https://www.syncfusion.com/blogs/post/ai-code-editors-2026) -- Windsurf, Cursor, Augment context injection patterns
- [AI Tools for Complex Codebases](https://www.augmentcode.com/tools/13-best-ai-coding-tools-for-complex-codebases) -- multi-repo intelligence

### Session Continuity
- [Session Context Management MCP](https://mcp.aibase.com/server/1639703163391189724) -- /start and /handoff commands
- [AI Coding Assistant Challenges](https://medium.com/@timbiondollo/how-i-solved-the-biggest-problem-with-ai-coding-assistants-and-you-can-too-aa5e5af80952) -- context loss as primary problem

### Install Experience
- [NPX CLI Tool Building](https://johnsedlak.com/blog/2025/03/building-an-npx-cli-tool) -- best practices
- [NPX Script Project Setup](https://getstream.io/blog/npx-script-project-setup/) -- scaffolding patterns
- [Claude Plugins Official](https://github.com/anthropics/claude-plugins-official) -- official marketplace structure

---
*Feature research for: CodeScope v2.0 Intelligence Layer*
*Researched: 2026-03-27*
