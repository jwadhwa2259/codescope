---
phase: 16
slug: tech-debt-closure
status: draft
nyquist_compliant: true
wave_0_complete: true
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
| 16-01-01 | 01 | 1 | DEBT-02, IMPACT-01, IMPACT-02, DIST-03 | smoke | `grep -c "dist/server.mjs" .mcp.json package.json src/cli/setup/plugin-wiring.ts` + `npm run build && node dist/server.mjs` (start + kill after 2s) | N/A | ⬜ pending |
| 16-01-02 | 01 | 1 | REVIEW-04 | unit | `npx vitest run tests/enforcement/install-hooks.test.ts` | Needs new case | ⬜ pending |
| 16-02-01 | 02 | 1 | REVIEW-01, REVIEW-02, REVIEW-03 | lint | `npx tsc --noEmit` (expected max 8 errors after Task 1) | N/A (built-in) | ⬜ pending |
| 16-02-02 | 02 | 1 | REVIEW-01, REVIEW-02, REVIEW-03, IMPACT-02 | lint | `npx tsc --noEmit` (must exit 0 — zero errors) | N/A (built-in) | ⬜ pending |
| 16-03-01 | 03 | 2 | DIST-04 | smoke | `test -f platform-packages/darwin-arm64/better_sqlite3.node && npx tsc --noEmit && npm run build && test -f dist/server.mjs` | No — Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

**Requirement coverage mapping:**
- REVIEW-01, REVIEW-02, REVIEW-03: Covered by 16-02-01 and 16-02-02 (TypeScript error fixes make tsc pass)
- REVIEW-04: Covered by 16-01-02 (fork bomb fix + regression test for install-hooks)
- IMPACT-01, IMPACT-02: Covered by 16-01-01 (MCP path fix unblocks codescope_predict_impact and reverse BFS tools)
- DEBT-02: Covered by 16-01-01 (MCP server path fix — server can start)
- DIST-03: Covered by 16-01-01 (plugin-wiring.ts generates correct .mcp.json for auto-setup)
- DIST-04: Covered by 16-03-01 (platform binary build + smoke test)

---

## Wave 0 Requirements

- [x] Idempotency test in `tests/enforcement/install-hooks.test.ts` — covered by 16-01-02 task action
- [x] MCP server startup smoke test — covered by 16-03-01 task action (build + `node dist/server.mjs` + check for errors)

*Existing vitest infrastructure covers remaining phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-platform binaries (linux-x64, win32-x64, darwin-x64) | DIST-04 | Requires CI or multi-platform access | Verify platform-packages directories contain `.node` binaries per platform |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
