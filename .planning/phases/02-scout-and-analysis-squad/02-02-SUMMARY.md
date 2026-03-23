---
phase: 02-scout-and-analysis-squad
plan: 02
subsystem: conventions
tags: [ast-grep, convention-detection, yaml-rules, golden-files, adoption-percentage]

# Dependency graph
requires:
  - phase: 01-plugin-foundation-and-infrastructure
    provides: ESM project setup, vitest test infrastructure, TypeScript config
provides:
  - ast-grep YAML rule library (15 TS/JS + 3 Python rules)
  - Convention runner with adoption calculation and conflict detection
  - Golden file ranking by convention density
  - Fixture project for accuracy validation
affects: [02-04-convention-detector-agent, 03-bootstrap-orchestration, phase-04-orient]

# Tech tracking
tech-stack:
  added: [ast-grep CLI (sg)]
  patterns: [per-rule scanning with JSON output, file-count ratio adoption, competing pair conflict detection]

key-files:
  created:
    - src/conventions/types.ts
    - src/conventions/runner.ts
    - src/conventions/golden-files.ts
    - src/conventions/rules/typescript/ (15 YAML rules)
    - src/conventions/rules/python/ (3 YAML rules)
    - tests/conventions/runner.test.ts
    - tests/conventions/golden-files.test.ts
    - tests/fixtures/sample-project/ (5 TypeScript fixture files)
  modified: []

key-decisions:
  - "ast-grep --rule takes single file not directory; runner iterates per-rule file for scan aggregation"
  - "Rule ID extracted from filename (prefer-named-exports.yml -> prefer-named-exports) for simplicity"
  - "custom-error-class rule uses extends_clause > identifier path (not class_heritage > identifier directly)"

patterns-established:
  - "Per-rule scanning: iterate .yml files individually since sg scan --rule takes single file"
  - "Convention confidence levels: HIGH-CONF (>=80% + >=10 files), MEDIUM-CONF (>=50%), LOW-CONF (<50%)"
  - "Conflict detection threshold: both competing patterns must exceed 20% adoption"
  - "Golden file density: conventions followed / conventions applicable, sorted descending"

requirements-completed: [BOOT-05, BOOT-06, BOOT-10]

# Metrics
duration: 7min
completed: 2026-03-23
---

# Phase 02 Plan 02: Convention Detection Infrastructure Summary

**ast-grep YAML rule library (15 TS/JS + 3 Python), convention runner with adoption/conflict/golden-file analysis, validated against fixture project with 0% false positive rate**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-23T14:10:31Z
- **Completed:** 2026-03-23T14:17:33Z
- **Tasks:** 2
- **Files modified:** 32

## Accomplishments
- Created 15 TypeScript/JavaScript ast-grep YAML rules covering exports, imports, async patterns, error handling, types, and component patterns
- Created 3 Python ast-grep YAML rules for type hints, docstrings, and class inheritance
- Built convention runner that executes per-rule scans, calculates adoption percentages, detects conflicts between competing patterns, and ranks golden files by convention density
- Created fixture project with 5 TypeScript files (good-patterns, bad-patterns, mixed) providing ground truth for accuracy testing
- All 20 tests pass including false positive validation against fixture project (BOOT-06 requirement)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create fixture project and ast-grep YAML rule library** - `59eacc1` (feat)
2. **Task 2 RED: Failing tests for convention runner and golden files** - `d2bf283` (test)
3. **Task 2 GREEN: Implement convention runner, adoption calculator, conflict detector, golden files** - `c7983ee` (feat)

## Files Created/Modified
- `src/conventions/types.ts` - Type definitions: ConventionResult, RuleMatch, ConflictInfo, CompetingPair, GoldenFileEntry, ConventionScanResult
- `src/conventions/runner.ts` - ast-grep scan execution, adoption calculation, conflict detection, evidence building
- `src/conventions/golden-files.ts` - Golden file ranking by convention density
- `src/conventions/rules/typescript/*.yml` - 15 ast-grep YAML rules for TS/JS convention detection
- `src/conventions/rules/python/*.yml` - 3 ast-grep YAML rules for Python convention detection
- `tests/conventions/runner.test.ts` - 16 tests for runner, adoption, conflicts, evidence, end-to-end scan
- `tests/conventions/golden-files.test.ts` - 4 tests for golden file ranking
- `tests/fixtures/sample-project/` - Fixture project with known conventions for accuracy testing

## Decisions Made
- ast-grep `--rule` flag takes a single rule file, not a directory. Runner iterates all `.yml` files individually and aggregates results. This is a platform limitation, not a design choice.
- Rule ID extracted from YAML filename for simplicity and consistency (e.g., `prefer-named-exports.yml` -> ruleId `prefer-named-exports`)
- `custom-error-class` rule fixed to use `extends_clause > identifier` path instead of direct `class_heritage > identifier` -- ast-grep AST structure requires the intermediate node
- `throw-string-literal` rule correctly uses `throw_statement > string` kind matching rather than pattern matching, which properly excludes binary expressions like `"msg" + err`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed prefer-named-exports rule syntax**
- **Found during:** Task 1 (Rule validation)
- **Issue:** Rule used `kind: default` which is not a valid ast-grep node kind
- **Fix:** Changed to `not: pattern: "export default $EXPR"` approach
- **Files modified:** `src/conventions/rules/typescript/prefer-named-exports.yml`
- **Verification:** Rule now correctly matches 19 named exports in fixture project
- **Committed in:** 59eacc1

**2. [Rule 1 - Bug] Fixed custom-error-class rule AST path**
- **Found during:** Task 1 (Rule validation)
- **Issue:** Rule used `class_heritage > identifier` but ast-grep requires `class_heritage > extends_clause > identifier`
- **Fix:** Added intermediate `extends_clause` node in the rule hierarchy
- **Files modified:** `src/conventions/rules/typescript/custom-error-class.yml`
- **Verification:** Rule correctly matches UserError extends Error in fixture
- **Committed in:** 59eacc1

**3. [Rule 3 - Blocking] Changed scan strategy from directory to per-file**
- **Found during:** Task 1 (Rule validation)
- **Issue:** `sg scan --rule <directory>` fails with "Is a directory" error -- only accepts single rule files
- **Fix:** Runner iterates each .yml file individually with `sg scan --rule <file>` and aggregates
- **Files modified:** `src/conventions/runner.ts`
- **Verification:** All 15 TS rules scan successfully, 71 total matches
- **Committed in:** c7983ee

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required. ast-grep CLI (sg) must be installed but is already present.

## Known Stubs
None - all functionality is fully implemented and wired.

## Next Phase Readiness
- Convention detection infrastructure complete and tested
- Rule library ready for Convention Detector agent (Plan 04) to use via `runConventionScan()`
- Fixture project available for ongoing accuracy validation
- Types exported for downstream consumers (ConventionScanResult, ConventionResult, GoldenFileEntry)

## Self-Check: PASSED

- All 6 key files exist on disk
- 15 TypeScript YAML rules confirmed
- 3 Python YAML rules confirmed
- All 3 commit hashes found in git log (59eacc1, d2bf283, c7983ee)

---
*Phase: 02-scout-and-analysis-squad*
*Completed: 2026-03-23*
