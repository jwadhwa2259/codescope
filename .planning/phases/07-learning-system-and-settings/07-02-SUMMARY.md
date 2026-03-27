---
phase: 07-learning-system-and-settings
plan: 02
subsystem: learning
tags: [learning-synthesizer, global-memory, llm-extraction, cli-entry-point, stderr-dispatch]

# Dependency graph
requires:
  - phase: 07-learning-system-and-settings
    provides: "Plan 01: learning types, parser, decay, cap, contradiction, manager, global-enrichment modules"
  - phase: 02-scout-and-analysis
    provides: "agents/learning-synthesizer.ts empty-init shell with Options+Result pattern"
  - phase: 01-plugin-foundation
    provides: "config/loader.ts, utils/paths.ts, onboard/global-memory.ts"
  - phase: 06-eval-user-gate-and-debug
    provides: "eval/run-eval.ts CLI pattern with stderr dispatch protocol"
provides:
  - "LLM-driven learning synthesizer with buildSynthesizerPrompt and dispatchSynthesizer callback"
  - "Extended GlobalMemory interface with techStack, ignorePatterns, crossProjectGotchas sections"
  - "addGlobalEnrichment convenience function for global memory enrichment"
  - "CLI entry point run-learning-capture.ts with stderr dispatch_learning protocol"
  - "generateEmptyLearningsMarkdown backward-compat export"
affects: [07-04]

# Tech tracking
tech-stack:
  added: []
  patterns: ["stderr dispatch protocol for CLI-to-skill-body LLM delegation", "GlobalMemory superset extending GlobalPreferences with new sections", "graceful artifact loading with (not available) fallback"]

key-files:
  created:
    - src/learning/run-learning-capture.ts
    - tests/learning/run-learning-capture.test.ts
  modified:
    - src/agents/learning-synthesizer.ts
    - src/onboard/global-memory.ts
    - tests/agents/learning-synthesizer.test.ts
    - tests/onboard/global-memory.test.ts

key-decisions:
  - "Backward-compat: runLearningSynthesizer falls back to empty-init when dispatchSynthesizer not provided"
  - "GlobalMemory is a superset interface wrapping GlobalPreferences with new array sections"
  - "CLI uses parseArgs + runLearningCapture exported functions for testability without spawning process"
  - "Global enrichment in synthesizer is best-effort (try/catch) to not fail the pipeline"

patterns-established:
  - "dispatchSynthesizer callback injection: CLI stubs with stderr dispatch, skill body provides real LLM"
  - "Bullet section parsing with placeholder detection: (None yet.) skipped as empty"
  - "Testable CLI entry point: exports parseArgs and main logic function, guarded main() only runs when executed directly"

requirements-completed: [LRNG-01, LRNG-02, LRNG-06, LRNG-07, LRNG-08]

# Metrics
duration: 6min
completed: 2026-03-27
---

# Phase 7 Plan 2: Learning Synthesizer Upgrade, Global Memory Extension, and CLI Entry Point Summary

**LLM-driven learning synthesizer with dispatchSynthesizer callback, extended global memory with 3 new sections (tech stack, ignore patterns, cross-project gotchas), and CLI entry point with stderr dispatch_learning protocol**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-27T17:56:57Z
- **Completed:** 2026-03-27T18:03:24Z
- **Tasks:** 2
- **Files modified:** 6 (3 source + 3 test)

## Accomplishments
- Learning synthesizer upgraded from empty-init stub to real LLM-driven extraction with buildSynthesizerPrompt, 5-entry cap per D-03, UNVERIFIED status per D-04, computeExpiry integration per D-09
- Global memory extended with GlobalMemory interface (techStack, ignorePatterns, crossProjectGotchas), addGlobalEnrichment convenience function with deduplication, backward-compatible old-format parsing
- CLI entry point run-learning-capture.ts following run-eval.ts pattern with stderr dispatch_learning protocol, config.learning.auto_capture check, graceful missing artifact handling
- 33 tests passing across 3 test files, 156 total tests passing in related suites with 0 regressions

## Task Commits

Each task was committed atomically (TDD: test -> feat):

1. **Task 1: Upgrade learning synthesizer and extend global memory**
   - `3dc8f4a` (test: failing tests for learning synthesizer and global memory)
   - `741d803` (feat: implement learning synthesizer LLM extraction and extended global memory)
2. **Task 2: Learning capture CLI entry point**
   - `5910ac7` (test: failing tests for learning capture CLI entry point)
   - `a1bd094` (feat: implement learning capture CLI entry point)

## Files Created/Modified
- `src/agents/learning-synthesizer.ts` - LLM-driven extraction with buildSynthesizerPrompt, dispatchSynthesizer callback, 5-entry cap, computeExpiry, global enrichment integration
- `src/onboard/global-memory.ts` - Extended with GlobalMemory interface, addGlobalEnrichment, bullet section parsing, backward compat with old format
- `src/learning/run-learning-capture.ts` - CLI entry point with parseArgs, runLearningCapture, stderr dispatch_learning protocol, auto_capture config check
- `tests/agents/learning-synthesizer.test.ts` - 12 tests: empty-init backward compat (4), LLM extraction (7), generateEmptyLearningsMarkdown (1)
- `tests/onboard/global-memory.test.ts` - 16 tests: readGlobalMemory (6), writeGlobalMemory (7), addGlobalEnrichment (3)
- `tests/learning/run-learning-capture.test.ts` - 5 tests: parseArgs (1), runLearningCapture (4)

## Decisions Made
- **Backward-compatible empty-init mode:** When dispatchSynthesizer is not provided (undefined), runLearningSynthesizer falls back to the original empty-init behavior creating learnings.md with schema structure. This preserves bootstrap compatibility.
- **GlobalMemory wraps GlobalPreferences:** Rather than changing the GlobalPreferences interface, GlobalMemory is a superset type with preferences as a nested field plus new array sections. This is a clean breaking change since no external callers existed.
- **Best-effort global enrichment:** The global enrichment step in runLearningSynthesizer is wrapped in try/catch -- if it fails (e.g., permissions, missing global dir), the learning capture still succeeds. Pipeline reliability over completeness.
- **Testable CLI pattern:** Exported parseArgs and runLearningCapture functions for direct unit testing without spawning a child process. The main() function only runs when the file is executed directly (detected via process.argv[1]).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None - the dispatchSynthesizer stub in run-learning-capture.ts is the intended design pattern (skill body replaces it with real LLM dispatch, matching run-eval.ts established pattern).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Learning synthesizer and global memory ready for Plan 04 (orient pipeline integration, Step 7)
- CLI entry point ready for skill body to call with stderr dispatch protocol
- Global memory extension available for Plan 03 (review-learnings skill) to read enriched sections

## Self-Check: PASSED

- All 6 files verified present on disk
- All 4 task commits verified in git log (3dc8f4a, 741d803, 5910ac7, a1bd094)
- 33/33 plan tests passing
- 156/156 total tests passing in related suites, 0 regressions

---
*Phase: 07-learning-system-and-settings*
*Completed: 2026-03-27*
