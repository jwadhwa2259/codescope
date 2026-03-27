---
phase: 5
slug: verification
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-24
validated: 2026-03-27
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.0 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/verify/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~4 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/verify/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 4 seconds

---

## Per-Task Verification Map

| Req ID | Requirement | Test Type | Automated Command | File Exists | Status |
|--------|-------------|-----------|-------------------|-------------|--------|
| VRFY-01 | Convention compliance scans modified files against enforced conventions | unit | `npx vitest run tests/verify/static-verify.test.ts --bail 1` | tests/verify/static-verify.test.ts | ✅ green |
| VRFY-02 | Blast radius diff compares plan vs git diff with hop classification | unit | `npx vitest run tests/verify/blast-radius-diff.test.ts --bail 1` | tests/verify/blast-radius-diff.test.ts | ✅ green |
| VRFY-03 | Code review sub-agent produces findings | unit | `npx vitest run tests/verify/static-verify.test.ts -t "code review" --bail 1` | tests/verify/static-verify.test.ts | ✅ green |
| VRFY-04 | Build command execution with failure detection | unit | `npx vitest run tests/verify/runtime-verify.test.ts -t "build" --bail 1` | tests/verify/runtime-verify.test.ts | ✅ green |
| VRFY-05 | Test command execution with LLM-style output parsing | unit | `npx vitest run tests/verify/runtime-verify.test.ts -t "unit tests" --bail 1` | tests/verify/runtime-verify.test.ts | ✅ green |
| VRFY-06 | E2E tool auto-detection and execution | unit | `npx vitest run tests/verify/runtime-verify.test.ts -t "E2E" --bail 1` | tests/verify/runtime-verify.test.ts | ✅ green |
| VRFY-07 | Auto-smoke endpoint detection and temp test generation | unit | `npx vitest run tests/verify/smoke-generator.test.ts --bail 1` | tests/verify/smoke-generator.test.ts | ✅ green |
| VRFY-08 | Verify report assembly with all sections and timing | unit | `npx vitest run tests/verify/report-writer.test.ts --bail 1` | tests/verify/report-writer.test.ts | ✅ green |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `tests/verify/static-verify.test.ts` — 11 tests for VRFY-01, VRFY-03 (convention compliance, code review)
- [x] `tests/verify/runtime-verify.test.ts` — 20 tests for VRFY-04, VRFY-05, VRFY-06 (build, tests, E2E)
- [x] `tests/verify/blast-radius-diff.test.ts` — 8 tests for VRFY-02 (hop classification, surprises, skips, scope drift)
- [x] `tests/verify/smoke-generator.test.ts` — 6 tests for VRFY-07 (AST endpoint detection, prompt building)
- [x] `tests/verify/report-writer.test.ts` — 15 tests for VRFY-08 (all report sections, formatting, timing)
- [x] `tests/verify/server-lifecycle.test.ts` — 7 tests for D-15/D-16 server management (start, stop, readiness)
- [x] `tests/tools/verify.test.ts` — 11 tests for upgraded MCP tool (D-28, 8 check types, graceful degradation)

**Total: 78 tests across 7 test files, all passing.**

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LLM code review quality | VRFY-03 | Sub-agent output varies per invocation | Review code review findings for relevance and accuracy |
| LLM smoke test generation | VRFY-07 | Generated tests vary per endpoint | Inspect generated smoke test code for correctness |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 15s (actual: ~4s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-03-27
