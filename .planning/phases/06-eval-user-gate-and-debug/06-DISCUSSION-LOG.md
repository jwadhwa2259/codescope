# Phase 6: Eval, User Gate, and Debug - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 06-eval-user-gate-and-debug
**Areas discussed:** Eval scoring & findings, User gate interaction, Debug agent fix cycles, Pipeline integration, Eval agent model & token budget, Debug agent context scoping, MCP tool for eval, Error handling & partial results

---

## Eval Input

| Option | Description | Selected |
|--------|-------------|----------|
| Structured JSON | Eval reads raw StaticVerifyResult + RuntimeVerifyResult JSON | ✓ |
| Markdown report parsing | Parse verify report markdown | |
| Both — JSON primary, report as context | JSON for scoring, markdown as additional context | |

**User's choice:** Structured JSON
**Notes:** User asked for recommendation. Recommended JSON for precision and parseability.

## Eval Scoring

| Option | Description | Selected |
|--------|-------------|----------|
| Per-criterion pass/fail + findings list | Each criterion independently passes/fails, findings severity-tagged | ✓ |
| Numeric scores per criterion (0-100) | Threshold-based pass/fail with numeric scores | |
| Single overall verdict with breakdown | One PASS/NEEDS_DEBUG verdict | |

**User's choice:** Per-criterion pass/fail
**Notes:** User asked for recommendation. Recommended pass/fail over numeric scores — false precision doesn't help code quality. Findings list IS the evidence.

## Eval Context

| Option | Description | Selected |
|--------|-------------|----------|
| Full context | Verify JSON + scope contract + execution plan + git diff + coordination log | ✓ |
| Verify data only | Only verify results | |
| Verify + scope contract only | Middle ground | |

**User's choice:** Full context

## Disabled Criteria Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Skip disabled, score only enabled | Disabled criteria show SKIPPED in report | ✓ |
| Always score all 4 | Ignore config booleans | |

**User's choice:** Skip disabled
**Notes:** User asked for recommendation. Recommended skip — respects user preferences.

## Eval Prompt Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Single prompt, all criteria | One LLM call, holistic judgment | ✓ |
| Separate prompt per criterion | 4 LLM calls, targeted | |

**User's choice:** Single prompt

## Finding Output Format

| Option | Description | Selected |
|--------|-------------|----------|
| Structured JSON findings | { criterion, file, line, description, severity, evidence } | ✓ |
| Markdown narrative per criterion | Free-form markdown | |

**User's choice:** Structured JSON

## Finding Presentation (Interactive Mode)

| Option | Description | Selected |
|--------|-------------|----------|
| Grouped by criterion, severity-sorted | Findings under criterion headers, ERRORs first | ✓ |
| Flat list sorted by severity | All findings in one list | |
| Grouped by file | Findings under file headers | |

**User's choice:** Grouped by criterion, severity-sorted

## Defer to TODO Meaning

| Option | Description | Selected |
|--------|-------------|----------|
| Append to learnings.md as tracked TODO | Finding written with status TODO + file:line context | ✓ |
| Create comment in source code | // TODO comment at file:line | |
| Write to separate todos.md file | Dedicated file | |

**User's choice:** Append to learnings.md

## Auto-Skip-Minor Definition

| Option | Description | Selected |
|--------|-------------|----------|
| Severity-based: skip INFO, debug WARN+ERROR | Uses existing severity model | ✓ |
| Criterion-based: skip conventions | Focus on functional issues | |
| Threshold-based: skip if < N findings | Only debug criteria with many issues | |

**User's choice:** Severity-based

## Ignore Pattern Capture

| Option | Description | Selected |
|--------|-------------|----------|
| Record in learnings.md as IGNORE pattern | Eval reads on future runs to pre-filter | ✓ |
| Dedicated ignore-patterns.md file | Separate structured file | |

**User's choice:** Record in learnings.md

## Targeted Fix Plan Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Mini execution plan per finding group | Groups by file, 1-3 tasks, uses orchestrator | ✓ |
| Single-agent fix per finding | One agent per finding | |
| One big fix agent for all findings | Single agent for everything | |

**User's choice:** Mini execution plan per finding group

## Design Decision Escalation

| Option | Description | Selected |
|--------|-------------|----------|
| Present options with evidence | 2-3 concrete options + file:line evidence | ✓ |
| Always escalate with raw finding | Stop and show raw finding | |
| Never escalate — skip after max | Mark unresolved and move on | |

**User's choice:** Present options with evidence

## Debug Cycle Loop

| Option | Description | Selected |
|--------|-------------|----------|
| Scoped re-verify and re-eval | Only changed files + targeted findings | ✓ |
| Full re-verify, scoped re-eval | Full verify, targeted eval | |
| No re-verify, just re-eval | Trust the fix | |

**User's choice:** Scoped re-verify and re-eval

## Max Cycles Exhaustion

| Option | Description | Selected |
|--------|-------------|----------|
| Status report + user decides | What was tried + why + suggested fix | ✓ |
| Auto-defer all to TODO | Write to learnings.md automatically | |
| Abort and rollback | Revert all debug fixes | |

**User's choice:** Status report + user decides

## Golden File Access for Debug

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, include golden file excerpts | Higher fix accuracy with concrete patterns | ✓ |
| No, just violation description | Simpler but may miss conventions | |

**User's choice:** Include golden file excerpts

## Debug Commit Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Atomic per finding group | 2-3 commits per cycle, easy revert | ✓ |
| Single commit per cycle | Simpler history | |
| No commits until done | Cleanest but all-or-nothing | |

**User's choice:** Atomic per finding group

## Pipeline Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Step 6 in orient skill body | Eval -> gate -> debug loop in skill | ✓ |
| Separate /codescope:eval skill | Decoupled but breaks pipeline | |
| Pipeline module handles it | Logic in pipeline.ts | |

**User's choice:** Step 6 in skill body

## CLI Entry Points

| Option | Description | Selected |
|--------|-------------|----------|
| run-eval.ts + run-debug.ts | Separate CLIs, testable independently | ✓ |
| Single run-eval.ts with debug | One CLI for both | |
| No CLI, MCP tool only | Tool access only | |

**User's choice:** Separate CLIs

## Report Appending

| Option | Description | Selected |
|--------|-------------|----------|
| Append eval section to same file | Single source of truth | ✓ |
| Separate eval report file | Two files per run | |
| JSON sidecar file | Machine-readable alongside markdown | |

**User's choice:** Append to same file

## Loop Termination

| Option | Description | Selected |
|--------|-------------|----------|
| All findings resolved or user approved | No ERROR/WARN remain, or user approves, or max cycles | ✓ |
| After first eval pass | One shot, no loop | |
| Always run max cycles | Even if resolved | |

**User's choice:** All resolved or approved

## Eval Model

| Option | Description | Selected |
|--------|-------------|----------|
| agents.eval_judge.model from config | Consistent with code review | ✓ |
| Always strongest model | Override config | |

**User's choice:** Config model
**Notes:** User asked for recommendation.

## Large Diff Handling

| Option | Description | Selected |
|--------|-------------|----------|
| File-chunked eval with merged findings | Split at ~50K tokens, merge/dedup | ✓ |
| Truncate diff, note omissions | Simpler but may miss findings | |
| Always include full diff | Risk context limits | |

**User's choice:** File-chunked

## Debug Agent Context

| Option | Description | Selected |
|--------|-------------|----------|
| Finding + affected files + golden refs + scope contract | Targeted, matches Phase 4 scoping | ✓ |
| Full verify report + all artifacts | Maximum context | |
| Finding + affected files only | Minimal | |

**User's choice:** Targeted context

## Debug Execution

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse execution orchestrator | Same infrastructure as Phase 4 | ✓ |
| Simpler inline execution | Direct edits, no orchestrator | |

**User's choice:** Reuse orchestrator

## MCP Tool for Eval

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, with scoped inputs | codescope_eval matching verify pattern | ✓ |
| No MCP tool — CLI only | Simpler | |
| Combined verify_eval tool | Merge into existing | |

**User's choice:** Separate codescope_eval tool

## Eval LLM Failure

| Option | Description | Selected |
|--------|-------------|----------|
| Retry once, report unavailable | Verify results still valid | ✓ |
| Retry up to 3 times | More aggressive | |
| Fail pipeline immediately | Must re-run | |

**User's choice:** Retry once

## Debug Crash Recovery

| Option | Description | Selected |
|--------|-------------|----------|
| Committed fixes preserved | Atomic commits survive, uncommitted discarded | ✓ |
| Stash uncommitted | User reviews stash | |
| Rollback entire cycle | All-or-nothing | |

**User's choice:** Committed preserved

## Auto-Selected Defaults

D-28 through D-32 were auto-selected per user request ("just go with recommended options for the rest"):
- Debug model: default executor model
- Design decision detection: API/behavior change → escalate, code-only → auto-fix
- Config schema: no changes needed
- MCP tool degradation: partial eval without orient artifacts
- Debug MCP tool access: full access

## Deferred Ideas

- Multi-model eval ensemble — v2
- Eval learning from user gate behavior — Phase 7 partially covers
- Cross-task eval comparison — v2 analytics
- Debug agent self-improvement — v2 learning
