---
phase: 7
slug: learning-system-and-settings
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
validated: 2026-03-27
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | vitest.config.ts (root) |
| **Quick run command** | `npx vitest run tests/learning/ tests/agents/learning-synthesizer.test.ts tests/onboard/global-memory.test.ts tests/skills/settings.test.ts tests/skills/review-learnings.test.ts tests/skills/orient-step7.test.ts --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~4 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/learning/ tests/agents/learning-synthesizer.test.ts tests/onboard/global-memory.test.ts tests/skills/ --reporter=dot`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 4 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | LRNG-02 | unit | `npx vitest run tests/learning/parser.test.ts -x` | yes | green |
| 07-01-02 | 01 | 1 | LRNG-03 | unit | `npx vitest run tests/learning/decay.test.ts -x` | yes | green |
| 07-01-03 | 01 | 1 | LRNG-04 | unit | `npx vitest run tests/learning/contradiction.test.ts -x` | yes | green |
| 07-01-04 | 01 | 1 | LRNG-05 | unit | `npx vitest run tests/learning/cap.test.ts -x` | yes | green |
| 07-01-05 | 01 | 1 | LRNG-06 | unit | `npx vitest run tests/learning/manager.test.ts -x` | yes | green |
| 07-01-06 | 01 | 2 | LRNG-04 | unit | `npx vitest run tests/learning/contradiction.test.ts -x` | yes | green |
| 07-01-07 | 01 | 2 | LRNG-08 | unit | `npx vitest run tests/learning/global-enrichment.test.ts -x` | yes | green |
| 07-02-01 | 02 | 1 | LRNG-01 | unit | `npx vitest run tests/agents/learning-synthesizer.test.ts -x` | yes | green |
| 07-02-02 | 02 | 1 | LRNG-07 | unit | `npx vitest run tests/onboard/global-memory.test.ts -x` | yes | green |
| 07-02-03 | 02 | 2 | LRNG-08 | unit | `npx vitest run tests/learning/run-learning-capture.test.ts -x` | yes | green |
| 07-03-01 | 03 | 1 | MGMT-01 | unit | `npx vitest run tests/skills/settings.test.ts -x` | yes | green |
| 07-03-02 | 03 | 2 | MGMT-02 | unit | `npx vitest run tests/skills/review-learnings.test.ts -x` | yes | green |
| 07-03-03 | 03 | 1 | MGMT-03 | unit | `npx vitest run tests/skills/settings.test.ts -x` | yes | green |
| 07-04-01 | 04 | 1 | MGMT-02 | unit | `npx vitest run tests/skills/review-learnings.test.ts -x` | yes | green |
| 07-04-02 | 04 | 2 | LRNG-02, LRNG-06 | unit | `npx vitest run tests/skills/orient-step7.test.ts -x` | yes | green |

*Status: pending -- green -- red -- flaky*

---

## Wave 0 Requirements

All Wave 0 test files were created during plan execution. No stubs remain.

- [x] `tests/learning/parser.test.ts` -- 8 tests for LRNG-02 (entry parsing/serialization, roundtrip)
- [x] `tests/learning/decay.test.ts` -- 11 tests for LRNG-03 (expiry calculation, decay engine)
- [x] `tests/learning/contradiction.test.ts` -- 6 tests for LRNG-04 (heuristic + LLM contradiction detection)
- [x] `tests/learning/cap.test.ts` -- 6 tests for LRNG-05 (50-entry cap with eviction)
- [x] `tests/learning/manager.test.ts` -- 6 tests for LRNG-06 (high-level manager, no auto-promotion)
- [x] `tests/learning/global-enrichment.test.ts` -- 6 tests for LRNG-08 (3-strike auto-enrichment)
- [x] `tests/learning/run-learning-capture.test.ts` -- 5 tests for CLI entry point
- [x] `tests/agents/learning-synthesizer.test.ts` -- 12 tests for LRNG-01 (LLM extraction + backward compat)
- [x] `tests/onboard/global-memory.test.ts` -- 16 tests for LRNG-07 (global memory with new sections)
- [x] `tests/skills/settings.test.ts` -- 24 assertions for MGMT-01, MGMT-03 (reset, --set, validation)
- [x] `tests/skills/review-learnings.test.ts` -- 10 assertions for MGMT-02 (batch review UX)
- [x] `tests/skills/orient-step7.test.ts` -- 10 assertions for orient Step 7 integration

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive review-learnings UX | MGMT-02 | AskUserQuestion menus require interactive session | Run `/codescope:review-learnings` with 3+ unreviewed learnings, verify grouping and confirm/reject/edit flow |
| Interactive settings menus | MGMT-01 | AskUserQuestion menus require interactive session | Run `/codescope:settings`, navigate sections, change a value, verify Zod validation feedback |

---

## Requirements Coverage

| Requirement | Description | Test Files | Status |
|-------------|-------------|------------|--------|
| LRNG-01 | Pipeline learning capture | `tests/agents/learning-synthesizer.test.ts`, `tests/learning/run-learning-capture.test.ts` | green |
| LRNG-02 | UNVERIFIED default, review required | `tests/agents/learning-synthesizer.test.ts` (D-04), `tests/learning/parser.test.ts`, `tests/skills/review-learnings.test.ts` | green |
| LRNG-03 | Confidence decay (90d gotchas, 180d decisions) | `tests/learning/decay.test.ts` (11 tests) | green |
| LRNG-04 | Contradiction detection | `tests/learning/contradiction.test.ts` (6 tests) | green |
| LRNG-05 | 50-learning cap with eviction | `tests/learning/cap.test.ts` (6 tests), `tests/learning/manager.test.ts` | green |
| LRNG-06 | No auto-promotion to conventions | `tests/learning/manager.test.ts`, `tests/skills/review-learnings.test.ts` | green |
| LRNG-07 | Global memory with new sections | `tests/onboard/global-memory.test.ts` (16 tests) | green |
| LRNG-08 | Auto-enrichment from eval gate (3-strike) | `tests/learning/global-enrichment.test.ts` (6 tests) | green |
| MGMT-01 | Settings skill (interactive + --set) | `tests/skills/settings.test.ts` (24 assertions) | green |
| MGMT-02 | Review-learnings skill (confirm/reject/edit) | `tests/skills/review-learnings.test.ts` (10 assertions) | green |
| MGMT-03 | Reset commands (--reset, --reset-global) | `tests/skills/settings.test.ts` | green |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s (actual: ~4s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-03-27
**Test count:** 124 Phase 7 tests across 12 test files, 850 total suite tests
**Full suite:** 850/850 passing, 0 regressions
