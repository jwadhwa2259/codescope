# Stack Research: CodeScope v2.0 New Feature Additions

**Domain:** Claude Code plugin -- interactive visualization dashboard, auto-injection hooks, convention enforcement
**Researched:** 2026-03-27
**Confidence:** HIGH (all versions verified via npm registry + official documentation)

## Context

This research covers ONLY the new dependencies needed for v2.0 features. The existing v1.0 stack (TypeScript 5.7, Node.js 22.x, @modelcontextprotocol/sdk, better-sqlite3, graphology, web-tree-sitter, enhanced-resolve, ast-grep, vitest, tsdown, zod) is validated and unchanged.

v2.0 adds: interactive graph visualization, real-time WebSocket updates, HTTP serving for dashboard, canvas-based heatmaps/gauges, Claude Code hooks for auto-injection, and git hooks for convention enforcement.

---

## Recommended Stack Additions

### Graph Visualization (Browser-Side)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| sigma | ^3.0.2 | WebGL graph renderer | The only serious graph visualization library built on graphology. Renders thousands of nodes/edges via WebGL instanced rendering. Zero-friction integration -- sigma reads directly from graphology Graph objects already in our stack. No adapter code needed. v3 added TypeScript generics, optimized update management, and @sigma package ecosystem. |
| @sigma/edge-curve | ^3.1.0 | Curved edge renderer | Dependency edges between modules look better as curves than straight lines. Quadratic Bezier curves via WebGL. Peer dep: sigma >=3.0.0-beta.10. |
| @sigma/node-image | ^3.0.0 | Image-in-node renderer | Render file type icons (TS, JS, PY) inside graph nodes via texture atlas for performance. Peer dep: sigma >=3.0.0-beta.10. |
| @sigma/export-image | ^3.0.0 | Graph screenshot export | Capture PNG/JPEG snapshots of current graph view from sigma's WebGL canvas. Browser-side only. Useful for including graph snapshots in PR reviews. Depends on file-saver@^2.0.5. Peer dep: sigma >=3.0.0-beta.10. |

### Graph Layout

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| graphology-layout-forceatlas2 | ^0.10.1 | Force-directed graph layout | The standard force-directed layout for graphology. JS implementation of the Gephi ForceAtlas2 algorithm. Includes Web Worker mode (`import FA2Layout from 'graphology-layout-forceatlas2/worker'`) for non-blocking layout computation in the browser. Barnes-Hut optimization (`barnesHutOptimize: true`) reduces O(n^2) to O(n log n) for large graphs. Settings inference via `forceAtlas2.inferSettings(graph)`. Peer dep: graphology-types >=0.19.0 (satisfied by existing ^0.24.8). |
| graphology-layout | ^0.6.1 | Initial position seeding | Provides `random.assign(graph)` and `circular.assign(graph)` for initial node positions. REQUIRED before ForceAtlas2 -- FA2 cannot compute layout when all nodes start at (0,0); it diverges or hangs. Pattern: `circular.assign(graph)` then run FA2. Peer dep: graphology-types >=0.19.0. |
| graphology-layout-noverlap | ^0.4.2 | Node overlap removal | Post-layout pass to eliminate visual node overlaps after FA2 converges. Important for readability with dense community clusters. Peer dep: graphology-types >=0.19.0. |

### HTTP Server + WebSocket

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| hono | ^4.12.9 | Lightweight HTTP framework | 14KB core, zero dependencies, Web Standards-based API. Serves the dashboard HTML/JS/CSS and provides REST API for graph data. Chosen over node:http (too raw -- would need to hand-roll routing, MIME types, error handling), Express (legacy, CJS-oriented), and Fastify (overkill -- we serve approximately 5 routes, not a full API). Hono is the right weight for "serve a dashboard + a few JSON endpoints." Works on Node.js >=18.14.1 (our 22.x is fine). |
| @hono/node-server | ^1.19.11 | Hono Node.js adapter | Bridges Hono's Web Standard Request/Response API to Node.js `node:http`. Required for running Hono on Node.js. Includes `serveStatic` middleware from `@hono/node-server/serve-static` for serving dashboard files. Peer dep: hono ^4. |
| @hono/node-ws | ^1.3.0 | Hono WebSocket adapter | Integrates WebSocket support into Hono routes via `upgradeWebSocket()` helper. Provides `onOpen`, `onMessage`, `onClose`, `onError` event handlers. Bundles ws@^8.17.0 as a direct dependency (not peer dep -- no extra install). Peer dep: @hono/node-server ^1.19.2 + hono ^4.6.0. |

### Canvas Rendering (Server-Side)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| @napi-rs/canvas | ^0.1.97 | Server-side canvas for heatmaps/gauges | Generates convention heatmap PNGs and readiness gauge images server-side without a browser. Skia backend, zero system dependencies (unlike node-canvas which requires Cairo/Pango). ~20MB prebuilt binary (vs 45MB + 61 deps for node-canvas). Full Canvas 2D API: fillRect, gradients, arc, text rendering -- everything needed for heatmaps and gauges. Output formats: PNG, JPEG, AVIF, WebP. Prebuilt binaries for macOS arm64/x64, Linux x64/arm64, Windows x64. |

### Claude Code Hooks (No New Dependencies)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Claude Code Hooks API | Built-in (25 event types) | Auto-injection + convention enforcement | No npm package needed. Configured in `.claude/settings.json`. CodeScope registers PreToolUse hooks (inject graph context before edits), PostToolUse hooks (update graph after changes), and SessionStart hooks (ensure graph freshness). Hook scripts are TypeScript executed via `tsx`. Full API documented below. |

### Git Hooks (No New Dependencies)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Git core.hooksPath | Built-in (git) | Convention enforcement pre-commit | No npm package needed. No husky, no lint-staged. CodeScope writes a shell script and optionally sets `git config core.hooksPath`. The pre-commit script calls our existing ast-grep convention detector. Opt-in only per project constraints. Non-invasive -- does not modify user's existing git hooks. |

---

## Installation

```bash
# Graph visualization (browser-side, bundled into dashboard JS)
npm install sigma@^3.0.2 @sigma/edge-curve@^3.1.0 @sigma/node-image@^3.0.0 @sigma/export-image@^3.0.0

# Graph layout (browser-side, bundled into dashboard JS)
npm install graphology-layout-forceatlas2@^0.10.1 graphology-layout@^0.6.1 graphology-layout-noverlap@^0.4.2

# HTTP server + WebSocket (server-side)
npm install hono@^4.12.9 @hono/node-server@^1.19.11 @hono/node-ws@^1.3.0

# Server-side canvas (heatmaps, gauges)
npm install @napi-rs/canvas@^0.1.97
```

No new dev dependencies required. The existing tsdown build pipeline handles bundling. sigma and @sigma/* packages are browser-side code bundled into the dashboard's static JS, not into the MCP server.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| sigma ^3.0.2 | d3-force + SVG | Never for this project. D3-force uses SVG (one DOM node per graph element), which chokes at 500+ nodes. sigma uses WebGL instanced rendering for 10K+ nodes. sigma reads graphology natively; d3 would require data transformation. |
| sigma ^3.0.2 | cytoscape.js | Never for this project. No graphology integration. Would require converting our entire graph to its proprietary format. 200KB+ bundle. Good library for standalone use, but the graphology ecosystem lock-in is decisive here. |
| sigma ^3.0.2 | @antv/g6 | When you need built-in tree visualizations or more layout algorithms. G6 is capable but has no graphology integration -- would require a data bridge layer. |
| sigma ^3.0.2 | vis.js (vis-network) | Never. Unmaintained since 2020. |
| hono ^4.12.9 | node:http (raw) | Never for this use case. Raw node:http requires hand-writing routing, MIME type detection, static file serving, error handling, CORS. For 5 routes + static files + WebSocket, this is unnecessary boilerplate. |
| hono ^4.12.9 | express ^5.0 | When you have an existing Express codebase to maintain. For new code in 2026, Express is legacy. Hono is 10x smaller, fully typed, Web Standards-based. |
| hono ^4.12.9 | fastify ^5.0 | When building a full API server with schema validation, serialization, lifecycle hooks. Overkill for serving a dashboard. Fastify's plugin system adds complexity we don't need. |
| @hono/node-ws | ws (raw) | When you don't use Hono. Since we chose Hono for HTTP, @hono/node-ws provides clean integration via `upgradeWebSocket()`. Raw ws would require manual HTTP upgrade handling alongside Hono routes. |
| @napi-rs/canvas | node-canvas (npm: canvas) | Never. node-canvas requires Cairo, Pango, libjpeg, libpng system dependencies. Build failures are common on macOS and CI. @napi-rs/canvas has zero system deps. |
| @napi-rs/canvas | sharp | When you only need image manipulation (resize, format conversion). Sharp cannot draw shapes, text, or gradients -- it is an image processing library, not a canvas. |
| @napi-rs/canvas | puppeteer (headless Chrome) | When you need to render complex HTML/CSS/JS as images. 150MB+ Chrome binary dependency. For simple heatmaps and gauges, Canvas 2D API is sufficient and orders of magnitude lighter. |
| graphology-layout-forceatlas2 | graphology-layout-force | When you need a simpler spring-force layout without Barnes-Hut. graphology-layout-force produces worse layouts for large graphs. FA2 is the standard for knowledge graph visualization (developed for Gephi). |
| Git core.hooksPath | husky ^9 | When the target project already uses husky. CodeScope should not modify user's git hooks infrastructure. A single shell script via core.hooksPath is simpler and non-invasive. |
| Git core.hooksPath | lefthook | When you need complex hook orchestration (parallel execution, glob filtering). Overkill for running one convention check. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| d3-force + SVG rendering | SVG creates DOM node per element. Chokes at 500+ nodes. CodeScope knowledge graphs can have 2000+ nodes. | sigma (WebGL instanced rendering, 10K+ nodes) |
| vis.js (vis-network) | Unmaintained since 2020. No graphology integration. | sigma ^3.0.2 |
| react-sigma (React wrapper) | No React in this project. CodeScope dashboard is vanilla HTML/JS served from Hono. Adding React for one page is framework bloat. | sigma directly with vanilla JS/TS |
| socket.io | 100KB+ client bundle, polling fallback, rooms, namespaces -- features we don't need. We send graph update events over a single WebSocket. | @hono/node-ws (wraps ws, 0-dependency pure WebSocket) |
| express | Legacy CJS-oriented framework. Middleware ecosystem is its strength, but we need only 2 middleware (static, CORS). | hono (14KB, typed, Web Standards) |
| node-canvas (npm: canvas) | Requires Cairo, Pango, libjpeg, libpng system deps. Fails to compile on many macOS setups. CI nightmares. | @napi-rs/canvas (zero system deps, Skia prebuilt) |
| puppeteer / playwright for screenshots | 150MB+ browser binary to render a heatmap PNG. Absurd for simple 2D graphics. | @napi-rs/canvas (server-side), @sigma/export-image (client-side graph screenshots) |
| husky / lint-staged | Modifies user's git hooks infrastructure. CodeScope should be non-invasive. | Git core.hooksPath pointing to CodeScope's own hooks directory |
| graphology-layout-forceatlas2@0.11.0-rc1 | Release candidate, not stable. | graphology-layout-forceatlas2@^0.10.1 (latest stable) |

---

## Stack Patterns by Variant

### Dashboard Architecture: Bundled Static + WebSocket

The dashboard is a set of static HTML/JS/CSS files served by Hono. No build step at deployment -- dashboard files are pre-built and bundled with the CodeScope npm package.

**Pattern:**
- Hono serves static files from `dist/dashboard/` via `serveStatic`
- sigma.js, @sigma/*, and graphology-layout-forceatlas2 are bundled into the dashboard JS (browser-side)
- Hono REST endpoints: `GET /api/graph` (full graph JSON), `GET /api/readiness` (scores), `GET /api/conventions` (heatmap data)
- WebSocket at `ws://localhost:<port>/ws` pushes incremental graph updates after file changes
- @napi-rs/canvas generates heatmap/gauge PNGs server-side, served via `GET /api/heatmap.png`

**Server setup pattern:**
```typescript
import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { createNodeWebSocket } from '@hono/node-ws'

const app = new Hono()
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

// Static dashboard files
app.use('/dashboard/*', serveStatic({ root: './dist' }))

// Graph data API
app.get('/api/graph', (c) => c.json(graph.export()))

// WebSocket for real-time updates
app.get('/ws', upgradeWebSocket((c) => ({
  onOpen(evt, ws) { clients.add(ws) },
  onClose() { clients.delete(ws) },
})))

const server = serve({ fetch: app.fetch, port: 0 }) // random available port
injectWebSocket(server)
```

### Graph Data Flow: Server to Browser

```
SQLite (better-sqlite3)
  -> graphology Graph (server-side, existing v1.0)
    -> graph.export() (graphology's built-in JSON serialization)
      -> HTTP response / WebSocket message
        -> Graph.from(data) (browser-side deserialization)
          -> circular.assign(graph) (initial positions)
            -> FA2Layout worker (force-directed layout, non-blocking)
              -> sigma renderer (WebGL)
```

Key insight: graphology's `export()` / `Graph.from()` serialization means zero custom serialization code. The same graph library runs on both server and client. Layout runs in the browser via FA2 Web Worker to keep the server lightweight.

### Claude Code Hooks: Auto-Injection Pattern

Hooks configured in `.claude/settings.json` (project-level, shareable):
```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{
          "type": "command",
          "command": "tsx .claude/codescope/hooks/pre-edit-inject.ts",
          "timeout": 10,
          "statusMessage": "Injecting CodeScope context..."
        }]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write|MultiEdit",
        "hooks": [{
          "type": "command",
          "command": "tsx .claude/codescope/hooks/post-edit-update.ts",
          "timeout": 30,
          "statusMessage": "Updating knowledge graph..."
        }]
      }
    ],
    "SessionStart": [
      {
        "hooks": [{
          "type": "command",
          "command": "tsx .claude/codescope/hooks/session-start.ts",
          "timeout": 60,
          "statusMessage": "Checking graph freshness..."
        }]
      }
    ]
  }
}
```

**PreToolUse hook script** reads JSON on stdin (contains `tool_input.file_path`), queries knowledge graph, outputs:
```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "## CodeScope Context\nFile: src/graph/index.ts\nDanger zone: HIGH centrality (0.85)\nConventions: [named exports, barrel pattern]\nBlast radius: 12 files affected"
  }
}
```

**PostToolUse hook script** reads stdin (contains `tool_input` + `tool_response`), triggers incremental graph update for changed file, pushes WebSocket event to connected dashboard.

**Key API details for hook implementation:**
- Exit 0 = success, stdout JSON parsed for output fields
- Exit 2 = blocking error, stderr fed to Claude
- Environment: `CLAUDE_PROJECT_DIR` for project root
- PreToolUse `permissionDecision`: "allow" / "deny" / "ask" for security gates
- PostToolUse `decision`: "block" with `reason` to signal issues
- `updatedInput` field can modify tool arguments before execution

### Convention Enforcement: Opt-In Pre-Commit

CodeScope writes a pre-commit hook that:
1. Gets staged files via `git diff --cached --name-only`
2. Runs ast-grep against detected conventions
3. Reports violations: `exit 2` to block (enforcement mode) or `exit 0` with warnings (suggestion mode)

Configured via `codescope.config.json`:
```json
{
  "conventionEnforcement": "suggest" | "block" | "off"
}
```

No external dependencies. The hook script uses the existing ast-grep CLI and convention YAML rules from v1.0 bootstrap output.

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| sigma@^3.0.2 | graphology@^0.26.0 | sigma depends on graphology-utils@^2.5.2. No peer dep on graphology itself -- uses it indirectly via utils. Our existing graphology@^0.26.0 is compatible. |
| @sigma/edge-curve@^3.1.0 | sigma@>=3.0.0-beta.10 | Peer dep satisfied by sigma@3.0.2. |
| @sigma/node-image@^3.0.0 | sigma@>=3.0.0-beta.10 | Peer dep satisfied by sigma@3.0.2. |
| @sigma/export-image@^3.0.0 | sigma@>=3.0.0-beta.10 | Peer dep satisfied by sigma@3.0.2. Depends on file-saver@^2.0.5. |
| graphology-layout-forceatlas2@^0.10.1 | graphology-types@>=0.19.0 | Peer dep satisfied by our graphology-types@^0.24.8. |
| graphology-layout@^0.6.1 | graphology-types@>=0.19.0 | Peer dep satisfied by our graphology-types@^0.24.8. |
| graphology-layout-noverlap@^0.4.2 | graphology-types@>=0.19.0 | Peer dep satisfied by our graphology-types@^0.24.8. |
| hono@^4.12.9 | Node.js >=18.14.1 | Our Node.js 22.x satisfies this. |
| @hono/node-server@^1.19.11 | hono@^4 | Satisfied by hono@^4.12.9. |
| @hono/node-ws@^1.3.0 | @hono/node-server@^1.19.2, hono@^4.6.0 | Both satisfied. Bundles ws@^8.17.0 as direct dep (not peer). |
| @napi-rs/canvas@^0.1.97 | Node.js >=10 | Our Node.js 22.x satisfies this. Prebuilt binaries for macOS arm64/x64, Linux x64/arm64, Windows x64. |

All new packages are compatible with the existing v1.0 stack. No version conflicts.

---

## Critical Implementation Notes

### sigma.js is Browser-Only

sigma requires WebGL and a DOM container, meaning it runs exclusively in the browser. The architecture is: Hono serves a dashboard HTML page, the browser loads sigma.js, fetches graph data from Hono REST API, and renders locally. There is no server-side sigma rendering. For server-side graph images, use @napi-rs/canvas to draw a simplified representation.

### ForceAtlas2 Web Worker Caveat

The FA2 Web Worker (`graphology-layout-forceatlas2/worker`) uses `new Worker()` internally with an inline blob. When bundling the dashboard JS:
- **Avoid `cheap-eval`-like devtool options** -- they cause severe FA2 performance degradation (documented in graphology repo)
- The worker script needs to be correctly handled by the bundler. If using tsdown/esbuild for the dashboard bundle, the web worker may need to be loaded as a separate chunk or via a CDN import
- Alternative: use the synchronous `forceAtlas2.assign(graph, { iterations: 50 })` for smaller graphs (<500 nodes) to avoid worker complexity entirely

### ForceAtlas2 Requires Initial Positions

Nodes MUST have non-zero `x` and `y` attributes before FA2 runs. Always call `circular.assign(graph)` or `random.assign(graph)` from graphology-layout first. FA2 diverges or hangs when all nodes start at (0,0). The `forceAtlas2.inferSettings(graph)` function returns reasonable defaults based on node count.

### graphology Serialization Round-Trip

Use `graph.export()` to serialize the server-side graphology Graph to JSON, and `Graph.from(data)` on the client to deserialize. This is the official serialization format. Include node attributes (community, centrality, danger score) as node properties so the dashboard can color and size nodes without additional API calls.

### @napi-rs/canvas is a Native Addon

@napi-rs/canvas ships prebuilt binaries (~20MB per platform). It uses NAPI-RS (Rust -> Node.js N-API). Supported platforms: macOS arm64/x64, Linux x64/arm64/musl, Windows x64. No compilation step on supported platforms. If distributing via `npx codescope`, the prebuilt binary downloads at install time via npm optional dependencies.

### Dashboard Bundle Strategy

sigma.js and browser packages should be pre-bundled into a single dashboard JS file during the CodeScope build step:
```json
{
  "build:dashboard": "tsdown src/dashboard/index.ts --format esm --out-dir dist/dashboard"
}
```

The dashboard is self-contained HTML with bundled JS/CSS. Served by Hono's `serveStatic`. No separate `npm install` for browser dependencies.

### Claude Code Hooks Environment Details

- Hook commands receive JSON on stdin containing tool input/response
- Key environment variable: `CLAUDE_PROJECT_DIR` (project root path)
- Hook timeout defaults: 600s for commands, 30s for prompts, 60s for agents
- Exit 0 = success (stdout JSON parsed), exit 2 = blocking error (stderr fed to Claude), other = non-blocking
- Three configuration scopes: `~/.claude/settings.json` (user), `.claude/settings.json` (project, shareable), `.claude/settings.local.json` (project, local only)
- Matchers are regex: `"Edit|Write|MultiEdit"`, `"mcp__codescope__.*"`, `"Bash"` etc.
- 25 event types available: SessionStart, PreToolUse, PostToolUse, Stop, SubagentStart/Stop, TaskCreated/Completed, FileChanged, and more
- `hookSpecificOutput.additionalContext` injects text into Claude's context before tool execution
- `hookSpecificOutput.updatedInput` can modify tool arguments (e.g., add safety checks to Bash commands)

---

## Dependency Impact Summary

| Category | New Packages | Install Size | Native Addons |
|----------|-------------|--------------|---------------|
| Graph viz (browser) | sigma, @sigma/edge-curve, @sigma/node-image, @sigma/export-image | ~150KB bundled JS | No |
| Graph layout | graphology-layout-forceatlas2, graphology-layout, graphology-layout-noverlap | ~80KB bundled JS | No |
| HTTP + WebSocket | hono, @hono/node-server, @hono/node-ws | ~110KB (includes ws) | No |
| Canvas (server) | @napi-rs/canvas | ~20MB prebuilt binary | Yes (prebuilt, no compile) |
| **Total** | **11 packages** | **~20.3MB** | **1 native addon** |

The only new native addon is @napi-rs/canvas (prebuilt, no compilation). All other packages are pure JavaScript/TypeScript. The existing native addon (better-sqlite3) is unchanged.

---

## Confidence Assessment

| Technology | Confidence | Reason |
|------------|------------|--------|
| sigma ^3.0.2 | HIGH | Verified via npm registry. Native graphology integration. WebGL instanced rendering. Active development (3.0.2 is 3 months old). |
| @sigma/* packages | HIGH | All verified via npm, peer deps checked. Official @sigma npm org. |
| graphology-layout-forceatlas2 ^0.10.1 | HIGH | Verified via npm. Part of graphology standard library. Well-documented API. FA2 algorithm is proven (Gephi heritage). |
| graphology-layout ^0.6.1 | HIGH | Verified via npm. Simple utility, stable for 3+ years. |
| hono ^4.12.9 | HIGH | Verified via npm. v4 is mature (4.12.9). 14KB, zero deps. Active community. Published 4 days ago. |
| @hono/node-ws ^1.3.0 | MEDIUM | Verified via npm. Works but relatively new (3 months). ws@^8.17.0 underneath is battle-tested. |
| @napi-rs/canvas ^0.1.97 | MEDIUM | Pre-1.0 version (0.1.97) but actively maintained (published 10 days ago). API matches Canvas 2D spec. The 0.x version is a concern for stability, but the Skia backend is mature. Fallback: generate SVG strings and convert to PNG with sharp. |
| Claude Code Hooks API | HIGH | Fully documented at code.claude.com/docs/en/hooks. 25 event types. Stable API (used in production by many projects). Verified configuration format and all field names. |
| Git core.hooksPath | HIGH | Core git feature. Stable for years. No dependencies. |

---

## Sources

- [sigma.js npm](https://www.npmjs.com/package/sigma) -- v3.0.2, deps verified via `npm view`
- [sigma.js GitHub](https://github.com/jacomyal/sigma.js/) -- package.json inspected for peer deps
- [sigma.js documentation](https://www.sigmajs.org/docs/) -- quickstart, renderer architecture
- [sigma.js v3 announcement](https://www.ouestware.com/2024/03/21/sigma-js-3-0-en/) -- WebGL instanced rendering, TypeScript generics, @sigma package org
- [@sigma/export-image npm](https://www.npmjs.com/package/@sigma/export-image) -- v3.0.0, PNG/JPEG export, file-saver dep
- [@sigma/edge-curve npm](https://www.npmjs.com/package/@sigma/edge-curve) -- v3.1.0, Bezier curves
- [@sigma/node-image npm](https://www.npmjs.com/package/@sigma/node-image) -- v3.0.0, texture atlas
- [graphology-layout-forceatlas2 docs](https://graphology.github.io/standard-library/layout-forceatlas2.html) -- full API: Web Worker mode, Barnes-Hut, settings, inferSettings
- [graphology-layout-forceatlas2 npm](https://www.npmjs.com/package/graphology-layout-forceatlas2) -- v0.10.1, peer dep verified
- [graphology-layout npm](https://www.npmjs.com/package/graphology-layout) -- v0.6.1, circular/random
- [graphology-layout-noverlap npm](https://www.npmjs.com/package/graphology-layout-noverlap) -- v0.4.2
- [hono npm](https://www.npmjs.com/package/hono) -- v4.12.9
- [hono Node.js docs](https://hono.dev/docs/getting-started/nodejs) -- serve-static, adapter setup, minimum Node versions
- [hono WebSocket helper docs](https://hono.dev/docs/helpers/websocket) -- upgradeWebSocket API, event handlers
- [@hono/node-server npm](https://www.npmjs.com/package/@hono/node-server) -- v1.19.11, peer deps verified
- [@hono/node-ws npm](https://www.npmjs.com/package/@hono/node-ws) -- v1.3.0, ws@^8.17.0 bundled as dep
- [ws npm](https://www.npmjs.com/package/ws) -- v8.20.0, de facto Node.js WebSocket library
- [@napi-rs/canvas npm](https://www.npmjs.com/package/@napi-rs/canvas) -- v0.1.97, Skia backend, zero system deps
- [@napi-rs/canvas GitHub](https://github.com/Brooooooklyn/canvas) -- prebuilt binary details, platform support
- [Claude Code Hooks reference](https://code.claude.com/docs/en/hooks) -- full API: 25 event types, matcher regex, exit codes, env vars, JSON output schema, PreToolUse/PostToolUse field details
- [Claude Code Hooks guide](https://code.claude.com/docs/en/hooks-guide) -- configuration format, .claude/settings.json scoping

---
*Stack research for: CodeScope v2.0 intelligence layer + interactive dashboard*
*Researched: 2026-03-27*
