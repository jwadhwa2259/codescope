---
phase: 4
slug: orient-and-execution-engine
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-23
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
| 04-01-01 | 01 | 1 | ONBD-06 | unit | `npx vitest run tests/onboard/agent-teams.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | ORNT-02, ORNT-03, ORNT-04, ORNT-05 | unit | `npx vitest run tests/orient/clarification.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | ORNT-06, ORNT-07 | unit | `npx vitest run tests/orient/research.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | ORNT-08 | unit | `npx vitest run tests/orient/analysis.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 1 | ORNT-09, ORNT-10 | unit | `npx vitest run tests/orient/planner.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-02-02 | 02 | 1 | EXEC-10 | unit | `npx vitest run tests/orient/validation.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-03-01 | 03 | 2 | EXEC-01, EXEC-05 | unit | `npx vitest run tests/execution/orchestrator.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-03-02 | 03 | 2 | EXEC-02 | unit | `npx vitest run tests/execution/agent-spawner.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-03-03 | 03 | 2 | EXEC-03, EXEC-08 | unit | `npx vitest run tests/execution/coordination.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-03-04 | 03 | 2 | EXEC-04, EXEC-09 | unit | `npx vitest run tests/execution/teams-detector.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-03-05 | 03 | 2 | EXEC-07 | unit | `npx vitest run tests/execution/wave-scheduler.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-04-01 | 04 | 3 | ORNT-01, ORNT-11 | integration | `npx vitest run tests/orient/pipeline.test.ts -x` | ❌ W0 | ⬜ pending |
| 04-04-02 | 04 | 3 | EXEC-06 | manual-only | Review orchestrator module size and prompt construction | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/onboard/agent-teams.test.ts` — stubs for ONBD-06 (agent teams detection)
- [ ] `tests/orient/clarification.test.ts` — stubs for ORNT-02, ORNT-03, ORNT-04, ORNT-05
- [ ] `tests/orient/research.test.ts` — stubs for ORNT-06, ORNT-07
- [ ] `tests/orient/analysis.test.ts` — stubs for ORNT-08
- [ ] `tests/orient/planner.test.ts` — stubs for ORNT-09, ORNT-10
- [ ] `tests/orient/validation.test.ts` — stubs for EXEC-10
- [ ] `tests/orient/pipeline.test.ts` — stubs for ORNT-01, ORNT-11 (integration)
- [ ] `tests/execution/orchestrator.test.ts` — stubs for EXEC-01, EXEC-05
- [ ] `tests/execution/agent-spawner.test.ts` — stubs for EXEC-02
- [ ] `tests/execution/coordination.test.ts` — stubs for EXEC-03, EXEC-08
- [ ] `tests/execution/teams-detector.test.ts` — stubs for EXEC-04, EXEC-09
- [ ] `tests/execution/wave-scheduler.test.ts` — stubs for EXEC-07
- [ ] `tests/orient/types.test.ts` — shared type validation for ScopeContract, ExecutionPlan, etc.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Orchestrator token budget <15K | EXEC-06 | Requires measuring actual Claude conversation context size at runtime | Review orchestrator module source, count prompt construction tokens, verify no large inline data |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
