# Phase 15: Distribution - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-29
**Phase:** 15-distribution
**Areas discussed:** Init experience, CLI subcommands, Claude Code auto-setup, Cross-platform packaging, Output & feedback, Compatibility checks, Status command, Package naming, README

---

## Init Experience

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-detect + single confirm | Detect everything, show findings, one Y/n confirmation, then bootstrap | ✓ |
| Multi-step wizard | Ask questions at each step (language, config, plugins) | |
| Fully silent | Detect and run everything without confirmation | |

**User's choice:** Auto-detect + single confirmation
**Notes:** User agreed with recommendation. Existing `src/onboard/detect.ts` logic should be reused.

---

## CLI Subcommands

| Option | Description | Selected |
|--------|-------------|----------|
| Thin wrappers | Lightweight entry points calling into existing plugin code | ✓ |
| Full reimplementation | Standalone CLI with its own logic separate from plugin | |

**User's choice:** Thin wrappers over existing code
**Notes:** Commands: init, bootstrap, viz, review, install-hooks, status. Minimal help text.

---

## Claude Code Auto-Setup

| Option | Description | Selected |
|--------|-------------|----------|
| Generate if missing, skip if exists | Create full plugin config when absent, warn + skip when present | ✓ |
| Always overwrite | Regenerate configs every time | |
| Interactive merge | Show diffs and ask per-file | |

**User's choice:** Generate if missing, warn-and-skip if exists
**Notes:** `--force` flag available to regenerate. Never silently overwrite.

---

## Cross-Platform Packaging

| Option | Description | Selected |
|--------|-------------|----------|
| optionalDependencies + bundled WASM | Platform packages for sqlite, WASM grammars in npm files array | ✓ |
| Postinstall script | Download binaries after npm install | |
| Prebuilt all-in-one | Bundle all platform binaries in single package | |

**User's choice:** optionalDependencies pattern (esbuild/swc style) + bundled WASM
**Notes:** No postinstall scripts. WASM grammars are cross-platform so bundle directly.

---

## Output & Feedback

| Option | Description | Selected |
|--------|-------------|----------|
| Colored step indicators | Checkmarks, spinners, step-by-step progress with --json for CI | ✓ |
| Plain text only | No colors, simple log output | |
| Rich TUI | Full terminal UI with panels and animations | |

**User's choice:** Colored step indicators with `--json` CI mode
**Notes:** User agreed with recommendation.

---

## Compatibility Checks

| Option | Description | Selected |
|--------|-------------|----------|
| Fail fast with clear message | Check Node >=22, Claude Code, prebuilds on entry | ✓ |
| Soft warnings | Continue with degraded functionality | |

**User's choice:** Fail fast with clear, specific error messages
**Notes:** Specific guidance for prebuild failures rather than cryptic errors.

---

## Package Naming

| Option | Description | Selected |
|--------|-------------|----------|
| Unscoped `codescope` | `npx codescope init` — clean, simple | ✓ |
| Scoped `@codescope/cli` | `npx @codescope/cli init` — more characters | |

**User's choice:** Unscoped `codescope`
**Notes:** Platform-specific sqlite packages scoped as `@codescope/better-sqlite3-*`.

---

## Claude's Discretion

- CLI framework choice (commander, yargs, or minimal)
- Spinner/progress library
- Internal code organization for CLI entry point

## Deferred Ideas

None — discussion stayed within phase scope
