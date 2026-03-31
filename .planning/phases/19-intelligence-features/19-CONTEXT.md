# Phase 19: Intelligence Features - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

CodeScope actively helps Claude write code that fits the codebase by suggesting reference files before edits, validating conventions after edits, and exposing a skill for on-demand evaluation. Three capabilities: reference file injection (REF-01/02/03), post-edit convention validation (VALID-01/02/03/04), and the `/codescope:eval` skill (EVAL-01/02/03/04).

</domain>

<decisions>
## Implementation Decisions

### Reference File Matching (REF-01/02/03)
- **D-01:** Pre-computed `references-index.json` artifact built at bootstrap time. Hook reads JSON — no heavy imports, no on-the-fly computation.
- **D-02:** Similarity scored with weighted signals: convention density (40%) + community proximity (25%) + directory proximity (20%) + shared imports (15%). Returns top-1 reference per file.
- **D-03:** Candidates scoped by file role (utility -> utility, route-handler -> route-handler). Uses existing `classifyFileRole()` from `src/classifier/file-role.ts`.
- **D-04:** Noise files excluded from candidates using existing `isNoiseFile()` from `src/conventions/golden-files.ts` (REF-03 compliance).
- **D-05:** New file creation handled by path-only signals: directory proximity + file role classification (deterministic from path, no file content needed).
- **D-06:** New builder `src/artifacts/reference-index.ts` integrated into `generateInjectionArtifacts()` in `src/artifacts/generator.ts`. Atomic write, same pattern as danger-zones.json.
- **D-07:** Hook injection format is one line at priority 2.5: `Reference: see \`src/utils/session.ts\` for this codebase's utility pattern` (~20 tokens).

### Post-Edit Validation (VALID-01/02/03/04)
- **D-08:** Pre-computed `convention-violations.json` artifact for the PostToolUse hook. Type names and import paths pre-extracted at bootstrap/incremental rebuild time.
- **D-09:** New builder `src/artifacts/violation-index.ts` integrated into `generateInjectionArtifacts()`. Schema: `{ generated, files: { "path": [{ ruleId, detected, expected, line }] } }`.
- **D-10:** Hook reads violations JSON, filters by edited file path, injects advisory warnings at PostToolUse priority 1 (~100 tokens). Deviations are problems, not reminders — higher priority than convention reminders.
- **D-11:** Only HIGH-CONF conventions trigger validation warnings (VALID-04: <5% false positive rate).
- **D-12:** VALID-02 (type name checking): pre-compute detected type names during bootstrap, store in violations index. Hook compares written code type references against known types.
- **D-13:** VALID-03 (import path checking): pre-compute resolved import paths, store valid import targets in violations index. Hook flags imports to non-existent or incorrect paths.
- **D-14:** Do NOT add @ast-grep/napi to hooks in Phase 19. Start with pre-computed violations. Only escalate to napi if measured false positive rate exceeds 5% on real codebases.
- **D-15:** Advisory only — validation output is informational, never blocking. No `decision: "block"` in Phase 19.

### Eval Skill (EVAL-01/02/03/04)
- **D-16:** Mode 2 (score uncommitted changes) is the MVP — ship first. Uses deterministic scorecard computed from existing MCP tools and graph data. No LLM calls. Fast (<1s), free, reproducible.
- **D-17:** Deterministic scorecard fields (all computable without LLM):
  1. Convention Adherence % — from convention data on changed files
  2. Blast Radius — downstream file count + risk level
  3. Violation Count — new violations introduced by change
  4. Import Correctness % — broken/missing imports ratio
  5. Risk Files Modified — danger zone files touched
  6. Composite Score — weighted average mapped to letter grade (A/B/C/F)
- **D-18:** Mode 1 (run task + score) reuses the orient pipeline for task execution, then scores with Mode 2 deterministic logic. Revert via `git stash --include-untracked && git stash drop` when user opts in.
- **D-19:** Mode 3 (benchmark suite) is deferred — Phase 20+ scope. YAML task definitions in `.claude/codescope/benchmarks/`. Mode 3 UI shows "Coming soon" placeholder.
- **D-20:** New `src/eval/deterministic-scorecard.ts` module (~150-200 lines). Functions: `computeConventionAdherence()`, `computeBlastRadiusScore()`, `computeImportCorrectness()`, `computeCompositeScore()`.
- **D-21:** Composite score weights: convention adherence 25%, blast radius (normalized) 25%, violation impact (normalized) 25%, import correctness 25%. Letter grades: A=90-100%, B+=85-89%, B=80-84%, C+=70-74%, C=60-69%, F=<60%.

### Hook Budget & Priority
- **D-22:** Keep 500-token budget limit. No increase needed — both hooks have 40-55% headroom after adding new items.
- **D-23:** PreToolUse priority order: danger zones (P1, ~80 tokens) > conventions (P2, ~150 tokens) > reference suggestion (P2.5, ~20 tokens) > blast radius (P3, ~60 tokens). Total ~310 tokens (62%).
- **D-24:** PostToolUse priority order: validation warnings (P1, ~100 tokens) > convention reminder (P2, ~80 tokens) > blast radius warning (P3, ~50 tokens). Total ~230 tokens (46%).
- **D-25:** Reference suggestion is PreToolUse only (before edit). Validation warnings are PostToolUse only (after edit). No overlap between hooks.

### Claude's Discretion
- Exact similarity weight tuning (40/25/20/15 starting point, adjust based on testing)
- Whether to add a complementary MCP tool for deeper on-demand validation alongside the hook
- Scorecard markdown rendering format and styling
- Whether Mode 1 task execution uses full orient pipeline or a lightweight variant
- Pairwise similarity pre-computation strategy (all pairs vs. same-role only)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Hook Architecture (Reference & Validation Injection)
- `src/hooks/pre-tool-use.ts` — PreToolUse hook; add reference suggestion at priority 2.5
- `src/hooks/post-tool-use.ts` — PostToolUse hook; add validation warnings at priority 1
- `src/hooks/lib/budget-composer.ts` — 500-token budget composer with priority queue
- `src/hooks/lib/artifact-reader.ts` — Artifact loading pattern for hooks
- `src/hooks/lib/types.ts` — Hook I/O types (HookInput, PreToolUseOutput, PostToolUseOutput)

### Artifact Generation (Reference Index & Violation Index)
- `src/artifacts/generator.ts` — Injection artifact generation; integrate new builders here
- `src/artifacts/convention-index.ts` — Convention index builder (pattern to follow for new artifacts)
- `src/artifacts/danger-zone-index.ts` — Danger zone index builder (pattern to follow)
- `src/artifacts/blast-radius-index.ts` — Blast radius index builder (pattern to follow)
- `src/artifacts/types.ts` — Artifact type definitions; extend for new index types

### Similarity Signals (Reference File Matching)
- `src/conventions/golden-files.ts` — Golden file ranking + `isNoiseFile()` for exclusion
- `src/classifier/file-role.ts` — File role classification (test, config, route-handler, utility, deprecated, general)
- `src/graph/analytics.ts` — Community detection, centrality scores
- `src/graph/schema.ts` — Database schema; nodes table with metadata JSON column

### Convention Pipeline (Validation)
- `src/conventions/runner.ts` — Convention scanning; RULE_METADATA; `runAstGrepScan()`
- `src/conventions/parser.ts` — Canonical convention parser
- `src/conventions/rule-metadata.ts` — Shared rule metadata (pure data module)
- `src/enforcement/rule-filter.ts` — Rule filtering for enforcement
- `src/enforcement/pre-commit-check.ts` — Pre-commit convention check (reference for subprocess pattern)

### Eval Infrastructure
- `src/eval/eval-agent.ts` — Existing LLM-based eval agent (Phase 19 adds deterministic alternative)
- `src/eval/types.ts` — Eval types (EvalOptions, EvalResult, EvalFinding, EvalCriterion)
- `src/tools/eval.ts` — Existing MCP eval tool
- `src/tools/blast-radius.ts` — Blast radius computation (scorecard input)
- `src/tools/detect-changes.ts` — Change detection with risk scoring (scorecard input)
- `src/tools/conventions.ts` — Convention query tool (scorecard input)

### Phase 17 & 18 Context (Prior Decisions)
- `.planning/phases/17-foundation-fixes/17-CONTEXT.md` — Canonical parser pattern, error surfacing, graph deduplication
- `.planning/phases/18-semantic-conventions/18-CONTEXT.md` — Framework detection, file-role classification, golden file filtering, readiness cap

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `isNoiseFile()` in `golden-files.ts` — Exclude test/config/generated/deprecated files from reference candidates (REF-03)
- `classifyFileRole()` in `classifier/file-role.ts` — Scope reference matching by file role
- `rankGoldenFiles()` in `golden-files.ts` — Convention density computation; reference index extends this pattern
- `composeBudgetedMessage()` in `budget-composer.ts` — Priority queue injection; add P2.5 and P1 items
- `readAllArtifacts()` in `artifact-reader.ts` — Extend to read new `references-index.json` and `convention-violations.json`
- `generateInjectionArtifacts()` in `generator.ts` — Add `buildReferenceIndex()` and `buildViolationIndex()` calls
- `computeReadiness()` in `bootstrap/readiness.ts` — Pattern for aggregating multi-dimensional scores (similar to composite eval score)

### Established Patterns
- Artifact builder pattern: synchronous function takes db, returns typed index, generator writes atomically
- Hook build isolation: zero imports from `src/graph/`, `src/tools/`, `src/parser/`, `src/server.ts`
- Priority queue budget: items sorted ascending (1=highest), greedily included until budget exhausted
- Agent module pattern: Options + Result + async function (eval agent follows this)
- MCP tool pattern: register function with zod schema, handleX function, McpServer parameter

### Integration Points
- `generateInjectionArtifacts()` — Add two new builders (reference-index, violation-index)
- `readAllArtifacts()` — Extend to load new JSON files
- `processPreToolUse()` — Add reference suggestion injection at P2.5
- `processPostToolUse()` — Add validation warning injection at P1
- Eval skill — New skill file + deterministic scorecard module
- Incremental rebuild — New artifacts must also update on delta reparse

</code_context>

<specifics>
## Specific Ideas

- Reference suggestion format: exactly one line, path only, never file content. "Reference: see `src/utils/session.ts` for this codebase's utility pattern"
- Validation warnings are advisory — never blocking. Phrased as observations, not commands.
- Deterministic scorecard should be transparent — users can verify every number against their own understanding
- Mode 2 eval should feel instant — run after any change, get feedback in <1 second
- Composite score letter grades (A/B/C/F) give quick gut-check; detailed metrics give depth

</specifics>

<deferred>
## Deferred Ideas

- Mode 3 benchmark suite (YAML task definitions, batch execution, aggregate scoring) — Phase 20+
- Optional full LLM-based eval detail (semantic judgment, scope compliance, completeness) — Phase 20+
- @ast-grep/napi in-process validation (only if pre-computed violations have >5% FP rate) — Phase 20+
- Community benchmark YAML files for popular frameworks (Fastify, Express, h3) — Phase 20+
- Complementary MCP validation tool for deep on-demand analysis — consider during planning

</deferred>

---

*Phase: 19-intelligence-features*
*Context gathered: 2026-03-30*
