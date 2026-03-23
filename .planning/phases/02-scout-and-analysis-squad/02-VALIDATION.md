---
phase: 02
slug: scout-and-analysis-squad
status: draft
nyquist_compliant: false
wave_0_complete: false
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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 1 | BOOT-01 | unit | `npx vitest run src/scouts/__tests__/` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 1 | BOOT-02 | unit | `npx vitest run src/scouts/__tests__/` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 1 | BOOT-03 | unit | `npx vitest run src/conventions/__tests__/` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 1 | BOOT-04 | unit | `npx vitest run src/conventions/__tests__/` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 1 | BOOT-05 | unit | `npx vitest run src/conventions/__tests__/` | ❌ W0 | ⬜ pending |
| 02-03-01 | 03 | 2 | GRPH-02 | unit | `npx vitest run src/graph/__tests__/` | ❌ W0 | ⬜ pending |
| 02-03-02 | 03 | 2 | GRPH-03 | unit | `npx vitest run src/graph/__tests__/` | ❌ W0 | ⬜ pending |
| 02-03-03 | 03 | 2 | GRPH-04 | unit | `npx vitest run src/graph/__tests__/` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/scouts/__tests__/scout.test.ts` — stubs for BOOT-01, BOOT-02
- [ ] `src/conventions/__tests__/runner.test.ts` — stubs for BOOT-03, BOOT-04, BOOT-05
- [ ] `src/graph/__tests__/analytics.test.ts` — stubs for GRPH-02, GRPH-03, GRPH-04
- [ ] `src/graph/__tests__/blast-radius.test.ts` — stubs for GRPH-04 BFS traversal

*Existing vitest infrastructure from Phase 1 covers framework setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Scout completes <30s on real codebase | BOOT-01 | Requires real codebase | Run scout on a ~50K LOC repo, time execution |
| Convention false positive rate <5% | BOOT-05 | Requires human review of pattern matches | Review conventions.md output, spot-check 20 matches |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
