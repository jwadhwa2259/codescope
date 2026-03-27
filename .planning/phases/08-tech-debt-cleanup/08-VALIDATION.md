---
phase: 8
slug: tech-debt-cleanup
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
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
| 08-01-01 | 01 | 1 | VRFY-08, EVAL-01, EVAL-03 | unit | `npx vitest run tests/verify/report-writer.test.ts tests/eval/run-eval.test.ts` | ✅ | ⬜ pending |
| 08-01-02 | 01 | 1 | EXEC-07, ORNT-10 | unit | `npx vitest run tests/execution/wave-scheduler.test.ts` | ✅ | ⬜ pending |
| 08-01-03 | 01 | 1 | MCP-01 | unit | `npx vitest run tests/tools/mcp-tool-registration.test.ts` | ✅ | ⬜ pending |
| 08-01-04 | 01 | 1 | LRNG-05 | unit | `npx vitest run tests/learning/learning-synthesizer.test.ts` | ✅ | ⬜ pending |
| 08-01-05 | 01 | 1 | LRNG-08 | unit | `npx vitest run tests/learning/run-learning-capture.test.ts` | ✅ | ⬜ pending |
| 08-01-06 | 01 | 1 | — | manual | verify ROADMAP.md table accuracy | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. 848+ tests across 80+ files already pass. No new test framework setup needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| ROADMAP.md progress table accuracy | — | Human-readable formatting check | Read ROADMAP.md progress table, verify all phases show correct plan counts and statuses |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
