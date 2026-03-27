---
phase: 7
slug: learning-system-and-settings
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-27
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.0 |
| **Config file** | vitest.config.ts (root) |
| **Quick run command** | `npx vitest run tests/learning/ tests/agents/learning-synthesizer.test.ts --reporter=dot` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/learning/ tests/agents/learning-synthesizer.test.ts tests/onboard/global-memory.test.ts tests/config/ --reporter=dot`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | LRNG-02 | unit | `npx vitest run tests/learning/parser.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | LRNG-03 | unit | `npx vitest run tests/learning/decay.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | LRNG-04 | unit | `npx vitest run tests/learning/contradiction.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 1 | LRNG-05 | unit | `npx vitest run tests/learning/cap.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-05 | 01 | 1 | LRNG-06 | unit | `npx vitest run tests/learning/manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 1 | LRNG-01 | unit | `npx vitest run tests/agents/learning-synthesizer.test.ts -x` | ✅ (expand) | ⬜ pending |
| 07-02-02 | 02 | 1 | LRNG-07 | unit | `npx vitest run tests/onboard/global-memory.test.ts -x` | ✅ (expand) | ⬜ pending |
| 07-02-03 | 02 | 1 | LRNG-08 | unit | `npx vitest run tests/learning/global-enrichment.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-03-01 | 03 | 2 | MGMT-01 | unit | `npx vitest run tests/config/settings.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-03-02 | 03 | 2 | MGMT-02 | unit | `npx vitest run tests/learning/manager.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-03-03 | 03 | 2 | MGMT-03 | unit | `npx vitest run tests/config/settings.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/learning/parser.test.ts` — stubs for LRNG-02 (entry parsing/serialization)
- [ ] `tests/learning/decay.test.ts` — stubs for LRNG-03 (expiry calculation, decay engine)
- [ ] `tests/learning/contradiction.test.ts` — stubs for LRNG-04 (code-first + semantic conflict detection)
- [ ] `tests/learning/cap.test.ts` — stubs for LRNG-05 (50-entry cap with eviction)
- [ ] `tests/learning/manager.test.ts` — stubs for LRNG-06, MGMT-02 (high-level manager, no auto-promotion)
- [ ] `tests/learning/global-enrichment.test.ts` — stubs for LRNG-08 (3-strike auto-enrichment)
- [ ] `tests/config/settings.test.ts` — stubs for MGMT-01, MGMT-03 (reset, --set, validation)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive review-learnings UX | MGMT-02 | AskUserQuestion menus require interactive session | Run `/codescope:review-learnings` with 3+ unreviewed learnings, verify grouping and confirm/reject/edit flow |
| Interactive settings menus | MGMT-01 | AskUserQuestion menus require interactive session | Run `/codescope:settings`, navigate sections, change a value, verify Zod validation feedback |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
