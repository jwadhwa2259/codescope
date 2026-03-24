---
phase: 5
slug: verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
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
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/verify/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Req ID | Requirement | Test Type | Automated Command | File Exists | Status |
|--------|-------------|-----------|-------------------|-------------|--------|
| VRFY-01 | Convention compliance scans modified files against enforced conventions | unit | `npx vitest run tests/verify/static-verify.test.ts -t "convention compliance" -x` | ❌ W0 | ⬜ pending |
| VRFY-02 | Blast radius diff compares plan vs git diff with hop classification | unit | `npx vitest run tests/verify/blast-radius-diff.test.ts -x` | ❌ W0 | ⬜ pending |
| VRFY-03 | Code review sub-agent produces findings | unit | `npx vitest run tests/verify/static-verify.test.ts -t "code review" -x` | ❌ W0 | ⬜ pending |
| VRFY-04 | Build command execution with failure detection | unit | `npx vitest run tests/verify/runtime-verify.test.ts -t "build" -x` | ❌ W0 | ⬜ pending |
| VRFY-05 | Test command execution with LLM-style output parsing | unit | `npx vitest run tests/verify/runtime-verify.test.ts -t "tests" -x` | ❌ W0 | ⬜ pending |
| VRFY-06 | E2E tool auto-detection and execution | unit | `npx vitest run tests/verify/runtime-verify.test.ts -t "e2e" -x` | ❌ W0 | ⬜ pending |
| VRFY-07 | Auto-smoke endpoint detection and temp test generation | unit | `npx vitest run tests/verify/smoke-generator.test.ts -x` | ❌ W0 | ⬜ pending |
| VRFY-08 | Verify report assembly with all sections and timing | unit | `npx vitest run tests/verify/report-writer.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/verify/static-verify.test.ts` — stubs for VRFY-01, VRFY-02, VRFY-03
- [ ] `tests/verify/runtime-verify.test.ts` — stubs for VRFY-04, VRFY-05, VRFY-06
- [ ] `tests/verify/blast-radius-diff.test.ts` — stubs for VRFY-02 detailed scenarios
- [ ] `tests/verify/smoke-generator.test.ts` — stubs for VRFY-07
- [ ] `tests/verify/report-writer.test.ts` — stubs for VRFY-08
- [ ] `tests/verify/server-lifecycle.test.ts` — stubs for D-15/D-16 server management
- [ ] `tests/tools/verify.test.ts` — existing file, needs new tests for upgraded MCP tool (D-28)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| LLM code review quality | VRFY-03 | Sub-agent output varies per invocation | Review code review findings for relevance and accuracy |
| LLM smoke test generation | VRFY-07 | Generated tests vary per endpoint | Inspect generated smoke test code for correctness |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
