---
phase: 13
slug: pipeline-evolution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 13 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | `vitest.config.ts` |
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
| 13-01-01 | 01 | 1 | PIPE-01 | unit | `npx vitest run tests/execution/qualification.test.ts` | ❌ W0 | ⬜ pending |
| 13-01-02 | 01 | 1 | PIPE-01 | unit | `npx vitest run tests/execution/qualification.test.ts` | ❌ W0 | ⬜ pending |
| 13-02-01 | 02 | 1 | PIPE-02 | unit | `npx vitest run tests/eval/classification.test.ts` | ❌ W0 | ⬜ pending |
| 13-02-02 | 02 | 1 | PIPE-02 | unit | `npx vitest run tests/debug/classification-routing.test.ts` | ❌ W0 | ⬜ pending |
| 13-03-01 | 03 | 2 | PIPE-03 | unit | `npx vitest run tests/execution/reconciliation.test.ts` | ❌ W0 | ⬜ pending |
| 13-04-01 | 04 | 1 | PIPE-04 | unit | `npx vitest run tests/orient/token-budget.test.ts` | ❌ W0 | ⬜ pending |
| 13-04-02 | 04 | 1 | PIPE-04 | unit | `npx vitest run tests/execution/budget-warning.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/execution/qualification.test.ts` — stubs for PIPE-01 qualification gate
- [ ] `tests/eval/classification.test.ts` — stubs for PIPE-02 failure classification
- [ ] `tests/debug/classification-routing.test.ts` — stubs for PIPE-02 debug routing
- [ ] `tests/execution/reconciliation.test.ts` — stubs for PIPE-03 reconciliation report
- [ ] `tests/orient/token-budget.test.ts` — stubs for PIPE-04 token estimation
- [ ] `tests/execution/budget-warning.test.ts` — stubs for PIPE-04 orchestrator warning

*Existing vitest infrastructure covers framework needs. Only test file stubs required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Reconciliation report readability | PIPE-03 | Markdown formatting quality is subjective | Inspect generated reconciliation.md for clear sections, tables, and accurate counts |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
