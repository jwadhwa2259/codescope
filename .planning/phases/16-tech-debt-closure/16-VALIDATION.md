---
phase: 16
slug: tech-debt-closure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose` + `npx tsc --noEmit`
- **After every plan wave:** Run `npx vitest run` + `npm run build` + server start smoke test
- **Before `/gsd:verify-work`:** Full suite must be green, tsc clean, server starts
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | DEBT-02 | smoke | `npm run build && node dist/server.mjs` (start + kill after 2s) | No -- Wave 0 | ⬜ pending |
| 16-01-02 | 01 | 1 | DEBT-02 | lint | `npx tsc --noEmit` | N/A (built-in) | ⬜ pending |
| 16-02-01 | 02 | 1 | REVIEW-01,02,03 | lint | `npx tsc --noEmit` | N/A (built-in) | ⬜ pending |
| 16-03-01 | 03 | 1 | REVIEW-04 | unit | `npx vitest run tests/enforcement/install-hooks.test.ts` | Needs new case | ⬜ pending |
| 16-04-01 | 04 | 2 | IMPACT-01,02 | manual | Grep SUMMARY files for `requirements_completed` | N/A | ⬜ pending |
| 16-05-01 | 05 | 2 | DIST-03,04 | smoke | `test -f platform-packages/darwin-arm64/better_sqlite3.node` | No -- Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Add idempotency test to `tests/enforcement/install-hooks.test.ts` -- covers fork bomb scenario (run install twice, verify backup is not the CodeScope wrapper)
- [ ] Add MCP server startup smoke test (build + `node dist/server.mjs` + check for errors in first 2 seconds)

*Existing vitest infrastructure covers remaining phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SUMMARY frontmatter has `requirements_completed` | IMPACT-01, IMPACT-02, REVIEW-04 | Documentation-only change, grep verification sufficient | `grep -r "requirements_completed" .planning/phases/{09,11,15}-*/*-SUMMARY.md` |
| Cross-platform binaries (linux-x64, win32-x64, darwin-x64) | DIST-03, DIST-04 | Requires CI or multi-platform access | Verify platform-packages directories contain `.node` binaries per platform |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
