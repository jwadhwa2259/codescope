# Phase 7: Learning System and Settings - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 07-learning-system-and-settings
**Areas discussed:** Learning capture, Review & curation, Global memory, Settings skill

---

## Learning Capture

### Extraction Mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| LLM sub-agent | Learning synthesizer reads pipeline artifacts and extracts structured learnings. Uses agents.learning_synthesizer.model. | ✓ |
| Rule-based extraction | Deterministic rules from structured data. Fast, predictable, no LLM cost. | |
| Hybrid | Rule-based for obvious + LLM for synthesis. Best coverage, more complexity. | |

**User's choice:** LLM sub-agent (Recommended)
**Notes:** User selected recommended option.

### Pipeline Timing

| Option | Description | Selected |
|--------|-------------|----------|
| After eval+debug completes | Step 7 in orient skill body. Richest signal from all artifacts. | ✓ |
| After user approves at gate | Captures user triage decisions but delays capture. | |
| You decide | Claude picks best integration point. | |

**User's choice:** After eval+debug completes (Recommended)
**Notes:** User selected recommended option.

### Learning Content Types

| Option | Description | Selected |
|--------|-------------|----------|
| All three types | Gotchas, decisions, patterns. Max 3-5 per run. Matches existing schema. | ✓ |
| Gotchas + decisions only | Skip patterns. Keeps learnings.md leaner. | |
| You decide | Claude picks based on artifacts. | |

**User's choice:** All three types (Recommended)
**Notes:** User selected recommended option.

### Contradiction Detection

| Option | Description | Selected |
|--------|-------------|----------|
| Code-first validation | Check against actual code AND existing learnings. Flag contradictions. | ✓ |
| Learning-vs-learning only | Only check against existing learnings. Simpler, fewer false positives. | |
| You decide | Claude picks validation depth. | |

**User's choice:** Code-first validation (Recommended)
**Notes:** User selected recommended option.

### 50-Learning Cap Policy

| Option | Description | Selected |
|--------|-------------|----------|
| Expire oldest first | Remove oldest expired/lowest-confidence to make room. Decay thins naturally. | ✓ |
| LRU eviction | Always evict least-recently-referenced. More aggressive turnover. | |
| Block and notify | Don't add, prompt user to curate. Forces active management. | |

**User's choice:** Expire oldest first (Recommended)
**Notes:** User selected recommended option.

---

## Review & Curation

**User's choice:** Auto-selected recommended defaults for all questions.
**Notes:** User requested "go with the best recommended options the rest of the way."

Decisions auto-selected:
- Batch review with grouping by type, confirm/reject/edit per learning
- Edit allows description and type changes, not evidence
- Convention promotion integrated into review flow
- Nudge after 10+ unreviewed learnings

---

## Global Memory

**User's choice:** Auto-selected recommended defaults for all questions.
**Notes:** User requested recommended defaults.

Decisions auto-selected:
- Extend format with tech stack tendencies, ignore patterns, cross-project gotchas
- Auto-update from eval gate behavior (3-strike rule for ignore patterns)
- Extend existing structured markdown format with backward-compatible new sections
- Manual promotion of cross-project gotchas during review

---

## Settings Skill

**User's choice:** Auto-selected recommended defaults for all questions.
**Notes:** User requested recommended defaults.

Decisions auto-selected:
- Interactive AskUserQuestion menus for all config sections
- Convention rollback: list and remove from conventions-enforced.md
- Agent teams re-detection and enable/disable
- Reset commands: --reset (config), --reset-global (global memory)
- --set key=value for direct CLI-style changes
- Zod validation after every change

---

## Claude's Discretion

No areas deferred to Claude's discretion.

## Deferred Ideas

None -- discussion stayed within phase scope.
