---
phase: 15
slug: distribution
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-29
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.0 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/cli/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/cli/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 0 | DIST-01 | integration | `npx vitest run tests/cli/init.test.ts -x` | ❌ W0 | ⬜ pending |
| 15-01-02 | 01 | 0 | DIST-02 | unit | `npx vitest run tests/cli/commands.test.ts -x` | ❌ W0 | ⬜ pending |
| 15-01-03 | 01 | 0 | DIST-03 | unit | `npx vitest run tests/cli/plugin-wiring.test.ts -x` | ❌ W0 | ⬜ pending |
| 15-01-04 | 01 | 0 | DIST-04 | unit | `npx vitest run tests/cli/packaging.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/cli/init.test.ts` — stubs for DIST-01 (init flow end-to-end with mocked bootstrap)
- [ ] `tests/cli/commands.test.ts` — stubs for DIST-02 (subcommand parsing, help text, error handling)
- [ ] `tests/cli/plugin-wiring.test.ts` — stubs for DIST-03 (plugin manifest generation, skip-if-exists)
- [ ] `tests/cli/packaging.test.ts` — stubs for DIST-04 (package.json structure validation, files array, bin entry)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cross-platform npm install | DIST-04 | Requires macOS ARM, macOS Intel, Linux x64, Windows x64 environments | Install package on each platform, verify better-sqlite3 loads correctly |
| `npx codescope init` first-run UX | DIST-01 | Visual output quality (spinners, colors) requires human evaluation | Run `npx codescope init` in a fresh project, verify step indicators and summary |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
