---
phase: 9
slug: graph-foundation-debt-tracking
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --reporter=verbose` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --reporter=verbose`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | GRAPH-01 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GRAPH-02 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GRAPH-03 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | GRAPH-04 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEBT-01 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DEBT-02 | integration | `npx vitest run` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Test stubs for GRAPH-01 through GRAPH-04, DEBT-01, DEBT-02
- [ ] Shared fixtures for database setup/teardown

*Planner will populate with specific test files.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Concurrent DB access (MCP + dashboard) | GRAPH-04 | Requires two separate processes | Start MCP server + second sqlite client, run simultaneous queries |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
