---
phase: 18-semantic-conventions
plan: 03
subsystem: conventions
tags: [golden-files, noise-filtering, per-language-density, convention-detection]

# Dependency graph
requires:
  - phase: 18-01
    provides: Rule metadata registry and framework convention rules
provides:
  - Noise file filtering for golden file ranking (test/config/generated/deprecated)
  - Per-language convention density calculation (TS file / TS conventions, Python / Python)
  - Safety fallback when all files are noise
  - Extended countApplicableFiles exclusion (config, generated, deprecated)
affects: [convention-enforcement, golden-file-injection, reference-file-selection]

# Tech tracking
tech-stack:
  added: []
  patterns: [noise-file-exclusion, per-language-density-partitioning]

key-files:
  created: []
  modified:
    - src/conventions/golden-files.ts
    - src/conventions/runner.ts
    - tests/conventions/golden-files.test.ts
    - tests/conventions/runner.test.ts

key-decisions:
  - "isNoiseFile exported for testability and potential reuse in other modules"
  - "Language detection inferred from file extension (.py = Python, all else = TypeScript) and ruleId prefix (python-* = Python)"

patterns-established:
  - "Noise file pattern registry: centralized NOISE_PATTERNS object with test/config/generated/deprecated categories"
  - "Per-language density: partition conventions by language before density calculation, never cross-contaminate"

requirements-completed: [CONV-03, CONV-04]

# Metrics
duration: 4min
completed: 2026-03-31
---

# Phase 18 Plan 03: Golden File Ranking Fixes Summary

**Noise file exclusion and per-language density calculation for golden file ranking -- test/config/generated/deprecated files filtered out, TS density uses only TS conventions**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-31T00:14:45Z
- **Completed:** 2026-03-31T00:18:24Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 4

## Accomplishments
- Golden file ranking now excludes noise files (test, config, generated, deprecated) before density calculation
- Density calculated per-language: TS files use only TS convention count, Python files use only Python convention count
- Safety fallback: if noise filtering removes ALL files, unfiltered ranking returned (prevents empty results)
- countApplicableFiles extended to also exclude config, generated, and deprecated files
- 17 new tests (14 golden-files + 3 runner) all passing, 44 total convention tests green

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for noise filtering, per-language density, countApplicableFiles** - `782d504` (test)
2. **Task 1 (GREEN): Implement noise filtering, per-language density, extended exclusion** - `a53cb05` (feat)

## Files Created/Modified
- `src/conventions/golden-files.ts` - Added isNoiseFile(), getFileLanguage(), getConventionLanguage(); rewrote rankGoldenFiles with noise filtering and per-language density
- `src/conventions/runner.ts` - Extended countApplicableFiles with config/generated/deprecated exclusion patterns and directory skips
- `tests/conventions/golden-files.test.ts` - 15 new tests: isNoiseFile (6), noise ranking exclusion (6), per-language density (3)
- `tests/conventions/runner.test.ts` - 3 new tests: countApplicableFiles config/generated/deprecated exclusion

## Decisions Made
- Exported `isNoiseFile` for testability and potential reuse in reference file injection
- Language detection uses file extension for files (.py = Python) and ruleId prefix for conventions (python-* = Python), matching existing getRuleLanguage pattern in runner.ts
- Config file detection uses both substring patterns (.config.) and exact name prefix regex (tsconfig*, vitest.config*) for thorough coverage

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all functionality fully wired.

## Issues Encountered

Pre-existing test failures in unrelated files (rule-filter.test.ts: stale count assertion, manifest.test.ts: plugin structure mismatch). These are not caused by this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Golden file ranking now produces clean, per-language results suitable for reference file injection
- isNoiseFile utility available for reuse in other convention modules

## Self-Check: PASSED

- All 4 source/test files verified on disk
- Both commits (782d504, a53cb05) verified in git log

---
*Phase: 18-semantic-conventions*
*Completed: 2026-03-31*
