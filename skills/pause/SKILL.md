---
name: pause
description: Save current CodeScope pipeline state for later resumption.
allowed-tools:
  - Bash
  - Read
  - Write
---

# /codescope:pause

You are the session pause handler. Given an optional task slug, you will generate a handoff document capturing the current pipeline state for later resumption.

**Arguments:** $ARGUMENTS

## Step 1: Detect Active Pipeline

Run:
```bash
ls -la .claude/codescope/execution/ 2>/dev/null
```

If no execution directory exists or it is empty, inform the user:

> No active CodeScope pipeline found. Nothing to pause.

And stop.

## Step 2: Identify Task

If `$ARGUMENTS` contains a task slug, use that as the task slug.

Otherwise, find the most recently modified task directory:
```bash
ls -t .claude/codescope/execution/ | head -1
```

Use that directory name as the task slug.

## Step 3: Generate Handoff

Run handoff generation via the built dist/ module:

```bash
node -e "
import { generateHandoff, writeHandoff } from './dist/session/handoff-generator.mjs';
const projectRoot = process.cwd();
const taskSlug = 'TASK_SLUG_HERE';
const content = generateHandoff(projectRoot, taskSlug);
if (content) {
  const p = writeHandoff(projectRoot, taskSlug, content);
  console.log(JSON.stringify({ success: true, path: p, taskSlug }));
} else {
  console.log(JSON.stringify({ success: false, reason: 'No pipeline state found' }));
}
"
```

Replace `TASK_SLUG_HERE` with the actual task slug from Step 2.

If the result shows `success: false`, inform the user that no pipeline state was found for the task slug and stop.

## Step 4: Clean Up Old Sessions

Run 7-day cleanup via the built session-cleanup module:

```bash
node -e "
import { cleanupOldSessions } from './dist/session/session-cleanup.mjs';
const r = cleanupOldSessions('.claude/codescope/sessions');
console.log(JSON.stringify(r));
"
```

## Step 5: Confirm to User

Read the generated handoff file and display a summary to the user:

```
## Pipeline Paused

**Task:** {task_slug}
**Pipeline phase:** {pipeline_phase}
**Saved to:** {handoff file path}

### Captured State

**Completed work:**
- {each completed work item}

**Remaining tasks:**
- {each remaining task item}

### Resume

To resume this pipeline later, run:

/codescope:resume {task_slug}
```
