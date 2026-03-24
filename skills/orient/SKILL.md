---
name: orient
description: Take a task description and autonomously research, plan, and execute code changes using graph-informed clarification, hybrid execution, and filesystem coordination.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Agent
---

# /codescope:orient

You are the orient pipeline orchestrator. Given a task description, you will autonomously research, plan, and execute code changes using the CodeScope knowledge graph.

**Task:** $ARGUMENTS

## Prerequisites

First verify CodeScope has analyzed this codebase:

1. Run: `node --import tsx/esm src/orient/run-orient.ts --project-root "$(pwd)" --task "$ARGUMENTS" --check-only`
2. Parse the JSON output.
3. If `bootstrapped` is false, tell the user: "CodeScope has not analyzed this codebase yet. Run `/codescope:bootstrap` first to build the knowledge graph." and stop.
4. If `bootstrapped` is true, continue.

## Flag Detection

Check if `$ARGUMENTS` contains special flags:
- `--no-confirm`: Skip both gates (scope and plan approval). Set `NO_CONFIRM=true`.
- `--no-clarify`: Skip clarification step. Set `NO_CLARIFY=true`.

Strip flags from the task description before passing to pipeline steps.

## Step 1: Clarification and Scope Contract

Run the orient pipeline for clarification:

1. Run: `node --import tsx/esm src/orient/run-orient.ts --project-root "$(pwd)" --task "{task}" --phase clarification`
   - If `--no-clarify` was detected, add `--no-clarify` to the command.
2. Parse the JSON output. Store the `taskSlug` and `outputDir` for subsequent steps.
3. If `needsClarification` is true:
   - Present the questions to the user, grouped by topic (scope_boundary, convention_conflict, danger_zone, test_coverage).
   - Format each question with its context for the user to understand why it's being asked.
   - Collect answers from the user.
   - Run: `node --import tsx/esm src/orient/run-orient.ts --project-root "$(pwd)" --task "{task}" --phase scope-contract --task-slug "{taskSlug}" --answers '{answersJSON}'`
   - Parse the output to get the `scopeContractPath`.
4. If `needsClarification` is false:
   - Display: "Task is specific enough -- skipping clarification. Proceeding to research."
   - The scope contract was auto-generated. Read `scopeContractPath` from the clarification output's `outputDir` + `/scope-contract.md`.

### Gate 1: Scope Approval

Read the scope contract file and present it to the user:

## Scope Contract

{Display the scope contract contents: In Scope / Out of Scope / Affected Files table / Assumptions / Conventions in Scope / Risk Flags}

Approve this scope? [approve / edit / reject]

Handle the response:
- If **approve**: Display "**APPROVED** -- proceeding to research and planning." and continue to Step 2.
- If **edit**: Ask what to change, update the scope contract file, re-present the gate.
- If **reject**: Display "**REJECTED** -- returning to clarification with your feedback." Ask for feedback and restart Step 1 with the rejection reason appended to the task.

If `NO_CONFIRM` is true: skip this gate, display "Scope auto-approved (--no-confirm)." and continue.

## Step 2: Research

1. Run: `node --import tsx/esm src/orient/run-orient.ts --project-root "$(pwd)" --task "{task}" --phase research --task-slug "{taskSlug}"`
2. Parse the JSON output.
3. If `topicsResearched` is greater than 0 and a `researchPrompt` is present:
   - Display: "## Researching..."
   - Display: "Found {topicsResearched} external libraries to research. Spawning research agent..."
   - Spawn a research sub-agent using the Agent tool:
     - Pass the `researchPrompt` as the agent's prompt.
     - The agent should have access to: Read, Bash (for running research commands).
     - Wait for the agent to complete.
     - The agent writes research findings to the execution directory.
   - Display: "Research complete."
4. If `topicsResearched` is 0:
   - Display: "All affected libraries are internal -- skipping external research. Proceeding to planning."

## Step 3: Analysis and Planning

1. Display: "## Planning..."
2. Run: `node --import tsx/esm src/orient/run-orient.ts --project-root "$(pwd)" --task "{task}" --phase analysis-and-planning --task-slug "{taskSlug}"`
3. Parse the JSON output.
4. Analysis runs directly (graph operations, fast). Display the analysis summary:
   - "Analysis: {affectedFiles} affected files, {blastRadiusFiles} in blast radius, {conventionMatches} conventions, {testFiles} test files, {crossCommunityImpact} communities impacted."
5. The planner module prepares a planning prompt. Spawn a planner sub-agent:
   - Use the Agent tool with the `plannerPrompt` from the output.
   - The agent produces an execution plan with agent assignments.
   - Wait for the agent to complete.
6. The plan was validated automatically. Display the validation summary:
   - If `validationResult.passed` is true: "Plan validation: all {checks} checks passed."
   - If auto-fix was needed: "Plan validation: {autoFixAttempts} auto-fix attempt(s) applied."

### Gate 2: Plan Approval

Read the execution plan from the `planPath` in the output and present it:

## Execution Plan

{Display the plan contents: agents with wave assignments, execution order table, estimated changes, conventions, hybrid strategy rationale, validation status}

Approve this plan? [approve / edit / reject]

Handle the response:
- If **approve**: Display "**APPROVED** -- beginning execution." and continue to Step 4.
- If **edit**: Ask what to change. Allow task-level modifications: remove tasks, reorder priority, change file assignments, add constraints. Log removed tasks in the plan's "## Removed by User" section. Re-validate by re-running the analysis-and-planning phase. Re-present the gate.
- If **reject**: Display "**REJECTED** -- returning to scope contract." Return to Step 1's Gate 1.

If `NO_CONFIRM` is true: skip this gate, display "Plan auto-approved (--no-confirm)." and continue.

## Step 4: Execution

Display: "## Executing..."

1. Run: `node --import tsx/esm src/execution/run-execution.ts --project-root "$(pwd)" --task-slug "{taskSlug}" --plan-path "{planPath}"`
2. The execution engine prepares agent invocations. Parse the JSON output.

For each wave in the execution plan:
- Display: "Executing wave {N}/{total}: [{agent names}]..."
- For each agent in the wave:
  - Read the agent's prepared invocation from the execution output.
  - Spawn the agent using the Agent tool with the prepared prompt, appropriate tool access (Read, Write, Edit, Bash, Glob, Grep), and timeout.
  - On completion: display "{agent-name} complete ({duration}s, {N} files)"
  - On failure: display "{agent-name} **failed** ({error}) -- retrying once..."
    - Retry with the same prompt plus error context appended.
    - If retry fails: display "{agent-name} **failed** after retry -- skipping + {N} dependents"
- After each wave completes, check for failed agents and skip their dependents in subsequent waves.

## Step 5: Summary

After all waves complete, display the execution summary:

## Summary

Total: {duration}s | Files changed: {N} | Agents: {succeeded}/{total} | Mode: {mode} | Tokens: ~{estimate}

Next: Proceeding to verification... (Phase 5)

If there were failures, also display:
- List each failed agent with its error
- "Partial results are in your working tree as uncommitted changes. Review with `git diff`."
- "To retry failed tasks: `/codescope:orient` with the same task description."

## Error Handling

- If any `node --import tsx/esm` command exits with code 1, parse the error JSON and display the error message to the user.
- If the graph database is not found, suggest running `/codescope:bootstrap`.
- If config.yml is missing, suggest running `/codescope:onboard`.
- If an agent spawn fails due to timeout, log the timeout and continue with the next agent.

## Notes

- All artifacts are persisted to disk regardless of outcome (scope contract, plan, coordination log, summary) per D-16.
- The coordination log at `.claude/codescope/execution/{taskSlug}/coordination.md` provides a full audit trail.
- Plans are always written to `.claude/codescope/plans/{taskSlug}.md` even if rejected per D-16.
- The execution summary is written to `.claude/codescope/execution/{taskSlug}/summary.md`.
