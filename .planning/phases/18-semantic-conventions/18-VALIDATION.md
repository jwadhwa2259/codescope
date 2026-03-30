---
phase: 18
slug: semantic-conventions
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-30
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
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
| 18-01-01 | 01 | 1 | D-24 | unit | `npx vitest run tests/conventions/rule-metadata.test.ts -x` | Wave 0 | pending |
| 18-01-02 | 01 | 1 | CONV-07 | unit | `npx vitest run tests/classifier/file-role.test.ts -x` | Wave 0 | pending |
| 18-02-01 | 02 | 2 | CONV-06 | unit | `npx vitest run tests/conventions/framework-rules.test.ts -x` | Wave 0 | pending |
| 18-02-02 | 02 | 2 | CONV-05 | unit | `npx vitest run tests/onboard/detect-frameworks.test.ts -x` | Wave 0 | pending |
| 18-03-01 | 03 | 2 | CONV-03, CONV-04 | unit | `npx vitest run tests/conventions/golden-files.test.ts -x` | Exists -- needs new test cases | pending |
| 18-04-01 | 04 | 3 | CONV-05, CONV-07 | integration | `npx vitest run tests/conventions/runner.test.ts -x` | Exists -- needs file-role filter verification | pending |
| 18-04-02 | 04 | 3 | D-28 | unit | `npx vitest run tests/conventions/rule-validation.test.ts -x` | Wave 0 | pending |
| 18-04-03 | 04 | 3 | D-25 | unit | `npx vitest run tests/bootstrap/readiness.test.ts -x` | Exists -- needs new test case | pending |
| 18-04-04 | 04 | 3 | D-26 | unit | `npx vitest run tests/hooks/session-start-budget.test.ts -x` | Wave 0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `tests/conventions/rule-metadata.test.ts` -- covers D-24 (shared module)
- [ ] `tests/classifier/file-role.test.ts` -- covers CONV-07
- [ ] `tests/onboard/detect-frameworks.test.ts` -- covers CONV-05
- [ ] `tests/conventions/framework-rules.test.ts` -- covers CONV-06
- [ ] `tests/conventions/rule-validation.test.ts` -- covers D-28 (no duplicate ruleIds)
- [ ] `tests/hooks/session-start-budget.test.ts` -- covers D-26 (500-token budget)
- [ ] Test fixtures: Fastify-like project fixture with package.json containing `"fastify": "^5.0.0"`, h3 project with `"h3": "^1.0.0"`, Express project with `"express": "^4.0.0"`

*Wave 0 creates test stubs and fixtures before feature implementation begins.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bootstrap on real Fastify detects framework conventions | CONV-06 | Requires cloned external repo | Clone Fastify, run bootstrap, check conventions.json for fastify-plugin-signature |
| Bootstrap on real h3 detects framework conventions | CONV-06 | Requires cloned external repo | Clone h3, run bootstrap, check conventions.json for h3-event-handler |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
