# Phase 7: Learning System and Settings - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

After the orient-to-debug pipeline completes, an LLM learning synthesizer sub-agent reads pipeline artifacts and extracts structured learnings (gotchas, decisions, patterns) into learnings.md with UNVERIFIED status, confidence decay, contradiction detection against code and existing learnings, and a 50-learning cap with oldest-expired eviction. Global memory at ~/.codescope/global-memory.md is enriched with tech stack tendencies, ignore patterns, and cross-project gotchas auto-captured from eval gate behavior. Two management skills let the user curate everything: `/codescope:review-learnings` for batch learning review with convention promotion, and `/codescope:settings` for interactive config changes, convention rollback, agent teams re-detection, and reset commands.

</domain>

<decisions>
## Implementation Decisions

### Learning Capture Mechanism
- **D-01:** LLM sub-agent (using agents.learning_synthesizer.model from config) reads pipeline artifacts: coordination log, eval findings, debug cycles, verify report, scope contract. Extracts structured learnings. Smarter than rule-based — can identify non-obvious gotchas and cross-cutting patterns.
- **D-02:** Runs as Step 7 in orient skill body, after eval+debug loop completes. Reads all artifacts from the completed run. Runs regardless of whether debug was needed.
- **D-03:** Extracts all three learning types: gotchas (unexpected issues hit during execution/debug), decisions (design choices made or escalated), and patterns (what approaches worked well). Max 3-5 new learnings per pipeline run to keep signal high.
- **D-04:** All new learnings start as UNVERIFIED per LRNG-02. Never auto-promote to enforced conventions per LRNG-06.
- **D-05:** Learning synthesizer output extends the existing learnings.md schema (from Phase 2 learning-synthesizer.ts): each entry has title, status (UNVERIFIED), type (gotcha/decision/pattern), discovered date, expires date (based on decay), and evidence (file:line or description from pipeline artifacts).

### Contradiction Detection
- **D-06:** Code-first validation before adding a learning. Check if the new learning contradicts actual code (e.g., learning says "use async/await" but codebase predominantly uses .then()). Also check against existing learnings for direct conflicts.
- **D-07:** Contradictions flagged with CONTRADICTED status and evidence of the conflict. Not silently added or silently dropped. User sees them during /codescope:review-learnings.
- **D-08:** Contradiction check uses existing convention detection infrastructure (ast-grep patterns) for code validation where applicable, and LLM comparison for semantic conflicts between learnings.

### Confidence Decay
- **D-09:** Gotchas expire after 90 days, decisions after 180 days per LRNG-03. Expiry calculated from discovered date.
- **D-10:** Expired learnings marked with EXPIRED status but not immediately removed. They become eviction candidates when the 50-learning cap is hit.
- **D-11:** Decay check runs at learning capture time (before adding new learnings) and at review time. Not a background process.

### 50-Learning Cap
- **D-12:** When at 50 active learnings and a new one arrives, remove the oldest expired/lowest-confidence learning to make room. Confidence decay naturally thins the list over time. If nothing is expired, skip adding the new learning and note it in the pipeline summary.
- **D-13:** IGNORE and TODO entries from eval gate (already in learnings.md via ignore-filter.ts) count toward the 50-learning cap. They follow the same lifecycle.

### Review & Curation (/codescope:review-learnings)
- **D-14:** Batch review UX: present all UNVERIFIED learnings in one session, grouped by type (gotchas first, then decisions, then patterns). User confirms, rejects, or edits each learning via AskUserQuestion menus.
- **D-15:** Edit allows changing description and type. Evidence is pipeline-sourced and not user-editable (preserves audit trail). User can add a note/annotation.
- **D-16:** Confirmed learnings get VERIFIED status. Rejected learnings are removed from learnings.md.
- **D-17:** Convention promotion integrated into review flow: when reviewing a "pattern" type learning with high confidence (referenced in multiple pipeline runs or high adoption), offer "Promote to enforced convention?" This is the Phase 3 D-12 mechanism — confirmed patterns move to conventions-enforced.md.
- **D-18:** Nudge after 10+ unreviewed learnings accumulate. Info message at orient start: "10 unreviewed learnings. Run /codescope:review-learnings to curate." Not blocking.
- **D-19:** Also surfaces CONTRADICTED and TODO entries during review for user resolution.

### Global Memory Enrichment
- **D-20:** Extend ~/.codescope/global-memory.md beyond current preferences (orient_verbosity, clarification, eval_mode, convention_strictness) to include: tech stack tendencies (languages/frameworks used frequently across projects), ignore patterns (from eval gate), and cross-project gotchas (learnings marked as broadly applicable).
- **D-21:** Auto-update from eval gate behavior (LRNG-08): capture ignore patterns and consistently-applied triage choices. When a user ignores the same type of finding across 3+ pipeline runs, record as a global preference.
- **D-22:** Extend existing structured markdown format in global-memory.ts with new sections (## Tech Stack Tendencies, ## Ignore Patterns, ## Cross-Project Gotchas). Backward-compatible — existing preferences section unchanged.
- **D-23:** Cross-project gotchas manually promoted during /codescope:review-learnings: user can mark a verified learning as "applies to all projects" and it copies to global memory.

### Settings Skill (/codescope:settings)
- **D-24:** Interactive menus (AskUserQuestion) for all config.yml sections: agents, orient, execute, verify, eval, conventions, learning, bootstrap, display. User picks section, then field, then new value.
- **D-25:** Convention rollback: lists all entries in conventions-enforced.md, user selects which to remove. Per Phase 3 D-16.
- **D-26:** Agent teams re-detection: probe for CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var, offer enable/disable. Per Phase 4 D-45.
- **D-27:** Reset commands: `--reset` resets config.yml to defaults (preserving project section), `--reset-global` wipes global memory to empty template. bootstrap --force already exists from Phase 3.
- **D-28:** Also supports `--set key=value` for direct CLI-style changes without interactive menus (e.g., `/codescope:settings --set eval.mode=auto-debug`).
- **D-29:** After any change, validates config.yml against Zod schema (existing infrastructure) and shows confirmation of what changed.

### Pipeline Integration
- **D-30:** Orient skill body gains Step 7: Learning Capture. After Step 6 (eval+debug) completes, dispatch learning synthesizer sub-agent. Runs with `learning.auto_capture: true` in config (default). Skipped when false.
- **D-31:** Learning synthesizer writes to learnings.md at .claude/codescope/learnings.md (existing location). Appends new entries to the ## Entries section.
- **D-32:** Pipeline summary (Step 8 — final orient output) includes learning capture results: N new learnings added, any contradictions flagged, cap status.

### Claude's Discretion
- No areas deferred to Claude's discretion — all gray areas received explicit user decisions or recommended defaults.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Specification
- `CODESCOPE-SPEC-V6.md` -- Full product spec. Learning system schema, confidence decay model, contradiction detection, global memory format, settings skill, review-learnings skill.

### Build Instructions
- `CODESCOPE-BUILD-INSTRUCTIONS.md` -- Environment setup, dependency versions.

### Project Context
- `.planning/PROJECT.md` -- Key decisions: suggestion-only conventions, UNVERIFIED default for learnings, max 50 active learnings, confidence decay bounds.
- `.planning/REQUIREMENTS.md` -- Phase 7 requirements: LRNG-01 through LRNG-08, MGMT-01 through MGMT-03.
- `.planning/ROADMAP.md` -- Phase 7 goal, success criteria.

### Technology Stack
- `CLAUDE.md` SS Technology Stack -- vitest for testing, zod for schema validation, better-sqlite3.

### Prior Phase Context & Code
- `.planning/phases/01-plugin-foundation-and-infrastructure/01-CONTEXT.md` -- D-10 (config.yml YAML format), D-12 (thorough defaults), D-15 (Zod schema validation), D-42 (skill file per skill), D-44 (hooks added in Phase 7).
- `.planning/phases/02-scout-and-analysis-squad/02-CONTEXT.md` -- D-05 (agent module pattern: Options + Result + async function), D-24 (learnings.md schema initialization).
- `.planning/phases/03-bootstrap-synthesis-and-mcp-server/03-CONTEXT.md` -- D-12 (convention promotion via review-learnings), D-13 (enforced = warning, never blocks), D-14 (conventions-enforced.md starts empty, no auto-promotion), D-16 (rollback via settings).
- `.planning/phases/04-orient-and-execution-engine/04-CONTEXT.md` -- D-44 (execute.parallel deprecated), D-45 (settings allows agent teams re-detection).
- `.planning/phases/06-eval-user-gate-and-debug/06-CONTEXT.md` -- D-08 (TODO deferral to learnings.md), D-10 (ignore patterns in learnings.md for eval tuning).

### Existing Code
- `src/agents/learning-synthesizer.ts` -- Creates empty learnings.md with schema structure. Phase 7 gives it real extraction logic.
- `src/onboard/global-memory.ts` -- readGlobalMemory/writeGlobalMemory with structured markdown. Phase 7 extends with new sections.
- `src/eval/ignore-filter.ts` -- loadIgnorePatterns, filterFindings, appendIgnoreEntry, appendTodoEntry. Already writes IGNORE and TODO entries to learnings.md.
- `src/config/schema.ts` -- ConfigSchema with full learning section (project_memory, global_memory, max_active_learnings, confidence_decay, auto_capture, capture_ignores).
- `src/config/defaults.ts` -- Default learning config values (max 50, gotchas 90 days, decisions 180 days, auto_capture true).
- `src/config/loader.ts` -- loadConfig with Zod validation. Settings skill reuses for validation after changes.
- `src/config/writer.ts` -- Config writing infrastructure.
- `skills/settings/SKILL.md` -- Stub skill, to be implemented.
- `skills/review-learnings/SKILL.md` -- Stub skill, to be implemented.
- `skills/orient/SKILL.md` -- Orient skill body, needs Step 7 (learning capture) added.
- `src/tools/helpers.ts` -- okResponse/errorResponse/buildMetadata for MCP responses.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Learning synthesizer** (src/agents/learning-synthesizer.ts): Module shell with Options + Result + async function pattern. Phase 7 replaces the empty-init logic with real LLM-driven extraction.
- **Global memory** (src/onboard/global-memory.ts): readGlobalMemory/writeGlobalMemory with structured markdown parsing. Extend with new sections for tech stack, ignore patterns, cross-project gotchas.
- **Ignore filter** (src/eval/ignore-filter.ts): Already manages IGNORE and TODO entries in learnings.md. Phase 7 learning system builds on this — same file, same format, additional entry types.
- **Config schema + loader** (src/config/schema.ts, loader.ts, writer.ts): Full learning config already defined with Zod validation. Settings skill reads/writes config.yml through this infrastructure.
- **Agent module pattern** (src/agents/*.ts): Options + Result + async function. Learning synthesizer follows this.
- **Skill stubs** (skills/settings/, skills/review-learnings/): Already registered in plugin.json. Replace stub content with full skill bodies.

### Established Patterns
- Agent module pattern: Options + Result + async function + markdown artifact (Phase 2 D-05)
- Issue #5812 filesystem coordination: agents write files, parent reads files
- Skill body is detailed natural language prompt (Phase 1 D-42)
- AskUserQuestion menus for interactive skill flows (established in onboard)
- Structured markdown with YAML frontmatter for artifacts

### Integration Points
- Modified `src/agents/learning-synthesizer.ts` -- real extraction logic replacing empty init
- Modified `src/onboard/global-memory.ts` -- extended format with new sections
- New `src/learning/` -- decay engine, contradiction detector, cap enforcer, learning manager
- Modified `skills/orient/SKILL.md` -- add Step 7: Learning Capture
- Replaced `skills/settings/SKILL.md` -- full interactive settings skill body
- Replaced `skills/review-learnings/SKILL.md` -- full batch review skill body

</code_context>

<specifics>
## Specific Ideas

- Learning synthesizer reads coordination log + eval findings + debug cycles + verify report as a single context bundle. Extracts 3-5 structured learnings per run — keeps signal/noise ratio high.
- Contradiction detection is code-first: check new learning against actual codebase patterns (via ast-grep where applicable) before checking against existing learnings. Contradictions flagged, not silently dropped.
- Expire-oldest-first cap policy means the system self-manages over time. Confidence decay naturally thins stale learnings, and the cap only bites when everything is still fresh.
- Convention promotion is integrated into the review flow, not a separate command. Natural progression: pattern learning -> VERIFIED -> "promote to enforced?" -> conventions-enforced.md.
- Global memory auto-enrichment uses a 3-strike rule: same finding type ignored across 3+ pipeline runs -> becomes a global preference. Prevents single-session noise from polluting global state.
- Settings skill supports both interactive menus (full exploration) and --set key=value (power user shortcut). Both validate against Zod schema before writing.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope.

</deferred>

---

*Phase: 07-learning-system-and-settings*
*Context gathered: 2026-03-24*
