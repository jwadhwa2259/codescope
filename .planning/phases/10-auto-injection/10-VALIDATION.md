---
phase: 10
slug: auto-injection
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/injection/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/injection/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | INJECT-03 | unit | `npx vitest run tests/injection/token-budget.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-02 | 01 | 1 | INJECT-03 | unit | `npx vitest run tests/injection/priority-queue.test.ts` | ❌ W0 | ⬜ pending |
| 10-01-03 | 01 | 1 | INJECT-04 | unit | `npx vitest run tests/injection/trigger-rules.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-01 | 02 | 1 | INJECT-01 | integration | `npx vitest run tests/injection/pre-tool-hook.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-02 | 02 | 1 | INJECT-02 | integration | `npx vitest run tests/injection/post-tool-hook.test.ts` | ❌ W0 | ⬜ pending |
| 10-02-03 | 02 | 1 | INJECT-05 | unit | `npx vitest run tests/injection/graceful-degradation.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-01 | 03 | 2 | INJECT-01 | integration | `npx vitest run tests/injection/artifact-generation.test.ts` | ❌ W0 | ⬜ pending |
| 10-03-02 | 03 | 2 | INJECT-04 | integration | `npx vitest run tests/injection/end-to-end.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/injection/token-budget.test.ts` — stubs for INJECT-03 token budget logic
- [ ] `tests/injection/priority-queue.test.ts` — stubs for INJECT-03 priority allocation
- [ ] `tests/injection/trigger-rules.test.ts` — stubs for INJECT-04 trigger threshold logic
- [ ] `tests/injection/pre-tool-hook.test.ts` — stubs for INJECT-01 PreToolUse hook
- [ ] `tests/injection/post-tool-hook.test.ts` — stubs for INJECT-02 PostToolUse hook
- [ ] `tests/injection/graceful-degradation.test.ts` — stubs for INJECT-05 no-op behavior
- [ ] `tests/injection/artifact-generation.test.ts` — stubs for artifact pipeline
- [ ] `tests/injection/end-to-end.test.ts` — stubs for full injection flow

*Existing infrastructure covers framework setup — vitest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Claude sees injected context in reasoning | INJECT-01 | Requires Claude Code runtime with hooks enabled | 1. Bootstrap a test project 2. Edit a high-centrality file 3. Check Claude's reasoning shows convention/danger zone warnings |
| PostToolUse warnings visible in reasoning | INJECT-02 | Requires Claude Code runtime with hooks enabled | 1. Edit a file with known conventions 2. Check Claude's post-edit reasoning shows blast radius/convention reminders |
| User sees no injection noise on low-centrality files | INJECT-04 | Requires Claude Code runtime observation | 1. Edit a leaf file with no conventions 2. Verify no injection content appears in reasoning |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
