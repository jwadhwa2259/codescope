# Phase 6: Eval, User Gate, and Debug - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

After the verification pipeline (Phase 5) gathers data, an LLM-as-judge eval agent scores changes on 4 configurable criteria (scope compliance, convention adherence, completeness, correctness) with per-criterion pass/fail verdicts and severity-tagged findings citing file and line evidence. A user gate presents findings for triage (interactive, auto-debug, or auto-skip-minor modes). A debug agent creates targeted fix plans for findings, re-executes via the existing execution orchestrator, re-verifies only changed files, and re-evals only targeted findings in a loop capped at 3 cycles (configurable). Design decisions escalate to the user. The pipeline integrates as Step 6 in the orient skill body.

</domain>

<decisions>
## Implementation Decisions

### Eval Input & Scoring
- **D-01:** Eval agent consumes structured JSON (StaticVerifyResult + RuntimeVerifyResult), not the markdown report. Precise, parseable, no information loss.
- **D-02:** Per-criterion pass/fail with severity-tagged findings list. ERROR in a criterion = FAIL, WARN-only = PASS with warnings. No numeric scores — findings list IS the evidence.
- **D-03:** Eval reads full context: verify JSON + scope contract + execution plan + git diff + coordination log. Can judge "did you do what you said you'd do?" and "did you stay in scope?"
- **D-04:** Disabled criteria (eval.criteria booleans in config) skipped entirely with "SKIPPED: Disabled in config" in report. Only enabled criteria scored.
- **D-05:** Single LLM prompt with all context, eval judges all enabled criteria at once. Lower latency, holistic judgment — findings often span criteria.
- **D-06:** Findings as structured JSON: `{ criterion, file, line, description, severity, evidence }`. Parseable by debug agent. Evidence = specific code or verify data that proves the finding.

### User Gate Interaction
- **D-07:** Interactive mode groups findings by criterion (scope, conventions, completeness, correctness), severity-sorted (ERRORs first) within each group.
- **D-08:** "Defer to TODO" appends to learnings.md with status TODO and file:line context. Phase 7 learning system will surface these.
- **D-09:** Auto-skip-minor mode = skip INFO findings, auto-debug WARN + ERROR. Uses existing severity model from Phase 5 D-02.
- **D-10:** Ignore patterns recorded in learnings.md as IGNORE entries. Eval reads learnings.md on future runs to pre-filter matching patterns.

### Debug Agent Fix Cycles
- **D-11:** Debug creates mini execution plans: groups related findings by file, 1-3 fix tasks per plan. Uses existing execution orchestrator scoped down.
- **D-12:** Design decisions escalated with 2-3 concrete options + file:line evidence. User picks, debug implements the chosen option.
- **D-13:** Scoped re-verify (only changed files) and scoped re-eval (only targeted findings) per cycle. New findings from fix count toward next cycle.
- **D-14:** After max cycles (default 3, configurable via eval.auto_debug_max_cycles): status report with what was tried, why it failed, and suggested manual fix. User can retry, ignore, or defer to TODO.
- **D-15:** Debug agent receives golden file excerpts from convention violations as fix patterns — concrete examples to follow for higher fix accuracy.
- **D-16:** Atomic commits per finding group. Each mini fix plan gets its own commit. Easy to revert individual fixes if they cause regressions.

### Pipeline Integration
- **D-17:** Step 6 in orient skill body: eval -> gate -> debug loop. Skill body orchestrates, matching the execution dispatch pattern from Phase 4.
- **D-18:** Separate CLIs: `run-eval.ts` (verify results -> findings) and `run-debug.ts` (findings -> fix plans). Skill body calls both. Testable independently.
- **D-19:** Eval appends `## Eval Results` section to existing verify report file. Debug appends `## Debug Cycle N`. Single source of truth at `reports/[task]-[date].md`.
- **D-20:** Loop terminates when: (a) no ERROR/WARN findings remain, (b) user approves remaining in interactive mode, or (c) max cycles hit with status report.

### Eval Agent Model & Token Budget
- **D-21:** Eval uses `agents.eval_judge.model` from config — same model as code review (Phase 5 D-25). Eval is a judgment task, consistent model.
- **D-22:** Large diffs chunked by file groups (~50K token threshold). Eval per chunk, findings merged and deduplicated. Scope/completeness criteria get full scope contract regardless.

### Debug Agent Context Scoping
- **D-23:** Debug context per fix plan: specific findings + affected file content + golden file excerpts + scope contract. Matches Phase 4 agent scoping pattern.
- **D-24:** Debug reuses Phase 4 execution orchestrator for fix execution — same atomic commits, coordination logging, failure handling. Less new code.

### MCP Tool
- **D-25:** `codescope_eval` MCP tool with inputs: files, task_slug (optional), checks (criteria subset). Returns structured JSON findings. Matches codescope_verify tool pattern.

### Error Handling
- **D-26:** Eval LLM failure: retry once, then report as "unavailable" with error reason. Verify results still valid. Pipeline continues to summary.
- **D-27:** Debug crash: committed fixes (atomic per finding group) preserved in git. Uncommitted changes discarded. Report shows what was fixed vs what remains.

### Auto-Selected Defaults
- **D-28:** Debug agent uses the default executor model (not eval_judge) — debug is a coding task, not judgment. Matches Phase 4 execution agent model.
- **D-29:** Design decision detection: if a fix would change public API, remove functionality, or contradict scope contract → escalate. Code-only fixes (style, convention, null checks) → auto-fix.
- **D-30:** No config schema changes needed. Existing eval.mode, eval.auto_debug_max_cycles, and eval.criteria fields cover all Phase 6 behavior.
- **D-31:** codescope_eval MCP tool gracefully degrades without orient artifacts — returns partial eval on convention_adherence and correctness only. scope_compliance and completeness marked "unavailable." Matches Phase 5 D-29 pattern.
- **D-32:** Debug agent has full MCP tool access (codescope_blast_radius, codescope_conventions, codescope_recall) during fixes. Matches Phase 4 D-33 for execution agents.

### Claude's Discretion
- No areas deferred to Claude's discretion — all gray areas received explicit user decisions or recommended defaults.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Specification
- `CODESCOPE-SPEC-V6.md` — Full product spec. Eval criteria, user gate modes, debug cycle flow, finding format.

### Build Instructions
- `CODESCOPE-BUILD-INSTRUCTIONS.md` — Environment setup, dependency versions, test framework.

### Project Context
- `.planning/PROJECT.md` — Key decisions: thin orchestrator (<15K tokens), filesystem coordination, suggestion-only conventions.
- `.planning/REQUIREMENTS.md` — Phase 6 requirements: EVAL-01 through EVAL-04, GATE-01 through GATE-04, DBUG-01 through DBUG-07.
- `.planning/ROADMAP.md` — Phase 6 goal, success criteria, dependency on Phase 5.

### Technology Stack
- `CLAUDE.md` §Technology Stack — vitest for testing, TypeScript patterns.

### Prior Phase Context & Code
- `.planning/phases/04-orient-and-execution-engine/04-CONTEXT.md` — D-28 (coordination file), D-31 (agent context scoping), D-33 (MCP tool access during execution), D-36 (failure model with partial results), D-44 (execution config).
- `.planning/phases/05-verification/05-CONTEXT.md` — D-01 (report format), D-02 (severity levels), D-04 (golden file refs in violations), D-20 (agent module pattern), D-21 (verify always proceeds to eval), D-25 (eval_judge model for code review).

### Existing Code
- `src/verify/types.ts` — VerifyReport, StaticVerifyResult, RuntimeVerifyResult types that eval consumes.
- `src/verify/report-writer.ts` — Report assembly pattern. Eval appends to existing reports.
- `src/verify/run-verify.ts` — CLI entry point pattern for run-eval.ts and run-debug.ts.
- `src/execution/orchestrator.ts` — Execution orchestrator that debug reuses for fix execution.
- `src/execution/agent-spawner.ts` — Agent prompt construction pattern for debug agents.
- `src/config/schema.ts` — eval section: mode, auto_debug_max_cycles, criteria booleans.
- `src/config/defaults.ts` — eval_judge model default, auto_debug_max_cycles: 3.
- `src/tools/helpers.ts` — okResponse/errorResponse/buildMetadata for MCP tool.
- `src/tools/verify.ts` — MCP tool pattern for codescope_eval.
- `skills/orient/SKILL.md` — Orient skill body where Step 6 will be added.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Verify types** (src/verify/types.ts): StaticVerifyResult, RuntimeVerifyResult — eval agent consumes these directly as structured JSON input.
- **Report writer** (src/verify/report-writer.ts): Section-builder pattern. Eval and debug append sections to the same report file.
- **CLI entry point** (src/verify/run-verify.ts): Pattern for run-eval.ts and run-debug.ts — arg parsing, stub callbacks, stderr dispatch protocol.
- **Execution orchestrator** (src/execution/orchestrator.ts): readPlanFromDisk, execution summary. Debug reuses for fix execution with mini plans.
- **Agent spawner** (src/execution/agent-spawner.ts): buildAgentPrompt, buildAgentInvocation. Pattern for constructing debug agent prompts.
- **MCP tool pattern** (src/tools/verify.ts): Check type enum, graceful degradation, capabilities/upcoming metadata. Pattern for codescope_eval tool.

### Established Patterns
- Agent module pattern: Options + Result + async function (Phase 2 D-05, used by all agents)
- ExecutionCallbacks pattern: orchestrator prepares invocations, skill body dispatches Tool calls (Phase 4)
- MCP tool handler extraction: handleXxx for tests, registerXxxTool for MCP registration (Phase 3)
- Structured JSON responses with status/data/metadata and capabilities/upcoming arrays
- CLI stderr dispatch protocol: stub callbacks emit JSON on stderr for skill body to intercept and dispatch sub-agents

### Integration Points
- New `src/eval/` — eval-agent.ts, types.ts, report-appender.ts
- New `src/debug/` — debug-agent.ts, fix-planner.ts, types.ts
- New `src/eval/run-eval.ts` — CLI entry point for eval
- New `src/debug/run-debug.ts` — CLI entry point for debug
- New `src/tools/eval.ts` — codescope_eval MCP tool
- Modified `skills/orient/SKILL.md` — add Step 6: Eval + Gate + Debug loop
- Modified `src/orient/pipeline.ts` — aware of eval step after verify

</code_context>

<specifics>
## Specific Ideas

- Eval findings include `evidence` field with specific code snippets or verify data proving the finding — debug agent uses this to understand what's wrong without re-analyzing.
- Golden file excerpts from convention violations flow through: verify detects violation with golden ref (Phase 5 D-04) → eval includes in finding → debug reads golden file as fix pattern. End-to-end convention guidance.
- Design decision detection heuristic: if the fix changes a function signature, removes a public export, or modifies behavior described in the scope contract → escalate. Everything else → auto-fix.
- Ignore patterns in learnings.md create a feedback loop: user ignores "convention X in test files" → learnings.md records it → next eval pre-filters matching findings → fewer false positives over time.
- Scoped re-verify per cycle avoids full test suite runs during debug — only changed files are re-checked. Full verification already ran in Phase 5.
- File-chunked eval for large diffs ensures every file gets evaluated even on big changes. Scope/completeness criteria always see the full scope contract for holistic judgment.

</specifics>

<deferred>
## Deferred Ideas

- Multi-model eval ensemble (run eval with 2+ models, merge findings) — v2 scope, single model sufficient for v1
- Eval learning from user gate behavior (which findings users consistently ignore → auto-tune severity) — Phase 7 learning system partially covers this via ignore patterns
- Cross-task eval comparison (track finding rates across tasks to detect systemic issues) — v2 analytics
- Debug agent self-improvement (learning which fix strategies work for which finding types) — v2 learning integration

</deferred>

---

*Phase: 06-eval-user-gate-and-debug*
*Context gathered: 2026-03-24*
