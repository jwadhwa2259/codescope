---
phase: 16-tech-debt-closure
plan: 01
subsystem: infra
tags: [mcp, tsdown, esm, git-hooks, idempotency]

# Dependency graph
requires:
  - phase: 15-distribution
    provides: CLI entry point, plugin wiring, npm packaging
  - phase: 12
    provides: Convention enforcement install-hooks module
provides:
  - MCP server starts correctly via .mcp.json (dist/server.mjs)
  - Idempotent hook installation safe to run multiple times
affects: [distribution, enforcement, plugin-wiring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Idempotency guard: detect own output before overwriting (fork bomb prevention)"

key-files:
  created: []
  modified:
    - .mcp.json
    - package.json
    - src/cli/setup/plugin-wiring.ts
    - src/enforcement/install-hooks.ts
    - tests/enforcement/install-hooks.test.ts

key-decisions:
  - "Detect CodeScope wrapper by content marker string, not filename, for reliable idempotency"
  - "Return early with already-installed message rather than overwrite own hook"

patterns-established:
  - "Idempotency guard: check if output already exists with marker content before destructive overwrite"

requirements-completed: [REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04, IMPACT-01, IMPACT-02, DEBT-02, DIST-03]

# Metrics
duration: 5min
completed: 2026-03-29
---

# Phase 16 Plan 01: Critical Runtime Bug Fixes Summary

**Fixed MCP server path mismatch (dist/server.js -> dist/server.mjs) in 3 locations and install-hooks fork bomb with idempotency guard and regression test**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-29T21:28:41Z
- **Completed:** 2026-03-29T21:34:27Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Fixed MCP server entry point path in .mcp.json, package.json, and plugin-wiring.ts from dist/server.js to dist/server.mjs (actual tsdown ESM output)
- Added idempotency check to installGitHooks that detects its own wrapper script and returns early instead of backing it up as predecessor (preventing infinite shell recursion)
- Added fork bomb regression test proving second install call does not create self-referencing backup

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix MCP server path mismatch in 3 locations** - `6af53f6` (fix)
2. **Task 2: Fix fork bomb in install-hooks and add regression test** - `21fdca2` (fix)

## Files Created/Modified
- `.mcp.json` - Fixed MCP server args from dist/server.js to dist/server.mjs
- `package.json` - Fixed main field from dist/server.js to dist/server.mjs
- `src/cli/setup/plugin-wiring.ts` - Fixed MCP_JSON constant from dist/server.js to dist/server.mjs
- `src/enforcement/install-hooks.ts` - Added idempotency check before backup in installGitHooks
- `tests/enforcement/install-hooks.test.ts` - Added fork bomb prevention regression test (10 tests total, all passing)

## Decisions Made
- Detect CodeScope wrapper by checking for content markers ("CodeScope convention enforcement pre-commit hook" or "pre-commit-check.mjs") rather than filename-based detection, for reliable idempotency
- Return early with descriptive "already installed" message rather than silently overwriting -- makes behavior clear to the user

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- MCP server path is now correct -- Claude Code can start CodeScope's MCP server
- install-hooks is safe to run multiple times -- no fork bomb risk
- Ready for Plan 02 (test gap closure) and Plan 03 (remaining tech debt items)

---
*Phase: 16-tech-debt-closure*
*Completed: 2026-03-29*
