---
phase: 6
slug: eval-user-gate-and-debug
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-24
validated: 2026-03-27
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/eval/ tests/debug/ tests/tools/eval.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~300ms |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/eval/ tests/debug/ tests/tools/eval.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | EVAL-01 | unit | `npx vitest run tests/eval/eval-agent.test.ts -t "includes all 6 context sources"` | tests/eval/eval-agent.test.ts | ✅ green |
| 06-01-02 | 01 | 1 | EVAL-02 | unit | `npx vitest run tests/eval/eval-agent.test.ts -t "per-criterion PASS/FAIL"` | tests/eval/eval-agent.test.ts | ✅ green |
| 06-01-03 | 01 | 1 | EVAL-03 | unit | `npx vitest run tests/eval/types.test.ts` | tests/eval/types.test.ts | ✅ green |
| 06-01-04 | 01 | 1 | EVAL-04 | unit | `npx vitest run tests/eval/report-appender.test.ts` | tests/eval/report-appender.test.ts | ✅ green |
| 06-02-01 | 02 | 1 | GATE-01 | unit | `npx vitest run tests/eval/gate.test.ts -t "interactive mode"` | tests/eval/gate.test.ts | ✅ green |
| 06-02-02 | 02 | 1 | GATE-02 | unit | `npx vitest run tests/eval/gate.test.ts -t "auto-debug mode"` | tests/eval/gate.test.ts | ✅ green |
| 06-02-03 | 02 | 1 | GATE-03 | unit | `npx vitest run tests/eval/gate.test.ts -t "auto-skip-minor mode"` | tests/eval/gate.test.ts | ✅ green |
| 06-02-04 | 02 | 1 | GATE-04 | unit | `npx vitest run tests/eval/ignore-filter.test.ts` | tests/eval/ignore-filter.test.ts | ✅ green |
| 06-03-01 | 03 | 2 | DBUG-01 | unit | `npx vitest run tests/debug/fix-planner.test.ts` | tests/debug/fix-planner.test.ts | ✅ green |
| 06-03-02 | 03 | 2 | DBUG-02 | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "dispatches fix agent"` | tests/debug/debug-agent.test.ts | ✅ green |
| 06-03-03 | 03 | 2 | DBUG-03 | unit | `npx vitest run tests/debug/fix-planner.test.ts -t "caps agents at 3"` | tests/debug/fix-planner.test.ts | ✅ green |
| 06-03-04 | 03 | 2 | DBUG-04 | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "dispatchVerifyAgent"` | tests/debug/debug-agent.test.ts | ✅ green |
| 06-03-05 | 03 | 2 | DBUG-05 | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "onDesignDecision callback"` | tests/debug/debug-agent.test.ts | ✅ green |
| 06-03-06 | 03 | 2 | DBUG-06 | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "stops at maxCycles"` | tests/debug/debug-agent.test.ts | ✅ green |
| 06-03-07 | 03 | 2 | DBUG-07 | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "resolution rate"` | tests/debug/debug-agent.test.ts | ✅ green |
| 06-04-01 | 04 | 3 | EVAL-01 | unit | `npx vitest run tests/tools/eval.test.ts` | tests/tools/eval.test.ts | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/eval/` directory — exists
- [x] `tests/debug/` directory — exists
- [x] `tests/eval/eval-agent.test.ts` — EVAL-01, EVAL-02 (29 tests)
- [x] `tests/eval/types.test.ts` — EVAL-03 type validation (11 tests)
- [x] `tests/eval/report-appender.test.ts` — EVAL-04 (8 tests)
- [x] `tests/eval/gate.test.ts` — GATE-01, GATE-02, GATE-03 (15 tests)
- [x] `tests/eval/ignore-filter.test.ts` — GATE-04 (9 tests)
- [x] `tests/debug/fix-planner.test.ts` — DBUG-01, DBUG-03 (12 tests)
- [x] `tests/debug/debug-agent.test.ts` — DBUG-02, DBUG-04, DBUG-05, DBUG-06, DBUG-07 (12 tests)
- [x] `tests/tools/eval.test.ts` — codescope_eval MCP tool (8 tests)
- [x] `tests/eval/run-eval.test.ts` — CLI entry point (7 tests)
- [x] `tests/debug/run-debug.test.ts` — CLI entry point (7 tests)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive triage UI presents findings grouped by criterion | GATE-01 | Requires interactive Claude Code skill body | Run orient on test task, verify skill body displays findings grouped by criterion with severity sort |
| User ignore pattern persists across runs | GATE-04 | End-to-end learnings.md persistence | Ignore a finding, re-run eval, verify finding is pre-filtered |
| Design decision escalation halts debug | DBUG-05 | Requires user interaction in skill body | Trigger a finding that changes public API, verify debug escalates instead of auto-fixing |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s (measured: ~300ms)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-03-27
