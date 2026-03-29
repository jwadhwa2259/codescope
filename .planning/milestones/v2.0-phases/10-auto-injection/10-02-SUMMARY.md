---
phase: 10-auto-injection
plan: 02
subsystem: hooks
tags: [claude-code-hooks, PreToolUse, PostToolUse, context-injection, token-budget, priority-queue]

# Dependency graph
requires:
  - phase: 10-auto-injection plan 01
    provides: pre-computed artifact JSON files (danger-zones.json, conventions.json, blast-radius.json)
provides:
  - PreToolUse hook injecting danger zone, convention, and blast radius context on Edit/Write
  - PostToolUse hook reminding Claude of conventions and blast radius for modified files
  - 500-token priority-budgeted composition (danger > conventions > blast radius)
  - hooks.json registration in plugin manifest with Edit|Write matcher
  - tsdown build producing standalone hook bundles with zero heavy dependencies
affects: [12-convention-enforcement, 14-visualization, npx-distribution]

# Tech tracking
tech-stack:
  added: []
  patterns: [hook-build-isolation, priority-budgeted-token-composition, graceful-no-op-guard, artifact-reader-pattern]

key-files:
  created:
    - src/hooks/lib/types.ts
    - src/hooks/lib/artifact-reader.ts
    - src/hooks/lib/budget-composer.ts
    - src/hooks/pre-tool-use.ts
    - src/hooks/post-tool-use.ts
    - hooks/hooks.json
    - tests/hooks/budget-composer.test.ts
    - tests/hooks/pre-tool-use.test.ts
    - tests/hooks/post-tool-use.test.ts
  modified:
    - .claude-plugin/plugin.json
    - tsdown.config.ts
    - tests/plugin/manifest.test.ts

key-decisions:
  - "Hook artifact types duplicated in src/hooks/lib/types.ts (not imported from src/artifacts/) for build isolation -- hooks must never transitively import better-sqlite3/graphology/web-tree-sitter"
  - "hooks.json references .mjs files (dist/hooks/pre-tool-use.mjs) matching actual tsdown ESM output, not .js as originally planned"
  - "PostToolUse convention checking is advisory (reminds Claude of conventions) -- true validation deferred to Phase 12"
  - "PostToolUse blast radius threshold set to totalAffected > 3 (higher than PreToolUse's > 1) to reduce noise on post-edit"

patterns-established:
  - "Hook build isolation: src/hooks/ imports ONLY from node:fs, node:path, node:process, and src/hooks/lib/"
  - "Priority-budgeted composition: InjectionItem with priority numbers, sorted ascending, greedy fill within token budget"
  - "Graceful no-op guard: check graph.db existence first, return bare hookSpecificOutput if missing"
  - "Module-level execution guard: isMainModule check so hooks can be imported for testing without stdin/stdout side effects"

requirements-completed: [INJECT-01, INJECT-02, INJECT-03, INJECT-04, INJECT-05]

# Metrics
duration: 7min
completed: 2026-03-28
---

# Phase 10 Plan 02: Hook Scripts Summary

**PreToolUse/PostToolUse hooks reading pre-computed artifact files with 500-token priority-budgeted context injection on every Edit/Write, zero heavy dependencies, graceful no-op when unbootstrapped**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-28T15:19:42Z
- **Completed:** 2026-03-28T15:26:30Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- PreToolUse hook injects danger zone warnings, conventions, and blast radius summaries before file edits
- PostToolUse hook reminds Claude of conventions and warns about blast radius after edits
- 500-token budget enforced via priority queue: danger zones (P1) > conventions (P2) > blast radius (P3)
- Both hooks silently no-op when graph.db is missing or file is below trigger threshold
- Built hooks verified to contain zero imports of better-sqlite3, graphology, or web-tree-sitter
- hooks.json registered in plugin.json, both hooks built to dist/hooks/ via tsdown
- 35 new tests (26 hook logic + 9 manifest), full suite at 909 passing

## Task Commits

Each task was committed atomically:

1. **Task 1: Create hook library modules and hook entry points** - `b13c2ca` (feat) -- TDD: RED->GREEN with 26 tests
2. **Task 2: Wire hooks into plugin manifest and build system** - `c29f493` (feat) -- hooks.json, plugin.json, tsdown.config.ts, 9 manifest tests

## Files Created/Modified
- `src/hooks/lib/types.ts` - Hook I/O types + duplicated artifact types for build isolation
- `src/hooks/lib/artifact-reader.ts` - readJsonSafe and readAllArtifacts for safe JSON file reading
- `src/hooks/lib/budget-composer.ts` - estimateTokens, composeBudgetedMessage with priority queue
- `src/hooks/pre-tool-use.ts` - PreToolUse entry point: danger zones + conventions + blast radius injection
- `src/hooks/post-tool-use.ts` - PostToolUse entry point: convention reminder + blast radius warning
- `hooks/hooks.json` - Claude Code hook event registrations for Edit|Write
- `.claude-plugin/plugin.json` - Added hooks field pointing to ./hooks/hooks.json
- `tsdown.config.ts` - Added hook entry points to build config
- `tests/hooks/budget-composer.test.ts` - 10 tests for token estimation and budget composition
- `tests/hooks/pre-tool-use.test.ts` - 10 tests covering INJECT-01/03/04/05, path normalization, graceful degradation
- `tests/hooks/post-tool-use.test.ts` - 6 tests covering INJECT-02/04/05, no danger zone in PostToolUse
- `tests/plugin/manifest.test.ts` - 9 new tests for hooks.json structure and plugin.json hooks field

## Decisions Made
- **Build isolation via type duplication:** Artifact types duplicated in src/hooks/lib/types.ts rather than imported from src/artifacts/types.ts, preventing any transitive path to heavy modules
- **ESM .mjs extension:** tsdown outputs .mjs for ESM format. hooks.json references .mjs files to match actual build output (pre-existing pattern: .mcp.json also references .js while build produces .mjs)
- **Advisory PostToolUse conventions:** Convention reminders are advisory text, not validation. True convention enforcement deferred to Phase 12 per RESEARCH Open Question 1
- **PostToolUse blast radius threshold > 3:** Higher threshold than PreToolUse (> 1) to reduce noise -- post-edit reminders should only fire for significant impact

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated file extension from .js to .mjs in hooks.json and tests**
- **Found during:** Task 2 (build system wiring)
- **Issue:** Plan specified dist/hooks/pre-tool-use.js and dist/hooks/post-tool-use.js, but tsdown ESM format produces .mjs extension
- **Fix:** Updated hooks.json command paths and manifest test assertions to reference .mjs files matching actual build output
- **Files modified:** hooks/hooks.json, tests/plugin/manifest.test.ts
- **Verification:** npx tsdown builds successfully, tests pass, hooks.json commands match actual dist paths
- **Committed in:** c29f493 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to match actual build output. No scope creep.

## Issues Encountered
None beyond the .mjs extension deviation handled above.

## Known Stubs
None -- all functionality is fully wired. Artifact data flows from Plan 01's generator through readAllArtifacts to composeBudgetedMessage to additionalContext output.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 10 (Auto-Injection) is now complete: Plan 01 generates artifacts, Plan 02 consumes them in hooks
- Ready for Phase 12 (Convention Enforcement) which will add true convention validation in PostToolUse
- Ready for npx distribution packaging -- hooks are standalone bundles with zero native dependencies
- Pre-existing issue: .mcp.json references dist/server.js but actual build output is dist/server.mjs. This affects the MCP server, not the hooks, and predates Phase 10.

## Self-Check: PASSED

All 9 created files verified on disk. Both task commits (b13c2ca, c29f493) verified in git log.

---
*Phase: 10-auto-injection*
*Completed: 2026-03-28*
