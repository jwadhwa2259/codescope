---
phase: 18-semantic-conventions
plan: 01
subsystem: conventions
tags: [rule-metadata, file-classifier, framework-detection, ast-grep, convention-enforcement]

# Dependency graph
requires:
  - phase: 14-convention-enforcement
    provides: RULE_METADATA in runner.ts and duplicated in rule-filter.ts
provides:
  - Shared RULE_METADATA module (single source of truth) with RuleMetadataEntry, RULE_NAME_TO_ID, RULE_ID_TO_NAME
  - File-role classifier with 3-tier signal chain (test/config/route-handler/utility/deprecated/general)
  - RULE_ROLE_APPLICABILITY map and isRuleApplicableToRole function
  - detectFrameworks function for fastify/express/h3 from package.json
affects: [18-02, 18-03, 18-04, convention-enforcement, convention-runner]

# Tech tracking
tech-stack:
  added: []
  patterns: [pure-data-module for shared constants, 3-tier-signal-chain for file classification, permissive-default for rule applicability]

key-files:
  created:
    - src/conventions/rule-metadata.ts
    - src/classifier/types.ts
    - src/classifier/file-role.ts
    - tests/conventions/rule-metadata.test.ts
    - tests/classifier/file-role.test.ts
    - tests/onboard/detect-frameworks.test.ts
  modified:
    - src/conventions/runner.ts
    - src/enforcement/rule-filter.ts
    - src/onboard/detect.ts

key-decisions:
  - "Pure data module pattern: rule-metadata.ts has zero imports, safe for build isolation"
  - "3-tier signal chain: filename (0.95) > path (0.80-0.85) > fallback (0.50)"
  - "Permissive default: rules not in RULE_ROLE_APPLICABILITY apply to all file roles"
  - "Python rule file naming mismatch deferred: python-* IDs vs non-prefixed .yml files is pre-existing"

patterns-established:
  - "Pure data module: shared constants with zero imports for build isolation"
  - "3-tier signal chain: filename > path > fallback for file classification"
  - "Permissive default: unknown rules apply to all roles (D-23)"

requirements-completed: [CONV-05, CONV-07]

# Metrics
duration: 4min
completed: 2026-03-31
---

# Phase 18 Plan 01: Foundation Modules Summary

**Shared RULE_METADATA module eliminating duplication (D-24), file-role classifier with 3-tier signal chain, and framework detection for fastify/express/h3**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-31T00:06:56Z
- **Completed:** 2026-03-31T00:11:37Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Extracted RULE_METADATA into a pure data module, eliminating duplication between runner.ts and rule-filter.ts (D-24)
- Created file-role classifier with 6 roles and 3-tier signal chain for convention applicability filtering
- Added detectFrameworks function that reads package.json to identify fastify/express/h3
- Full test coverage: 5 metadata tests + 19 classifier tests + 8 framework detection tests (32 new tests)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared RULE_METADATA module and update consumers** - `74a9f32` (feat)
2. **Task 2: Create file-role classifier and framework detection** - `5db7928` (feat)

_Both tasks followed TDD: tests written first (RED confirmed), then implementation (GREEN)._

## Files Created/Modified
- `src/conventions/rule-metadata.ts` - Pure data module: RULE_METADATA, RULE_NAME_TO_ID, RULE_ID_TO_NAME, RuleMetadataEntry
- `src/classifier/types.ts` - FileRole type, FileRoleResult, RULE_ROLE_APPLICABILITY map, isRuleApplicableToRole
- `src/classifier/file-role.ts` - classifyFileRole function with 3-tier signal chain
- `src/conventions/runner.ts` - Removed local RULE_METADATA, now imports from rule-metadata.ts
- `src/enforcement/rule-filter.ts` - Removed duplicated RULE_METADATA, imports and re-exports from rule-metadata.ts
- `src/onboard/detect.ts` - Added detectFrameworks function
- `tests/conventions/rule-metadata.test.ts` - 5 tests for metadata integrity
- `tests/classifier/file-role.test.ts` - 19 tests for file role classification
- `tests/onboard/detect-frameworks.test.ts` - 8 tests for framework detection

## Decisions Made
- Pure data module pattern: rule-metadata.ts has zero imports to maintain build isolation between runner.ts (heavy: execFileSync) and rule-filter.ts (lightweight enforcement)
- 3-tier signal chain priority: filename patterns (0.95 confidence) > path patterns (0.80-0.85) > fallback general (0.50)
- Permissive default for rule applicability: rules not listed in RULE_ROLE_APPLICABILITY apply to ALL file roles (D-23)
- Python rule file naming mismatch noted but not fixed: python-* RULE_METADATA IDs vs non-prefixed .yml filenames in rules/python/ is a pre-existing issue outside this plan's scope

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- vitest `-x` flag not supported in v4.1.0; used `--bail 1` instead (no impact on results)
- Pre-existing test failures in tests/plugin/manifest.test.ts (7 failures) unrelated to this plan's changes; 1265 tests pass

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all modules are fully wired with real data.

## Next Phase Readiness
- rule-metadata.ts ready for import by framework-specific rule modules (18-02, 18-03)
- classifier/types.ts RULE_ROLE_APPLICABILITY ready for integration with convention runner filtering
- detectFrameworks ready for framework-specific rule loading in convention runner
- All 3 foundation modules have comprehensive test coverage

## Self-Check: PASSED

All 7 created files verified on disk. Both task commits (74a9f32, 5db7928) verified in git log.

---
*Phase: 18-semantic-conventions*
*Completed: 2026-03-31*
