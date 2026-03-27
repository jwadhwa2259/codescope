# Phase 5: Verification - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

After execution agents complete, a two-agent verification pipeline validates that changes comply with enforced conventions, stay within the predicted blast radius, build successfully, pass tests, and work end-to-end. A static verify agent handles convention compliance (ast-grep), blast radius diff (plan vs git diff), scope drift detection, and LLM-based code review. A runtime verify agent handles build, unit/integration tests, E2E verification with auto-detected tools, and auto-smoke test generation for new endpoints. Results are written to a unified verify report at `.claude/codescope/reports/`. The pipeline is orchestrated by the orient skill body (clarify -> research -> plan -> execute -> **verify** -> eval). The `codescope_verify` MCP tool is upgraded to support all new check types for standalone programmatic access.

</domain>

<decisions>
## Implementation Decisions

### Verify Report Structure
- **D-01:** Unified single report at `reports/[task-slug]-[ISO-date].md`. One file with sections: Static Checks (conventions, blast radius diff, code review), Runtime Checks (build, unit tests, integration tests, E2E), Auto-Smoke Results, Summary. Eval agent (Phase 6) appends its findings to the same file per EVAL-04.
- **D-02:** Three severity levels: ERROR (build fails, test fails — something is broken), WARN (convention violation, blast radius surprise — worth reviewing), INFO (code review suggestions, auto-smoke results, skips — FYI only). Maps to eval triage: ERROR = must fix, WARN = eval judges, INFO = skip.
- **D-03:** Per-section timing data in the report (e.g., "Convention Compliance (0.8s)", "Unit Tests: 142/142 PASS (8.1s)"). Total verification time in summary.
- **D-04:** Convention violations include golden file references: file:line, convention name, adoption %, and "See golden file: [path]:[lines] for correct pattern". Per D-13 from Phase 3 — gives the debug agent a concrete example to follow.
- **D-05:** Unconfigured checks are skipped with explicit notes: "SKIPPED: No build_command configured in config.yml. Run /codescope:settings to configure." Verification runs what it can (conventions, blast radius diff, code review) even when test/build commands are missing.
- **D-06:** Report naming: `[task-slug]-[ISO-date].md`. No sequence number — one report per orient run. All reports retained indefinitely (small markdown files).

### Blast Radius Diff
- **D-07:** Predicted blast radius comes from the execution plan's per-agent file assignments (plans/[task-slug].md). These are the files agents were told to modify. Compared against `git diff --name-only`.
- **D-08:** Surprise files (changed but not predicted) classified by graph distance from predicted files: hop 1 = WARN (likely reasonable), hop 2 = WARN (worth reviewing), hop 3+ or unconnected = ERROR (unexpected, may indicate scope creep). Uses existing blastRadius BFS from analytics.ts.
- **D-09:** Skip files (predicted but not changed) are INFO severity with reason hint: "Predicted file [path] was not modified — may have been handled by a different approach or deemed unnecessary by execution agent."
- **D-10:** Scope drift detection: if execution agents modified files not covered by any In Scope item from the scope contract, flag as WARN with "Possible scope drift: [file] not covered by scope contract." Separate check from plan-vs-actual.

### E2E Auto-Detection & Smoke Tests
- **D-11:** E2E tool detection respects config: if `e2e.tool` is 'none', skip E2E entirely. If unset/missing, auto-detect from project files (playwright.config.ts -> Playwright, Podfile/xcodeproj -> Xcode, build.gradle -> Gradle, conftest.py -> pytest). Note detection in report.
- **D-12:** Auto-smoke generates minimal reachability checks for new endpoints only (newly created files). HTTP endpoints: GET -> 200 or expected status. Views: renders without crash. CLI: runs with --help. NOT functional tests. Written as temp test file, results in report, file cleaned up after.
- **D-13:** Smoke test generation by LLM sub-agent: reads the new route/endpoint code and generates a minimal smoke test tailored to the actual implementation. Handles auth-required endpoints, custom status codes, non-standard patterns. Uses the project's existing test framework.
- **D-14:** New endpoint detection via git diff + AST analysis: parse git diff for new files, then use tree-sitter AST to detect route/endpoint declarations (Express app.get(), Next.js page exports, Flask @app.route, etc.). Reuses existing web-tree-sitter infrastructure.
- **D-15:** Server lifecycle management: if verify.start_command is set, start server, wait for readiness (health_check polling every 1s, or ready_signal stdout scan, or 5s fixed delay), run E2E tests, kill process tree + verify port is free. All capped by verify.timeout_seconds.
- **D-16:** Server cleanup: kill process tree (tree-kill pattern for npm script child processes), then verify port is free. If port still in use after 3s, force kill by PID from lsof.

### Verification Pipeline Flow
- **D-17:** Two agents, sequential: static verify agent runs first (convention compliance, blast radius diff, code review), then runtime verify agent (build, tests, E2E, smoke). Sequential because build failure short-circuits test runs.
- **D-18:** Build failure short-circuits: if build fails, skip unit tests, integration tests, E2E, and auto-smoke. Report build failure as ERROR, note skipped checks. No cascading false failures.
- **D-19:** Pipeline orchestrated by orient skill body — same entry point as execution. Flow: clarify -> research -> plan -> execute -> verify -> eval. No separate `/codescope:verify` skill — the `codescope_verify` MCP tool provides standalone programmatic access.
- **D-20:** Both agents follow the established agent module pattern (Options + Result + async function) matching scout, researcher, convention detector, risk analyzer from Phase 2.
- **D-21:** Verification always proceeds to eval (Phase 6). No gate on ERROR severity. Verification is a data-gathering step, not a gate. Eval agent decides what to debug.
- **D-22:** Test output captured as summary + failures only: pass/fail count, duration, and full output ONLY for failed tests (test name, assertion error, file:line). Passing tests are just a count.

### Code Review Sub-Agent
- **D-23:** LLM sub-agent reads git diff + scope contract + conventions + golden file excerpts. Reviews against both intent (scope) and quality (conventions). Produces inline comments in file:line format.
- **D-24:** Soft cap of 10 findings. If more exist, note "N additional minor findings omitted" in report. Keeps review actionable for eval agent.
- **D-25:** Uses agents.eval_judge.model from config.yml. Code review is a judgment task similar to eval.

### Test Failure Parsing
- **D-26:** LLM extraction from raw test output. Run command, capture stdout/stderr, agent extracts: pass count, fail count, failed test names, error messages, file:line references. Works with ANY test framework without per-framework parsers.
- **D-27:** Tail-biased truncation: keep last 500 lines of test output (failures and summary are typically at the end). Prefix with "Output truncated — showing last 500 of N lines."

### MCP Tool Upgrade
- **D-28:** codescope_verify upgraded to accept check types: convention_compliance, blast_radius_diff, build, unit_tests, integration_tests, e2e, auto_smoke, code_review. Capabilities array updated, upcoming array emptied.
- **D-29:** Checks requiring orient artifacts (blast_radius_diff, code_review) gracefully degrade when called standalone — return partial response with warning. Convention compliance, build, and test checks work fully standalone.

### Config Schema
- **D-30:** No schema changes needed. Existing verify section fields (build_command, start_command, health_check, ready_signal, timeout_seconds, tests.unit, tests.integration, tests.e2e, auto_smoke, static_check, blast_radius_diff) cover all Phase 5 behavior. Phase 5 implements the behavior behind these fields.

### Claude's Discretion
- No areas deferred to Claude's discretion — all gray areas received explicit user decisions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Specification
- `CODESCOPE-SPEC-V6.md` — Full product spec. Verification pipeline, verify report format, auto-smoke generation, E2E tool detection, blast radius diff.

### Build Instructions
- `CODESCOPE-BUILD-INSTRUCTIONS.md` — Environment setup, dependency versions, ast-grep CLI, web-tree-sitter WASM.

### Project Context
- `.planning/PROJECT.md` — Key decisions: thin orchestrator (<15K tokens), filesystem coordination (Issue #5812), suggestion-only conventions, convention false positive <5%.
- `.planning/REQUIREMENTS.md` — Phase 5 requirements: VRFY-01 through VRFY-08.
- `.planning/ROADMAP.md` — Phase 5 goal, success criteria, dependency on Phase 4.

### Technology Stack
- `CLAUDE.md` SS Technology Stack — ast-grep CLI for convention scanning, web-tree-sitter for AST parsing, vitest for testing.

### Prior Phase Context & Code
- `.planning/phases/03-bootstrap-synthesis-and-mcp-server/03-CONTEXT.md` — D-13 (enforced = warning with evidence, never blocks), D-14 (conventions-enforced.md starts empty), D-36 (verify Phase 3 = convention compliance only), D-38 (capabilities/upcoming metadata).
- `.planning/phases/04-orient-and-execution-engine/04-CONTEXT.md` — D-28 (coordination file is structured markdown, parseable by verify), D-31 (agent context scoping), D-36 (failure model with partial results).

### Existing Code
- `src/tools/verify.ts` — Phase 3 convention compliance checker. Parses conventions-enforced.md, runs ast-grep per file, returns structured violations. Has `upcoming: ["blast_radius_diff", "build_verification", "test_verification"]`. To be upgraded.
- `src/conventions/runner.ts` — ast-grep rule scanning, adoption calculation, conflict detection. Convention compliance infrastructure.
- `src/graph/analytics.ts` — blastRadius BFS with hop-distance classification. Used for surprise file severity classification.
- `src/graph/cache.ts` — getGraph() with 5-min TTL cache. Used for graph queries in blast radius diff.
- `src/execution/orchestrator.ts` — Execution result types, coordination file, change reports, execution summary. Verify reads these artifacts.
- `src/execution/agent-spawner.ts` — buildAgentPrompt, buildAgentInvocation, writeChangeReport. Pattern for verify agent spawning.
- `src/orient/run-orient.ts` — CLI entry point for orient pipeline. Verify integrates after execution phase.
- `src/config/schema.ts` — ConfigSchema.verify section with all relevant fields already defined.
- `src/tools/helpers.ts` — okResponse, errorResponse, buildMetadata, isBootstrapped. Reusable for verify tool upgrade.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **verify.ts** (src/tools/verify.ts): Phase 3 convention compliance. Parses conventions-enforced.md and runs ast-grep per file. Upgrade to support new check types while preserving existing convention compliance logic.
- **Convention runner** (src/conventions/runner.ts): Full ast-grep scanning infrastructure. runConventionScan, calculateAdoption, buildEvidence. Reuse for convention compliance check in static verify agent.
- **Graph analytics** (src/graph/analytics.ts): blastRadius with hop-distance classification (Red/Orange/Yellow/Green). Reuse for surprise file severity in blast radius diff.
- **Graph cache** (src/graph/cache.ts): getGraph() with cached graphology instance. Use for graph distance calculations in blast radius diff.
- **Execution orchestrator** (src/execution/orchestrator.ts): readPlanFromDisk, writeExecutionSummary. Verify reads execution plan for predicted file list.
- **Agent spawner** (src/execution/agent-spawner.ts): buildAgentPrompt, buildAgentInvocation. Pattern for constructing verify agent prompts.
- **MCP response helpers** (src/tools/helpers.ts): okResponse/errorResponse/buildMetadata/isBootstrapped. Use for upgraded codescope_verify tool.
- **Config loader** (src/config/loader.ts): loadConfig reads verify section with all needed fields.

### Established Patterns
- Agent module pattern: Options + Result + async function + markdown artifact (Phase 2 D-05)
- Issue #5812 filesystem coordination: agents write files, parent reads files
- Thin orchestrator: <15K tokens, all state on disk
- MCP tool handler extraction: handleXxx for tests, registerXxxTool for MCP registration
- Structured JSON responses with status/data/metadata and capabilities/upcoming arrays

### Integration Points
- New `src/verify/` — static-verify.ts, runtime-verify.ts, report-writer.ts, smoke-generator.ts, blast-radius-diff.ts, server-lifecycle.ts
- Modified `src/tools/verify.ts` — upgraded MCP tool with new check types, graceful degradation for standalone use
- Modified `src/orient/run-orient.ts` — add verify phase after execution
- Modified `src/orient/pipeline.ts` — integrate verification step into pipeline flow
- Reports written to `.claude/codescope/reports/[task-slug]-[date].md`

</code_context>

<specifics>
## Specific Ideas

- Convention violations reference golden files with specific line ranges — gives the Phase 6 debug agent a concrete example to follow when fixing violations.
- Blast radius diff uses execution plan file assignments as the "predicted" set, not the broader BFS blast radius from orient analysis. Plan files are concrete and directly comparable to git diff.
- Scope drift is a separate check from blast radius diff — catches agents going beyond the agreed scope contract, not just beyond the plan.
- Surprise file severity uses graph distance (hop count from predicted files): closer = WARN, distant/unconnected = ERROR. Leverages existing BFS infrastructure.
- Auto-smoke tests are temp files cleaned up after running — they don't pollute the codebase. Results captured in the report.
- LLM extraction for test output parsing — universal across all test frameworks. No per-framework parser maintenance. Tail-biased truncation keeps relevant info.
- Server lifecycle managed end-to-end: start, readiness check (health poll or stdout signal), run E2E, kill tree, verify port free. Handles npm script child processes.
- Verification is a data-gathering step, not a gate. Always proceeds to eval. This matches the "suggestion-only" philosophy — build trust, don't block.

</specifics>

<deferred>
## Deferred Ideas

- Per-framework JSON parsers for test output — LLM extraction is sufficient for v1, structured parsers could improve reliability in v2
- Permanent smoke test file generation — users asked for temp-only in v1, could add "keep smoke tests" option in v2
- Convention enforcement blocking mode — stays suggestion-only per PROJECT.md constraint
- Coverage-aware smoke generation (testing modified endpoints without coverage, not just new ones) — v2 scope

</deferred>

---

*Phase: 05-verification*
*Context gathered: 2026-03-23*
