---
phase: 14
slug: visualization-dashboard
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
---

# Phase 14 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose tests/dashboard/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose tests/dashboard/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 14-00-01 | 00 | 0 | VIZ-01,VIZ-06 | scaffold | `npx vitest run tests/dashboard/` | W0 creates | pending |
| 14-01-01 | 01 | 1 | VIZ-01 | config | `node -e "require('./package.json')"` (dep check) | N/A | pending |
| 14-01-02 | 01 | 1 | VIZ-01 | integration | `npx vitest run tests/dashboard/server.test.ts tests/dashboard/api.test.ts` | W0 | pending |
| 14-01-03 | 01 | 1 | VIZ-01 | unit | grep-based (HTML/CSS, no vitest target) | N/A | pending |
| 14-02-01 | 02 | 2 | VIZ-02 | unit | grep-based (WebGL sigma.js -- not vitest-testable) | N/A | pending |
| 14-02-02 | 02 | 2 | VIZ-02 | unit | grep-based (WebGL sigma.js -- not vitest-testable) | N/A | pending |
| 14-03-01 | 03 | 3 | VIZ-03,VIZ-04 | unit | grep-based (DOM panel rendering -- not vitest-testable) | N/A | pending |
| 14-03-02 | 03 | 3 | VIZ-05,VIZ-07 | unit | grep-based (DOM panel rendering -- not vitest-testable) | N/A | pending |
| 14-03-03 | 03 | 3 | VIZ-03-07 | wiring | grep-based (app.ts imports -- not vitest-testable) | N/A | pending |
| 14-04-01 | 04 | 4 | VIZ-08,VIZ-09 | integration | grep-based (playwright/skill -- runtime deps) | N/A | pending |
| 14-04-02 | 04 | 4 | VIZ-06 | integration | grep-based (event pipeline -- modifies existing files) | N/A | pending |
| 14-04-03 | 04 | 4 | VIZ-01-09 | manual | `npm run build` (checkpoint:human-verify) | N/A | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `tests/dashboard/server.test.ts` -- Hono server startup, static file serving, API route smoke tests (created by Plan 14-00)
- [x] `tests/dashboard/api.test.ts` -- JSON API endpoint response structure for graph, conventions, readiness, blast-radius, status (created by Plan 14-00)
- [x] `tests/dashboard/websocket.test.ts` -- WebSocket connection, event broadcasting, reconnection (created by Plan 14-00)

**Note on client-side panels:** Graph panel (sigma.js WebGL), heatmap, trends, blast-radius, and command panels are DOM/WebGL rendering code. Per RESEARCH.md, sigma.js requires a real browser WebGL context and cannot be tested in vitest's jsdom environment. These tasks use grep-based verification of exports, API calls, and key patterns instead. This is acceptable per Nyquist rules for browser-only rendering code.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screenshot export produces valid PNG | VIZ-08 | Requires headless browser (Playwright) -- visual output verification | Run `npx codescope viz --screenshot test.png`, verify file exists and is >10KB PNG |
| sigma.js graph renders visually correct | VIZ-02 | WebGL rendering requires real browser context | Open dashboard, verify nodes visible, zoom/pan works, click shows detail |
| Dashboard dark theme looks correct | VIZ-02/03/04 | Visual design verification | Open dashboard, compare against UI-SPEC color values |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (server, API, WebSocket stubs)
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved (Wave 0 plan 14-00 creates test stubs; Plan 14-01 Task 2 runs vitest)
