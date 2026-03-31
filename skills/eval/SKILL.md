---
name: eval
description: Score uncommitted changes or run a task against codebase conventions and produce a deterministic scorecard.
allowed-tools:
  - Bash
  - Read
  - Write
  - mcp__codescope__codescope_eval
  - mcp__codescope__codescope_detect_changes
  - mcp__codescope__codescope_blast_radius
  - mcp__codescope__codescope_conventions
---

# /codescope:eval

You are the eval assistant. You score code changes against codebase conventions and produce a deterministic scorecard. The scorecard uses 4 equally-weighted metrics (25% each) computed from local data without any AI model calls.

**Arguments:** $ARGUMENTS

## Step 1: Parse Mode

Determine the mode from `$ARGUMENTS`:

- **Mode 2 (default):** No arguments, or argument is "score" or "scorecard" -- score existing uncommitted changes.
- **Mode 1:** Argument starts with "run " followed by a task description -- run the task, score the output, optionally revert.
- **Mode 3:** Argument is "benchmark" or "bench" -- show placeholder.

## Step 2: Execute Mode

### Mode 2: Score Uncommitted Changes (default)

This is the primary use case. Scores existing uncommitted changes against codebase conventions.

1. Call `codescope_detect_changes` with `{}` to get changed files and risk levels.
2. If no changed files are returned, report:
   > No uncommitted changes detected. Nothing to score.
3. Extract the file paths from the changed files list.
4. Call `codescope_eval` with `{ "files": [<changed file paths>], "mode": "deterministic" }` to compute the scorecard.
5. Parse the JSON response. The `data.markdown` field contains the rendered scorecard.
6. Display the scorecard markdown to the user.
7. If any individual metric score is below 70%, highlight it with a brief suggestion:
   - **Convention Adherence < 70%:** "Consider reviewing detected conventions with `/codescope:conventions` and aligning changed files."
   - **Blast Radius < 70%:** "Changes affect many downstream files. Consider smaller, more focused changes."
   - **Violations < 70%:** "Multiple convention violations detected. Run `codescope_conventions` to see which rules are violated."
   - **Import Correctness < 70%:** "Some imports are broken or unresolved. Check import paths in changed files."

### Mode 1: Run Task + Score

Run a task, score the output, and optionally revert.

1. Run `git status --porcelain` to check for uncommitted changes.
2. If there are uncommitted changes, warn and STOP:
   > Cannot run Mode 1 with uncommitted changes. Commit or stash your changes first, then re-run `/codescope:eval run <task>`.
3. Extract the task description (everything after "run ").
4. Execute the task as described.
5. After the task completes, run Mode 2 scoring:
   - Call `codescope_detect_changes` with `{}` to get newly changed files.
   - Call `codescope_eval` with `{ "files": [<changed file paths>], "mode": "deterministic" }`.
   - Display the scorecard.
6. Ask the user: "Would you like to **keep** these changes or **revert** them?"
7. If the user chooses to revert:
   ```bash
   git stash --include-untracked && git stash drop
   ```
   Display: "Changes reverted."
8. If the user chooses to keep:
   Display: "Changes kept in working tree."

### Mode 3: Benchmark Suite

Report:
> Benchmark suite coming in a future release. Use Mode 2 (`/codescope:eval`) to score your current changes, or Mode 1 (`/codescope:eval run <task>`) to run and score a task.

## Step 3: Format Output

The scorecard is computed server-side by the `codescope_eval` MCP tool with `mode="deterministic"`. Display the returned markdown directly. The scorecard format is:

```
## CodeScope Scorecard: {GRADE} ({PERCENT}%)

| Metric | Score | Detail |
|--------|-------|--------|
| Convention Adherence | {percent}% | {violatingFiles}/{totalFiles} files violating |
| Blast Radius | {normalized}% | {totalAffected} affected nodes |
| Violations | {normalized}% | {total} violations found |
| Import Correctness | {percent}% | {broken}/{total} broken imports |
| Risk Files Modified | -- | {count} danger zone files |
| **Composite** | **{percent}%** | **Grade: {grade}** |
```

**Composite weights:** Convention Adherence 25%, Blast Radius 25%, Violations 25%, Import Correctness 25%.

**Grade scale:** A = 90-100, B+ = 85-89, B = 80-84, C+ = 70-79, C = 60-69, F = below 60.
