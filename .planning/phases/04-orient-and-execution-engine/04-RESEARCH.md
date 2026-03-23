# Phase 4: Orient and Execution Engine - Research

**Researched:** 2026-03-23
**Domain:** Claude Code sub-agent orchestration, multi-agent execution, filesystem coordination, graph-informed planning
**Confidence:** HIGH

## Summary

Phase 4 implements the core autonomous pipeline: `/codescope:orient [task]` takes a user task description through clarification, research, analysis, planning, validation, and execution. The phase has two major subsystems: (1) the orient pipeline (clarification through plan approval), and (2) the execution engine (hybrid agent spawning with agent teams, sequential, and wave-based execution). Both subsystems build directly on established Phase 1-3 patterns -- the agent module pattern (Options + Result + async function), filesystem coordination (Issue #5812), thin orchestrator (<15K tokens), and the MCP response contract (ok/error/partial envelopes).

The critical platform integration is Claude Code's sub-agent system. The orient skill delegates to the Task/Agent tool for spawning sub-agents. For parallel execution, the planner can leverage agent teams (when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` is enabled) with SendMessage for inter-agent communication, falling back to sequential sub-agents when unavailable. The orient pipeline itself runs as sequential module calls within the skill context -- clarification, research, analysis, and planning are phases, not separate agents. Only the execution phase spawns actual sub-agents.

**Primary recommendation:** Build the orient pipeline as a series of callable TypeScript modules in `src/orient/` that the orient skill body invokes via `node --import tsx/esm` (same pattern as bootstrap). Build the execution engine in `src/execution/` with a hybrid orchestrator that detects agent teams availability at runtime and transparently falls back. All inter-phase state flows through structured markdown files in `execution/[task-slug]/`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Pipeline Flow:**
- D-01: Two-gate pipeline: Clarification -> scope contract -> Gate 1 (user approves scope) -> research (auto) -> planning (auto) -> validation (auto) -> Gate 2 (user approves plan) -> execution
- D-02: `--no-confirm` flag skips both gates. Scope and plan still written to disk for audit trail.

**Scope Contract & Clarification:**
- D-03: Clarification trigger uses graph-informed auto-detection: keyword matching against graph. Low ambiguity = skip, high ambiguity = ask.
- D-04: Full graph context informs clarification questions: affected modules, convention conflicts, danger zones, missing test coverage.
- D-05: Number of clarification questions is dynamic. Soft guardrail after 5+ questions.
- D-06: Questions batched by topic.
- D-07: Minimal clarification style raises ambiguity threshold -- only HIGH-ambiguity gets questions.
- D-08: Gate 1 is quick confirm: In Scope / Out of Scope + affected files count + high-risk files + community boundaries.
- D-09: Scope rejection returns to clarification with rejection reason.

**Research Agent:**
- D-10: Research is task + graph driven: extract libraries/frameworks from affected files, search Context7 for those docs, web search for patterns.
- D-11: Impact-ranked progressive research: score by graph impact, research high-impact thoroughly, mid-impact Context7 only, low-impact skipped.
- D-12: Research output as scoped markdown with Relevant APIs, Best Practices, Known Issues, Version-Specific Notes.
- D-13: Research output referenced in execution plan where relevant.

**Plan Review Gate:**
- D-14: Gate 2 shows full plan: agent assignments, execution order, estimated changes, conventions, hybrid strategy rationale, validation status.
- D-15: Gate 2 actions: approve / edit / reject. Edit allows task-level modifications. Reject aborts to scope.
- D-16: Plan always persisted to disk at plans/[task-slug].md regardless of outcome.
- D-17: Removed tasks logged in "## Removed by User" section.
- D-18: `--no-confirm` writes plan without pausing.

**Plan Validation:**
- D-19: Validation checks: no overlapping file writes in same wave, dependency ordering, scope coverage.
- D-20: Mechanical errors auto-patched (max 2 attempts). Structural errors escalated to Gate 2.
- D-21: User-requested re-plan does full regeneration with feedback as constraints.
- D-22: Validation results in plan file "## Validation" section.
- D-23: Validation runs before Gate 2. User sees clean plan.

**Execution Feedback:**
- D-24: Brief verbosity: phase banners + agent completion in arrival order.
- D-25: Detailed verbosity adds per-agent file lists, change summaries, coordination log.
- D-26: Parallel agent output shown in completion order.
- D-27: Always show execution summary: total time, files changed, agents run, mode, tokens, next step.
- D-28: Coordination file is structured markdown (append-only).
- D-29: SendMessage handoffs and discovery signals also logged to coordination.md.
- D-30: Coordination.md scoped per-task.

**Agent Context & Communication:**
- D-31: Context scoped per agent by planner: tasks, conventions, golden files, coordination, research.
- D-32: Planner estimates token size per agent.
- D-33: Execution agents have full MCP tool access.
- D-34: Progressive coordination context: later agents read earlier entries.
- D-35: Parallel agent communication via structured signals: handoff (ready/done/blocked) and discovery (api_change/new_utility/pattern/warning). One-way broadcasts.

**Agent Failure Behavior:**
- D-36: Auto-retry once. If retry fails, skip agent + dependents. Continue independent agents.
- D-37: Dependent agents skip when dependency fails.
- D-38: Failure summary: succeeded, failed with reason, skipped dependents, suggested next action.
- D-39: Partial execution results left as uncommitted working tree changes.
- D-40: Per-agent timeout estimated by planner.

**Onboarding Agent Teams:**
- D-41: During /codescope:onboard, detect `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var. Ask to enable if not set.
- D-42: Runtime probe at orient start. Graceful fallback to sequential.
- D-43: One-time hint on first sequential fallback. Stored as agent_teams_hint_shown in config.
- D-44: Remove `execute.parallel` enum from config.yml schema. Keep only `max_agents_concurrent`.
- D-45: /codescope:settings allows re-running agent teams detection (Phase 7).

### Claude's Discretion
- No areas deferred to Claude's discretion -- all gray areas received explicit user decisions.

### Deferred Ideas (OUT OF SCOPE)
- Text-based and hybrid search for codescope_search -- deferred from Phase 3
- Full verification (blast radius diff, build/test) for codescope_verify -- Phase 5
- Convention enforcement rollback via /codescope:settings -- Phase 7
- Agent teams settings management via /codescope:settings -- Phase 7
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ONBD-06 | Onboard detects agent teams availability and guides user through enabling it | Claude Code settings.json env var pattern, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` detection via `process.env`, auto-write to `~/.claude/settings.json` |
| ORNT-01 | `/codescope:orient [task]` skill triggers the full autonomous pipeline | Skill SKILL.md with Task tool delegation pattern, `node --import tsx/esm` runner pattern from bootstrap |
| ORNT-02 | Clarification uses knowledge graph for graph-informed questions | Existing `handleOrient()`, `getGraph()`, `computeDangerZones()`, `readRelevantConventions()` from orient.ts/analytics.ts |
| ORNT-03 | Clarification triggers on vague tasks, skips on specific tasks | Keyword extraction from orient.ts, graph match counting, community spread analysis |
| ORNT-04 | Clarification produces scope contract (In Scope / Out of Scope) | Artifact format contract from UI-SPEC: `execution/[task-slug]/scope-contract.md` |
| ORNT-05 | Clarification respects configured style (thorough vs minimal) | Config `orient.clarification` field from schema.ts, loaded via `loadConfig()` |
| ORNT-06 | Research sub-agent investigates using Context7 and web search | Sub-agent with Task tool delegation, MCP tool access to Context7, research.md artifact |
| ORNT-07 | Research output scoped and written to execution directory | Artifact format: `execution/[task-slug]/research.md` per UI-SPEC |
| ORNT-08 | Analysis phase runs graph traversal, blast radius, convention matching | `blastRadius()`, `computeCentrality()`, `detectCommunities()` from analytics.ts, `readRelevantConventions()` from orient.ts |
| ORNT-09 | Plan sub-agent produces execution plan with agents, ordering, changes | `plans/[task-slug].md` artifact format from UI-SPEC, hybrid analysis logic |
| ORNT-10 | Plan saved to plans/[task-slug].md before execution starts | Filesystem write pattern, D-16 persistence rule |
| ORNT-11 | Orient completes in under 60 seconds after clarification | Sequential module execution, graph cache for sub-100ms queries, scoped research |
| EXEC-01 | Orchestrator spawns agents using planner's hybrid analysis | Agent tool for sub-agents, agent teams for parallel, wave-based scheduling |
| EXEC-02 | Each agent receives scope contract, conventions, golden files, coordination, research | Sub-agent prompt construction with scoped context per D-31 |
| EXEC-03 | Coordination file is append-only audit trail in all modes | `execution/[task-slug]/coordination.md` structured markdown |
| EXEC-04 | No-dependency agents run as agent teams with SendMessage when available | Agent teams with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`, fallback to sequential Task tool |
| EXEC-05 | Per-agent change reports written to execution directory | `execution/[task-slug]/[agent-name]-changes.md` per UI-SPEC |
| EXEC-06 | Orchestrator stays under 15K tokens throughout | Thin orchestrator pattern: all state on disk, agent prompts constructed from files |
| EXEC-07 | Planner always performs hybrid dependency analysis | Graph-based dependency detection, file overlap analysis, wave scheduling algorithm |
| EXEC-08 | Agent team members use SendMessage for real-time handoff signals | SendMessage tool with structured JSON messages per UI-SPEC protocol |
| EXEC-09 | Orchestrator detects agent teams availability at runtime, falls back transparently | Env var check + runtime probe pattern from D-42 |
| EXEC-10 | Plan validation gate rejects overlapping file writes in same wave | File assignment set intersection check, auto-fix by reshuffling waves |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack**: TypeScript, @modelcontextprotocol/sdk v1.x, better-sqlite3, graphology, vitest
- **Performance**: Orient <60s after clarification, graph queries <100ms, orchestrator <15K tokens
- **ESM-first**: `type: module`, NodeNext module resolution
- **Agent module pattern**: Options + Result + async function + markdown artifact (Phase 2 D-05)
- **Filesystem coordination**: Issue #5812 pattern -- agents write files, parent reads files
- **Task tool delegation**: Issue #17283 -- use Task/Agent tool, not `context: fork` for auto-invoked skills
- **MCP response contract**: ok/error/partial envelopes with staleness metadata (D-17/D-18/D-19)
- **web-tree-sitter pinned**: 0.25.10, call tree.delete() after parse

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @modelcontextprotocol/sdk | ^1.27.1 | MCP server + tool registration | Already installed. Used for all 11 MCP tools. |
| graphology | ^0.26.0 | In-memory graph operations | Already installed. Used for blast radius, centrality, communities. |
| graphology-traversal | ^0.3.1 | BFS/DFS graph traversal | Already installed. Used for blast radius computation. |
| graphology-metrics | ^2.4.0 | Centrality calculation | Already installed. Used for danger zone detection. |
| graphology-communities-louvain | ^2.0.2 | Community detection | Already installed. Used for module grouping. |
| better-sqlite3 | ^12.8.0 | Graph storage | Already installed. Used for knowledge graph persistence. |
| zod | ^3.25.0 | Schema validation | Already installed. Used for config schema, MCP tool schemas. |
| js-yaml | ^4.1.1 | YAML config parsing | Already installed. Used for config.yml read/write. |
| vitest | ^4.1.0 | Test framework | Already installed. Fast, TypeScript-native. |

### No New Dependencies Required

Phase 4 requires **zero new npm packages**. All functionality is built on:
1. Existing installed packages (graphology, better-sqlite3, zod, js-yaml)
2. Node.js built-in modules (fs, path, child_process, os)
3. Claude Code platform tools (Task/Agent tool, SendMessage, MCP tools)

The orient pipeline and execution engine are TypeScript modules that orchestrate existing graph operations and delegate heavy work to Claude Code sub-agents via the skill system.

## Architecture Patterns

### Recommended Project Structure
```
src/
  orient/
    clarification.ts      # Graph-informed ambiguity detection + question generation
    research.ts           # Research sub-agent prompt construction + output parsing
    analysis.ts           # Graph traversal, blast radius, convention matching for task
    planner.ts            # Execution plan generation with hybrid strategy
    validation.ts         # Plan validation: overlapping writes, dependency ordering, scope coverage
    pipeline.ts           # Orchestrates clarification -> research -> analysis -> planning
    types.ts              # ScopeContract, ResearchOutput, ExecutionPlan, etc.
    run-orient.ts         # CLI entry point (like bootstrap/run-bootstrap.ts)
  execution/
    orchestrator.ts       # Thin execution orchestrator: reads plan, spawns agents, manages waves
    agent-spawner.ts      # Agent prompt construction + Task/Agent tool invocation
    coordination.ts       # coordination.md read/write operations
    teams-detector.ts     # Agent teams availability detection + runtime probe
    wave-scheduler.ts     # Wave-based execution scheduling: parallel/sequential/mixed
    types.ts              # AgentAssignment, WaveSchedule, ExecutionResult, etc.
    run-execution.ts      # CLI entry point for execution phase
  config/
    schema.ts             # Modified: remove execute.parallel, keep max_agents_concurrent
skills/
  orient/
    SKILL.md              # Full orient skill body (replaces stub)
  onboard/
    SKILL.md              # Modified: add agent teams detection step
```

### Pattern 1: Orient Pipeline as Sequential Module Chain
**What:** The orient pipeline runs as a series of TypeScript module calls, not as separate sub-agents. Each module receives the previous module's output path and writes its own artifact.
**When to use:** For the clarification -> research -> analysis -> planning chain. These phases are inherently sequential and share context.
**Why:** Keeps the orchestrator thin. Each module is a pure function: read inputs from disk, do work, write outputs to disk. The skill body coordinates the sequence.

```typescript
// src/orient/pipeline.ts
export interface PipelineOptions {
  projectRoot: string;
  task: string;
  taskSlug: string;
  noConfirm?: boolean;
  noClarify?: boolean;
  onProgress?: (message: string) => void;
  onGate?: (gate: 'scope' | 'plan', artifact: string) => Promise<'approve' | 'edit' | 'reject'>;
}

export interface PipelineResult {
  status: 'approved' | 'rejected' | 'error';
  scopeContractPath: string | null;
  planPath: string | null;
  executionDir: string;
  error?: string;
}

export async function runOrientPipeline(options: PipelineOptions): Promise<PipelineResult> {
  // 1. Clarification (may skip if task is specific)
  // 2. Gate 1 (scope contract approval)
  // 3. Research (sub-agent via Task tool)
  // 4. Analysis (graph operations - direct module call)
  // 5. Planning (sub-agent via Task tool)
  // 6. Validation (direct module call)
  // 7. Gate 2 (plan approval)
  // Returns result for execution phase
}
```

### Pattern 2: Agent Module Pattern (Established)
**What:** Each agent is an async function with Options + Result interfaces that writes markdown artifacts.
**When to use:** For all new modules: clarification, research, analysis, planner, validation, execution agents.
**Why:** Established in Phase 2, proven across 5 existing agents.

```typescript
// src/orient/clarification.ts
export interface ClarificationOptions {
  projectRoot: string;
  task: string;
  taskSlug: string;
  clarificationStyle: 'thorough' | 'minimal' | 'auto';
  outputDir: string;  // execution/[task-slug]/
}

export interface ClarificationResult {
  needsClarification: boolean;
  ambiguityLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  questions: ClarificationQuestion[];
  scopeContract: ScopeContract | null;
  durationMs: number;
}

export async function runClarification(options: ClarificationOptions): Promise<ClarificationResult> {
  // Uses getGraph(), extractKeywords(), blastRadius(), etc.
  // Returns questions or auto-generated scope contract
}
```

### Pattern 3: Thin Execution Orchestrator
**What:** The execution orchestrator reads the plan from disk, constructs per-agent prompts, spawns agents via Task/Agent tool, and writes coordination entries. Never holds heavy context in memory.
**When to use:** For EXEC-01 through EXEC-10.
**Why:** The <15K token constraint means the orchestrator must be a thin coordinator. All state lives on disk. Agent prompts are constructed by reading files, not by passing data through the orchestrator.

```typescript
// src/execution/orchestrator.ts
export interface ExecutionOptions {
  projectRoot: string;
  taskSlug: string;
  planPath: string;
  maxConcurrent: number;
  verbosity: 'brief' | 'detailed';
  onProgress?: (message: string) => void;
}

export interface ExecutionResult {
  status: 'complete' | 'partial' | 'failed';
  agents: AgentResult[];
  summaryPath: string;
  coordinationPath: string;
  durationMs: number;
}
```

### Pattern 4: Agent Teams Detection with Graceful Fallback
**What:** At runtime, check `process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS`, then attempt a lightweight probe. If unavailable, fall back to sequential with a log message.
**When to use:** Before every execution that the planner marks as parallel-eligible.

```typescript
// src/execution/teams-detector.ts
export interface TeamsAvailability {
  available: boolean;
  reason: string;  // "env_var_set" | "env_var_missing" | "probe_failed"
}

export function detectAgentTeams(): TeamsAvailability {
  const envVar = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  if (envVar === '1' || envVar === 'true') {
    return { available: true, reason: 'env_var_set' };
  }
  return { available: false, reason: 'env_var_missing' };
}
```

### Pattern 5: Wave-Based Execution Scheduling
**What:** The planner builds a dependency graph of agents. Agents with no dependencies form wave 1 (parallel). Agents depending on wave 1 form wave 2, etc. Within each wave, agents with exclusive file assignments run in parallel.
**When to use:** For mixed workloads (EXEC-07).

```typescript
// src/execution/wave-scheduler.ts
export interface Wave {
  waveNumber: number;
  agents: string[];  // agent names
  mode: 'parallel' | 'sequential';
  // parallel: agent teams or concurrent Task tools
  // sequential: one-at-a-time Task tool
}

export function buildWaveSchedule(plan: ExecutionPlan): Wave[] {
  // 1. Build dependency DAG from agent blockedBy fields
  // 2. Topological sort into waves
  // 3. Within each wave, check file overlap (EXEC-10)
  // 4. If no overlap -> parallel; if overlap -> split into sub-waves or sequential
}
```

### Anti-Patterns to Avoid
- **Fat orchestrator:** Never load full file contents into the orient pipeline or execution orchestrator. Always pass file paths. Read only what you need (metadata, line counts, headers).
- **Nested sub-agents:** Sub-agents cannot spawn sub-agents. The orient skill body is the top-level coordinator. It spawns research and planner as sub-agents, and the execution orchestrator spawns execution agents. Never try to have a sub-agent spawn another.
- **Return-value communication:** Per Issue #5812, sub-agents cannot return file contents to parent. Always use filesystem coordination: agent writes to disk, parent reads from disk.
- **Hardcoded execution mode:** Per D-44, never expose a user-facing parallel/sequential config. The planner always picks the optimal strategy.
- **Blocking on agent teams:** Never require agent teams. Always implement sequential fallback first, then add parallel as an enhancement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph traversal for blast radius | Custom BFS | `blastRadius()` from `src/graph/analytics.ts` | Already implemented, tested, handles hop-distance classification |
| Centrality computation | Custom in-degree counting | `computeCentrality()` from `src/graph/analytics.ts` | Uses graphology-metrics, normalized scores |
| Community detection | Custom clustering | `detectCommunities()` or louvain directly | Already integrated with graphology |
| Graph loading and caching | Direct SQLite queries | `getGraph()` from `src/graph/cache.ts` | 5-min TTL cache, sub-100ms queries |
| Convention matching | Text search in conventions.md | `readRelevantConventions()` from `src/tools/orient.ts` | Already parses convention format |
| Danger zone computation | Custom multi-signal scoring | `computeDangerZones()` from `src/graph/analytics.ts` | Centrality + community + LOC signals |
| MCP response formatting | Custom JSON structures | `okResponse()` / `errorResponse()` / `partialResponse()` from helpers.ts | Established contract |
| Config loading | Direct YAML parsing | `loadConfig()` from `src/config/loader.ts` | Zod validation included |
| Keyword extraction | Custom tokenization | `extractKeywords()` from `src/tools/orient.ts` | Stop words, normalization |
| Task slug generation | Custom slugification | Build a simple `slugify()` utility | One function, reused everywhere |
| YAML config writing | String concatenation | `js-yaml` `dump()` function | Already a dependency, handles edge cases |

**Key insight:** Phase 4 is primarily an orchestration layer. Almost all the analytical heavy lifting (graph queries, blast radius, conventions, danger zones) is already built in Phases 1-3. Phase 4 reads these results and coordinates agents.

## Common Pitfalls

### Pitfall 1: Orchestrator Context Bloat
**What goes wrong:** The orient pipeline or execution orchestrator accumulates too much context by reading full file contents, holding agent results in memory, or building large prompt strings.
**Why it happens:** Natural tendency to pass data through the coordinator instead of through the filesystem.
**How to avoid:** Every inter-phase data transfer goes through a file on disk. The orchestrator reads only metadata (file exists? line count? status field?). Agent prompts are constructed by referencing file paths, not by embedding file contents.
**Warning signs:** Orchestrator function bodies exceed 200 lines. Functions accept large string parameters.

### Pitfall 2: Sub-Agent Nesting Attempt
**What goes wrong:** Trying to have the research sub-agent spawn a "Context7 lookup" sub-agent, or having an execution agent spawn a "test runner" sub-agent.
**Why it happens:** Hierarchical thinking from traditional orchestration frameworks. Claude Code prohibits nested sub-agents.
**How to avoid:** Only the orient skill body and the execution orchestrator spawn sub-agents. Research and planning are sub-agents. Execution agents are sub-agents. Nobody else spawns anything.
**Warning signs:** Agent prompt instructions include "use the Task tool to..." or "spawn a sub-agent to..."

### Pitfall 3: Agent Teams as Required Path
**What goes wrong:** Building the parallel execution path first without a working sequential fallback. When agent teams are unavailable, nothing works.
**Why it happens:** Excitement about parallel execution leads to optimizing for it first.
**How to avoid:** Build sequential execution first. It is the primary path. Agent teams is an optimization. The `detectAgentTeams()` function gates all parallel code.
**Warning signs:** Tests only pass with `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

### Pitfall 4: File Overlap Detection False Negatives
**What goes wrong:** The plan validation misses overlapping file writes because it checks exact file paths but agents modify files not in their original assignment (e.g., an agent modifies a shared types.ts discovered during execution).
**Why it happens:** Static analysis of the plan cannot perfectly predict runtime file modifications.
**How to avoid:** Plan validation checks the assigned write files (EXEC-10). Runtime coordination (coordination.md) provides the ground truth. Document this limitation: plan validation catches known overlaps; runtime coordination catches discovered ones.
**Warning signs:** Two agents modify the same file and produce conflicting changes.

### Pitfall 5: Gate Interaction Design
**What goes wrong:** The two-gate system (scope approval, plan approval) becomes confusing because the skill body needs to pause execution and wait for user input, but skill execution is not naturally interactive.
**Why it happens:** Skills run as prompt injections. Pausing for user input means the skill must produce output and wait for the user to respond.
**How to avoid:** The skill body is designed as a conversational flow. It produces the scope contract, asks for approval, and based on the response continues or loops. This is natural in Claude Code's chat interface. The `--no-confirm` flag skips these pauses.
**Warning signs:** Trying to implement gates as blocking I/O operations rather than conversational turns.

### Pitfall 6: Config Schema Migration
**What goes wrong:** Removing `execute.parallel` from the config schema breaks existing config.yml files that have the field.
**Why it happens:** D-44 says to remove it, but existing users already have it in their config.
**How to avoid:** Make `execute.parallel` optional in the Zod schema (with `.optional()`) or use `.passthrough()`. The config loader should tolerate the field's presence but ignore it. Don't delete it from existing files -- just stop reading it.
**Warning signs:** Config validation throws on existing config.yml files after the schema change.

### Pitfall 7: Task Slug Collisions
**What goes wrong:** Two orient runs with similar task descriptions produce the same slug, overwriting the previous execution directory.
**Why it happens:** Simple slugification ("add auth" -> "add-auth" both times).
**How to avoid:** Append a short timestamp or counter to the slug: "add-auth-1711234567" or "add-auth-2". Check if the directory exists before creating it.
**Warning signs:** Running orient twice on similar tasks loses the first run's artifacts.

### Pitfall 8: 60-Second Orient Budget
**What goes wrong:** The orient pipeline exceeds the 60-second budget (ORNT-11) because research takes too long or graph operations are slow on large codebases.
**Why it happens:** Research sub-agent does unbounded web searching. Graph operations on 100K+ node graphs without caching.
**How to avoid:** Research uses `max_research_time` from config (default 60s). Graph operations use the cached graph via `getGraph()` (sub-100ms). The 60s budget is after clarification -- it covers research + analysis + planning + validation. Budget allocation: research ~30s, analysis ~5s, planning ~20s, validation ~5s.
**Warning signs:** Research sub-agent making more than 3-5 external calls.

## Code Examples

### Clarification Ambiguity Detection
```typescript
// Source: Based on existing orient.ts extractKeywords() + graph operations
import { getGraph } from '../graph/cache.js';
import { computeDangerZones } from '../graph/analytics.js';

interface AmbiguityAssessment {
  level: 'HIGH' | 'MEDIUM' | 'LOW';
  matchedNodes: number;
  communitiesSpanned: number;
  dangerZonesInScope: number;
  reasons: string[];
}

export function assessAmbiguity(
  projectRoot: string,
  keywords: string[],
): AmbiguityAssessment {
  const { graph, centralities } = getGraph(projectRoot);
  const reasons: string[] = [];

  // Count keyword matches in graph
  let matchCount = 0;
  const matchedCommunities = new Set<number>();

  graph.forEachNode((nodeId, attrs) => {
    const name = ((attrs.name as string) ?? '').toLowerCase();
    const filePath = ((attrs.filePath as string) ?? '').toLowerCase();
    const matches = keywords.some(kw => name.includes(kw) || filePath.includes(kw));
    if (matches) {
      matchCount++;
      const community = attrs.community as number | undefined;
      if (community !== undefined) matchedCommunities.add(community);
    }
  });

  // Few matches = vague task
  if (matchCount < 3) reasons.push(`Only ${matchCount} graph nodes match keywords`);
  // Multiple communities = cross-cutting change
  if (matchedCommunities.size > 2) reasons.push(`Spans ${matchedCommunities.size} communities`);

  // Danger zones in scope
  const dangerZones = computeDangerZones(graph, centralities, {});
  const dangerInScope = dangerZones.filter(dz =>
    keywords.some(kw => dz.filePath.toLowerCase().includes(kw))
  ).length;
  if (dangerInScope > 0) reasons.push(`${dangerInScope} danger zones in scope`);

  let level: 'HIGH' | 'MEDIUM' | 'LOW';
  if (matchCount < 3 || matchedCommunities.size > 3 || dangerInScope > 2) {
    level = 'HIGH';
  } else if (matchedCommunities.size > 1 || dangerInScope > 0) {
    level = 'MEDIUM';
  } else {
    level = 'LOW';
  }

  return {
    level,
    matchedNodes: matchCount,
    communitiesSpanned: matchedCommunities.size,
    dangerZonesInScope: dangerInScope,
    reasons,
  };
}
```

### Plan Validation: File Overlap Check
```typescript
// Source: Implementation for EXEC-10
export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
}

interface ValidationCheck {
  name: string;
  status: 'PASS' | 'FAIL' | 'AUTO-FIXED' | 'WARNING';
  detail?: string;
}

export function validatePlan(plan: ExecutionPlan): ValidationResult {
  const checks: ValidationCheck[] = [];

  // Check 1: No overlapping file writes within waves
  for (const wave of plan.waves) {
    if (wave.mode === 'parallel') {
      const filesByAgent = new Map<string, Set<string>>();
      for (const agentName of wave.agents) {
        const agent = plan.agents.find(a => a.name === agentName);
        if (agent) {
          filesByAgent.set(agentName, new Set(agent.exclusiveWriteFiles));
        }
      }

      // Check all pairs for overlap
      const agentNames = Array.from(filesByAgent.keys());
      for (let i = 0; i < agentNames.length; i++) {
        for (let j = i + 1; j < agentNames.length; j++) {
          const filesA = filesByAgent.get(agentNames[i])!;
          const filesB = filesByAgent.get(agentNames[j])!;
          const overlap = [...filesA].filter(f => filesB.has(f));
          if (overlap.length > 0) {
            checks.push({
              name: `file-overlap-wave-${wave.waveNumber}`,
              status: 'FAIL',
              detail: `${agentNames[i]} and ${agentNames[j]} both write: ${overlap.join(', ')}`,
            });
          }
        }
      }
    }
  }

  if (!checks.some(c => c.name.startsWith('file-overlap') && c.status === 'FAIL')) {
    checks.push({ name: 'file-overlap', status: 'PASS' });
  }

  // Check 2: Dependency ordering (no same-wave deps, no cycles)
  // Check 3: Scope coverage
  // ... (similar pattern)

  return {
    passed: checks.every(c => c.status === 'PASS' || c.status === 'AUTO-FIXED'),
    checks,
  };
}
```

### Coordination File Operations
```typescript
// Source: Implementation for EXEC-03
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface CoordinationEntry {
  timestamp: string;
  agent: string;
  signal: 'started' | 'ready' | 'discovery' | 'done' | 'failed' | 'skipped';
  files: string[];
  detail: string;
}

export function appendCoordinationEntry(
  coordinationPath: string,
  entry: CoordinationEntry,
): void {
  const line = `| ${entry.timestamp} | ${entry.agent} | \`${entry.signal}\` | ${entry.files.map(f => '`' + f + '`').join(', ')} | ${entry.detail} |\n`;
  fs.appendFileSync(coordinationPath, line, 'utf-8');
}

export function initCoordinationFile(
  executionDir: string,
  taskSlug: string,
  mode: string,
): string {
  const coordPath = path.join(executionDir, 'coordination.md');
  const header = `# Coordination Log: ${taskSlug}\n\n**Started:** ${new Date().toISOString()}\n**Mode:** ${mode}\n\n## Log\n\n| Timestamp | Agent | Signal | Files | Detail |\n|-----------|-------|--------|-------|--------|\n`;
  fs.writeFileSync(coordPath, header, 'utf-8');
  return coordPath;
}

export function readCoordinationEntries(
  coordinationPath: string,
): CoordinationEntry[] {
  // Parse markdown table rows back into structured entries
  // Used by later agents to read what previous agents did (D-34)
}
```

### Agent Teams Settings.json Write
```typescript
// Source: Implementation for ONBD-06
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

export function enableAgentTeams(): { success: boolean; message: string } {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  let settings: Record<string, unknown> = {};

  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
    } catch {
      return { success: false, message: 'Failed to parse ~/.claude/settings.json' };
    }
  }

  // Ensure env object exists
  const env = (settings.env as Record<string, string>) ?? {};
  env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
  settings.env = env;

  // Ensure directory exists
  const dir = path.dirname(settingsPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');

  return { success: true, message: 'Agent teams enabled in ~/.claude/settings.json' };
}

export function isAgentTeamsEnabled(): boolean {
  // Check env var first (runtime)
  if (process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1' ||
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === 'true') {
    return true;
  }

  // Check settings.json
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      const env = settings.env as Record<string, string> | undefined;
      return env?.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS === '1';
    } catch {
      return false;
    }
  }

  return false;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `context: fork` in skill frontmatter | Task/Agent tool delegation in skill body | Issue #17283 (2025) | Skills must use explicit Task tool calls, not frontmatter context:fork for auto-invoked skills |
| Task tool (name) | Agent tool (name) | Claude Code v2.1.63 | "Task" renamed to "Agent" in the tool API. Task still works as alias. Use "Agent" in new code. |
| No inter-agent communication | SendMessage for agent teams | Claude Code v2.1.32 (Feb 2026) | Agent team members can send direct messages and broadcasts |
| Manual parallel sessions | Agent teams with shared task list | Feb 2026 | Coordinated parallel execution with task dependencies |
| Sub-agents only report back to parent | Agent teams communicate peer-to-peer | Feb 2026 | Teammates can share findings directly without going through lead |

**Deprecated/outdated:**
- `context: fork` for auto-invoked skills -- silently ignored, use Task/Agent tool delegation
- `execute.parallel` config field -- being removed per D-44, planner picks strategy
- Task tool name -- aliased to Agent tool as of v2.1.63, both work but "Agent" is current

## Claude Code Platform Capabilities (Verified)

### Task/Agent Tool (Sub-agents)
**Source:** [Official Claude Code docs](https://code.claude.com/docs/en/sub-agents)

- Sub-agents run in their own context window with custom system prompt, specific tool access
- Cannot spawn other sub-agents (no nesting)
- Cannot return file contents to parent (Issue #5812)
- Can run in foreground (blocking) or background (concurrent)
- Can be configured with specific model, tools, permissions
- Agent tool supports `model` field: `sonnet`, `opus`, `haiku`, `inherit`
- Supports `tools` (allowlist) and `disallowedTools` (denylist)
- Supports `permissionMode`: `default`, `acceptEdits`, `dontAsk`, `bypassPermissions`, `plan`
- Supports `skills` field to preload skill content into sub-agent context
- Supports `isolation: worktree` for git worktree isolation
- `maxTurns` limits agentic turns
- Supports `mcpServers` for scoping MCP servers to specific sub-agents
- Resumed sub-agents retain full conversation history

### Agent Teams
**Source:** [Official Claude Code docs](https://code.claude.com/docs/en/agent-teams)

- Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var set to `1`
- Requires Claude Code v2.1.32+ (current: v2.1.81 -- verified available)
- Team lead creates team, spawns teammates, coordinates work
- Teammates work independently in own context windows
- Communication via SendMessage: `message` (direct) and `broadcast` (all)
- Shared task list with dependency tracking and auto-unblocking
- Task claiming uses file locking (race condition prevention)
- Team config stored at `~/.claude/teams/{team-name}/config.json`
- No session resumption with in-process teammates
- No nested teams (teammates cannot spawn teams)
- 3-5 teammates recommended for most workflows
- Token costs scale linearly with team size
- Display modes: in-process (any terminal) or split-panes (requires tmux/iTerm2)

### Skill System
**Source:** [Official Claude Code docs](https://code.claude.com/docs/en/skills)

- SKILL.md with YAML frontmatter + markdown body
- Frontmatter fields: name, description, allowed-tools, model, context, agent, hooks, effort
- `$ARGUMENTS` substitution for skill arguments
- `context: fork` runs in forked sub-agent context (but Issue #17283 -- silently ignored on auto-invoked)
- Skills support `` !`command` `` syntax for dynamic context injection
- Claude Code v2.1.81 confirmed on this machine

### Key Platform Constraint: Skill-as-Orchestrator Pattern
The orient skill body is a natural language prompt that Claude Code executes. It cannot directly call TypeScript functions. Instead, the skill instructs Claude to:
1. Run `node --import tsx/esm src/orient/run-orient.ts [args]` via Bash tool
2. Read the output artifacts from disk
3. Present gates to the user (conversational interaction)
4. Run `node --import tsx/esm src/execution/run-execution.ts [args]` via Bash tool

This matches the established bootstrap skill pattern exactly.

## Open Questions

1. **Agent Teams Runtime Probe**
   - What we know: We can check `process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` and `~/.claude/settings.json`
   - What's unclear: D-42 says "attempt lightweight agent team probe." The exact mechanism for probing agent teams availability at runtime (beyond env var check) is not documented in official docs. The env var check is likely sufficient.
   - Recommendation: Use env var check as the probe. If the env var is set, assume available. If agent spawning fails, catch the error and fall back.

2. **Sub-agent MCP Tool Access**
   - What we know: D-33 says execution agents have full MCP tool access. Sub-agents can be configured with `mcpServers` in their definition.
   - What's unclear: Whether the orient MCP server is automatically available to sub-agents spawned from the orient skill, or needs explicit scoping.
   - Recommendation: Since the MCP server is configured in the plugin's .mcp.json, it should be available to all sub-agents in the same project. If not, use the `mcpServers` field to explicitly scope it. Test during implementation.

3. **Execution Agent Prompt Size vs 15K Token Budget**
   - What we know: D-31 says agents get scope contract + conventions + golden files + coordination + research. D-32 says planner estimates token size.
   - What's unclear: How to ensure the orchestrator (which constructs these prompts) stays under 15K tokens while building prompts that may each be 5-10K tokens.
   - Recommendation: The orchestrator reads files and constructs prompt strings, but it does this one agent at a time. After constructing and dispatching an agent, the prompt string is garbage collected. The 15K budget is about the orchestrator's own conversation context, not the prompts it constructs.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v25.6.1 | -- |
| npm | Package management | Yes | 11.9.0 | -- |
| vitest | Testing | Yes | 4.1.0 | -- |
| Claude Code CLI | Plugin system, sub-agents | Yes | 2.1.81 | -- |
| TypeScript | Type checking | Yes | ^5.7 (devDep) | -- |
| tsx | Dev runtime | Yes | ^4.21.0 (devDep) | -- |
| Agent teams | Parallel execution | Conditional | Requires env var | Sequential fallback (D-42) |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:**
- Agent teams: Available only when `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is set. Sequential execution is the full fallback per D-42/D-09.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npx vitest run tests/orient/ tests/execution/ --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ONBD-06 | Agent teams detection + settings.json write | unit | `npx vitest run tests/onboard/agent-teams.test.ts -x` | Wave 0 |
| ORNT-01 | Orient skill triggers pipeline | integration | `npx vitest run tests/orient/pipeline.test.ts -x` | Wave 0 |
| ORNT-02 | Graph-informed clarification questions | unit | `npx vitest run tests/orient/clarification.test.ts -x` | Wave 0 |
| ORNT-03 | Clarification trigger/skip logic | unit | `npx vitest run tests/orient/clarification.test.ts -x` | Wave 0 |
| ORNT-04 | Scope contract generation | unit | `npx vitest run tests/orient/clarification.test.ts -x` | Wave 0 |
| ORNT-05 | Clarification style (thorough/minimal) | unit | `npx vitest run tests/orient/clarification.test.ts -x` | Wave 0 |
| ORNT-06 | Research sub-agent output | unit | `npx vitest run tests/orient/research.test.ts -x` | Wave 0 |
| ORNT-07 | Research output written to execution dir | unit | `npx vitest run tests/orient/research.test.ts -x` | Wave 0 |
| ORNT-08 | Analysis graph traversal + blast radius | unit | `npx vitest run tests/orient/analysis.test.ts -x` | Wave 0 |
| ORNT-09 | Plan generation with agent assignments | unit | `npx vitest run tests/orient/planner.test.ts -x` | Wave 0 |
| ORNT-10 | Plan persistence to plans/ | unit | `npx vitest run tests/orient/planner.test.ts -x` | Wave 0 |
| ORNT-11 | Orient completes under 60s | integration | `npx vitest run tests/orient/pipeline.test.ts -x` | Wave 0 |
| EXEC-01 | Hybrid agent spawning | unit | `npx vitest run tests/execution/orchestrator.test.ts -x` | Wave 0 |
| EXEC-02 | Agent context scoping | unit | `npx vitest run tests/execution/agent-spawner.test.ts -x` | Wave 0 |
| EXEC-03 | Coordination file operations | unit | `npx vitest run tests/execution/coordination.test.ts -x` | Wave 0 |
| EXEC-04 | Agent teams fallback to sequential | unit | `npx vitest run tests/execution/teams-detector.test.ts -x` | Wave 0 |
| EXEC-05 | Per-agent change reports | unit | `npx vitest run tests/execution/orchestrator.test.ts -x` | Wave 0 |
| EXEC-06 | Orchestrator token budget | manual-only | Review orchestrator module size and prompt construction | N/A |
| EXEC-07 | Hybrid dependency analysis | unit | `npx vitest run tests/execution/wave-scheduler.test.ts -x` | Wave 0 |
| EXEC-08 | SendMessage structured protocol | unit | `npx vitest run tests/execution/coordination.test.ts -x` | Wave 0 |
| EXEC-09 | Runtime agent teams detection | unit | `npx vitest run tests/execution/teams-detector.test.ts -x` | Wave 0 |
| EXEC-10 | File overlap validation | unit | `npx vitest run tests/orient/validation.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/orient/ tests/execution/ --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/onboard/agent-teams.test.ts` -- covers ONBD-06
- [ ] `tests/orient/clarification.test.ts` -- covers ORNT-02, ORNT-03, ORNT-04, ORNT-05
- [ ] `tests/orient/research.test.ts` -- covers ORNT-06, ORNT-07
- [ ] `tests/orient/analysis.test.ts` -- covers ORNT-08
- [ ] `tests/orient/planner.test.ts` -- covers ORNT-09, ORNT-10
- [ ] `tests/orient/validation.test.ts` -- covers EXEC-10
- [ ] `tests/orient/pipeline.test.ts` -- covers ORNT-01, ORNT-11 (integration)
- [ ] `tests/execution/orchestrator.test.ts` -- covers EXEC-01, EXEC-05
- [ ] `tests/execution/agent-spawner.test.ts` -- covers EXEC-02
- [ ] `tests/execution/coordination.test.ts` -- covers EXEC-03, EXEC-08
- [ ] `tests/execution/teams-detector.test.ts` -- covers EXEC-04, EXEC-09
- [ ] `tests/execution/wave-scheduler.test.ts` -- covers EXEC-07
- [ ] `tests/orient/types.test.ts` -- shared type validation for ScopeContract, ExecutionPlan, etc.

## Sources

### Primary (HIGH confidence)
- [Claude Code Sub-agents Documentation](https://code.claude.com/docs/en/sub-agents) -- Task/Agent tool API, configuration, limitations, nesting rules
- [Claude Code Agent Teams Documentation](https://code.claude.com/docs/en/agent-teams) -- SendMessage, team coordination, enable/disable, limitations
- [Claude Code Skills Documentation](https://code.claude.com/docs/en/skills) -- SKILL.md format, frontmatter, context:fork, dynamic context
- Existing codebase: `src/tools/orient.ts`, `src/graph/analytics.ts`, `src/graph/cache.ts`, `src/bootstrap/orchestrator.ts`, `src/config/schema.ts` -- established patterns
- `04-CONTEXT.md` -- 45 locked decisions from user discussion
- `04-UI-SPEC.md` -- artifact format contracts for all outputs
- `CODESCOPE-SPEC-V6.md` -- full product specification
- `CODESCOPE-BUILD-INSTRUCTIONS.md` -- environment setup, Issue references

### Secondary (MEDIUM confidence)
- [The Task Tool: Claude Code's Agent Orchestration System](https://dev.to/bhaidar/the-task-tool-claude-codes-agent-orchestration-system-4bf2) -- community analysis of Task tool internals
- [Claude Code Agent Teams Guide](https://claudefa.st/blog/guide/agents/agent-teams) -- practical patterns for agent teams
- [From Tasks to Swarms: Agent Teams in Claude Code](https://alexop.dev/posts/from-tasks-to-swarms-agent-teams-in-claude-code/) -- architecture overview

### Tertiary (LOW confidence)
- Agent teams runtime probe mechanism -- not documented in official docs; env var check is the verified approach

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and verified in Phases 1-3
- Architecture: HIGH -- follows established codebase patterns (agent module, filesystem coordination, thin orchestrator), verified against official Claude Code docs
- Pitfalls: HIGH -- based on verified platform constraints (Issue #5812, Issue #17283) and established codebase patterns
- Agent teams integration: MEDIUM -- env var detection verified, SendMessage protocol documented, but runtime probe specifics undocumented

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (30 days -- stable domain, Claude Code platform may evolve agent teams)
