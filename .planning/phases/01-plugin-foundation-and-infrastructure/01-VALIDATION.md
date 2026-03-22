---
phase: 1
slug: plugin-foundation-and-infrastructure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-22
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x |
| **Config file** | vitest.config.ts (Wave 0 installs) |
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
| 01-01-01 | 01 | 1 | PLUG-01 | integration | `npx vitest run src/__tests__/plugin-manifest.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | PLUG-02 | integration | `npx vitest run src/__tests__/mcp-server.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | PLUG-03 | unit | `npx vitest run src/__tests__/filesystem.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | PLUG-04 | unit | `npx vitest run src/__tests__/token-budget.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | ONBD-01 | integration | `npx vitest run src/__tests__/onboard-skill.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | ONBD-02 | unit | `npx vitest run src/__tests__/project-detection.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | ONBD-03 | unit | `npx vitest run src/__tests__/language-detection.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-04 | 02 | 1 | ONBD-04 | unit | `npx vitest run src/__tests__/config-generation.test.ts` | ❌ W0 | ⬜ pending |
| 01-02-05 | 02 | 1 | ONBD-05 | unit | `npx vitest run src/__tests__/config-schema.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 2 | PARS-01 | unit | `npx vitest run src/__tests__/parser-init.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 2 | PARS-02 | unit | `npx vitest run src/__tests__/ast-extraction.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 2 | PARS-03 | unit | `npx vitest run src/__tests__/parser-memory.test.ts` | ❌ W0 | ⬜ pending |
| 01-03-04 | 03 | 2 | PARS-04 | unit | `npx vitest run src/__tests__/parser-errors.test.ts` | ❌ W0 | ⬜ pending |
| 01-04-01 | 04 | 2 | GRPH-01 | unit | `npx vitest run src/__tests__/graph-storage.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — test framework configuration
- [ ] `src/__tests__/` — test directory structure
- [ ] `vitest` + `@vitest/coverage-v8` — install test framework and coverage

*Greenfield project — all test infrastructure must be created from scratch.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Plugin installs via Claude Code plugin system | PLUG-01 | Requires Claude Code runtime | 1. Run `claude --plugin-dir ./` 2. Verify plugin appears in `/plugins` list |
| /codescope:onboard skill triggers | ONBD-01 | Requires Claude Code skill execution | 1. Run `claude --plugin-dir ./` 2. Type `/codescope:onboard` 3. Verify skill activates |
| WASM grammar loading in plugin context | PARS-01 | WASM loading may differ in Claude Code's Node.js sandbox | 1. Load plugin 2. Trigger parse via MCP tool 3. Verify AST returned |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
