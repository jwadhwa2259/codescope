---
name: review-learnings
description: Review accumulated project learnings and confirm, reject, or edit them.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# /codescope:review-learnings

You are the learning review assistant. Present accumulated project learnings for the user to curate.

## Step 1: Load and Decay Learnings

1. Read learnings.md and run decay to identify expired entries:
   ```bash
   node --import tsx/esm -e "
     import { loadLearnings } from './src/learning/manager.js';
     import { runDecay } from './src/learning/decay.js';
     import { loadConfig } from './src/config/loader.js';
     const config = loadConfig(process.cwd());
     if (!config) { console.log(JSON.stringify({ error: 'no-config' })); process.exit(0); }
     const parsed = loadLearnings(process.cwd());
     const decayed = runDecay(parsed.entries, config.learning.confidence_decay, new Date());
     console.log(JSON.stringify({ entries: decayed, total: decayed.length }));
   "
   ```
2. Parse the JSON output.
3. If output contains `"error": "no-config"`: display "No config found. Run /codescope:onboard first." and stop.
4. If no entries (total === 0): display "No learnings recorded yet. Learnings accumulate from /codescope:orient pipeline runs." and stop.

## Step 2: Group and Present

Group entries by review priority. Skip VERIFIED and IGNORE entries (already curated).

**Group 1: CONTRADICTED entries** (need resolution first, per D-19)
**Group 2: UNVERIFIED entries** grouped by type (per D-14):
  - Gotchas first (most actionable)
  - Then decisions
  - Then patterns
**Group 3: TODO entries** (per D-19)
**Group 4: EXPIRED entries** (informational -- user can re-confirm or let them be evicted)

For each group, display a section header and list entries:

```
## Contradicted Learnings ({count})

### 1. {title}
- **Type:** {type}
- **Contradicts:** {contradicts}
- **Evidence:** {evidence}
- **Discovered:** {discovered}

Action? [confirm (keep as-is) / reject (remove) / edit]
```

```
## Unverified Learnings ({count})

### Gotchas

### {N}. {title}
- **Type:** gotcha
- **Evidence:** {evidence}
- **Discovered:** {discovered} | **Expires:** {expires}

Action? [confirm / reject / edit]
```

(Repeat for decisions, patterns)

```
## TODO Items ({count})

### {N}. {title}
- **File:** {file}
- **Severity:** {severity}
- **Evidence:** {evidence}

Action? [confirm (acknowledge) / reject (remove) / edit]
```

```
## Expired Learnings ({count})

### {N}. {title}
- **Type:** {type}
- **Expired:** {expires}

Action? [re-confirm (reset expiry) / remove]
```

Present all groups at once. Ask the user to review each entry in order. Number entries across all groups sequentially for easy reference (e.g., "Enter numbers to act on: 1 confirm, 3 reject, 5 edit").

## Step 3: Process User Decisions

For each entry where user took action:

**confirm:**
- Set status to VERIFIED
- If entry is a "pattern" type: offer convention promotion (per D-17):
  "This pattern has been verified. Promote to enforced convention? (yes/no)"
  If yes: append to `.claude/codescope/conventions-enforced.md` with the pattern title and evidence.
  Display: "Promoted '{title}' to enforced conventions."

**reject:**
- Remove the entry from entries array entirely (per D-16)
- Display: "Removed: {title}"

**edit (per D-15):**
- Ask: "Edit title (current: {title}):" -- user can change the title text
- Ask: "Change type? Current: {type}. Options: gotcha / decision / pattern / keep"
- Ask: "Add a note? (optional, press enter to skip):"
- Apply changes to the entry
- Evidence field is NOT editable (pipeline-sourced, preserves audit trail)
- Set status to VERIFIED after editing
- Display: "Updated and verified: {title}"

**re-confirm (for EXPIRED entries):**
- Reset status to VERIFIED
- Recalculate expires date from today using decay config:
  ```bash
  node --import tsx/esm -e "
    import { computeExpiry } from './src/learning/decay.js';
    import { loadConfig } from './src/config/loader.js';
    const config = loadConfig(process.cwd());
    const expiry = computeExpiry('{type}', new Date(), config.learning.confidence_decay);
    console.log(JSON.stringify({ expires: expiry }));
  "
  ```
- Display: "Re-confirmed: {title} (new expiry: {expires})"

**Convention promotion for CONTRADICTED entries that user confirms:**
- If the user confirms a CONTRADICTED entry, set status to VERIFIED and clear the contradicts field.
- This means the user has decided the learning is correct despite the detected contradiction.
- Display: "Confirmed and resolved contradiction: {title}"

**Cross-project gotcha promotion (per D-23):**
After confirming a learning, offer: "Mark as cross-project gotcha? (applies to all projects) (yes/no)"
If yes: add to global memory's Cross-Project Gotchas section via addGlobalEnrichment:
```bash
node --import tsx/esm -e "
  import { addGlobalEnrichment } from './src/onboard/global-memory.js';
  addGlobalEnrichment([{
    type: 'cross_project_gotcha',
    value: '{title}: {evidence}',
    source: '{projectName}',
    recordedDate: new Date().toISOString().split('T')[0]
  }]);
  console.log(JSON.stringify({ promoted: true }));
"
```
Display: "Added '{title}' to cross-project gotchas in global memory."

## Step 4: Save and Summarize

1. Save updated learnings using saveLearnings. Build the updated entries array with all confirmations, rejections, and edits applied, then write back to disk:
   ```bash
   node --import tsx/esm -e "
     import { loadLearnings, saveLearnings } from './src/learning/manager.js';
     const parsed = loadLearnings(process.cwd());
     // Apply the modifications to parsed.entries:
     // - Remove rejected entries
     // - Update confirmed entries to VERIFIED
     // - Apply edited fields
     // Then save:
     saveLearnings(process.cwd(), parsed);
     console.log(JSON.stringify({ saved: true, total: parsed.entries.length }));
   "
   ```

   Alternatively, use the Write tool to directly update learnings.md with the serialized content from serializeLearnings, since you have access to the Write tool and can construct the final markdown output.

2. Display summary:
   ```
   ## Review Complete

   - Confirmed: {N}
   - Rejected: {N}
   - Edited: {N}
   - Promoted to conventions: {N}
   - Cross-project gotchas added: {N}
   - Remaining unreviewed: {N}
   - Total active learnings: {N}/50
   ```

## Error Handling

- If learnings.md does not exist: "No learnings file found. Run /codescope:orient to generate learnings."
- If config.yml missing: "No config found. Run /codescope:onboard first."
- If loadLearnings returns empty entries: "No learnings recorded yet. Learnings accumulate from /codescope:orient pipeline runs."
- If saveLearnings fails: "Failed to save learnings: {error}. Your review decisions were not persisted. Try again."

## Notes

- Learnings are capped at 50 active entries (per D-05). Reviewing and rejecting obsolete entries frees capacity.
- VERIFIED entries persist indefinitely (no decay). Confirming a learning removes its expiry countdown.
- Pattern-type learnings can be promoted to conventions-enforced.md. This is the only path to enforced conventions in v1 (never auto-promote per PROJECT.md constraints).
- The review flow uses loadLearnings and saveLearnings from src/learning/manager.ts for all persistence.
- Decay is applied at review time (per D-11) via runDecay from src/learning/decay.ts to show accurate status.
- Cross-project gotcha promotion writes to ~/.codescope/global-memory.md via addGlobalEnrichment from src/onboard/global-memory.ts.
