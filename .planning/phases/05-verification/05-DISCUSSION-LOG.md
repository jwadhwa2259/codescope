# Phase 5: Verification - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 05-verification
**Areas discussed:** Verify report structure, Blast radius diff behavior, E2E auto-detection & smoke tests, Verification pipeline flow, Code review sub-agent scope, Test failure parsing, Server lifecycle management, Verify config schema updates, Report file naming & retention, MCP tool upgrade details

---

## Verify Report Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Unified single report | One markdown file with sections: Static Checks, Runtime Checks, Auto-Smoke, Summary. Eval appends to same file. | ✓ |
| Split static/runtime reports | Two separate files for static and runtime results | |
| Structured JSON + markdown | Machine-readable JSON plus human-readable markdown | |

**User's choice:** Unified single report
**Notes:** Preview of report format shown and accepted

---

## Severity Levels

| Option | Description | Selected |
|--------|-------------|----------|
| Three levels (ERROR/WARN/INFO) | ERROR = broken, WARN = worth reviewing, INFO = FYI. Maps to eval triage. | ✓ |
| Two levels (FAIL/WARN) | Binary pass/fail | |
| Four levels (CRITICAL/ERROR/WARN/INFO) | Adds CRITICAL for build failures | |

**User's choice:** Three levels
**Notes:** None

---

## Semantic Code Review

| Option | Description | Selected |
|--------|-------------|----------|
| LLM sub-agent review | Sub-agent reads diff + conventions + golden files, writes review comments | ✓ |
| Skip code review in Phase 5 | Let Phase 6 eval handle semantic review | |
| Rule-based only | Extended ast-grep rules for anti-patterns | |

**User's choice:** LLM sub-agent review
**Notes:** None

---

## No Commands Handling

| Option | Description | Selected |
|--------|-------------|----------|
| Skip with explicit note | Report shows SKIPPED with config hint. Runs what it can. | ✓ |
| Auto-detect commands | Try common commands if not configured | |
| Fail verification | Return error if essential commands missing | |

**User's choice:** Skip with explicit note
**Notes:** None

---

## Per-Section Timing

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, per-section timing | Each section shows duration. Total in summary. | ✓ |
| Total time only | Just overall duration | |
| You decide | Claude picks | |

**User's choice:** Per-section timing
**Notes:** None

---

## Golden File References

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, include golden file reference | Violation shows file:line, convention, adoption %, golden file path:lines | ✓ |
| Convention name only | Just convention name and violation location | |
| You decide | Claude picks detail level | |

**User's choice:** Include golden file reference
**Notes:** Per D-13 from Phase 3

---

## Code Review Output Style

| Option | Description | Selected |
|--------|-------------|----------|
| Inline comments | Structured list: file:line — comment. Parseable by eval/debug agents. | ✓ |
| Prose summary | Paragraph-style narrative review | |
| Both | Inline comments + brief prose summary | |

**User's choice:** Inline comments
**Notes:** None

---

## Surprise File Classification

| Option | Description | Selected |
|--------|-------------|----------|
| Graph-distance severity | Hop 1-2 = WARN, hop 3+/unconnected = ERROR. Uses BFS from analytics.ts. | ✓ |
| All surprises equal | Every surprise = WARN | |
| Count-based threshold | 1-2 = WARN, 3+ = ERROR | |

**User's choice:** Graph-distance severity
**Notes:** None

---

## Skip File Handling

| Option | Description | Selected |
|--------|-------------|----------|
| INFO with reason hint | Always INFO. Hint about why file wasn't modified. | ✓ |
| Suppress skips entirely | Don't report skips | |
| WARN for skips | Flag as possible incomplete implementation | |

**User's choice:** INFO with reason hint
**Notes:** None

---

## Predicted Blast Radius Source

| Option | Description | Selected |
|--------|-------------|----------|
| Execution plan file list | Per-agent file assignments from plans/[task-slug].md | ✓ |
| Orient analysis blast radius | BFS blast radius from analysis phase | |
| Both with separate sections | Plan diff + blast radius diff | |

**User's choice:** Execution plan file list
**Notes:** Concrete, already on disk, directly comparable to git diff

---

## Scope Drift Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, flag as scope drift | WARN if modified files not in scope contract In Scope list | ✓ |
| No, plan is the authority | Execution plan is the contract, not scope contract | |
| You decide | Claude picks | |

**User's choice:** Flag as scope drift
**Notes:** Separate check from plan-vs-actual

---

## E2E Auto-Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Respect config, detect only if unset | 'none' = skip, unset = auto-detect from project files | ✓ |
| Always auto-detect | Ignore config, always scan | |
| Config required | Only run if explicitly configured | |

**User's choice:** Respect config, detect only if unset
**Notes:** None

---

## Auto-Smoke Generation

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal reachability checks | Smoke tests confirm endpoints load/respond. Temp files, cleaned up. | ✓ |
| Generated test files kept | Permanent test files written to codebase | |
| No auto-smoke generation | Just report missing coverage as INFO | |

**User's choice:** Minimal reachability checks
**Notes:** None

---

## Smoke Test Generation Method

| Option | Description | Selected |
|--------|-------------|----------|
| LLM sub-agent | Reads endpoint code, generates tailored smoke test | ✓ |
| Template-based | Pre-built templates per tool type | |
| You decide | Claude picks | |

**User's choice:** LLM sub-agent
**Notes:** None

---

## Dev Server Management

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, manage server lifecycle | Start, wait for ready, run E2E, kill server | ✓ |
| Assume server is running | User starts server | |
| You decide | Claude picks | |

**User's choice:** Manage server lifecycle
**Notes:** None

---

## New Endpoint Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Git diff + AST analysis | Parse diff for new files, tree-sitter AST for route declarations | ✓ |
| File path conventions | Detect by path patterns (src/pages/, src/routes/) | |
| Both combined | Path conventions as fast pass, AST to confirm | |

**User's choice:** Git diff + AST analysis
**Notes:** Reuses existing web-tree-sitter infrastructure

---

## Auto-Smoke Scope

| Option | Description | Selected |
|--------|-------------|----------|
| New endpoints only | Only in newly created files | ✓ |
| New + modified without coverage | Any endpoint in changed files lacking tests | |
| You decide | Claude picks | |

**User's choice:** New endpoints only
**Notes:** Keeps scope tight

---

## Verification Agents Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Two agents, static then runtime | Static first, then runtime. Sequential for build short-circuit. | ✓ |
| Single verification agent | One agent handles everything | |
| Three agents (parallel static) | Convention + blast radius parallel, code review separate, then runtime | |

**User's choice:** Two agents, static then runtime
**Notes:** None

---

## Build Failure Short-Circuit

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, short-circuit on build failure | Skip tests/E2E/smoke on build fail | ✓ |
| Run all checks regardless | Attempt all even if build fails | |
| Configurable | Add config option, default true | |

**User's choice:** Short-circuit on build failure
**Notes:** None

---

## Pipeline Integration

| Option | Description | Selected |
|--------|-------------|----------|
| Orchestrated by orient skill body | Orient skill body calls verification after execution | |
| Separate skill /codescope:verify | Standalone skill entry point | |
| Both: integrated + standalone | Orient calls it, also available as standalone skill | ✓ → revised |

**User's choice:** Initially selected "Both", then asked for recommendation. Revised to "Orchestrated by orient skill body" after discussion. User agreed: MCP tool codescope_verify provides standalone programmatic access, no separate skill needed.
**Notes:** User asked "what would you recommend?" — recommended integrated-only because verification depends on orient artifacts (scope contract, plan) and codescope_verify MCP tool covers standalone use.

---

## Agent Module Pattern

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, same agent module pattern | Options + Result + async function, matching Phase 2 agents | ✓ |
| Direct functions, no agent abstraction | Lighter weight exported functions | |
| You decide | Claude picks | |

**User's choice:** Same agent module pattern
**Notes:** None

---

## MCP Tool Upgrade

| Option | Description | Selected |
|--------|-------------|----------|
| Upgrade MCP tool | Expand to accept all new check types | ✓ |
| Keep MCP tool convention-only | Phase 3 scope only | |
| Partial upgrade | Add blast_radius_diff and build only | |

**User's choice:** Upgrade MCP tool
**Notes:** None

---

## Verification Verdict

| Option | Description | Selected |
|--------|-------------|----------|
| Always proceed to eval | Verification is data-gathering, not a gate | ✓ |
| Gate on ERROR severity | Pause on errors before eval | |
| You decide | Claude picks | |

**User's choice:** Always proceed to eval
**Notes:** None

---

## Test Output Capture

| Option | Description | Selected |
|--------|-------------|----------|
| Summary + failures only | Pass/fail count, duration, full output for failures only | ✓ |
| Full test output | Complete stdout/stderr | |
| Summary only | Just counts, no failure details | |

**User's choice:** Summary + failures only
**Notes:** None

---

## Code Review Context

| Option | Description | Selected |
|--------|-------------|----------|
| Diff + scope contract + conventions | Git diff, scope contract, conventions, golden file excerpts | ✓ |
| Diff + full execution context | Everything plus plan, coordination log, research | |
| Diff only | Pure code quality review | |

**User's choice:** Diff + scope contract + conventions
**Notes:** None

---

## Code Review Findings Cap

| Option | Description | Selected |
|--------|-------------|----------|
| Soft cap of 10 findings | Note "N additional minor findings omitted" if more | ✓ |
| No cap, report everything | Let eval triage | |
| You decide | Claude calibrates by diff size | |

**User's choice:** Soft cap of 10 findings
**Notes:** None

---

## Code Review Model

| Option | Description | Selected |
|--------|-------------|----------|
| Same as eval_judge config | agents.eval_judge.model from config.yml | ✓ |
| Always Sonnet | Pin to Sonnet for cost | |
| You decide | Claude picks | |

**User's choice:** Same as eval_judge config
**Notes:** Code review is a judgment task similar to eval

---

## Test Failure Parsing

| Option | Description | Selected |
|--------|-------------|----------|
| LLM extraction from raw output | Agent extracts structured results from any framework's output | ✓ |
| Per-framework parsers | JSON reporters per framework | |
| JSON reporters + LLM fallback | Structured when available, LLM otherwise | |

**User's choice:** LLM extraction from raw output
**Notes:** Universal, no per-framework maintenance

---

## Test Output Truncation

| Option | Description | Selected |
|--------|-------------|----------|
| Tail-biased truncation | Last 500 lines (failures/summary at end) | ✓ |
| Head + tail | First 50 + last 450 lines | |
| No truncation | Feed full output | |

**User's choice:** Tail-biased truncation
**Notes:** None

---

## Server Ready Check

| Option | Description | Selected |
|--------|-------------|----------|
| Health check polling | Poll health_check URL every 1s, or scan stdout for ready_signal, or 5s delay. Capped by timeout. | ✓ |
| Ready signal only | Stdout scanning only | |
| You decide | Claude picks | |

**User's choice:** Health check polling
**Notes:** None

---

## Server Cleanup

| Option | Description | Selected |
|--------|-------------|----------|
| Kill process tree + port check | Kill tree, verify port free, force kill if needed after 3s | ✓ |
| Simple process.kill | Just kill spawned process | |
| You decide | Claude handles | |

**User's choice:** Kill process tree + port check
**Notes:** Prevents orphaned servers

---

## Auto-Selected Decisions (Recommended Defaults)

### Verify Config Schema
- [auto] No schema changes needed. Existing verify section fields cover all Phase 5 behavior.

### Report File Naming & Retention
- [auto] Naming: `[task-slug]-[ISO-date].md`. No sequence number. All reports retained.
- [auto] Location: `.claude/codescope/reports/`

### MCP Tool Upgrade Details
- [auto] New check types: convention_compliance, blast_radius_diff, build, unit_tests, integration_tests, e2e, auto_smoke, code_review.
- [auto] Checks requiring orient artifacts gracefully degrade standalone (partial response with warning).
- [auto] Capabilities array updated, upcoming array emptied.

---

## Claude's Discretion

No areas deferred to Claude's discretion.

## Deferred Ideas

- Per-framework JSON parsers for test output (v2)
- Permanent smoke test file generation (v2)
- Coverage-aware smoke generation for modified endpoints (v2)
