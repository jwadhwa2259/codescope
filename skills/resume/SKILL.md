---
name: resume
description: Resume a paused CodeScope pipeline from a handoff document.
allowed-tools:
  - Bash
  - Read
  - Write
  - mcp__codescope__codescope_status
---

# /codescope:resume

You are the session resume handler. Given an optional task slug, you will find the most recent handoff document, display its summary, validate artifacts, and offer the user options to continue or start fresh.

**Arguments:** $ARGUMENTS

## Step 1: Find Handoff

If `$ARGUMENTS` contains a task slug, read the handoff file at:
```
.claude/codescope/sessions/{TASK_SLUG}-handoff.md
```

If no task slug is provided, find the most recent handoff:
```bash
ls -t .claude/codescope/sessions/*-handoff.md 2>/dev/null | head -1
```

If no handoff file is found, inform the user:

> No session handoff found. Use `/codescope:orient` to start a new task.

And stop.

## Step 2: Parse and Display Handoff Summary

Read the handoff file. Extract YAML frontmatter fields: `task_slug`, `pipeline_phase`, `wave_position`, `timestamp`.

Display a summary:

```
## Session Resume

**Task:** {task_slug}
**Paused at:** {pipeline_phase}
**Wave position:** {wave_position}
**Timestamp:** {timestamp}

### Completed Work
- [x] {each completed work item from handoff}

### Remaining
- [ ] {each remaining task item from handoff}

### Key Decisions
- {each key decision from handoff}
```

## Step 3: Validate Artifacts

Run artifact validation via the built handoff-parser module:

```bash
node -e "
import { findLatestHandoff, validateHandoffArtifacts } from './dist/session/handoff-parser.mjs';
const r = findLatestHandoff('.claude/codescope/sessions', 'TASK_SLUG_HERE');
if (r) {
  const v = validateHandoffArtifacts(r.data);
  console.log(JSON.stringify(v));
} else {
  console.log(JSON.stringify({ valid: false, missing: ['handoff not found'] }));
}
"
```

Replace `TASK_SLUG_HERE` with the actual task slug.

If validation shows missing artifacts, warn the user:

> **Warning:** The following artifacts are missing and those phases may need re-running:
> - {each missing artifact}

## Step 4: Offer Resume Options

Present the following options to the user:

1. **Continue** (recommended) -- Resume the pipeline at the `{pipeline_phase}` phase, skipping completed phases.
2. **Start fresh** -- Ignore the handoff and start a new pipeline with `/codescope:orient`.
3. **Cancel** -- Do nothing.

Wait for the user to select an option.

## Step 5: Execute Resume

Based on user selection:

- **If Continue:** Run the orient CLI with the `--resume` flag to determine the resume point:
  ```bash
  node --import tsx/esm src/orient/run-orient.ts --resume TASK_SLUG --task-slug TASK_SLUG --project-root .
  ```
  Replace `TASK_SLUG` with the actual task slug. The `--resume` flag tells orient to inspect existing artifacts and skip completed phases. Parse the JSON output to determine which phase to resume at, then continue the pipeline from that phase.

- **If Start fresh:** Tell the user to run `/codescope:orient` with their task description to begin a new pipeline. Stop.

- **If Cancel:** Display "Cancelled. Your handoff document is preserved for later use." and stop.

## Step 6: Clean Up Old Sessions

After resuming, run 7-day cleanup via the built session-cleanup module:

```bash
node -e "
import { cleanupOldSessions } from './dist/session/session-cleanup.mjs';
const r = cleanupOldSessions('.claude/codescope/sessions');
console.log(JSON.stringify(r));
"
```
