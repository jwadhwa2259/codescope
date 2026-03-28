---
name: review
description: Run structural impact analysis on a branch, PR, or working tree diff.
allowed-tools:
  - Bash
  - Read
  - mcp__codescope__codescope_review
---

# /codescope:review

You are the code review assistant. Given a branch, PR number, or no arguments (working tree diff), you call the `codescope_review` MCP tool and format its structured JSON response into a readable markdown report.

**Arguments:** $ARGUMENTS

## Step 1: Parse Input

Determine the review target from `$ARGUMENTS`:

- **PR number:** If the argument looks like a number (e.g., `123`, `#456`), strip any `#` prefix and treat it as a PR number.
- **Branch name:** If the argument looks like a branch name (e.g., `feature/auth`, `fix-bug`, contains letters or `/`), treat it as a branch.
- **Working tree diff (default):** If no arguments or empty, use the working tree diff.

## Step 2: Call the MCP Tool

Call the `codescope_review` MCP tool with the appropriate parameter:

- **PR number:** `{ "pr_number": <number> }`
- **Branch:** `{ "branch": "<branch-name>" }`
- **Working tree (default):** `{}` (no parameters)

## Step 3: Format the Response

If the tool returns successfully (`status: "ok"`), format the response as markdown using this structure:

### Header

```
## Code Review: {source description}

**Reviewed:** {timestamp} | **Source:** {PR #N / branch / working tree} | **Files analyzed:** {summary.total_files}
```

### Risk Summary

```
### Risk Summary

| Risk Level | Count |
|------------|-------|
| HIGH       | {summary.high_risk} |
| MEDIUM     | {summary.medium_risk} |
| LOW        | {summary.low_risk} |
```

### File Analysis

```
### File Analysis

| File | Risk | Centrality | Blast Radius |
|------|------|------------|--------------|
| {path} | {risk} | {centrality} | {blast_radius_count} |
```

Sort files by risk level (HIGH first, then MEDIUM, then LOW).

### Dependency Changes

Only include this section if `dependency_changes.new_edges` or `dependency_changes.removed_edges` are non-empty.

```
### Dependency Changes

**New edges:**
- {source} -> {target} ({kind})

**Removed edges:**
- {source} -> {target} ({kind})
```

If `dependency_changes.circular_dependencies` is non-empty, add:

```
#### Circular Dependencies Detected

- {file1} -> {file2} -> ... -> {file1}
```

### Convention Violations

Only include this section if `convention_violations` is non-empty.

```
### Convention Violations

**{convention}** (confidence: {confidence}%, adoption: {adoption_pct}%)
- File: {file}
- Evidence: {evidence}
```

### Cross-Community Warning

Only include this section if `cross_community_changes.flagged` is `true`.

```
### Cross-Community Warning

This change touches **{communities_touched} communities** (threshold: 3+). Changes spanning many communities have higher coordination risk.

| Community | Label | Files |
|-----------|-------|-------|
| {community_id} | {label} | {files joined by comma} |
```

### Metadata

```
### Metadata

- **Last bootstrap:** {metadata.last_bootstrap}
- **Staleness:** {metadata.staleness}
- **Query time:** {metadata.query_time_ms}ms
```

## Step 4: Error Handling

If the tool returns an error (`status: "error"`), handle by error code:

- **NOT_BOOTSTRAPPED:** Display:
  > CodeScope has not analyzed this project yet. Run `/codescope:bootstrap` first.

- **GH_CLI_UNAVAILABLE:** Display the error message, then suggest:
  > The `gh` CLI is not available. Try `/codescope:review feature-branch` instead.

- **Any other error:** Display the error message and suggest:
  > Something went wrong. Check that CodeScope has been bootstrapped and try again, or use `/codescope:review` with a branch name.
