# Phase 12: Convention Enforcement + Session Continuity - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Developers can opt into pre-commit convention enforcement that only blocks on user-verified patterns, and can pause/resume CodeScope workflows across sessions without losing context. Two distinct capabilities: (1) convention enforcement via git pre-commit hook with configurable severity, (2) session continuity via structured handoff documents and resume skills.

Requirements: ENFORCE-01, ENFORCE-02, ENFORCE-03, ENFORCE-04, SESS-01, SESS-02, SESS-03, SESS-04

</domain>

<decisions>
## Implementation Decisions

### Hook Installation Strategy (ENFORCE-04)
- **D-01:** `npx codescope install-hooks` creates a **wrapper pre-commit script** that chains with any existing hook. If an existing hook exists, it runs first -- if it fails, CodeScope's check is skipped. Follows the boidolr/ast-grep-pre-commit pattern for ast-grep integration.
- **D-02:** If **husky detected** (`.husky/` dir exists), integrate into husky's hook chain rather than writing to raw `.git/hooks/`. If no hook framework, install directly to `.git/hooks/pre-commit`.
- **D-03:** `npx codescope uninstall-hooks` cleanly removes CodeScope's additions without affecting other hooks.
- **D-04:** Hook script runs `sg scan` (ast-grep CLI) with CodeScope's detected convention rules on staged files only. Uses `git diff --cached --name-only` for file list.

### Convention Filtering (ENFORCE-02)
- **D-05:** Only conventions with status **VERIFIED** in `learnings.md` are enforced -- auto-detected patterns (UNVERIFIED) never block or warn. This preserves the progressive trust model: detect -> suggest -> verify -> optionally enforce.
- **D-06:** Convention rules are **auto-generated from detected patterns** using ast-grep YAML rule format. The convention-detector already produces these patterns; enforcement consumes them filtered by VERIFIED status.

### Enforcement Severity (ENFORCE-03)
- **D-07:** Three severity levels configurable in `config.yml`:
  - **suggest-only (default):** Show colored findings (file:line, convention name, one-line evidence), always exit 0 -- commit proceeds.
  - **warn:** Show findings with yellow warning banner, exit 0 -- commit proceeds but output is prominent.
  - **block:** Show findings with red error banner, exit 2 (standard pre-commit blocking exit code) -- commit blocked. `git commit --no-verify` bypasses.
- **D-08:** All modes show compact terminal output: file path, convention name, one-line evidence. `--verbose` flag for full detail with golden file references.
- **D-09:** Output includes count summary: "Checked N conventions against M staged files" with pass/fail totals.

### Handoff Document Design (SESS-01, SESS-04)
- **D-10:** Handoff is **structured markdown with YAML frontmatter** containing: task slug, current pipeline phase (clarification/research/planning/execution/verify/eval), wave position, timestamp, orient output directory path.
- **D-11:** Body sections: **Completed Work** (phases/waves finished with artifact paths), **Remaining Tasks** (phases/waves pending), **Key Decisions** (context that matters for continuation), **Active Findings** (unresolved eval/verify findings), **Resume Command** (exact `/codescope:resume` invocation).
- **D-12:** Stored in `.claude/codescope/sessions/{taskSlug}-handoff.md`. One handoff per task slug.
- **D-13:** PreCompact hook (SESS-04) **auto-generates handoff** before context compaction -- same format as manual `/codescope:pause`, triggered automatically by Claude Code's PreCompact event.
- **D-14:** 7-day auto-cleanup of old session files. Cleanup runs on `/codescope:pause` and `/codescope:resume` invocations.

### Resume Pipeline Re-entry (SESS-02, SESS-03)
- **D-15:** `/codescope:resume` reads latest handoff document, displays summary of where work stopped, offers "Continue" (resume at saved position) or "Start fresh" (ignore handoff, re-run orient from scratch).
- **D-16:** `--resume {taskSlug}` flag on orient scans `.claude/codescope/orient/{taskSlug}/` for completed artifacts (scope-contract.md, research.md, plans/, execution/). Skips phases with completed artifacts, resumes at first incomplete phase/wave.
- **D-17:** **Artifact validation on resume:** Compare handoff document state against actual artifacts on disk. If artifacts referenced in handoff are missing (manual deletion, partial failure), warn user and offer to restart that specific phase rather than silently failing.
- **D-18:** SessionStart hook (Claude Code `source: "resume"` matcher) injects handoff summary as `additionalContext` so Claude has immediate context when a session resumes. Follows the Session Context Management MCP /start pattern.

### Skill Design
- **D-19:** `/codescope:pause` skill generates handoff document and confirms with a summary of what was captured. Follows existing skill pattern (orient, review, bootstrap).
- **D-20:** `/codescope:resume` skill reads handoff, displays interactive summary, and resumes the orient pipeline at the correct position. Skill structure mirrors `/codescope:orient` with flag handling.

### Claude's Discretion
- Exact ast-grep YAML rule generation from detected conventions (rule structure, severity mapping)
- Hook script internal implementation (shell script vs Node.js script matching Phase 10 hook pattern)
- Handoff document markdown formatting and section ordering
- Session cleanup implementation (inline check vs separate utility)
- Whether to use lint-staged for staged file filtering or raw `git diff --cached`

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Hook Infrastructure (Phase 10)
- `src/hooks/pre-tool-use.ts` -- PreToolUse hook pattern (build isolation, no heavy imports, artifact reading)
- `src/hooks/post-tool-use.ts` -- PostToolUse hook pattern
- `src/hooks/lib/types.ts` -- Hook input/output type definitions (HookInput, PreToolUseOutput, PostToolUseOutput)
- `src/hooks/lib/artifact-reader.ts` -- Artifact file reading pattern (reuse for convention rule loading)
- `src/hooks/lib/budget-composer.ts` -- Budget composition pattern (reference for enforcement output formatting)

### Existing Convention Infrastructure
- `src/tools/conventions.ts` -- `parseConventions()`, `ParsedConvention` type with confidence/adoption/files/evidence
- `src/artifacts/convention-index.ts` -- Convention index builder from conventions.md, per-file O(1) lookup
- `src/agents/convention-detector.ts` -- Convention detection during bootstrap (rule generation source)
- `src/conventions/types.ts` -- Convention type definitions

### Learning System (VERIFIED status)
- `src/learning/types.ts` -- `LearningStatus` with VERIFIED/UNVERIFIED, `LearningEntry` structure
- `src/learning/run-learning-capture.ts` -- Learning capture patterns
- `src/agents/learning-synthesizer.ts` -- Learning synthesis (convention verification flow)

### Config Infrastructure
- `src/config/schema.ts` -- `ConfigSchema` Zod schema (needs enforcement severity extension)
- `src/config/defaults.ts` -- Default config values (add enforcement defaults)
- `src/config/loader.ts` -- Config loading pattern
- `src/config/writer.ts` -- Config writing pattern

### Plugin Infrastructure
- `.claude-plugin/plugin.json` -- Plugin manifest (needs pause/resume skill additions)

### Orient Pipeline (session state)
- `src/orient/run-orient.ts` -- Orient entry point (needs --resume flag support)

### External References (competitive repos being referenced)
- GitHub: `boidolr/ast-grep-pre-commit` -- ast-grep pre-commit integration pattern, YAML rule format
- GitHub: `ast-grep/ast-grep` -- Lint rule format documentation, `sg scan` CLI usage
- MCP: Session Context Management MCP -- /handoff and /start patterns for session state serialization
- Claude Code docs: PreCompact/SessionStart hook events, `source: "resume"` matcher, `additionalContext` injection

### Requirements
- `.planning/REQUIREMENTS.md` -- ENFORCE-01 through ENFORCE-04, SESS-01 through SESS-04 acceptance criteria

### Research
- `.planning/research/FEATURES.md` -- Detailed feature specs for convention enforcement (section 4) and session continuity (section 5), competitor analysis, dependency map

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `parseConventions()` in `src/tools/conventions.ts` -- Convention parsing from markdown, filters by confidence/adoption. Reuse for VERIFIED convention extraction.
- `ConventionIndex` in `src/artifacts/convention-index.ts` -- Per-file convention lookup. Reuse or extend for pre-commit file matching.
- `LearningStatus` type in `src/learning/types.ts` -- VERIFIED/UNVERIFIED status already modeled. Filter learnings by status for enforcement.
- `HookInput`/`PreToolUseOutput` types in `src/hooks/lib/types.ts` -- Hook type patterns for new PreCompact/SessionStart hooks.
- `readAllArtifacts()` in `src/hooks/lib/artifact-reader.ts` -- Artifact reading pattern reusable for convention rule loading in pre-commit hook.
- `ConfigSchema` in `src/config/schema.ts` -- Extensible Zod schema for adding enforcement severity config.
- Existing skill SKILL.md files (review, orient, bootstrap) -- Consistent skill definition patterns for pause/resume skills.

### Established Patterns
- Hook scripts are stateless, read pre-computed artifacts, zero heavy module imports (Phase 10 D-01)
- Hooks reference .mjs files matching tsdown ESM output
- All config via config.yml validated by Zod schema
- Skills follow SKILL.md frontmatter pattern with allowed-tools list
- Plugin manifest in `.claude-plugin/plugin.json` registers skills and hooks
- Orient pipeline uses filesystem coordination -- all state on disk, not in context

### Integration Points
- `src/config/schema.ts` -- Add enforcement severity field to ConfigSchema
- `.claude-plugin/plugin.json` -- Register pause/resume skills, add new hook events
- `hooks/hooks.json` -- Add PreCompact and SessionStart hook entries
- `src/orient/run-orient.ts` -- Add --resume flag handling
- `.claude/codescope/sessions/` -- New directory for handoff documents

</code_context>

<specifics>
## Specific Ideas

- Convention enforcement follows the progressive trust model from FEATURES.md: detect (v1) -> suggest (v1) -> verify (v1) -> optionally enforce (v2). Never auto-promote.
- Pre-commit hook output should be compact and familiar to developers who use ESLint/Prettier pre-commit hooks -- same mental model.
- Session continuity leverages the filesystem-first architecture: all critical state already lives on disk. The handoff document is a structured pointer into that state, not a duplicate of it.
- Reference boidolr/ast-grep-pre-commit for the ast-grep integration pattern and Session Context Management MCP for the handoff/resume pattern.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 12-convention-enforcement-session-continuity*
*Context gathered: 2026-03-28*
