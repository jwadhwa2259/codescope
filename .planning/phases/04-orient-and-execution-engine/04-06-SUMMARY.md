---
phase: 04-orient-and-execution-engine
plan: 06
subsystem: orient-pipeline
tags: [pipeline, skill-body, cli-entry, gates, orient, execution, integration]

# Dependency graph
requires:
  - phase: 04-orient-and-execution-engine
    plan: 04
    provides: "Research, planner, validation modules"
  - phase: 04-orient-and-execution-engine
    plan: 05
    provides: "Execution orchestrator, agent spawner, coordination"
  - phase: 04-orient-and-execution-engine
    plan: 01
    provides: "Clarification, analysis, orient types"
  - phase: 04-orient-and-execution-engine
    plan: 02
    provides: "Agent teams detection, wave scheduler, coordination"
provides:
  - "Orient pipeline orchestrator: full clarification-through-plan-approval flow with two gates"
  - "slugifyTask: filesystem-safe slug generation with timestamp suffix for collision prevention"
  - "run-orient.ts CLI: phased execution (clarification, scope-contract, research, analysis-and-planning) and --check-only"
  - "run-execution.ts CLI: execution engine entry point with stub dispatchAgent for skill body dispatch"
  - "Full orient skill body: 164-line conversational orchestrator replacing 6-line stub"
  - "Skill body dispatches research and planner sub-agents via Agent tool"
  - "Skill body handles two gates (scope, plan) with approve/edit/reject flows"
affects: [05-verification-agents]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Phased CLI execution via --phase flag for multi-step skill body invocation", "Skill-as-orchestrator pattern (natural language prompt orchestrating CLI + Agent tool)", "Budget tracking for ORNT-11 60s constraint"]

key-files:
  created:
    - src/orient/pipeline.ts
    - src/orient/run-orient.ts
    - src/execution/run-execution.ts
    - tests/orient/pipeline.test.ts
  modified:
    - skills/orient/SKILL.md

decisions:
  - "Pipeline returns plan path without calling runExecution directly -- execution is a separate step dispatched by skill body"
  - "run-orient.ts uses --phase flag for phased execution, matching skill-as-orchestrator pattern"
  - "Analysis runs before research in pipeline (analysis provides affected files for research topic extraction)"
  - "Stub dispatchAgent in run-execution.ts logs invocations; actual dispatch from skill body"

metrics:
  duration: 5min
  completed: "2026-03-24T00:55:00Z"
  tasks_completed: 3
  tasks_total: 3
  tests_passed: 248
  tests_total: 248
  files_created: 4
  files_modified: 1
---

# Phase 04 Plan 06: Orient Pipeline Integration Summary

Full orient pipeline wiring (clarification through execution) with CLI entry points and conversational skill body replacing the orient stub.

## What Was Built

### src/orient/pipeline.ts
- Exports `slugifyTask(task)` with timestamp suffix to prevent slug collisions (Pitfall 7)
- Exports `runOrientPipeline(options)` orchestrating 7 steps: clarification, Gate 1, research, analysis, planning, validation, Gate 2
- Budget tracking for ORNT-11 (60s for research+analysis+planning+validation)
- Gate callbacks via `onGate('scope'|'plan', artifactPath)` returning approve/edit/reject
- Creates `execution/{taskSlug}/` and `plans/` directories

### src/orient/run-orient.ts
- CLI entry point: `node --import tsx/esm src/orient/run-orient.ts`
- `--phase clarification`: ambiguity detection + question generation, returns JSON
- `--phase scope-contract`: generates scope contract from `--answers` JSON, requires `--task-slug`
- `--phase research`: extracts topics + builds research prompt, requires `--task-slug`
- `--phase analysis-and-planning`: graph analysis + planner prompt + validation, requires `--task-slug`
- `--check-only`: verifies graph.db exists (bootstrap check), outputs `{ bootstrapped: true/false }`
- No `--phase`: runs full pipeline non-interactively (equivalent to `--no-confirm --no-clarify`)

### src/execution/run-execution.ts
- CLI entry point: `node --import tsx/esm src/execution/run-execution.ts`
- Parses `--project-root`, `--task-slug`, `--plan-path`, `--verbosity`
- Loads config for `max_agents_concurrent`
- Calls `runExecution()` with stub `dispatchAgent` (actual dispatch from skill body)
- Outputs JSON result to stdout, progress to stderr

### skills/orient/SKILL.md
- Full 164-line conversational orchestrator (was 6-line stub)
- 5 steps: Clarification, Research, Planning, Execution, Summary
- Gate 1 (scope approval) and Gate 2 (plan approval) with approve/edit/reject
- `--no-confirm` skips both gates, `--no-clarify` skips clarification
- Research and planner sub-agents dispatched via Agent tool
- Wave-based execution with retry once + skip dependents
- Error handling for missing bootstrap, config, and agent timeouts

### tests/orient/pipeline.test.ts
- 12 tests across 2 describe blocks
- `slugifyTask`: valid slug, special characters, empty string, 60-char cap, uniqueness, hyphen collapsing
- `runOrientPipeline`: artifacts with noConfirm, noClarify skip, gate callbacks, directory creation, scope rejection, plan rejection

## Test Results

Full Phase 4 test suite: **248 tests passed across 18 test files** (orient/, execution/, onboard/, config/).

## Deviations from Plan

None -- plan executed exactly as written.

## Self-Check: PASSED

All 5 created/modified files verified on disk. Both task commits (44c0427, 734a61a) verified in git log.
