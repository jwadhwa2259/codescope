# Phase 4: Orient and Execution Engine - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-23
**Phase:** 04-orient-and-execution-engine
**Areas discussed:** Scope contract & approval, Plan review gate, Execution feedback, Agent failure behavior, Research agent scope, Agent context budget, Plan validation rules, Onboarding agent teams

---

## Scope Contract & Approval

### Pipeline flow

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-proceed | Scope written to disk, orient continues to research/planning automatically | |
| Show and confirm | Scope displayed with approve/edit/reject prompt | |
| Two gates: scope + plan | Checkpoint after scope AND after plan | ✓ |

**User's choice:** Two gates — Gate 1 after scope, Gate 2 after plan
**Notes:** User wanted both checkpoints to catch scope misunderstandings early before expensive research/planning

### Gate 1 weight

| Option | Description | Selected |
|--------|-------------|----------|
| Quick confirm | In/Out lists + approve/edit/reject, 3 seconds to scan | ✓ |
| Detailed review | Scope contract with affected modules, estimated blast radius, danger zones | |

**User's choice:** Quick confirm

### Skip gates flag

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, --no-confirm skips both | Power users and automation can skip. Artifacts still written to disk. | ✓ |
| No, always confirm | Orient always pauses at both gates | |

**User's choice:** --no-confirm skips both

### Scope rejection behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Re-clarify | Return to clarification with rejection reason | ✓ |
| Abort orient | Stop pipeline entirely | |

**User's choice:** Re-clarify

### Clarification trigger

| Option | Description | Selected |
|--------|-------------|----------|
| Graph-informed auto-detect | Keyword match against graph, skip if specific, ask if vague | ✓ |
| Word count heuristic | <4 words = ask, >6 words with concrete nouns = skip | |
| Always ask at least 1 | Always run at least one round of clarification | |

**User's choice:** Graph-informed auto-detect

### Graph context for clarification

| Option | Description | Selected |
|--------|-------------|----------|
| Full context | Affected modules, convention conflicts, danger zones, missing test coverage | ✓ |
| Minimal context | Only which files/modules match, scope boundary questions only | |

**User's choice:** Full context

### Question cap

| Option | Description | Selected |
|--------|-------------|----------|
| 3-5 questions | Hard cap | |
| Uncapped | Keep asking until resolved | |
| Dynamic (custom) | Driven by actual ambiguity, soft guardrail after 5+ | ✓ |

**User's choice:** Dynamic — user explicitly rejected a set number. "The agent should be able to clarify all gray areas. The more grey areas, the more questions." Soft guardrail added as compromise.

### Scope contract detail

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, include risk context | In/Out + affected files count + high-risk flagged + community boundaries | ✓ |
| Just In/Out lists | Clean minimal scope contract | |

**User's choice:** Include risk context

### Question pacing

| Option | Description | Selected |
|--------|-------------|----------|
| Batched by topic | Group related questions, fewer round-trips | ✓ |
| One at a time | Each question individual, adaptive | |
| Adaptive | Start batched, follow up one-at-a-time | |

**User's choice:** Batched by topic

### Minimal clarification mode

| Option | Description | Selected |
|--------|-------------|----------|
| Raise the threshold | Only HIGH-ambiguity gray areas, skip MEDIUM/LOW with assumptions | ✓ |
| Skip clarification entirely | No questions in minimal mode | |

**User's choice:** Raise the threshold

---

## Plan Review Gate

### Plan detail level

| Option | Description | Selected |
|--------|-------------|----------|
| Full plan | Agent assignments, execution order, estimated changes, conventions, strategy rationale | ✓ |
| Summary only | Task list, execution mode, total file count | |
| Diff-style preview | What will change per file/module | |

**User's choice:** Full plan

### Gate 2 actions

| Option | Description | Selected |
|--------|-------------|----------|
| Approve / Edit / Reject | Edit allows task-level modifications, planner re-validates | ✓ |
| Approve / Reject only | No inline editing | |
| Approve / Reject / Re-plan | Feedback to planner for revised plan | |

**User's choice:** Approve / Edit / Reject

### Edit scope

| Option | Description | Selected |
|--------|-------------|----------|
| Task-level edits | Remove tasks, reorder, change files, add constraints. Re-validate. | ✓ |
| Free-text feedback | User writes feedback, planner regenerates | |
| Both | Structured + free-text | |

**User's choice:** Task-level edits

### Plan persistence

| Option | Description | Selected |
|--------|-------------|----------|
| Always persist | Plan written regardless of outcome | ✓ |
| Only on approve | Rejected plans discarded | |

**User's choice:** Always persist

### --no-confirm plan behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Write but don't pause | Plan on disk for post-hoc review | ✓ |
| Skip write too | Plan in memory only | |

**User's choice:** Write but don't pause

### Edit trail

| Option | Description | Selected |
|--------|-------------|----------|
| Log in plan file | "## Removed by User" section | ✓ |
| No logging | Removed tasks disappear | |

**User's choice:** Log in plan file

---

## Execution Feedback

### Brief verbosity

| Option | Description | Selected |
|--------|-------------|----------|
| Phase banners + completion | Wave headers + per-agent completion as they finish | ✓ |
| Start/finish only | One message at start, one at end | |
| Progress bar | Single-line progress indicator | |

**User's choice:** Phase banners + completion

### Detailed verbosity additions

| Option | Description | Selected |
|--------|-------------|----------|
| Agent-level file lists | Per-agent files + change summaries + coordination entries | ✓ |
| Full coordination log streaming | Real-time coordination.md stream | |
| Per-agent diff previews | Condensed diff after each agent | |

**User's choice:** Agent-level file lists

### Parallel output interleaving

| Option | Description | Selected |
|--------|-------------|----------|
| Completion order | Show as agents finish, regardless of order | ✓ |
| Grouped by wave | Buffer until wave completes | |
| Live interleave | Real-time from all agents with labels | |

**User's choice:** Completion order

### Execution summary

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, always | Time, files, agents, mode, tokens, next step | ✓ |
| Only in brief mode | Summary only when execution was quiet | |

**User's choice:** Always

### Coordination file format

| Option | Description | Selected |
|--------|-------------|----------|
| Structured markdown | Append-only, timestamps, agent names, status, file lists | ✓ |
| JSONL | Machine-parseable JSON lines | |
| Dual format | Both markdown and JSONL | |

**User's choice:** Structured markdown

### SendMessage logging

| Option | Description | Selected |
|--------|-------------|----------|
| Log to coordination.md | Full audit trail | ✓ |
| Ephemeral only | Real-time only, not logged | |

**User's choice:** Log to coordination.md

### Cost/token estimate

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, include estimate | Per-agent and total token usage | ✓ |
| No cost info | Focus on outcomes only | |
| Only in detailed mode | Cost-conscious users opt into detailed | |

**User's choice:** Yes, include estimate

### Coordination scope

| Option | Description | Selected |
|--------|-------------|----------|
| Per-task | Fresh coordination.md per orient in execution/[task-slug]/ | ✓ |
| Append across tasks | Single growing file | |

**User's choice:** Per-task

---

## Agent Failure Behavior

### Default failure behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Skip and continue | Log failure, skip agent, continue with remaining | |
| Stop pipeline | Halt all execution | |
| Auto-retry once, then skip | Retry, if fails again skip | |
| Retry + skip dependents + continue independents (custom) | Best code quality approach | ✓ |

**User's choice:** Custom approach based on code quality analysis. Auto-retry once (with error context), skip failed agent + all dependents, continue independent agents. User asked "What's the best way to handle this to improve code quality?" — recommendation provided and accepted.

### Dependent agents

| Option | Description | Selected |
|--------|-------------|----------|
| Skip dependents | If dependency fails, skip dependent agents | ✓ |
| Try anyway | Run dependents even if dependency failed | |
| Ask user | Pause and ask per case | |

**User's choice:** Skip dependents (part of the hybrid approach)

### Failure reporting

| Option | Description | Selected |
|--------|-------------|----------|
| Inline summary + next steps | Succeeded, failed, skipped with reasons and suggested actions | ✓ |
| Just the status | Counts only, details in coordination.md | |

**User's choice:** Inline summary + next steps

### Partial execution git behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Leave uncommitted | Working tree changes, user reviews diff | ✓ |
| Commit successful agents only | Per-agent commits | |
| Single commit if >50% succeeded | Pragmatic threshold | |

**User's choice:** Leave uncommitted

### Agent timeout

| Option | Description | Selected |
|--------|-------------|----------|
| Per-agent from plan | Planner estimates based on complexity/file count | ✓ |
| Global configurable timeout | Same for all agents | |
| No timeout | Let agents run until done | |

**User's choice:** Per-agent from plan

### Retry context

| Option | Description | Selected |
|--------|-------------|----------|
| Same context + error info | Original context + error message for adaptation | ✓ |
| Exact same context | Identical input for transient failures | |

**User's choice:** Same context + error info

---

## Research Agent Scope

### Research strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Task + graph driven | Extract libs from affected files, Context7 for those, web search for patterns | ✓ |
| Broad exploration | Search all project libraries + domain web search | |
| User-directed | Ask user what to research during clarification | |

**User's choice:** Task + graph driven

### Output format

| Option | Description | Selected |
|--------|-------------|----------|
| Scoped markdown | research.md with APIs, Best Practices, Issues, Version Notes | ✓ |
| Raw dumps | Full Context7/web search results | |
| Structured JSON | Machine-parseable research data | |

**User's choice:** Scoped markdown

### Time/token budget

| Option | Description | Selected |
|--------|-------------|----------|
| Soft budget from config | orient.max_research_time with partial results | |
| No budget, thoroughness-driven | Research until covered | |
| Impact-ranked progressive (custom) | Score by graph impact, thorough on high, skip low | ✓ |

**User's choice:** Impact-ranked progressive. User initially chose "no budget" but clarified: "I need research to be full but also not run up a bunch of tokens. Is there a smarter way to handle this?" Recommendation for impact-ranked progressive approach accepted.

### Research visibility at Gate 2

| Option | Description | Selected |
|--------|-------------|----------|
| Referenced in plan, linkable | Plan cites findings, full research.md on disk | ✓ |
| Separate section in plan review | Research Summary section before agent assignments | |
| Hidden, planner-only | User only sees influence through plan decisions | |

**User's choice:** Referenced in plan, linkable

---

## Agent Context Budget

### Context allocation

| Option | Description | Selected |
|--------|-------------|----------|
| Scoped per agent | Only its tasks, file-matched conventions, scoped golden files, dep coordination, relevant research | ✓ |
| Full shared context | Every agent gets everything | |
| Tiered by role | Lead gets full, subsequent get progressively lighter | |

**User's choice:** Scoped per agent

### Golden file inclusion

| Option | Description | Selected |
|--------|-------------|----------|
| By reference with key excerpts | File path + 10-20 key lines, agent reads full if needed | ✓ |
| Full inline | Entire golden file in prompt | |
| Reference only | Just file path | |

**User's choice:** By reference with key excerpts

### Token budgeting

| Option | Description | Selected |
|--------|-------------|----------|
| Estimate but don't enforce | Planner estimates, logged in plan, no hard cap | ✓ |
| Hard budget per agent | Max context budget, split if exceeded | |
| No budgeting | Agents get whatever they need | |

**User's choice:** Estimate but don't enforce

### Convention filtering

| Option | Description | Selected |
|--------|-------------|----------|
| File-matched | Only conventions for files the agent will touch | ✓ |
| Language-matched | All conventions for target language | |
| All conventions | Every agent gets all | |

**User's choice:** File-matched

### MCP tool access

| Option | Description | Selected |
|--------|-------------|----------|
| Full MCP access | Agents can call all CodeScope MCP tools | ✓ |
| Pre-loaded only | No MCP tools during execution | |
| Read-only MCP | Query tools only | |

**User's choice:** Full MCP access

### Coordination context growth

| Option | Description | Selected |
|--------|-------------|----------|
| Progressive | Later agents read coordination from completed agents | ✓ |
| Isolated | Each agent only sees its plan tasks | |

**User's choice:** Progressive

### Parallel agent communication

| Option | Description | Selected |
|--------|-------------|----------|
| SendMessage for handoffs only | ready/done/blocked signals only | |
| Rich SendMessage sharing | Detailed context, code snippets, warnings | |
| Handoffs + discovery signals (custom) | Handoffs + structured discovery broadcasts (api_change/new_utility/pattern/warning) | ✓ |
| No real-time sharing | Isolated, coordination.md only after completion | |

**User's choice:** Handoffs + discovery signals. User initially chose "handoffs only" but asked for deeper analysis on code quality impact. Recommendation for structured discovery signals accepted — one-way broadcasts that share critical findings without conversational overhead.

---

## Plan Validation Rules

### Validation checks beyond EXEC-10

| Option | Description | Selected |
|--------|-------------|----------|
| Dependency ordering | No circular deps, no same-wave dependencies | ✓ |
| Scope coverage | Every In Scope item has assigned agent | ✓ |
| Convention feasibility | No contradicting conventions per file | |
| Blast radius bounds | Total files vs scope estimate | |

**User's choice:** Dependency ordering + scope coverage. Scope coverage added after user asked "What would you recommend for code quality?" — identified as highest-impact validation for code completeness.

### Validation failure handling

| Option | Description | Selected |
|--------|-------------|----------|
| Auto re-plan with error context | Send errors to planner, max 2 attempts | |
| Show errors, user decides | Display at Gate 2 | |
| Hybrid: auto-fix mechanical, escalate structural (custom) | Overlapping writes/dep ordering auto-patched. Scope gaps/blast radius drift escalated to user. | ✓ |

**User's choice:** Hybrid approach. User asked "What would you recommend for quality code?" — recommendation to distinguish mechanical vs structural errors accepted.

### Re-plan context

| Option | Description | Selected |
|--------|-------------|----------|
| Focused error prompt for auto-fixes, full regen for user re-plans | Patch scheduling errors, regenerate flawed approaches | ✓ |
| Always focused patch | Same approach for all re-plans | |

**User's choice:** Focused patch for auto-fixes, full regen for user-requested re-plans

### Validation in plan file

| Option | Description | Selected |
|--------|-------------|----------|
| Validation section in plan | ## Validation with checks, results, fix details | ✓ |
| Separate validation log | validation.md in execution/[task-slug]/ | |

**User's choice:** Validation section in plan

### Validation timing

| Option | Description | Selected |
|--------|-------------|----------|
| Before Gate 2 | Validate, auto-fix, then present clean plan | ✓ |
| After Gate 2 | User approves, then validate | |

**User's choice:** Before Gate 2

---

## Onboarding Agent Teams

### Detection approach

| Option | Description | Selected |
|--------|-------------|----------|
| Detect + educate | Explain benefit, show command, ask to enable | |
| Detect + auto-enable | Auto-add to settings.json with permission | |
| Detect + ask + auto-write (custom) | Detect, explain, ask, write to settings.json on yes | ✓ |
| Just detect and note | Note in config, no prompting | |

**User's choice:** Detect + ask + auto-write. User asked "Anyway to detect and ask to auto enable?" — combined detection with informed consent auto-writing.

### Runtime fallback messaging

| Option | Description | Selected |
|--------|-------------|----------|
| One-time hint | First sequential fallback shows enablement instructions, never repeats | ✓ |
| Every time | Show hint every sequential fallback | |
| Silent fallback | No mention, respect user's choice | |

**User's choice:** One-time hint

### Detection timing

| Option | Description | Selected |
|--------|-------------|----------|
| During onboarding | Part of /codescope:onboard, after model selection | ✓ |
| First orient run | Defer until actually relevant | |

**User's choice:** During onboarding

### Broken agent teams handling

| Option | Description | Selected |
|--------|-------------|----------|
| Runtime probe + graceful fallback | Lightweight probe, fall back to sequential if fails | ✓ |
| Trust the env var | Assume works, handle failure as agent failure | |

**User's choice:** Runtime probe + graceful fallback

### Config schema reconciliation

| Option | Description | Selected |
|--------|-------------|----------|
| Remove execute.parallel, keep max_agents | Drop the enum, planner always picks | ✓ |
| Keep as planner hint | Rename to preference, soft constraint | |
| Keep as hard override | User forces execution mode | |

**User's choice:** Remove execute.parallel, keep max_agents

### Settings re-detection

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, via /codescope:settings | Agent Teams section in settings skill | ✓ |
| Only via onboard | Settings shows status but can't modify | |

**User's choice:** Yes, via /codescope:settings

---

## Claude's Discretion

No areas deferred to Claude's discretion.

## Deferred Ideas

- Text-based and hybrid search for codescope_search (from Phase 3)
- Full verification for codescope_verify (Phase 5)
- Convention enforcement rollback via /codescope:settings (Phase 7)
- Agent teams settings management via /codescope:settings (Phase 7)
