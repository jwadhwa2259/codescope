# Phase 14: Visualization Dashboard - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 14-visualization-dashboard
**Areas discussed:** Frontend bundling & serving, Graph layout & performance, Panel layout & navigation, WebSocket & command center

---

## Frontend Bundling & Serving

| Option | Description | Selected |
|--------|-------------|----------|
| Hono HTTP server | Lightweight (~14KB), JSON API routing, static file serving, per VIZ-01 requirement | ✓ |
| node:http server | Raw Node.js HTTP, no routing framework, mentioned in v2 scoping memory | |
| Express | Heavy, full-featured, overkill for local dashboard | |

**User's choice:** Hono (recommended, aligns with VIZ-01 requirement)
**Notes:** Resolved conflict between REQUIREMENTS.md (Hono) and v2 scoping memory (node:http) in favor of requirements. Single bundled JS + inlined CSS approach for frontend.

---

## Graph Layout & Performance

| Option | Description | Selected |
|--------|-------------|----------|
| FA2 Web Worker + pre-computed initial positions | ForceAtlas2 in Web Worker for live layout, server pre-computes circular positions by community | ✓ |
| Pre-computed only (no live layout) | Server computes all positions, static graph on client | |
| D3-force layout | D3.js force simulation instead of sigma.js FA2 | |

**User's choice:** FA2 Web Worker with pre-computed initial positions (recommended)
**Notes:** Scale handling: <500 full graph, 500-2000 with barnesHutOptimize, 2000+ community clustering. STATE.md POC concern addressed -- standard sigma.js pattern with tsdown browser target.

---

## Panel Layout & Navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Left sidebar with full-width panels | VS Code/Grafana pattern, icon sidebar, one panel at a time | ✓ |
| Tab bar across top | Browser-like tabs, each panel as a tab | |
| Grid layout (all panels visible) | 2x2 grid showing all panels simultaneously | |

**User's choice:** Left sidebar navigation (recommended)
**Notes:** 5 panels (Graph, Heatmap, Trends, Blast, Command). Keyboard shortcuts 1-5. Default panel: Dependency Graph (hero visualization). Minimum viewport 1024px.

---

## WebSocket & Command Center

| Option | Description | Selected |
|--------|-------------|----------|
| Event log file tailing + WebSocket broadcast | Pipeline appends to events.log, dashboard tails and broadcasts. Decoupled. | ✓ |
| Direct import of execution event emitter | Dashboard imports orchestrator events directly. Tight coupling. | |
| Polling API (no WebSocket) | Dashboard polls /api/status every N seconds. Simpler but not real-time. | |

**User's choice:** Event log file tailing (recommended, decoupled architecture)
**Notes:** Command center actions: Review File, Predict Impact, Refresh Graph, Export Screenshot. Results in slide-out drawer. Auto-reconnect with exponential backoff.

---

## Design System

| Option | Description | Selected |
|--------|-------------|----------|
| Dark OLED + Fira Code/Sans + code green accent | Professional dev tool aesthetic, high contrast, monitoring style | ✓ |
| Cyberpunk neon (matrix green, magenta, cyan) | Flashy but limited accessibility, "hacker" aesthetic | |
| Light theme with dark toggle | More accessible but less developer-native | |

**User's choice:** Dark OLED theme (recommended by UI/UX Pro Max design system analysis)
**Notes:** User emphasized dashboard must "standout and actually be useful" as a plugin. Professional marketing-ready screenshots a priority.

---

## Claude's Discretion

- Hono route middleware structure
- Community color palette selection
- Graph search implementation
- SVG gauge rendering details
- Event log rotation strategy
- tsdown browser bundle config
- Drawer animation details

## Deferred Ideas

None -- discussion stayed within phase scope
