---
phase: 14-visualization-dashboard
plan: 02
subsystem: dashboard
tags: [sigma, graphology, forceatlas2, websocket, vanilla-js, dom]

requires:
  - phase: 14-visualization-dashboard
    plan: 01
    provides: "Hono HTTP server with 7 JSON API routes, WebSocket endpoint, HTML shell with CSS design system"
provides:
  - "Typed API client for all 7 dashboard endpoints"
  - "WebSocket client with auto-reconnect and exponential backoff"
  - "15 Lucide inline SVG icons with size helper"
  - "Format helpers (number, grade, time, percent, compliance color)"
  - "Sidebar navigation with 5 panels, keyboard shortcuts 1-5, accessibility"
  - "Status bar with live node/edge/community counts"
  - "Drawer component (480px slide-out, scrim, Escape-to-close)"
  - "Type-ahead search with debounce, keyboard navigation"
  - "Positioned tooltip with 200ms delay"
  - "Client app entry with panel routing and cross-panel file selection"
  - "sigma.js dependency graph panel with FA2 layout, node interactions, search"
affects: [14-03, 14-04, 14-05]

tech-stack:
  added: []
  patterns: ["PanelContext/PanelInstance contract for panel lifecycle", "Factory function pattern for client services (createApiClient, createWebSocketClient)", "DOM-based component pattern with render/destroy lifecycle", "sigma.js nodeReducer/edgeReducer for dynamic styling"]

key-files:
  created:
    - src/dashboard/client/app.ts
    - src/dashboard/client/lib/api-client.ts
    - src/dashboard/client/lib/ws-client.ts
    - src/dashboard/client/lib/icons.ts
    - src/dashboard/client/lib/format.ts
    - src/dashboard/client/components/sidebar.ts
    - src/dashboard/client/components/status-bar.ts
    - src/dashboard/client/components/drawer.ts
    - src/dashboard/client/components/search.ts
    - src/dashboard/client/components/tooltip.ts
    - src/dashboard/client/panels/graph.ts
  modified: []

key-decisions:
  - "PanelContext/PanelInstance contract: all panels receive api, ws, container, onSelectFile and return destroy()"
  - "WebSocket backoff schedule uses explicit array [1000, 2000, 4000, 8000, 16000, 30000] for predictable reconnection timing"
  - "Graph panel uses nodeReducer/edgeReducer pattern (not per-node attributes) for dynamic hover highlighting"
  - "Super-node drill-down for 2000+ node graphs with breadcrumb navigation back to all-communities view"

patterns-established:
  - "Client panel lifecycle: render() returns { destroy() } for cleanup on panel switch"
  - "Factory function pattern for services: createApiClient(), createWebSocketClient()"
  - "Inline SVG icons with size helper function for 20px/16px variants"

requirements-completed: [VIZ-02]

duration: 4min
completed: 2026-03-29
---

# Phase 14 Plan 02: Client Foundation & Graph Panel Summary

**Typed API/WebSocket clients, 5 shared UI components, panel routing, and sigma.js dependency graph with FA2 layout, community coloring, danger zone borders, and full node interactions**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-29T04:10:33Z
- **Completed:** 2026-03-29T04:15:00Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Complete client service layer: typed API client (7 endpoints) and WebSocket client with exponential backoff auto-reconnect
- All shared UI components: sidebar (5 panels, keyboard 1-5, aria-label, tooltips), status bar (live counts), drawer (480px, scrim, Escape), search (type-ahead, 150ms debounce, keyboard nav), tooltip (200ms delay, auto-position)
- Client app entry point with panel routing, cross-panel file selection, WebSocket event handling, and connection status indicator
- sigma.js dependency graph panel with ForceAtlas2 layout, nodes sized by centrality (4-24px), colored by 12-color community palette, danger zones with red (#EF4444) borders
- Full graph interactions: click (detail overlay), hover (highlight connected, dim others to 20%), double-click (blast radius cross-panel), search (center and zoom)
- Scale handling: 2000+ nodes render community super-nodes with drill-down breadcrumb

## Task Commits

Each task was committed atomically:

1. **Task 1: Create client library modules and all shared UI components** - `7573acd` (feat)
2. **Task 2: Create client app entry point and sigma.js Graph panel** - `7ffdcda` (feat)

## Files Created/Modified
- `src/dashboard/client/lib/api-client.ts` - Typed fetch wrapper for all 7 API endpoints with error handling
- `src/dashboard/client/lib/ws-client.ts` - WebSocket manager with 1s/2s/4s/8s/16s/30s exponential backoff reconnect
- `src/dashboard/client/lib/icons.ts` - 15 Lucide inline SVG icons with icon() size helper
- `src/dashboard/client/lib/format.ts` - formatNumber, formatGrade, formatTimeAgo, formatPercent, complianceColor helpers
- `src/dashboard/client/components/sidebar.ts` - 5-panel navigation with keyboard 1-5, aria-label, aria-current, tooltip
- `src/dashboard/client/components/status-bar.ts` - Live status bar with node/edge/community counts and bootstrap date
- `src/dashboard/client/components/drawer.ts` - 480px slide-out drawer with scrim overlay, close button, Escape key
- `src/dashboard/client/components/search.ts` - Type-ahead search with 150ms debounce, 10-result dropdown, ArrowUp/Down/Enter/Escape
- `src/dashboard/client/components/tooltip.ts` - Positioned tooltip with 200ms show delay, auto-placement (right/above/below)
- `src/dashboard/client/app.ts` - Main entry: services init, shell rendering, panel routing, cross-panel file selection, WS events
- `src/dashboard/client/panels/graph.ts` - sigma.js WebGL graph with FA2 layout, node border program, full interactions, cleanup

## Decisions Made
- PanelContext/PanelInstance contract: standardized interface for all panels -- each receives api, ws, container, onSelectFile and returns destroy()
- WebSocket backoff uses explicit array [1000, 2000, 4000, 8000, 16000, 30000] rather than computed formula for predictable timing
- Graph hover highlighting uses setSetting('nodeReducer') pattern (runtime-dynamic) rather than per-node attribute updates for better performance
- Super-node drill-down for 2000+ node graphs creates a sub-graph with circular layout and breadcrumb navigation back to overview

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all components are wired to real API data sources and WebSocket events. Placeholder panels (heatmap, trends, blast, command) are intentional stubs documented in the plan, to be replaced by Plans 03-05.

## Next Phase Readiness
- All shared UI components are available for Plans 03-05 to import
- Panel lifecycle contract (PanelContext/PanelInstance) is established for remaining panels
- API client covers all endpoints needed by heatmap (fetchConventions), trends (fetchReadiness), blast radius (fetchBlastRadius), and command center (postReview, postImpact)
- Search component's updateItems() method supports dynamic item replacement for panel-specific search

## Self-Check: PASSED

All 11 created files verified on disk. Both task commits found in git log.

---
*Phase: 14-visualization-dashboard*
*Completed: 2026-03-29*
