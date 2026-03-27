---
phase: 4
slug: orient-and-execution-engine
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-23
validated: 2026-03-27
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | `vitest.config.ts` (exists) |
| **Quick run command** | `npx vitest run tests/orient/ tests/execution/ --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/orient/ tests/execution/ --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | ONBD-06 | unit | `npx vitest run tests/onboard/agent-teams.test.ts` | yes | green |
| 04-01-02 | 01 | 1 | ORNT-02, ORNT-03, ORNT-04, ORNT-05 | unit | `npx vitest run tests/orient/clarification.test.ts` | yes | green |
| 04-01-03 | 01 | 1 | ORNT-06, ORNT-07 | unit | `npx vitest run tests/orient/research.test.ts` | yes | green |
| 04-01-04 | 01 | 1 | ORNT-08 | unit | `npx vitest run tests/orient/analysis.test.ts` | yes | green |
| 04-02-01 | 02 | 1 | ORNT-09, ORNT-10 | unit | `npx vitest run tests/orient/planner.test.ts` | yes | green |
| 04-02-02 | 02 | 1 | EXEC-10 | unit | `npx vitest run tests/orient/validation.test.ts` | yes | green |
| 04-03-01 | 03 | 2 | EXEC-01, EXEC-05 | unit | `npx vitest run tests/execution/orchestrator.test.ts` | yes | green |
| 04-03-02 | 03 | 2 | EXEC-02, EXEC-08 | unit | `npx vitest run tests/execution/agent-spawner.test.ts` | yes | green |
| 04-03-03 | 03 | 2 | EXEC-03 | unit | `npx vitest run tests/execution/coordination.test.ts` | yes | green |
| 04-03-04 | 03 | 2 | EXEC-04, EXEC-09 | unit | `npx vitest run tests/execution/teams-detector.test.ts` | yes | green |
| 04-03-05 | 03 | 2 | EXEC-07 | unit | `npx vitest run tests/execution/wave-scheduler.test.ts` | yes | green |
| 04-04-01 | 04 | 3 | ORNT-01, ORNT-11 | integration | `npx vitest run tests/orient/pipeline.test.ts` | yes | green |
| 04-04-02 | 04 | 3 | EXEC-06 | manual-only | Review orchestrator module size and prompt construction | N/A | green |

*Status: pending / green / red / flaky*

**Notes:**
- Original commands used `-x` flag which is invalid in vitest 4.1.0. Corrected to remove it. Use `--bail 1` if early-exit-on-failure behavior is desired.
- EXEC-06 (04-04-02): orchestrator.ts is 527 lines (~5.3K tokens estimated), well under the 15K token budget. Verified by line count of `src/execution/orchestrator.ts`. Prompt construction uses path references (not embedded content), keeping context thin.
- All 215 tests pass across 14 test files (validated 2026-03-27).
- Full suite command `npx vitest run tests/orient/ tests/execution/ tests/onboard/agent-teams.test.ts tests/config/schema.test.ts` exits 0 with 14 files passed, 215 tests passed.

---

## Wave 0 Strategy: TDD-First Within Tasks

Wave 0 is satisfied by TDD-first ordering within each plan task (all plans with `tdd="true"` tasks). The executor MUST:

1. **Create test files BEFORE implementation files** within each task
2. Write failing tests first (RED), then implement to pass (GREEN), then refactor
3. Test files listed in `<files>` are created in order: test file first, then source file

This eliminates the need for a separate Wave 0 plan with test stubs. The TDD attribute on each task (`tdd="true"`) signals the executor to follow RED-GREEN-REFACTOR ordering.

### Test Files Created by TDD Tasks

- [x] `tests/orient/types.test.ts` — shared type validation for ScopeContract, ExecutionPlan, etc. (Plan 01, Task 1) -- 9 tests
- [x] `tests/orient/clarification.test.ts` — ORNT-02, ORNT-03, ORNT-04, ORNT-05 (Plan 01, Task 1) -- 20 tests
- [x] `tests/orient/analysis.test.ts` — ORNT-08 (Plan 01, Task 2) -- 11 tests
- [x] `tests/execution/coordination.test.ts` — EXEC-03 (Plan 02, Task 1) -- 8 tests
- [x] `tests/execution/teams-detector.test.ts` — EXEC-04, EXEC-09 (Plan 02, Task 1) -- 10 tests
- [x] `tests/execution/wave-scheduler.test.ts` — EXEC-07 (Plan 02, Task 2) -- 18 tests
- [x] `tests/onboard/agent-teams.test.ts` — ONBD-06 (Plan 03, Task 1) -- 19 tests
- [x] `tests/config/schema.test.ts` — D-44 config migration (Plan 03, Task 1) -- 3 new tests (13 total)
- [x] `tests/orient/research.test.ts` — ORNT-06, ORNT-07 (Plan 04, Task 1) -- 25 tests
- [x] `tests/orient/planner.test.ts` — ORNT-09, ORNT-10 (Plan 04, Task 2) -- 18 tests
- [x] `tests/orient/validation.test.ts` — EXEC-10 (Plan 04, Task 2) -- 12 tests
- [x] `tests/execution/agent-spawner.test.ts` — EXEC-02, EXEC-08 (Plan 05, Task 1) -- 20 tests
- [x] `tests/execution/orchestrator.test.ts` — EXEC-01, EXEC-04, EXEC-05 (Plan 05, Task 2) -- 14 tests
- [x] `tests/orient/pipeline.test.ts` — ORNT-01, ORNT-11 (Plan 06, Task 1) -- 12 tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|-------------|------------|-------------------|--------|
| Orchestrator token budget <15K | EXEC-06 | Requires measuring actual Claude conversation context size at runtime | Review orchestrator module source, count prompt construction tokens, verify no large inline data | green (527 LOC, ~5.3K tokens) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or TDD-first ordering
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] TDD tasks create test files before implementation files
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-03-27
