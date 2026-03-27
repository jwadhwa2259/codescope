---
phase: 07-learning-system-and-settings
plan: 01
subsystem: learning
tags: [markdown-parser, confidence-decay, contradiction-detection, cap-enforcement, global-enrichment]

# Dependency graph
requires:
  - phase: 01-plugin-foundation
    provides: "utils/paths.ts getCodescopePath, config/defaults.ts decay config"
  - phase: 02-scout-and-analysis
    provides: "agents/learning-synthesizer.ts learnings.md schema"
  - phase: 06-eval-user-gate-and-debug
    provides: "eval/ignore-filter.ts IGNORE/TODO entry format, eval/types.ts IgnorePattern"
provides:
  - "LearningEntry, LearningStatus, LearningType type system for all learning modules"
  - "parseLearnings/serializeLearnings for lossless learnings.md roundtrip"
  - "computeExpiry/isExpired/runDecay for confidence decay engine"
  - "enforceCapWithEviction for 50-learning cap enforcement"
  - "checkContradictions with heuristic + optional LLM contradiction detection"
  - "loadLearnings/saveLearnings/addLearnings orchestrating full learning lifecycle"
  - "detectRepeatedIgnores/buildEnrichmentUpdates for 3-strike global enrichment"
affects: [07-02, 07-03, 07-04]

# Tech tracking
tech-stack:
  added: []
  patterns: ["pure-function learning modules with no side effects except manager.ts", "UTC-only date arithmetic for timezone-safe expiry", "heuristic antonym-pair contradiction detection"]

key-files:
  created:
    - src/learning/types.ts
    - src/learning/parser.ts
    - src/learning/decay.ts
    - src/learning/cap.ts
    - src/learning/contradiction.ts
    - src/learning/manager.ts
    - src/learning/global-enrichment.ts
    - tests/learning/parser.test.ts
    - tests/learning/decay.test.ts
    - tests/learning/cap.test.ts
    - tests/learning/contradiction.test.ts
    - tests/learning/manager.test.ts
    - tests/learning/global-enrichment.test.ts
  modified: []

key-decisions:
  - "UTC-only date arithmetic in computeExpiry to avoid timezone-dependent expiry dates"
  - "Code block stripping before entry parsing to avoid false positives from Schema section examples"
  - "Heuristic contradiction uses antonym pairs (use/avoid, prefer/avoid, always/never) with shared-subject overlap check"
  - "CONTRADICTED entries past expiry are also marked EXPIRED by runDecay"

patterns-established:
  - "Pure-function learning modules: parser, decay, cap, contradiction, global-enrichment have zero side effects"
  - "Manager module orchestrates disk I/O and pipeline flow, keeping pure functions testable"
  - "LLM callback injection: checkContradictions accepts optional llmCallback for semantic comparison without hard LLM dependency"

requirements-completed: [LRNG-03, LRNG-04, LRNG-05]

# Metrics
duration: 8min
completed: 2026-03-27
---

# Phase 7 Plan 1: Learning Lifecycle Engine Summary

**Pure-function learning lifecycle with markdown parser (lossless roundtrip), 90/180-day confidence decay, heuristic+LLM contradiction detection, 50-entry cap with oldest-expired eviction, and 3-strike global enrichment**

## Performance

- **Duration:** 8 min
- **Started:** 2026-03-27T17:43:26Z
- **Completed:** 2026-03-27T17:51:30Z
- **Tasks:** 2
- **Files modified:** 13 (7 source + 6 test)

## Accomplishments
- Complete learning type system (LearningEntry, LearningStatus, LearningType, DecayConfig, CapResult, ContradictionResult, GlobalEnrichmentEntry)
- Markdown parser with lossless roundtrip: parse -> serialize -> parse produces identical entries, preserving frontmatter, Schema section, and additional sections
- Confidence decay engine: gotchas 90d, decisions/patterns 180d, IGNORE/TODO never expire, VERIFIED persists indefinitely
- Cap enforcer: 50-entry limit with eviction of oldest EXPIRED entry first, skip-and-report when nothing to evict
- Contradiction detector: heuristic antonym-pair matching (use/avoid, prefer/avoid, always/never, etc.) + optional LLM callback for semantic comparison
- Learning manager: orchestrates full addLearnings pipeline (load -> decay -> contradiction -> cap -> save)
- Global enrichment: 3-strike pattern detection for auto-promoting ignore patterns to global memory with deduplication
- 47 tests passing across 6 test files, 745 total tests passing with 0 regressions

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: Learning types, parser, decay engine, and cap enforcer**
   - `c72ae3c` (test: failing tests for parser, decay, cap)
   - `08f5312` (feat: implement parser, decay, cap)
2. **Task 2: Contradiction detector, learning manager, and global enrichment**
   - `5000736` (test: failing tests for contradiction, manager, global enrichment)
   - `e393c0d` (feat: implement contradiction, manager, global enrichment)

## Files Created/Modified
- `src/learning/types.ts` - Shared type definitions: LearningEntry, LearningStatus, LearningType, DecayConfig, CapResult, ContradictionResult, GlobalEnrichmentEntry
- `src/learning/parser.ts` - Parse and serialize learnings.md with lossless frontmatter and section roundtrip
- `src/learning/decay.ts` - UTC date arithmetic for confidence expiry, isExpired at day granularity, runDecay status transitions
- `src/learning/cap.ts` - 50-learning cap with oldest-expired-first eviction strategy
- `src/learning/contradiction.ts` - Heuristic antonym-pair detection + optional LLM semantic comparison
- `src/learning/manager.ts` - High-level orchestrator: loadLearnings, saveLearnings, addLearnings pipeline
- `src/learning/global-enrichment.ts` - 3-strike repeated ignore pattern detection with deduplication
- `tests/learning/parser.test.ts` - 8 tests: empty input, valid markdown, IGNORE/TODO/CONTRADICTED, roundtrip
- `tests/learning/decay.test.ts` - 11 tests: computeExpiry per type, isExpired, runDecay status transitions
- `tests/learning/cap.test.ts` - 6 tests: countActiveEntries, under cap, eviction, skip, multiple, earliest
- `tests/learning/contradiction.test.ts` - 6 tests: empty, heuristic, LLM callback, unrelated, prompt, result shape
- `tests/learning/manager.test.ts` - 6 tests: load, load-missing, save, full flow, contradiction, cap
- `tests/learning/global-enrichment.test.ts` - 6 tests: 3-strike, under threshold, filter non-ignore, enrichment, dedup, partial

## Decisions Made
- **UTC-only date arithmetic:** computeExpiry uses Date.UTC and getUTC* methods to avoid local timezone offsets that caused off-by-one errors in test environments
- **Code block stripping in parser:** Regex strips ``` blocks before scanning for ### entries to prevent false positives from the Schema section's example entry format
- **Heuristic antonym pairs with shared-subject check:** Contradiction detection requires both an antonym match AND at least 1 shared non-stop-word to avoid false positives on unrelated entries
- **CONTRADICTED entries decay to EXPIRED:** runDecay transitions both UNVERIFIED and CONTRADICTED entries past expiry to EXPIRED, but never touches IGNORE, TODO, or VERIFIED

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed timezone-dependent date arithmetic in computeExpiry**
- **Found during:** Task 1 (decay engine implementation)
- **Issue:** `new Date("2026-01-01").setDate(getDate() + 90)` computed in local timezone, producing off-by-one errors
- **Fix:** Changed to UTC-only arithmetic using `Date.UTC()` and `getUTC*` methods
- **Files modified:** src/learning/decay.ts
- **Verification:** computeExpiry("gotcha", new Date("2026-01-01"), {gotchas: 90, decisions: 180}) returns "2026-04-01" correctly

**2. [Rule 1 - Bug] Fixed parser extracting entries from code blocks**
- **Found during:** Task 1 (parser implementation)
- **Issue:** The `### {Learning Title}` inside the Schema section's ``` code block was parsed as an actual entry, causing entry count mismatch
- **Fix:** Added regex stripping of code blocks before scanning for ### headings
- **Files modified:** src/learning/parser.ts
- **Verification:** parseLearnings(VALID_LEARNINGS) correctly returns 2 entries, not 3

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the auto-fixed bugs above.

## Known Stubs
None - all modules are fully functional with real implementations wired.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Learning lifecycle engine complete, providing pure-function building blocks for all Phase 7 plans
- Plan 02 (review-learnings skill) can import from src/learning/parser.ts and src/learning/manager.ts
- Plan 03 (settings skill) can import DecayConfig and other types from src/learning/types.ts
- Plan 04 (orient pipeline integration) can use addLearnings from src/learning/manager.ts

## Self-Check: PASSED

- All 14 files verified present on disk
- All 4 task commits verified in git log (c72ae3c, 08f5312, 5000736, e393c0d)
- 47/47 learning module tests passing
- 745/745 total tests passing, 0 regressions

---
*Phase: 07-learning-system-and-settings*
*Completed: 2026-03-27*
