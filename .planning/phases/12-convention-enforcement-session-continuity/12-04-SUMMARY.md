---
phase: 12-convention-enforcement-session-continuity
plan: 04
subsystem: hooks
tags: [claude-code-hooks, session-continuity, handoff, pre-compact, session-start, tsdown]

# Dependency graph
requires:
  - phase: 12-02
    provides: Session types, handoff-generator, handoff-parser, session-cleanup modules
  - phase: 10-auto-injection-hooks
    provides: PreToolUse/PostToolUse hook patterns, build isolation pattern, hooks.json structure
provides:
  - PreCompact hook for auto-generating handoff documents before context compaction
  - SessionStart hook for injecting handoff summary on session resume
  - Lightweight handoff-builder in hooks/lib/ with zero heavy imports
  - Extended hook types (PreCompactInput/Output, SessionStartInput/Output)
  - Updated hooks.json with PreCompact and SessionStart events
  - Complete tsdown build config with all 9 entry points
affects: [12-05-session-skills, session-continuity, plugin-hooks]

# Tech tracking
tech-stack:
  added: []
  patterns: [pre-compact-hook-pattern, session-start-hook-pattern, hook-lib-handoff-builder]

key-files:
  created:
    - src/hooks/pre-compact.ts
    - src/hooks/session-start.ts
    - src/hooks/lib/handoff-builder.ts
    - tests/hooks/pre-compact.test.ts
    - tests/hooks/session-start.test.ts
  modified:
    - src/hooks/lib/types.ts
    - hooks/hooks.json
    - tsdown.config.ts

key-decisions:
  - "Duplicated handoff logic in hooks/lib/handoff-builder.ts for build isolation -- hooks cannot import from src/session/"
  - "Staleness check uses execSync git log with 3-day threshold and >5 commit minimum to avoid false positives"
  - "tsdown.config.ts consolidates all 9 entry points as sole owner for Phase 12"

patterns-established:
  - "PreCompact hook pattern: silent no-op when no active pipeline, auto-save before compaction"
  - "SessionStart hook pattern: inject compact summary from most recent handoff file"
  - "Hook lib module pattern: lightweight utilities in src/hooks/lib/ with only node:fs and node:path imports"

requirements-completed: [SESS-03, SESS-04]

# Metrics
duration: 4min
completed: 2026-03-28
---

# Phase 12 Plan 04: Hooks & Build Config Summary

**PreCompact and SessionStart Claude Code hooks for auto-saving pipeline state before compaction and injecting handoff context on session resume, plus complete tsdown build config with all 9 entry points**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T17:35:34Z
- **Completed:** 2026-03-28T17:40:30Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- PreCompact hook auto-generates handoff documents before context compaction with silent no-op when no active pipeline
- SessionStart hook injects compact handoff summary on resume with staleness detection for outdated handoffs
- Lightweight handoff-builder in hooks/lib/ with ZERO imports from heavy modules (strict build isolation)
- hooks.json registers PreCompact (manual|auto) and SessionStart (resume|compact) events
- tsdown config updated with all 9 entry points: 3 original + 2 new hooks + 1 enforcement + 3 session modules
- All 13 tests pass (7 PreCompact + 6 SessionStart)

## Task Commits

Each task was committed atomically:

1. **Task 1: Hook types + handoff builder + PreCompact hook** - `781b519` (test: RED), `8e8dacd` (feat: GREEN)
2. **Task 2: SessionStart hook + hooks.json + tsdown config** - `4d93c00` (test: RED), `afdd5b4` (feat: GREEN)

_TDD tasks have two commits each (test then feat)_

## Files Created/Modified
- `src/hooks/lib/types.ts` - Extended with PreCompactInput/Output, SessionStartInput/Output
- `src/hooks/lib/handoff-builder.ts` - Lightweight handoff generation for hook context (build isolated)
- `src/hooks/pre-compact.ts` - PreCompact hook entry point with processPreCompact
- `src/hooks/session-start.ts` - SessionStart hook entry point with processSessionStart
- `hooks/hooks.json` - Updated registration with PreCompact and SessionStart events
- `tsdown.config.ts` - Complete build config with all 9 entry points
- `tests/hooks/pre-compact.test.ts` - 7 tests for PreCompact hook
- `tests/hooks/session-start.test.ts` - 6 tests for SessionStart hook

## Decisions Made
- Duplicated handoff logic in hooks/lib/handoff-builder.ts for build isolation -- hooks cannot import from src/session/ which may transitively import heavy modules
- Staleness check uses execSync git log with 3-day threshold and >5 commit minimum to avoid false positives on recent handoffs
- tsdown.config.ts consolidates all 9 entry points as sole owner for Phase 12, producing dist/ artifacts for hooks, enforcement, and session modules

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functionality is fully wired.

## Next Phase Readiness
- PreCompact and SessionStart hooks are ready for plugin registration
- All session modules (handoff-generator, handoff-parser, session-cleanup) built to dist/ for Plan 05 skill invocation
- hooks.json fully configured with all 4 hook events (PreToolUse, PostToolUse, PreCompact, SessionStart)

## Self-Check: PASSED

All 14 files verified present on disk. All 4 commit hashes verified in git log.

---
*Phase: 12-convention-enforcement-session-continuity*
*Completed: 2026-03-28*
