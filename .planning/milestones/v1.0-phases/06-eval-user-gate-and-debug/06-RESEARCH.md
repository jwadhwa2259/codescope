# Phase 6: Eval, User Gate, and Debug - Research

**Researched:** 2026-03-24
**Domain:** LLM-as-judge evaluation, interactive user gate, autonomous debug loop
**Confidence:** HIGH

## Summary

Phase 6 builds three interconnected subsystems: (1) an eval agent that uses LLM-as-judge to score code changes on 4 configurable criteria, (2) a user gate that presents findings for triage in three modes (interactive, auto-debug, auto-skip-minor), and (3) a debug agent that creates targeted fix plans and re-executes through the existing execution orchestrator in a bounded loop (max 3 cycles).

The key insight from codebase analysis is that Phase 6 is architecturally a consumer and composer of Phase 4 and Phase 5 infrastructure. The eval agent consumes the same structured JSON types (StaticVerifyResult, RuntimeVerifyResult) that the verify pipeline produces. The debug agent reuses the execution orchestrator, agent spawner, and coordination patterns already built. The MCP tool follows the identical pattern established by codescope_verify. This means Phase 6 requires minimal new infrastructure -- it is primarily new agent logic, a new CLI entry point pair (run-eval.ts, run-debug.ts), type definitions, report appending, and skill body integration.

**Primary recommendation:** Build eval and debug as parallel module directories (src/eval/, src/debug/) following the exact agent module pattern (Options + Result + async function) from Phase 2, with CLI entry points following the run-verify.ts stderr dispatch protocol from Phase 5. The user gate logic lives in the skill body (SKILL.md Step 6) since it requires interactive user input that only the orchestrating skill can handle.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Eval agent consumes structured JSON (StaticVerifyResult + RuntimeVerifyResult), not the markdown report. Precise, parseable, no information loss.
- **D-02:** Per-criterion pass/fail with severity-tagged findings list. ERROR in a criterion = FAIL, WARN-only = PASS with warnings. No numeric scores -- findings list IS the evidence.
- **D-03:** Eval reads full context: verify JSON + scope contract + execution plan + git diff + coordination log. Can judge "did you do what you said you'd do?" and "did you stay in scope?"
- **D-04:** Disabled criteria (eval.criteria booleans in config) skipped entirely with "SKIPPED: Disabled in config" in report. Only enabled criteria scored.
- **D-05:** Single LLM prompt with all context, eval judges all enabled criteria at once. Lower latency, holistic judgment -- findings often span criteria.
- **D-06:** Findings as structured JSON: `{ criterion, file, line, description, severity, evidence }`. Parseable by debug agent. Evidence = specific code or verify data that proves the finding.
- **D-07:** Interactive mode groups findings by criterion (scope, conventions, completeness, correctness), severity-sorted (ERRORs first) within each group.
- **D-08:** "Defer to TODO" appends to learnings.md with status TODO and file:line context. Phase 7 learning system will surface these.
- **D-09:** Auto-skip-minor mode = skip INFO findings, auto-debug WARN + ERROR. Uses existing severity model from Phase 5 D-02.
- **D-10:** Ignore patterns recorded in learnings.md as IGNORE entries. Eval reads learnings.md on future runs to pre-filter matching patterns.
- **D-11:** Debug creates mini execution plans: groups related findings by file, 1-3 fix tasks per plan. Uses existing execution orchestrator scoped down.
- **D-12:** Design decisions escalated with 2-3 concrete options + file:line evidence. User picks, debug implements the chosen option.
- **D-13:** Scoped re-verify (only changed files) and scoped re-eval (only targeted findings) per cycle. New findings from fix count toward next cycle.
- **D-14:** After max cycles (default 3, configurable via eval.auto_debug_max_cycles): status report with what was tried, why it failed, and suggested manual fix. User can retry, ignore, or defer to TODO.
- **D-15:** Debug agent receives golden file excerpts from convention violations as fix patterns -- concrete examples to follow for higher fix accuracy.
- **D-16:** Atomic commits per finding group. Each mini fix plan gets its own commit. Easy to revert individual fixes if they cause regressions.
- **D-17:** Step 6 in orient skill body: eval -> gate -> debug loop. Skill body orchestrates, matching the execution dispatch pattern from Phase 4.
- **D-18:** Separate CLIs: `run-eval.ts` (verify results -> findings) and `run-debug.ts` (findings -> fix plans). Skill body calls both. Testable independently.
- **D-19:** Eval appends `## Eval Results` section to existing verify report file. Debug appends `## Debug Cycle N`. Single source of truth at `reports/[task]-[date].md`.
- **D-20:** Loop terminates when: (a) no ERROR/WARN findings remain, (b) user approves remaining in interactive mode, or (c) max cycles hit with status report.
- **D-21:** Eval uses `agents.eval_judge.model` from config -- same model as code review (Phase 5 D-25). Eval is a judgment task, consistent model.
- **D-22:** Large diffs chunked by file groups (~50K token threshold). Eval per chunk, findings merged and deduplicated. Scope/completeness criteria get full scope contract regardless.
- **D-23:** Debug context per fix plan: specific findings + affected file content + golden file excerpts + scope contract. Matches Phase 4 agent scoping pattern.
- **D-24:** Debug reuses Phase 4 execution orchestrator for fix execution -- same atomic commits, coordination logging, failure handling. Less new code.
- **D-25:** `codescope_eval` MCP tool with inputs: files, task_slug (optional), checks (criteria subset). Returns structured JSON findings. Matches codescope_verify tool pattern.
- **D-26:** Eval LLM failure: retry once, then report as "unavailable" with error reason. Verify results still valid. Pipeline continues to summary.
- **D-27:** Debug crash: committed fixes (atomic per finding group) preserved in git. Uncommitted changes discarded. Report shows what was fixed vs what remains.
- **D-28:** Debug agent uses the default executor model (not eval_judge) -- debug is a coding task, not judgment. Matches Phase 4 execution agent model.
- **D-29:** Design decision detection: if a fix would change public API, remove functionality, or contradict scope contract -> escalate. Code-only fixes (style, convention, null checks) -> auto-fix.
- **D-30:** No config schema changes needed. Existing eval.mode, eval.auto_debug_max_cycles, and eval.criteria fields cover all Phase 6 behavior.
- **D-31:** codescope_eval MCP tool gracefully degrades without orient artifacts -- returns partial eval on convention_adherence and correctness only. scope_compliance and completeness marked "unavailable." Matches Phase 5 D-29 pattern.
- **D-32:** Debug agent has full MCP tool access (codescope_blast_radius, codescope_conventions, codescope_recall) during fixes. Matches Phase 4 D-33 for execution agents.

### Claude's Discretion
No areas deferred to Claude's discretion -- all gray areas received explicit user decisions or recommended defaults.

### Deferred Ideas (OUT OF SCOPE)
- Multi-model eval ensemble (run eval with 2+ models, merge findings) -- v2 scope, single model sufficient for v1
- Eval learning from user gate behavior (which findings users consistently ignore -> auto-tune severity) -- Phase 7 learning system partially covers this via ignore patterns
- Cross-task eval comparison (track finding rates across tasks to detect systemic issues) -- v2 analytics
- Debug agent self-improvement (learning which fix strategies work for which finding types) -- v2 learning integration
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVAL-01 | Eval agent (LLM-as-judge) reads scope contract, plan, coordination log, git diff, verify report, and research output | D-03: full context reading. Existing artifacts at known paths. Eval prompt assembly pattern from agent-spawner.ts buildAgentPrompt. |
| EVAL-02 | Eval scores on 4 criteria: scope compliance, convention adherence, completeness, correctness | D-02/D-04/D-05: single prompt, per-criterion pass/fail, configurable criteria from eval.criteria config booleans. |
| EVAL-03 | Each finding has severity (LOW/MEDIUM/HIGH) and categorization (missing implementation, incorrect implementation, design decision) | D-06: structured JSON finding format `{ criterion, file, line, description, severity, evidence }`. Maps severity to LOW=INFO, MEDIUM=WARN, HIGH=ERROR for consistency with Phase 5 Severity type. Finding categorization added as a field. |
| EVAL-04 | Eval report appended to verify report at .claude/codescope/reports/[task]-[date].md | D-19: report-writer.ts section-builder pattern. fs.appendFileSync to existing report file. |
| GATE-01 | In interactive mode, user sees eval findings and can select which to debug, ignore, or defer to TODO | D-07: grouped by criterion, severity-sorted. Implemented in SKILL.md Step 6 since it needs user interaction. |
| GATE-02 | Auto-debug mode sends all findings directly to debug (configurable in config.md) | D-09: eval.mode config controls routing. No user interaction needed. |
| GATE-03 | Auto-skip-minor mode only sends MEDIUM+ findings to debug, auto-ignores LOW | D-09: filter findings by severity, skip INFO/LOW. Uses existing severity hierarchy. |
| GATE-04 | User ignore patterns captured by learning system for future eval tuning | D-10: append IGNORE entries to learnings.md. Eval reads learnings.md to pre-filter on subsequent runs. |
| DBUG-01 | Debug agent reads findings and creates targeted fix plans (not full re-orient) | D-11: mini execution plans grouping findings by file. 1-3 fix tasks per plan. |
| DBUG-02 | Debug agent has full tool access: file tools, Bash, CodeScope MCP tools, Context7, web search | D-32: AGENT_TOOLS list extended to include codescope_blast_radius, codescope_conventions, codescope_recall, Context7, WebSearch. Matches Phase 4 D-33. |
| DBUG-03 | Fix plan goes to execution agents -- only agents responsible for broken pieces re-execute | D-24: reuse execution orchestrator with scoped-down mini plan. Only affected agents dispatched. |
| DBUG-04 | Re-verify runs on just changed files, re-eval runs on just fixed findings | D-13: scoped re-verify passes only changed files to run-verify.ts. Scoped re-eval filters findings to only those targeted by the fix. |
| DBUG-05 | Design decisions escalate to user with concrete options | D-12/D-29: detection heuristic (public API change, functionality removal, scope contradiction). Escalation format: 2-3 options + file:line evidence. |
| DBUG-06 | Max 3 debug cycles (configurable), then defer to user with status report | D-14/D-20: eval.auto_debug_max_cycles config (default 3). Status report includes attempts, failures, suggested manual fix. |
| DBUG-07 | Debug resolution rate >80% of findings fixed within 3 cycles | D-15: golden file excerpts increase fix accuracy. D-23: scoped context per fix plan. Quality requirement verified by eval pass rate across cycles. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack**: TypeScript, vitest for testing, zod/v4 for schemas, @modelcontextprotocol/sdk ^1.27.1 for MCP tools
- **Performance**: Orchestrator <15K tokens -- eval/debug loop must stay thin
- **Quality**: Eval finding accuracy >70%, debug resolution >80% within 3 cycles
- **Patterns**: ESM-first with type:module, NodeNext module resolution
- **Testing**: vitest with `vitest run` command, tests in `tests/` directory
- **MCP tools**: handleXxx pattern for testability, registerXxxTool for registration
- **Config**: YAML-based config loaded via config/loader.ts, validated against ConfigSchema

## Standard Stack

### Core (No New Dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.7 | Primary language | Project standard |
| vitest | ^4.1.0 | Test framework | Project standard |
| zod | ^3.25 (import from zod/v4) | Schema validation for MCP tool inputs | MCP SDK peer dependency, project standard |
| @modelcontextprotocol/sdk | ^1.27.1 | MCP tool registration for codescope_eval | Project standard |

### No New Dependencies Required
Phase 6 requires zero new npm dependencies. All functionality is built from:
- Existing TypeScript standard library (fs, path, child_process)
- Existing project dependencies (zod/v4 for MCP tool schemas, @modelcontextprotocol/sdk for tool registration)
- Existing codebase modules (execution orchestrator, agent spawner, report writer, config loader, path utilities)

The eval agent's LLM-as-judge functionality is implemented through the skill body's sub-agent dispatch pattern (Agent tool), not through a separate LLM client library. The debug agent similarly dispatches through the existing execution callbacks pattern.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── eval/
│   ├── types.ts                # EvalOptions, EvalResult, EvalFinding, EvalCriterionResult
│   ├── eval-agent.ts           # Core eval logic: prompt assembly, findings parsing
│   ├── report-appender.ts      # Append eval/debug sections to verify report
│   ├── ignore-filter.ts        # Load learnings.md IGNORE patterns, pre-filter findings
│   └── run-eval.ts             # CLI entry point (stderr dispatch protocol)
├── debug/
│   ├── types.ts                # DebugOptions, DebugResult, FixPlan, DebugCycle
│   ├── debug-agent.ts          # Core debug logic: fix plan creation, escalation detection
│   ├── fix-planner.ts          # Group findings by file, create mini execution plans
│   └── run-debug.ts            # CLI entry point (stderr dispatch protocol)
├── tools/
│   └── eval.ts                 # codescope_eval MCP tool (handleEval + registerEvalTool)
└── ...existing modules unchanged
skills/
└── orient/
    └── SKILL.md                # Modified: Step 6 added (eval -> gate -> debug loop)
```

### Pattern 1: Agent Module Pattern (from Phase 2 D-05)
**What:** Options interface + Result interface + async function + optional artifact writer
**When to use:** Every agent module in the codebase follows this pattern
**Example:**
```typescript
// src/eval/eval-agent.ts
export interface EvalOptions {
  projectRoot: string;
  taskSlug: string;
  verifyResult: {
    static: StaticVerifyResult;
    runtime: RuntimeVerifyResult;
  };
  scopeContractPath: string;
  planPath: string;
  coordinationPath: string;
  researchPath: string | null;
  enabledCriteria: {
    scope_compliance: boolean;
    convention_adherence: boolean;
    completeness: boolean;
    correctness: boolean;
  };
  ignorePatterns: IgnorePattern[];
}

export interface EvalResult {
  criteria: EvalCriterionResult[];
  findings: EvalFinding[];
  overallStatus: "PASS" | "FAIL";
  timing_ms: number;
}

export async function runEval(
  options: EvalOptions,
  callbacks: EvalCallbacks,
): Promise<EvalResult> {
  // ... core eval logic
}
```

### Pattern 2: CLI Stderr Dispatch Protocol (from Phase 5)
**What:** CLI entry point emits dispatch requests on stderr, returns structured JSON on stdout. Skill body intercepts stderr, dispatches sub-agents, and re-invokes with results.
**When to use:** For run-eval.ts and run-debug.ts
**Example:**
```typescript
// src/eval/run-eval.ts
const callbacks: EvalCallbacks = {
  dispatchEvalAgent: async (prompt: string) => {
    console.error(JSON.stringify({ type: "dispatch_eval", prompt }));
    return "[]"; // Stub -- skill body dispatches actual LLM agent
  },
  onProgress: (msg: string) => console.error(msg),
};
```

### Pattern 3: Report Section Appender (extending Phase 5 report-writer.ts)
**What:** Append new sections to an existing markdown report file
**When to use:** Eval appends "## Eval Results", debug appends "## Debug Cycle N"
**Example:**
```typescript
// src/eval/report-appender.ts
export function appendEvalSection(
  reportPath: string,
  evalResult: EvalResult,
): void {
  const section = buildEvalSection(evalResult);
  fs.appendFileSync(reportPath, "\n\n" + section, "utf-8");
}

export function appendDebugCycleSection(
  reportPath: string,
  cycleNumber: number,
  cycleResult: DebugCycleResult,
): void {
  const section = buildDebugCycleSection(cycleNumber, cycleResult);
  fs.appendFileSync(reportPath, "\n\n" + section, "utf-8");
}
```

### Pattern 4: MCP Tool Handler Extraction (from Phase 3)
**What:** handleEval exported for tests, registerEvalTool for MCP registration
**When to use:** For the codescope_eval tool
**Example:**
```typescript
// src/tools/eval.ts
export async function handleEval(
  projectRoot: string,
  input: EvalInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  // Core logic -- testable without MCP transport
}

export function registerEvalTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool("codescope_eval", description, schema, handler);
}
```

### Pattern 5: Mini Execution Plan for Debug (extending Phase 4)
**What:** Debug creates scoped-down ExecutionPlan with 1-3 agents that reuses the existing orchestrator
**When to use:** When debug needs to dispatch fix agents
**Example:**
```typescript
// src/debug/fix-planner.ts
export function createFixPlan(
  findings: EvalFinding[],
  taskSlug: string,
  goldenFiles: Map<string, string>,
): ExecutionPlan {
  // Group findings by file
  // Create one agent assignment per file group (1-3 agents)
  // Set strategy to "sequential" (fix plans are small)
  // Return ExecutionPlan compatible with existing orchestrator
}
```

### Pattern 6: Skill Body Eval-Gate-Debug Loop (Step 6 in SKILL.md)
**What:** The skill body orchestrates the eval -> user gate -> debug cycle, since user interaction can only happen at the skill level
**When to use:** Step 6 in the orient skill body
**Structure:**
```
Step 6: Eval + Gate + Debug Loop
  6a. Run eval CLI: node --import tsx/esm src/eval/run-eval.ts --phase eval ...
  6b. Dispatch eval sub-agent with prompt from stderr
  6c. Parse findings from eval result
  6d. User gate (mode-dependent):
      - interactive: present findings, user selects debug/ignore/defer
      - auto-debug: send all to debug
      - auto-skip-minor: filter INFO, send WARN+ERROR to debug
  6e. If findings to debug:
      6e.i.   Run debug CLI: node --import tsx/esm src/debug/run-debug.ts ...
      6e.ii.  Dispatch fix agents with prompts from stderr
      6e.iii. Scoped re-verify (only changed files)
      6e.iv.  Scoped re-eval (only targeted findings)
      6e.v.   Check cycle count (max from eval.auto_debug_max_cycles)
      6e.vi.  Loop back to 6d if findings remain and cycles < max
  6f. After loop: write final status to report
```

### Anti-Patterns to Avoid
- **Full re-orient in debug:** Debug creates targeted mini plans, never restarts the full orient pipeline. This is the core design constraint (D-11).
- **Numeric scoring for eval:** Findings list IS the evidence. No weighted averages or numeric scores (D-02).
- **Debug agent spawning sub-agents:** Debug dispatches through the existing execution orchestrator callbacks, never nests agent spawning (spec: orchestrator manages all spawning).
- **User interaction in CLI entry points:** User gate logic belongs in SKILL.md only. The CLIs are pure input -> output pipelines.
- **Embedding LLM context in orchestrator:** Eval prompt assembly happens in eval-agent.ts, passed to skill body as a prompt string. The skill body dispatches the actual LLM agent. Keeps orchestrator thin (<15K tokens).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Execution plan dispatch | Custom agent dispatch loop for debug fixes | Existing `runExecution()` from `src/execution/orchestrator.ts` with a mini ExecutionPlan | Already handles wave scheduling, retry, coordination logging, failure cascading (D-24) |
| Agent prompt construction | Custom prompt builder for debug agents | Existing `buildAgentPrompt()` and `buildAgentInvocation()` from `src/execution/agent-spawner.ts` | Already handles 10 scoped sections, coordination context, SendMessage protocol (D-23) |
| Report writing | Custom file writer for eval/debug results | `fs.appendFileSync` to existing report + section-builder helper pattern from `report-writer.ts` | Single source of truth (D-19), consistent formatting |
| Config loading and validation | Manual YAML parsing for eval config | Existing `loadConfig()` from `src/config/loader.ts` with existing ConfigSchema eval section | Config schema already has eval.mode, eval.auto_debug_max_cycles, eval.criteria (D-30) |
| MCP tool response formatting | Custom JSON response builder | Existing `okResponse`, `errorResponse`, `partialResponse`, `buildMetadata` from `src/tools/helpers.ts` | Consistent response format across all 12+ MCP tools |
| Severity classification | New severity type system | Existing `Severity` type ("ERROR" \| "WARN" \| "INFO") from `src/verify/types.ts` | Consistent with Phase 5 severity model (D-09) |
| Coordination file management | Custom log file for debug cycles | Existing `appendCoordinationEntry()` from `src/execution/coordination.ts` | Append-only audit trail, same format (D-24) |

**Key insight:** Phase 6 is ~70% composition of existing Phase 4/5 infrastructure with ~30% new eval/debug agent logic. The temptation is to build parallel infrastructure -- resist it.

## Common Pitfalls

### Pitfall 1: Token Budget Overflow in Eval Prompt
**What goes wrong:** Eval prompt exceeds context window by including full git diff, full scope contract, full coordination log, and full verify JSON simultaneously.
**Why it happens:** D-03 says eval reads "full context" but large codebases produce massive diffs.
**How to avoid:** D-22 specifies chunking: large diffs split by file groups (~50K token threshold). Eval per chunk, findings merged and deduplicated. Scope/completeness criteria always get the full scope contract regardless of chunk. Implement a tokenEstimate() helper that counts characters / 4 as a rough token approximation.
**Warning signs:** Eval returning empty or garbled findings on large changes. LLM errors about context length.

### Pitfall 2: Debug Loop Never Terminates
**What goes wrong:** Debug creates fixes that introduce new findings, or fixes that break previously passing criteria, creating an infinite loop.
**Why it happens:** New findings from a fix count toward the next cycle (D-13), but if every fix creates a new finding, cycles never converge.
**How to avoid:** D-14 hard caps at max cycles (default 3). D-20 terminates on: (a) no ERROR/WARN remain, (b) user approves, or (c) max cycles hit. Always track finding_id continuity -- if the same finding reappears after a fix, mark it as "unresolved" rather than "new."
**Warning signs:** Cycle count approaching max with no finding reduction. Same file:line appearing in multiple cycles.

### Pitfall 3: Stale Report Path After Debug Commits
**What goes wrong:** Debug makes atomic commits (D-16) that change files, but the verify report path was computed at the start of the pipeline. If the date changes during a long debug loop, the report path becomes stale.
**Why it happens:** Report filename is `{taskSlug}-{ISO-date}.md`. A multi-hour debug session crosses midnight.
**How to avoid:** Compute report path once at eval start, pass it through all cycles. The report file is created during verify (Phase 5), eval appends to it. Do not recompute the path.
**Warning signs:** appendFileSync throwing ENOENT during debug cycle 2+.

### Pitfall 4: Design Decision Escalation False Positives
**What goes wrong:** Debug escalates too many findings as "design decisions" when they are straightforward code fixes.
**Why it happens:** The heuristic (D-29: changes public API, removes functionality, contradicts scope) is applied too broadly.
**How to avoid:** Be precise in the escalation detection: only escalate when the fix REQUIRES choosing between fundamentally different approaches (e.g., in-memory vs Redis), not when it requires adding missing error handling or fixing a type. The detection prompt should explicitly ask: "Does this fix require choosing between alternative architectures?"
**Warning signs:** User being asked design questions for trivial fixes. Escalation rate >20% of findings.

### Pitfall 5: Scoped Re-Verify Missing Files
**What goes wrong:** Debug fix changes file A to fix a finding, but the fix also requires changes to file B (a transitive dependency). Scoped re-verify only checks file A, misses that file B now has a type error.
**Why it happens:** D-13 says "only changed files" but git diff after the fix commit shows both files changed.
**How to avoid:** Use git diff --name-only HEAD~1 after each fix commit to determine the actual changed files for re-verify, rather than using the finding's file list.
**Warning signs:** Build failures appearing in debug cycle N+1 that should have been caught in cycle N.

### Pitfall 6: Ignore Pattern Matching Too Broadly
**What goes wrong:** User ignores "convention X in test files" but the IGNORE pattern matches convention X in all files, suppressing valid findings.
**Why it happens:** Ignore patterns stored in learnings.md need to capture the scope (file pattern, criterion) not just the finding description.
**How to avoid:** Store ignore patterns as structured entries: `{ pattern: "convention_name", scope: "tests/**", criterion: "convention_adherence" }`. Match on all three fields. D-10 says patterns go in learnings.md -- use a parseable format within the markdown (e.g., code block with JSON).
**Warning signs:** Findings disappearing from eval results that should still be flagged.

## Code Examples

### EvalFinding Type Definition
```typescript
// src/eval/types.ts
import type { Severity } from "../verify/types.js";

/** Finding categories per EVAL-03 */
export type FindingCategory =
  | "missing_implementation"
  | "incorrect_implementation"
  | "design_decision";

/** Eval criteria per EVAL-02 */
export type EvalCriterion =
  | "scope_compliance"
  | "convention_adherence"
  | "completeness"
  | "correctness";

/** Single eval finding per D-06 */
export interface EvalFinding {
  id: string;                  // Unique ID for tracking across cycles
  criterion: EvalCriterion;
  category: FindingCategory;
  file: string;
  line: number;
  description: string;
  severity: Severity;          // Reuse Phase 5 type: "ERROR" | "WARN" | "INFO"
  evidence: string;            // Specific code or verify data proving the finding
  goldenFileRef?: string;      // Golden file path if convention violation
}

/** Per-criterion result per D-02 */
export interface EvalCriterionResult {
  criterion: EvalCriterion;
  status: "PASS" | "FAIL" | "SKIPPED";
  findings: EvalFinding[];
  detail?: string;             // "SKIPPED: Disabled in config" per D-04
}

/** Eval callbacks for LLM dispatch */
export interface EvalCallbacks {
  dispatchEvalAgent: (prompt: string) => Promise<string>;
  onProgress: (message: string) => void;
}
```

### Eval Prompt Assembly
```typescript
// src/eval/eval-agent.ts - prompt assembly (not the full function)
function buildEvalPrompt(options: EvalOptions): string {
  const sections: string[] = [];

  sections.push(`# Eval Agent: LLM-as-Judge

You are evaluating code changes against the scope contract and project conventions.
Score each enabled criterion as PASS or FAIL with structured findings.`);

  // Enabled criteria
  const criteria = Object.entries(options.enabledCriteria)
    .filter(([_, enabled]) => enabled)
    .map(([name]) => name);
  sections.push(`## Criteria to Evaluate\n${criteria.join(", ")}`);

  // Scope contract by reference
  sections.push(`## Scope Contract\nRead: \`${options.scopeContractPath}\``);

  // Plan by reference
  sections.push(`## Execution Plan\nRead: \`${options.planPath}\``);

  // Coordination log by reference
  sections.push(`## Coordination Log\nRead: \`${options.coordinationPath}\``);

  // Verify results as inline JSON (structured, parseable per D-01)
  sections.push(`## Verify Results\n\`\`\`json\n${JSON.stringify(options.verifyResult, null, 2)}\n\`\`\``);

  // Research by reference
  if (options.researchPath) {
    sections.push(`## Research\nRead: \`${options.researchPath}\``);
  }

  // Output format instruction
  sections.push(`## Output Format
Return findings as a JSON array:
\`\`\`json
[
  {
    "criterion": "completeness",
    "category": "missing_implementation",
    "file": "src/order/webhook-handler.ts",
    "line": 42,
    "description": "Idempotency key uses in-memory Set",
    "severity": "WARN",
    "evidence": "Line 42: const processedIds = new Set<string>()"
  }
]
\`\`\`

For each criterion, state PASS or FAIL before the findings list.`);

  return sections.join("\n\n");
}
```

### Fix Plan Creation
```typescript
// src/debug/fix-planner.ts
import type { ExecutionPlan, AgentAssignment } from "../orient/types.js";
import type { EvalFinding } from "../eval/types.js";

export function createFixPlan(
  findings: EvalFinding[],
  taskSlug: string,
  scopeContractPath: string,
): ExecutionPlan {
  // Group findings by file
  const byFile = new Map<string, EvalFinding[]>();
  for (const f of findings) {
    const existing = byFile.get(f.file) ?? [];
    existing.push(f);
    byFile.set(f.file, existing);
  }

  // Create one agent per file group (cap at 3 per D-11)
  const agents: AgentAssignment[] = [];
  let wave = 1;
  for (const [file, fileFindings] of byFile) {
    if (agents.length >= 3) break;
    agents.push({
      name: `fix-${file.replace(/[^a-z0-9]/gi, "-")}`,
      wave,
      task: `Fix ${fileFindings.length} finding(s) in ${file}: ${fileFindings.map(f => f.description).join("; ")}`,
      exclusiveWriteFiles: [file],
      readOnlyFiles: [],
      conventions: [],
      goldenFiles: fileFindings
        .filter(f => f.goldenFileRef)
        .map(f => ({ path: f.goldenFileRef!, lines: "1-50" })),
      dependsOn: [],
      estimatedTokens: 5000,
      timeoutSeconds: 120,
    });
  }

  return {
    taskSlug: `${taskSlug}-debug`,
    createdAt: new Date().toISOString(),
    status: "APPROVED",
    strategy: "sequential",
    estimatedAgents: agents.length,
    estimatedTotalTokens: agents.length * 5000,
    agents,
    waves: [{ waveNumber: 1, agents: agents.map(a => a.name), mode: "sequential" }],
    validationResults: [],
    removedByUser: [],
  };
}
```

### MCP Tool (codescope_eval)
```typescript
// src/tools/eval.ts - pattern matching codescope_verify
import { z } from "zod/v4";
import { isBootstrapped, okResponse, errorResponse, partialResponse, buildMetadata } from "./helpers.js";

const EvalCriterionType = z.enum([
  "scope_compliance",
  "convention_adherence",
  "completeness",
  "correctness",
]);

export async function handleEval(
  projectRoot: string,
  input: { files: string[]; task_slug?: string; checks?: string[] },
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startMs = Date.now();

  if (!isBootstrapped(projectRoot)) {
    return errorResponse(
      "NOT_BOOTSTRAPPED",
      "No bootstrap data found. Run /codescope:bootstrap first.",
      "Run /codescope:bootstrap to analyze your codebase.",
    );
  }

  // Orient-dependent criteria (D-31)
  const ORIENT_DEPENDENT = ["scope_compliance", "completeness"];
  // ... graceful degradation logic matching codescope_verify pattern
}
```

### Ignore Pattern in learnings.md Format
```markdown
## Ignore Patterns

<!-- machine-readable ignore entries -->
```json
[
  {
    "pattern": "in-memory-data-structure",
    "scope": "tests/**",
    "criterion": "completeness",
    "created": "2026-03-24",
    "reason": "User ignores in-memory test data structures"
  }
]
```
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Full re-execution on every finding | Scoped re-execute: only broken agents re-run | Phase 6 design | 3-5x faster debug cycles |
| Numeric quality scores | Per-criterion pass/fail with evidence | Phase 6 design | More actionable than "score: 7.2" |
| Manual bug triage after every change | LLM-as-judge + user gate + auto-debug loop | Phase 6 design | Autonomous self-correction with user override |
| Single-pass fix attempts | Bounded retry with design decision escalation | Phase 6 design | 80%+ resolution within 3 cycles |

## Open Questions

1. **Git diff size for large changes**
   - What we know: D-22 specifies ~50K token chunking threshold for large diffs
   - What's unclear: Exact implementation of "file group" chunking -- is it by directory, by wave agent, or by arbitrary file count?
   - Recommendation: Chunk by execution agent (files each agent was responsible for). This preserves logical groupings and makes scope/completeness evaluation meaningful per chunk. If a single agent's diff exceeds 50K tokens, further split by file within that agent's output.

2. **Finding ID continuity across debug cycles**
   - What we know: Findings need unique IDs to track across cycles (was this finding fixed? did it reappear?)
   - What's unclear: Best strategy for ID generation that survives re-eval
   - Recommendation: Hash-based IDs from `criterion + file + line_range + description_keywords`. Allows matching across cycles even if line numbers shift slightly (use 5-line range buckets).

3. **learnings.md format for ignore patterns**
   - What we know: D-10 says patterns go in learnings.md, D-08 says TODO entries go there too
   - What's unclear: Exact structured format that Phase 7 learning system can parse
   - Recommendation: Use a dedicated `## Ignore Patterns` section with JSON code block (shown in Code Examples above). Machine-readable but still valid markdown. Phase 7 can extend this format.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.0 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/eval/ tests/debug/ tests/tools/eval.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVAL-01 | Eval agent reads all 6 context sources (scope, plan, coord, diff, verify, research) | unit | `npx vitest run tests/eval/eval-agent.test.ts -t "reads all context"` | Wave 0 |
| EVAL-02 | Eval scores 4 criteria with per-criterion pass/fail | unit | `npx vitest run tests/eval/eval-agent.test.ts -t "scores criteria"` | Wave 0 |
| EVAL-03 | Findings have severity + categorization fields | unit | `npx vitest run tests/eval/types.test.ts` | Wave 0 |
| EVAL-04 | Eval report appended to verify report file | unit | `npx vitest run tests/eval/report-appender.test.ts` | Wave 0 |
| GATE-01 | Interactive mode groups findings by criterion, severity-sorted | unit | `npx vitest run tests/eval/eval-agent.test.ts -t "groups findings"` | Wave 0 |
| GATE-02 | Auto-debug mode routes all findings to debug | unit | `npx vitest run tests/eval/eval-agent.test.ts -t "auto-debug"` | Wave 0 |
| GATE-03 | Auto-skip-minor filters INFO findings | unit | `npx vitest run tests/eval/eval-agent.test.ts -t "auto-skip-minor"` | Wave 0 |
| GATE-04 | Ignore patterns captured in learnings.md | unit | `npx vitest run tests/eval/ignore-filter.test.ts` | Wave 0 |
| DBUG-01 | Debug creates targeted fix plans from findings | unit | `npx vitest run tests/debug/fix-planner.test.ts` | Wave 0 |
| DBUG-02 | Debug agent has full MCP tool access | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "tool access"` | Wave 0 |
| DBUG-03 | Fix plan dispatches only broken agents via orchestrator | unit | `npx vitest run tests/debug/fix-planner.test.ts -t "scoped agents"` | Wave 0 |
| DBUG-04 | Scoped re-verify and re-eval | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "scoped re-verify"` | Wave 0 |
| DBUG-05 | Design decisions escalated with options | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "design decision"` | Wave 0 |
| DBUG-06 | Max cycles enforced with status report | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "max cycles"` | Wave 0 |
| DBUG-07 | Resolution rate tracking | unit | `npx vitest run tests/debug/debug-agent.test.ts -t "resolution rate"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/eval/ tests/debug/ tests/tools/eval.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/eval/eval-agent.test.ts` -- covers EVAL-01, EVAL-02, GATE-01, GATE-02, GATE-03
- [ ] `tests/eval/types.test.ts` -- covers EVAL-03 (type validation)
- [ ] `tests/eval/report-appender.test.ts` -- covers EVAL-04
- [ ] `tests/eval/ignore-filter.test.ts` -- covers GATE-04
- [ ] `tests/debug/fix-planner.test.ts` -- covers DBUG-01, DBUG-03
- [ ] `tests/debug/debug-agent.test.ts` -- covers DBUG-02, DBUG-04, DBUG-05, DBUG-06, DBUG-07
- [ ] `tests/tools/eval.test.ts` -- covers codescope_eval MCP tool
- [ ] `tests/eval/` directory -- create directory
- [ ] `tests/debug/` directory -- create directory

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis: `src/verify/types.ts`, `src/verify/report-writer.ts`, `src/verify/run-verify.ts` -- verified Phase 5 patterns
- Existing codebase analysis: `src/execution/orchestrator.ts`, `src/execution/agent-spawner.ts` -- verified Phase 4 patterns
- Existing codebase analysis: `src/tools/verify.ts`, `src/tools/helpers.ts` -- verified MCP tool patterns
- Existing codebase analysis: `src/config/schema.ts`, `src/config/defaults.ts` -- verified config schema already has eval section
- Existing codebase analysis: `skills/orient/SKILL.md` -- verified skill body dispatch pattern
- CODESCOPE-SPEC-V6.md lines 452-596 -- eval, user gate, debug spec sections
- Phase 6 CONTEXT.md -- 32 locked decisions from user discussion

### Secondary (MEDIUM confidence)
- Test pattern analysis: `tests/verify/*.test.ts`, `tests/tools/verify.test.ts` -- established testing patterns

### Tertiary (LOW confidence)
- None -- all findings based on direct codebase analysis and locked decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all existing project libraries
- Architecture: HIGH -- all patterns verified against existing codebase (agent module, CLI dispatch, MCP tool handler, report writer)
- Pitfalls: HIGH -- derived from concrete analysis of Phase 4/5 code and integration points

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable -- internal architecture, no external dependency changes)
