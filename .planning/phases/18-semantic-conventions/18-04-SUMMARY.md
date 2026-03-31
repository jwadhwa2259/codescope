---
phase: 18-semantic-conventions
plan: 04
subsystem: conventions
tags: [ast-grep, file-role, framework-detection, hook-budget, readiness-scoring]

requires:
  - phase: 18-01
    provides: "File-role classifier (classifyFileRole), isRuleApplicableToRole, RULE_METADATA, detectFrameworks"
  - phase: 18-02
    provides: "Framework-specific YAML rules (fastify/express/h3), framework-aware runConventionScan signature"
  - phase: 18-03
    provides: "Noise filtering, per-language golden file density, extended countApplicableFiles exclusion"
provides:
  - "Full convention pipeline: detectFrameworks -> runConventionScan -> file-role filtering -> readiness scoring"
  - "CI-style rule validation tests ensuring all 27 rules have unique IDs, metadata, and required fields"
  - "500-token hook budget validation with 10+ convention scenarios"
  - "Pre-commit rule resolution for framework-specific rules"
affects: [convention-enforcement, bootstrap, hooks]

tech-stack:
  added: []
  patterns: ["File-role post-filter on scan results", "Readiness inflation cap"]

key-files:
  created:
    - tests/conventions/rule-validation.test.ts
    - tests/hooks/session-start-budget.test.ts
  modified:
    - src/agents/convention-detector.ts
    - src/conventions/runner.ts
    - src/bootstrap/orchestrator.ts
    - src/enforcement/pre-commit-check.ts
    - tests/conventions/runner.test.ts

key-decisions:
  - "Use relative path from targetDir for file-role classification to avoid test fixture path contamination"
  - "Readiness cap placed after all convention accumulation and before computeReadiness call"

patterns-established:
  - "File-role post-filter: classify files relative to scan target, not CWD, to avoid path artifacts"
  - "CI-style validation tests: scan all rule files at test time to catch drift between .yml files and RULE_METADATA"

requirements-completed: [CONV-03, CONV-04, CONV-05, CONV-06, CONV-07]

duration: 7min
completed: 2026-03-31
---

# Phase 18 Plan 04: Pipeline Integration Summary

**Framework detection wired into convention scanner with file-role filtering (CONV-07), readiness inflation cap (D-25), framework rule resolution in pre-commit hooks, and CI-style rule/budget validation tests**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-31T00:23:20Z
- **Completed:** 2026-03-31T00:30:29Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Convention detector now calls detectFrameworks() and passes detected frameworks to runConventionScan() -- framework rules run automatically on bootstrap
- Runner post-filters all matches by file-role applicability (classifyFileRole + isRuleApplicableToRole) preventing false positives on test/config/deprecated files (CONV-07)
- Orchestrator caps highConfidenceConventions at min(count, totalSourceFiles) to prevent readiness inflation on small projects with many framework rules (D-25)
- Pre-commit resolveRulePath searches frameworks/{fastify,express,h3}/ directories in addition to typescript/ and python/
- CI-style rule validation test (6 test cases) catches ruleId duplicates, metadata mismatches, unknown framework directories, and missing required fields (D-28)
- Hook injection budget test (4 test cases) validates 500-token budget with 12 conventions and P1 danger zone preservation (D-26)
- Full test suite: 1247 passed (10 new tests added), no regressions

## Task Commits

Each task was committed atomically:

1. **Task 1: Integrate framework detection and file-role filtering** - `4424509` (feat)
2. **Task 2: Tests** - `9c7c724` (test)
3. **Task 2: Pre-commit framework rule resolution** - `203ba7c` (feat)

## Files Created/Modified
- `src/agents/convention-detector.ts` - Added detectFrameworks import and usage in pipeline
- `src/conventions/runner.ts` - Added file-role post-filter with classifyFileRole + isRuleApplicableToRole
- `src/bootstrap/orchestrator.ts` - Added highConfidenceConventions cap (D-25)
- `src/enforcement/pre-commit-check.ts` - resolveRulePath checks framework rule directories
- `tests/conventions/runner.test.ts` - Updated test expectation for deprecated file exclusion
- `tests/conventions/rule-validation.test.ts` - CI-style rule file integrity validation (6 tests)
- `tests/hooks/session-start-budget.test.ts` - 500-token budget validation with 10+ conventions (4 tests)

## Decisions Made
- Used relative path from targetDir (not CWD) for file-role classification in the post-filter to avoid test fixture paths being misclassified as "test" role due to containing tests/ in the path
- Placed readiness cap after all convention accumulation (service + top-level) and before computeReadiness call to ensure the cap covers all sources

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed file-role classifier path contamination in post-filter**
- **Found during:** Task 1 (file-role filtering integration)
- **Issue:** ast-grep returns file paths relative to CWD. When scanning fixture projects under tests/fixtures/, classifyFileRole detected the tests/ path segment and classified all fixture files as role="test", filtering out all matches
- **Fix:** Used path.relative(targetDir, path.resolve(match.file)) to compute the project-relative path before classification
- **Files modified:** src/conventions/runner.ts
- **Verification:** All 19 runner.test.ts tests pass
- **Committed in:** 4424509 (Task 1 commit)

**2. [Rule 1 - Bug] Updated runner.test.ts expectation for deprecated file filtering**
- **Found during:** Task 1 (file-role filtering integration)
- **Issue:** Test expected legacy.ts (classified as "deprecated" by filename) to appear in detect-default-export matches, but the new file-role filter correctly excludes deprecated files from convention detection
- **Fix:** Updated test assertion from >= 2 to >= 1 matches in bad-patterns+mixed files
- **Files modified:** tests/conventions/runner.test.ts
- **Verification:** All 19 runner.test.ts tests pass
- **Committed in:** 4424509 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 bugs -- both necessary for correctness)
**Impact on plan:** Both fixes necessary. The path contamination fix ensures file-role filtering works correctly in both production and test contexts. The test update aligns expectations with the new filtering behavior.

## Issues Encountered
None beyond the auto-fixed deviations.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all features fully wired.

## Next Phase Readiness
- Phase 18 semantic conventions complete: all 4 plans executed
- Convention pipeline fully wired: detectFrameworks -> framework rule scanning -> file-role filtering -> readiness scoring
- Pre-commit hooks can enforce framework-specific conventions
- Rule integrity validated by CI-style tests
- Hook injection budget validated with realistic convention volumes
- Ready for Phase 19 or next milestone work

---
*Phase: 18-semantic-conventions*
*Completed: 2026-03-31*
