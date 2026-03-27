# Architecture Research: CodeScope v2.0 Integration

**Domain:** Claude Code plugin -- intelligence layer features integrating with existing v1.0 architecture
**Researched:** 2026-03-27
**Confidence:** HIGH (hooks, incremental graph, npx CLI), MEDIUM (visualization server, PR review, session handoff)

## Existing Architecture Summary

Before detailing v2.0 integration, here is the v1.0 architecture that all new features must integrate with:

```
                      Claude Code Host Process
 ...........................................................................
 :                                                                         :
 :  ┌─────────────────────────────────────────────────────────────────┐    :
 :  │                   PLUGIN ENTRY LAYER                            │    :
 :  │  Skills: onboard, bootstrap, orient, settings, review-learnings │    :
 :  │  Manifest: .claude-plugin/plugin.json                           │    :
 :  └──────────────────────────┬──────────────────────────────────────┘    :
 :                             │                                           :
 :  ┌──────────────────────────v──────────────────────────────────────┐    :
 :  │              ORCHESTRATOR LAYER (<15K tokens)                    │    :
 :  │  Reads disk -> Routes to agents via Task tool -> Reads results  │    :
 :  └──────────────────────────┬──────────────────────────────────────┘    :
 :                             │                                           :
 :  ┌──────────────────────────v──────────────────────────────────────┐    :
 :  │              SUB-AGENT CONTEXTS (200K each, isolated)           │    :
 :  │  Scout, Researcher, ConvDetector, RiskAnalyzer, LearningSync   │    :
 :  │  Execution agents, Verify agents, Eval, Debug                  │    :
 :  └──────────────────────────┬──────────────────────────────────────┘    :
 :                             │                                           :
 :  ┌──────────────────────────v──────────────────────────────────────┐    :
 :  │              FILESYSTEM COORDINATION                            │    :
 :  │  .claude/codescope/ (config.yml, graph.db, overview.md,        │    :
 :  │   conventions.md, danger-zones.md, learnings.md, plans/,       │    :
 :  │   execution/, reports/, orient/, services/, bootstrap-meta.json)│    :
 :  └──────────────────────────┬──────────────────────────────────────┘    :
 :                             │                                           :
 :.............................│...........................................:
                               │
 ┌─────────────────────────────v──────────────────────────────────────────┐
 │                MCP SERVER (StdioServerTransport)                       │
 │  12 tools: status, recall, graph_query, blast_radius, conventions,    │
 │  orient, verify, search, readiness, detect_changes, service_map, eval │
 │                                                                        │
 │  Graph Cache (5-min TTL) ──> SQLite (WAL, 64MB) ──> Graphology        │
 └────────────────────────────────────────────────────────────────────────┘
```

**Key architectural constraints:**
- MCP server uses StdioServerTransport (stdin/stdout) -- cannot share these channels with HTTP
- All state lives on disk at `.claude/codescope/`, not in agent memory
- Sub-agents communicate through filesystem, not return values (Issue #5812)
- Build output: single `dist/server.js` via tsdown, `better-sqlite3` kept external
- Graph cache is module-level singleton with `invalidateCache()` for forced refresh

## v2.0 Feature Integration Map

### Overview: New vs Modified Components

| Feature | New Components | Modified Components | New Dependencies |
|---------|---------------|---------------------|------------------|
| Hooks system | `hooks/hooks.json`, `scripts/inject-context.ts`, `scripts/convention-check.ts` | `plugin.json` (add hooks ref) | None |
| Visualization server | `src/dashboard/server.ts`, `src/dashboard/api.ts`, `dashboard/` (frontend), new skill | `tsdown.config.ts` (add entry), `package.json` (add sigma, ws) | `sigma`, `ws`, `open` |
| Incremental graph | `src/graph/staleness.ts`, `src/graph/delta-reparse.ts` | `src/graph/cache.ts`, `src/graph/builder.ts`, `src/tools/helpers.ts` | None |
| PR review | `src/review/diff-parser.ts`, `src/review/impact-analyzer.ts`, new skill + MCP tool | `src/tools/index.ts` (register tool) | None |
| Pre-commit hooks | `scripts/pre-commit.sh`, `src/cli/install-hooks.ts` | `src/config/schema.ts` (add conventions.enforcement) | None |
| Session handoff | `src/session/serializer.ts`, `src/session/handoff-writer.ts`, new skill | `src/utils/paths.ts` (add session dir) | None |
| npx CLI | `src/cli/index.ts`, `src/cli/setup.ts`, `src/cli/commands/` | `package.json` (add bin field), `tsdown.config.ts` (add entry) | `commander` |

---

## Feature 1: Hooks System (Auto-Injection)

### How Claude Code Hooks Work

Claude Code fires hook events at lifecycle points. Plugins register hooks in `hooks/hooks.json`. Each hook receives JSON on stdin and returns JSON on stdout with exit code 0.

**Relevant hook events for CodeScope:**

| Event | Purpose | Output Contract |
|-------|---------|-----------------|
| `PreToolUse` (matcher: `Edit\|Write`) | Inject codebase context before file edits | `hookSpecificOutput.additionalContext` -- text injected into Claude's context |
| `PostToolUse` (matcher: `Edit\|Write`) | Convention compliance check after edits | `hookSpecificOutput.additionalContext` -- feedback to Claude |
| `SessionStart` | Load bootstrap summary into context | `hookSpecificOutput.additionalContext` -- project intelligence |
| `SubagentStart` | Inject relevant context for spawned agents | `hookSpecificOutput.additionalContext` |
| `PreCompact` | Preserve critical codebase intelligence before compaction | `hookSpecificOutput.additionalContext` |

### Integration Architecture

```
hooks/
├── hooks.json                    # Hook event registrations
└── (no scripts here -- scripts go in scripts/)

scripts/
├── inject-context.ts             # SessionStart + PreToolUse handler
├── convention-check.ts           # PostToolUse handler
└── compact-preserve.ts           # PreCompact handler
```

**hooks/hooks.json:**
```json
{
  "description": "CodeScope auto-injection and convention enforcement hooks",
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/hooks/inject-context.js",
            "timeout": 10,
            "statusMessage": "Loading codebase intelligence..."
          }
        ]
      }
    ],
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/hooks/inject-context.js",
            "timeout": 5
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/hooks/convention-check.js",
            "timeout": 10
          }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/hooks/compact-preserve.js",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

**Hook Script Pattern (inject-context.ts):**
```typescript
// Reads JSON from stdin, writes JSON to stdout, exits 0
import { readFileSync } from "node:fs";

// Read hook input from stdin
const input = JSON.parse(readFileSync("/dev/stdin", "utf-8"));
const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

// Determine what context to inject based on event + tool
const hookEvent = input.hook_event_name;
const toolName = input.tool_name; // undefined for SessionStart

// Load relevant bootstrap artifacts
let context = "";
if (hookEvent === "SessionStart") {
  // Load full project intelligence summary
  context = loadProjectSummary(projectDir);
} else if (hookEvent === "PreToolUse" && (toolName === "Edit" || toolName === "Write")) {
  // Load file-specific conventions and blast radius
  const filePath = input.tool_input?.file_path;
  context = loadFileContext(projectDir, filePath);
}

// Output: additionalContext gets injected into Claude's context
const output = {
  hookSpecificOutput: {
    hookEventName: hookEvent,
    additionalContext: context
  }
};
console.log(JSON.stringify(output));
process.exit(0);
```

**Key design decisions:**
- Hook scripts are **compiled TypeScript** (built to `dist/hooks/`) -- not raw .ts files, because `${CLAUDE_PLUGIN_ROOT}` points to the installed plugin which has only built artifacts
- Scripts read from `.claude/codescope/` artifacts already on disk -- no SQLite or graphology needed in the hook process, keeping them fast (<5s timeout)
- `additionalContext` is the mechanism for invisible context injection -- it appears in Claude's context but not in the user-visible transcript
- Convention check in `PostToolUse` reads the conventions.md artifact and checks the edited file against patterns, returning feedback as `additionalContext`

**Modified files:**
- `plugin.json`: Add `"hooks": "./hooks/hooks.json"` to manifest
- `tsdown.config.ts`: Add hook entry points to build (`src/hooks/inject-context.ts`, etc.)

### Build Configuration Change

```typescript
// tsdown.config.ts (updated)
import { defineConfig } from "tsdown";
export default defineConfig({
  entry: [
    "src/server.ts",
    "src/hooks/inject-context.ts",
    "src/hooks/convention-check.ts",
    "src/hooks/compact-preserve.ts",
  ],
  format: "esm",
  outDir: "dist",
  external: ["better-sqlite3"],
  clean: true,
});
```

---

## Feature 2: Visualization Dashboard

### Architecture Decision: Separate Process

The MCP server uses `StdioServerTransport` -- stdin/stdout are its communication channel with Claude Code. An HTTP server **cannot** share this process because any HTTP-related stdout output would corrupt the MCP protocol.

**Decision: Separate dashboard process, launched on demand.**

```
┌──────────────────────────────────────────────────┐
│          Claude Code Host Process                 │
│                                                   │
│  MCP Server (stdio) ◄─── StdioServerTransport    │
│       │                                           │
│       │ (reads graph.db, writes artifacts)        │
│       ▼                                           │
│  .claude/codescope/graph.db                       │
│  .claude/codescope/*.md artifacts                 │
│       ▲                                           │
│       │ (reads graph.db, reads artifacts)         │
│       │                                           │
│  Dashboard Server (HTTP + WebSocket)              │
│  localhost:4173 (separate Node.js process)        │
│       │                                           │
│       ├── GET /api/graph      → graph JSON        │
│       ├── GET /api/readiness  → readiness JSON    │
│       ├── GET /api/conventions→ conventions JSON  │
│       ├── GET /api/communities→ community data    │
│       ├── WS  /ws/live        → file change push  │
│       └── GET /*              → static SPA files  │
└──────────────────────────────────────────────────┘
```

### Component Structure

```
src/
├── dashboard/
│   ├── server.ts              # HTTP + WebSocket server (Node.js built-in http + ws)
│   ├── api.ts                 # REST endpoints reading graph.db + artifacts
│   ├── watcher.ts             # fs.watch on graph.db + artifacts, pushes via WS
│   └── graph-export.ts        # Converts graphology → sigma.js JSON format
│
dashboard/                     # Frontend SPA (pre-built, no React needed)
├── index.html                 # Single HTML file with sigma.js
├── app.js                     # Vanilla JS/TS -- sigma.js + graphology client-side
├── styles.css                 # Dashboard styles
└── (bundled sigma + graphology from CDN or vendor)
```

**Why vanilla JS instead of React:**
- sigma.js works directly with graphology -- no React wrapper needed
- Avoids adding React/Vite build pipeline to the project
- Single `index.html` + `app.js` is trivially served by Node.js `http` module
- Keeps the dashboard lightweight (no `node_modules` for frontend)

**Dashboard server (server.ts) pattern:**
```typescript
import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { readFileSync, watch } from "node:fs";

const PORT = 4173;
const projectRoot = process.argv[2] || process.cwd();

// HTTP server for REST API + static files
const httpServer = createServer((req, res) => {
  if (req.url?.startsWith("/api/")) {
    handleApi(req, res, projectRoot);
  } else {
    serveStatic(req, res);  // Serve dashboard/ files
  }
});

// WebSocket for live updates
const wss = new WebSocketServer({ server: httpServer });
watchForChanges(projectRoot, wss);  // fs.watch graph.db, push deltas

httpServer.listen(PORT, () => {
  console.log(`Dashboard: http://localhost:${PORT}`);
});
```

**Launching the dashboard:**
- New skill `/codescope:dashboard` spawns the server process and opens browser
- Or new MCP tool `codescope_dashboard` returns the URL
- Dashboard process auto-terminates when no WebSocket clients for 5 minutes

**New dependencies:**
- `ws` (WebSocket server -- the standard Node.js WebSocket library, 100M+ weekly downloads)
- `sigma` (graph visualization, works with graphology which is already a dependency)
- `open` (cross-platform browser opener, 50M+ weekly downloads)

**Build impact:**
- Dashboard server: new tsdown entry point `src/dashboard/server.ts`
- Frontend: pre-built static files in `dashboard/` directory, copied to `dist/dashboard/` at build time
- sigma.js + graphology loaded via CDN `<script>` tags in `index.html` (no frontend build step)

---

## Feature 3: Incremental Graph (On-Demand Staleness + Delta Reparse)

### Current State vs. Target

**Current (v1.0):**
- Full bootstrap re-parses everything or uses 50% threshold for incremental mode
- Graph cache has 5-min TTL, reloads everything from SQLite on expiry
- No per-file staleness tracking

**Target (v2.0):**
- Per-file staleness detection via `git diff` + `last_modified` column in SQLite
- Delta reparse: only re-parse changed files, update graph incrementally
- MCP tools auto-trigger incremental update when staleness detected
- No full re-bootstrap needed for small changes

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│ MCP Tool Handler (any tool)                               │
│                                                           │
│ 1. Check staleness: git diff --name-only HEAD vs meta     │
│ 2. If stale files found:                                  │
│    a. Delta reparse changed files (tree-sitter)           │
│    b. Remove old nodes/edges for changed files from SQLite │
│    c. Insert new nodes/edges for changed files             │
│    d. Invalidate graph cache                               │
│ 3. Proceed with normal tool query                         │
└──────────────────────────────────────────────────────────┘
```

### New Module: `src/graph/staleness.ts`

```typescript
export interface StalenessResult {
  isStale: boolean;
  changedFiles: string[];     // Relative paths
  deletedFiles: string[];     // Files removed since last check
  lastChecked: string;        // ISO timestamp of the check
}

/**
 * Detects files changed since the last bootstrap or last incremental update.
 * Uses git diff --name-only against the stored timestamp in bootstrap-meta.json.
 * Falls back to mtime comparison against nodes.last_modified column.
 */
export function detectStaleness(
  projectRoot: string,
  dbPath: string
): StalenessResult { ... }
```

### New Module: `src/graph/delta-reparse.ts`

```typescript
export interface DeltaResult {
  filesReparsed: number;
  nodesAdded: number;
  nodesRemoved: number;
  edgesAdded: number;
  edgesRemoved: number;
  durationMs: number;
}

/**
 * Incrementally updates the graph for a set of changed files.
 *
 * Algorithm:
 * 1. DELETE FROM nodes WHERE file_path IN (changedFiles)
 *    (CASCADE deletes edges via foreign key)
 * 2. Re-parse each changed file with tree-sitter
 * 3. INSERT new nodes/edges (reusing batch-writer pattern)
 * 4. Invalidate graph cache
 *
 * For deleted files: just the DELETE step.
 * Does NOT recompute communities (expensive) -- marks them as stale.
 */
export async function deltaReparse(
  projectRoot: string,
  dbPath: string,
  changedFiles: string[],
  deletedFiles: string[]
): Promise<DeltaResult> { ... }
```

### Modified Files

**`src/graph/cache.ts`** -- Add staleness-aware refresh:
```typescript
// New export: refresh only if stale
export function refreshIfStale(projectRoot: string): CachedGraph {
  const staleness = detectStaleness(projectRoot, getGraphDbPath(projectRoot));
  if (staleness.isStale) {
    await deltaReparse(projectRoot, getGraphDbPath(projectRoot),
                       staleness.changedFiles, staleness.deletedFiles);
    invalidateCache();  // Force reload from updated SQLite
  }
  return getGraph(projectRoot);
}
```

**`src/graph/schema.ts`** -- Add index for incremental deletes:
```sql
CREATE INDEX IF NOT EXISTS idx_nodes_file_path ON nodes(file_path);
-- Already exists, but verify it's used for DELETE WHERE file_path IN (...)
```

**`src/tools/helpers.ts`** -- Add staleness metadata to responses:
- `buildMetadata()` already computes staleness from bootstrap timestamp
- Extend to include per-file staleness count: `stale_files: number`

**`src/bootstrap/meta.ts`** -- Track last incremental update:
```typescript
export interface BootstrapMeta {
  last_bootstrap: string;
  last_incremental_update: string;  // NEW: ISO timestamp of last delta reparse
  duration_ms: number;
  mode: "full" | "incremental";
  version: string;
}
```

### Performance Considerations

- Delta reparse for 10 files: ~200ms (tree-sitter parse) + ~50ms (SQLite delete/insert) = ~250ms total
- Community detection is NOT re-run on delta (too expensive at ~940ms for 50K nodes). Communities are recomputed only on full bootstrap or explicit request.
- Graph cache invalidation after delta means next `getGraph()` reloads from SQLite (~200ms) but subsequent calls use cache

---

## Feature 4: PR Review (Graph-Aware Structural Impact)

### Architecture

PR review combines git diff parsing with the knowledge graph to provide structural impact analysis beyond line-level diffs.

```
┌──────────────────────────────────────────────────────────────┐
│ /codescope:review-pr skill                                    │
│                                                               │
│ 1. Parse PR diff (git diff base...head)                       │
│ 2. Map changed files to graph nodes                           │
│ 3. Compute blast radius for each changed file                 │
│ 4. Identify cross-community impacts                           │
│ 5. Check convention compliance of new/changed code            │
│ 6. Generate structured review with risk assessment            │
│                                                               │
│ Output: .claude/codescope/reports/pr-review-{sha}.md          │
└──────────────────────────────────────────────────────────────┘
```

### New Components

```
src/
├── review/
│   ├── diff-parser.ts          # Parse unified diff → structured hunks
│   ├── impact-analyzer.ts      # Map diff to graph, compute structural impact
│   └── review-generator.ts     # Generate markdown review report
│
skills/
├── review-pr/
│   └── SKILL.md                # Skill definition for /codescope:review-pr
│
src/tools/
├── review.ts                   # New MCP tool: codescope_review
```

**`src/review/diff-parser.ts`:**
```typescript
export interface DiffHunk {
  filePath: string;
  status: "added" | "modified" | "deleted" | "renamed";
  additions: number;
  deletions: number;
  hunks: Array<{
    startLine: number;
    endLine: number;
    content: string;
  }>;
}

/**
 * Parses unified diff output into structured hunks.
 * Handles renames (diff --git a/old b/new with similarity %).
 */
export function parseDiff(diffOutput: string): DiffHunk[] { ... }
```

**`src/review/impact-analyzer.ts`:**
```typescript
export interface PRImpact {
  changedFiles: Array<{
    path: string;
    risk: "HIGH" | "MEDIUM" | "LOW";
    centrality: number;
    blastRadiusCount: number;
    affectedCommunities: string[];
  }>;
  crossCommunityImpacts: Array<{
    sourceCommunity: string;
    targetCommunity: string;
    bridgeFiles: string[];
  }>;
  conventionViolations: Array<{
    file: string;
    convention: string;
    detail: string;
  }>;
  overallRisk: "HIGH" | "MEDIUM" | "LOW";
  summary: string;
}
```

**Integration with existing code:**
- Reuses `getGraph()` from `src/graph/cache.ts` for graph queries
- Reuses `blastRadius()` from `src/graph/analytics.ts`
- Reuses `classifyRisk()` pattern from `src/tools/detect-changes.ts`
- Reuses convention runner from `src/conventions/runner.ts`
- New MCP tool `codescope_review` registered in `src/tools/index.ts`

### MCP Tool: `codescope_review`

```typescript
// Input: { ref?: string, diff?: string }
// - ref: git ref like "origin/main...HEAD" or PR branch
// - diff: raw diff text (alternative to ref)
// Output: PRImpact JSON in ok/error envelope
```

---

## Feature 5: Pre-Commit Hooks (Git Integration)

### Architecture Decision: Standalone Script, No Husky

CodeScope should not force Husky or any hook manager on user projects. Instead, provide a self-contained pre-commit script that:
1. Chains with existing hooks (runs existing hook first, then CodeScope check)
2. Is installed by a CodeScope CLI command, not automatically
3. Can be removed cleanly

### Installation Flow

```
/codescope:settings → "Install pre-commit hook"
  │
  ▼
src/cli/install-hooks.ts
  │
  ├── Check if .git/hooks/pre-commit exists
  │   ├── YES: Rename to .git/hooks/pre-commit.codescope-backup
  │   │        Write new pre-commit that calls backup then CodeScope
  │   └── NO:  Write new pre-commit directly
  │
  └── Write scripts/codescope-pre-commit.sh to .git/hooks/
```

**Pre-commit script pattern:**
```bash
#!/bin/bash
# CodeScope pre-commit hook
# Runs convention checks on staged files

# Chain existing hook if present
if [ -f ".git/hooks/pre-commit.codescope-backup" ]; then
  .git/hooks/pre-commit.codescope-backup
  EXISTING_EXIT=$?
  if [ $EXISTING_EXIT -ne 0 ]; then
    exit $EXISTING_EXIT
  fi
fi

# Get staged files
STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)

if [ -z "$STAGED_FILES" ]; then
  exit 0
fi

# Run CodeScope convention check (uses built dist/server.js via Node)
node "${0%/*}/../.claude/codescope/dist/hooks/pre-commit-check.js" $STAGED_FILES
exit $?
```

**Pre-commit check module (`src/hooks/pre-commit-check.ts`):**
- Reads conventions.md artifact
- Runs ast-grep patterns against staged files
- Reports violations to stderr
- Exit 0 = pass, Exit 1 = fail (blocks commit)
- Respects `conventions.strictness` config: "suggest-only" always exits 0, "warn" prints but exits 0, "block" exits 1 on violations

### Config Schema Extension

```typescript
// Addition to ConfigSchema
conventions: z.object({
  // ... existing fields ...
  enforcement: z.enum(["suggest-only", "warn", "block"]).default("suggest-only"),
  pre_commit_installed: z.boolean().default(false),
}),
```

---

## Feature 6: Session Handoff

### Architecture

Session handoff serializes the current pipeline state to disk so a new Claude Code session can resume work. This is a lightweight alternative to full session management (which is out of scope per PROJECT.md).

```
┌────────────────────────────────┐     ┌────────────────────────────────┐
│  Session 1 (ending)            │     │  Session 2 (starting)          │
│                                │     │                                │
│  /codescope:pause              │     │  /codescope:resume             │
│     │                          │     │     │                          │
│     ▼                          │     │     ▼                          │
│  serializer.ts                 │     │  SessionStart hook             │
│     │                          │     │     │                          │
│     ▼                          │     │     ▼                          │
│  .claude/codescope/            │────>│  Reads handoff.md              │
│    handoff.md                  │     │  Injects via additionalContext │
│    (task state, progress,      │     │                                │
│     open questions, next steps)│     │                                │
└────────────────────────────────┘     └────────────────────────────────┘
```

### New Components

```
src/
├── session/
│   ├── serializer.ts          # Collects pipeline state from disk artifacts
│   └── handoff-writer.ts      # Writes handoff.md with resumption instructions
│
skills/
├── pause/
│   └── SKILL.md               # /codescope:pause skill
├── resume/
│   └── SKILL.md               # /codescope:resume skill
```

**`src/session/serializer.ts`:**
```typescript
export interface SessionState {
  task: string;                    // From orient/task-brief.md
  phase: "orient" | "execute" | "verify" | "eval" | "debug";
  progress: string;                // Summary of what's done
  pendingWork: string[];           // What remains
  openQuestions: string[];         // Unresolved decisions
  relevantFiles: string[];         // Files being worked on
  lastCoordinationEntries: string; // Recent coordination log entries
}

/**
 * Scans .claude/codescope/ artifacts to reconstruct current pipeline state.
 * Reads: orient/*.md, execution/coordination.md, reports/, plans/
 */
export function serializeSessionState(projectRoot: string): SessionState { ... }
```

**Handoff document (`handoff.md`):**
```markdown
# Session Handoff

**Task:** [from orient task brief]
**Phase:** [current pipeline phase]
**Created:** [ISO timestamp]

## Progress
[What's been completed]

## Pending Work
- [ ] [Remaining items]

## Open Questions
- [Decisions that need user input]

## Context
[Key files, conventions, blast radius info relevant to the task]

## Next Steps
1. [First thing the new session should do]
2. [Second thing]
```

**Integration with hooks:**
- The existing `SessionStart` hook handler (from Feature 1) checks for `handoff.md` and injects it as `additionalContext` when starting a new session
- `/codescope:resume` skill reads handoff.md and provides structured instructions to Claude

### Modified Files

- `src/utils/paths.ts`: Add `getHandoffPath(projectRoot)` returning `.claude/codescope/handoff.md`

---

## Feature 7: npx CLI (Distribution + Auto-Setup)

### Architecture

The `npx codescope` command handles first-time setup: installing the plugin structure, configuring the MCP server, and running initial bootstrap. It is a separate entry point from the MCP server.

```
┌────────────────────────────────────────┐
│  npx codescope                         │
│                                        │
│  CLI Entry Point (src/cli/index.ts)    │
│     │                                  │
│     ├── codescope init                 │
│     │   ├── Copy .claude-plugin/       │
│     │   ├── Copy skills/               │
│     │   ├── Copy hooks/                │
│     │   ├── Write .mcp.json            │
│     │   ├── Write .claude/settings.json│
│     │   └── Print next steps           │
│     │                                  │
│     ├── codescope bootstrap            │
│     │   └── Run bootstrap pipeline     │
│     │                                  │
│     ├── codescope dashboard            │
│     │   └── Launch visualization       │
│     │                                  │
│     └── codescope install-hooks        │
│         └── Install pre-commit hook    │
└────────────────────────────────────────┘
```

### package.json Changes

```json
{
  "name": "codescope",
  "version": "1.0.0",
  "bin": {
    "codescope": "./dist/cli/index.js"
  }
}
```

### CLI Entry Point (`src/cli/index.ts`)

```typescript
#!/usr/bin/env node
import { Command } from "commander";

const program = new Command();

program
  .name("codescope")
  .description("CodeScope: AI-powered codebase intelligence for Claude Code")
  .version("1.0.0");

program
  .command("init")
  .description("Set up CodeScope in the current project")
  .action(async () => {
    // 1. Create .claude-plugin/ with plugin.json
    // 2. Copy skills/ directory
    // 3. Copy hooks/ directory
    // 4. Write/merge .mcp.json
    // 5. Enable plugin in .claude/settings.json
    // 6. Print instructions
  });

program
  .command("dashboard")
  .description("Launch the visualization dashboard")
  .action(async () => { /* spawn dashboard server, open browser */ });

program
  .command("install-hooks")
  .description("Install git pre-commit hooks for convention enforcement")
  .action(async () => { /* install pre-commit hook */ });

program.parse();
```

### Build Configuration

```typescript
// tsdown.config.ts (updated for all entry points)
import { defineConfig } from "tsdown";
export default defineConfig({
  entry: [
    "src/server.ts",                      // MCP server
    "src/cli/index.ts",                    // npx CLI
    "src/hooks/inject-context.ts",         // Hook: context injection
    "src/hooks/convention-check.ts",       // Hook: convention check
    "src/hooks/compact-preserve.ts",       // Hook: compaction preservation
    "src/hooks/pre-commit-check.ts",       // Hook: git pre-commit
    "src/dashboard/server.ts",             // Dashboard server
  ],
  format: "esm",
  outDir: "dist",
  external: ["better-sqlite3"],
  clean: true,
});
```

### New Dependency

- `commander` -- CLI framework. Standard choice (75M+ weekly downloads). Minimal footprint. TypeScript declarations built-in.

---

## Recommended Project Structure (v2.0)

```
codescope/
├── .claude-plugin/
│   └── plugin.json                # Updated with hooks + new skills
├── skills/
│   ├── onboard/SKILL.md           # Existing
│   ├── bootstrap/SKILL.md         # Existing
│   ├── orient/SKILL.md            # Existing
│   ├── settings/SKILL.md          # Existing
│   ├── review-learnings/SKILL.md  # Existing
│   ├── dashboard/SKILL.md         # NEW: launch visualization
│   ├── review-pr/SKILL.md         # NEW: PR review
│   ├── pause/SKILL.md             # NEW: session pause
│   └── resume/SKILL.md            # NEW: session resume
├── hooks/
│   └── hooks.json                 # NEW: hook event registrations
├── scripts/                       # NEW: hook implementation scripts
│   └── codescope-pre-commit.sh    # Git pre-commit template
├── dashboard/                     # NEW: frontend SPA files
│   ├── index.html
│   ├── app.js
│   └── styles.css
├── src/
│   ├── server.ts                  # Existing MCP server entry
│   ├── cli/                       # NEW: npx CLI
│   │   ├── index.ts               # CLI entry point
│   │   ├── setup.ts               # Plugin auto-setup logic
│   │   └── commands/              # CLI subcommands
│   ├── hooks/                     # NEW: hook handler scripts
│   │   ├── inject-context.ts      # SessionStart + PreToolUse
│   │   ├── convention-check.ts    # PostToolUse
│   │   ├── compact-preserve.ts    # PreCompact
│   │   └── pre-commit-check.ts    # Git pre-commit
│   ├── dashboard/                 # NEW: dashboard server
│   │   ├── server.ts              # HTTP + WebSocket
│   │   ├── api.ts                 # REST endpoints
│   │   ├── watcher.ts             # File change detection
│   │   └── graph-export.ts        # Graphology → sigma.js JSON
│   ├── review/                    # NEW: PR review
│   │   ├── diff-parser.ts
│   │   ├── impact-analyzer.ts
│   │   └── review-generator.ts
│   ├── session/                   # NEW: session handoff
│   │   ├── serializer.ts
│   │   └── handoff-writer.ts
│   ├── graph/                     # MODIFIED
│   │   ├── staleness.ts           # NEW: per-file staleness
│   │   ├── delta-reparse.ts       # NEW: incremental updates
│   │   ├── cache.ts               # MODIFIED: staleness-aware refresh
│   │   ├── builder.ts             # Existing (minor refactor for reuse)
│   │   ├── analytics.ts           # Existing
│   │   ├── schema.ts              # Existing
│   │   ├── batch-writer.ts        # Existing
│   │   └── database.ts            # Existing
│   ├── tools/                     # MODIFIED
│   │   ├── index.ts               # MODIFIED: register new tool
│   │   ├── review.ts              # NEW: codescope_review MCP tool
│   │   └── ... (existing 12 tools)
│   ├── config/
│   │   └── schema.ts              # MODIFIED: add conventions.enforcement
│   ├── utils/
│   │   └── paths.ts               # MODIFIED: add new path helpers
│   └── ... (existing modules unchanged)
├── .mcp.json                      # Existing
├── package.json                   # MODIFIED: add bin, new deps
├── tsdown.config.ts               # MODIFIED: multiple entry points
└── tsconfig.json                  # Unchanged
```

### Structure Rationale

- **`src/hooks/`**: Hook handler scripts are compiled TypeScript that run as standalone Node.js processes. They are separate from MCP server code because they execute in a different process lifecycle (spawned per-event by Claude Code, not long-running like the MCP server).
- **`src/cli/`**: CLI entry point is independent from MCP server. Shares utility code (`src/utils/`, `src/config/`) but has its own entry in tsdown.
- **`src/dashboard/`**: Dashboard server runs as a separate process. Reads the same SQLite database and artifacts as the MCP server but never conflicts because SQLite WAL mode supports concurrent readers.
- **`src/review/`**: PR review is a new domain module following the existing agent module pattern (Options + Result + async function + artifact output).
- **`src/session/`**: Session handoff reads from existing artifacts -- it does not introduce new state, just serializes existing state into a human-readable handoff document.
- **`hooks/`** (root level, not src): Contains `hooks.json` which is a plugin configuration file read directly by Claude Code, not compiled TypeScript.

---

## Data Flow: How Features Interact

### Write Path (File Edit)

```
Claude decides to Edit a file
    │
    ▼
PreToolUse hook fires
    │ inject-context.ts reads:
    │   - conventions.md (patterns for this file)
    │   - danger-zones.md (risk level)
    │   - blast radius for the file (from graph.db)
    │ Returns: additionalContext with relevant conventions
    │
    ▼
Claude performs the Edit (with convention context in mind)
    │
    ▼
PostToolUse hook fires
    │ convention-check.ts:
    │   - Checks edited file against ast-grep patterns
    │   - Reports any violations as additionalContext
    │ Returns: feedback if violations found
    │
    ▼
MCP tool query (e.g., codescope_detect_changes)
    │ graph cache checks staleness
    │   - If file changed, delta reparse triggers
    │   - Graph updated, cache refreshed
    │ Returns: updated risk classification
```

### Dashboard Live Updates

```
Dashboard WebSocket connection
    │
    ▼
watcher.ts: fs.watch on graph.db + artifacts
    │
    ├── graph.db modified (by delta reparse or bootstrap)
    │   → Push "graph-updated" event
    │   → Dashboard reloads graph via GET /api/graph
    │
    ├── conventions.md modified
    │   → Push "conventions-updated" event
    │   → Dashboard refreshes convention panel
    │
    └── readiness-score.json modified
        → Push "readiness-updated" event
        → Dashboard refreshes trend chart
```

---

## Suggested Build Order

Based on dependency analysis between features:

### Phase 1: Hooks System + Incremental Graph (Foundation)

**Why first:** Everything else depends on these two. Hooks are the delivery mechanism for auto-injection (the core v2.0 value prop). Incremental graph keeps the intelligence fresh without manual re-bootstrap.

**Build order within phase:**
1. Incremental graph (`staleness.ts`, `delta-reparse.ts`, cache modifications) -- enables always-fresh data
2. Hook handler scripts (`inject-context.ts`, `convention-check.ts`) -- uses graph data
3. `hooks.json` registration + plugin.json update
4. `compact-preserve.ts` PreCompact handler
5. Updated tsdown config with new entry points

**Dependencies satisfied:** None (these are foundational)

### Phase 2: PR Review + Session Handoff

**Why second:** Both consume the graph and artifact data that Phase 1 keeps fresh. PR review is the most visible new user-facing feature. Session handoff completes the hooks story (SessionStart reads handoff.md).

**Build order within phase:**
1. `diff-parser.ts` -- pure function, no dependencies
2. `impact-analyzer.ts` -- reuses existing graph analytics
3. `review-generator.ts` + `codescope_review` MCP tool
4. `/codescope:review-pr` skill
5. `serializer.ts` + `handoff-writer.ts`
6. `/codescope:pause` + `/codescope:resume` skills
7. SessionStart hook handler updated to check for handoff.md

**Dependencies satisfied:** Phase 1 (fresh graph, hook infrastructure)

### Phase 3: Visualization Dashboard

**Why third:** Dashboard is a consumer of all the data produced by Phases 1-2. Building it last means it can display PR reviews, readiness trends, live graph updates -- the full picture.

**Build order within phase:**
1. `graph-export.ts` (graphology to sigma.js format conversion)
2. `api.ts` (REST endpoints reading graph.db + artifacts)
3. `server.ts` (HTTP + WebSocket)
4. `watcher.ts` (fs.watch for live updates)
5. Frontend SPA (index.html + app.js + styles.css)
6. `/codescope:dashboard` skill
7. `ws` + `sigma` + `open` dependency additions

**Dependencies satisfied:** Phase 1-2 (all data sources available)

### Phase 4: Pre-Commit Hooks + npx CLI

**Why last:** These are distribution and enforcement features. They need all the intelligence features working before distribution makes sense. Pre-commit hooks need the convention check logic from Phase 1. npx CLI needs to set up everything from Phases 1-3.

**Build order within phase:**
1. `pre-commit-check.ts` (reuses convention runner from Phase 1)
2. `install-hooks.ts` (git hook installation)
3. Config schema extension (`conventions.enforcement`)
4. CLI `src/cli/index.ts` + `setup.ts`
5. CLI subcommands (init, dashboard, install-hooks)
6. `commander` dependency + package.json `bin` field
7. npm publish preparation

**Dependencies satisfied:** All previous phases

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Sharing stdio with HTTP

**What people do:** Try to serve HTTP endpoints from the same process that uses StdioServerTransport.
**Why it is wrong:** Any stdout output from HTTP request logging corrupts the MCP JSON-RPC protocol. Claude Code will see malformed messages and disconnect.
**Do this instead:** Run the dashboard as a separate Node.js process. The MCP server and dashboard share data through SQLite (WAL mode supports concurrent readers) and filesystem artifacts.

### Anti-Pattern 2: Hook Scripts That Import the Full MCP Server

**What people do:** Import graph cache, SQLite modules, and graphology into hook scripts.
**Why it is wrong:** Hook scripts must start fast (5-10s timeout). Loading better-sqlite3, graphology, and web-tree-sitter adds 200-500ms startup. Worse, they may conflict with the MCP server's database connections.
**Do this instead:** Hook scripts read pre-computed artifacts from disk (conventions.md, danger-zones.md, overview.md). These are text files, not database queries. The MCP server keeps artifacts fresh; hooks consume them.

### Anti-Pattern 3: Full Graph Recomputation on Every Delta

**What people do:** Re-run Louvain community detection after every incremental graph update.
**Why it is wrong:** Louvain on 50K nodes takes ~940ms. Running it on every file save destroys the <100ms query target.
**Do this instead:** Mark communities as "stale" after delta updates. Recompute only on explicit request (full bootstrap, or new MCP tool call). Per-file staleness and delta reparse are O(changed files), not O(all nodes).

### Anti-Pattern 4: Frontend Build Pipeline for Dashboard

**What people do:** Add React, Vite, and a full frontend build chain for the dashboard.
**Why it is wrong:** Doubles the build complexity. Adds 100+ MB of dev dependencies. Forces users to have frontend tooling installed. The dashboard is a read-only visualization -- it does not need a component framework.
**Do this instead:** Vanilla JS with sigma.js loaded from CDN. Single index.html + app.js. Served as static files by the Node.js HTTP server. No build step for frontend.

### Anti-Pattern 5: npx CLI That Requires Global Installation

**What people do:** Document `npm install -g codescope` as the installation method.
**Why it is wrong:** Global installs conflict between projects, require sudo on some systems, and are harder to version.
**Do this instead:** `npx codescope init` runs without installation. The `bin` field in package.json makes this work automatically. Users never need to globally install.

---

## Integration Points Summary

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| MCP Server <-> Dashboard | SQLite reads (shared graph.db, WAL mode) | Dashboard is read-only. No writes to graph.db. |
| MCP Server <-> Hook Scripts | Filesystem artifacts (.claude/codescope/*.md) | Hooks read artifacts; MCP server writes them. One-directional. |
| CLI <-> Plugin | File copy + settings.json merge | CLI copies plugin files into project, then exits. |
| Pre-commit <-> Convention Runner | Compiled convention check module | Pre-commit runs the same ast-grep logic as PostToolUse hook. |
| SessionStart Hook <-> Session Handoff | handoff.md file | Handoff writes it; SessionStart reads it. |
| Delta Reparse <-> Graph Cache | `invalidateCache()` call | After delta update, cache is forced to reload from SQLite. |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude Code (host) | StdioServerTransport (MCP), hooks.json (hooks), plugin.json (manifest) | All communication is through documented Claude Code APIs |
| Git | `execSync("git diff ...")` | Used by staleness detection, PR review, pre-commit hooks |
| Browser | `open` package | Dashboard opens browser automatically |
| npm Registry | package.json `bin` field | `npx codescope` downloads and runs from npm |

---

## Sources

- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- Official hooks documentation, all event types and response formats (HIGH confidence)
- [Claude Code Hooks Guide](https://code.claude.com/docs/en/hooks-guide) -- Practical hooks usage guide (HIGH confidence)
- [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference) -- Plugin manifest schema, directory structure, distribution (HIGH confidence)
- [Claude Code Hook Development Skill](https://github.com/anthropics/claude-code/blob/main/plugins/plugin-dev/skills/hook-development/SKILL.md) -- Plugin hook development patterns (HIGH confidence)
- [sigma.js Documentation](https://www.sigmajs.org/docs/) -- Graph visualization library built on graphology (HIGH confidence)
- [ws npm Package](https://github.com/websockets/ws) -- WebSocket server for Node.js (HIGH confidence)
- [Husky Documentation](https://typicode.github.io/husky/) -- Git hooks patterns, studied to inform our approach (MEDIUM confidence -- we chose not to depend on it)
- [Claude Code Plugin Marketplace](https://code.claude.com/docs/en/discover-plugins) -- Plugin distribution and installation (HIGH confidence)
- [Claude Code Dashboard](https://github.com/Stargx/claude-code-dashboard) -- Community example of localhost dashboard pattern (MEDIUM confidence)

---
*Architecture research for: CodeScope v2.0 integration with existing v1.0 architecture*
*Researched: 2026-03-27*
