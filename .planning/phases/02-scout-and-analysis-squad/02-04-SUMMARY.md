---
phase: 02-scout-and-analysis-squad
plan: 04
subsystem: agents
tags: [risk-analyzer, convention-detector, learning-synthesizer, danger-zones, conventions, golden-files, learnings, graph-analytics, ast-grep]

# Dependency graph
requires:
  - phase: 02-scout-and-analysis-squad
    plan: 01
    provides: "buildGraph, loadGraphFromSQLite, computeCentrality, runCommunityDetection, blastRadius, computeDangerZones"
  - phase: 02-scout-and-analysis-squad
    plan: 02
    provides: "runConventionScan, rankGoldenFiles, ConventionScanResult types"
provides:
  - "Risk Analyzer agent (runRiskAnalyzer) producing danger-zones.md with centrality ranking, cross-boundary deps, blast radius examples"
  - "Convention Detector agent (runConventionDetector) producing conventions.md with adoption/evidence/conflicts and golden-files.md"
  - "Learning Synthesizer agent (runLearningSynthesizer) producing empty learnings.md with schema structure"
  - "RiskAnalyzerOptions, RiskAnalyzerResult, ConventionDetectorOptions, ConventionDetectorResult, LearningSynthesizerOptions, LearningSynthesizerResult types"
affects: [03-bootstrap-orchestration, 03-mcp-tools, 04-orient]

# Tech tracking
tech-stack:
  added: []
  patterns: [agent module pattern with Options/Result/async-function/markdown-artifact, TDD red-green for agent modules, graceful degradation on tool unavailability]

key-files:
  created:
    - src/agents/risk-analyzer.ts
    - src/agents/convention-detector.ts
    - src/agents/learning-synthesizer.ts
    - tests/agents/risk-analyzer.test.ts
    - tests/agents/convention-detector.test.ts
    - tests/agents/learning-synthesizer.test.ts
  modified: []

key-decisions:
  - "CODESCOPE_GRAMMAR_DIR env var required for parser pool initialization in tests (established pattern from Plan 01)"
  - "ConventionScanResult imported from types.ts not runner.ts (runner.ts does not re-export the type)"
  - "Risk analyzer checks edgesCreated >= 5 threshold for insufficient edges empty state"

patterns-established:
  - "Agent module pattern: Options interface + Result interface + async function + markdown generation helper"
  - "Markdown artifact generation: YAML frontmatter -> H1 title -> sections -> tables following UI-SPEC contract"
  - "Graceful degradation: catch errors from infrastructure modules, produce partial/error-state artifacts, continue"

requirements-completed: [BOOT-07, BOOT-08, BOOT-09, BOOT-10]

# Metrics
duration: 7min
completed: 2026-03-23
---

# Phase 02 Plan 04: Risk Analyzer, Convention Detector, and Learning Synthesizer Agents Summary

**Three agent modules composing Plan 01 graph analytics and Plan 02 convention detection into danger-zones.md, conventions.md, golden-files.md, and learnings.md artifacts matching UI-SPEC copywriting contracts**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-23T14:28:22Z
- **Completed:** 2026-03-23T14:35:38Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Risk Analyzer agent builds the knowledge graph from source code, runs centrality + community detection + blast radius analytics, and produces danger-zones.md with High-Centrality Nodes table, Cross-Boundary Dependencies, Blast Radius Examples, and Risk Summary sections
- Convention Detector agent runs ast-grep convention scan, produces conventions.md with adoption percentages, confidence levels, evidence chains (3 file:line refs per convention), conflict entries with [CONFLICT] prefix, and golden-files.md ranking files by convention density
- Learning Synthesizer agent creates learnings.md with header/schema structure and empty entries section per D-24
- All three agents follow the established agent module pattern: Options interface + Result interface + async function + markdown artifact output
- Graceful degradation: Convention Detector handles ast-grep unavailability and missing rules directories without crashing

## Task Commits

Each task was committed atomically:

1. **Task 1: Risk Analyzer agent** (TDD)
   - `0fecfd5` test(02-04): add failing tests for risk analyzer agent (RED)
   - `eca1163` feat(02-04): implement risk analyzer agent with danger-zones.md output (GREEN)
2. **Task 2: Convention Detector + Learning Synthesizer agents** (TDD)
   - `9ba9622` test(02-04): add failing tests for convention detector and learning synthesizer (RED)
   - `e61b8d2` feat(02-04): implement convention detector and learning synthesizer agents (GREEN)

## Files Created/Modified
- `src/agents/risk-analyzer.ts` - Risk Analyzer agent: builds graph, runs analytics, produces danger-zones.md
- `src/agents/convention-detector.ts` - Convention Detector agent: runs convention scan, produces conventions.md + golden-files.md
- `src/agents/learning-synthesizer.ts` - Learning Synthesizer agent: creates empty learnings.md with schema
- `tests/agents/risk-analyzer.test.ts` - 9 test cases for Risk Analyzer (danger-zones.md format, frontmatter, sections, ranking, stats, empty state)
- `tests/agents/convention-detector.test.ts` - 8 test cases for Convention Detector (conventions.md format, frontmatter, adoption, evidence, conflicts, golden-files.md, error handling, stats)
- `tests/agents/learning-synthesizer.test.ts` - 5 test cases for Learning Synthesizer (learnings.md format, schema, entries, frontmatter, result)

## Decisions Made
- **CODESCOPE_GRAMMAR_DIR env var for tests:** Test infrastructure must set `process.env.CODESCOPE_GRAMMAR_DIR = grammarDir` in `beforeAll` for parser pool to find WASM grammar files. This follows the established pattern from Plan 01 builder tests.
- **ConventionScanResult import source:** `ConventionScanResult` must be imported from `../conventions/types.js`, not `../conventions/runner.js`. The runner imports the type internally but does not re-export it.
- **Insufficient edges threshold:** Risk Analyzer uses `edgesCreated >= 5` as the threshold for determining if the graph has sufficient data for danger zone analysis. Below this threshold, it outputs the empty state message.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Missing CODESCOPE_GRAMMAR_DIR in risk analyzer tests**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** `nodesCreated` was 0 because ParserPool could not find WASM grammar files without the env var, causing all file parses to return null
- **Fix:** Added `beforeAll(() => { process.env.CODESCOPE_GRAMMAR_DIR = grammarDir; })` and `describe.skipIf(!grammarsExist)` to match established pattern from graph builder tests
- **Files modified:** tests/agents/risk-analyzer.test.ts
- **Committed in:** eca1163

**2. [Rule 1 - Bug] Wrong import path for ConventionScanResult**
- **Found during:** Task 2 (GREEN phase, TypeScript compilation)
- **Issue:** `ConventionScanResult` was imported from `../conventions/runner.js` which does not export it; it's defined in `../conventions/types.js`
- **Fix:** Changed import to `../conventions/types.js`
- **Files modified:** src/agents/convention-detector.ts
- **Committed in:** e61b8d2

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes were necessary for correctness. The grammar dir fix ensures integration tests actually exercise the full pipeline. The import fix ensures TypeScript compiles cleanly. No scope creep.

## Issues Encountered
None beyond the deviations documented above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functions are fully implemented with no placeholder data.

## Next Phase Readiness
- All 5 agent modules complete: Scout, Researcher, Risk Analyzer, Convention Detector, Learning Synthesizer
- All agents follow the same callable TypeScript pattern (Options + Result + async function) ready for Phase 3 orchestration
- 6 markdown artifacts match their UI-SPEC copywriting contracts: service-manifest.md, overview.md, danger-zones.md, conventions.md, golden-files.md, learnings.md
- Phase 3 bootstrap orchestration can import and invoke all agents directly
- 233 total tests pass, TypeScript compiles cleanly

## Self-Check: PASSED

- All 6 created files exist on disk
- All 4 commit hashes verified in git history (0fecfd5, eca1163, 9ba9622, e61b8d2)
- All 3 agent modules export required types and functions (3 exports each)
- 233 total tests pass, TypeScript compiles cleanly

---
*Phase: 02-scout-and-analysis-squad*
*Completed: 2026-03-23*
