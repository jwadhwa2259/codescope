---
phase: 15-distribution
plan: 01
subsystem: cli
tags: [commander, ora, chalk, npx, cli, distribution]

# Dependency graph
requires:
  - phase: 14-visualization-dashboard
    provides: Dashboard server, all existing modules (bootstrap, onboard, config, enforcement, graph)
provides:
  - "CLI entry point with 6 subcommands (init, bootstrap, viz, review, install-hooks, status)"
  - "Plugin auto-setup (wirePlugin) generating .claude-plugin/plugin.json, .mcp.json, hooks/hooks.json"
  - "UI helpers (spinner with JSON mode, chalk formatting, jsonOutput)"
  - "Full init flow: detect -> confirm -> config -> bootstrap -> plugin wiring -> summary"
  - "Status diagnostic: config, bootstrap meta, readiness, hooks, dashboard, plugin check"
affects: [15-02-PLAN, npm-distribution, marketplace]

# Tech tracking
tech-stack:
  added: [commander, ora, chalk]
  patterns: [dynamic-import-for-heavy-deps, json-mode-noop-spinner, cli-command-registration]

key-files:
  created:
    - src/cli/cli.ts
    - src/cli/index.ts
    - src/cli/ui/spinner.ts
    - src/cli/ui/format.ts
    - src/cli/commands/init.ts
    - src/cli/commands/bootstrap.ts
    - src/cli/commands/viz.ts
    - src/cli/commands/review.ts
    - src/cli/commands/install-hooks.ts
    - src/cli/commands/status.ts
    - src/cli/setup/plugin-wiring.ts
    - tests/cli/commands.test.ts
    - tests/cli/init.test.ts
    - tests/cli/plugin-wiring.test.ts
  modified:
    - package.json
    - tsdown.config.ts

key-decisions:
  - "Dynamic imports for heavy deps (bootstrap, graph, enforcement) to keep CLI bundle clean and avoid graphology ESM subpath resolution issues"
  - "CLI source file named cli.ts (not index.ts) so tsdown produces dist/cli.mjs matching package.json bin field"
  - "Separate tsdown config block for CLI with hashbang banner -- cannot share with server config"
  - "Review command delegates to Claude Code skill since codescope_review MCP tool requires Claude Code context"

patterns-established:
  - "CLI command registration: export function register*Command(program: Command) pattern"
  - "JSON mode: --json flag disables spinners, skips interactive prompts, outputs machine-readable JSON"
  - "Dynamic import for bundle isolation: heavy modules loaded at action time, not at import time"

requirements-completed: [DIST-01, DIST-02, DIST-03]

# Metrics
duration: 14min
completed: 2026-03-29
---

# Phase 15 Plan 01: CLI Entry Point Summary

**Complete `npx codescope` CLI with 6 subcommands, init flow with plugin auto-setup, UI helpers with JSON mode, and 17 tests**

## Performance

- **Duration:** 14 min
- **Started:** 2026-03-29T17:14:44Z
- **Completed:** 2026-03-29T17:29:00Z
- **Tasks:** 3
- **Files modified:** 16

## Accomplishments
- Built `dist/cli.mjs` with hashbang, Node >=22 version gate, and all 6 subcommands visible in `--help`
- Init command implements the full onboarding flow: detect project -> confirm -> create config -> run bootstrap -> wire plugin -> summary
- Plugin wiring generates .claude-plugin/plugin.json, .mcp.json, and hooks/hooks.json with ${CLAUDE_PLUGIN_ROOT} template variables
- Status command provides full health diagnostic: config, bootstrap meta, readiness score, hooks, dashboard, plugin state
- 17 tests across 3 test files covering subcommand registration, UI helpers, init flow, and plugin wiring

## Task Commits

Each task was committed atomically:

1. **Task 1: CLI entry point, UI helpers, build config, and dependencies** - `2848c90` (feat)
2. **Task 2: Init command, plugin auto-setup, and their dedicated tests** - `a564814` (feat)
3. **Task 3: Remaining 5 subcommands and CLI tests** - `44e54fa` (feat)
4. **Bug fix: correct installPreCommitHook function name** - `ad5d9cb` (fix)

## Files Created/Modified
- `src/cli/cli.ts` - Main CLI entry point with Node version gate, commander setup, 6 subcommand registrations
- `src/cli/index.ts` - Re-export barrel for package imports
- `src/cli/ui/spinner.ts` - ora wrapper with JSON-mode no-op for machine-readable output
- `src/cli/ui/format.ts` - chalk formatting (formatStep, formatError, formatWarning, formatSummary, jsonOutput)
- `src/cli/commands/init.ts` - Full init flow: detect -> confirm -> config -> bootstrap -> plugin wiring -> summary
- `src/cli/commands/bootstrap.ts` - Thin wrapper around runBootstrap with spinner and --json
- `src/cli/commands/viz.ts` - Launches dashboard server, optionally opens browser
- `src/cli/commands/review.ts` - Shows changed files, directs to Claude Code skill
- `src/cli/commands/install-hooks.ts` - Thin wrapper around installPreCommitHook
- `src/cli/commands/status.ts` - Full diagnostic: config, bootstrap, readiness, hooks, dashboard, plugin
- `src/cli/setup/plugin-wiring.ts` - Plugin auto-setup: generates plugin.json, .mcp.json, hooks.json
- `tests/cli/commands.test.ts` - 7 tests: subcommand registration, spinner modes, format helpers
- `tests/cli/init.test.ts` - 4 tests: init command registration, flow ordering, --json mode, error handling
- `tests/cli/plugin-wiring.test.ts` - 6 tests: skip-if-exists, create structure, CLAUDE_PLUGIN_ROOT, force mode, claude detection, hooks structure
- `package.json` - Added commander/ora/chalk deps, bin field, build:cli script
- `tsdown.config.ts` - Added third config block for CLI with hashbang banner

## Decisions Made
- **Dynamic imports for heavy dependencies:** Bootstrap, graph, enforcement modules use `await import()` instead of static imports. This prevents tsdown from bundling the entire module tree (including graphology-metrics which has CJS subpath resolution issues in Node ESM). The CLI bundle stays lightweight (~6KB) and heavy deps load on demand.
- **CLI file naming:** Source is `src/cli/cli.ts` (not `index.ts`) so tsdown output is `dist/cli.mjs` matching the package.json bin field. A barrel `src/cli/index.ts` re-exports for package imports.
- **Review command as guidance:** The `codescope_review` MCP tool requires Claude Code context, so the CLI review command shows changed files and directs users to the Claude Code skill.
- **Plugin wiring Claude detection:** `wirePlugin` checks for Claude Code via `execFileSync('claude', ['--version'])` and gracefully skips if not found, returning an informative message.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed installHooks function name mismatch**
- **Found during:** Task 3 (install-hooks command)
- **Issue:** Plan referenced `installHooks` but the actual export from `src/enforcement/install-hooks.ts` is `installPreCommitHook`
- **Fix:** Updated dynamic import destructuring to use correct function name
- **Files modified:** `src/cli/commands/install-hooks.ts`
- **Verification:** TypeScript type check passes, tests pass
- **Committed in:** `ad5d9cb`

**2. [Rule 3 - Blocking] Fixed graphology ESM subpath resolution in CLI bundle**
- **Found during:** Task 3 verification (build output testing)
- **Issue:** `graphology-metrics/centrality/degree` import failed at runtime because the package lacks ESM exports map. Node ESM requires `.js` extension for subpath imports from CJS packages. The tsdown bundler was leaving these as external imports.
- **Fix:** Refactored all subcommands to use dynamic `await import()` for heavy dependencies (bootstrap, graph, enforcement). This keeps the heavy module tree out of the CLI bundle entirely, avoiding the ESM resolution issue.
- **Files modified:** `src/cli/commands/init.ts`, `src/cli/commands/bootstrap.ts`, `src/cli/commands/install-hooks.ts`
- **Verification:** `node dist/cli.mjs --help` runs successfully, all tests pass
- **Committed in:** `44e54fa` (part of Task 3 commit)

**3. [Rule 3 - Blocking] Fixed bundled auto-execution of installPreCommitHook**
- **Found during:** Task 3 verification
- **Issue:** `src/enforcement/install-hooks.ts` has an `isMainModule` guard that fires when bundled into cli.mjs because `import.meta.url` resolves to the bundle file
- **Fix:** Changed from static import to dynamic import so the enforcement module is never bundled inline
- **Files modified:** `src/cli/commands/install-hooks.ts`
- **Verification:** `node dist/cli.mjs --help` no longer triggers hook installation
- **Committed in:** `44e54fa` (part of Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All auto-fixes necessary for correct CLI operation. The dynamic import pattern is actually superior to static imports for a CLI -- it reduces startup time and bundle size. No scope creep.

## Issues Encountered
- Pre-existing `graphology-metrics` CJS/ESM incompatibility affects both `dist/server.mjs` and `dist/cli.mjs`. Resolved for CLI via dynamic imports. Server build is a pre-existing issue not in scope for this plan.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all commands dispatch to real implementations or provide actionable guidance (review command).

## Next Phase Readiness
- CLI entry point complete, ready for Plan 02 (npm packaging, files array, npx smoke tests)
- `package.json` bin field configured, tsdown produces hashbang CLI
- No blockers for distribution packaging

## Self-Check: PASSED

- All 14 created files verified present on disk
- All 4 commit hashes (2848c90, a564814, 44e54fa, ad5d9cb) verified in git log
- `node dist/cli.mjs --help` shows all 6 subcommands
- `head -1 dist/cli.mjs` shows `#!/usr/bin/env node`
- 17/17 tests pass across 3 test files

---
*Phase: 15-distribution*
*Completed: 2026-03-29*
