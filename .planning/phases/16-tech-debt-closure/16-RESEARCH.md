# Phase 16: Tech Debt Closure - Research

**Researched:** 2026-03-29
**Domain:** Build config, TypeScript strict mode, git hooks safety, documentation traceability, cross-platform packaging
**Confidence:** HIGH

## Summary

Phase 16 closes all gaps identified in the v2.0 milestone audit. The work falls into five distinct categories: (1) MCP server path mismatch fixing, (2) TypeScript `tsc --noEmit` error resolution, (3) fork bomb prevention in install-hooks, (4) SUMMARY frontmatter gap closure for 3-source cross-reference, and (5) platform package binary extraction.

The MCP server path issue is a simple string replacement across 3 locations -- `.mcp.json`, `package.json "main"`, and `plugin-wiring.ts` -- all referencing `dist/server.js` when tsdown produces `dist/server.mjs`. The TypeScript errors are more extensive than the audit initially reported: 24 errors across 13 files, primarily caused by (a) Hono context variable typing missing `Variables` generic, (b) dashboard API routes passing wrong argument counts to analytics functions, (c) `DbHandle` interface incompatibility with `better-sqlite3` `Database` type, (d) missing type declarations for `graphology-layout-forceatlas2/worker` and `playwright`, and (e) `html2canvas` default export typing. The fork bomb is caused by idempotency failure in `installGitHooks` -- running twice backs up the CodeScope wrapper as its own predecessor, creating infinite recursion. The SUMMARY frontmatter gaps are purely documentation -- adding `requirements-completed:` YAML frontmatter to 8 SUMMARY files across 3 phases. Platform packages need binary extraction via the existing `build-platform-packages.sh` script.

**Primary recommendation:** Fix in order of blast radius -- MCP path first (unblocks all 15 tools), TypeScript errors second (build correctness), fork bomb third (safety), frontmatter fourth (traceability), platform packages last (distribution).

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVIEW-01 | codescope_review MCP tool accepts git diff/branch and returns structural impact analysis with risk scores per file | Blocked by MCP path mismatch -- fix `.mcp.json` and `package.json` to reference `dist/server.mjs` |
| REVIEW-02 | Review detects new dependency edges, circular dependencies, and cross-community changes | Same MCP path blocker; handler.ts DbHandle type mismatch also needs fixing |
| REVIEW-03 | Review runs convention compliance on changed files and flags violations | Same MCP path blocker |
| REVIEW-04 | /codescope:review skill accepts branch name, PR number, or defaults to working tree diff | Missing frontmatter in 11-03-SUMMARY.md |
| IMPACT-01 | codescope_predict_impact MCP tool accepts file paths and returns pre-change blast radius | MCP path blocker + missing frontmatter in 11-01-SUMMARY.md |
| IMPACT-02 | Reverse dependency query walks import edges backward to N hops | Missing frontmatter in 11-01-SUMMARY.md; `reverseBlastRadius` 4th arg type error in analytics.ts |
| DEBT-02 | codescope_trends MCP tool returns period comparisons | MCP path blocker |
| DIST-03 | Plugin auto-setup configures `.claude-plugin/plugin.json` and `.mcp.json` | wirePlugin() generates wrong extension; missing frontmatter in 15-01-SUMMARY.md |
| DIST-04 | npm package with platform-appropriate better-sqlite3 prebuilds bundled | Platform packages scaffolded but binaries not extracted; missing frontmatter in 15-02-SUMMARY.md |
</phase_requirements>

## Standard Stack

No new libraries required. This phase works entirely with the existing stack.

### Core (already installed)
| Library | Version | Purpose | Role in Phase 16 |
|---------|---------|---------|-------------------|
| TypeScript | ^5.7 | Type checking | `tsc --noEmit` must pass with 0 errors |
| Hono | ^4.12.9 | Dashboard HTTP server | Context `Variables` typing needed |
| better-sqlite3 | ^12.8.0 | Database | `Database` type compatibility with `DbHandle` |
| graphology-traversal | ^0.3.1 | BFS traversal | `bfsFromNode` 4th arg type resolution |
| tsdown | ^0.21.4 | Build | Produces `dist/server.mjs` (the correct output) |
| vitest | ^4.1.0 | Testing | Verify all fixes pass existing + new tests |

### Not Needed
- `playwright` -- dynamic import with graceful fallback, NOT a required dependency; use `// @ts-ignore` or declare module stub
- `graphology-layout-forceatlas2/worker` -- same pattern; types exist in package but not resolvable with `moduleResolution: "NodeNext"` due to missing `exports` field in package.json

## Architecture Patterns

### Pattern 1: Hono Typed Context Variables
**What:** Hono uses generics on `Hono<Env>` to type context variables. Without it, `c.get()` and `c.set()` only accept `never` keys.
**When to use:** Whenever storing per-request state in Hono context.
**Fix:**
```typescript
// src/dashboard/server.ts
type AppEnv = {
  Variables: {
    projectRoot: string;
  };
};

const app = new Hono<AppEnv>();
```
Each sub-router also needs the same type: `new Hono<AppEnv>()`. Alternatively, export the `AppEnv` type and use it in each API route file.

**Confidence:** HIGH -- this is standard Hono documentation pattern.

### Pattern 2: Module Declaration for Untyped Subpaths
**What:** When a package has `.d.ts` files but no `exports` field in `package.json`, TypeScript with `moduleResolution: "NodeNext"` cannot resolve subpath imports.
**Fix:** Add ambient module declarations in a `src/types/` directory:
```typescript
// src/types/graphology-fa2-worker.d.ts
declare module "graphology-layout-forceatlas2/worker" {
  import Graph from "graphology-types";
  export default class FA2LayoutSupervisor {
    constructor(graph: Graph, params?: Record<string, unknown>);
    isRunning(): boolean;
    start(): void;
    stop(): void;
    kill(): void;
  }
}
```
```typescript
// src/types/playwright.d.ts
declare module "playwright" {
  export const chromium: {
    launch(options?: Record<string, unknown>): Promise<{
      newPage(): Promise<{
        goto(url: string): Promise<void>;
        waitForSelector(selector: string): Promise<unknown>;
        screenshot(options?: Record<string, unknown>): Promise<Buffer>;
        close(): Promise<void>;
      }>;
      close(): Promise<void>;
    }>;
  };
}
```
**Confidence:** HIGH -- standard TypeScript pattern for untyped modules.

### Pattern 3: DbHandle Interface Compatibility
**What:** The `DbHandle` interface in `src/tools/review/types.ts` is too narrow. Its `prepare()` returns `{ all: (...args: unknown[]) => unknown[] }` but `better-sqlite3`'s `Database.prepare()` returns `Statement<[{}], unknown>` which has `all(params_0: {}) => unknown[]` -- the parameter types are incompatible.
**Fix:** Widen the `DbHandle` interface:
```typescript
export interface DbHandle {
  prepare: (sql: string) => {
    all: (...args: unknown[]) => unknown[];
    run: (...args: unknown[]) => unknown;
  };
}
```
Or simply import the `Database` type from `better-sqlite3` and use it directly in the graph-queries functions, eliminating the `DbHandle` abstraction.

**Confidence:** HIGH -- straightforward TypeScript type widening.

### Pattern 4: Fork Bomb Prevention via Content Check
**What:** `installGitHooks()` must check if the existing `pre-commit` IS the CodeScope wrapper before backing it up. Running twice currently renames the CodeScope wrapper to `pre-commit.codescope-backup`, causing infinite recursion.
**Fix:** Before the `renameSync`, check if the existing hook content contains the CodeScope marker:
```typescript
if (existsSync(hookPath)) {
  const existing = readFileSync(hookPath, "utf-8");
  if (existing.includes("CodeScope convention enforcement pre-commit hook")
    || existing.includes("pre-commit-check.mjs")) {
    // Already installed -- idempotent no-op
    return { installed: true, method: "git-hooks", backedUp: false,
      message: "CodeScope enforcement hook already installed." };
  }
  renameSync(hookPath, backupPath);
  backedUp = true;
}
```
**Confidence:** HIGH -- follows the same idempotency pattern as the Husky path.

### Anti-Patterns to Avoid
- **Do NOT change tsdown config to produce `.js` extension** -- the ESM output with `.mjs` is correct; the references to `.js` are the bug
- **Do NOT add `playwright` as a dependency** -- it is an optional dev dependency for screenshot export; use ambient module declaration
- **Do NOT restructure the review module** -- the quick task 260329-fkb just refactored review.ts into 8 modules; only fix the DbHandle type, do not re-architect
- **Do NOT change `html2canvas` import style** -- the issue is a CJS/ESM interop problem; fix with `(await import('html2canvas')).default as unknown as (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>`

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hono context typing | Custom middleware for type-safe context | Hono's built-in `Variables` generic | First-class framework feature |
| Module type stubs | Patching node_modules | `declare module` in ambient .d.ts files | Standard TS solution, survives reinstalls |
| Idempotent hook install | Complex state tracking | Simple content-based detection | Existing hook contains known marker string |

## Common Pitfalls

### Pitfall 1: Sub-Router Type Propagation in Hono
**What goes wrong:** Typing `Hono<AppEnv>` on the main app does not propagate to sub-routers created with `new Hono()`.
**Why it happens:** Each `new Hono()` creates an independent type context. The `app.route("/prefix", subRouter)` call does not transfer generics.
**How to avoid:** Either pass `AppEnv` to every sub-router constructor, or extract the `projectRoot` in the API route handler using a type assertion.
**Warning signs:** `c.get("projectRoot")` compiles in server.ts but errors in all 7 API route files.

### Pitfall 2: blastRadius/reverseBlastRadius Argument Mismatch in Dashboard
**What goes wrong:** Dashboard API routes call `blastRadius(graph, centralities, filePath, 4)` and `reverseBlastRadius(graph, centralities, filePath, 4)` -- passing 4 arguments when these functions take 3 (graph, nodeId, maxHops).
**Why it happens:** The dashboard was written expecting a different function signature that includes centralities. The actual analytics functions don't take centralities as a parameter.
**How to avoid:** The dashboard needs to first find the nodeId for the given filePath by searching graph nodes, then call `blastRadius(graph, nodeId, 4)`.
**Warning signs:** `TS2554: Expected 2-3 arguments, but got 4` in blast-radius.ts.

### Pitfall 3: runCommunityDetection Requires Database Parameter
**What goes wrong:** `graph.ts` API route calls `runCommunityDetection(graph)` with 1 argument but the function signature requires 2: `(graph, db)`.
**Why it happens:** The community detection function writes results to SQLite as part of its operation.
**How to avoid:** Either pass the database handle, or for the dashboard read-only use case, query communities from SQLite directly instead of recomputing.
**Warning signs:** `TS2554: Expected 2 arguments, but got 1` in graph.ts.

### Pitfall 4: bfsFromNode 4th Argument Type Resolution
**What goes wrong:** `bfsFromNode(graph, nodeId, callback, { mode: "inbound" })` in `reverseBlastRadius` reports "Expected 3 arguments, but got 4".
**Why it happens:** With `moduleResolution: "NodeNext"`, TypeScript resolves the `graphology-traversal` types differently. The `bfs.d.ts` type file uses `Graph` from `graphology-types` which is `AbstractGraph`, while the code passes `DirectedGraph` from `graphology`. The type parameter inference may fail.
**How to avoid:** Two options: (a) Cast the graph to satisfy the overload: `bfsFromNode(graph as unknown as Parameters<typeof bfsFromNode>[0], ...)`, or (b) add a `declare module` override for graphology-traversal's bfs.
**Warning signs:** Only happens with `moduleResolution: "NodeNext"` and strict mode.

### Pitfall 5: SUMMARY Frontmatter Format
**What goes wrong:** Adding wrong YAML key name or format for requirement completion tracking.
**Why it happens:** Multiple conventions exist in different documentation.
**How to avoid:** The established pattern uses `requirements-completed:` (hyphenated, in YAML frontmatter between `---` markers) with bracket array syntax: `requirements-completed: [GRAPH-01, GRAPH-02]`. See `12-01-SUMMARY.md` and `11-02-SUMMARY.md` for the exact format.
**Warning signs:** Audit cross-reference fails if format doesn't match.

### Pitfall 6: html2canvas Default Export
**What goes wrong:** `(await import('html2canvas')).default` is not callable because the CJS module's type says it has no call signatures.
**Why it happens:** html2canvas is a CJS package. With `esModuleInterop`, the default import works at runtime but TypeScript's types for CJS modules can be unreliable.
**How to avoid:** Type assertion: `const html2canvas = (await import('html2canvas')).default as unknown as (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement>`.

## Code Examples

### Fix 1: .mcp.json Path Correction
```json
{
  "mcpServers": {
    "codescope": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/server.mjs"],
      "env": {
        "CODESCOPE_GRAMMAR_DIR": "${CLAUDE_PLUGIN_ROOT}/grammars"
      }
    }
  }
}
```

### Fix 2: package.json Main Field
```json
{
  "main": "dist/server.mjs"
}
```

### Fix 3: plugin-wiring.ts MCP_JSON Constant
```typescript
const MCP_JSON = {
  mcpServers: {
    codescope: {
      command: "node",
      args: ["${CLAUDE_PLUGIN_ROOT}/dist/server.mjs"],
      env: {
        CODESCOPE_GRAMMAR_DIR: "${CLAUDE_PLUGIN_ROOT}/grammars",
      },
    },
  },
};
```

### Fix 4: Hono AppEnv Type
```typescript
// src/dashboard/types.ts (or inline in server.ts)
export type AppEnv = {
  Variables: {
    projectRoot: string;
  };
};

// In server.ts:
const app = new Hono<AppEnv>();

// In each API route file:
export const blastRadiusRouter = new Hono<AppEnv>();
```

### Fix 5: Fork Bomb Prevention
```typescript
function installGitHooks(projectRoot: string): InstallResult {
  const hooksDir = join(projectRoot, ".git", "hooks");
  const hookPath = join(hooksDir, "pre-commit");
  const backupPath = join(hooksDir, "pre-commit.codescope-backup");

  if (!existsSync(hooksDir)) {
    mkdirSync(hooksDir, { recursive: true });
  }

  // Check if CodeScope hook is already installed (idempotency)
  let backedUp = false;
  if (existsSync(hookPath)) {
    const existing = readFileSync(hookPath, "utf-8");
    if (existing.includes("CodeScope convention enforcement pre-commit hook")) {
      return {
        installed: true,
        method: "git-hooks",
        backedUp: false,
        message: "CodeScope enforcement hook already installed.",
      };
    }
    renameSync(hookPath, backupPath);
    backedUp = true;
  }

  writeFileSync(hookPath, WRAPPER_SCRIPT, { mode: 0o755 });
  chmodSync(hookPath, 0o755);

  return {
    installed: true,
    method: "git-hooks",
    backedUp,
    message: `CodeScope enforcement hook installed.${backedUp ? " Existing hook backed up." : ""}`,
  };
}
```

### Fix 6: SUMMARY Frontmatter Pattern
```yaml
---
phase: 09-graph-foundation-debt-tracking
plan: 01
# ... existing fields ...

requirements-completed: [GRAPH-01, GRAPH-02, GRAPH-03]
---
```

## TypeScript Error Inventory (24 errors, 13 files)

Complete catalog of all `tsc --noEmit` errors to resolve:

### Category A: Hono Context Variables (8 errors)
| File | Line | Error | Fix |
|------|------|-------|-----|
| `src/dashboard/server.ts` | 29 | `c.set("projectRoot")` type mismatch | Add `AppEnv` generic to `new Hono<AppEnv>()` |
| `src/dashboard/api/blast-radius.ts` | 41 | `c.get("projectRoot")` | Add `AppEnv` to sub-router |
| `src/dashboard/api/conventions.ts` | 36 | `c.get("projectRoot")` | Add `AppEnv` to sub-router |
| `src/dashboard/api/graph.ts` | 22 | `c.get("projectRoot")` | Add `AppEnv` to sub-router |
| `src/dashboard/api/impact.ts` | 13 | `c.get("projectRoot")` | Add `AppEnv` to sub-router |
| `src/dashboard/api/readiness.ts` | 38 | `c.get("projectRoot")` | Add `AppEnv` to sub-router |
| `src/dashboard/api/review.ts` | 13 | `c.get("projectRoot")` | Add `AppEnv` to sub-router |
| `src/dashboard/api/status.ts` | 16 | `c.get("projectRoot")` | Add `AppEnv` to sub-router |

### Category B: Function Argument Mismatches (4 errors)
| File | Line | Error | Fix |
|------|------|-------|-----|
| `src/dashboard/api/blast-radius.ts` | 64 | `reverseBlastRadius` got 4 args, expects 2-3 | Fix call: find nodeId first, then `reverseBlastRadius(graph, nodeId, 4)` |
| `src/dashboard/api/blast-radius.ts` | 65 | `blastRadius` got 4 args, expects 2-3 | Fix call: find nodeId first, then `blastRadius(graph, nodeId, 4)` |
| `src/dashboard/api/graph.ts` | 40 | `runCommunityDetection` got 1 arg, expects 2 | Pass `db` parameter or read communities from SQLite directly |
| `src/graph/analytics.ts` | 309 | `bfsFromNode` got 4 args, expects 3 | Type resolution issue with DirectedGraph; add ambient module declaration or type assertion |

### Category C: Type Incompatibility (3 errors)
| File | Line | Error | Fix |
|------|------|-------|-----|
| `src/tools/review/handler.ts` | 142 | `Database` not assignable to `DbHandle` | Widen `DbHandle.prepare` return type or use `Database` directly |
| `src/tools/review/handler.ts` | 146 | Same | Same fix |
| `src/tools/review/handler.ts` | 200 | Same | Same fix |

### Category D: Missing Module Declarations (3 errors)
| File | Line | Error | Fix |
|------|------|-------|-----|
| `src/dashboard/client/panels/graph.ts` | 12 | Cannot find module `graphology-layout-forceatlas2/worker` | Add `declare module` ambient declaration |
| `src/dashboard/screenshot.ts` | 54 | Cannot find module `playwright` | Add `declare module` ambient declaration |
| `src/dashboard/screenshot.ts` | 56 | Cannot find module `playwright` | Same declaration covers both |

### Category E: html2canvas + Union Type Issues (6 errors)
| File | Line | Error | Fix |
|------|------|-------|-----|
| `src/dashboard/client/panels/command.ts` | 169 | `html2canvas` not callable | Type assertion on dynamic import |
| `src/dashboard/client/panels/command.ts` | 173 | `blob` implicitly `any` | Add `: Blob \| null` type annotation |
| `src/dashboard/client/panels/command.ts` | 459 | `totalAffected` not on union type | Access through `data` after type narrowing or use optional chaining |
| `src/dashboard/client/panels/command.ts` | 459 | `total_affected` same | Same fix |
| `src/dashboard/client/panels/command.ts` | 460 | `maxRisk` same | Same fix |
| `src/dashboard/client/panels/command.ts` | 460 | `max_risk` same | Same fix |

## SUMMARY Frontmatter Gap Map

Files that need `requirements-completed:` added to their YAML frontmatter:

| File | Requirements to Add | Source |
|------|--------------------|--------|
| `09-01-SUMMARY.md` | `[GRAPH-01, GRAPH-03, GRAPH-04]` | Schema migration, CASCADE, busy_timeout |
| `09-02-SUMMARY.md` | `[GRAPH-01, GRAPH-02]` | Staleness detection, incremental reparse |
| `11-01-SUMMARY.md` | `[IMPACT-01, IMPACT-02]` | Reverse blast radius, predict_impact tool |
| `11-03-SUMMARY.md` | `[REVIEW-04]` | Review skill registration |
| `15-01-SUMMARY.md` | `[DIST-01, DIST-02, DIST-03]` | CLI, subcommands, plugin wiring |
| `15-02-SUMMARY.md` | `[DIST-04]` | npm package, platform prebuilds |

Note: Some requirements span multiple plans (e.g., GRAPH-01 involves both schema and staleness detection). The requirement should be listed in ALL plans that contribute to satisfying it.

**Cross-reference:** DEBT-02 is already listed in `09-03-SUMMARY.md` (confirmed by audit: `requirements-completed: [DEBT-01, DEBT-02]` equivalent). REVIEW-01, REVIEW-02, REVIEW-03 are already listed in `11-02-SUMMARY.md`.

## Platform Package Build Process

### Current State
- 4 platform directories exist: `darwin-arm64`, `darwin-x64`, `linux-x64`, `win32-x64`
- Each contains `package.json` only (no `.node` binary)
- `scripts/build-platform-packages.sh` is ready but not yet executed

### Build on Current Machine (darwin-arm64)
```bash
./scripts/build-platform-packages.sh
```
This extracts `better_sqlite3.node` from `node_modules/better-sqlite3/build/Release/` (or prebuilds) into `platform-packages/darwin-arm64/`.

### Cross-Platform Build
The remaining 3 platform packages (`darwin-x64`, `linux-x64`, `win32-x64`) require running the script on those respective platforms. Options:
1. **CI matrix build** -- GitHub Actions with platform matrix
2. **Manual extraction** -- Copy `.node` files from each platform's npm install
3. **Phase 16 scope** -- Build only for the current platform (darwin-arm64), document others as CI step

**Recommendation:** For Phase 16, build the current platform binary and document the CI matrix step for the other three. The package scaffolding is correct; only the binary extraction is pending.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MCP-PATH | `node dist/server.mjs` starts successfully | smoke | `node dist/server.mjs &; sleep 2; kill %1` (after `npm run build`) | No -- Wave 0 |
| TSC-CLEAN | `tsc --noEmit` passes with 0 errors | lint | `npx tsc --noEmit` | N/A (built-in) |
| FORK-BOMB | install-hooks idempotent, no self-backup | unit | `npx vitest run tests/enforcement/install-hooks.test.ts` | Yes -- needs new test case |
| FRONTMATTER | SUMMARY files have requirements-completed | manual | Grep check in verification | N/A |
| PLATFORM-PKG | darwin-arm64 package contains binary | smoke | `test -f platform-packages/darwin-arm64/better_sqlite3.node` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run` + `npx tsc --noEmit`
- **Per wave merge:** Full suite + tsc + build + server start smoke test
- **Phase gate:** Full suite green, tsc clean, server starts, all SUMMARY frontmatter present

### Wave 0 Gaps
- [ ] Add idempotency test to `tests/enforcement/install-hooks.test.ts` -- covers fork bomb scenario (run install twice, verify backup is not the CodeScope wrapper)
- [ ] Add MCP server startup smoke test (build + `node dist/server.mjs` + check for errors in first 2 seconds)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | Yes | 22.x+ | -- |
| TypeScript | tsc --noEmit | Yes | ^5.7 | -- |
| tsdown | Build | Yes | ^0.21.4 | -- |
| vitest | Tests | Yes | ^4.1.0 | -- |
| better-sqlite3 | Platform packages | Yes | ^12.8.0 | -- |
| build-platform-packages.sh | Binary extraction | Yes | N/A | -- |

**Missing dependencies with no fallback:** None
**Missing dependencies with fallback:** None

## Project Constraints (from CLAUDE.md)

Key directives that apply to Phase 16:

1. **Tech stack** -- TypeScript, better-sqlite3, graphology, @modelcontextprotocol/sdk, vitest. No alternatives.
2. **web-tree-sitter** -- Pin to ^0.25.10, NOT 0.26.x
3. **MCP SDK** -- Use @modelcontextprotocol/sdk@^1.27.1 (v1.x, stable)
4. **Build** -- tsdown, NOT tsup. ESM output (`.mjs` extension is correct).
5. **Testing** -- vitest, NOT jest
6. **Plugin structure** -- `.claude-plugin/plugin.json` + skills/ + hooks/ + `.mcp.json`
7. **MCP transport** -- StdioServerTransport (Claude Code spawns the process)
8. **Data persistence** -- `.claude/codescope/` (filesystem-first)
9. **Convention enforcement** -- ENFORCE-04 requires install-hooks does NOT overwrite existing hooks

## Open Questions

1. **bfsFromNode 4th argument type error**
   - What we know: The type definition in `bfs.d.ts` accepts 4 arguments. The runtime code works correctly. The error only appears with `moduleResolution: "NodeNext"`.
   - What's unclear: Whether this is a graphology-traversal type packaging issue or a TypeScript resolution quirk. The `worker.d.ts` for FA2 has a similar subpath resolution failure.
   - Recommendation: Use an ambient module declaration or type assertion. Do NOT change `moduleResolution` -- it's correct for the project.

2. **Cross-platform binary extraction**
   - What we know: Only darwin-arm64 can be built on this machine. The other 3 platforms need their respective environments.
   - What's unclear: Whether CI pipeline exists yet for multi-platform builds.
   - Recommendation: Build darwin-arm64 locally, document CI step for others. This satisfies the "platform packages contain extracted binaries" criteria for the current development platform.

3. **dashboard/api/graph.ts community detection**
   - What we know: `runCommunityDetection(graph)` is called without `db` parameter. The function writes to SQLite.
   - What's unclear: Whether the dashboard should recompute communities or just read them from SQLite (they're written during bootstrap).
   - Recommendation: Read communities from SQLite directly in the dashboard API route, since bootstrap already computes and stores them. This avoids the db parameter issue and is more efficient.

## Sources

### Primary (HIGH confidence)
- `.mcp.json` -- verified `dist/server.js` reference (line 5)
- `package.json` -- verified `"main": "dist/server.js"` (line 5)
- `src/cli/setup/plugin-wiring.ts` -- verified `MCP_JSON` constant (line 34)
- `tsdown.config.ts` -- verified ESM format output producing `.mjs` files
- `dist/server.mjs` -- verified file exists in build output
- `tsc --noEmit` -- ran locally, 24 errors across 13 files cataloged
- `vitest run` -- 1206 tests passing, 3 skipped, 0 failures
- `src/enforcement/install-hooks.ts` -- analyzed fork bomb path (lines 152-182)
- Hono documentation on typed context variables
- graphology-traversal `bfs.d.ts` -- 4-arg signature confirmed

### Secondary (MEDIUM confidence)
- v2.0 milestone audit report -- gap identification (may undercount TypeScript errors)

## Metadata

**Confidence breakdown:**
- MCP path fix: HIGH -- simple string replacement, verified all 3 locations
- TypeScript errors: HIGH -- ran `tsc --noEmit` locally, cataloged all 24 errors with fixes
- Fork bomb fix: HIGH -- analyzed the code path, fix is straightforward content check
- SUMMARY frontmatter: HIGH -- pattern established in existing files (12-01, 11-02)
- Platform packages: MEDIUM -- current platform build is trivial; cross-platform is CI concern

**Research date:** 2026-03-29
**Valid until:** 2026-04-28 (stable -- no external dependency changes needed)
