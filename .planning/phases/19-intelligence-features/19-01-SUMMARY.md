---
phase: 19-intelligence-features
plan: 01
subsystem: artifacts
tags: [similarity-scoring, convention-violations, reference-index, injection-artifacts]

# Dependency graph
requires:
  - phase: 18-semantic-conventions
    provides: file-role classifier, golden-files noise filter, convention parser
provides:
  - buildReferenceIndex with 4-signal weighted similarity (convention density, community proximity, directory proximity, shared imports)
  - buildViolationIndex with HIGH-CONF convention deviation detection
  - Extended generateInjectionArtifacts producing 5 JSON files (up from 3)
  - Extended readAllArtifacts loading references and violations for hooks
affects: [19-02 (hook injection for reference suggestions), 19-03 (eval scorecard)]

# Tech tracking
tech-stack:
  added: []
  patterns: [4-signal weighted similarity scoring, sparse violation index]

key-files:
  created:
    - src/artifacts/reference-index.ts
    - src/artifacts/violation-index.ts
    - tests/artifacts/reference-index.test.ts
    - tests/artifacts/violation-index.test.ts
  modified:
    - src/artifacts/types.ts
    - src/artifacts/generator.ts
    - src/hooks/lib/types.ts
    - src/hooks/lib/artifact-reader.ts
    - tests/artifacts/generator.test.ts

key-decisions:
  - "Convention density similarity uses 1.0 - abs(densityA - densityB) for comparing how similarly two files follow conventions"
  - "Directory proximity uses shared prefix segments from root / max(segments) for path-based similarity"
  - "Violation index produces file-level entries (line=0) for convention deviations since conventions.md evidence is file-scoped"

patterns-established:
  - "4-signal similarity: convention density (40%), community proximity (25%), directory proximity (20%), shared imports (15%)"
  - "Sparse violation index: only files with violations appear in the map"
  - "Build isolation duplicate types: new artifact types duplicated in hooks/lib/types.ts"

requirements-completed: [REF-01, REF-03, VALID-01, VALID-02, VALID-03, VALID-04]

# Metrics
duration: 7min
completed: 2026-03-31
---

# Phase 19 Plan 01: Artifact Index Builders Summary

**Pre-computed reference index with 4-signal similarity and violation index with HIGH-CONF convention deviation detection, integrated into the artifact generation pipeline**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-31T02:27:37Z
- **Completed:** 2026-03-31T02:34:14Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- Built reference index builder with 4-signal weighted similarity scoring that scopes matches by file role, excludes noise files, and prevents self-references
- Built violation index builder that filters to HIGH-CONF conventions only, produces sparse per-file deviation entries, and checks import path validity
- Extended generator to produce 5 JSON artifact files (up from 3) and artifact reader to load all 5 with null fallback
- Full build isolation preserved: hooks never import from src/graph/ or src/artifacts/

## Task Commits

Each task was committed atomically:

1. **Task 1: Define types and build reference-index.ts + violation-index.ts** - `e9be65e` (feat)
2. **Task 2: Integrate builders into generator.ts and extend artifact-reader.ts** - `c906415` (feat)

## Files Created/Modified
- `src/artifacts/types.ts` - Added ReferenceIndex, ReferenceFileEntry, ViolationIndex, ViolationEntry interfaces
- `src/artifacts/reference-index.ts` - New builder: 4-signal weighted similarity for per-file reference suggestions
- `src/artifacts/violation-index.ts` - New builder: HIGH-CONF convention deviation detection
- `src/artifacts/generator.ts` - Extended to produce 5 artifact files with isolated try/catch per builder
- `src/hooks/lib/types.ts` - Duplicated new artifact types for build isolation
- `src/hooks/lib/artifact-reader.ts` - Extended to read references-index.json and convention-violations.json
- `tests/artifacts/reference-index.test.ts` - 6 tests for reference index builder
- `tests/artifacts/violation-index.test.ts` - 7 tests for violation index builder
- `tests/artifacts/generator.test.ts` - Added 2 tests for new artifact file generation

## Decisions Made
- Convention density similarity uses `1.0 - abs(densityA - densityB)` for comparing how similarly two files follow conventions, rather than raw density values
- Directory proximity uses shared prefix segments from root / max(segments) for path-based similarity, counting matching segments from the start
- Violation index produces file-level entries (line=0) for convention deviations since conventions.md evidence is file-scoped not line-scoped
- For "general" role files (low classifier confidence), reference matching compares against ALL non-noise files rather than just other "general" files

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all modules are fully wired with real data sources.

## Next Phase Readiness
- Reference index and violation index are ready for hook injection (Plan 02: PreToolUse reference suggestion at P2.5, PostToolUse validation warnings at P1)
- Both indexes are available via readAllArtifacts() for any hook script to consume
- Violation index data feeds directly into the deterministic scorecard (Plan 03: eval skill)

## Self-Check: PASSED

All 9 files verified present. Both commit hashes (e9be65e, c906415) found in git log.

---
*Phase: 19-intelligence-features*
*Completed: 2026-03-31*
