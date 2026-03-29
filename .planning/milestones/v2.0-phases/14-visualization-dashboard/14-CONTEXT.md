# Phase 14: Visualization Dashboard - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can explore their codebase intelligence through an interactive local dashboard -- dependency graph, convention heatmap, readiness trends, blast radius explorer, and a command center that triggers reviews and impact predictions from the UI. Includes real-time WebSocket updates during bootstrap/orient execution and screenshot export for marketing.

Requirements: VIZ-01, VIZ-02, VIZ-03, VIZ-04, VIZ-05, VIZ-06, VIZ-07, VIZ-08, VIZ-09

</domain>

<decisions>
## Implementation Decisions

### Design System
- **D-01:** Dark OLED-optimized theme. Background: `#0F172A`, secondary bg: `#1E293B`, card bg: `#334155`, text: `#F8FAFC`, muted text: `#94A3B8`, accent/CTA: `#22C55E` (code green), danger: `#EF4444`, warning: `#F59E0B`. CSS custom properties for all colors.
- **D-02:** Typography: Fira Code (monospace -- data values, file paths, code) + Fira Sans (sans-serif -- labels, headings, UI text). Loaded from Google Fonts with `font-display: swap`.
- **D-03:** Icons: Lucide SVG icons. Consistent 20x20 sizing in sidebar, 16x16 inline. No emojis as icons.
- **D-04:** Effects: Pulse animation for live connection indicator (2s infinite), 200-300ms transitions on hover/focus, minimal glow (`text-shadow: 0 0 8px`) on accent elements only. Respect `prefers-reduced-motion`.
- **D-05:** Status colors: green `#22C55E` (healthy/passing), yellow `#F59E0B` (warning/partial), red `#EF4444` (danger/failing), blue `#3B82F6` (info/active). Used consistently across all panels.

### HTTP Server & API (VIZ-01)
- **D-06:** Hono HTTP server on port 7463 (VIZ-01). Lightweight (~14KB), built-in JSON API routing, static file serving. Separate process from the MCP StdioServerTransport server.
- **D-07:** JSON API endpoints served by Hono: `/api/graph` (nodes, edges, communities, centralities), `/api/conventions` (per-file compliance), `/api/readiness` (current scores + history), `/api/blast-radius/:file` (concentric ring data), `/api/status` (bootstrap state, node/edge counts).
- **D-08:** Dashboard server opens its own `better-sqlite3` connection to `graph.db` with `busy_timeout(5000)` (Phase 9 D-09 enables this). Read-only queries -- dashboard never writes to the database.
- **D-09:** `/codescope:viz` skill launches the Hono server process and opens the browser to `http://localhost:7463` (VIZ-09).

### Frontend Architecture
- **D-10:** Single HTML entry point (`index.html`) + one bundled JS file (`dashboard.js`) + inlined CSS in `<style>` tag. No framework (vanilla JS + DOM APIs). sigma.js and chart libraries bundled by tsdown.
- **D-11:** tsdown builds client code with `platform: 'browser'` target into `dist/dashboard.js`. Hono server serves `index.html` with `<script src="/dashboard.js">` tag. CSS inlined in the HTML template.
- **D-12:** Source structure:
  ```
  src/dashboard/
    server.ts          -- Hono HTTP + WebSocket server, JSON API routes
    api/               -- Route handlers (graph.ts, conventions.ts, readiness.ts, blast-radius.ts, status.ts)
    client/
      index.html       -- Dashboard shell (dark theme, panel containers, inlined CSS)
      app.ts           -- Main entry (panel routing, WebSocket client, keyboard shortcuts)
      panels/          -- One module per panel (graph.ts, heatmap.ts, trends.ts, blast-radius.ts, command.ts)
      components/      -- Shared UI (sidebar.ts, status-bar.ts, modal.ts, drawer.ts)
  ```

### Panel Layout & Navigation
- **D-13:** Left sidebar navigation (56px wide) with icon + tooltip labels. Full-width panel area to the right. Developer-familiar pattern (VS Code, Grafana). Sidebar icons vertically stacked.
- **D-14:** Five panels accessible from sidebar:
  1. **Graph** (default) -- Dependency graph (sigma.js) -- hero visualization
  2. **Heatmap** -- Convention compliance grid (per-file, colored green/yellow/red)
  3. **Trends** -- Readiness dashboard (4 SVG gauges + historical trend line chart)
  4. **Blast** -- Blast radius explorer (concentric rings from selected file)
  5. **Command** -- Command center (trigger review, impact prediction, refresh)
- **D-15:** Keyboard shortcuts: `1`-`5` to switch panels. Active panel shown with green accent bar on left edge of sidebar icon.
- **D-16:** Compact header bar: CodeScope wordmark (left), project name (center), connection status dot + last update timestamp (right).
- **D-17:** Bottom status bar: node count, edge count, community count, bootstrap date, readiness grade.
- **D-18:** Minimum supported viewport: 1024px width (developer tool, not mobile). Sidebar collapses to icons-only at <1200px.

### Dependency Graph Panel (VIZ-02)
- **D-19:** sigma.js v3 WebGL renderer. Nodes sized by in-degree centrality (min 4px, max 24px). Nodes colored by Louvain community (categorical palette from design system). Danger zone nodes have red glow border (`#EF4444` ring).
- **D-20:** ForceAtlas2 layout via `graphology-layout-forceatlas2/worker` (Web Worker -- non-blocking UI). Server pre-computes initial circular positions grouped by community so the graph is readable on first render; FA2 refines from there.
- **D-21:** Scale handling: <500 nodes full graph + live FA2. 500-2000 nodes with `barnesHutOptimize: true` for O(n log n). 2000+ nodes show community-level super-nodes (sized by member count, click to drill into subgraph).
- **D-22:** Interactions: zoom (scroll), pan (drag background), click node to show detail panel (file path, centrality, community, imports/importers), hover to highlight connected edges. Search bar to find nodes by name.

### Convention Heatmap Panel (VIZ-03)
- **D-23:** Grid layout of file blocks (treemap-style, sized by LOC or flat grid). Each block colored by convention compliance: green (`#22C55E`, >80% compliance), yellow (`#F59E0B`, 50-80%), red (`#EF4444`, <50%). Click block to reveal specific convention details in a slide-out drawer.
- **D-24:** Grouping: files organized by directory (collapsible groups). Top-level shows directory summaries, expand to see individual files. Sort by: worst compliance first (default), alphabetical, or by directory.
- **D-25:** Hover shows tooltip: file path, compliance %, violation count. Accessible: numerical values always shown alongside color (not color-only indicators).

### Readiness Trends Panel (VIZ-04)
- **D-26:** Four SVG gauge charts (semicircular arc) for current readiness dimensions: Convention Coverage, Type Safety, Test Coverage Proxy, Import Graph Health. Each gauge shows current percentage + letter grade (A-F). Color follows the green/yellow/red status color scheme.
- **D-27:** Below gauges: historical trend line chart drawn from `readiness_history` table. X-axis = timestamps, Y-axis = overall percent. Multiple series for each dimension, togglable via legend. Data from `codescope_trends` API.
- **D-28:** Chart library: Custom SVG rendering (no external chart library) -- gauges and line charts are simple enough. Canvas fallback for performance if >100 data points on the trend line.

### Blast Radius Explorer Panel (VIZ-05)
- **D-29:** Concentric ring visualization. Selected file at center. Rings represent hop distance (1, 2, 3, 4). Nodes on each ring sized by centrality, colored by risk level (Red/Orange/Yellow/Green per `RiskLevel` type). Edges drawn as curved lines between rings.
- **D-30:** File selection: type-ahead search bar or click-to-select from Graph panel (cross-panel linking). Selecting a file in the Graph panel and switching to Blast panel auto-loads that file's blast radius.
- **D-31:** Detail on hover/click: file path, hop distance, risk level, in-degree, community. Forward blast radius (dependents) is default view; toggle to show reverse blast radius (dependencies).

### WebSocket Real-Time Updates (VIZ-06)
- **D-32:** WebSocket endpoint at `ws://localhost:7463/ws`. Events: `bootstrap:progress` (stage, percentage), `orient:phase` (phase name), `agent:spawn`/`agent:complete` (agent name, wave, status), `graph:updated` (triggers data refresh), `readiness:snapshot` (new scores available).
- **D-33:** Event source: execution pipeline appends JSON lines to `.claude/codescope/events.log`. Dashboard server tails this file with `fs.watch` and broadcasts via WebSocket. Decoupled architecture -- pipeline doesn't import dashboard code.
- **D-34:** Connection handling: auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s). Connection status indicator in header bar. On reconnect, dashboard fetches fresh data from API to catch up on missed events.
- **D-35:** Real-time overlay: when bootstrap/orient is running, show a non-blocking progress banner at the top of the current panel with stage name and progress bar. Dismissable.

### Command Center Panel (VIZ-07)
- **D-36:** Action cards in a grid: "Review File" (select file, runs review analysis), "Predict Impact" (select file, shows blast radius), "Refresh Graph" (triggers incremental reparse), "Export Screenshot" (captures current panel as PNG).
- **D-37:** File selection for review/impact: type-ahead search with autocomplete from graph node list. Results displayed in a slide-out right drawer (480px wide) over the current panel, dismissable.
- **D-38:** Review results display: structured sections matching `/codescope:review` output -- risk summary, per-file risk table, dependency changes, convention violations. Scrollable drawer with section anchors.
- **D-39:** Impact prediction overlay: when triggered, switches to Graph panel and highlights the blast radius nodes with pulsing rings. Shows affected node count and max risk level in a floating badge.

### Screenshot Export (VIZ-08)
- **D-40:** `npx codescope viz --screenshot output.png` launches headless dashboard, waits for data load + layout settle, captures viewport via Playwright (dev dependency), saves PNG. Exits automatically.
- **D-41:** In-browser export: "Export Screenshot" command center action uses `html2canvas` to capture the current panel as PNG, triggers browser download.

### Claude's Discretion
- Exact Hono route middleware structure (CORS, error handling, request logging)
- Community color palette selection (categorical colors for up to 20 communities)
- Graph search implementation (fuzzy match library vs simple substring)
- SVG gauge rendering details (arc math, animation easing)
- Event log rotation strategy (file size cap, cleanup frequency)
- tsdown config specifics for browser bundle (externals, splitting, minification)
- Whether to use `node:fs.watch` or `chokidar` for event file tailing
- Exact drawer animation (slide-in direction, timing function)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Graph Infrastructure (data source)
- `src/graph/database.ts` -- `openDatabase()` with WAL mode, busy_timeout(5000) for concurrent dashboard access
- `src/graph/analytics.ts` -- `CentralityResult`, `CommunityResult`, `DangerZoneEntry`, `BlastRadiusNode` types, `loadGraphFromDatabase()`, `computeCentrality()`, `detectCommunities()`, `computeBlastRadius()`, `detectDangerZones()`
- `src/graph/schema.ts` -- SQLite schema (nodes, edges, communities tables)
- `src/graph/readiness-history.ts` -- `ReadinessSnapshot` type, `storeReadinessSnapshot()`, readiness_history table
- `src/graph/cache.ts` -- Staleness-aware graph cache with async rebuild

### Existing MCP Tools (command center data sources)
- `src/tools/review.ts` -- `codescope_review` tool implementation (review analysis engine)
- `src/tools/impact-prediction.ts` -- `codescope_predict_impact` tool implementation (reverse blast radius)
- `src/tools/blast-radius.ts` -- Forward blast radius computation
- `src/tools/trends-tool.ts` -- `codescope_trends` tool (period comparisons, deltas, trend direction)
- `src/tools/readiness-tool.ts` -- Current readiness scores
- `src/tools/conventions.ts` -- `parseConventions()`, convention data access
- `src/tools/status.ts` -- Bootstrap state, node/edge counts

### Artifact Pipeline (pre-computed indexes)
- `src/artifacts/generator.ts` -- Artifact generation pipeline (runs post-bootstrap)
- `src/artifacts/convention-index.ts` -- Per-file convention compliance O(1) lookup
- `src/artifacts/danger-zone-index.ts` -- Danger zone index
- `src/artifacts/blast-radius-index.ts` -- Per-file blast radius snapshots

### Build System
- `package.json` -- Current dependencies, tsdown build config
- `tsdown.config.ts` -- Build entry points (will need dashboard-client and dashboard-server entries added)

### Execution Pipeline (WebSocket event source)
- `src/execution/orchestrator.ts` -- `runExecution()`, wave dispatch, agent spawn/complete events
- `src/execution/coordination.ts` -- Coordination log (append-only entries)
- `src/bootstrap/orchestrator.ts` -- Bootstrap pipeline stages

### Requirements
- `.planning/REQUIREMENTS.md` -- VIZ-01 through VIZ-09 acceptance criteria

### Design System
- UI/UX Pro Max design system output: Dark OLED theme, Fira Code/Fira Sans, Real-Time Monitoring style, Lucide icons

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/graph/analytics.ts`: Full graph analytics (centrality, communities, blast radius, danger zones) -- dashboard API routes call these directly
- `src/graph/database.ts`: `openDatabase()` with concurrent access support -- dashboard server opens its own read-only connection
- `src/tools/*.ts`: All MCP tool implementations can be refactored to export core logic functions that both MCP handlers and dashboard API routes call
- `src/artifacts/*.ts`: Pre-computed indexes for conventions, danger zones, blast radius -- fast data source for heatmap and graph overlays
- `src/graph/readiness-history.ts`: `ReadinessSnapshot` type and SQLite queries for trend data

### Established Patterns
- **Module isolation**: Hooks/enforcement modules duplicate types rather than importing from heavy modules (Phase 10, 12 pattern). Dashboard client code must similarly be isolated from server-side modules.
- **Build isolation**: tsdown bundles separate entry points. Dashboard needs two new entries: `dashboard-server.ts` (Hono) and `dashboard-client.ts` (browser bundle).
- **Error envelopes**: MCP tools use `okResponse()`/`errorResponse()` pattern. Dashboard API should follow similar structured JSON responses.
- **Graceful degradation**: When bootstrap hasn't run, MCP tools return helpful error messages. Dashboard API should do the same -- show "Run bootstrap first" state.

### Integration Points
- Dashboard server is a NEW process (separate from MCP server). Launched by `/codescope:viz` skill.
- Database access via `openDatabase()` with existing `busy_timeout` support.
- Event pipeline via append-only log file -- no direct import of execution modules.
- Skill registration in `.claude-plugin/` manifest for `/codescope:viz`.
- tsdown.config.ts needs new entry points for dashboard server and client bundles.

</code_context>

<specifics>
## Specific Ideas

- Dashboard should look professional enough for marketing screenshots (VIZ-08) -- clean, polished dark theme
- Interactive command center is the differentiator -- not just read-only observatory, users can trigger actions from the UI
- Port 7463 chosen as C-O-D-E on phone keypad
- sigma.js v3 + graphology ecosystem already used in the codebase (graphology is a dependency) -- natural fit for graph visualization
- ~3000 LOC budget for the full dashboard implementation

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 14-visualization-dashboard*
*Context gathered: 2026-03-28*
