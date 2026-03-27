# Project Research Summary

**Project:** CodeScope v2.0
**Domain:** Claude Code plugin — always-on codebase intelligence layer with auto-injection, interactive visualization, convention enforcement, and npx distribution
**Researched:** 2026-03-27
**Confidence:** HIGH

## Executive Summary

CodeScope v2.0 is a Claude Code plugin that turns the existing v1.0 MCP knowledge graph into an invisible intelligence layer. The central insight from research is that v2 is an _integration and automation_ project, not a greenfield build: every major v2 feature (auto-injection, PR review, convention enforcement, session continuity, visualization) has a direct, buildable dependency in the v1.0 codebase. The recommended approach is to ship features in dependency order — incremental graph updates and session continuity first (everything else breaks without fresh data), then auto-injection (the flagship feature), then review and enforcement, and finally the visualization dashboard (the most engineering-intensive but least blocking).

The stack additions for v2 are well-justified and low-risk. sigma.js + graphology is the only credible graph visualization pairing in the JS ecosystem that handles real codebase scale (1,000–10,000+ nodes). Hono + @hono/node-ws is the right-weight HTTP/WebSocket server for 5 routes and a dashboard. @napi-rs/canvas handles server-side heatmap rendering without the system-dependency nightmares of node-canvas. Claude Code's hooks API (25 event types, `additionalContext` injection) is the mechanism that makes auto-injection invisible. None of these require replacing anything in v1's validated stack.

The dominant risk in v2 is context bloat: PreToolUse hooks firing on every Write/Edit tool call can inject 25K–200K tokens per session, accelerating auto-compaction and causing agents to lose task context mid-execution. This must be designed out from day one with a 500-token injection budget cap, deduplication by file path, and a long-running hook daemon (or MCP server endpoint) to avoid cold-start latency per invocation. A secondary risk cluster covers graph state corruption during incremental updates (requiring CASCADE deletes and reverse dependency re-resolution) and better-sqlite3 native addon failures on `npx` installs (requiring prebundled platform binaries). All critical pitfalls have known mitigations and must be addressed in the phase that introduces them, not retrofitted.

## Key Findings

### Recommended Stack

The v1.0 stack (TypeScript 5.7, Node.js 22.x, @modelcontextprotocol/sdk 1.27.1, better-sqlite3, graphology, web-tree-sitter, enhanced-resolve, ast-grep, vitest, tsdown, zod) is unchanged. v2.0 adds 11 packages across 4 concerns. See [STACK.md](STACK.md) for full version pinning and alternatives analysis.

**Core v2 additions:**
- `sigma@^3.0.2` + `@sigma/edge-curve`, `@sigma/node-image`, `@sigma/export-image`: WebGL graph visualization — the only JS library that natively reads graphology and renders 10K+ nodes without DOM thrashing
- `graphology-layout-forceatlas2@^0.10.1` + `graphology-layout@^0.6.1` + `graphology-layout-noverlap@^0.4.2`: Force-directed layout (ForceAtlas2 is the Gephi-heritage standard for knowledge graphs); `circular.assign()` must run before FA2 or layout diverges
- `hono@^4.12.9` + `@hono/node-server@^1.19.11` + `@hono/node-ws@^1.3.0`: 14KB HTTP + WebSocket server for the dashboard; right weight for 5 routes + static files (Express is legacy, Fastify is overkill, socket.io adds 100KB of unneeded features)
- `@napi-rs/canvas@^0.1.97`: Skia-backed server-side canvas for heatmap/gauge PNGs; zero system dependencies vs. node-canvas's Cairo/Pango requirement
- `commander`: CLI framework for npx entry point (75M+ weekly downloads, built-in TypeScript types)
- Claude Code Hooks API (built-in): 25 event types; `additionalContext` is the injection mechanism; hooks compiled to `dist/hooks/` and referenced from `hooks/hooks.json` in the plugin manifest
- Git `core.hooksPath` (built-in git): opt-in pre-commit enforcement without husky/lint-staged modifying user infrastructure

**Critical version notes:**
- `@hono/node-ws@^1.3.0` is MEDIUM confidence (3 months old) but bundles battle-tested `ws@^8.17.0` as a direct dependency
- `@napi-rs/canvas@^0.1.97` is pre-1.0 but actively maintained; fallback is SVG string generation + sharp for PNG conversion
- sigma.js is browser-only (WebGL + DOM required); server-side graph images must use @napi-rs/canvas
- ForceAtlas2 Web Worker requires `circular.assign()` first — nodes at (0,0) cause divergence or hang

### Expected Features

Research identifies a clear 5-phase delivery order based on hard dependency chains. See [FEATURES.md](FEATURES.md) for full competitor analysis, detailed specifications, and dependency graph.

**Must have — P1 (define the "always-on" narrative):**
- Incremental graph updates — hash-based, on-demand, sub-2s latency; required by auto-injection, enforcement, and visualization freshness
- Auto-injection hooks — PreToolUse/PostToolUse on Write/Edit; invisible context injection; the flagship v2 feature; requires fresh graph data
- Context budget awareness — 500-token cap per injection, priority queue, deduplication by file path; required for auto-injection to not destroy the 15K-token orchestrator budget
- Change impact prediction — proactive pre-change blast radius extending v1's reactive analysis
- Session continuity — handoff documents at PreCompact, resume skill, commit SHA tracking for stale-detection on resume
- npx install experience — independent of all other features; easy win; enables marketplace discoverability

**Should have — P2 (significant value, v2 viable without them):**
- Graph-aware PR review — diff parsing + BFS blast radius + convention check + danger zone flagging; requires incremental updates and impact prediction
- Convention enforcement hooks — opt-in pre-commit via git `core.hooksPath`, VERIFIED conventions only, warn-only default
- Technical debt tracking — `readiness_history` SQLite table, trend computation; trivial extension of existing `ReadinessScore`
- Interactive visualization dashboard — sigma.js + graphology, convention heatmaps, readiness trends; requires tech debt tracking for the trends panel
- Pipeline evolution — qualification, diagnostic routing, reconciliation (P2, informed by v2 usage patterns)

**Explicit anti-features (do not build in v2):**
- Real-time filesystem watchers — web-tree-sitter memory leaks with persistent parsing
- Blocking all conventions by default — destroys the trust-building model
- Full IDE extension (VS Code/JetBrains) — fragmentation; MCP is the universal adapter
- Cross-repository analysis — deferred to v3
- Semantic/embedding search — requires Ollama or cloud API; deferred to v3

### Architecture Approach

v2.0 adds capabilities to the existing layered architecture without restructuring it. The MCP server (StdioServerTransport) is the only process that writes to `graph.db`; the dashboard is a separate Node.js process that reads from it. Hook scripts are compiled TypeScript in `dist/hooks/` because the installed plugin only has built artifacts. The npx CLI is a separate tsdown entry point. All new features reuse existing v1 modules (`getGraph()`, `blastRadius()`, `conventions/runner.ts`, `classifyRisk()`) rather than building parallel implementations. See [ARCHITECTURE.md](ARCHITECTURE.md) for complete component diagrams, module signatures, and modified file lists per feature.

**Major new components:**
1. `hooks/hooks.json` + `src/hooks/` (inject-context.ts, convention-check.ts, compact-preserve.ts, pre-commit-check.ts) — Claude Code lifecycle integration; hook scripts read disk artifacts only, no SQLite in the hook process
2. `src/graph/staleness.ts` + `src/graph/delta-reparse.ts` — incremental graph engine; algorithm: `git diff --name-status` for renames, delete old nodes (CASCADE removes edges), re-parse with tree-sitter, insert new nodes/edges in a single `db.transaction()`; community detection NOT recomputed on delta (940ms, too expensive)
3. `src/dashboard/server.ts` + `dashboard/` (frontend SPA) — separate Node.js process; vanilla HTML/JS (no React); Hono + @hono/node-ws; sigma.js from CDN in `index.html`; pre-built static files; WebSocket pushes incremental events
4. `src/review/` (diff-parser.ts, impact-analyzer.ts, review-generator.ts) + `src/tools/review.ts` — PR review pipeline; composes existing `getGraph()`, `blastRadius()`, `classifyRisk()`, `conventions/runner.ts`; adds rename detection via `git diff --diff-filter=R`
5. `src/session/` (serializer.ts, handoff-writer.ts) — session continuity; writes `handoff.md` to `.claude/codescope/`; SessionStart hook injects it as `additionalContext`
6. `src/cli/index.ts` — commander-based CLI; subcommands: `init`, `bootstrap`, `dashboard`, `install-hooks`

**Non-negotiable architectural constraints:**
- MCP server uses StdioServerTransport — any HTTP stdout from the same process corrupts the MCP protocol; dashboard MUST be a separate process
- Sub-agents communicate through filesystem (Issue #5812); all handoff state must be on disk, not in agent return values
- Graph cache is a module-level singleton — cache invalidation after delta must come after `db.transaction()` commits, not before
- better-sqlite3 has no busy timeout by default — `db.pragma("busy_timeout = 5000")` must be in `openDatabase()` before shipping incremental updates

### Critical Pitfalls

Full analysis with warning signs, recovery paths, and a "looks done but isn't" checklist in [PITFALLS.md](PITFALLS.md).

1. **Context bloat destroying token budget** — PreToolUse hooks injecting 500–2000 tokens per call accumulate to 25K–200K tokens per session, triggering auto-compaction that discards task context mid-execution. Fix: 500-token hard cap per injection, deduplication by file path, graduated injection (full on first touch, nothing on repeat), long-running hook daemon or MCP server HTTP endpoint to avoid cold-start latency. Must be implemented from day one in Phase 2, not retrofitted.

2. **Incremental graph producing partial/corrupt state** — File renames delete old nodes but leave dangling edges from unchanged files that imported the old path, causing silent BFS truncation and corrupted community detection. Fix: `ON DELETE CASCADE` on edges foreign keys, reverse dependency re-resolution before delete, single `db.transaction()` for the full update cycle, cache invalidation only after commit succeeds.

3. **SQLite SQLITE_BUSY during concurrent MCP tool + incremental update** — better-sqlite3 throws immediately on contention by default. Fix: `db.pragma("busy_timeout = 5000")` in `openDatabase()`, `BEGIN IMMEDIATE` for write transactions, single-writer mutex flag, periodic WAL checkpointing. One-line fix that must be in place before incremental updates ship.

4. **better-sqlite3 native addon failing on `npx` install** — prebuild-install fails in npx's temp directory; falls back to node-gyp which requires Python + C++ toolchain; documented failure on Apple Silicon. Fix: bundle platform prebuilt binaries in the npm package, include grammar `.wasm` files in `package.json#files`, test `npx --yes codescope` on all 5 target platform/Node combinations in CI.

5. **PreToolUse hook cold-start latency blocking the agent loop** — ~200ms cold start per invocation (Node.js start + SQLite open + query); 50 tool calls = 10s cumulative lag. Fix: long-running HTTP daemon (hook script becomes a thin `curl` call) or add an HTTP endpoint to the MCP server process. Exit-code-only (no `additionalContext`) for files not in known danger zones. Prefetch danger zone list to disk on SessionStart.

6. **sigma.js memory leak on destroy/recreate cycles** — WebGL contexts not fully released by `.kill()`; 5–10 dashboard refreshes can consume 500MB+ and lose the WebGL context. Fix: single sigma instance, swap data with `graph.clear()` + `graph.import()`, use `sigma.scheduleRefresh()` (not `.refresh()`), `nodeReducer` to hide off-screen nodes.

7. **Pre-commit hook false positives blocking developer commits** — framework-required patterns (Next.js `export default` in `pages/`) conflict with detected conventions; one false block destroys trust permanently. Fix: opt-in only, warn-only default, HIGH-CONF threshold only (>80% adoption, >10 files), framework-aware exception lists, `.codescope-ignore` support, staleness degradation to warn-only after 7 days.

## Implications for Roadmap

Based on feature dependencies, architectural constraints, and pitfall ordering requirements, the recommended phase structure is 5 phases:

### Phase 1: Foundation — Incremental Graph + Session Continuity + npx Distribution
**Rationale:** Incremental graph updates are the hard prerequisite for every other v2 feature — auto-injection (Phase 2), convention enforcement (Phase 3), and visualization freshness (Phase 4) all break without fresh graph data. Session continuity depends only on existing v1 filesystem coordination and is low-effort. npx distribution is fully independent and establishes the packaging pipeline early; subsequent phases just add sub-commands.
**Delivers:** Always-fresh graph data triggered on demand, session pause/resume, single-command install from npm
**Addresses:** Incremental graph updates, session continuity, npx install experience
**Must implement in this phase:** `ON DELETE CASCADE` on edges foreign keys, reverse dependency re-resolution, `busy_timeout` pragma, `--name-status` git diff (not `--name-only`) for rename awareness, platform-bundled prebuilt binaries in npm package, grammar `.wasm` files in `package.json#files`
**Avoids:** Pitfalls 2 (graph corruption), 3 (SQLITE_BUSY), 4 (npx install failure), and 11 (stale session handoff)

### Phase 2: Intelligence Layer — Auto-Injection + Impact Prediction
**Rationale:** Auto-injection is the flagship v2 feature but requires fresh graph data (Phase 1) and must have context budget controls built in architecturally — not added as an afterthought. Impact prediction extends v1's blast radius to proactive pre-change mode and directly feeds the Phase 3 PR review skill.
**Delivers:** Invisible codebase context on every file edit, pre-change risk assessment, context budget management
**Addresses:** Auto-injection hooks, context budget awareness, change impact prediction
**Uses:** Claude Code Hooks API, compiled hook scripts in `dist/hooks/`, SessionStart/PreToolUse/PostToolUse/PreCompact events
**Must implement in this phase:** 500-token injection cap, file-path deduplication set, hook daemon or MCP server HTTP endpoint (not cold-start per invocation), graduated injection decay, danger zone prefetch on SessionStart
**Avoids:** Pitfalls 1 (context bloat), 6 (hook cold-start latency)

### Phase 3: Review + Enforcement — PR Review + Convention Hooks
**Rationale:** Both features compose Phase 1/2 capabilities with v1 modules. PR review needs incremental graph and impact prediction. Convention enforcement needs fresh conventions and benefits from auto-injection's hook infrastructure. They ship as a natural pair and are lower engineering effort than the dashboard.
**Delivers:** Structural PR impact analysis with danger zone flagging, opt-in commit-blocking convention enforcement
**Addresses:** Graph-aware PR review, convention enforcement hooks
**Uses:** `src/review/` components, `git diff --diff-filter=R` for rename detection, git `core.hooksPath`
**Must implement in this phase:** Rename detection as first step before any graph queries, HIGH-CONF-only enforcement, warn-only default with explicit opt-in to block mode, framework-aware exception lists (Next.js, Remix, Nuxt routes exempted), `.codescope-ignore` support
**Avoids:** Pitfalls 7 (pre-commit false positives), 10 (PR review false positives on renames), 12 (framework-specific pattern conflicts)

### Phase 4: Visualization + Technical Debt Tracking
**Rationale:** Dashboard is the most engineering-intensive feature (separate server process, sigma.js lifecycle, 5 views, WebSocket reconnection). Technical debt tracking (a single SQLite table) is a prerequisite for the trends panel but trivial to implement. Grouping them together is natural. Deferring to Phase 4 means the graph data will have had time to accumulate history.
**Delivers:** Interactive dependency graph explorer, convention heatmap, readiness trends over time, blast radius explorer, persistent debt history
**Addresses:** Interactive visualization dashboard, technical debt tracking
**Uses:** sigma@^3.0.2, graphology-layout-forceatlas2@^0.10.1, hono@^4.12.9, @hono/node-ws@^1.3.0, @napi-rs/canvas@^0.1.97
**Architecture constraint:** Dashboard process is isolated from MCP server (StdioServerTransport constraint — shared process would corrupt MCP protocol); reads `graph.db` and artifact files directly
**Must implement in this phase:** Single sigma instance with data-swap pattern (not destroy/recreate), `scheduleRefresh()` not `refresh()`, pre-computed FA2 layout stored in SQLite, WebSocket bound to 127.0.0.1 only, full graph snapshot on reconnect (not event replay), node label threshold (`labelRenderedSizeThreshold`) to prevent label rendering at full scale
**Avoids:** Pitfalls 5 (sigma memory leak), 8 (WebSocket listener leak), 9 (layout thrashing on live updates)

### Phase 5: Pipeline Maturity — Qualification, Diagnostics, Reconciliation
**Rationale:** Pipeline evolution improves every execution but nothing strictly requires it — v1 pipeline is functional without qualification scoring or failure routing. This phase is best informed by v2 usage patterns from Phases 1–4 (what tasks fail, at what confidence levels, and why). Deferring it produces better thresholds and routing rules.
**Delivers:** Higher autonomous execution reliability, self-correcting pipeline that classifies failures and routes to appropriate debug strategy, plan-vs-actual drift detection
**Addresses:** Pipeline evolution (FEATURES.md P2)
**Uses:** Existing orient pipeline, orchestrator, eval/debug agents; adds qualification scoring and reconciliation modules

### Phase Ordering Rationale

- **Dependency chain is the primary driver:** Incremental graph is a hard prerequisite for 4 of the 5 remaining features. Shipping it in Phase 1 eliminates a silent failure mode from every downstream phase.
- **Risk is front-loaded:** The two highest-impact pitfalls (context bloat from auto-injection, graph corruption from incremental updates) are addressed in Phases 1–2 where they would otherwise silently degrade every session from day one.
- **Dashboard isolated late:** The separate-process architecture requirement (StdioServerTransport constraint) means the dashboard has no integration shortcuts. Placing it in Phase 4 gives the team time to implement earlier phases cleanly before taking on the largest frontend engineering effort.
- **Pipeline evolution last by design:** Usage data from v2 beta informs threshold calibration better than any upfront spec. Deferring to Phase 5 produces a better feature.
- **npx bundled in Phase 1 not because it depends on Phase 1 features** (it is independent) **but because establishing the packaging pipeline early** means all subsequent phases simply add sub-commands rather than re-engineering distribution.

### Research Flags

Phases likely needing `/gsd:research-phase` deeper analysis during planning:

- **Phase 2 (hook daemon architecture):** The choice between a long-running HTTP daemon vs. an HTTP endpoint added to the MCP server process needs a concrete design decision before implementation. The MCP server approach is cleaner but requires proving no HTTP output contaminates stdout. A focused design session and prototype are recommended before Phase 2 tasks are created.
- **Phase 4 (FA2 Web Worker + tsdown bundling):** graphology-layout-forceatlas2's Web Worker uses inline blob workers. ESM bundlers (tsdown/Rolldown) may need special configuration. Build a small standalone proof-of-concept before committing to the full dashboard implementation plan.
- **Phase 5 (qualification thresholds):** Cannot fully specify qualification thresholds and diagnostic routing logic until v2 beta generates empirical failure data. Phase 5 planning should be deferred until after Phase 3–4 are in use.

Phases with standard patterns (skip research-phase):

- **Phase 1 (incremental graph):** SQLite CASCADE deletes, reverse dependency tracking, WAL busy_timeout, and `--name-status` git diff parsing are fully specified in ARCHITECTURE.md and PITFALLS.md.
- **Phase 1 (npx distribution):** npm packaging, commander CLI, and prebuild binary bundling are standard and well-documented.
- **Phase 3 (convention enforcement):** git `core.hooksPath` pattern, ast-grep YAML scan, opt-in install flow are fully specified in ARCHITECTURE.md with shell script examples.
- **Phase 3 (PR review):** Unified diff parsing and graph query composition directly reuse existing modules; architecture is fully specified.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All 11 new packages verified via npm registry with version pins and full compatibility matrix. Two MEDIUM items (@hono/node-ws, @napi-rs/canvas) have documented fallbacks. No version conflicts with v1 stack. |
| Features | HIGH | Dependency graph is internally consistent. Competitor analysis confirms differentiators. Anti-features have clear rationale. Phase ordering follows hard dependency chain. |
| Architecture | HIGH (hooks, incremental, session, CLI, PR review) / MEDIUM (dashboard server process, hook daemon) | Hook scripts, incremental graph modules, CLI structure, and session serializer are specified to code-module level. Dashboard separate-process requirement verified by StdioServerTransport constraint. Hook daemon architecture is a design decision not yet made. |
| Pitfalls | HIGH | 12 pitfalls with specific warning signs, prevention steps, recovery strategies, and phase tagging. Critical cluster (context bloat, graph corruption, SQLITE_BUSY, native addon install failure) verified against GitHub issues and v1.0 codebase analysis. |

**Overall confidence:** HIGH

### Gaps to Address

- **Hook daemon vs. MCP server HTTP endpoint:** Both prevent cold-start latency. MCP server endpoint approach is architecturally cleaner but requires proving no HTTP output reaches stdout. Needs a concrete decision in Phase 2 planning before any implementation starts.
- **FA2 Web Worker + tsdown/Rolldown bundling:** Web Worker inline blob behavior with ESM bundlers is documented to cause issues. Build a minimal proof-of-concept (`circular.assign()` + FA2 Web Worker + sigma render) with the tsdown config during Phase 4 architecture before committing to implementation tasks.
- **@napi-rs/canvas 0.x API stability:** Pre-1.0 versioning means minor API changes are possible. Keep the SVG-to-sharp fallback path active until the package hits 1.0 or a long-running stable 0.x tag is confirmed.
- **Session handoff edge cases:** Force-push scenarios (commit SHA in handoff no longer exists in git history) and detached HEAD states need explicit handling. The commit SHA check on resume should gracefully degrade (warn, offer re-orient) rather than error, since these states occur on legitimate branches.

## Sources

### Primary (HIGH confidence)

- Claude Code Hooks Reference (code.claude.com/docs/en/hooks) — 25 event types, additionalContext, exit codes, matcher regex, PreToolUse/PostToolUse/SessionStart/PreCompact behavior, hookSpecificOutput schema
- sigma.js npm (npmjs.com/package/sigma) + GitHub (github.com/jacomyal/sigma.js) — v3.0.2, WebGL instanced rendering, @sigma package ecosystem, peer dependencies
- graphology-layout-forceatlas2 docs (graphology.github.io/standard-library/layout-forceatlas2.html) — Web Worker mode, Barnes-Hut optimization, inferSettings, peer dependencies
- hono npm (npmjs.com/package/hono) + @hono/node-server npm + @hono/node-ws npm — v4.12.9, v1.19.11, v1.3.0, Node.js adapter setup, serveStatic, upgradeWebSocket API
- @napi-rs/canvas npm + GitHub (github.com/Brooooooklyn/canvas) — v0.1.97, Skia backend, zero system deps, prebuilt platform matrix
- web-tree-sitter GitHub issue #5171 — confirmed 0.26.x WASM ABI break; rationale for 0.25.x pin
- @modelcontextprotocol/sdk npm + GitHub TypeScript SDK — v1.27.1 stable; v2.x pre-alpha confirmed; zod@^3.25 compatibility
- better-sqlite3 npm (v12.8.0) + discussions re: node:sqlite — synchronous API, WAL mode, busy_timeout, prebuild-install behavior

### Secondary (MEDIUM confidence)

- code-review-graph GitHub (github.com/tirth8205/code-review-graph) — 6.8x token reduction, structural graph for PR review, SHA-256 incremental update pattern
- boidolr/ast-grep-pre-commit — ast-grep structural lint pre-commit integration pattern
- Session Context Management MCP (mcp.aibase.com) — /start and /handoff command patterns for session continuity
- Claude Code hooks community guides (gend.co, pixelmojo.io, smartscope.blog) — practical hook configuration patterns and common mistakes
- graphology-communities-louvain npm — Louvain benchmarks (50K nodes + 1M edges in ~940ms); community recomputation cost

### Tertiary (LOW confidence)

- ruvnet/claude-flow#360 — better-sqlite3 Apple Silicon npx failure report; pattern applies, specific Node.js version details may differ
- jacomyal/sigma.js#795, #1321, #1516 — sigma memory leak and batch update patterns; closed issues in older versions; behavior may have improved in v3.0.2 but pattern guidance remains valid

---
*Research completed: 2026-03-27*
*Ready for roadmap: yes*
