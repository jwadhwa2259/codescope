---
phase: 02
slug: scout-and-analysis-squad
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-22
---

# Phase 02 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 02-01-T1 | 01 | 1 | BOOT-07, GRPH-02 | unit | `npx vitest run tests/graph/builder.test.ts --reporter=verbose` | ⬜ pending |
| 02-01-T2 | 01 | 1 | GRPH-03, GRPH-04 | unit | `npx vitest run tests/graph/analytics.test.ts --reporter=verbose` | ⬜ pending |
| 02-02-T1 | 02 | 1 | BOOT-05, BOOT-06 | integration | `sg scan --rule src/conventions/rules/typescript/ --json tests/fixtures/sample-project/src/` | ⬜ pending |
| 02-02-T2 | 02 | 1 | BOOT-05, BOOT-06, BOOT-10 | unit | `npx vitest run tests/conventions/ --reporter=verbose` | ⬜ pending |
| 02-03-T1 | 03 | 1 | BOOT-01, BOOT-02 | unit | `npx vitest run tests/agents/scout.test.ts --reporter=verbose` | ⬜ pending |
| 02-03-T2 | 03 | 1 | BOOT-03, BOOT-04 | unit | `npx vitest run tests/agents/researcher.test.ts --reporter=verbose` | ⬜ pending |
| 02-04-T1 | 04 | 2 | BOOT-07, BOOT-08, BOOT-09 | unit | `npx vitest run tests/agents/risk-analyzer.test.ts --reporter=verbose` | ⬜ pending |
| 02-04-T2 | 04 | 2 | BOOT-09, BOOT-10 | unit | `npx vitest run tests/agents/convention-detector.test.ts tests/agents/learning-synthesizer.test.ts --reporter=verbose` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing vitest infrastructure from Phase 1 covers framework setup. All plans use inline TDD (tests created in the same task as implementation) — no separate Wave 0 stub plan required.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scout completes <30s on real codebase | BOOT-01 | Requires real codebase | Run scout on a ~50K LOC repo, time execution |
| Convention false positive rate <5% | BOOT-05 | Requires human review of pattern matches | Review conventions.md output, spot-check 20 matches |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0: inline TDD approach — no separate stubs needed
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-03-22
