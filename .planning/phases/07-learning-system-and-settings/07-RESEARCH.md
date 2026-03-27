# Phase 7: Learning System and Settings - Research

**Researched:** 2026-03-27
**Domain:** Learning capture, confidence decay, contradiction detection, global memory enrichment, interactive skill UX
**Confidence:** HIGH

## Summary

Phase 7 closes the feedback loop in the CodeScope pipeline. After the orient-to-debug pipeline completes (Phase 6), a learning synthesizer sub-agent reads all pipeline artifacts and extracts structured learnings into learnings.md. The core technical challenges are: (1) extending the existing learning-synthesizer.ts stub with real LLM-driven extraction logic, (2) building a decay/contradiction/cap engine that manages learning lifecycle, (3) extending global-memory.ts with new sections for tech stack tendencies, ignore patterns, and cross-project gotchas, (4) writing two full skill bodies (review-learnings, settings) with interactive AskUserQuestion menus, and (5) integrating learning capture as Step 7 in the orient skill body.

The codebase already has extensive infrastructure to build on: the learning synthesizer agent shell follows the Phase 2 Options+Result+async function pattern, ignore-filter.ts already writes IGNORE and TODO entries to learnings.md, config schema.ts has the full learning config section with Zod validation, defaults.ts has all learning defaults (max 50, gotchas 90 days, decisions 180 days, auto_capture true), and the config writer can serialize back to YAML. The two skill stubs (settings, review-learnings) are registered in plugin.json and just need their SKILL.md bodies replaced. The orient SKILL.md already has Steps 1-7 (with Step 7 being Summary) -- Phase 7 adds a new Step 7 (Learning Capture) and renumbers Summary to Step 8.

**Primary recommendation:** Build the learning lifecycle engine (decay, contradiction, cap) as a new `src/learning/` module with pure functions, then wire it into the learning synthesizer agent and the two skill bodies. Follow the established module patterns exactly: CLI entry point with stderr dispatch protocol, Options+Result+async function for the agent, extracted handler functions for testability.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: LLM sub-agent (using agents.learning_synthesizer.model from config) reads pipeline artifacts: coordination log, eval findings, debug cycles, verify report, scope contract. Extracts structured learnings. Smarter than rule-based -- can identify non-obvious gotchas and cross-cutting patterns.
- D-02: Runs as Step 7 in orient skill body, after eval+debug loop completes. Reads all artifacts from the completed run. Runs regardless of whether debug was needed.
- D-03: Extracts all three learning types: gotchas (unexpected issues hit during execution/debug), decisions (design choices made or escalated), and patterns (what approaches worked well). Max 3-5 new learnings per pipeline run to keep signal high.
- D-04: All new learnings start as UNVERIFIED per LRNG-02. Never auto-promote to enforced conventions per LRNG-06.
- D-05: Learning synthesizer output extends the existing learnings.md schema (from Phase 2 learning-synthesizer.ts): each entry has title, status (UNVERIFIED), type (gotcha/decision/pattern), discovered date, expires date (based on decay), and evidence (file:line or description from pipeline artifacts).
- D-06: Code-first validation before adding a learning. Check if the new learning contradicts actual code (e.g., learning says "use async/await" but codebase predominantly uses .then()). Also check against existing learnings for direct conflicts.
- D-07: Contradictions flagged with CONTRADICTED status and evidence of the conflict. Not silently added or silently dropped. User sees them during /codescope:review-learnings.
- D-08: Contradiction check uses existing convention detection infrastructure (ast-grep patterns) for code validation where applicable, and LLM comparison for semantic conflicts between learnings.
- D-09: Gotchas expire after 90 days, decisions after 180 days per LRNG-03. Expiry calculated from discovered date.
- D-10: Expired learnings marked with EXPIRED status but not immediately removed. They become eviction candidates when the 50-learning cap is hit.
- D-11: Decay check runs at learning capture time (before adding new learnings) and at review time. Not a background process.
- D-12: When at 50 active learnings and a new one arrives, remove the oldest expired/lowest-confidence learning to make room. Confidence decay naturally thins the list over time. If nothing is expired, skip adding the new learning and note it in the pipeline summary.
- D-13: IGNORE and TODO entries from eval gate (already in learnings.md via ignore-filter.ts) count toward the 50-learning cap. They follow the same lifecycle.
- D-14: Batch review UX: present all UNVERIFIED learnings in one session, grouped by type (gotchas first, then decisions, then patterns). User confirms, rejects, or edits each learning via AskUserQuestion menus.
- D-15: Edit allows changing description and type. Evidence is pipeline-sourced and not user-editable (preserves audit trail). User can add a note/annotation.
- D-16: Confirmed learnings get VERIFIED status. Rejected learnings are removed from learnings.md.
- D-17: Convention promotion integrated into review flow: when reviewing a "pattern" type learning with high confidence (referenced in multiple pipeline runs or high adoption), offer "Promote to enforced convention?" This is the Phase 3 D-12 mechanism -- confirmed patterns move to conventions-enforced.md.
- D-18: Nudge after 10+ unreviewed learnings accumulate. Info message at orient start: "10 unreviewed learnings. Run /codescope:review-learnings to curate." Not blocking.
- D-19: Also surfaces CONTRADICTED and TODO entries during review for user resolution.
- D-20: Extend ~/.codescope/global-memory.md beyond current preferences (orient_verbosity, clarification, eval_mode, convention_strictness) to include: tech stack tendencies (languages/frameworks used frequently across projects), ignore patterns (from eval gate), and cross-project gotchas (learnings marked as broadly applicable).
- D-21: Auto-update from eval gate behavior (LRNG-08): capture ignore patterns and consistently-applied triage choices. When a user ignores the same type of finding across 3+ pipeline runs, record as a global preference.
- D-22: Extend existing structured markdown format in global-memory.ts with new sections (## Tech Stack Tendencies, ## Ignore Patterns, ## Cross-Project Gotchas). Backward-compatible -- existing preferences section unchanged.
- D-23: Cross-project gotchas manually promoted during /codescope:review-learnings: user can mark a verified learning as "applies to all projects" and it copies to global memory.
- D-24: Interactive menus (AskUserQuestion) for all config.yml sections: agents, orient, execute, verify, eval, conventions, learning, bootstrap, display. User picks section, then field, then new value.
- D-25: Convention rollback: lists all entries in conventions-enforced.md, user selects which to remove. Per Phase 3 D-16.
- D-26: Agent teams re-detection: probe for CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var, offer enable/disable. Per Phase 4 D-45.
- D-27: Reset commands: --reset resets config.yml to defaults (preserving project section), --reset-global wipes global memory to empty template. bootstrap --force already exists from Phase 3.
- D-28: Also supports --set key=value for direct CLI-style changes without interactive menus (e.g., /codescope:settings --set eval.mode=auto-debug).
- D-29: After any change, validates config.yml against Zod schema (existing infrastructure) and shows confirmation of what changed.
- D-30: Orient skill body gains Step 7: Learning Capture. After Step 6 (eval+debug) completes, dispatch learning synthesizer sub-agent. Runs with learning.auto_capture: true in config (default). Skipped when false.
- D-31: Learning synthesizer writes to learnings.md at .claude/codescope/learnings.md (existing location). Appends new entries to the ## Entries section.
- D-32: Pipeline summary (Step 8 -- final orient output) includes learning capture results: N new learnings added, any contradictions flagged, cap status.

### Claude's Discretion
No areas deferred to Claude's discretion -- all gray areas received explicit user decisions or recommended defaults.

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LRNG-01 | After task completion, project memory (learnings.md) updates with what worked, what didn't, and gotchas discovered | Learning synthesizer agent (D-01, D-02, D-03) + learning manager module for parsing/writing learnings.md |
| LRNG-02 | New learnings start as UNVERIFIED and must be confirmed via /codescope:review-learnings | D-04, D-14, D-16 -- status field on learning entries, review-learnings skill body |
| LRNG-03 | Confidence decay: gotchas expire after 90 days, decisions after 180 days | D-09, D-10, D-11 -- decay engine with date arithmetic, runs at capture and review time |
| LRNG-04 | Contradiction detection: new learning that contradicts existing learning or actual code is flagged | D-06, D-07, D-08 -- code-first validation via ast-grep + LLM semantic comparison |
| LRNG-05 | Max 50 active learnings (~4,000 tokens when fully loaded) | D-12, D-13 -- cap enforcer counts all entry types, evicts oldest expired first |
| LRNG-06 | Learnings NEVER auto-promote to enforced conventions | D-04, D-17 -- only during explicit /codescope:review-learnings with user confirmation |
| LRNG-07 | Global memory captures user preferences, tech stack tendencies, ignore patterns, cross-project patterns | D-20, D-22, D-23 -- extend global-memory.ts with new sections |
| LRNG-08 | Global memory updated automatically from observed behavior at eval gate | D-21 -- 3-strike rule for ignore patterns becoming global preferences |
| MGMT-01 | /codescope:settings skill allows interactive or direct configuration changes with immediate feedback | D-24, D-25, D-26, D-27, D-28, D-29 -- settings skill body with AskUserQuestion menus |
| MGMT-02 | /codescope:review-learnings skill presents learnings for user to confirm, reject, or edit | D-14, D-15, D-16, D-17, D-18, D-19 -- review-learnings skill body |
| MGMT-03 | Reset commands available: --reset (config), --reset-global (global memory), bootstrap --force (re-analyze) | D-27 -- settings skill handles --reset and --reset-global; bootstrap --force already exists from Phase 3 |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack**: TypeScript, vitest for testing, zod for schema validation, better-sqlite3, web-tree-sitter WASM (0.25.10 pinned)
- **Performance**: Plugin startup <5K tokens, orchestrator <15K tokens
- **Quality**: Convention false positive rate <5%, eval finding accuracy >70%, debug resolution >80%
- **Learning bounds**: Max 50 active learnings (~4K tokens), gotcha decay 90 days, decision decay 180 days, never auto-promote to enforced conventions
- **Rate limits**: Max 3 concurrent agents (configurable), sequential spawning default on Pro plans
- **Module pattern**: ESM-first with type:module and NodeNext module resolution
- **Agent pattern**: Options interface + Result interface + async function + markdown artifact output
- **MCP transport**: StdioServerTransport, CLI entry points use stderr dispatch protocol
- **Skill bodies**: Detailed natural language prompts following Claude Code skill conventions
- **Testing**: vitest with tests/ directory mirroring src/ structure, 30s test timeout
- **GSD Workflow**: All work through GSD commands, no direct repo edits outside workflow

## Standard Stack

### Core (Already Installed -- No New Dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| zod | ^3.25.0 (zod/v4 import) | Config schema validation | Already in use for ConfigSchema -- settings skill reuses loadConfig/writeConfig with Zod validation |
| js-yaml | ^4.1.1 | YAML parse/dump | Already in use for config.yml reading/writing |
| vitest | ^4.1.0 | Test framework | All 68 existing test files use vitest; 735 tests passing |
| tsx | ^4.21.0 | TypeScript runner | CLI entry points use `node --import tsx/esm` pattern |

### No New Dependencies Required

Phase 7 requires no new npm packages. All functionality builds on existing infrastructure:
- Date arithmetic uses native JavaScript `Date` and simple day calculations
- Markdown parsing uses string manipulation (established pattern in ignore-filter.ts, global-memory.ts, recall.ts)
- Config validation uses existing zod/ConfigSchema
- File I/O uses native `node:fs` (synchronous, matching project patterns)
- LLM dispatch uses stderr dispatch protocol (established in run-eval.ts, run-debug.ts, run-verify.ts)

## Architecture Patterns

### Recommended Project Structure

```
src/
├── learning/                        # NEW: Learning lifecycle engine
│   ├── types.ts                     # LearningEntry, LearningType, LearningStatus types
│   ├── parser.ts                    # Parse/serialize learnings.md entries
│   ├── decay.ts                     # Confidence decay engine (date arithmetic)
│   ├── contradiction.ts             # Code-first + semantic contradiction detection
│   ├── cap.ts                       # 50-learning cap enforcement with eviction
│   ├── manager.ts                   # High-level learning manager (orchestrates parser+decay+cap)
│   └── global-enrichment.ts         # 3-strike auto-enrichment logic for global memory
├── agents/
│   └── learning-synthesizer.ts      # MODIFIED: Real LLM extraction replacing empty init
├── onboard/
│   └── global-memory.ts             # MODIFIED: Extended with new sections
├── config/
│   ├── schema.ts                    # EXISTING: Already has full learning config
│   ├── loader.ts                    # EXISTING: loadConfig with Zod validation
│   └── writer.ts                    # EXISTING: writeConfig to YAML
skills/
├── settings/
│   └── SKILL.md                     # REPLACED: Full interactive settings skill body
├── review-learnings/
│   └── SKILL.md                     # REPLACED: Full batch review skill body
└── orient/
    └── SKILL.md                     # MODIFIED: Add Step 7 (Learning Capture), renumber Summary to Step 8
```

### Pattern 1: Learning Entry Schema (Markdown)

**What:** Each learning entry in learnings.md follows a structured markdown format with parseable metadata fields.
**When to use:** Every time a learning is created, updated, or read.
**Example:**

```typescript
// Matches existing schema in learning-synthesizer.ts lines 70-79
// and IGNORE/TODO entries in ignore-filter.ts lines 113-125 / 155-170

export type LearningStatus = "UNVERIFIED" | "VERIFIED" | "CONTRADICTED" | "EXPIRED" | "IGNORE" | "TODO";
export type LearningType = "gotcha" | "decision" | "pattern" | "ignore" | "todo";

export interface LearningEntry {
  title: string;
  status: LearningStatus;
  type: LearningType;
  discovered: string;   // ISO date
  expires: string;       // ISO date (computed from type + decay config)
  evidence: string;      // file:line or description from pipeline
  note?: string;         // user annotation (added during review)
  // For IGNORE entries (from ignore-filter.ts)
  pattern?: string;
  scope?: string;
  criterion?: string;
  // For TODO entries
  file?: string;
  severity?: string;
  // For CONTRADICTED entries
  contradicts?: string;  // what it contradicts (learning title or code pattern)
}
```

### Pattern 2: CLI Entry Point with Stderr Dispatch Protocol

**What:** The learning synthesizer uses the same CLI pattern as run-eval.ts and run-debug.ts.
**When to use:** For the new learning capture step in the pipeline.
**Example:**

```typescript
// src/learning/run-learning-capture.ts
// Follows exact pattern from src/eval/run-eval.ts (lines 1-157)
// and src/debug/run-debug.ts

import { loadConfig } from "../config/loader.js";

// Stderr dispatch for LLM sub-agent
const callbacks = {
  dispatchSynthesizer: async (prompt: string) => {
    // Skill body reads this and dispatches Agent tool
    console.error(JSON.stringify({ type: "dispatch_learning", prompt }));
    return "[]"; // Stub -- skill body dispatches actual LLM agent
  },
  onProgress: (msg: string) => console.error(msg),
};

// Stdout: JSON result
console.log(JSON.stringify({ status: "complete", result }));
```

### Pattern 3: Markdown Section Parsing

**What:** Parse structured markdown sections using regex, matching patterns already used in ignore-filter.ts and recall.ts.
**When to use:** Reading learnings.md entries, parsing global-memory.md sections.
**Example:**

```typescript
// Pattern from src/eval/ignore-filter.ts lines 38-48
// and src/tools/recall.ts (markdown section parsing splits by H2 headings)

function parseEntriesSection(content: string): LearningEntry[] {
  // Split entries by ### headings (each learning is an H3)
  const entriesSection = content.match(
    /## Entries\s*\n([\s\S]*?)(?=\n## |\n# |$)/,
  );
  if (!entriesSection) return [];

  const entries: LearningEntry[] = [];
  const entryBlocks = entriesSection[1].split(/\n(?=### )/);

  for (const block of entryBlocks) {
    const titleMatch = block.match(/^### (.+)/);
    if (!titleMatch) continue;

    const entry: LearningEntry = {
      title: titleMatch[1],
      status: extractField(block, "Status") as LearningStatus,
      type: extractField(block, "Type") as LearningType,
      discovered: extractField(block, "Discovered"),
      expires: extractField(block, "Expires"),
      evidence: extractField(block, "Evidence"),
    };

    const note = extractField(block, "Note");
    if (note) entry.note = note;

    entries.push(entry);
  }

  return entries;
}

function extractField(block: string, field: string): string {
  const match = block.match(new RegExp(`\\*\\*${field}:\\*\\*\\s*(.+)`));
  return match ? match[1].trim() : "";
}
```

### Pattern 4: Pure Function Testing (Established Project Pattern)

**What:** Core logic as pure functions with DI parameters for testability, matching patterns throughout the codebase.
**When to use:** Every new function in src/learning/.
**Example:**

```typescript
// Pattern from src/onboard/global-memory.ts (customPath DI)
// and src/execution/teams-detector.ts (homeDir DI)

export function computeExpiry(
  type: LearningType,
  discoveredDate: Date,
  decayConfig: { gotchas: number; decisions: number },
): Date {
  const daysToExpire = type === "gotcha" ? decayConfig.gotchas : decayConfig.decisions;
  const expiry = new Date(discoveredDate);
  expiry.setDate(expiry.getDate() + daysToExpire);
  return expiry;
}

export function isExpired(entry: LearningEntry, now: Date = new Date()): boolean {
  if (!entry.expires) return false;
  return new Date(entry.expires) <= now;
}
```

### Pattern 5: Skill Body as Detailed Natural Language Prompt

**What:** Skill bodies are detailed step-by-step instructions in markdown, not TypeScript code. They use AskUserQuestion patterns for interactive flows.
**When to use:** skills/settings/SKILL.md and skills/review-learnings/SKILL.md.
**Example structure:**

```markdown
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

You are the learning review assistant. Present accumulated learnings for user review.

## Step 1: Load Learnings

1. Run: `node --import tsx/esm src/learning/run-learning-capture.ts --project-root "$(pwd)" --phase load-learnings`
2. Parse the JSON output...

## Step 2: Present for Review
...
```

### Anti-Patterns to Avoid

- **Parsing YAML frontmatter as learning entries:** The frontmatter (lines 1-6 in learnings.md) contains metadata, not entries. Parse entries only from `## Entries` section forward.
- **Mutating learnings.md without re-reading:** Always read-parse-modify-write the full file. Never blindly append if the cap or decay logic needs to run first.
- **Storing entry counts in frontmatter only:** The `total_learnings` frontmatter field is a convenience counter. The source of truth is the count of parsed entries from `## Entries`. Update frontmatter when writing but do not trust it alone.
- **Auto-promoting learnings to conventions:** D-04 and LRNG-06 explicitly prohibit this. Convention promotion only happens during explicit /codescope:review-learnings with user confirmation.
- **Background decay processes:** D-11 specifies decay checks run at capture time and review time only. No timers, no cron, no background process.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Config validation | Custom validation logic | Existing `ConfigSchema.safeParse()` from src/config/schema.ts | Zod schema already validates every field; settings skill just calls loadConfig/writeConfig |
| YAML serialization | String concatenation for YAML | Existing `js-yaml.dump()` via writeConfig() from src/config/writer.ts | js-yaml handles edge cases (special characters, multiline values, type coercion) |
| Ignore pattern management | New ignore system | Existing `appendIgnoreEntry`/`loadIgnorePatterns` from src/eval/ignore-filter.ts | Already writes IGNORE entries to learnings.md in the correct format |
| TODO entry management | New TODO system | Existing `appendTodoEntry` from src/eval/ignore-filter.ts | Already writes TODO entries to learnings.md in the correct format |
| Agent teams detection | New detection logic | Existing `detectAgentTeams` from src/execution/teams-detector.ts | Settings skill reuses for D-26 agent teams re-detection |
| Pipeline artifact paths | Hardcoded path construction | Existing `getCodescopePath`/`getConfigPath` from src/utils/paths.ts | Centralized path computation already handles all .claude/codescope/ subdirectories |
| Bootstrap --force | New reset command | Existing bootstrap --force from Phase 3 (src/bootstrap/orchestrator.ts) | D-27 says "bootstrap --force already exists from Phase 3" |

**Key insight:** Phase 7 is primarily a wiring phase -- connecting existing infrastructure (config schema, ignore filter, global memory, convention enforcement) with new LLM-driven extraction logic and interactive skill UX. The risk is in reimplementing things that already exist, not in missing libraries.

## Common Pitfalls

### Pitfall 1: Learnings.md Format Fragility

**What goes wrong:** The learnings.md file is written by multiple producers (learning-synthesizer.ts, ignore-filter.ts, the new learning capture pipeline). If parsing assumptions differ between producers, entries get corrupted or lost.
**Why it happens:** Three independent code paths append to the same file: (1) initial creation by learning-synthesizer.ts, (2) IGNORE/TODO append by ignore-filter.ts, (3) new learning append by the Phase 7 learning capture.
**How to avoid:** Centralize all learnings.md read/write through a single `LearningManager` class or module in `src/learning/manager.ts`. Have ignore-filter.ts and the learning synthesizer both go through this manager. The manager is the single source of truth for parsing, validating, and serializing entries.
**Warning signs:** Tests pass individually but fail when run in sequence; entries appearing in wrong sections; frontmatter counts not matching actual entry counts.

### Pitfall 2: Counting IGNORE and TODO Entries Toward Cap

**What goes wrong:** D-13 states IGNORE and TODO entries count toward the 50-learning cap. If the cap enforcer only counts entries with type gotcha/decision/pattern, it silently allows the file to exceed 50 entries.
**Why it happens:** Forgetting that ignore-filter.ts already appends IGNORE and TODO entries directly to learnings.md.
**How to avoid:** The parser must count ALL H3 entries in `## Entries`, regardless of status. The cap check function must be: `totalEntries = gotchas + decisions + patterns + ignores + todos`. Build a test that creates 48 regular learnings + 2 IGNORE entries + tries to add 1 more and verifies eviction.
**Warning signs:** learnings.md growing beyond 50 entries; token budget exceeded.

### Pitfall 3: Date Arithmetic Edge Cases in Decay

**What goes wrong:** Naive date arithmetic (e.g., adding 90 days by adding 90*24*60*60*1000 ms) fails at DST boundaries, leap years, or month-end transitions.
**Why it happens:** JavaScript Date math is error-prone without using `setDate(getDate() + days)` which handles month/year rollover correctly.
**How to avoid:** Use `Date.setDate(Date.getDate() + daysToExpire)` for expiry calculation. Always compare dates at day granularity (truncate to midnight). Store dates as ISO strings (YYYY-MM-DD) in learnings.md, not timestamps.
**Warning signs:** Expired entries not being detected; entries expiring one day early/late.

### Pitfall 4: Orient Skill Body Step Numbering Collision

**What goes wrong:** The current orient SKILL.md has Steps 1-7 (Step 7 = Summary). Phase 7 adds a new Step 7 (Learning Capture) and must renumber Summary to Step 8. If the renumbering is incomplete, references to "Step 7" in other parts of the skill body become ambiguous.
**Why it happens:** Phase 6 already renumbered Step 6 (Summary) to Step 7 (see STATE.md decision: "Existing Step 6 (Summary) renumbered to Step 7 in orient skill body"). Phase 7 adds Step 7 (Learning Capture) before the current Step 7 (Summary), pushing Summary to Step 8.
**How to avoid:** Search the entire orient SKILL.md for references to "Step 7" before modifying. Update all forward-references. The new structure is: Step 6 (Evaluate, Gate, Debug) -> Step 7 (Learning Capture) -> Step 8 (Summary).
**Warning signs:** Summary step never executing; learning capture running after summary.

### Pitfall 5: Global Memory Backward Compatibility

**What goes wrong:** Extending global-memory.md with new sections (## Tech Stack Tendencies, ## Ignore Patterns, ## Cross-Project Gotchas) breaks the existing readGlobalMemory parser which only looks for `## Preferences` section key-value pairs.
**Why it happens:** The current parser (global-memory.ts lines 46-57) iterates all lines and matches specific prefixes. New sections with different formats would be silently ignored, which is fine. But if the writer rewrites the file and omits existing preferences, data is lost.
**How to avoid:** Extend readGlobalMemory to parse new sections. Extend writeGlobalMemory to preserve all sections. Use section-based parsing (split by `## ` headings) rather than line-by-line iteration. Ensure the writer always includes ALL sections present in the input plus any new sections.
**Warning signs:** Global memory losing preferences after enrichment update; new sections not appearing after write.

### Pitfall 6: Contradiction Detection False Positives

**What goes wrong:** The LLM semantic comparison for contradiction detection flags learnings that are merely related, not actually contradictory. For example: "prefer async/await" and "use Promise.all for parallel operations" are complementary, not contradictory.
**Why it happens:** LLMs tend to find connections between texts and may overreport conflicts.
**How to avoid:** Use a strict contradiction prompt: "Do these two learnings DIRECTLY contradict each other? A contradiction means adopting both is impossible. Being related or about the same topic is NOT a contradiction." Also, D-08 says to use code-first validation (ast-grep) where applicable -- reserve LLM comparison for cases where code validation is not feasible.
**Warning signs:** Many CONTRADICTED entries appearing that are not actual contradictions; users rejecting contradiction flags during review.

### Pitfall 7: Config Reset Preserving Project Section

**What goes wrong:** D-27 says --reset resets config.yml to defaults "preserving project section." If the reset writes DEFAULT_CONFIG directly, it loses the project-specific fields (name, type, languages, build_command, test_command, services).
**Why it happens:** DEFAULT_CONFIG has empty project fields (name: "", languages: []) by design (they are populated by onboard).
**How to avoid:** The reset function must: (1) load current config, (2) extract project section, (3) merge DEFAULT_CONFIG with preserved project section, (4) validate merged config with Zod, (5) write. Build a test that resets and verifies project fields survive.
**Warning signs:** After reset, onboard needs to re-run; project name/type lost.

## Code Examples

### Learning Entry Serialization

```typescript
// Source: Derived from existing schema in learning-synthesizer.ts lines 70-79
// and IGNORE entry format in ignore-filter.ts lines 113-125

function serializeLearningEntry(entry: LearningEntry): string {
  const lines: string[] = [];

  lines.push("");
  lines.push(`### ${entry.title}`);
  lines.push("");
  lines.push(`- **Status:** ${entry.status}`);
  lines.push(`- **Type:** ${entry.type}`);
  lines.push(`- **Discovered:** ${entry.discovered}`);
  lines.push(`- **Expires:** ${entry.expires}`);
  lines.push(`- **Evidence:** ${entry.evidence}`);

  if (entry.note) {
    lines.push(`- **Note:** ${entry.note}`);
  }
  if (entry.contradicts) {
    lines.push(`- **Contradicts:** ${entry.contradicts}`);
  }
  // IGNORE-specific fields
  if (entry.pattern) {
    lines.push(`- **Pattern:** \`${entry.pattern}\``);
  }
  if (entry.scope) {
    lines.push(`- **Scope:** \`${entry.scope}\``);
  }
  if (entry.criterion) {
    lines.push(`- **Criterion:** \`${entry.criterion}\``);
  }
  // TODO-specific fields
  if (entry.file) {
    lines.push(`- **File:** \`${entry.file}\``);
  }
  if (entry.severity) {
    lines.push(`- **Severity:** ${entry.severity}`);
  }

  lines.push("");

  return lines.join("\n");
}
```

### Decay Engine

```typescript
// Source: D-09, D-10, D-11 from CONTEXT.md
// Uses existing decay config from src/config/defaults.ts lines 69-79

export function runDecay(
  entries: LearningEntry[],
  decayConfig: { gotchas: number; decisions: number },
  now: Date = new Date(),
): LearningEntry[] {
  return entries.map((entry) => {
    // Only process entries that can expire (not IGNORE, TODO, VERIFIED)
    if (entry.status === "IGNORE" || entry.status === "TODO") {
      return entry;
    }

    // Check if entry has expired
    if (entry.expires && new Date(entry.expires) <= now) {
      if (entry.status !== "EXPIRED") {
        return { ...entry, status: "EXPIRED" as LearningStatus };
      }
    }

    return entry;
  });
}
```

### Cap Enforcement with Eviction

```typescript
// Source: D-12, D-13 from CONTEXT.md

export interface CapResult {
  entries: LearningEntry[];
  evicted: LearningEntry[];
  skipped: LearningEntry[]; // New entries that could not be added
}

export function enforceCapWithEviction(
  entries: LearningEntry[],
  newEntries: LearningEntry[],
  maxActive: number,
): CapResult {
  const evicted: LearningEntry[] = [];
  const skipped: LearningEntry[] = [];
  const current = [...entries];

  for (const newEntry of newEntries) {
    if (current.length < maxActive) {
      current.push(newEntry);
      continue;
    }

    // Find oldest expired entry to evict
    const expiredIdx = current.findIndex((e) => e.status === "EXPIRED");
    if (expiredIdx !== -1) {
      evicted.push(current[expiredIdx]);
      current.splice(expiredIdx, 1);
      current.push(newEntry);
    } else {
      // No expired entries -- skip the new learning
      skipped.push(newEntry);
    }
  }

  return { entries: current, evicted, skipped };
}
```

### Extended Global Memory Format

```typescript
// Source: D-20, D-22 from CONTEXT.md
// Extends existing format in src/onboard/global-memory.ts lines 74-91

export interface ExtendedGlobalPreferences extends GlobalPreferences {
  techStackTendencies?: Array<{ name: string; count: number }>;
  ignorePatterns?: Array<{ pattern: string; criterion: string; occurrences: number }>;
  crossProjectGotchas?: Array<{ title: string; evidence: string; addedFrom: string }>;
}

function writeExtendedGlobalMemory(
  preferences: ExtendedGlobalPreferences,
  customPath?: string,
): void {
  const memoryPath = customPath ?? getGlobalMemoryPath();

  const lines: string[] = [
    "# CodeScope Global Memory",
    "",
    "## Preferences",
    "",
  ];

  // Existing preferences (backward compat)
  if (preferences.orientVerbosity)
    lines.push(`- orient_verbosity: ${preferences.orientVerbosity}`);
  if (preferences.clarification)
    lines.push(`- clarification: ${preferences.clarification}`);
  if (preferences.evalMode)
    lines.push(`- eval_mode: ${preferences.evalMode}`);
  if (preferences.conventionStrictness)
    lines.push(`- convention_strictness: ${preferences.conventionStrictness}`);

  // New sections (D-22)
  if (preferences.techStackTendencies?.length) {
    lines.push("", "## Tech Stack Tendencies", "");
    for (const t of preferences.techStackTendencies) {
      lines.push(`- ${t.name}: ${t.count} projects`);
    }
  }

  if (preferences.ignorePatterns?.length) {
    lines.push("", "## Ignore Patterns", "");
    for (const p of preferences.ignorePatterns) {
      lines.push(`- ${p.criterion}: "${p.pattern}" (${p.occurrences} occurrences)`);
    }
  }

  if (preferences.crossProjectGotchas?.length) {
    lines.push("", "## Cross-Project Gotchas", "");
    for (const g of preferences.crossProjectGotchas) {
      lines.push(`- **${g.title}**: ${g.evidence} (from ${g.addedFrom})`);
    }
  }

  lines.push("", `*Last updated: ${new Date().toISOString().split("T")[0]}*`, "");

  fs.writeFileSync(memoryPath, lines.join("\n"), "utf-8");
}
```

### Settings --set Key=Value Parsing

```typescript
// Source: D-28 from CONTEXT.md

export function parseSetArg(setArg: string): { section: string; field: string; value: string } | null {
  // Format: section.field=value (e.g., eval.mode=auto-debug)
  const match = setArg.match(/^([a-z_]+)\.([a-z_]+)=(.+)$/);
  if (!match) return null;
  return { section: match[1], field: match[2], value: match[3] };
}

export function applySetToConfig(
  config: Config,
  section: string,
  field: string,
  value: string,
): Config {
  const updated = structuredClone(config);
  const sectionObj = updated[section as keyof Config];
  if (typeof sectionObj === "object" && sectionObj !== null) {
    // Type coercion for numbers and booleans
    let coerced: unknown = value;
    if (value === "true") coerced = true;
    else if (value === "false") coerced = false;
    else if (/^\d+$/.test(value)) coerced = Number(value);
    (sectionObj as Record<string, unknown>)[field] = coerced;
  }
  return updated;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Rule-based learning extraction | LLM-driven learning synthesis | Phase 7 (D-01) | LLM can identify non-obvious gotchas, cross-cutting patterns; more flexible than pattern matching |
| Manual convention management | Convention promotion through learning review | Phase 3 + Phase 7 (D-17) | Natural workflow: pattern -> verified -> promoted; no separate convention management UI needed |
| Static global preferences | Auto-enriched global memory | Phase 7 (D-21) | 3-strike rule for ignore patterns; global memory improves without explicit user action |

**Deprecated/outdated:**
- Phase 2's `runLearningSynthesizer()` that creates an empty learnings.md: replaced by real extraction logic in Phase 7
- The existing `generateLearningsMarkdown()` function: still used for initial creation but learning capture appends rather than regenerating

## Open Questions

1. **Contradiction detection scope for code-first validation**
   - What we know: D-08 says to use "existing convention detection infrastructure (ast-grep patterns) for code validation where applicable." This means checking if a new learning about coding patterns contradicts what ast-grep detects in the actual codebase.
   - What's unclear: How to determine which learnings are amenable to code-first validation versus which require LLM semantic comparison. Not all learnings (e.g., "avoid deploying on Fridays") can be validated against code.
   - Recommendation: Classify by type -- `pattern` type learnings attempt code-first validation (search for the pattern claim in codebase). `gotcha` and `decision` types default to LLM semantic comparison against existing learnings only. This avoids attempting code validation for non-code learnings. Confidence: MEDIUM -- reasonable heuristic but may need refinement.

2. **IGNORE and TODO entry expiry behavior**
   - What we know: D-13 says IGNORE and TODO entries count toward the cap and follow the same lifecycle. D-09 defines decay only for gotchas (90 days) and decisions (180 days).
   - What's unclear: What is the expiry period for IGNORE and TODO entries? They are neither gotchas nor decisions.
   - Recommendation: IGNORE entries should not expire (they represent permanent user preferences). TODO entries should expire at 180 days (same as decisions -- they represent deferred work that becomes irrelevant over time). The decay engine should handle this with a type-to-decay mapping that returns Infinity for IGNORE. Confidence: MEDIUM -- reasonable defaults but the CONTEXT.md does not explicitly address this.

3. **Learning synthesizer prompt construction**
   - What we know: D-01 says the LLM reads pipeline artifacts (coordination log, eval findings, debug cycles, verify report, scope contract). D-03 says max 3-5 new learnings per run.
   - What's unclear: The exact prompt format for the LLM synthesizer -- how much artifact content to include, how to constrain output format.
   - Recommendation: Follow the established prompt construction pattern from orient/planner.ts -- build sections by reference (file paths) not by inclusion, with a structured output format (JSON array of learning entries). Cap prompt content at reasonable size to avoid context overflow. Confidence: HIGH -- this matches established patterns in the codebase.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | vitest.config.ts (root) |
| Quick run command | `npx vitest run tests/learning/ tests/agents/learning-synthesizer.test.ts --reporter=dot` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LRNG-01 | Learning synthesizer extracts learnings from pipeline artifacts | unit | `npx vitest run tests/agents/learning-synthesizer.test.ts -x` | Exists (needs expansion) |
| LRNG-02 | New learnings start as UNVERIFIED | unit | `npx vitest run tests/learning/parser.test.ts -x` | Wave 0 |
| LRNG-03 | Confidence decay: gotchas 90 days, decisions 180 days | unit | `npx vitest run tests/learning/decay.test.ts -x` | Wave 0 |
| LRNG-04 | Contradiction detection flags conflicts | unit | `npx vitest run tests/learning/contradiction.test.ts -x` | Wave 0 |
| LRNG-05 | Max 50 active learnings with eviction | unit | `npx vitest run tests/learning/cap.test.ts -x` | Wave 0 |
| LRNG-06 | Learnings never auto-promote | unit | `npx vitest run tests/learning/manager.test.ts -x` | Wave 0 |
| LRNG-07 | Global memory captures new section types | unit | `npx vitest run tests/onboard/global-memory.test.ts -x` | Exists (needs expansion) |
| LRNG-08 | Global memory auto-updated from eval gate behavior | unit | `npx vitest run tests/learning/global-enrichment.test.ts -x` | Wave 0 |
| MGMT-01 | Settings skill handles interactive and --set modes | unit | `npx vitest run tests/config/settings.test.ts -x` | Wave 0 |
| MGMT-02 | Review-learnings presents grouped learnings for review | unit | `npx vitest run tests/learning/manager.test.ts -x` | Wave 0 |
| MGMT-03 | Reset commands preserve project section | unit | `npx vitest run tests/config/settings.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/learning/ tests/agents/learning-synthesizer.test.ts tests/onboard/global-memory.test.ts tests/config/ --reporter=dot`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/learning/parser.test.ts` -- covers LRNG-02 (entry parsing/serialization)
- [ ] `tests/learning/decay.test.ts` -- covers LRNG-03 (expiry calculation, decay engine)
- [ ] `tests/learning/contradiction.test.ts` -- covers LRNG-04 (code-first + semantic conflict detection)
- [ ] `tests/learning/cap.test.ts` -- covers LRNG-05 (50-entry cap with eviction)
- [ ] `tests/learning/manager.test.ts` -- covers LRNG-06, MGMT-02 (high-level manager, no auto-promotion)
- [ ] `tests/learning/global-enrichment.test.ts` -- covers LRNG-08 (3-strike auto-enrichment)
- [ ] `tests/config/settings.test.ts` -- covers MGMT-01, MGMT-03 (reset, --set, validation)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v25.6.1 | -- |
| npm | Package management | Yes | 11.9.0 | -- |
| vitest | Testing | Yes | 4.1.0 | -- |
| tsx | TypeScript runner | Yes | (installed in devDeps) | -- |
| zod | Config validation | Yes | ^3.25.0 (installed) | -- |
| js-yaml | YAML parsing | Yes | ^4.1.1 (installed) | -- |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** None

All dependencies are already installed. Phase 7 requires no new packages.

## Sources

### Primary (HIGH confidence)
- Existing codebase: `src/agents/learning-synthesizer.ts` -- current empty scaffold, Options+Result pattern
- Existing codebase: `src/eval/ignore-filter.ts` -- IGNORE/TODO entry management in learnings.md
- Existing codebase: `src/onboard/global-memory.ts` -- current global memory read/write
- Existing codebase: `src/config/schema.ts` -- full learning config with Zod validation
- Existing codebase: `src/config/defaults.ts` -- default learning config values
- Existing codebase: `src/config/loader.ts` + `src/config/writer.ts` -- config I/O
- Existing codebase: `src/eval/run-eval.ts` -- CLI entry point with stderr dispatch protocol pattern
- Existing codebase: `src/debug/debug-agent.ts` -- agent module pattern with callbacks
- Existing codebase: `skills/orient/SKILL.md` -- current orient pipeline steps (Steps 1-7)
- CONTEXT.md: `07-CONTEXT.md` -- all 32 implementation decisions (D-01 through D-32)
- REQUIREMENTS.md: LRNG-01 through LRNG-08, MGMT-01 through MGMT-03

### Secondary (MEDIUM confidence)
- Existing test patterns: 68 test files (735 tests) -- established vitest patterns, tmpdir usage, DI patterns
- CODESCOPE-SPEC-V6.md lines 605-621 -- learning system specification

### Tertiary (LOW confidence)
- Open Question 2: IGNORE/TODO expiry behavior -- inferred from context, not explicitly specified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies; all existing libraries verified installed and working
- Architecture: HIGH -- all patterns derive from established codebase patterns (agent module, CLI entry, skill body)
- Pitfalls: HIGH -- derived from deep reading of existing code and understanding of interaction points between modules
- Learning lifecycle: MEDIUM -- decay/contradiction/cap logic is straightforward but IGNORE/TODO expiry behavior is inferred
- Skill bodies: MEDIUM -- skill body format is well-established but interactive menu flow complexity is non-trivial

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable -- no external dependency changes expected)
