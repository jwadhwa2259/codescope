---
phase: 14
slug: visualization-dashboard
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 14 — Validation Strategy

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
| 14-01-01 | 01 | 1 | VIZ-01 | integration | `npx vitest run tests/dashboard/server.test.ts` | ❌ W0 | ⬜ pending |
| 14-01-02 | 01 | 1 | VIZ-01 | unit | `npx vitest run tests/dashboard/api.test.ts` | ❌ W0 | ⬜ pending |
| 14-02-01 | 02 | 2 | VIZ-02 | unit | `npx vitest run tests/dashboard/graph-panel.test.ts` | ❌ W0 | ⬜ pending |
| 14-02-02 | 02 | 2 | VIZ-03 | unit | `npx vitest run tests/dashboard/heatmap-panel.test.ts` | ❌ W0 | ⬜ pending |
| 14-02-03 | 02 | 2 | VIZ-04 | unit | `npx vitest run tests/dashboard/trends-panel.test.ts` | ❌ W0 | ⬜ pending |
| 14-02-04 | 02 | 2 | VIZ-05 | unit | `npx vitest run tests/dashboard/blast-panel.test.ts` | ❌ W0 | ⬜ pending |
| 14-03-01 | 03 | 3 | VIZ-06 | integration | `npx vitest run tests/dashboard/websocket.test.ts` | ❌ W0 | ⬜ pending |
| 14-03-02 | 03 | 3 | VIZ-07 | integration | `npx vitest run tests/dashboard/command-center.test.ts` | ❌ W0 | ⬜ pending |
| 14-03-03 | 03 | 3 | VIZ-08 | manual | N/A (screenshot export) | N/A | ⬜ pending |
| 14-03-04 | 03 | 3 | VIZ-09 | integration | `npx vitest run tests/dashboard/skill.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/dashboard/server.test.ts` — Hono server startup, static file serving, API route smoke tests
- [ ] `tests/dashboard/api.test.ts` — JSON API endpoint response structure for graph, conventions, readiness, blast-radius, status
- [ ] `tests/dashboard/graph-panel.test.ts` — Graph data transformation, node sizing, community coloring logic
- [ ] `tests/dashboard/heatmap-panel.test.ts` — Convention compliance grid data, color thresholds
- [ ] `tests/dashboard/trends-panel.test.ts` — Gauge calculation, trend data formatting
- [ ] `tests/dashboard/blast-panel.test.ts` — Concentric ring data, hop distance calculation
- [ ] `tests/dashboard/websocket.test.ts` — WebSocket connection, event broadcasting, reconnection
- [ ] `tests/dashboard/command-center.test.ts` — Action card triggers, review/impact result display
- [ ] `tests/dashboard/skill.test.ts` — /codescope:viz skill launches server process

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Screenshot export produces valid PNG | VIZ-08 | Requires headless browser (Playwright) — visual output verification | Run `npx codescope viz --screenshot test.png`, verify file exists and is >10KB PNG |
| sigma.js graph renders visually correct | VIZ-02 | WebGL rendering requires real browser context | Open dashboard, verify nodes visible, zoom/pan works, click shows detail |
| Dashboard dark theme looks correct | VIZ-02/03/04 | Visual design verification | Open dashboard, compare against UI-SPEC color values |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
