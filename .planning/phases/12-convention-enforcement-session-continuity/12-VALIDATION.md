---
phase: 12
slug: convention-enforcement-session-continuity
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-28
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/enforcement/ tests/session/ tests/hooks/pre-compact.test.ts tests/hooks/session-start.test.ts --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/enforcement/ tests/session/ tests/hooks/pre-compact.test.ts tests/hooks/session-start.test.ts --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 1 | ENFORCE-01 | unit | `npx vitest run tests/enforcement/pre-commit-check.test.ts -t "runs sg scan"` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 1 | ENFORCE-02 | unit | `npx vitest run tests/enforcement/rule-generator.test.ts -t "filters VERIFIED"` | ❌ W0 | ⬜ pending |
| 12-01-03 | 01 | 1 | ENFORCE-03 | unit | `npx vitest run tests/enforcement/pre-commit-check.test.ts -t "severity"` | ❌ W0 | ⬜ pending |
| 12-01-04 | 01 | 1 | ENFORCE-04 | unit + integration | `npx vitest run tests/enforcement/install-hooks.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 1 | SESS-01 | unit | `npx vitest run tests/session/handoff-generator.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 1 | SESS-02 | unit | `npx vitest run tests/session/handoff-parser.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-03 | 02 | 1 | SESS-03 | unit | `npx vitest run tests/orient/resume.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-04 | 02 | 1 | SESS-04 | unit | `npx vitest run tests/hooks/pre-compact.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/enforcement/pre-commit-check.test.ts` — stubs for ENFORCE-01, ENFORCE-02, ENFORCE-03
- [ ] `tests/enforcement/install-hooks.test.ts` — stubs for ENFORCE-04
- [ ] `tests/enforcement/rule-generator.test.ts` — stubs for ENFORCE-02 (VERIFIED filtering)
- [ ] `tests/enforcement/uninstall-hooks.test.ts` — stubs for D-03
- [ ] `tests/session/handoff-generator.test.ts` — stubs for SESS-01, SESS-04
- [ ] `tests/session/handoff-parser.test.ts` — stubs for SESS-02
- [ ] `tests/session/session-cleanup.test.ts` — stubs for D-14
- [ ] `tests/hooks/pre-compact.test.ts` — stubs for SESS-04
- [ ] `tests/hooks/session-start.test.ts` — stubs for D-18
- [ ] `tests/orient/resume.test.ts` — stubs for SESS-03

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pre-commit hook chains with existing hooks | ENFORCE-04 | Requires real git repo with existing hooks | Create temp repo with existing pre-commit hook, run `npx codescope install-hooks`, verify both hooks execute on commit |
| Husky integration | ENFORCE-04 / D-02 | Requires husky framework installed | Create temp repo with `.husky/` dir, verify CodeScope integrates into husky chain |
| `/codescope:pause` skill output | SESS-01 | Requires Claude Code runtime | Invoke skill in Claude Code session, verify handoff document created |
| `/codescope:resume` re-entry | SESS-02 | Requires Claude Code runtime with prior session | Pause a session, restart Claude Code, invoke resume, verify correct position |
| PreCompact auto-trigger | SESS-04 | Requires Claude Code compaction event | Run long session until compaction, verify handoff auto-generated |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
