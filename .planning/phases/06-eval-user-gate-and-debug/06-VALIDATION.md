---
phase: 6
slug: eval-user-gate-and-debug
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
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
| **Estimated runtime** | ~15 seconds |

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
| 06-01-01 | 01 | 1 | EVAL-01 | unit | `npx vitest run tests/eval/eval-agent.test.ts -t "reads all context"` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | EVAL-02 | unit | `npx vitest run tests/eval/eval-agent.test.ts -t "scores criteria"` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | EVAL-03 | unit | `npx vitest run tests/eval/types.test.ts` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | EVAL-04 | unit | `npx vitest run tests/eval/report-appender.test.ts` | ❌ W0 | ⬜ pending |
| 06-02-01 | 02 | 1 | GATE-01 | unit | `npx vitest run tests/eval/eval-agent.test.ts -t "groups findings"` | ❌ W0 | ⬜ pending |
| 06-02-02 | 02 | 1 | GATE-02 | unit | `npx vitest run tests/eval/eval-agent.test.ts -t "auto-debug"` | ❌ W0 | ⬜ pending |
| 06-02-03 | 02 | 1 | GATE-03 | unit | `npx vitest run tests/eval/eval-agent.test.ts -t "auto-skip-minor"` | ❌ W0 | ⬜ pending |
| 06-02-04 | 02 | 1 | GATE-04 | unit | `npx vitest run tests/eval/ignore-filter.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-01 | 03 | 2 | DBUG-01 | unit | `npx vitest run tests/debug/fix-planner.test.ts` | ❌ W0 | ⬜ pending |
| 06-03-02 | 03 | 2 | DBUG-02 | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "tool access"` | ❌ W0 | ⬜ pending |
| 06-03-03 | 03 | 2 | DBUG-03 | unit | `npx vitest run tests/debug/fix-planner.test.ts -t "scoped agents"` | ❌ W0 | ⬜ pending |
| 06-03-04 | 03 | 2 | DBUG-04 | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "scoped re-verify"` | ❌ W0 | ⬜ pending |
| 06-03-05 | 03 | 2 | DBUG-05 | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "design decision"` | ❌ W0 | ⬜ pending |
| 06-03-06 | 03 | 2 | DBUG-06 | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "max cycles"` | ❌ W0 | ⬜ pending |
| 06-03-07 | 03 | 2 | DBUG-07 | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "resolution rate"` | ❌ W0 | ⬜ pending |
| 06-04-01 | 04 | 3 | EVAL-01 | unit | `npx vitest run tests/tools/eval.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/eval/` directory — create directory
- [ ] `tests/debug/` directory — create directory
- [ ] `tests/eval/eval-agent.test.ts` — stubs for EVAL-01, EVAL-02, GATE-01, GATE-02, GATE-03
- [ ] `tests/eval/types.test.ts` — stubs for EVAL-03 (type validation)
- [ ] `tests/eval/report-appender.test.ts` — stubs for EVAL-04
- [ ] `tests/eval/ignore-filter.test.ts` — stubs for GATE-04
- [ ] `tests/debug/fix-planner.test.ts` — stubs for DBUG-01, DBUG-03
- [ ] `tests/debug/debug-agent.test.ts` — stubs for DBUG-02, DBUG-04, DBUG-05, DBUG-06, DBUG-07
- [ ] `tests/tools/eval.test.ts` — stubs for codescope_eval MCP tool

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive triage UI presents findings grouped by criterion | GATE-01 | Requires interactive Claude Code skill body | Run orient on test task, verify skill body displays findings grouped by criterion with severity sort |
| User ignore pattern persists across runs | GATE-04 | End-to-end learnings.md persistence | Ignore a finding, re-run eval, verify finding is pre-filtered |
| Design decision escalation halts debug | DBUG-05 | Requires user interaction in skill body | Trigger a finding that changes public API, verify debug escalates instead of auto-fixing |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
