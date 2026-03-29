# Phase 14: Visualization Dashboard - Research

**Researched:** 2026-03-28
**Domain:** Interactive web dashboard (Hono HTTP server, sigma.js graph rendering, WebSocket real-time updates, vanilla JS UI)
**Confidence:** HIGH

## Summary

Phase 14 builds a local HTTP dashboard that visualizes CodeScope's knowledge graph data through five interactive panels: dependency graph, convention heatmap, readiness trends, blast radius explorer, and a command center. The dashboard is a separate process from the MCP server, launched via `/codescope:viz`, reading from the same SQLite database with read-only queries.

The technical foundation is solid. Hono (~14KB) serves the JSON API and static files on port 7463 with `@hono/node-server`. WebSocket support uses `@hono/node-ws` for real-time progress updates. The client is a single bundled JS file (sigma.js + graphology-layout-forceatlas2 + html2canvas + vanilla DOM) built by tsdown with `platform: 'browser'`. The graphology ecosystem is already a project dependency, and sigma.js v3 (3.0.2) is built specifically on graphology -- a natural fit.

**Primary recommendation:** Build the server-side API routes first (they reuse existing analytics/database functions), then the client panel modules one at a time starting with the graph panel (most complex, uses sigma.js), then heatmap and trends (pure DOM/SVG), then blast radius (SVG), then command center (integration panel). The FA2 Web Worker uses an inline Blob URL approach (no separate worker file), which is compatible with tsdown bundling without special configuration.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Dark OLED-optimized theme. Background: `#0F172A`, secondary bg: `#1E293B`, card bg: `#334155`, text: `#F8FAFC`, muted text: `#94A3B8`, accent/CTA: `#22C55E` (code green), danger: `#EF4444`, warning: `#F59E0B`. CSS custom properties for all colors.
- D-02: Typography: Fira Code (monospace) + Fira Sans (sans-serif). Loaded from Google Fonts with `font-display: swap`.
- D-03: Icons: Lucide SVG icons. Consistent 20x20 sizing in sidebar, 16x16 inline. No emojis as icons.
- D-04: Effects: Pulse animation for live connection indicator (2s infinite), 200-300ms transitions on hover/focus, minimal glow on accent elements only. Respect `prefers-reduced-motion`.
- D-05: Status colors: green `#22C55E`, yellow `#F59E0B`, red `#EF4444`, blue `#3B82F6`.
- D-06: Hono HTTP server on port 7463. Separate process from MCP server.
- D-07: JSON API endpoints: `/api/graph`, `/api/conventions`, `/api/readiness`, `/api/blast-radius/:file`, `/api/status`.
- D-08: Dashboard opens its own `better-sqlite3` connection with `busy_timeout(5000)`. Read-only queries.
- D-09: `/codescope:viz` skill launches Hono server and opens browser to `http://localhost:7463`.
- D-10: Single HTML entry + one bundled JS file + inlined CSS. No framework (vanilla JS + DOM APIs).
- D-11: tsdown builds client code with `platform: 'browser'` target.
- D-12: Source structure: `src/dashboard/server.ts`, `src/dashboard/api/`, `src/dashboard/client/`.
- D-13: Left sidebar navigation (56px wide) with icon + tooltip labels.
- D-14: Five panels: Graph (default), Heatmap, Trends, Blast, Command.
- D-15: Keyboard shortcuts `1`-`5` to switch panels.
- D-16: Compact header bar with CodeScope wordmark, project name, connection status.
- D-17: Bottom status bar with node/edge/community counts.
- D-18: Minimum supported viewport: 1024px width.
- D-19: sigma.js v3 WebGL renderer. Nodes sized by in-degree centrality (4-24px). Nodes colored by Louvain community. Danger zones have red glow border.
- D-20: ForceAtlas2 layout via `graphology-layout-forceatlas2/worker` (Web Worker). Server pre-computes initial circular positions.
- D-21: Scale handling: <500 full FA2, 500-2000 barnesHutOptimize, 2000+ community super-nodes.
- D-22: Graph interactions: zoom, pan, click node for details, hover to highlight, search.
- D-23: Heatmap grid of file blocks colored by compliance. Click for convention details in drawer.
- D-24: Heatmap grouping by directory, sort options.
- D-25: Hover tooltips with file path, compliance %, violation count. Numerical values alongside color.
- D-26: Four SVG gauge charts (semicircular arc) for readiness dimensions.
- D-27: Historical trend line from `readiness_history` table.
- D-28: Custom SVG rendering for gauges and line charts (no external chart library).
- D-29: Concentric ring visualization for blast radius.
- D-30: Cross-panel linking: file selection carries between panels.
- D-31: Detail on hover/click in blast radius panel.
- D-32: WebSocket endpoint at `ws://localhost:7463/ws` with specific event types.
- D-33: Event source via JSON lines in `.claude/codescope/events.log`. Dashboard tails with `fs.watch`.
- D-34: Auto-reconnect with exponential backoff.
- D-35: Real-time progress banner during bootstrap/orient.
- D-36: Command center action cards: Review, Predict Impact, Refresh Graph, Export Screenshot.
- D-37: File selection type-ahead with autocomplete from graph node list.
- D-38: Review results in slide-out right drawer (480px).
- D-39: Impact prediction highlights blast radius on graph panel.
- D-40: `npx codescope viz --screenshot output.png` via Playwright (dev dependency).
- D-41: In-browser export via `html2canvas`.

### Claude's Discretion
- Exact Hono route middleware structure (CORS, error handling, request logging)
- Community color palette selection (categorical colors for up to 20 communities)
- Graph search implementation (fuzzy match library vs simple substring)
- SVG gauge rendering details (arc math, animation easing)
- Event log rotation strategy (file size cap, cleanup frequency)
- tsdown config specifics for browser bundle (externals, splitting, minification)
- Whether to use `node:fs.watch` or `chokidar` for event file tailing
- Exact drawer animation (slide-in direction, timing function)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIZ-01 | Local HTTP server (Hono) on port 7463 serves single-page dashboard with JSON API endpoints | Hono 4.12.9 + @hono/node-server 1.19.11 verified. API route patterns documented. Database access via existing `openDatabase()`. |
| VIZ-02 | Dependency graph panel renders knowledge graph via sigma.js with nodes sized by centrality, colored by community, danger zones highlighted red | sigma.js 3.0.2 verified. Events API: clickNode, enterNode, leaveNode. @sigma/node-border 3.0.0 for danger zone glow. FA2 worker uses Blob URL (tsdown compatible). |
| VIZ-03 | Convention heatmap shows per-file compliance colored green/yellow/red with click-to-detail | Convention data from `buildConventionIndex()` (src/artifacts/convention-index.ts). Per-file entries with adoption_pct, confidence, category. |
| VIZ-04 | Readiness dashboard shows 4 gauges + historical trend line from readiness_history table | readiness_history table has all 4 dimensions + timestamps. Custom SVG gauge and line chart rendering (D-28). |
| VIZ-05 | Blast radius explorer shows concentric ring visualization for selected file | `blastRadius()` and `reverseBlastRadius()` functions in src/graph/analytics.ts. Returns nodes with hop distance and risk level. |
| VIZ-06 | WebSocket pushes real-time updates during bootstrap/orient execution | @hono/node-ws 1.3.0 verified. Event pipeline via events.log file tailing. Inline Blob worker for FA2 layout is compatible. |
| VIZ-07 | Interactive command center triggers review or impact prediction from UI | `handleReview()` and `handlePredictImpact()` functions already extracted from MCP registration. Dashboard API can call these directly. |
| VIZ-08 | Screenshot export mode via Playwright and html2canvas | Playwright 1.58.2 installed locally. html2canvas 1.4.1 for in-browser export. |
| VIZ-09 | `/codescope:viz` skill launches dashboard and opens browser | `open` package (v11.0.0) for cross-platform browser launch. Skill follows existing SKILL.md pattern. |

</phase_requirements>

## Standard Stack

### Core (New Dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| hono | ^4.12.9 | HTTP server + JSON API routing | ~14KB, built on Web Standards, built-in JSON responses, serveStatic. Locked decision D-06. |
| @hono/node-server | ^1.19.11 | Node.js HTTP adapter for Hono | Official adapter. Provides `serve()` and `serveStatic`. |
| @hono/node-ws | ^1.3.0 | WebSocket support for Hono on Node.js | Official WebSocket adapter. `createNodeWebSocket()` pattern. 87 dependents. |
| sigma | ^3.0.2 | WebGL graph rendering | Built on graphology (already in project). WebGL renderer for thousands of nodes. v3 is stable. |
| @sigma/node-border | ^3.0.0 | Node border rendering for danger zones | Renders concentric discs. Used for red glow border on danger zone nodes (D-19). |
| graphology-layout-forceatlas2 | ^0.10.1 | Force-directed layout algorithm | FA2 layout with Web Worker support. `barnesHutOptimize` for large graphs. Uses inline Blob URL worker (bundler-compatible). |
| html2canvas | ^1.4.1 | In-browser screenshot capture | Captures DOM as canvas for PNG export. Used by "Export Screenshot" command center action (D-41). |
| open | ^11.0.0 | Cross-platform browser launch | Opens URL in default browser. ESM-only. Used by `/codescope:viz` skill. |

### Core (Already in Project)

| Library | Version | Purpose | Already Installed |
|---------|---------|---------|-------------------|
| better-sqlite3 | ^12.8.0 | Database access | Yes -- dashboard opens read-only connection to graph.db |
| graphology | ^0.26.0 | In-memory graph | Yes -- loaded from SQLite, passed to sigma.js renderer |
| graphology-communities-louvain | ^2.0.2 | Community detection | Yes -- communities pre-computed in DB |
| graphology-metrics | ^2.4.0 | Centrality computation | Yes -- in-degree centrality for node sizing |
| graphology-traversal | ^0.3.1 | BFS traversal | Yes -- blast radius computation |
| tsdown | ^0.21.4 | Build tooling | Yes -- needs new entry points for dashboard |

### Dev Dependencies (New)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| playwright | ^1.58.2 | Headless screenshot | Dev dependency only. `npx codescope viz --screenshot` (VIZ-08). Already installed globally. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| hono | express | Express is heavier (~200KB vs ~14KB), not Web Standards based. Hono is the locked decision. |
| sigma.js | d3-force + SVG | D3 SVG can't handle thousands of nodes (no WebGL). sigma.js is purpose-built for large graphs on graphology. |
| html2canvas | dom-to-image | html2canvas has wider adoption (4M weekly downloads). dom-to-image is unmaintained. |
| Custom SVG gauges | chart.js / d3 | D-28 explicitly says custom SVG (no external chart library). Gauges are simple semicircular arcs. |
| `open` package | child_process exec | `open` handles macOS/Linux/Windows differences safely. |
| `node:fs.watch` | chokidar | `node:fs.watch` is built-in, no extra dependency. chokidar adds ~300KB. For a single file tail, built-in is sufficient. |

**Installation:**
```bash
npm install hono @hono/node-server @hono/node-ws sigma @sigma/node-border graphology-layout-forceatlas2 html2canvas open
npm install -D playwright
```

## Architecture Patterns

### Recommended Project Structure

```
src/dashboard/
  server.ts              -- Hono HTTP + WebSocket server entry point
  api/
    graph.ts             -- /api/graph route handler
    conventions.ts       -- /api/conventions route handler
    readiness.ts         -- /api/readiness route handler
    blast-radius.ts      -- /api/blast-radius/:file route handler
    status.ts            -- /api/status route handler
    review.ts            -- /api/review route handler (wraps handleReview)
    impact.ts            -- /api/impact route handler (wraps handlePredictImpact)
  client/
    index.html           -- Dashboard shell (dark theme, panel containers, inlined CSS)
    app.ts               -- Main entry (panel routing, WebSocket client, keyboard shortcuts)
    panels/
      graph.ts           -- sigma.js dependency graph panel
      heatmap.ts         -- Convention compliance heatmap panel
      trends.ts          -- Readiness gauges + historical trend line panel
      blast-radius.ts    -- Concentric ring blast radius panel
      command.ts         -- Command center action card panel
    components/
      sidebar.ts         -- Navigation sidebar with icons
      status-bar.ts      -- Bottom status bar
      drawer.ts          -- Right slide-out drawer (480px)
      search.ts          -- Type-ahead search with autocomplete
      progress-banner.ts -- WebSocket progress overlay
      tooltip.ts         -- Hover tooltip
    lib/
      api-client.ts      -- Fetch wrapper for JSON API endpoints
      ws-client.ts       -- WebSocket connection manager with reconnect
      icons.ts           -- Lucide SVG icon strings (inline, no package dependency)
      format.ts          -- Number formatting, grade display helpers
```

### Pattern 1: Server-Side API Route Structure

**What:** Each API route handler reads from SQLite and returns structured JSON. Reuses existing analytics functions.

**When to use:** All `/api/*` endpoints.

```typescript
// Source: Existing tool pattern (src/tools/helpers.ts okResponse/errorResponse)
// Adapted for Hono context
import { Hono } from 'hono';
import { openDatabase, closeDatabase } from '../../graph/database.js';
import { getGraphDbPath } from '../../utils/paths.js';
import { loadGraphFromSQLite, computeCentrality } from '../../graph/analytics.js';

const graphRouter = new Hono();

graphRouter.get('/graph', (c) => {
  const projectRoot = c.get('projectRoot');
  const dbPath = getGraphDbPath(projectRoot);

  if (!fs.existsSync(dbPath)) {
    return c.json({ status: 'error', code: 'NOT_BOOTSTRAPPED',
      message: 'No codebase data yet' }, 404);
  }

  const db = openDatabase(dbPath);
  try {
    const graph = loadGraphFromSQLite(db);
    const { centralities } = computeCentrality(graph);

    // Serialize graph for client
    const nodes = [];
    graph.forEachNode((id, attrs) => {
      nodes.push({
        id, ...attrs,
        centrality: centralities.get(id) ?? 0,
      });
    });

    const edges = [];
    graph.forEachEdge((id, attrs, source, target) => {
      edges.push({ id, source, target, ...attrs });
    });

    // Communities from DB
    const communities = db.prepare(
      'SELECT node_id, community_id, modularity_class FROM communities'
    ).all();

    return c.json({ status: 'ok', data: { nodes, edges, communities } });
  } finally {
    closeDatabase(db);
  }
});
```

### Pattern 2: WebSocket Event Broadcasting

**What:** Dashboard server tails events.log and broadcasts to connected WebSocket clients.

**When to use:** Real-time updates during bootstrap/orient (VIZ-06).

```typescript
// Source: @hono/node-ws docs + D-33 event pipeline design
import { createNodeWebSocket } from '@hono/node-ws';
import { serve } from '@hono/node-server';
import * as fs from 'node:fs';

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

const clients = new Set<WSContext>();

app.get('/ws', upgradeWebSocket((c) => ({
  onOpen(_event, ws) {
    clients.add(ws);
  },
  onClose(_event, ws) {
    clients.delete(ws);
  },
})));

// File tail: watch events.log for changes
function startEventTail(eventsLogPath: string) {
  let lastSize = 0;

  fs.watch(eventsLogPath, () => {
    const stat = fs.statSync(eventsLogPath);
    if (stat.size > lastSize) {
      const stream = fs.createReadStream(eventsLogPath, { start: lastSize });
      let buffer = '';
      stream.on('data', (chunk) => { buffer += chunk; });
      stream.on('end', () => {
        const lines = buffer.split('\n').filter(Boolean);
        for (const line of lines) {
          // Broadcast to all connected clients
          for (const ws of clients) {
            ws.send(line);
          }
        }
        lastSize = stat.size;
      });
    }
  });
}

const server = serve({ fetch: app.fetch, port: 7463 });
injectWebSocket(server);
```

### Pattern 3: Client Panel Module Pattern

**What:** Each panel exports a `render(container)` function and manages its own DOM lifecycle.

**When to use:** All five panel modules.

```typescript
// Source: D-10 vanilla JS + DOM APIs pattern
export interface PanelContext {
  container: HTMLElement;
  api: ApiClient;         // Fetch wrapper
  ws: WebSocketClient;    // WS event dispatcher
  onSelectFile: (filePath: string) => void;  // Cross-panel file selection
}

export function renderGraphPanel(ctx: PanelContext): { destroy: () => void } {
  const { container, api } = ctx;

  // Create DOM structure
  const searchBar = document.createElement('div');
  const graphContainer = document.createElement('div');
  container.appendChild(searchBar);
  container.appendChild(graphContainer);

  let sigma: Sigma | null = null;
  let fa2Layout: FA2Layout | null = null;

  // Load data and initialize sigma
  api.fetchGraph().then(data => {
    const graph = new DirectedGraph();
    // ... populate from API data ...

    sigma = new Sigma(graph, graphContainer, {
      // renderer settings
    });

    fa2Layout = new FA2Layout(graph, {
      settings: { barnesHutOptimize: graph.order > 500 }
    });
    fa2Layout.start();
  });

  return {
    destroy() {
      fa2Layout?.kill();
      sigma?.kill();
      container.innerHTML = '';
    }
  };
}
```

### Pattern 4: tsdown Multi-Entry Configuration

**What:** Dashboard adds two new entry points to the build: server bundle (Node.js) and client bundle (browser).

**When to use:** tsdown.config.ts update.

```typescript
// Source: Existing tsdown.config.ts pattern + D-11 browser target
import { defineConfig } from "tsdown";
export default defineConfig([
  // Existing server entries
  {
    entry: [
      "src/server.ts",
      "src/hooks/pre-tool-use.ts",
      "src/hooks/post-tool-use.ts",
      "src/hooks/pre-compact.ts",
      "src/hooks/session-start.ts",
      "src/enforcement/pre-commit-check.ts",
      "src/session/handoff-generator.ts",
      "src/session/handoff-parser.ts",
      "src/session/session-cleanup.ts",
      "src/dashboard/server.ts",  // NEW: dashboard server
    ],
    format: "esm",
    outDir: "dist",
    external: ["better-sqlite3"],
    clean: true,
  },
  // NEW: Dashboard client bundle (browser target)
  {
    entry: ["src/dashboard/client/app.ts"],
    format: "esm",
    outDir: "dist/dashboard",
    platform: "browser",
    // sigma.js, graphology, html2canvas bundled into single file
    clean: false,  // Don't clean dist/ (shared with server)
  },
]);
```

### Pattern 5: Skill Registration

**What:** Add `/codescope:viz` skill that launches the dashboard server process and opens the browser.

**When to use:** VIZ-09.

```markdown
# skills/viz/SKILL.md
---
name: viz
description: Launch the CodeScope visualization dashboard in your browser.
allowed-tools:
  - Bash
  - Read
---

## /codescope:viz

1. Check if port 7463 is already in use
2. Launch dashboard server: `node dist/dashboard/server.mjs &`
3. Wait for server ready (poll http://localhost:7463/api/status)
4. Open browser to http://localhost:7463
```

### Anti-Patterns to Avoid

- **Importing MCP SDK in dashboard:** The dashboard server is NOT an MCP server. It uses Hono, not McpServer. Do not import `@modelcontextprotocol/sdk` in dashboard code.
- **Writing to database from dashboard:** D-08 explicitly says read-only queries. Dashboard NEVER writes. Only the MCP server and bootstrap process write.
- **Importing heavy server modules in client code:** Client bundle must be isolated from Node.js modules. Use the `platform: 'browser'` tsdown target to catch accidental Node imports at build time.
- **Using `better-sqlite3` in client code:** The client fetches data via the JSON API. SQLite is server-side only.
- **Direct dashboard-to-execution coupling:** D-33 says event pipeline uses JSON lines file. Dashboard server does NOT import execution modules. It tails a log file.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebGL graph rendering | Custom WebGL renderer | sigma.js v3 | Sigma handles WebGL shaders, camera, picking, label rendering, edge programs. Thousands of hours of development. |
| Force-directed layout | Custom force simulation | graphology-layout-forceatlas2/worker | FA2 is a well-known algorithm with Web Worker support. The Blob URL worker creation is bundler-compatible. |
| HTTP framework | Raw `node:http` | Hono + @hono/node-server | Routing, middleware, JSON responses, static files all built-in. ~14KB. |
| WebSocket server | Raw `ws` package | @hono/node-ws | Integrates with Hono routing. Handles upgrade, connection management. |
| Cross-platform browser open | `child_process.exec('open ...')` | `open` package | Handles macOS, Linux, Windows. Escapes URLs safely. |
| DOM screenshot | Canvas pixel manipulation | html2canvas | Renders DOM to canvas. Handles CSS, transforms, fonts. |
| Headless screenshot | Custom puppeteer setup | Playwright | Industry standard. `page.screenshot()` is one line. |
| Community detection | Custom modularity algorithm | graphology-communities-louvain | Already used in project. Louvain is standard. |
| Graph centrality | Custom degree calculation | graphology-metrics | Already used in project. Normalized centrality. |

**Key insight:** The visualization layer should be thin -- it renders data that's already computed by the existing graph analytics. The dashboard is a read-only view over pre-computed knowledge. The heavy computation (parsing, graph building, community detection, centrality, blast radius) is done by bootstrap and MCP tools.

## Common Pitfalls

### Pitfall 1: FA2 Worker Bundling

**What goes wrong:** The ForceAtlas2 web worker may fail to initialize in the bundled client because the worker code references `window.URL` which may not be available in all bundling contexts.
**Why it happens:** graphology-layout-forceatlas2 creates workers via Blob URL: `new Blob(['(' + code + ').call(this);'])`. The function passed to the worker must be fully self-contained after bundling.
**How to avoid:** FA2's Blob URL approach is inherently bundler-compatible because it stringifies the function at runtime. However, do NOT use any tsdown features that would tree-shake or mangle the worker function's internals. Test the bundled output in a browser early. If issues arise, use the synchronous `forceAtlas2.assign(graph, { iterations: 50 })` as a fallback for initial layout, and skip the live worker.
**Warning signs:** Graph renders but all nodes are at origin (0,0). Console shows "Worker is not defined" or Blob URL errors.

### Pitfall 2: Sigma.js Memory Leaks

**What goes wrong:** Sigma.js renderer accumulates WebGL resources if not properly killed between panel switches.
**Why it happens:** Each `new Sigma(graph, container)` allocates WebGL buffers and canvas contexts. Browsers limit WebGL contexts (typically 8-16 per page).
**How to avoid:** Call `sigma.kill()` when leaving the graph panel. Do NOT create multiple Sigma instances. Similarly call `fa2Layout.kill()` to terminate the worker thread. The panel destroy() pattern handles this.
**Warning signs:** "Too many active WebGL contexts" console warning. Graph panel blank after several panel switches.

### Pitfall 3: SQLite Concurrent Access

**What goes wrong:** Dashboard queries block or timeout when bootstrap is writing to the database.
**Why it happens:** SQLite WAL mode allows concurrent reads, but writes still acquire an exclusive lock briefly.
**How to avoid:** D-08 already mandates `busy_timeout(5000)`. The existing `openDatabase()` function sets this pragma. Dashboard queries should be fast (SELECT only, with indexes). Don't hold connections open -- open, query, close per request.
**Warning signs:** API responses returning 500 errors during bootstrap. "database is locked" errors in logs.

### Pitfall 4: Large Graph Serialization

**What goes wrong:** `/api/graph` response is too large for graphs with thousands of nodes, causing slow page load.
**Why it happens:** Each node has multiple attributes (name, kind, filePath, loc, centrality, community). Multiply by 5000+ nodes.
**How to avoid:** D-21 specifies scale handling: for 2000+ nodes, return community-level super-nodes instead of individual nodes. Implement pagination or lazy loading for large graphs. Consider gzip compression on the Hono response (built-in `compress()` middleware).
**Warning signs:** Initial page load takes >3 seconds. Browser tab memory >500MB.

### Pitfall 5: WebSocket Reconnection Race Condition

**What goes wrong:** After reconnecting, the client fetches stale data because the API cache hasn't been invalidated yet.
**Why it happens:** The graph cache in `src/graph/cache.ts` has a 5-minute TTL. If the dashboard server's SQLite connection returns cached data from before a bootstrap run, the UI will show outdated information.
**How to avoid:** The dashboard server should NOT use the MCP server's graph cache. It opens its own database connection per request. After reconnection, the client should fetch fresh data from all API endpoints, and the `graph:updated` WebSocket event should trigger a full data refresh.
**Warning signs:** After bootstrap completes, dashboard still shows old node/edge counts until manual page refresh.

### Pitfall 6: HTML Index File Serving

**What goes wrong:** Hono serves the static JS/CSS but returns 404 for the root URL or panel routes.
**Why it happens:** Single-page app with client-side routing needs a catch-all route that serves `index.html`.
**How to avoid:** Set up Hono routes in this order: (1) `/api/*` routes, (2) `/ws` WebSocket endpoint, (3) `serveStatic` for `/dashboard.js` and other assets, (4) catch-all `*` returns `index.html`. Since D-10 uses a single HTML file, all panel "routing" is client-side DOM manipulation.
**Warning signs:** Navigating to `http://localhost:7463` shows "Not Found".

### Pitfall 7: Event Log File Not Existing

**What goes wrong:** `fs.watch` throws if events.log doesn't exist when the dashboard starts.
**Why it happens:** The events.log file is only created when bootstrap or orient runs. If neither has run, the file doesn't exist.
**How to avoid:** Check if the file exists before watching. If it doesn't exist, watch the parent directory for file creation, then switch to watching the file itself. Alternatively, create the events.log file on dashboard startup (empty file is fine -- the tail logic already handles reading from the last known position).
**Warning signs:** Dashboard crashes on startup with ENOENT error. WebSocket status shows "connected" but no events ever arrive.

## Code Examples

### sigma.js v3 Node Rendering with Danger Zone Glow

```typescript
// Source: https://www.sigmajs.org/docs/advanced/renderers/
// + @sigma/node-border for danger zone visualization
import Sigma from 'sigma';
import { DirectedGraph } from 'graphology';
import { NodeBorderProgram, createNodeBorderProgram } from '@sigma/node-border';

const COMMUNITY_COLORS = [
  '#22C55E', '#3B82F6', '#F59E0B', '#EF4444', '#A855F7',
  '#EC4899', '#06B6D4', '#F97316', '#84CC16', '#14B8A6',
  '#8B5CF6', '#78716C',
];

const sigma = new Sigma(graph, container, {
  defaultNodeType: 'bordered',
  nodeProgramClasses: {
    bordered: createNodeBorderProgram({
      borders: [
        { size: { attribute: 'borderSize', defaultValue: 0 }, color: { attribute: 'borderColor' } },
      ],
    }),
  },
  nodeReducer: (node, data) => {
    const centrality = data.centrality ?? 0;
    const community = data.community ?? 0;
    const isDangerZone = data.isDangerZone ?? false;

    return {
      ...data,
      size: 4 + centrality * 20,  // 4px min, 24px max
      color: COMMUNITY_COLORS[community % COMMUNITY_COLORS.length],
      borderSize: isDangerZone ? 0.3 : 0,
      borderColor: '#EF4444',  // Red glow for danger zones
    };
  },
});
```

### sigma.js Event Handling

```typescript
// Source: https://www.sigmajs.org/docs/advanced/events/
sigma.on('clickNode', ({ node }) => {
  const attrs = graph.getNodeAttributes(node);
  showNodeDetail({
    filePath: attrs.filePath,
    centrality: attrs.centrality,
    community: attrs.community,
    imports: graph.outDegree(node),
    importers: graph.inDegree(node),
  });
});

sigma.on('enterNode', ({ node }) => {
  // Highlight connected edges, dim unconnected nodes
  const connectedNodes = new Set(graph.neighbors(node));
  connectedNodes.add(node);

  sigma.setSetting('nodeReducer', (n, data) => ({
    ...data,
    color: connectedNodes.has(n) ? data.color : '#334155',
    zIndex: connectedNodes.has(n) ? 1 : 0,
  }));
});

sigma.on('leaveNode', () => {
  // Reset to default reducer
  sigma.setSetting('nodeReducer', defaultNodeReducer);
});

sigma.on('doubleClickNode', ({ node }) => {
  // Cross-panel link: switch to blast radius for this file
  const attrs = graph.getNodeAttributes(node);
  ctx.onSelectFile(attrs.filePath);
  // Panel router handles the switch
});
```

### SVG Gauge Rendering (Semicircular Arc)

```typescript
// Source: D-26, D-28 custom SVG rendering
function renderGauge(
  container: HTMLElement,
  percent: number,
  grade: string,
  label: string,
  color: string,
): void {
  const radius = 60;
  const strokeWidth = 12;
  const cx = 70;
  const cy = 70;

  // Semicircular arc from 180deg to 0deg (left to right)
  const startAngle = Math.PI;
  const endAngle = startAngle - (percent / 100) * Math.PI;

  const bgEndX = cx + radius * Math.cos(0);
  const bgEndY = cy - radius * Math.sin(0);
  const bgStartX = cx + radius * Math.cos(Math.PI);
  const bgStartY = cy - radius * Math.sin(Math.PI);

  const fillEndX = cx + radius * Math.cos(endAngle);
  const fillEndY = cy - radius * Math.sin(endAngle);
  const largeArc = percent > 50 ? 1 : 0;

  const svg = `
    <svg viewBox="0 0 140 90" width="140" height="90">
      <!-- Background arc (gray) -->
      <path d="M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 1 1 ${bgEndX} ${bgEndY}"
            fill="none" stroke="#334155" stroke-width="${strokeWidth}" stroke-linecap="round"/>
      <!-- Fill arc (colored) -->
      <path d="M ${bgStartX} ${bgStartY} A ${radius} ${radius} 0 ${largeArc} 1 ${fillEndX} ${fillEndY}"
            fill="none" stroke="${color}" stroke-width="${strokeWidth}" stroke-linecap="round"/>
      <!-- Center text -->
      <text x="${cx}" y="${cy - 8}" text-anchor="middle"
            font-family="var(--font-mono)" font-size="28" font-weight="600"
            fill="var(--color-text-primary)">${percent}%</text>
      <text x="${cx}" y="${cy + 14}" text-anchor="middle"
            font-family="var(--font-mono)" font-size="14"
            fill="${color}">${grade}</text>
    </svg>
    <div style="text-align: center; font-size: 12px; color: var(--color-text-muted);
                font-family: var(--font-sans);">${label}</div>
  `;
  container.innerHTML = svg;
}
```

### Hono Server with WebSocket Setup

```typescript
// Source: https://hono.dev/docs/getting-started/nodejs + @hono/node-ws docs
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createNodeWebSocket } from '@hono/node-ws';
import { compress } from 'hono/compress';

const app = new Hono();
const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app });

// Middleware
app.use('*', compress());

// API routes
app.route('/api', apiRouter);

// WebSocket
app.get('/ws', upgradeWebSocket((c) => ({
  onOpen(_event, ws) { clients.add(ws); },
  onClose(_event, ws) { clients.delete(ws); },
})));

// Static files (built client bundle)
app.use('/dashboard.js', serveStatic({ path: './dist/dashboard/app.mjs' }));

// SPA fallback: serve index.html for all other routes
app.get('*', (c) => c.html(indexHtmlContent));

// Start server
const server = serve({ fetch: app.fetch, port: 7463 });
injectWebSocket(server);
```

### Hono API Route with SQLite

```typescript
// Source: Existing pattern from src/tools/readiness-tool.ts adapted for Hono
import { Hono } from 'hono';
import { openDatabase, closeDatabase } from '../../graph/database.js';
import { getGraphDbPath } from '../../utils/paths.js';

export const readinessRouter = new Hono();

readinessRouter.get('/', (c) => {
  const projectRoot = c.get('projectRoot') as string;
  const dbPath = getGraphDbPath(projectRoot);

  const db = openDatabase(dbPath);
  try {
    // Current scores
    const latest = db.prepare(
      'SELECT * FROM readiness_history ORDER BY timestamp DESC LIMIT 1'
    ).get();

    // History for trend chart
    const history = db.prepare(
      'SELECT * FROM readiness_history ORDER BY timestamp ASC'
    ).all();

    return c.json({
      status: 'ok',
      data: { current: latest, history },
    });
  } finally {
    closeDatabase(db);
  }
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| sigma.js v2 (Canvas) | sigma.js v3 (WebGL) | March 2024 | 10x+ rendering performance. New events API. graphology integration tighter. |
| Hono 3.x | Hono 4.x | 2024 | Node.js adapter improvements. WebSocket helper. compress() middleware. |
| tsup bundler | tsdown bundler | 2025 | Rolldown-powered. Multi-config array support for parallel builds. |
| puppeteer for screenshots | Playwright | 2023+ | Multi-browser. Lighter install. Better API. |

**Deprecated/outdated:**
- sigma.js v1 (settings-based API, no graphology) -- completely rewritten in v2/v3
- `opn` npm package -- renamed to `open`, old name deprecated
- `html2canvas` hasn't had a major release since 2022 (v1.4.1) but still works. No successor with broad adoption.

## Open Questions

1. **FA2 + tsdown browser bundle compatibility**
   - What we know: FA2 worker uses Blob URL from stringified function (verified in source). This should work with any bundler.
   - What's unclear: Whether tsdown's tree-shaking or minification mangles the self-contained worker function body.
   - Recommendation: Build the client bundle early and test FA2 in a browser. Fallback: use synchronous `forceAtlas2.assign()` with 50-100 iterations for initial layout if worker fails.

2. **Event log format and emitter integration**
   - What we know: D-33 specifies JSON lines in `.claude/codescope/events.log`. Dashboard tails this file.
   - What's unclear: The existing execution pipeline (src/execution/orchestrator.ts) does not currently write to events.log. The `onProgress` callback in `ExecutionCallbacks` is the existing mechanism.
   - Recommendation: Add a lightweight event logger that writes JSON lines to events.log. Call it from the bootstrap orchestrator's progress callbacks and the execution orchestrator's onProgress. This is a small integration point, not a large refactor.

3. **Community super-node drill-down (2000+ node graphs)**
   - What we know: D-21 specifies community-level super-nodes for large graphs.
   - What's unclear: Exact UX for drill-down breadcrumb and back-navigation.
   - Recommendation: Implement as a graph filter: clicking a super-node filters sigma to show only that community's nodes. A breadcrumb "All > Community N" lets users navigate back. Use sigma's `nodeReducer` to show/hide nodes.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Assumed | >=22.x | -- |
| npm | Package install | Assumed | -- | -- |
| Playwright | VIZ-08 screenshot export | Yes | 1.58.2 | Skip headless screenshot, keep in-browser html2canvas export |
| Default browser | VIZ-09 open dashboard | Yes | -- | Print URL to console, user opens manually |
| Port 7463 | VIZ-01 HTTP server | Yes (unoccupied) | -- | Detect port conflict, suggest alternative |

**Missing dependencies with no fallback:**
- None

**Missing dependencies with fallback:**
- If Playwright is not installed on a user's machine, `npx codescope viz --screenshot` can print a helpful message. The in-browser html2canvas export (D-41) works regardless.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.0 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/dashboard/` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIZ-01 | Hono server starts, serves JSON API, returns correct status | integration | `npx vitest run tests/dashboard/server.test.ts -x` | Wave 0 |
| VIZ-02 | Graph API returns nodes with centrality + community data | unit | `npx vitest run tests/dashboard/api/graph.test.ts -x` | Wave 0 |
| VIZ-03 | Conventions API returns per-file compliance data | unit | `npx vitest run tests/dashboard/api/conventions.test.ts -x` | Wave 0 |
| VIZ-04 | Readiness API returns current scores + history | unit | `npx vitest run tests/dashboard/api/readiness.test.ts -x` | Wave 0 |
| VIZ-05 | Blast radius API returns concentric ring data | unit | `npx vitest run tests/dashboard/api/blast-radius.test.ts -x` | Wave 0 |
| VIZ-06 | WebSocket sends events when events.log is appended | integration | `npx vitest run tests/dashboard/websocket.test.ts -x` | Wave 0 |
| VIZ-07 | Review and impact API endpoints return structured data | unit | `npx vitest run tests/dashboard/api/review.test.ts -x` | Wave 0 |
| VIZ-08 | Screenshot CLI exits with PNG file written | manual-only | Manual: `npx codescope viz --screenshot /tmp/test.png` | -- |
| VIZ-09 | Viz skill shell body is valid markdown | unit | `npx vitest run tests/dashboard/skill.test.ts -x` | Wave 0 |

Note: Client-side panel rendering (sigma.js, SVG gauges, heatmap DOM) cannot be unit-tested with vitest (requires browser DOM + WebGL). These are verified by manual browser testing during implementation and by the screenshot export feature (VIZ-08). Server-side API routes and WebSocket behavior CAN be tested.

### Sampling Rate

- **Per task commit:** `npx vitest run tests/dashboard/ -x`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/dashboard/server.test.ts` -- Hono server integration (start, stop, route smoke)
- [ ] `tests/dashboard/api/graph.test.ts` -- Graph API route handler with test SQLite DB
- [ ] `tests/dashboard/api/conventions.test.ts` -- Conventions API route handler
- [ ] `tests/dashboard/api/readiness.test.ts` -- Readiness API route handler
- [ ] `tests/dashboard/api/blast-radius.test.ts` -- Blast radius API route handler
- [ ] `tests/dashboard/websocket.test.ts` -- WebSocket event broadcasting
- [ ] `tests/dashboard/api/review.test.ts` -- Review + impact API handlers

## Project Constraints (from CLAUDE.md)

- **Tech stack:** TypeScript, web-tree-sitter WASM, ast-grep CLI, better-sqlite3, graphology, enhanced-resolve, @modelcontextprotocol/sdk, vitest, tsdown
- **Performance:** Graph queries <100ms, plugin startup <5K tokens
- **Build:** tsdown with ESM format, `external: ["better-sqlite3"]`
- **Testing:** vitest with `tests/**/*.test.ts` pattern
- **Module isolation:** Dashboard client code must be isolated from server-side Node.js modules (per established hook/enforcement pattern)
- **Build isolation:** tsdown bundles separate entry points. Dashboard needs two new entries.
- **Error envelopes:** JSON responses should follow `{ status, data, metadata }` pattern (per existing MCP tool pattern)
- **Graceful degradation:** When bootstrap hasn't run, show helpful "Run bootstrap first" state
- **GSD workflow:** Changes must go through GSD workflow entry points

## Sources

### Primary (HIGH confidence)
- [Hono docs - Node.js getting started](https://hono.dev/docs/getting-started/nodejs) -- Hono server setup, serveStatic, port config
- [Hono docs - WebSocket helper](https://hono.dev/docs/helpers/websocket) -- upgradeWebSocket API pattern, event handlers
- [@hono/node-ws GitHub](https://github.com/honojs/middleware/tree/main/packages/node-ws) -- createNodeWebSocket, injectWebSocket pattern
- [sigma.js docs - Events](https://www.sigmajs.org/docs/advanced/events/) -- clickNode, enterNode, leaveNode, doubleClickNode event payloads
- [sigma.js docs - Renderers](https://www.sigmajs.org/docs/advanced/renderers/) -- NodeBorderProgram, EdgeArrowProgram, custom programs
- [graphology FA2 docs](https://graphology.github.io/standard-library/layout-forceatlas2.html) -- FA2Layout worker API, settings, start/stop/kill
- [graphology FA2 source helpers.js](https://github.com/graphology/graphology/blob/master/src/layout-forceatlas2/helpers.js) -- Blob URL worker creation (verified compatible with bundlers)
- npm registry: hono@4.12.9, @hono/node-server@1.19.11, @hono/node-ws@1.3.0, sigma@3.0.2, @sigma/node-border@3.0.0, graphology-layout-forceatlas2@0.10.1, html2canvas@1.4.1, open@11.0.0, playwright@1.58.2

### Secondary (MEDIUM confidence)
- [sigma.js v3 release announcement](https://www.ouestware.com/2024/03/21/sigma-js-3-0-en/) -- v3 architecture, graphology integration
- [sigma.js roadmap discussion](https://github.com/jacomyal/sigma.js/discussions/1469) -- v3 stable, v4 planned for 2025+ (renderer rewrite)

### Tertiary (LOW confidence)
- tsdown multi-config array support for separate browser/node targets -- inferred from rolldown docs, needs validation during implementation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All packages verified via npm registry with current versions. Hono, sigma.js, graphology ecosystem are mature.
- Architecture: HIGH -- Follows established project patterns (module isolation, build isolation, error envelopes). Source structure matches CONTEXT.md D-12.
- Pitfalls: HIGH -- Verified FA2 worker mechanism (Blob URL). SQLite concurrent access already solved (busy_timeout). Sigma memory management is well-documented.
- Client rendering: MEDIUM -- Cannot fully validate sigma.js + tsdown browser bundle without proof-of-concept build. FA2 Blob URL should work but needs testing.
- Screenshot export: MEDIUM -- Playwright is installed but headless dashboard rendering depends on all panels loading correctly without user interaction.

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable ecosystem, no breaking changes expected in 30 days)
