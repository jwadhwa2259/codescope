# Phase 10: Auto-Injection - Research

**Researched:** 2026-03-28
**Domain:** Claude Code plugin hooks -- automatic context injection for file edits
**Confidence:** HIGH

## Summary

Phase 10 implements Claude Code hooks that automatically inject codebase intelligence (conventions, danger zones, blast radius) when Claude edits files. The hook scripts are stateless processes that read pre-computed artifact files from `.claude/codescope/` and return structured context via the hooks JSON protocol. No new npm dependencies are required. The phase has two main workstreams: (1) an artifact generation pipeline that runs post-bootstrap and post-incremental-rebuild, producing per-file indexed data, and (2) hook scripts registered in `hooks/hooks.json` that read those artifacts and return context via the `additionalContext` field.

The Claude Code hooks system is well-documented and mature (21 lifecycle events, 4 handler types). PreToolUse and PostToolUse hooks receive JSON on stdin with tool_name/tool_input/tool_response fields and return JSON on stdout. The `additionalContext` field in the hook output is injected into Claude's context window -- exactly the delivery mechanism needed for invisible context injection per D-09.

**Primary recommendation:** Build pre-computed JSON artifact files (danger-zone index, convention index, blast-radius snapshots) that are regenerated after every bootstrap/incremental rebuild. Hook scripts read these with `fs.readFileSync`, compose a priority-budgeted message under 500 tokens, and return it as `additionalContext`. Zero heavy computation in hooks -- all intelligence is pre-computed.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Hook scripts read pre-computed artifact files from `.claude/codescope/` (text/markdown files). No SQLite imports, no graphology, no web-tree-sitter in hooks.
- **D-02:** Artifact files are plain text/markdown -- fast `fs.readFileSync` reads with ~50ms total hook startup.
- **D-03:** No sidecar HTTP server, no daemon process. Hooks are stateless scripts that read files and return JSON.
- **D-04:** 500-token budget per file allocated via priority queue: danger zones (highest) > conventions > blast radius summary > general context (lowest).
- **D-05:** Injection format is structured bullet points -- scannable by Claude and human-readable in reasoning output.
- **D-06:** PreToolUse injection (INJECT-01): file-specific conventions, blast radius summary, danger zone warnings composed into a single `message` field in the hook's approve response.
- **D-07:** PostToolUse validation (INJECT-02): checks the written file against conventions and warns on blast radius expansion. Returns warnings as `message` in the hook response.
- **D-08:** Injection triggers when file has centrality > 0.3 OR detected conventions (medium aggressiveness per INJECT-04). Files below both thresholds produce zero injection overhead.
- **D-09:** Injection is silent context -- delivered as the hook's `message` field in the approve response. Visible in Claude's reasoning/context but not surfaced as a separate user-facing warning.
- **D-10:** PostToolUse warnings use the same silent message mechanism.
- **D-11:** Artifacts regenerated on every bootstrap AND every incremental reparse. Piggybacks on Phase 9's existing staleness detection + rebuild pipeline.
- **D-12:** Artifact generation is a post-rebuild step -- after incremental reparse completes, updated artifacts are written to disk.
- **D-13:** Artifact files include: per-file danger zone index, per-file convention summary, per-file blast radius snapshot.
- **D-14:** When bootstrap hasn't run or graph.db doesn't exist, hooks silently no-op -- return bare approve with no message.
- **D-15:** When artifact files are missing (e.g., partial bootstrap), hooks skip that artifact category and inject whatever is available.

### Claude's Discretion
- Exact artifact file format and naming convention (e.g., `danger-zones.json` vs `danger-zones.md`, per-file vs single index file)
- Hook script internal structure (single script vs separate PreToolUse/PostToolUse scripts)
- Token counting implementation (character-based approximation vs tiktoken-equivalent)
- Whether to cache parsed artifact data within a single hook invocation or re-read per file

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INJECT-01 | PreToolUse hook on Edit/Write automatically injects file-specific conventions, blast radius, and danger zone warnings into Claude's context | Claude Code hooks system supports PreToolUse with matcher "Edit\|Write", `additionalContext` field delivers context invisibly. Artifact files provide the data. |
| INJECT-02 | PostToolUse hook on Edit/Write validates changes against conventions and warns on blast radius expansion | PostToolUse hook receives `tool_input` (file_path, content) and `tool_response` for validation. Convention matching done against pre-computed convention index. |
| INJECT-03 | Injection budget capped at 500 tokens per file with priority queue (danger zones > conventions > blast radius > general) | Character-based token approximation (1 token ~ 4 chars) is standard practice. Priority queue pattern documented in Architecture Patterns below. |
| INJECT-04 | Injection triggers only for files with centrality > 0.3 OR detected conventions (medium aggressiveness) | Centrality data available in pre-computed artifact (from `computeCentrality()` in analytics.ts). Convention index keyed by file path. |
| INJECT-05 | Hooks degrade gracefully to no-op when bootstrap hasn't run or graph.db doesn't exist | `isBootstrapped()` pattern already exists in helpers.ts. Hook returns empty JSON with exit 0 for silent no-op. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack:** TypeScript, web-tree-sitter WASM (not node-tree-sitter), ast-grep CLI, better-sqlite3, graphology, vitest
- **Performance:** Plugin startup <5K tokens, graph queries <100ms
- **Build:** tsdown for bundling, tsx for development
- **Testing:** vitest with `tests/**/*.test.ts` pattern
- **Plugin structure:** `.claude-plugin/plugin.json` + skills/ + hooks/ + .mcp.json
- **Data persistence:** `.claude/codescope/` filesystem-first architecture
- **Hook scripts must NOT import:** MCP server modules, graphology, web-tree-sitter, better-sqlite3 (per ARCHITECTURE.md Anti-Pattern 2)

## Standard Stack

### Core (no new dependencies)

This phase requires NO new npm packages. All functionality is built with Node.js built-in modules and the existing project infrastructure.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node:fs | built-in | Read artifact files in hooks | Fast synchronous reads via `readFileSync` |
| node:path | built-in | Path manipulation | Standard path joining/resolution |
| better-sqlite3 | ^12.8.0 (existing) | Artifact generation reads from graph.db | Already in project, used only in MCP server artifact generation -- NOT in hook scripts |
| graphology | ^0.26.0 (existing) | Graph traversal during artifact generation | Already in project, used only in artifact generation pipeline |

### Build Configuration Change

tsdown.config.ts must add hook entry points alongside the existing server entry:

```typescript
import { defineConfig } from "tsdown";
export default defineConfig({
  entry: [
    "src/server.ts",
    "src/hooks/pre-tool-use.ts",
    "src/hooks/post-tool-use.ts",
  ],
  format: "esm",
  outDir: "dist",
  external: ["better-sqlite3"],
  clean: true,
});
```

**Verification:** `npm run build` must produce `dist/hooks/pre-tool-use.js` and `dist/hooks/post-tool-use.js` as standalone entry points with zero imports of better-sqlite3, graphology, or web-tree-sitter.

## Architecture Patterns

### Recommended Project Structure

```
src/
├── hooks/                        # Hook entry points (built to dist/hooks/)
│   ├── pre-tool-use.ts           # PreToolUse handler: read artifacts, compose message
│   ├── post-tool-use.ts          # PostToolUse handler: convention check + blast radius warning
│   └── lib/                      # Shared hook utilities (bundled into each hook)
│       ├── artifact-reader.ts    # Read + parse artifact files from .claude/codescope/
│       ├── budget-composer.ts    # Priority queue token budget allocator
│       └── types.ts              # Hook input/output type definitions
├── artifacts/                    # Artifact generation pipeline (runs in MCP server process)
│   ├── generator.ts              # Main artifact generator: reads graph, writes JSON indexes
│   ├── danger-zone-index.ts      # Generates per-file danger zone lookup
│   ├── convention-index.ts       # Generates per-file convention lookup
│   └── blast-radius-index.ts     # Generates per-file blast radius snapshots
hooks/                            # Plugin hooks directory
└── hooks.json                    # Hook event registrations (references dist/hooks/*.js)
```

### Pattern 1: Hook Input/Output Contract

**What:** Claude Code hooks receive JSON on stdin and write JSON to stdout with exit code 0.
**When to use:** Every hook script must follow this pattern.

```typescript
// Source: https://code.claude.com/docs/en/hooks

// Hook input type (received on stdin)
interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: "PreToolUse" | "PostToolUse";
  tool_name: string;
  tool_input: {
    file_path: string;
    content?: string;       // Write tool
    old_string?: string;    // Edit tool
    new_string?: string;    // Edit tool
  };
  tool_response?: unknown;  // PostToolUse only
  tool_use_id: string;
}

// PreToolUse output (write to stdout)
interface PreToolUseOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    additionalContext?: string;  // Injected into Claude's context
  };
}

// PostToolUse output (write to stdout)
interface PostToolUseOutput {
  hookSpecificOutput: {
    hookEventName: "PostToolUse";
    additionalContext?: string;  // Feedback to Claude
  };
}

// Reading stdin and writing stdout
const input: HookInput = JSON.parse(
  require("node:fs").readFileSync("/dev/stdin", "utf-8")
);

// ... process ...

console.log(JSON.stringify(output));
process.exit(0);
```

**CRITICAL CORRECTION from ARCHITECTURE.md:** The ARCHITECTURE.md uses `message` field but the official Claude Code hooks API uses `additionalContext` within `hookSpecificOutput`. The CONTEXT.md D-06/D-07 mention "message field in the hook's approve response" -- this maps to `hookSpecificOutput.additionalContext` in the actual API. Research confirms `additionalContext` is the correct field name that gets injected into Claude's context window.

### Pattern 2: Priority-Budgeted Token Composition

**What:** Compose injection content within a 500-token budget using a priority queue.
**When to use:** Every PreToolUse injection and PostToolUse warning composition.

```typescript
// Token estimation: ~4 characters per token (standard approximation)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface InjectionItem {
  priority: number;  // 1=danger zone (highest), 2=conventions, 3=blast radius, 4=general
  content: string;
}

function composeBudgetedMessage(items: InjectionItem[], maxTokens: number = 500): string {
  // Sort by priority (ascending = highest priority first)
  const sorted = [...items].sort((a, b) => a.priority - b.priority);

  const parts: string[] = [];
  let tokensUsed = 0;

  for (const item of sorted) {
    const itemTokens = estimateTokens(item.content);
    if (tokensUsed + itemTokens <= maxTokens) {
      parts.push(item.content);
      tokensUsed += itemTokens;
    }
    // Skip items that exceed budget -- lower priority items get truncated
  }

  return parts.join("\n\n");
}
```

### Pattern 3: Artifact File Format (JSON Index)

**What:** Pre-computed artifact files that hooks can read instantly with `JSON.parse(readFileSync(...))`.
**When to use:** Artifact generation pipeline writes these; hooks read them.

**Recommendation:** Use a single JSON index file per artifact category, keyed by relative file path. This avoids per-file filesystem lookups (which would be slow for the hook's ~50ms budget).

```typescript
// .claude/codescope/injection/danger-zones.json
interface DangerZoneIndex {
  generated: string;  // ISO timestamp
  files: Record<string, {
    centrality: number;
    riskScore: number;
    communitiesTouched: number;
    reasons: string[];
  }>;
}

// .claude/codescope/injection/conventions.json
interface ConventionIndex {
  generated: string;
  files: Record<string, Array<{
    name: string;
    adoption_pct: number;
    confidence: string;
    category: string;
  }>>;
}

// .claude/codescope/injection/blast-radius.json
interface BlastRadiusIndex {
  generated: string;
  files: Record<string, {
    totalAffected: number;
    byRisk: { red: number; orange: number; yellow: number; green: number };
    topAffected: string[];  // Top 5 affected file paths
  }>;
}
```

**Why JSON not Markdown:** Hooks need fast lookup by file path. JSON `Record<string, ...>` provides O(1) lookup. Parsing markdown with regex is fragile and slower. The human-readable markdown artifacts (danger-zones.md, conventions.md) remain untouched -- these JSON indexes are a separate, hook-optimized representation.

### Pattern 4: Graceful No-Op

**What:** Hook returns empty response when no bootstrap data exists.
**When to use:** Every hook must start with this guard.

```typescript
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const codescopeDir = join(projectDir, ".claude", "codescope");

// Guard: no bootstrap data = silent no-op (D-14)
if (!existsSync(join(codescopeDir, "graph.db"))) {
  console.log(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: input.hook_event_name,
    }
  }));
  process.exit(0);
}
```

### Pattern 5: Artifact Generation Post-Rebuild Hook

**What:** After incremental rebuild or full bootstrap, regenerate injection artifact files.
**When to use:** Integration point in `rebuildStaleFiles()` and `runBootstrap()`.

```typescript
// In src/graph/incremental.ts -- after rebuildStaleFiles completes:
import { generateInjectionArtifacts } from "../artifacts/generator.js";

// After cache invalidation at end of rebuildStaleFiles:
invalidateCache();

// Generate fresh artifacts for hooks
await generateInjectionArtifacts(projectRoot, db);
```

### Anti-Patterns to Avoid

- **Anti-Pattern 1: Importing heavy modules in hooks.** Hook scripts MUST NOT import better-sqlite3, graphology, web-tree-sitter, or any MCP server module. They read pre-computed files only. This is enforced by the tsdown build producing standalone bundles.
- **Anti-Pattern 2: Per-file filesystem lookups.** Do NOT create one artifact file per source file (e.g., `injection/src/foo.ts.json`). With 10K+ files, `readFileSync` for each is too slow. Use a single index file per category.
- **Anti-Pattern 3: Parsing markdown in hooks.** Do NOT parse the existing `danger-zones.md` or `conventions.md` in hooks. Those formats are for human consumption. Create separate JSON indexes optimized for programmatic lookup.
- **Anti-Pattern 4: Blocking on missing artifacts.** If an artifact file is missing, skip that category. Never throw or exit non-zero for missing artifacts (D-15).
- **Anti-Pattern 5: Full graph recomputation in hooks.** Per ARCHITECTURE.md Anti-Pattern 3. Never re-run centrality or community detection in hook scripts.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Token counting | Exact BPE tokenizer | Character-based approximation (len/4) | BPE tokenizers (tiktoken) add 2MB+ to bundle. 500-token budget is approximate anyway. len/4 is standard industry approximation. |
| JSON reading | Custom streaming parser | `JSON.parse(readFileSync(...))` | Artifact files are <100KB. Synchronous read + parse is <5ms. No need for streaming. |
| File path normalization | Custom path canonicalizer | `path.relative()` + forward-slash normalize | Existing codebase uses forward-slash relative paths (e.g., `src/graph/cache.ts`). Match that convention. |
| Convention matching | Custom AST matcher | String-based file path lookup in JSON index | Hooks don't have AST access. Convention index is pre-computed with file paths. Simple `index.files[filePath]` lookup. |

## Common Pitfalls

### Pitfall 1: CLAUDE_PROJECT_DIR vs process.cwd()

**What goes wrong:** Hook scripts assume `process.cwd()` is the project root. It may not be -- Claude Code can change working directory during a session.
**Why it happens:** `cwd` in the hook input JSON reflects Claude's current directory, not necessarily the project root.
**How to avoid:** Use `CLAUDE_PROJECT_DIR` environment variable. Fall back to `process.cwd()` only if undefined. Also, the hook input JSON contains a `cwd` field -- prefer the env var for project root.
**Warning signs:** "File not found" errors for artifact paths.

### Pitfall 2: Hook Script Build Isolation

**What goes wrong:** tsdown bundles hook entry points but accidentally includes better-sqlite3 or graphology via transitive imports, causing massive bundle size or native addon errors.
**Why it happens:** If `src/hooks/pre-tool-use.ts` imports any module that transitively imports `better-sqlite3`, tsdown will try to bundle it (and fail because it's marked external, or succeed but then the hook crashes at runtime on a machine without the native addon).
**How to avoid:** Hook scripts (`src/hooks/`) must have zero import paths leading to `src/graph/`, `src/tools/`, `src/parser/`, or `src/server.ts`. Only import from `src/hooks/lib/` (which itself only uses `node:fs` and `node:path`). Verify with: `npx tsdown --metafile` and inspect the bundle graph.
**Warning signs:** Hook taking >1s to start, "native module not found" errors, bundle size >100KB per hook.

### Pitfall 3: stdin Reading on Non-POSIX Systems

**What goes wrong:** `readFileSync("/dev/stdin", "utf-8")` fails on Windows.
**Why it happens:** `/dev/stdin` is a Unix-ism. Windows uses different file descriptors.
**How to avoid:** Use `readFileSync(0, "utf-8")` which works cross-platform (file descriptor 0 = stdin). Or use `process.stdin` with buffering.
**Warning signs:** "ENOENT: no such file or directory, open '/dev/stdin'" on Windows.

### Pitfall 4: Race Condition Between Artifact Write and Hook Read

**What goes wrong:** Hook reads partially-written artifact file during incremental rebuild.
**Why it happens:** Artifact generation writes JSON files while hooks may fire concurrently (e.g., user edits a file while rebuild is in progress).
**How to avoid:** Write artifact files atomically: write to a temp file, then `renameSync()` to the final path. `rename` is atomic on all major filesystems.
**Warning signs:** `JSON.parse` errors in hook scripts, truncated artifact data.

### Pitfall 5: Relative Path Mismatch

**What goes wrong:** Hook receives `file_path` in one format (absolute or relative-to-cwd) but artifact index uses different format (relative-to-project-root).
**Why it happens:** Edit/Write tool_input.file_path may be absolute or relative depending on how Claude invoked the tool.
**How to avoid:** Always normalize the file path to project-relative using `path.relative(projectRoot, resolvedPath)`. Handle both absolute and relative inputs.
**Warning signs:** Artifacts found for a file but hook doesn't match because of path format difference.

### Pitfall 6: Token Budget Overflow with Many Conventions

**What goes wrong:** A file with 10+ conventions generates content exceeding 500 tokens even for the conventions category alone.
**Why it happens:** Each convention line is ~15-25 tokens. 10 conventions = 150-250 tokens, leaving little room for danger zone + blast radius.
**How to avoid:** The priority queue handles this naturally: danger zones fill first, then conventions take remaining budget. Within conventions, sort by confidence (HIGH-CONF first) and truncate when budget is reached.
**Warning signs:** Injection messages that are consistently truncated.

## Code Examples

### Example 1: Complete PreToolUse Hook Script

```typescript
// src/hooks/pre-tool-use.ts
// Source: Claude Code hooks API (https://code.claude.com/docs/en/hooks)
import { readFileSync, existsSync } from "node:fs";
import { join, relative, resolve, isAbsolute } from "node:path";

// --- Types ---
interface HookInput {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  tool_name: string;
  tool_input: { file_path: string };
}

interface DangerZoneIndex {
  files: Record<string, {
    centrality: number;
    riskScore: number;
    reasons: string[];
  }>;
}

interface ConventionIndex {
  files: Record<string, Array<{
    name: string;
    adoption_pct: number;
    confidence: string;
  }>>;
}

interface BlastRadiusIndex {
  files: Record<string, {
    totalAffected: number;
    byRisk: { red: number; orange: number; yellow: number; green: number };
    topAffected: string[];
  }>;
}

// --- Read stdin ---
const input: HookInput = JSON.parse(readFileSync(0, "utf-8"));

const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd;
const codescopeDir = join(projectDir, ".claude", "codescope");
const injectionDir = join(codescopeDir, "injection");

// --- Guard: no bootstrap = no-op (D-14) ---
if (!existsSync(join(codescopeDir, "graph.db"))) {
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse" }
  }));
  process.exit(0);
}

// --- Normalize file path to project-relative ---
const rawPath = input.tool_input.file_path;
const absPath = isAbsolute(rawPath) ? rawPath : resolve(input.cwd, rawPath);
const relPath = relative(projectDir, absPath).split("\\").join("/");

// --- Read artifact indexes (skip missing per D-15) ---
function readJsonSafe<T>(filePath: string): T | null {
  try {
    if (!existsSync(filePath)) return null;
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

const dangerZones = readJsonSafe<DangerZoneIndex>(join(injectionDir, "danger-zones.json"));
const conventions = readJsonSafe<ConventionIndex>(join(injectionDir, "conventions.json"));
const blastRadius = readJsonSafe<BlastRadiusIndex>(join(injectionDir, "blast-radius.json"));

// --- Check trigger threshold (D-08) ---
const dzEntry = dangerZones?.files[relPath];
const convEntries = conventions?.files[relPath];
const centrality = dzEntry?.centrality ?? 0;
const hasConventions = convEntries && convEntries.length > 0;

if (centrality <= 0.3 && !hasConventions) {
  // Below threshold -- zero injection overhead (D-08)
  console.log(JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse" }
  }));
  process.exit(0);
}

// --- Compose budgeted message (D-04, D-05) ---
const MAX_TOKENS = 500;
const estimateTokens = (s: string) => Math.ceil(s.length / 4);

interface Item { priority: number; content: string; }
const items: Item[] = [];

// Priority 1: Danger zone warnings
if (dzEntry && dzEntry.riskScore > 0.1) {
  const lines = [`[DANGER ZONE] ${relPath} (risk: ${dzEntry.riskScore.toFixed(2)})`];
  for (const reason of dzEntry.reasons) {
    lines.push(`  - ${reason}`);
  }
  items.push({ priority: 1, content: lines.join("\n") });
}

// Priority 2: Conventions
if (convEntries && convEntries.length > 0) {
  const sorted = [...convEntries].sort((a, b) => {
    const order = { "HIGH-CONF": 0, "MEDIUM-CONF": 1, "LOW-CONF": 2 };
    return (order[a.confidence as keyof typeof order] ?? 2) - (order[b.confidence as keyof typeof order] ?? 2);
  });
  const lines = ["[CONVENTIONS]"];
  for (const c of sorted) {
    lines.push(`  - ${c.name} (${c.adoption_pct}% adoption, ${c.confidence})`);
  }
  items.push({ priority: 2, content: lines.join("\n") });
}

// Priority 3: Blast radius summary
const brEntry = blastRadius?.files[relPath];
if (brEntry && brEntry.totalAffected > 1) {
  const lines = [
    `[BLAST RADIUS] ${brEntry.totalAffected} files affected`,
    `  - Red: ${brEntry.byRisk.red}, Orange: ${brEntry.byRisk.orange}, Yellow: ${brEntry.byRisk.yellow}, Green: ${brEntry.byRisk.green}`,
  ];
  if (brEntry.topAffected.length > 0) {
    lines.push(`  - Key dependents: ${brEntry.topAffected.slice(0, 3).join(", ")}`);
  }
  items.push({ priority: 3, content: lines.join("\n") });
}

// Compose within budget
items.sort((a, b) => a.priority - b.priority);
const parts: string[] = [];
let tokensUsed = 0;
for (const item of items) {
  const t = estimateTokens(item.content);
  if (tokensUsed + t <= MAX_TOKENS) {
    parts.push(item.content);
    tokensUsed += t;
  }
}

const message = parts.length > 0 ? parts.join("\n\n") : undefined;

console.log(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    ...(message ? { additionalContext: message } : {}),
  }
}));
process.exit(0);
```

### Example 2: hooks.json Registration

```json
{
  "description": "CodeScope auto-injection: file context and convention enforcement",
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/pre-tool-use.js\"",
            "timeout": 5,
            "statusMessage": "Checking codebase context..."
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
            "command": "node \"${CLAUDE_PLUGIN_ROOT}/dist/hooks/post-tool-use.js\"",
            "timeout": 10,
            "statusMessage": "Validating against conventions..."
          }
        ]
      }
    ]
  }
}
```

### Example 3: Atomic Artifact Write

```typescript
// src/artifacts/generator.ts
import { writeFileSync, renameSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";

function writeArtifactAtomic(filePath: string, data: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tmpPath = filePath + ".tmp";
  writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  renameSync(tmpPath, filePath);  // Atomic on POSIX and NTFS
}
```

### Example 4: plugin.json Update

```json
{
  "name": "codescope",
  "version": "0.1.0",
  "description": "Deep codebase analysis for AI-powered code changes that respect existing conventions and stay within safe blast radius",
  "skills": [
    { "name": "onboard", "path": "skills/onboard/SKILL.md" },
    { "name": "bootstrap", "path": "skills/bootstrap/SKILL.md" },
    { "name": "orient", "path": "skills/orient/SKILL.md" },
    { "name": "settings", "path": "skills/settings/SKILL.md" },
    { "name": "review-learnings", "path": "skills/review-learnings/SKILL.md" }
  ],
  "hooks": "./hooks/hooks.json"
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| MCP tool calls for context | Hook-based auto-injection | Claude Code 2025+ | Context delivered proactively without tool call overhead |
| `message` field only | `additionalContext` in `hookSpecificOutput` | Claude Code hooks v2 | Proper structured output for context injection |
| Single hook handler | Separate PreToolUse/PostToolUse handlers | Always | Different concerns: pre-edit injects context, post-edit validates |
| Daemon/HTTP sidecar | Stateless scripts reading files | D-01/D-03 decision | Simpler, more reliable, no process management |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/hooks/ --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INJECT-01 | PreToolUse injects conventions, blast radius, danger zone | unit | `npx vitest run tests/hooks/pre-tool-use.test.ts -x` | Wave 0 |
| INJECT-02 | PostToolUse validates conventions, warns on blast radius expansion | unit | `npx vitest run tests/hooks/post-tool-use.test.ts -x` | Wave 0 |
| INJECT-03 | 500-token budget with priority queue | unit | `npx vitest run tests/hooks/budget-composer.test.ts -x` | Wave 0 |
| INJECT-04 | Trigger threshold: centrality > 0.3 OR conventions present | unit | `npx vitest run tests/hooks/pre-tool-use.test.ts -x` | Wave 0 |
| INJECT-05 | Graceful no-op when no bootstrap data | unit | `npx vitest run tests/hooks/pre-tool-use.test.ts -x` | Wave 0 |
| INJECT-01/02 | Artifact generation produces correct indexes | unit | `npx vitest run tests/artifacts/generator.test.ts -x` | Wave 0 |
| Integration | hooks.json registered in plugin.json | unit | `npx vitest run tests/plugin/manifest.test.ts -x` | Existing (extend) |
| Integration | Artifacts regenerated after incremental rebuild | integration | `npx vitest run tests/graph/incremental.test.ts -x` | Existing (extend) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/hooks/ tests/artifacts/ --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/hooks/pre-tool-use.test.ts` -- covers INJECT-01, INJECT-04, INJECT-05
- [ ] `tests/hooks/post-tool-use.test.ts` -- covers INJECT-02
- [ ] `tests/hooks/budget-composer.test.ts` -- covers INJECT-03
- [ ] `tests/artifacts/generator.test.ts` -- covers artifact generation pipeline
- [ ] Extend `tests/plugin/manifest.test.ts` -- verify hooks.json reference in plugin.json
- [ ] Extend `tests/graph/incremental.test.ts` -- verify artifact regeneration after rebuild

## Open Questions

1. **Convention Matching Strategy for PostToolUse**
   - What we know: PostToolUse receives the file content after edit. Convention index stores per-file convention names/categories.
   - What's unclear: How to detect "convention violations" without AST parsing in the hook. The convention index says "this file follows convention X" but doesn't have rules to check new content against.
   - Recommendation: For v1, PostToolUse convention warnings should be advisory -- check if the file is in the convention index and remind Claude of applicable conventions. Do NOT attempt to validate the written content against AST patterns (that would require ast-grep/tree-sitter in hooks, violating D-01). True convention validation is a Phase 12 (Convention Enforcement) concern.

2. **Blast Radius Expansion Detection in PostToolUse**
   - What we know: PostToolUse can check if a file has been written. Blast radius is pre-computed.
   - What's unclear: How to detect that the blast radius "expanded" without re-running BFS after the edit. The edit may add new imports, but the hook has no AST access to detect this.
   - Recommendation: PostToolUse should warn about the file's existing blast radius (pre-computed) as a reminder. Actual expansion detection requires the next incremental rebuild to detect new edges. The warning is: "This file has N dependents -- changes may propagate."

3. **Artifact File Size for Large Projects**
   - What we know: A 100K LOC project might have 2000+ files.
   - What's unclear: How large the JSON indexes will be (rough estimate: 2000 files * 200 bytes/entry = ~400KB per index, ~1.2MB total).
   - Recommendation: 1.2MB total is acceptable for `JSON.parse(readFileSync(...))`. If needed, add file-count limits (e.g., only index files with centrality > 0.1 for danger zones). Monitor actual sizes during implementation.

## Sources

### Primary (HIGH confidence)
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- Complete hooks API documentation including all 21 events, JSON input/output schemas, exit code semantics, matcher format, `additionalContext` field
- Existing codebase: `src/graph/analytics.ts` -- `computeCentrality()`, `computeDangerZones()`, `blastRadius()` implementations
- Existing codebase: `src/graph/cache.ts` -- `CachedGraph` interface, `getGraph()` with staleness-aware cache
- Existing codebase: `src/graph/incremental.ts` -- `rebuildStaleFiles()` post-rebuild hook point
- Existing codebase: `src/tools/conventions.ts` -- Convention parsing, `ParsedConvention` type
- Existing codebase: `src/agents/risk-analyzer.ts` -- Danger zone markdown generation pattern
- `.planning/research/ARCHITECTURE.md` -- Hook system integration architecture, anti-patterns

### Secondary (MEDIUM confidence)
- [Claude Code Hooks Mastery](https://github.com/disler/claude-code-hooks-mastery) -- Community patterns and examples
- [Claude Code Hooks Tutorial](https://blakecrosley.com/blog/claude-code-hooks-tutorial) -- Production hook patterns

### Tertiary (LOW confidence)
- Token estimation ratio (4 chars/token) -- widely cited approximation, accuracy varies by content type. Sufficient for a 500-token budget where exact counting is unnecessary.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new dependencies, all patterns verified against existing codebase
- Architecture: HIGH -- Hook API fully documented, artifact pattern follows existing conventions
- Pitfalls: HIGH -- Cross-platform stdin, path normalization, atomic writes are well-known concerns
- Token budgeting: MEDIUM -- 4 chars/token approximation is standard but imprecise; sufficient for this use case

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- Claude Code hooks API is production, artifact patterns use Node.js built-ins)
