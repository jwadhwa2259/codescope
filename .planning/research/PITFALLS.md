# Pitfalls Research

**Domain:** CodeScope v2.0 -- Intelligence Layer, Interactive Dashboard, npx Distribution
**Researched:** 2026-03-27
**Confidence:** HIGH (verified against Claude Code hooks docs, sigma.js GitHub issues, better-sqlite3 distribution reports, existing v1.0 codebase analysis)

**Scope:** Pitfalls specific to adding auto-injection hooks, graph visualization (sigma.js), pre-commit enforcement, incremental graph updates, WebSocket communication, npx distribution, session handoff, and PR review to the existing CodeScope v1.0 MCP plugin.

**Note:** v1.0 pitfalls (sub-agent file content blindness Issue #5812, context:fork silently ignored Issue #17283, sub-agent write sandboxing Issue #9458, web-tree-sitter memory leaks, better-sqlite3 WAL basics) remain valid. This document covers NEW pitfalls for v2.0 features.

---

## Critical Pitfalls

### Pitfall 1: Auto-Injection Context Bloat Destroying Token Budget

**What goes wrong:**
PreToolUse hooks inject codebase context (conventions, blast radius, danger zones) before every matched tool call. Each injection adds 500-2000 tokens via `additionalContext`. On a typical orient-execute session with 50-100 tool calls, this adds 25K-200K tokens of injected context. Claude Code's auto-compaction triggers at ~83.5% of the context window. With a 200K context Sonnet session, 33K is already reserved as buffer. Injected context accelerates compaction, which discards earlier conversation turns -- including the user's original task description, clarification answers, and plan details. The agent loses its mission mid-execution.

**Why it happens:**
The temptation is to inject everything useful -- conventions for the current file, blast radius of the target, danger zone warnings, recent learnings. Each individual injection seems small and helpful. But PreToolUse fires on every Write, Edit, Bash, and Read call. The cumulative cost is invisible until compaction destroys critical context. Claude Code Issue #29971 documents this exact pattern: MCP tools loaded unconditionally, context cost hidden from users, duplication wasting 3K-5K tokens per session.

**How to avoid:**
1. **Budget cap**: Hard limit of 500 tokens per injection. Measure with a token estimator (4 chars per token heuristic) before returning `additionalContext`.
2. **Selective triggering**: Only inject on Write and Edit tool calls, not Read/Glob/Grep/Bash. Use the `if` matcher field to narrow scope: only fire for files in known danger zones or files touching conventions.
3. **Deduplication**: Track what has already been injected this session via a Set of file paths. Never re-inject the same convention guidance for the same file. Store injection history in a session-scoped file at `.claude/codescope/session-injections.json`.
4. **Graduated injection**: First edit to a file gets full context (conventions + blast radius). Subsequent edits to the same file get nothing or a one-line reminder. Decay injection detail over repeated touches.
5. **Staleness check**: If bootstrap data is >7 days old, inject a one-line warning instead of full context. Stale data injected confidently is worse than no data.

**Warning signs:**
- Auto-compaction triggering during execution (visible in Claude Code UI as "Compacting conversation...")
- Agent asking "what was the original task?" or re-reading the plan file mid-execution
- Sessions consuming 2-3x expected tokens for the same task complexity
- `/context` showing >40% of tokens consumed by non-conversation content

**Phase to address:**
Auto-injection hooks phase -- must implement budget cap and selective triggering from day one. Adding budget controls after launch means existing users already experience degraded sessions.

---

### Pitfall 2: Incremental Graph Update Producing Partial/Corrupt State

**What goes wrong:**
When a file is renamed or moved, the incremental updater deletes old nodes and inserts new ones. But edges from OTHER files that pointed to the old node IDs now reference nonexistent nodes. The graph becomes internally inconsistent: queries return partial results, blast radius BFS terminates early at dangling edges, community detection produces fragmented clusters. The cached graphology instance (5-min TTL in `src/graph/cache.ts`) serves the corrupt graph to all MCP tool handlers until TTL expires.

**Why it happens:**
The v1.0 graph builder uses a two-pass batch insert (nodes first, then edges resolved by name+file_path lookup in `src/graph/batch-writer.ts`). Incremental updates that only re-process changed files miss the edge resolution step for unchanged files that import the changed file. The `processBatchFiles` function deletes processed JSONL files after insert but does not cascade-delete edges referencing removed nodes. SQLite foreign keys are ON but the schema uses `REFERENCES` without `ON DELETE CASCADE`.

**How to avoid:**
1. **Cascade deletes**: Add `ON DELETE CASCADE` to the edges table foreign keys (`source_id REFERENCES nodes(id) ON DELETE CASCADE`, same for `target_id`). This ensures removing a node automatically removes all edges pointing to/from it.
2. **Reverse dependency tracking**: Before deleting nodes for a changed file, query all edges where the file's nodes are targets (`SELECT DISTINCT source_id FROM edges WHERE target_id IN (SELECT id FROM nodes WHERE file_path = ?)`). Re-process those source files' edges in the same transaction.
3. **Transaction isolation**: Wrap the entire incremental update (delete old nodes + insert new nodes + re-resolve affected edges + invalidate cache) in a single `db.transaction()`. If any step fails, the entire update rolls back and the old graph remains valid.
4. **Cache invalidation timing**: Call `invalidateCache()` AFTER the transaction commits, not before. The current v1.0 pattern in `src/graph/cache.ts` uses a module-level `cached` variable -- add a version counter that increments on every successful graph write, so stale reads are detected even within the TTL window.

**Warning signs:**
- `codescope_blast_radius` returning fewer nodes than expected for high-centrality files
- `codescope_graph_query` returning edges with `null` target names
- Community detection producing many single-node communities after an incremental update
- Errors in batch-writer: "Edge skipped: source or target not found" appearing for files that were NOT changed

**Phase to address:**
Incremental graph update phase -- must fix the schema (CASCADE) and implement reverse dependency tracking before shipping incremental updates. A corrupt graph silently degrades every downstream tool.

---

### Pitfall 3: SQLite SQLITE_BUSY During Concurrent MCP Tool + Incremental Update

**What goes wrong:**
The MCP server handles tool calls synchronously (better-sqlite3's synchronous API). An incremental graph update writes to graph.db while an MCP tool handler reads from it. In WAL mode, concurrent reads are fine, but if the tool handler opens a read transaction and the updater attempts a write, or vice versa, SQLITE_BUSY errors occur. With better-sqlite3's default configuration (no busy timeout), these throw immediately and crash the tool handler.

**Why it happens:**
The v1.0 code opens a new database connection per operation (`getGraph()` opens, reads, closes in `src/graph/cache.ts`). The incremental updater will also open its own connection. WAL mode allows concurrent readers with a single writer, but: (a) if a reader tries to upgrade to a writer mid-transaction, SQLITE_BUSY is thrown; (b) checkpoint operations can briefly block readers; (c) better-sqlite3 does not set a busy timeout by default.

**How to avoid:**
1. **Set busy timeout**: Add `db.pragma("busy_timeout = 5000")` to `openDatabase()` in `src/graph/database.ts`. This makes SQLite retry for 5 seconds before throwing SQLITE_BUSY. This is a one-line fix that prevents 90% of concurrent access errors.
2. **Use BEGIN IMMEDIATE for writes**: Never let a read transaction upgrade to write. The incremental updater should use `BEGIN IMMEDIATE` (better-sqlite3's `db.transaction()` does this by default for write transactions, but verify).
3. **Single writer pattern**: Ensure only one process writes to graph.db at a time. Since the MCP server is a single Node.js process, use a mutex/semaphore for graph writes. A simple boolean flag (`isUpdating`) checked before tool handlers open the database is sufficient.
4. **Periodic checkpointing**: Call `db.pragma("wal_checkpoint(TRUNCATE)")` after large batch writes to prevent WAL file growth. Without checkpointing, the WAL file grows unbounded during sustained incremental updates, degrading read performance.

**Warning signs:**
- MCP tool handlers returning "SQLITE_BUSY" errors intermittently
- WAL file (graph.db-wal) growing to multiple MB
- Graph queries taking >100ms (the GRPH-05 constraint) after incremental updates
- Tool responses alternating between success and error for the same query

**Phase to address:**
Incremental graph update phase -- the busy_timeout pragma should be added to `openDatabase()` immediately. The single-writer mutex should be implemented alongside the incremental update feature.

---

### Pitfall 4: better-sqlite3 Native Addon Failing on npx Install

**What goes wrong:**
Running `npx codescope` on a fresh machine fails because better-sqlite3 requires native binaries compiled for the target platform (darwin-arm64, linux-x64, win32-x64). npx creates a temporary install directory where prebuild-install may not find or download the correct prebuilt binary. The postinstall script falls back to node-gyp compilation, which requires Python and a C++ toolchain that many users do not have. On macOS ARM64 (Apple Silicon), this is a documented failure mode (GitHub: ruvnet/claude-flow#360).

**Why it happens:**
better-sqlite3 uses prebuild-install to download prebuilt binaries from GitHub releases. But: (a) npx installs to a temporary cache directory with non-standard paths, confusing prebuild-install's path resolution; (b) prebuilt binaries may not exist for all Node.js version + platform combinations (Node.js 24 + ARM64 has reported issues); (c) the postinstall script adds 30+ seconds to install time even when prebuilts work.

**How to avoid:**
1. **Provide a fallback SQLite strategy**: Detect at startup whether better-sqlite3 loaded successfully. If not, fall back to `node:sqlite` (available in Node.js 22+ with `--experimental-sqlite` flag) or emit a clear error with installation instructions. Do NOT silently degrade to in-memory-only.
2. **Pre-bundle the native addon**: Use `@aspect-build/napi-pack` or similar tool to bundle prebuilt binaries for common platforms (darwin-arm64, darwin-x64, linux-x64, linux-arm64, win32-x64) directly in the npm package. This eliminates the prebuild-install download step.
3. **WASM file distribution**: The grammar `.wasm` files (tree-sitter-typescript.wasm, etc.) must be included in the npm package `files` field, not generated at install time. The `build:grammars` script requires tree-sitter-cli which requires Emscripten -- this cannot be a postinstall requirement.
4. **Test the npx path**: CI must test `npx codescope` on all target platforms. Test with a clean npm cache (`npm cache clean --force && npx codescope`). This is the only way to catch prebuild resolution failures.
5. **Declare engines and os fields**: In package.json, declare `"engines": { "node": ">=22.0.0" }` and `"os": ["darwin", "linux", "win32"]` to fail fast on unsupported environments.

**Warning signs:**
- postinstall script taking >10 seconds (prebuilds are <2s)
- node-gyp output appearing during `npx codescope` install
- User reports of "Cannot find module better-sqlite3" after npx install
- npm pack producing a tarball missing `.wasm` files

**Phase to address:**
npx distribution phase -- must be the primary testing surface. Every CI run should include a `npx --yes` install test. This is the first thing a new user experiences and a single failure means they never return.

---

### Pitfall 5: sigma.js Memory Leak on Instance Lifecycle

**What goes wrong:**
The visualization dashboard creates sigma.js instances for graph rendering. When the user navigates away and returns, or when the graph data refreshes, the old sigma instance is destroyed (`.kill()`) and a new one created. Each destroy-create cycle leaks memory because sigma.js does not fully clean up WebGL contexts, GPU buffers, and internal event listeners (GitHub: jacomyal/sigma.js#795, closed as wontfix). After 5-10 refreshes, the browser tab consumes 500MB+ and eventually the WebGL context is lost (Issue #1321).

**Why it happens:**
WebGL contexts are finite per browser tab (typically max 8-16 contexts). sigma.js's `.kill()` method removes DOM elements and detaches some listeners but does not fully release WebGL resources. The garbage collector cannot reclaim GPU-side memory that was allocated through the WebGL API -- it must be explicitly freed via `gl.deleteBuffer()`, `gl.deleteTexture()`, etc. sigma.js v3.0 improved this but the issue persists for repeated create/destroy cycles.

**How to avoid:**
1. **Single instance, data swap**: Never destroy and recreate sigma instances. Instead, create ONE sigma instance at dashboard mount and swap the underlying graphology instance's data using `graph.clear()` followed by `graph.import()`. This avoids WebGL context churn entirely.
2. **Batch graph mutations**: When updating graph data, use graphology's `updateEachNodeAttributes` and `updateEachEdgeAttributes` for bulk updates that fire only a single consolidated event, avoiding per-node re-render thrashing (see sigma.js Issue #1516).
3. **Schedule refresh, not refresh**: Always use `sigma.scheduleRefresh()` (debounced via `requestAnimationFrame`) instead of `sigma.refresh()` (synchronous). Multiple rapid data changes will coalesce into a single render frame.
4. **Limit visible nodes**: For graphs with 10K+ nodes, use sigma.js's `nodeReducer` to return `{ hidden: true }` for nodes outside the current viewport or filter. Rendering 10K nodes is fine; rendering 10K nodes with labels and hover effects is not.

**Warning signs:**
- Browser DevTools Memory tab showing sawtooth pattern that never returns to baseline
- "WebGL context lost" errors in console
- Dashboard becoming unresponsive after multiple graph refreshes
- Node.js process memory growing (if rendering server-side with headless GL)

**Phase to address:**
Visualization dashboard phase -- the single-instance pattern must be the architectural foundation. Retrofitting from destroy-recreate to data-swap requires rewriting the entire rendering lifecycle.

---

### Pitfall 6: PreToolUse Hook Latency Blocking Claude Code's Agent Loop

**What goes wrong:**
PreToolUse hooks fire before every matched tool call. The hook script must start a Node.js process, read the graph database, compute blast radius or convention matches, format the response, and write JSON to stdout. If this takes >500ms, every Write/Edit tool call in the session is perceptibly slower. With 50+ tool calls per execution, even 200ms overhead adds 10+ seconds of cumulative delay. Users perceive Claude Code as "laggy" and disable the plugin.

**Why it happens:**
Each PreToolUse hook invocation is a cold-start: a new Node.js process spawns, requires modules, opens the SQLite database, reads data, closes, and exits. Node.js cold start is ~100ms. SQLite open + query is ~50-100ms. JSON serialization and stdout flush adds ~10ms. Total: 160-210ms per invocation even for simple queries. For convention checking that runs ast-grep, add 500ms+ for the CLI subprocess.

**How to avoid:**
1. **Long-running hook daemon**: Instead of spawning a new process per hook invocation, run a persistent HTTP server (on localhost) that the hook script curls. The hook shell script is a thin `curl -s http://localhost:PORT/pre-tool-use -d "$INPUT"` wrapper. The daemon keeps the SQLite connection open and graph cached. Response time drops from 200ms to <20ms.
2. **Reuse the MCP server**: The MCP server process is already running. Add a lightweight HTTP endpoint to it that handles hook requests. This eliminates the extra daemon process. The MCP server already has the graph cache, database connection, and all analysis logic.
3. **Exit-code-only for most calls**: For the common case (file not in danger zone, no convention violations), return exit code 0 with empty JSON. Only compute and inject `additionalContext` when the file actually needs guidance. Check the file path against a precomputed danger-zone set (in memory) before doing any expensive work.
4. **Prefetch on session start**: On SessionStart hook, precompute and cache the full danger zone list, convention summary, and high-centrality file set. Write to a session-scoped JSON file. PreToolUse hooks read this cached file instead of querying SQLite.

**Warning signs:**
- Consistent 200ms+ delay between Claude's tool call decision and execution
- `time` measurements on hook scripts showing >100ms consistently
- Users reporting "Claude Code feels slow after installing CodeScope"
- Claude Code logs showing hook timeout warnings

**Phase to address:**
Auto-injection hooks phase -- the daemon/HTTP pattern or MCP server integration must be the implementation from the start. Cold-start hooks that query SQLite are DOA for performance.

---

### Pitfall 7: Pre-Commit Hook Blocking Developer Workflow with False Positives

**What goes wrong:**
CodeScope's convention enforcement pre-commit hook runs ast-grep on staged files to detect convention violations. A false positive (flagging correct code as a violation) blocks the commit. The developer must either: (a) understand and fix the "violation" (impossible if it's false), (b) run `git commit --no-verify` to bypass, or (c) disable the hook. Options (b) and (c) destroy trust in the tool permanently. Once a developer bypasses once, they bypass forever.

**Why it happens:**
ast-grep pattern matching is structural but not semantic. A pattern like "detect-default-export" matches `export default` syntax but cannot know whether the project INTENDS default exports in this specific module (e.g., Next.js pages require default exports). Convention adoption percentages from bootstrap may be stale -- a convention at 85% adoption during bootstrap may have intentionally shifted to 70% by the time the pre-commit hook runs. The `<5% false positive rate` constraint from v1.0 applies to HIGH-CONF conventions, but the pre-commit hook may enforce MEDIUM-CONF conventions too.

**How to avoid:**
1. **Opt-in only, default off**: Pre-commit hooks must NEVER install automatically. Require explicit `codescope hooks install` command. Document that this is experimental.
2. **HIGH-CONF only**: Only enforce conventions with >80% adoption AND >10 applicable files (the existing HIGH-CONF threshold). MEDIUM-CONF and LOW-CONF conventions are suggestions only, never blocking.
3. **Allowlist/denylist per path**: Support `.codescope-ignore` file (like `.gitignore` syntax) for paths that should skip convention checking. Next.js `pages/` and `app/` directories, test files, and generated code should be ignorable.
4. **Warn mode default, block mode opt-in**: Default behavior is to PRINT warnings but exit 0 (non-blocking). Blocking mode requires explicit config: `conventionEnforcement: block` in config.yml. This follows v1.0's "suggestion-only conventions" decision.
5. **Freshness check**: If bootstrap data is >7 days old, degrade to warn-only regardless of config. Stale data should never block.
6. **Performance budget**: The hook must complete in <3 seconds for typical changesets (1-10 files). Use `lint-staged`-style filtering to only scan staged files, not the entire codebase.

**Warning signs:**
- Developers running `git commit --no-verify` regularly
- GitHub issues titled "false positive on [convention] in [framework-specific file]"
- Convention adoption percentages drifting significantly from bootstrap values
- Pre-commit hook taking >5 seconds on small changesets

**Phase to address:**
Convention enforcement phase -- the opt-in + warn-only default must be baked in from the start. Shipping a blocking hook that produces even ONE false positive on a common framework (Next.js, Remix, etc.) will kill adoption.

---

## Moderate Pitfalls

### Pitfall 8: WebSocket Connection Lifecycle Creating Memory Leaks

**What goes wrong:**
The visualization dashboard uses WebSocket to receive live graph updates from the MCP server. On reconnection (network hiccup, laptop sleep/wake, server restart), event listeners are re-registered without removing the old ones. Each reconnection adds another `onmessage` handler. After 10 reconnections, every graph update triggers 10 identical handler executions. Node.js warns at 11 listeners per emitter by default.

**How to avoid:**
1. **One listener, swap reference**: Register a single `onmessage` handler that delegates to a mutable `currentHandler` reference. On reconnection, only update the reference, never add a new listener.
2. **Use `once()` for transient handlers**: For connection-specific handlers (initial state sync), use `ws.once("message", handler)` instead of `ws.on("message", handler)`.
3. **Cleanup on close**: In the `onclose` handler, call `ws.removeAllListeners()` before creating the new WebSocket instance.
4. **Exponential backoff with jitter**: Reconnection delays should be 1s, 2s, 4s, 8s, up to 30s cap, with random jitter of 0-1s. Without jitter, all dashboard tabs reconnect simultaneously (thundering herd).
5. **State reconciliation on reconnect**: The server should send a full graph snapshot on reconnection, not attempt to replay missed events. The graph state fits in a single message (<1MB for 10K nodes) and avoids the complexity of event replay with sequence numbers.

**Warning signs:**
- "possible EventEmitter memory leak detected. 11 listeners added" warning in console
- Graph update callbacks firing multiple times for a single event
- Dashboard performance degrading over time without page refresh
- Network tab showing increasing WebSocket frame frequency

**Phase to address:**
Visualization dashboard phase -- WebSocket lifecycle must be designed with reconnection as the primary case, not an afterthought.

---

### Pitfall 9: Graph Visualization Layout Thrashing on Live Updates

**What goes wrong:**
When the graph receives incremental updates (node added, node removed, edge changed), the force-directed layout algorithm restarts, causing all nodes to rearrange. Users lose their spatial memory of the graph. A node they were looking at "in the upper right" suddenly jumps to the lower left. This makes the visualization disorienting rather than informative.

**How to avoid:**
1. **Pin existing nodes**: When adding new nodes, set `fixed: true` on all existing nodes before running the layout. Only new nodes should be positioned by the layout algorithm. Then selectively unpin nodes that are directly connected to new nodes.
2. **Pre-compute layouts server-side**: Use graphology-layout-forceatlas2 (or similar) during bootstrap/incremental update to compute x,y coordinates and store them in SQLite. The dashboard receives pre-laid-out graph data and only runs layout on new nodes.
3. **Animate transitions**: When node positions change, use sigma.js's camera animation to smoothly transition rather than jump-cutting. `sigma.getCamera().animatedState()` provides smooth viewport transitions.
4. **Layout budget**: Run layout for a fixed number of iterations (e.g., 100) rather than until convergence. On a 10K-node graph, convergence can take 5-10 seconds. Fixed iterations complete in <500ms and produce "good enough" layouts.

**Warning signs:**
- Users reporting the graph "jumps around" when data refreshes
- Layout computation blocking the main thread (dashboard freezes)
- CPU usage spiking on graph updates (layout is compute-intensive)

**Phase to address:**
Visualization dashboard phase -- layout strategy must be decided during architecture, not during implementation.

---

### Pitfall 10: PR Review Producing False Positives on Renamed/Moved Files

**What goes wrong:**
CodeScope's graph-aware PR review analyzes structural impact by mapping changed files to graph nodes. When a file is renamed or moved, `git diff` shows it as one file deleted and one file added. The graph still has nodes pointing to the OLD file path. The review incorrectly reports: (a) a high-centrality file was "deleted" (danger zone alert), (b) a new file has "no graph connections" (appears orphaned), and (c) blast radius is computed against the wrong node. The PR review produces alarming false positives that cry wolf on routine refactors.

**How to avoid:**
1. **Detect renames via git**: Use `git diff --diff-filter=R --find-renames` to detect renamed files and their old-to-new path mapping. Apply this mapping before graph queries.
2. **Path normalization layer**: Before any graph lookup, check if the file path has a rename mapping in the current diff. If yes, query the graph using the old path but report using the new path.
3. **Confidence degradation for renames**: When a rename is detected, lower the confidence of structural impact findings to "INFO" rather than "WARN" or "ERROR". The structural relationship is likely preserved even though the path changed.
4. **Handle merge commits**: For PRs with merge commits, the diff includes changes from the merge target. Filter to only analyze the PR's own commits (`git diff base...HEAD`, not `git diff base HEAD`) to avoid analyzing unrelated changes from the base branch.

**Warning signs:**
- PR reviews flagging "DELETED: high-centrality file" on routine rename refactors
- Blast radius reports showing 0 affected nodes for files that clearly have many dependents
- Review comments mentioning "orphaned file with no graph connections" for moved files

**Phase to address:**
PR review phase -- rename detection must be the first step in the review pipeline, before any graph queries.

---

### Pitfall 11: Session Handoff Documents Becoming Stale Mid-Execution

**What goes wrong:**
CodeScope's session continuity feature writes handoff documents when a session pauses. The handoff captures current state: which agents completed, which files were modified, what the plan was. But between pause and resume, the user (or another session) makes code changes. The resumed session reads the handoff, which references files at their old content, assumptions about code state that no longer hold, and an execution plan that targeted code structures that have been refactored.

**How to avoid:**
1. **Diff check on resume**: When resuming from a handoff, run `git diff` against the commit SHA recorded in the handoff. If >0 files in the handoff's scope have changed, warn the user and offer to re-orient.
2. **Record commit SHA, not timestamp**: The handoff document must record the exact git commit SHA at pause time, not just a timestamp. This enables precise change detection on resume.
3. **Scope contract validation**: Compare the handoff's scope contract (in-scope files) against current file state. If any in-scope file has been modified, mark the handoff as "stale" and require re-planning.
4. **Partial resume**: Allow resuming from the last completed agent rather than replaying from the beginning. Completed agents' outputs are on disk and valid. Only re-run agents whose target files have changed.

**Warning signs:**
- Resumed sessions applying edits to files that have been restructured
- Agent errors like "expected function X at line 42 but found something else"
- Handoff documents referencing branch names or commits that no longer exist (force-push scenarios)

**Phase to address:**
Session continuity phase -- the commit SHA recording and diff-on-resume must be part of the handoff protocol design, not added later.

---

### Pitfall 12: Convention Enforcement Conflicting with Framework-Specific Patterns

**What goes wrong:**
CodeScope detects "prefer-named-exports" as a HIGH-CONF convention (85% adoption) and enforces it in pre-commit hooks. But Next.js pages/app router requires `export default` for route components. Remix requires `export default` for route modules plus named exports for `loader`/`action`. The pre-commit hook blocks valid, framework-required code, creating an irreconcilable conflict between detected conventions and framework requirements.

**How to avoid:**
1. **Framework-aware exception lists**: During bootstrap, detect the framework (Next.js, Remix, Nuxt, SvelteKit, etc.) from package.json dependencies. Automatically add framework-specific exception paths to the convention ruleset. Next.js: `app/**`, `pages/**` exempt from export style conventions. Remix: `routes/**` exempt.
2. **Convention scoping by directory**: Allow conventions to have directory-scoped adoption metrics. "Named exports" at 95% in `src/lib/` but 10% in `app/routes/` means the convention applies to `src/lib/` only.
3. **Leverage v1.0's conflict detection**: The existing `detectConflicts()` in `src/conventions/runner.ts` already detects competing patterns (named vs default exports at >20% each). Extend this to detect path-scoped conflicts -- if default exports are >50% in specific directories, those directories should be exempted.

**Warning signs:**
- Convention conflicts detected during bootstrap but ignored during enforcement
- Users reporting "CodeScope tells me to use named exports but Next.js requires default exports"
- High false positive rates specifically in framework route/page directories

**Phase to address:**
Convention enforcement phase -- framework detection should feed into the exception list during the same phase that implements pre-commit hooks.

---

## Technical Debt Patterns

Shortcuts that seem reasonable but create long-term problems.

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Polling for graph updates instead of event-driven | Simple to implement, no WebSocket complexity | Wastes CPU, stale data between polls, does not scale to dashboard with multiple views | During initial development, replace with WebSocket before beta |
| Storing sigma.js layout coordinates only in memory | No schema migration needed | Layout lost on page refresh, expensive recomputation every time dashboard opens | Never -- layout coordinates belong in SQLite alongside node data |
| Using `git diff --name-only` for incremental updates instead of `--name-status` | Simpler parsing | Cannot detect renames (R), copies (C), or type changes. Renames appear as delete+add, causing false graph corruption | Never -- always use `--name-status` or `--diff-filter` to detect renames |
| Global pre-commit hook install (`husky install` in postinstall) | Users get convention enforcement automatically | Violates opt-in principle, blocks developers who never asked for it, breaks `--no-verify` trust contract | Never for this project -- v1.0 decision is suggestion-only conventions |
| Single SQLite connection shared across all operations | Simpler code, no connection pooling | Cannot do concurrent read + write (even in WAL mode, sharing one connection object across async operations can corrupt state) | Acceptable for v1.0 synchronous MCP handlers, but must use separate connections for incremental updater |
| Inlining WASM grammar files as base64 in the JS bundle | No file distribution problems | Doubles bundle size (~2MB for 4 grammars), base64 decode adds startup latency | Never -- keep .wasm as separate files, include in package `files` array |

## Integration Gotchas

Common mistakes when connecting to external services and platform APIs.

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Claude Code PreToolUse hooks | Returning `exit 1` expecting it to block the tool call | Use `exit 2` to block. `exit 1` only shows a warning in verbose mode. Use `hookSpecificOutput.permissionDecision: "deny"` for proper blocking. |
| Claude Code PostToolUse hooks | Trying to prevent tool execution with `decision: "block"` | PostToolUse fires AFTER execution. `decision: "block"` only provides corrective feedback to Claude, it cannot undo the action. Use PreToolUse for prevention. |
| Claude Code hook JSON output | Shell startup messages (`.bashrc` welcome text) corrupting JSON on stdout | Redirect shell startup output: `exec 3>&1 1>/dev/null; source ~/.bashrc; exec 1>&3 3>&-` before emitting JSON. Or use a compiled binary instead of a shell script. |
| sigma.js + graphology | Calling `sigma.refresh()` after every `graph.addNode()` in a loop | Use `graph.import()` for batch data loading, or wrap mutations in `graph.updateEachNodeAttributes()`. Call `sigma.scheduleRefresh()` once after all mutations. |
| sigma.js nodeReducer | Returning new objects on every render frame, causing unnecessary WebGL buffer uploads | Memoize reducer outputs. Only return new objects when node data actually changed. Use shallow comparison. |
| better-sqlite3 via npx | Assuming prebuild-install will work in npx's temp directory | Test `npx --yes your-package` on clean machines. Include platform-specific prebuilds in the npm package itself via `prebuild-install` or `@neon-rs/load`. |
| git pre-commit hooks + lint-staged | Running `tsc --noEmit` on staged files only | `tsc --noEmit` checks the ENTIRE project, not individual files. It takes 10-20s on medium projects. Skip type-check in pre-commit; use CI instead. Run only ast-grep (fast, file-scoped) in the hook. |
| WebSocket + MCP server | Using the MCP StdioServerTransport for WebSocket communication | StdioServerTransport is stdin/stdout only. The WebSocket server must be a separate HTTP server running alongside the MCP process, or use an SSE transport for the dashboard. |
| GraphQL/REST for dashboard data | Creating a full API layer between MCP server and dashboard | The MCP server already has all the query logic. Expose a thin HTTP endpoint from the same process rather than building a separate API server. |

## Performance Traps

Patterns that work at small scale but fail as usage grows.

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Full graph reload from SQLite on every incremental update | Acceptable at 1K nodes (~50ms), unusable at 10K nodes (~500ms) | Keep graphology instance in memory, apply delta updates instead of full reload | >5K nodes, >10K edges |
| BFS blast radius on undirected graph traversal | Explodes through the entire graph via bidirectional edges | Use directed traversal (outbound edges only) for blast radius; use undirected only for reachability checks | >2K nodes where most files import a shared utility |
| ast-grep CLI subprocess per convention rule (current v1.0 pattern) | 18 rules x 200ms each = 3.6s per full scan | Combine rules into a single YAML scan config, or switch to @ast-grep/napi for in-process execution | >15 convention rules, or pre-commit hook with >5 staged files |
| sigma.js rendering all 10K+ nodes with labels | WebGL renders nodes fine, but HTML overlay for labels stutters | Use `labelRenderedSizeThreshold` to only render labels for large/zoomed nodes. Default to labels only on hover. | >5K visible nodes simultaneously |
| JSON serialization of full graph for WebSocket transfer | 10K nodes + 50K edges = ~5MB JSON, 100ms+ parse time on client | Use binary format (MessagePack/CBOR) or send delta updates instead of full graph snapshots | Graph > 20K total elements |
| Computing community detection on every incremental update | Louvain on 50K nodes takes ~940ms, acceptable once, not on every file save | Only recompute communities when >5% of nodes change. Cache community assignments in SQLite. | Any graph where incremental updates happen more than once per minute |

## Security Mistakes

Domain-specific security issues for a Claude Code plugin with local filesystem access.

| Mistake | Risk | Prevention |
|---------|------|------------|
| WebSocket server binding to 0.0.0.0 instead of 127.0.0.1 | Any device on the network can connect to the dashboard and read codebase structure, convention violations, danger zones | Bind to `127.0.0.1` only. Add a session token for WebSocket connections. |
| Pre-commit hook reading arbitrary file paths from git diff without sanitization | Symlink attacks could cause the hook to read files outside the repository | Resolve all file paths and verify they are within the project root before processing. Use `path.resolve()` and check `resolvedPath.startsWith(projectRoot)`. |
| Storing dashboard auth tokens in localStorage | XSS in the dashboard (or any other local page) can steal the token | Use httpOnly cookies for the dashboard session. If using WebSocket auth, send the token in the initial handshake header, not as a query parameter (visible in logs). |
| npx postinstall script executing with user permissions | A malicious dependency could exploit the postinstall to exfiltrate code or credentials | Minimize postinstall scripts. Use `--ignore-scripts` flag support. Never download binaries from URLs in postinstall -- use prebuild-install's signed GitHub releases only. |

## UX Pitfalls

Common user experience mistakes for a developer tool plugin.

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Auto-injection adding context without visual indication | Developer has no idea why Claude "knows" about conventions -- context injection is invisible, feels like magic or hallucination | Add a brief `[CodeScope: injected blast radius for src/foo.ts]` note in the additionalContext so it appears in Claude's response |
| Pre-commit hook with cryptic error messages | Developer sees "Convention violation: prefer-named-exports in src/pages/index.tsx" with no guidance on how to fix or suppress | Include the convention's adoption %, link to the golden file example, and the suppress command (`codescope ignore prefer-named-exports src/pages/`) |
| Dashboard requiring separate installation step | Users who installed the plugin via Claude Code don't expect to run a second `npm install` for the dashboard | Bundle the dashboard as a static asset served by the MCP server. `codescope dashboard` should open a browser to localhost with zero additional setup. |
| npx installer showing 30s of native compilation output | First impression is a wall of C++ compiler warnings | Show a spinner with "Installing CodeScope..." and pipe compilation output to a log file. Display only success/failure with a help link on failure. |
| Graph visualization defaulting to full graph view | 10K nodes renders as an incomprehensible blob | Default to showing only the current file's 2-hop neighborhood. Provide a "Show full graph" toggle for users who want the overview. |

## "Looks Done But Isn't" Checklist

Things that appear complete but are missing critical pieces.

- [ ] **Auto-injection hooks:** Often missing token budget enforcement -- verify hooks have a `maxTokens` check before returning `additionalContext`. Test with a session that triggers 100+ tool calls and measure total injected tokens.
- [ ] **Incremental graph update:** Often missing reverse dependency edge cleanup -- verify that renaming `src/utils/helpers.ts` to `src/utils/helpers-v2.ts` preserves ALL edges from other files that imported helpers.ts. Not just the renamed file's own edges.
- [ ] **Pre-commit hook:** Often missing framework exception handling -- verify that `export default` in a Next.js page file does NOT trigger a "prefer-named-exports" violation. Test with every major framework's required export patterns.
- [ ] **WebSocket dashboard:** Often missing reconnection state sync -- verify that after a 30-second disconnect, the reconnected dashboard shows the CURRENT graph state, not the stale pre-disconnect state.
- [ ] **sigma.js visualization:** Often missing proper `.kill()` cleanup -- verify that opening and closing the dashboard 10 times does not increase memory by more than 10%. Use Chrome DevTools Memory snapshot comparison.
- [ ] **npx distribution:** Often missing platform coverage -- verify `npx codescope` works on: macOS ARM64 (Apple Silicon), macOS Intel, Ubuntu 22.04 x64, Windows 11 x64 with both Node.js 22 and Node.js 24.
- [ ] **PR review:** Often missing rename detection -- verify that a PR that renames a file does NOT produce "deleted high-centrality file" warnings. Test with `git mv` renames.
- [ ] **Session handoff:** Often missing commit SHA recording -- verify that the handoff document includes the exact git commit, and that resuming after a `git commit` by another user triggers a staleness warning.
- [ ] **Convention enforcement:** Often missing staleness check -- verify that if bootstrap was run >7 days ago, the pre-commit hook degrades to warn-only mode regardless of config.

## Recovery Strategies

When pitfalls occur despite prevention, how to recover.

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Context bloat from over-injection | LOW | Clear injected context by running `/compact`. Reduce injection budget in config.yml. Restart session. |
| Corrupt graph from failed incremental update | MEDIUM | Run `codescope:bootstrap --force` to rebuild from scratch. The full bootstrap takes <5 min for 100K LOC. Delete graph.db and .wal/.shm files first. |
| SQLITE_BUSY errors during concurrent access | LOW | Add `busy_timeout = 5000` pragma to `openDatabase()`. Restart MCP server. One-line fix. |
| npx install failure (native addon) | MEDIUM | Provide `codescope doctor` command that diagnoses the issue and offers: (a) global install with `npm install -g`, (b) Docker image, (c) fallback to node:sqlite. |
| sigma.js memory leak after repeated refreshes | LOW | Refresh the browser tab. Implement single-instance pattern to prevent recurrence. |
| Pre-commit false positive blocking a commit | LOW | User runs `git commit --no-verify`. CodeScope should detect this (via post-commit hook) and log it as a "bypass event" for convention confidence recalibration. |
| Stale session handoff causing incorrect edits | HIGH | Cannot easily undo agent work that applied stale assumptions. Must `git stash` or `git reset` the changes and re-run from orient. Prevention is essential. |
| PR review false positive on renamed file | LOW | Dismiss the review comment. But repeated false positives destroy trust. Fix rename detection to prevent recurrence. |
| WebSocket listener memory leak | LOW | Refresh dashboard. Implement proper cleanup in onclose handler. |

## Pitfall-to-Phase Mapping

How roadmap phases should address these pitfalls.

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Context bloat (Pitfall 1) | Auto-injection hooks | Measure total injected tokens across a 50-tool-call session. Must be <5000 tokens total. |
| Partial graph state (Pitfall 2) | Incremental graph updates | Rename a file imported by 10+ other files. Verify all edges are preserved after incremental update. |
| SQLITE_BUSY (Pitfall 3) | Incremental graph updates | Run an MCP tool query while an incremental update is in progress. Must not throw. |
| npx native addon failure (Pitfall 4) | npx distribution | `npx --yes codescope` on macOS ARM64 with clean npm cache. Must complete in <60s without node-gyp. |
| sigma.js memory leak (Pitfall 5) | Visualization dashboard | Open/close dashboard 20 times. Memory delta must be <50MB. |
| Hook latency (Pitfall 6) | Auto-injection hooks | Measure PreToolUse hook response time. Must be <50ms p99 (with daemon pattern). |
| Pre-commit false positives (Pitfall 7) | Convention enforcement | Run hook on Next.js, Remix, and SvelteKit projects. Zero false positives on framework-required patterns. |
| WebSocket memory leak (Pitfall 8) | Visualization dashboard | Simulate 20 reconnection cycles. Verify listener count stays at 1 per event type. |
| Layout thrashing (Pitfall 9) | Visualization dashboard | Add a node to a 5K-node graph. Existing node positions must not change by more than 5px. |
| PR rename false positives (Pitfall 10) | PR review | Submit a PR with `git mv` renames. Zero false "deleted file" warnings. |
| Stale handoff (Pitfall 11) | Session continuity | Pause session, make a commit, resume. Must warn about stale state. |
| Framework convention conflicts (Pitfall 12) | Convention enforcement | Bootstrap a Next.js project. `pages/` and `app/` must be auto-exempted from export-style conventions. |

## Sources

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- PreToolUse/PostToolUse JSON format, exit codes, decision control
- [Claude Code Context Buffer: The 33K-45K Token Problem](https://claudefa.st/blog/guide/mechanics/context-buffer-management) -- auto-compaction triggers, buffer size
- [Claude Code Context Bloat Bug Report (Issue #29971)](https://github.com/anthropics/claude-code/issues/29971) -- MCP tools loaded unconditionally, context cost hidden
- [sigma.js Memory Leak (Issue #795)](https://github.com/jacomyal/sigma.js/issues/795) -- create/kill cycle memory growth, closed wontfix
- [sigma.js WebGL Context Recovery (Issue #1321)](https://github.com/jacomyal/sigma.js/issues/1321) -- lost context after instance churn
- [sigma.js Batch Update Optimization (Issue #1516)](https://github.com/jacomyal/sigma.js/issues/1516) -- event storm from sequential mutations
- [sigma.js Lifecycle Docs](https://www.sigmajs.org/docs/advanced/lifecycle/) -- refresh vs scheduleRefresh
- [sigma.js Data Docs](https://www.sigmajs.org/docs/advanced/data/) -- nodeReducer, edgeReducer
- [better-sqlite3 ARM64 npx Failure (claude-flow#360)](https://github.com/ruvnet/claude-flow/issues/360) -- prebuild-install path resolution in npx temp dir
- [better-sqlite3 macOS M1 Install (Issue #1317)](https://github.com/WiseLibs/better-sqlite3/issues/1317) -- ARM64 prebuild availability
- [SQLite SQLITE_BUSY Despite Timeout](https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/) -- transaction upgrade deadlocks
- [SQLite WAL Concurrency](https://sqlite.org/wal.html) -- single writer, checkpoint starvation
- [Improving Concurrency with better-sqlite3](https://wchargin.com/better-sqlite3/performance.html) -- busy timeout, checkpointing
- [WebSocket Memory Leak (ws#804)](https://github.com/websockets/ws/issues/804) -- listener accumulation on reconnect
- [WebSocket Objects Not Destroyed](https://useaxentix.com/blog/websockets/why-websocket-objects-arent-destroyed-when-out-of-scope/) -- explicit cleanup required
- [WebSocket Best Practices for Production](https://websocket.org/guides/best-practices/) -- exponential backoff, heartbeat, state sync
- [lint-staged GitHub](https://github.com/lint-staged/lint-staged) -- staged-files-only approach, tsc limitation
- [GitHub PR Rename Detection (Discussion #8573)](https://github.com/orgs/community/discussions/8573) -- renamed files shown as delete+add
- [Inspect: Entity-Level Code Review](https://inspect-review.vercel.app/) -- structural hashing for rename detection
- [Git diff documentation](https://git-scm.com/docs/git-diff) -- `--diff-filter=R`, `--find-renames`
- [Claude Code Hook Development SKILL](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md) -- official hook patterns

---
*Pitfalls research for: CodeScope v2.0 Intelligence Layer + Interactive Dashboard + npx Distribution*
*Researched: 2026-03-27*
