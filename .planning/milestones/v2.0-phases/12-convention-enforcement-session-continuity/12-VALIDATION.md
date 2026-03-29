---
phase: 12
slug: convention-enforcement-session-continuity
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-28
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Tests are created inline within tasks (tdd="true" pattern), not in a preceding Wave 0 plan.

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

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | TDD Inline | Status |
|---------|------|------|-------------|-----------|-------------------|------------|--------|
| 12-01-01 | 01 | 1 | ENFORCE-01, ENFORCE-02 | unit | `npx vitest run tests/enforcement/rule-filter.test.ts --reporter=verbose` | yes | ⬜ pending |
| 12-01-02 | 01 | 1 | ENFORCE-01, ENFORCE-03 | unit | `npx vitest run tests/enforcement/pre-commit-check.test.ts --reporter=verbose` | yes | ⬜ pending |
| 12-02-01 | 02 | 1 | SESS-01 | unit | `npx vitest run tests/session/handoff-generator.test.ts --reporter=verbose` | yes | ⬜ pending |
| 12-02-02 | 02 | 1 | SESS-02 | unit | `npx vitest run tests/session/handoff-parser.test.ts tests/session/session-cleanup.test.ts --reporter=verbose` | yes | ⬜ pending |
| 12-03-01 | 03 | 2 | ENFORCE-04 | unit | `npx vitest run tests/enforcement/install-hooks.test.ts --reporter=verbose` | yes | ⬜ pending |
| 12-03-02 | 03 | 2 | ENFORCE-04, D-03 | unit | `npx vitest run tests/enforcement/uninstall-hooks.test.ts --reporter=verbose` | yes | ⬜ pending |
| 12-04-01 | 04 | 2 | SESS-04 | unit | `npx vitest run tests/hooks/pre-compact.test.ts --reporter=verbose` | yes | ⬜ pending |
| 12-04-02 | 04 | 2 | SESS-03, D-18 | unit + build | `npx vitest run tests/hooks/session-start.test.ts --reporter=verbose && npx tsdown && test -f dist/hooks/pre-compact.mjs && test -f dist/session/handoff-generator.mjs` | yes | ⬜ pending |
| 12-05-01 | 05 | 3 | SESS-01, SESS-02 | integration | `test -f skills/pause/SKILL.md && test -f skills/resume/SKILL.md && grep -q "dist/session/handoff-generator" skills/pause/SKILL.md` | no (skills) | ⬜ pending |
| 12-05-02 | 05 | 3 | SESS-03 | unit | `npx vitest run tests/orient/resume.test.ts --reporter=verbose` | yes | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## TDD Inline Pattern

Tests are created within each task's execution (tasks have `tdd="true"` attribute). The RED-GREEN-REFACTOR cycle runs within each task:
1. Task creates test file with failing tests (RED)
2. Task implements production code to pass tests (GREEN)
3. Task refactors if needed (REFACTOR)

No separate Wave 0 plan is needed because every code-producing task creates its own tests inline.

---

## File Ownership (Conflict Prevention)

| File | Sole Owner Plan | Notes |
|------|-----------------|-------|
| tsdown.config.ts | Plan 04 | Plan 04 adds ALL new entry points (hooks, enforcement, session). Plan 03 does NOT modify this file. |
| hooks/hooks.json | Plan 04 | Plan 04 adds PreCompact and SessionStart hook registrations. |
| .claude-plugin/plugin.json | Plan 05 | Plan 05 adds pause/resume skill entries. |
| src/enforcement/*.ts | Plans 01, 03 | Plan 01: types, rule-filter, pre-commit-check. Plan 03: install-hooks, uninstall-hooks. No overlap. |
| src/session/*.ts | Plan 02 | All session modules created exclusively by Plan 02. |
| src/hooks/pre-compact.ts | Plan 04 | New hook file. |
| src/hooks/session-start.ts | Plan 04 | New hook file. |
| src/orient/run-orient.ts | Plan 05 | Only Plan 05 modifies orient for --resume flag. |

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

- [x] All tasks have `<automated>` verify commands
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] TDD inline pattern: every code-producing task creates its own tests
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] File ownership documented to prevent parallel execution conflicts
- [x] `nyquist_compliant: true` set in frontmatter
- [x] `wave_0_complete: true` set in frontmatter (TDD inline, no separate Wave 0 needed)

**Approval:** pending
