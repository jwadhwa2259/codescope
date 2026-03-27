---
phase: 8
slug: tech-debt-cleanup
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-27
validated: 2026-03-27
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
| 08-01-01 | 01 | 1 | VRFY-08, EVAL-01, EVAL-03 | unit | `npx vitest run tests/verify/report-writer.test.ts tests/eval/run-eval.test.ts` | yes | green |
| 08-01-02 | 01 | 1 | EXEC-07, ORNT-10 | unit | `npx vitest run tests/execution/wave-scheduler.test.ts tests/orient/validation.test.ts` | yes | green |
| 08-01-03 | 01 | 1 | MCP-01 | unit | `npx vitest run tests/tools/mcp-tool-registration.test.ts` | yes | green |
| 08-01-04 | 01 | 1 | LRNG-05 | unit | `npx vitest run tests/agents/learning-synthesizer.test.ts` | yes | green |
| 08-01-05 | 01 | 1 | LRNG-08 | unit | `npx vitest run tests/learning/run-learning-capture.test.ts` | yes | green |
| 08-01-06 | 01 | 1 | — | manual | `grep -c "\- \[x\]" .planning/ROADMAP.md` returns 7; `grep "\- \[ \]" .planning/ROADMAP.md` matches Phase 8 | yes | green |

*Status: pending · green · red · flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. 865 tests across 80 files pass. No new test framework setup needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Status |
|----------|-------------|------------|-------------------|--------|
| ROADMAP.md progress table accuracy | — | Human-readable formatting check | Read ROADMAP.md progress table, verify all phases show correct plan counts and statuses | green — 7 `[x]` entries (phases 1-7), Phase 8 marked `[ ]` in progress |

---

## Implementation Acceptance Criteria — Spot-Check Results

| Criterion | Command | Result |
|-----------|---------|--------|
| JSON sidecar written by report-writer.ts | `grep "jsonSidecarPath" src/verify/report-writer.ts` | matches line 60 |
| wave-scheduler imports types from orient/types.ts | `grep "import type.*AgentAssignment" src/execution/wave-scheduler.ts` | matches line 6 |
| wave-scheduler has no local interface copies | `grep "export interface AgentAssignment" src/execution/wave-scheduler.ts` | no matches |
| validation.ts has no `as unknown` casts | `grep "as unknown" src/orient/validation.ts` | no matches |
| server.ts JSDoc lists 12 MCP tools | `grep "12 MCP tools" src/server.ts` | matches line 8 |
| server.ts includes codescope_eval | `grep "codescope_eval" src/server.ts` | matches line 15 |
| tools/index.ts says "All 11 real tools" | `grep "All 11 real tools" src/tools/index.ts` | matches line 42 |
| learning-synthesizer.ts has no dead totalActive | `grep "const totalActive" src/agents/learning-synthesizer.ts` | no matches |
| run-learning-capture.ts has evalReportPath field | `grep "evalReportPath: string" src/learning/run-learning-capture.ts` | matches line 30 |
| run-learning-capture.ts has verifyReportPath field | `grep "verifyReportPath: string" src/learning/run-learning-capture.ts` | matches line 31 |
| MCP test asserts exactly 12 tools | `grep "toBe(12)" tests/tools/mcp-tool-registration.test.ts` | matches line 25 |
| Full suite green | `npx vitest run` | 865 passed, 0 failed, 80 files |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** complete — 865 tests pass, 0 failures, all 6 tasks green, all 12 implementation criteria confirmed.

---

## Notes

- Task 08-01-04 file path corrected from `tests/learning/learning-synthesizer.test.ts` to `tests/agents/learning-synthesizer.test.ts` — the test exists at the agents path and covers the dead variable removal behavior (12 tests, all green).
- Task 08-01-06 (ROADMAP.md accuracy) is confirmed via grep: 7 phases show `[x]` (phases 1-7), Phase 8 shows `[ ]`. No purely manual step needed.
- Full suite count increased from 848 (pre-phase baseline) to 865 (post-phase), confirming new tests were added without regressions.
