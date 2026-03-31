---
phase: 18
slug: semantic-conventions
status: complete
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-30
validated: 2026-03-31
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
| 18-01-01 | 01 | 1 | D-24 | unit | `npx vitest run tests/conventions/rule-metadata.test.ts --bail 1` | yes | green |
| 18-01-02 | 01 | 1 | CONV-07 | unit | `npx vitest run tests/classifier/file-role.test.ts --bail 1` | yes | green |
| 18-02-01 | 02 | 2 | CONV-06 | unit | `npx vitest run tests/conventions/framework-rules.test.ts --bail 1` | yes | green |
| 18-02-02 | 02 | 2 | CONV-05 | unit | `npx vitest run tests/onboard/detect-frameworks.test.ts --bail 1` | yes | green |
| 18-03-01 | 03 | 2 | CONV-03, CONV-04 | unit | `npx vitest run tests/conventions/golden-files.test.ts --bail 1` | yes | green |
| 18-04-01 | 04 | 3 | CONV-05, CONV-07 | integration | `npx vitest run tests/conventions/runner.test.ts --bail 1` | yes | green |
| 18-04-02 | 04 | 3 | D-28 | unit | `npx vitest run tests/conventions/rule-validation.test.ts --bail 1` | yes | green |
| 18-04-03 | 04 | 3 | D-25 | unit | `npx vitest run tests/bootstrap/readiness.test.ts --bail 1` | yes | green |
| 18-04-04 | 04 | 3 | D-26 | unit | `npx vitest run tests/hooks/session-start-budget.test.ts --bail 1` | yes | green |

*Note: vitest v4.1.0 does not support `-x`; use `--bail 1` instead.*

---

## Wave 0 Requirements

- [x] `tests/conventions/rule-metadata.test.ts` -- covers D-24 (shared module): 5 tests, green
- [x] `tests/classifier/file-role.test.ts` -- covers CONV-07: 19 tests, green
- [x] `tests/onboard/detect-frameworks.test.ts` -- covers CONV-05: 8 tests, green
- [x] `tests/conventions/framework-rules.test.ts` -- covers CONV-06: 6 tests, green
- [x] `tests/conventions/rule-validation.test.ts` -- covers D-28 (no duplicate ruleIds): 6 tests, green
- [x] `tests/hooks/session-start-budget.test.ts` -- covers D-26 (500-token budget): 4 tests, green
- [x] Test fixtures: Fastify fixture (routes.ts with app.get/addHook/decorate), Express fixture (app.ts with app.use/app.get/errorHandler), h3 fixture (handler.ts with defineEventHandler), plain TS fixture

---

## Full Suite Results (validated 2026-03-31)

| Scope | Tests | Result |
|-------|-------|--------|
| Phase 18 targeted (7 files) | 68 passed | green |
| Phase 18 + runner + readiness (9 files) | 99 passed | green |
| Full suite | 1370 passed, 7 failing, 3 skipped | pre-existing failures in dashboard/api.test.ts (3) and plugin/manifest.test.ts (4) — unrelated to Phase 18 |

Pre-existing failures are tracked from Phase 16 and do not affect Phase 18 requirements.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bootstrap on real Fastify detects framework conventions | CONV-06 | Requires cloned external repo | Clone Fastify, run bootstrap, check conventions.json for fastify-plugin-signature |
| Bootstrap on real h3 detects framework conventions | CONV-06 | Requires cloned external repo | Clone h3, run bootstrap, check conventions.json for h3-event-handler |

---

## Requirement Coverage Summary

| Requirement | Description | Test File | Tests | Status |
|-------------|-------------|-----------|-------|--------|
| CONV-03 | Noise files excluded from golden file ranking | tests/conventions/golden-files.test.ts | 6 noise filtering tests | green |
| CONV-04 | Per-language density in golden file ranking | tests/conventions/golden-files.test.ts | 3 per-language density tests | green |
| CONV-05 | Framework detection from package.json | tests/onboard/detect-frameworks.test.ts | 8 tests | green |
| CONV-06 | Framework-specific ast-grep rules scan conditionally | tests/conventions/framework-rules.test.ts | 6 tests | green |
| CONV-07 | File-role filtering prevents false-positive matches | tests/classifier/file-role.test.ts, tests/conventions/runner.test.ts | 19 + 3 tests | green |
| D-24 | RULE_METADATA defined once, imported everywhere | tests/conventions/rule-metadata.test.ts | 5 tests | green |
| D-25 | highConfidenceConventions capped at totalSourceFiles | tests/bootstrap/readiness.test.ts | 1 cap test | green |
| D-26 | 500-token hook injection budget with 12+ conventions | tests/hooks/session-start-budget.test.ts | 4 tests | green |
| D-28 | No duplicate ruleIds across all .yml files | tests/conventions/rule-validation.test.ts | 6 CI-style tests | green |

---

## Validation Sign-Off

- [x] All tasks have automated verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** green — all 9 task verification commands pass, 68 targeted tests green, requirements CONV-03 through CONV-07 and D-24/D-25/D-26/D-28 all covered
