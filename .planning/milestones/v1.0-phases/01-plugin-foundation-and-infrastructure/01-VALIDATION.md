---
phase: 1
slug: plugin-foundation-and-infrastructure
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-22
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | vitest.config.ts (created in Plan 01 Task 1) |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run --coverage` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run --coverage`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | PLUG-01, PLUG-03, PLUG-04 | integration | `npx vitest run tests/plugin/manifest.test.ts` | TDD (created in task) | ⬜ pending |
| 01-01-02 | 01 | 1 | PLUG-03 | unit | `npx vitest run tests/onboard/filesystem.test.ts` | TDD (created in task) | ⬜ pending |
| 01-02-01 | 02 | 2 | ONBD-02, ONBD-03, ONBD-04 | unit | `npx vitest run tests/config/schema.test.ts tests/config/loader.test.ts` | TDD (created in task) | ⬜ pending |
| 01-02-02 | 02 | 2 | PLUG-02 | unit | `npx vitest run tests/tools/status.test.ts` | TDD (created in task) | ⬜ pending |
| 01-03-01 | 03 | 2 | PARS-01, PARS-02, PARS-04 | unit | `npx vitest run tests/parser/lifecycle.test.ts tests/parser/extract.test.ts` | TDD (created in task) | ⬜ pending |
| 01-03-02 | 03 | 2 | PARS-03 | unit | `npx vitest run tests/resolver/typescript.test.ts tests/resolver/python.test.ts` | TDD (created in task) | ⬜ pending |
| 01-04-01 | 04 | 2 | GRPH-01 | unit | `npx vitest run tests/graph/schema.test.ts` | TDD (created in task) | ⬜ pending |
| 01-04-02 | 04 | 2 | GRPH-01 | unit | `npx vitest run tests/graph/batch-writer.test.ts` | TDD (created in task) | ⬜ pending |
| 01-05-01 | 05 | 3 | ONBD-01, ONBD-05 | unit | `npx vitest run tests/onboard/detect.test.ts tests/onboard/global-memory.test.ts` | TDD (created in task) | ⬜ pending |
| 01-05-02 | 05 | 3 | ONBD-01 | unit | `npx vitest run tests/skills/onboard.test.ts` | TDD (created in task) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

All test infrastructure (vitest.config.ts, test directories) is created by Plan 01 Task 1. All test files are created inline by their TDD tasks (each task writes tests before production code). No separate Wave 0 setup is needed.

- [x] `vitest.config.ts` — created by Plan 01 Task 1 (includes `tests/**/*.test.ts` glob)
- [x] `tests/` — test directory structure created by each plan's TDD tasks
- [x] `vitest` — installed as devDependency by Plan 01 Task 1

*Greenfield project — test infrastructure bootstrapped in Plan 01 Task 1.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Plugin installs via Claude Code plugin system | PLUG-01 | Requires Claude Code runtime | 1. Run `claude --plugin-dir ./` 2. Verify plugin appears in `/plugins` list |
| /codescope:onboard skill triggers | ONBD-01 | Requires Claude Code skill execution | 1. Run `claude --plugin-dir ./` 2. Type `/codescope:onboard` 3. Verify skill activates |
| WASM grammar loading in plugin context | PARS-01 | WASM loading may differ in Claude Code's Node.js sandbox | 1. Load plugin 2. Trigger parse via MCP tool 3. Verify AST returned |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or TDD-created tests
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covered by Plan 01 Task 1 (vitest.config.ts + dependencies)
- [x] No watch-mode flags
- [x] Feedback latency < 15s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
