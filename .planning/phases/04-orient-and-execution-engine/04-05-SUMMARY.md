---
phase: 04-orient-and-execution-engine
plan: 05
subsystem: execution
tags: [agent-spawner, orchestrator, wave-dispatch, failure-handling, coordination, sendmessage-protocol]

# Dependency graph
requires:
  - phase: 04-orient-and-execution-engine
    plan: 02
    provides: "Execution types, coordination file ops, agent teams detection, wave scheduler"
  - phase: 04-orient-and-execution-engine
    plan: 01
    provides: "Orient types (AgentAssignment, ExecutionPlan, ExecutionWave)"
provides:
  - "Agent spawner: scoped prompt construction with conventions, golden files, coordination context, research, SendMessage protocol"
  - "Agent invocation builder: structured dispatch objects with tools, timeout, permission mode"
  - "Change report parser and writer matching UI-SPEC agent change report format"
  - "Execution orchestrator: wave-based dispatch with agent teams detection and parallel/sequential modes"
  - "Failure handling: retry once (D-36), skip dependents (D-37), continue independents"
  - "Execution summary writer matching UI-SPEC format with results table, totals, failures"
  - "ExecutionCallbacks pattern: orchestrator delegates dispatch to skill body"
affects: [04-06-skill-body, 05-verification-agents]

# Tech tracking
tech-stack:
  added: []
  patterns: ["ExecutionCallbacks dispatch delegation pattern", "10-section scoped agent prompt construction", "conditional SendMessage protocol inclusion by execution mode"]

key-files:
  created:
    - src/execution/agent-spawner.ts
    - src/execution/orchestrator.ts
    - tests/execution/agent-spawner.test.ts
    - tests/execution/orchestrator.test.ts

key-decisions:
  - "ExecutionCallbacks pattern: orchestrator prepares invocations but delegates actual Tool calls to skill body, keeping orchestrator as pure-logic coordinator"
  - "SendMessage protocol conditionally included only for parallel/wave-based execution modes, omitted for sequential (EXEC-08)"
  - "Prompt construction uses 10 sections per D-31 with by-reference paths (not embedded content) to keep orchestrator thin"
  - "Agent failure retry uses same invocation (no modified context) per D-36 simplicity"

patterns-established:
  - "AgentPromptContext interface: all paths by reference (scopeContractPath, planPath, researchPath, coordinationPath) for thin orchestrator pattern"
  - "AgentInvocation interface: structured dispatch object (name, prompt, tools, model, timeout, permissionMode) consumed by skill body"
  - "Change report format: markdown with Files Changed table, Summary, Discoveries, Issues sections per UI-SPEC"
  - "Execution summary format: Results table + Totals + Next Step + Failures sections per UI-SPEC"

requirements-completed: [EXEC-01, EXEC-02, EXEC-04, EXEC-05, EXEC-06]

# Metrics
duration: 5min
completed: 2026-03-24
---

# Phase 04 Plan 05: Agent Spawner and Execution Orchestrator Summary

**Scoped agent prompt construction with SendMessage protocol, wave-based orchestrator with agent teams dispatch, retry-once failure handling, and UI-SPEC execution summary**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-24T00:38:40Z
- **Completed:** 2026-03-24T00:43:34Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Agent spawner constructs per-agent prompts with 10 scoped sections (role, scope contract, file boundaries, conventions, golden files, research, coordination context, MCP tools, output requirements, SendMessage protocol)
- SendMessage protocol (HandoffSignal + DiscoverySignal) conditionally included only for parallel/wave-based modes per EXEC-08
- Execution orchestrator manages wave-based dispatch with agent teams detection for parallel execution (EXEC-04) and sequential fallback
- Failure handling: retry once per D-36, skip dependents per D-37, continue independent agents
- Coordination entries recorded for all agent lifecycle events (started, done, failed, skipped)
- Execution summary writer produces UI-SPEC format with results table, totals, next step, and failure details

## Task Commits

Each task was committed atomically:

1. **Task 1: Agent spawner with scoped context construction** - `bd9c0a8` (feat)
2. **Task 2: Execution orchestrator with wave-based dispatch and failure handling** - `8b87aa0` (feat)

_Note: TDD tasks -- tests written first (RED), then implementation (GREEN) in single commit per task._

## Files Created/Modified
- `src/execution/agent-spawner.ts` - Agent prompt construction (buildAgentPrompt with 10 sections), invocation builder (buildAgentInvocation), change report parser/writer (parseAgentChanges, writeChangeReport)
- `src/execution/orchestrator.ts` - Thin execution orchestrator (runExecution with wave dispatch, failure handling, summary generation), plan reader (readPlanFromDisk), summary writer (writeExecutionSummary), ExecutionCallbacks interface
- `tests/execution/agent-spawner.test.ts` - 20 tests: prompt sections, SendMessage protocol presence/absence, invocation building, change parsing, report format
- `tests/execution/orchestrator.test.ts` - 14 tests: plan reading, sequential/parallel dispatch, coordination entries, failure retry/skip, summary format, progress messages

## Decisions Made
- ExecutionCallbacks pattern: orchestrator prepares invocations but delegates actual Claude Code Tool calls to the skill body, keeping orchestrator as a pure-logic coordinator per EXEC-06 (<15K tokens)
- SendMessage protocol conditionally included only for parallel/wave-based execution modes (EXEC-08), completely omitted for sequential mode
- Prompt construction uses paths by reference (not embedded content) per D-31/D-13 to keep context budget manageable
- Agent failure retry uses the same invocation without modified context per D-36 (agent can adapt based on error from first attempt)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all functions are fully implemented with complete logic. No placeholder data or TODO markers.

## Next Phase Readiness
- Agent spawner and orchestrator ready for consumption by Plan 06 (skill body / orient integration)
- ExecutionCallbacks interface ready for skill body to provide dispatchAgent implementation via Task/Agent tool
- All 70 execution tests passing across 5 test files (coordination, teams-detector, wave-scheduler, agent-spawner, orchestrator)
- Wave-based dispatch, failure handling, and summary generation fully operational

## Self-Check: PASSED

- All 4 source/test files verified present on disk
- Commit bd9c0a8 (Task 1) verified in git log
- Commit 8b87aa0 (Task 2) verified in git log
- All 70 tests passing across 5 execution test files

---
*Phase: 04-orient-and-execution-engine*
*Completed: 2026-03-24*
