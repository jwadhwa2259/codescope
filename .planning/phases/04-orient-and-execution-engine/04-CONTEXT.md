# Phase 4: Orient and Execution Engine - Context

**Gathered:** 2026-03-23
**Status:** Ready for planning

<domain>
## Phase Boundary

The `/codescope:orient [task]` command takes a user task description and autonomously produces a scope contract (with user approval), researches external context, analyzes graph impact, generates a dependency-ordered execution plan (with user approval), and spawns agents using hybrid execution. The planner always analyzes the dependency graph and picks agent teams for independent work, sequential for dependent work, and wave-based for mixed workloads. Filesystem coordination is the universal audit trail. Two user gates provide checkpoints: Gate 1 after scope contract, Gate 2 after execution plan. Both skippable via --no-confirm.

</domain>

<decisions>
## Implementation Decisions

### Pipeline Flow
- **D-01:** Two-gate pipeline: Clarification -> scope contract -> **Gate 1 (user approves scope)** -> research (auto) -> planning (auto) -> validation (auto) -> **Gate 2 (user approves plan)** -> execution. Scope contract doesn't need a separate gate from clarification because the user shaped it during clarification.
- **D-02:** `--no-confirm` flag skips both gates. Scope and plan still written to disk for audit trail. Power users and automation can run orient fully autonomously.

### Scope Contract & Clarification
- **D-03:** Clarification trigger uses graph-informed auto-detection: run keyword matching against the graph. If task maps cleanly to specific files/modules with low ambiguity, skip clarification. If vague (few matches, multiple communities, danger zones), ask questions. `--no-clarify` flag always skips.
- **D-04:** Full graph context informs clarification questions: affected modules, convention conflicts in blast radius, danger zones that overlap with the task, missing test coverage for affected files.
- **D-05:** Number of clarification questions is dynamic — driven by actual ambiguity, not a hard cap. More gray areas = more questions. Soft guardrail: after 5+ questions the agent self-checks "Do I have enough to produce a scope contract?" If yes, stop. If genuinely ambiguous, keep going.
- **D-06:** Clarification questions batched by topic — group related questions together (e.g., all scope boundary questions, then all conflict questions). Fewer round-trips, faster to complete.
- **D-07:** When configured clarification style is 'minimal', raise the ambiguity threshold: only ask about HIGH-ambiguity gray areas (danger zones, cross-community changes, convention conflicts). Skip MEDIUM/LOW ambiguity — make reasonable assumptions and note them in the scope contract.
- **D-08:** Gate 1 is quick confirm: show In Scope / Out of Scope lists + estimated affected files count + high-risk files flagged + community boundaries. Approve/edit/reject. 3 seconds to scan.
- **D-09:** Scope rejection returns to clarification with the rejection reason. User can narrow/expand scope. Produces revised scope contract and re-presents Gate 1.

### Research Agent
- **D-10:** Research is task + graph driven: extract libraries/frameworks from affected files via graph, search Context7 for those specific docs, web search only for patterns/best practices the graph can't answer.
- **D-11:** Impact-ranked progressive research: score each research topic by graph impact (centrality of dependency, number of files using it, whether API is changing). Research high-impact topics thoroughly, mid-impact with Context7 only, low-impact skipped with a note. Context7 first, web search only for gaps. Stop at diminishing returns. Token spend proportional to actual unknowns.
- **D-12:** Research output as scoped markdown: research.md with sections for Relevant APIs (with code examples), Best Practices, Known Issues/Pitfalls, Version-Specific Notes. Only what the planner needs. Written to execution/[task-slug]/research.md.
- **D-13:** Research output referenced in the execution plan where relevant (e.g., "per Context7 docs, use retryWhen() not retry()"). Full research.md on disk for deep reading.

### Plan Review Gate
- **D-14:** Gate 2 shows the full plan: agent assignments with file scopes, execution order (which agents run in parallel vs sequential), estimated changes per agent, conventions each agent must follow, hybrid strategy rationale, and validation status.
- **D-15:** Gate 2 actions: approve / edit / reject. Edit allows task-level modifications (remove tasks, reorder priority, change file assignments, add constraints like "don't modify tests"). Planner re-validates after edit. Reject aborts and returns to scope.
- **D-16:** Plan always persisted to disk at .claude/codescope/plans/[task-slug].md regardless of outcome (approved, rejected, or --no-confirm). Rejected plans are valuable audit trail.
- **D-17:** Removed tasks logged in a "## Removed by User" section at the bottom of the plan file.
- **D-18:** `--no-confirm` writes plan to disk but doesn't pause. Plan available for post-hoc review.

### Plan Validation
- **D-19:** Validation checks run before Gate 2: (1) no overlapping file writes in the same parallel wave (EXEC-10), (2) dependency ordering — no agent depends on an agent in the same wave, no circular dependencies, (3) scope coverage — every In Scope item has at least one agent assigned.
- **D-20:** Mechanical errors (overlapping writes, dependency ordering) auto-patched by planner using focused error prompt with specific details. Max 2 auto-fix attempts. Structural errors (scope coverage gaps, blast radius drift beyond Gate 1 estimate) escalated to user at Gate 2 with clear warnings.
- **D-21:** User-requested re-plan at Gate 2 does full plan regeneration with user feedback as additional constraints (approach is wrong, not just scheduling).
- **D-22:** Validation results included in plan file "## Validation" section: checks run, results (pass/auto-fixed/escalated), auto-fix details if applicable.
- **D-23:** Validation runs before Gate 2. User sees a clean plan (mechanical issues already fixed) with any structural warnings flagged.

### Execution Feedback
- **D-24:** Brief verbosity: phase banners + agent completion in arrival order. "Executing wave 1/3: [agent-a, agent-b]..." then "agent-a complete (12s, 3 files)" as each finishes.
- **D-25:** Detailed verbosity adds: per-agent file lists as agents work, change summaries on completion, coordination log entries visible in real-time.
- **D-26:** Parallel agent output shown in completion order (as agents finish, not buffered by wave).
- **D-27:** Always show execution summary: total time, files changed, agents run, execution mode used, token estimate per agent and total, and next step ("Proceeding to verification..." or "Done").
- **D-28:** Coordination file is structured markdown (append-only): timestamps, agent names, status, file lists. Human-readable AND parseable by downstream agents (verify, eval, debug).
- **D-29:** SendMessage handoffs and discovery signals also logged to coordination.md. Full audit trail regardless of execution mode.
- **D-30:** Coordination.md scoped per-task: fresh file in execution/[task-slug]/ per Phase 1 D-26.

### Agent Context & Communication
- **D-31:** Context scoped per agent by the planner: only its specific tasks, conventions for files it will touch (file-matched using codescope_conventions logic), golden files for its scope (by reference with 10-20 key line excerpts), coordination entries from agents it depends on, and research relevant to its libraries.
- **D-32:** Planner estimates token size per agent (scope + conventions + golden files + coordination). Logged in plan for transparency. No hard enforcement — agents use what they need.
- **D-33:** Execution agents have full MCP tool access (codescope_blast_radius, codescope_conventions, codescope_recall, etc.) during execution. Agents can self-serve context beyond pre-loaded prompt.
- **D-34:** Progressive coordination context: later agents in sequential chains read coordination entries from completed agents. They know what was done, what files were touched, and issues flagged.
- **D-35:** Parallel agent communication uses structured protocol with two signal types: (1) handoff signals: `{type: "ready" | "done" | "blocked", files: [], detail: ""}`, (2) discovery signals: `{type: "discovery", category: "api_change" | "new_utility" | "pattern" | "warning", detail: "...", files: [...]}`. One-way broadcasts, not dialogue. Agents share critical findings without conversational overhead.

### Agent Failure Behavior
- **D-36:** Failure model: auto-retry once with same context + error message from first attempt (agent can adapt). If retry fails, skip failed agent + all its dependents. Continue truly independent agents. Produces partial results rather than nothing.
- **D-37:** Dependent agents skip when their dependency fails. Independent agents (validated by EXEC-10 non-overlapping file writes) continue safely.
- **D-38:** Failure summary: succeeded agents, failed agents with error reason, skipped dependents with dependency chain explanation, and suggested next action ("re-run orient to retry failed tasks" or "manually fix [file] and re-run").
- **D-39:** Partial execution results left as uncommitted working tree changes. User reviews diff and decides what to keep. No half-done commits in git history.
- **D-40:** Per-agent timeout estimated by planner based on task complexity and file count. Small tasks get 2-3 min, large refactors get 5-10 min. Orchestrator enforces.

### Onboarding Agent Teams
- **D-41:** During /codescope:onboard (after model selection), detect `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS` env var. If not set, explain benefit (parallel execution, faster orient) and ask "Enable now?". On yes, auto-write the setting to ~/.claude/settings.json. On no, note and move on.
- **D-42:** Runtime probe at orient start: attempt lightweight agent team probe. If fails, graceful fallback to sequential with warning in progress output ("Agent teams unavailable — running sequentially").
- **D-43:** One-time hint on first sequential fallback (when agent teams not enabled): "Running sequentially (agent teams not enabled). Enable for faster parallel execution: [instructions]." Stored as agent_teams_hint_shown: true in config. Don't repeat.
- **D-44:** Remove `execute.parallel` enum from config.yml schema — contradicts the "planner always picks optimal strategy" key decision. Keep only `execute.max_agents_concurrent` as the sole user-facing execution config.
- **D-45:** /codescope:settings (Phase 7) allows re-running agent teams detection and enablement. User can change their mind without re-running onboard.

### Claude's Discretion
- No areas deferred to Claude's discretion — all gray areas received explicit user decisions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Specification
- `CODESCOPE-SPEC-V6.md` — Full product spec. Orient pipeline phases (clarification, research, analysis, planning), execution engine (agent spawning, coordination, hybrid execution), scope contract format, execution plan format.

### Build Instructions
- `CODESCOPE-BUILD-INSTRUCTIONS.md` — Environment setup, dependency versions, Claude Code plugin development patterns.

### Project Context
- `.planning/PROJECT.md` — Key decisions: thin orchestrator (<15K tokens), filesystem coordination (Issue #5812), hybrid execution (planner-driven, no user config), Task tool delegation (Issue #17283).
- `.planning/REQUIREMENTS.md` — Phase 4 requirements: ONBD-06, ORNT-01 through ORNT-11, EXEC-01 through EXEC-10.
- `.planning/ROADMAP.md` — Phase 4 goal, success criteria, dependency on Phase 3.

### Technology Stack
- `CLAUDE.md` SS Technology Stack — @modelcontextprotocol/sdk v1.x (Task tool, SendMessage, agent teams), graphology ecosystem, better-sqlite3 sync API.

### Prior Phase Context & Code
- `.planning/phases/01-plugin-foundation-and-infrastructure/01-CONTEXT.md` — D-26 (per-task execution directories), D-33 (orient/ for briefs, plans/ for plans, execution/ for runtime), D-42 (skill file per skill), D-45 (tsdown build to dist/server.js).
- `.planning/phases/02-scout-and-analysis-squad/02-CONTEXT.md` — D-05 (agents as callable modules: Options + Result + async function), D-15 (graphology in-memory), D-18 (blastRadius function in analytics.ts).
- `.planning/phases/03-bootstrap-synthesis-and-mcp-server/03-CONTEXT.md` — D-17/D-18/D-19 (MCP response contract: ok/error/partial with staleness), D-21 (graph cache with 5-min TTL), D-27 (codescope_orient MCP tool is lightweight brief, NOT full pipeline), D-36/D-37/D-38 (partial tools with capabilities/upcoming).

### Existing Code
- `src/tools/orient.ts` — codescope_orient MCP tool (lightweight brief: keyword extraction, graph walk, relevant files, conventions, danger zones). Reusable for clarification's graph analysis.
- `src/graph/analytics.ts` — loadGraphFromSQLite, computeCentrality, detectCommunities, blastRadius, computeDangerZones. Core graph operations for clarification and analysis.
- `src/graph/cache.ts` — getGraph() with 5-min TTL cache. Use for all graph queries in orient pipeline.
- `src/tools/helpers.ts` — okResponse, errorResponse, buildMetadata, isBootstrapped. Reusable for orient pipeline responses.
- `src/config/schema.ts` — ConfigSchema with orient and execute sections. execute.parallel needs removal per D-44.
- `skills/orient/` — Orient skill directory (currently stub, to be implemented).
- `src/agents/` — Existing agent modules (scout, researcher, etc.) establish the callable module pattern.
- `src/bootstrap/orchestrator.ts` — Bootstrap orchestrator establishes the agent spawning + filesystem coordination pattern.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **codescope_orient MCP tool** (src/tools/orient.ts): extractKeywords, graph walk (1-2 hops), classifyRisk, readRelevantConventions, computeDangerZones. Reusable for the clarification phase's graph analysis.
- **Graph analytics** (src/graph/analytics.ts): blastRadius with hop-distance classification, computeCentrality, detectCommunities. Core operations for scope contract risk assessment and analysis phase.
- **Graph cache** (src/graph/cache.ts): getGraph() returns cached graphology instance with centralities. All orient pipeline phases should use this.
- **MCP response helpers** (src/tools/helpers.ts): okResponse/errorResponse/buildMetadata/isBootstrapped. Use for the orient skill's structured output.
- **Agent module pattern** (src/agents/*.ts): Options interface + Result interface + async function + markdown artifact output. Phase 4 agents (clarification, research, planner, execution) should follow this pattern.
- **Bootstrap orchestrator** (src/bootstrap/orchestrator.ts): Sequential agent spawning with filesystem coordination (Issue #5812 pattern). Template for orient's orchestration.
- **Config loader** (src/config/loader.ts): loadConfig reads config.yml with Zod validation. Orient reads clarification style, max_agents_concurrent, etc.

### Established Patterns
- Agent module pattern: Options + Result + async function + markdown artifact (Phase 2 D-05)
- Issue #5812 filesystem coordination: agents write files, parent reads files
- Thin orchestrator: <15K tokens, all state on disk
- Structured markdown artifacts with consistent sections
- ESM-first with type:module and NodeNext module resolution

### Integration Points
- New `src/orient/` — clarification, research, analysis, planner modules
- New `src/execution/` — orchestrator, coordination, agent spawning, validation
- New `skills/orient/SKILL.md` — full skill body (replacing stub)
- Modified `src/config/schema.ts` — remove execute.parallel, keep max_agents_concurrent
- New coordination.md template in execution/[task-slug]/
- New plan file structure in plans/[task-slug].md

</code_context>

<specifics>
## Specific Ideas

- Clarification is dynamic, not capped — driven by graph ambiguity. A precise task needs 0 questions, a vague refactor might need 8. Soft guardrail prevents runaway questioning without limiting thoroughness.
- Research uses impact-ranked progressive approach — graph scores research topics, thorough on high-impact, shallow/skip on low-impact, Context7 before web search. Token spend proportional to actual unknowns, not a fixed budget.
- Parallel agents communicate via structured discovery signals (api_change/new_utility/pattern/warning) — one-way broadcasts, not dialogue. Gets code quality benefit of sharing critical discoveries without token waste of full communication.
- Plan validation distinguishes mechanical errors (auto-fixable) from structural errors (escalate to user). Auto-fix patches the plan, not regenerates it. User-requested re-plan does full regeneration.
- execute.parallel config field removed — contradicts "planner always picks" key decision. Only max_agents_concurrent remains as user-facing execution config.
- Agent teams detection + auto-enable during onboarding, with runtime probe fallback. One-time hint on sequential fallback, never nags.

</specifics>

<deferred>
## Deferred Ideas

- Text-based and hybrid search for codescope_search — deferred from Phase 3, could enhance research agent
- Full verification (blast radius diff, build/test) for codescope_verify — Phase 5
- Convention enforcement rollback via /codescope:settings — Phase 7
- Agent teams settings management via /codescope:settings — Phase 7

</deferred>

---

*Phase: 04-orient-and-execution-engine*
*Context gathered: 2026-03-23*
