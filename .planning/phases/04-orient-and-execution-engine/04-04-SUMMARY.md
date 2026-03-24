---
phase: 04-orient-and-execution-engine
plan: 04
subsystem: orient
tags: [research, planner, validation, sub-agent-prompt, context7, wave-scheduler, auto-fix]

requires:
  - phase: 04-orient-and-execution-engine
    provides: "Orient shared types (ScopeContract, AnalysisResult, ResearchOutput, ExecutionPlan, AgentAssignment, ValidationCheck, etc.) from Plan 01"
  - phase: 04-orient-and-execution-engine
    provides: "Wave scheduler (buildWaveSchedule, validateFileOverlap, validateDependencyOrdering, validateScopeCoverage) from Plan 02"
provides:
  - "Research module: extractResearchTopics, rankTopics, buildResearchPrompt, parseResearchOutput, writeResearchArtifact, runResearch"
  - "Planner module: buildPlannerPrompt, parsePlanOutput, writePlanArtifact, runPlanner"
  - "Validation module: validatePlan, autoFixPlan, writeValidationSection"
affects: [04-06-PLAN]

tech-stack:
  added: []
  patterns:
    - "Impact-ranked progressive research: graph centrality * file count for topic scoring"
    - "Sub-agent prompt construction: structured markdown with task, scope, topics, time budget, output format"
    - "Plan markdown parsing: regex-based extraction of ### Agent sections with field parsing"
    - "Mechanical auto-fix via wave reschedule: buildWaveSchedule resolves overlap and ordering issues"
    - "Structural errors escalated as WARNING (not auto-fixed): scope coverage gaps"

key-files:
  created:
    - src/orient/research.ts
    - src/orient/planner.ts
    - src/orient/validation.ts
    - tests/orient/research.test.ts
    - tests/orient/planner.test.ts
    - tests/orient/validation.test.ts
  modified: []

key-decisions:
  - "Research topic scoring uses centrality * fileCount (number of graph nodes importing the library) for impact ranking"
  - "Research prompt construction is synchronous (no sub-agent dispatch) -- returns prompt string for pipeline orchestrator (Plan 06) to dispatch"
  - "Plan parser uses regex-based extraction of ### Agent sections rather than a full markdown AST parser for simplicity"
  - "autoFixPlan reuses buildWaveSchedule from wave-scheduler for mechanical fixes, converting FAIL to AUTO-FIXED or WARNING"
  - "Validation casts plan agents to wave-scheduler types via unknown (identical structure, parallel Plan 01/02 local type copies)"

patterns-established:
  - "Sub-agent prompt pattern: return prompt string, pipeline dispatches"
  - "Markdown artifact roundtrip: write -> parse -> validate cycle for plan artifacts"
  - "Mechanical vs structural error distinction in validation (auto-fix vs escalate)"

requirements-completed: [ORNT-06, ORNT-07, ORNT-09, ORNT-10, ORNT-11]

duration: 7min
completed: 2026-03-24
---

# Phase 04 Plan 04: Research, Planner, and Validation Summary

**Impact-ranked research topic extraction from graph imports, sub-agent prompt construction with Context7/web search instructions, plan markdown parsing and generation in UI-SPEC format, and auto-fix validation for mechanical errors via wave reschedule**

## Performance

- **Duration:** 7 min
- **Started:** 2026-03-24T00:38:45Z
- **Completed:** 2026-03-24T00:45:23Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Implemented research module that extracts external library topics from graph IMPORTS edges, ranks by centrality * file usage, and builds scoped sub-agent prompts with Context7/web search instructions per D-10 through D-13
- Built planner module that constructs sub-agent prompts with scope contract, analysis, research, and hybrid strategy instructions, then parses plan markdown output into ExecutionPlan structs
- Implemented validation module using wave-scheduler functions for file overlap, dependency ordering, and scope coverage checks with mechanical auto-fix (up to 2 attempts) per D-19 through D-23
- Full TDD: 55 new tests across 3 test files (25 research + 18 planner + 12 validation), all passing alongside 40 existing orient tests (95 total)

## Task Commits

Each task was committed atomically:

1. **Task 1: Research module with impact-ranked topic selection and sub-agent prompt** - `9b6e280` (test), `5b2bd91` (feat)
2. **Task 2: Planner module and plan validation with auto-fix** - `5c011fe` (test), `59fb5e3` (feat)

_Note: TDD tasks have RED (test) + GREEN (feat) commits_

## Files Created/Modified
- `src/orient/research.ts` - Research sub-agent prompt construction: topic extraction from graph, impact ranking, prompt building, output parsing, artifact writing
- `src/orient/planner.ts` - Planner sub-agent prompt construction: scope/analysis/research integration, plan markdown parsing, plan artifact writing
- `src/orient/validation.ts` - Plan validation with auto-fix: file overlap, dependency ordering, scope coverage checks via wave-scheduler, mechanical error auto-fix
- `tests/orient/research.test.ts` - 25 tests: extractResearchTopics, rankTopics, buildResearchPrompt, parseResearchOutput, writeResearchArtifact, runResearch
- `tests/orient/planner.test.ts` - 18 tests: buildPlannerPrompt, parsePlanOutput, writePlanArtifact, runPlanner
- `tests/orient/validation.test.ts` - 12 tests: validatePlan (PASS/FAIL/WARNING), autoFixPlan (overlap fix, ordering fix, max attempts), writeValidationSection

## Decisions Made
- Research topic scoring uses `centrality * fileCount` -- centrality from the importing file multiplied by the number of graph nodes that import the same library. This gives higher scores to libraries used by high-centrality files and widely imported across the codebase.
- Both research and planner modules return prompt strings rather than dispatching sub-agents directly. The pipeline orchestrator (Plan 06) handles actual Task/Agent tool dispatch. This keeps modules testable and composable.
- Plan parser uses regex-based extraction of `### Agent:` sections rather than a full markdown AST. This is simpler, sufficient for the structured format, and matches the markdown-as-data pattern used throughout CodeScope.
- autoFixPlan reuses `buildWaveSchedule` from the wave-scheduler module for mechanical fixes. This ensures the fix logic is consistent with the original scheduling algorithm (topological sort + greedy coloring for file overlap splitting).
- Type casting between orient/types.ts and wave-scheduler.ts local types uses `as unknown` since the structures are identical but were defined separately during parallel Plan 01/02 development.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all functions are fully implemented. Research and planner modules return prompt strings for the pipeline orchestrator to dispatch (by design, not a stub).

## Next Phase Readiness
- Research, planner, and validation modules are ready for integration into the orient pipeline orchestrator (Plan 06)
- The pipeline can now call runResearch -> runPlanner -> validatePlan -> autoFixPlan as pipeline steps
- All orient shared types, clarification, analysis, research, planner, and validation modules are complete

## Self-Check: PASSED

All 6 created files verified on disk. All 4 commit hashes verified in git log.

---
*Phase: 04-orient-and-execution-engine*
*Completed: 2026-03-24*
