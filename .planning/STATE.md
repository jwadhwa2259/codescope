---
gsd_state_version: 1.0
milestone: v2.1
milestone_name: Eval Fixes & Real-World Quality
status: completed
stopped_at: Completed 19-01-PLAN.md
last_updated: "2026-03-31T02:35:44.003Z"
last_activity: 2026-03-31 -- Completed 19-02 deterministic scorecard
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 12
  completed_plans: 11
  percent: 67
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-30)

**Core value:** AI-generated code changes that respect existing conventions, stay within safe blast radius, and actually work in the codebase -- verified end-to-end before the user sees them.
**Current focus:** Phase 19 — intelligence-features

## Current Position

Phase: 19 (intelligence-features) — EXECUTING
Plan: 2 of 3
Status: Completed 19-02 deterministic scorecard
Last activity: 2026-03-31 -- Completed 19-02 deterministic scorecard

Progress: [██████░░░░] 67%

## Performance Metrics

**Overall (v1.0 + v2.0):**

- Total phases: 16
- Total plans: 61
- Total tasks: 118
- Timeline: 7 days (2026-03-22 to 2026-03-29)

## Accumulated Context

### Decisions

All decisions archived in PROJECT.md Key Decisions table and milestone archives.

- [Phase 17]: Only extract static require() with string literals; dynamic require(variable) skipped per REQUIREMENTS.md
- [Phase 17]: Query graph DB for real file counts instead of modifying BuildGraphResult interface
- [Phase 17]: Canonical parser pattern: all convention parsing through src/conventions/parser.ts
- [Phase 17]: tsResolver typed as Resolver (not Resolver | null), enforcing non-null at the type level
- [Phase 17]: Fallback resolver uses ResolverFactory.createResolver without path aliases when tsconfig missing
- [Phase 17]: graph.size === 0 check placed after getGraph() and before main logic in all 4 downstream tools
- [Phase 17]: detect-changes returns risk_level UNKNOWN (not LOW) when graph incomplete per D-02
- [Phase 18]: Pure data module pattern: rule-metadata.ts has zero imports for build isolation
- [Phase 18]: 3-tier signal chain: filename (0.95) > path (0.80-0.85) > fallback (0.50) for file classification
- [Phase 18]: Permissive default: rules not in RULE_ROLE_APPLICABILITY apply to all file roles (D-23)
- [Phase 18]: isNoiseFile exported for testability and potential reuse in other modules
- [Phase 18]: Language detection: file extension for files (.py=Python), ruleId prefix for conventions (python-*=Python)
- [Phase 18]: Framework rules use same YAML format and severity:info as base rules for consistent scanning
- [Phase 18]: detectedFrameworks defaults to empty array for backward compatibility
- [Phase 18]: Use relative path from targetDir for file-role classification to avoid test fixture path contamination
- [Phase 18]: Readiness cap placed after all convention accumulation and before computeReadiness call
- [Phase 19]: Convention density similarity uses 1.0 - abs(densityA - densityB) for similarity comparison
- [Phase 19]: Violation index produces file-level entries (line=0) for convention deviations
- [Phase 19]: General role files compare against ALL non-noise files, not just general group
- [Phase 19]: C+ grade covers 70-79% (extended from D-21's 70-74% to fill 75-79% gap)
- [Phase 19]: Scorecard computed server-side in MCP tool, not assembled inline by skill agent
- [Phase 19]: Mode 1 revert uses git stash --include-untracked per D-18 (not git checkout)
- [Phase 19]: Files not in graph scored as 100% for import correctness

### Pending Todos

None.

### Blockers/Concerns

- v2.0 eval exposed 0 import edges on both Fastify (CJS) and h3 (ESM) -- root cause confirmed in parser and resolver
- Convention index is silently empty due to format mismatch between detector output and index parser
- Plugin marketplace install has recursive cloning loop

## Session Continuity

Last session: 2026-03-31T02:35:44.001Z
Stopped at: Completed 19-01-PLAN.md
Resume file: None
