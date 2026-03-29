---
phase: 16-tech-debt-closure
plan: 02
subsystem: build
tags: [typescript, tsc, hono, graphology, better-sqlite3, type-safety]

# Dependency graph
requires:
  - phase: 14-visualization-dashboard
    provides: "Dashboard server, API routes, client panels, screenshot module"
  - phase: 11-pr-review-impact-prediction
    provides: "Review tool handler with DbHandle type"
provides:
  - "Zero tsc --noEmit errors across entire codebase"
  - "Typed Hono AppEnv context for all dashboard routes"
  - "Ambient module declarations for graphology-layout-forceatlas2/worker and playwright"
  - "Widened DbHandle interface compatible with better-sqlite3 Database"
affects: [16-tech-debt-closure, distribution, visualization-dashboard]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Hono AppEnv generic for typed context variables", "Ambient module declarations for untyped deep imports"]

key-files:
  created: []
  modified:
    - src/dashboard/server.ts
    - src/dashboard/api/blast-radius.ts
    - src/dashboard/api/conventions.ts
    - src/dashboard/api/graph.ts
    - src/dashboard/api/impact.ts
    - src/dashboard/api/readiness.ts
    - src/dashboard/api/review.ts
    - src/dashboard/api/status.ts
    - src/tools/review/types.ts
    - src/types/graphology-deep-imports.d.ts
    - src/dashboard/client/panels/command.ts

key-decisions:
  - "Read pre-computed communities from SQLite instead of calling runCommunityDetection in graph API route"
  - "Use any[] in DbHandle to accept both {} and unknown[] without type conflict"
  - "Type-assert html2canvas default export rather than adding @types package"

patterns-established:
  - "AppEnv generic: All Hono sub-routers import AppEnv from server.ts for typed context variables"
  - "Ambient declarations: graphology-deep-imports.d.ts serves as central location for untyped graphology ecosystem modules"

requirements-completed: [REVIEW-01, REVIEW-02, REVIEW-03, IMPACT-02]

# Metrics
duration: 4min
completed: 2026-03-29
---

# Phase 16 Plan 02: TypeScript Compilation Fix Summary

**Resolved all 24 tsc --noEmit errors across 11 files: Hono AppEnv context typing, function argument corrections, DbHandle widening, ambient module declarations, and html2canvas type assertions**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-29T21:28:44Z
- **Completed:** 2026-03-29T21:32:29Z
- **Tasks:** 2
- **Files modified:** 11

## Accomplishments
- Eliminated all 24 TypeScript compilation errors, achieving zero `tsc --noEmit` errors
- Defined and applied Hono AppEnv type across server.ts and all 7 API sub-routers for proper context variable typing
- Fixed blastRadius/reverseBlastRadius call sites to use correct 3-arg signatures (graph, nodeId, maxHops)
- Replaced runtime runCommunityDetection call in graph API with SQLite read of pre-computed communities
- Added ambient module declarations for graphology-layout-forceatlas2/worker and playwright
- Widened DbHandle interface to accept better-sqlite3 Database type without conflicts
- All 1206 existing tests pass with zero regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix Hono AppEnv typing and dashboard API argument errors** - `f56db2c` (fix)
2. **Task 2: Fix DbHandle type, ambient declarations, and html2canvas/union type errors** - `ee44de2` (fix)

## Files Created/Modified
- `src/dashboard/server.ts` - Added AppEnv type definition and applied to Hono app + apiRouter
- `src/dashboard/api/blast-radius.ts` - Applied AppEnv, fixed blastRadius/reverseBlastRadius to 3 args, added file-to-nodeId lookup
- `src/dashboard/api/graph.ts` - Applied AppEnv, replaced runCommunityDetection with SQLite community read
- `src/dashboard/api/conventions.ts` - Applied AppEnv to conventionsRouter
- `src/dashboard/api/impact.ts` - Applied AppEnv to impactRouter
- `src/dashboard/api/readiness.ts` - Applied AppEnv to readinessRouter
- `src/dashboard/api/review.ts` - Applied AppEnv to reviewRouter
- `src/dashboard/api/status.ts` - Applied AppEnv to statusRouter
- `src/tools/review/types.ts` - Widened DbHandle.prepare return type with any[] params and added run method
- `src/types/graphology-deep-imports.d.ts` - Added bfsFromNode 4-arg overload, FA2Layout worker declaration, playwright declaration
- `src/dashboard/client/panels/command.ts` - Fixed html2canvas type assertion, blob callback typing, and union type property access

## Decisions Made
- **SQLite community read instead of recompute:** The graph API route was calling `runCommunityDetection(graph)` with wrong arity (1 arg vs required 2). Since communities are pre-computed during bootstrap and stored in SQLite, reading from the database is both correct (matches read-only dashboard purpose) and avoids the argument mismatch.
- **any[] in DbHandle:** Using `any[]` parameter types is necessary because better-sqlite3 Statement types use `{}` as default params while the existing code passes `unknown[]`. The eslint-disable comments document the intentional use.
- **Type assertion for html2canvas:** The html2canvas module's CJS default export doesn't have proper callable type declarations. A `unknown as (element: HTMLElement, ...) => Promise<HTMLCanvasElement>` assertion is the simplest fix without adding a types package.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all changes are type-level fixes with no placeholder data.

## Next Phase Readiness
- TypeScript compilation is clean -- `tsc --noEmit` exits 0
- All 1206 tests pass, zero regressions
- Build correctness gate satisfied for Phase 16 Plan 03 and beyond

## Self-Check: PASSED

All 11 modified files verified present. Both task commits (f56db2c, ee44de2) verified in git log. SUMMARY.md exists at expected path.

---
*Phase: 16-tech-debt-closure*
*Completed: 2026-03-29*
