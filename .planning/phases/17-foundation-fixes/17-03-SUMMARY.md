---
phase: 17-foundation-fixes
plan: 03
subsystem: conventions, readiness
tags: [convention-parser, readiness-scoring, scoring-version, canonical-parser, trends]

# Dependency graph
requires:
  - phase: none
    provides: none
provides:
  - Single canonical convention parser for detector's actual h3+table output format
  - Convention index populated from real detector output
  - Readiness scoring using actual graph DB counts instead of hardcoded approximations
  - scoring_version column in readiness_history table (v1=estimation, v2=actual)
  - Methodology-change notice in trends tool when comparing across scoring versions
  - Import graph health 0% diagnostic message with actionable steps
affects: [bootstrap, convention-detection, readiness, trends, review]

# Tech tracking
tech-stack:
  added: []
  patterns: [canonical-parser pattern -- single source of truth for convention format parsing]

key-files:
  created:
    - src/conventions/parser.ts
    - tests/artifacts/convention-index.test.ts
  modified:
    - src/artifacts/convention-index.ts
    - src/tools/conventions.ts
    - src/tools/review/convention-parser.ts
    - src/graph/schema.ts
    - src/graph/readiness-history.ts
    - src/bootstrap/orchestrator.ts
    - src/tools/trends-tool.ts
    - tests/graph/readiness-history.test.ts
    - tests/graph/migration.test.ts
    - tests/tools/conventions.test.ts
    - tests/tools/review.test.ts

key-decisions:
  - "Query graph DB for real file counts instead of modifying BuildGraphResult interface"
  - "Count HIGH-CONF conventions by reading conventions.md with canonical parser in orchestrator"
  - "edgesCreated equals resolvedImports since edges only created when resolved"

patterns-established:
  - "Canonical parser pattern: all convention parsing goes through src/conventions/parser.ts"
  - "Schema migration via try/catch ALTER TABLE (SQLite lacks IF NOT EXISTS for columns)"

requirements-completed: [CONV-01, CONV-02]

# Metrics
duration: 8min
completed: 2026-03-30
---

# Phase 17 Plan 03: Convention Parser & Readiness Scoring Fix Summary

**Canonical convention parser replaces 3 duplicated parsers, readiness scoring uses actual data, scoring_version tracks methodology changes**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-30T21:07:38Z
- **Completed:** 2026-03-30T21:16:15Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Created single canonical convention parser that handles the detector's ACTUAL h3+markdown table output format
- Replaced all 3 duplicated parsers (convention-index, conventions tool, review parser) with imports from canonical parser
- Replaced 6 hardcoded approximations in readiness scoring with actual graph DB queries
- Added scoring_version column to readiness_history (old rows DEFAULT 1, new rows version 2)
- Added import_graph_health 0% diagnostic message with actionable troubleshooting steps (D-03)
- Added methodology-change notice in trends tool when comparing across scoring versions (D-12)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create canonical convention parser and fix convention index** - `30c5f77` (feat, TDD)
2. **Task 2: Fix readiness scoring and add scoring_version to history** - `d20a2d9` (feat)
3. **Fix migration test for scoring_version column** - `79944ec` (fix, deviation Rule 1)

## Files Created/Modified
- `src/conventions/parser.ts` - Single canonical convention parser (parseDetectorConventions)
- `src/artifacts/convention-index.ts` - Now imports from canonical parser
- `src/tools/conventions.ts` - Now imports from canonical parser, local parser removed
- `src/tools/review/convention-parser.ts` - Re-exports from canonical parser
- `src/graph/schema.ts` - Added scoring_version column migration
- `src/graph/readiness-history.ts` - Added scoring_version to interface and INSERT
- `src/bootstrap/orchestrator.ts` - Real file counts from graph DB, HIGH-CONF from parser, 0% diagnostic
- `src/tools/trends-tool.ts` - Methodology-change notice for cross-version comparisons
- `tests/artifacts/convention-index.test.ts` - 9 tests for canonical parser
- `tests/graph/readiness-history.test.ts` - 3 new tests for scoring_version
- `tests/graph/migration.test.ts` - Updated column count for scoring_version
- `tests/tools/conventions.test.ts` - Updated fixtures to detector's actual format
- `tests/tools/review.test.ts` - Updated fixtures to detector's actual format

## Decisions Made
- Used graph DB queries for real file counts (totalSourceFiles, typedFiles, testFiles) instead of modifying the BuildGraphResult interface -- simpler, avoids touching the risk analyzer chain
- Count HIGH-CONF conventions by reading conventions.md with the canonical parser in the orchestrator -- avoids adding fields to ConventionDetectorResult
- Set resolvedImports = totalEdgesAll because edges only get created when import resolution succeeds

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed edge case: h1/h2 headings parsed as convention names**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Content like `# Conventions\n\nNo conventions detected.` would parse `# Conventions` as a convention name because it passed through the split filter
- **Fix:** Added check to skip names starting with `#` (h1/h2 headings that aren't from h3 splits)
- **Files modified:** src/conventions/parser.ts
- **Verification:** Empty content test passes, conventions.test.ts Test 11 passes

**2. [Rule 1 - Bug] Updated test fixtures from old bold-field format to actual detector format**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** conventions.test.ts and review.test.ts used `**Convention:** name` bold-field format in fixture data, which the new canonical parser correctly no longer supports
- **Fix:** Rewrote test fixtures to use the actual detector output format (h3 + markdown table)
- **Files modified:** tests/tools/conventions.test.ts, tests/tools/review.test.ts
- **Verification:** All 29 tests across 3 test files pass

**3. [Rule 1 - Bug] Updated migration test for scoring_version column**
- **Found during:** Task 2 (verification)
- **Issue:** migration.test.ts expected 8 columns in readiness_history table, now has 9 with scoring_version
- **Fix:** Updated expected column list and count
- **Files modified:** tests/graph/migration.test.ts
- **Verification:** All 14 migration tests pass

---

**Total deviations:** 3 auto-fixed (3 Rule 1 bugs)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None -- plan executed cleanly after auto-fixes.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Convention index will now be populated with real data during bootstrap
- Readiness scores will reflect actual codebase metrics
- Trend comparisons will correctly flag methodology changes
- Pre-existing plugin manifest test failures (8 tests) logged to deferred-items.md

## Self-Check: PASSED

- All 11 key files: FOUND
- All 3 commits: FOUND (30c5f77, d20a2d9, 79944ec)
- Test suite: 1221 passing, 3 pre-existing failures (plugin manifest)

---
*Phase: 17-foundation-fixes*
*Completed: 2026-03-30*
