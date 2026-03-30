# Phase 18: Semantic Conventions - Context

**Gathered:** 2026-03-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Convention detection identifies framework-specific patterns (not just generic syntax), golden files are filtered to exclude noise, and file roles are classified to prevent false-positive convention matching.

This phase transforms conventions from generic syntax detection to codebase-aware intelligence. All 5 requirements (CONV-03 through CONV-07) are addressed.

</domain>

<decisions>
## Implementation Decisions

### Framework Detection (CONV-05)
- **D-01:** Detect frameworks by scanning `package.json` `dependencies` + `devDependencies` for known framework package names. No AST-based detection needed — package.json is authoritative.
- **D-02:** Minimum 3 frameworks supported: **Fastify**, **Express**, **h3**. These are the frameworks used in eval testing (Fastify, h3) plus the most widely used Node.js framework (Express).
- **D-03:** Store detected frameworks as `string[]` (e.g., `['fastify', 'express']`). Pass to `runConventionScan()` as new parameter. Default to empty array when no frameworks detected.
- **D-04:** Extend `detectProject()` in `src/onboard/detect.ts` or create a focused `detectFrameworks()` function. Call from `runConventionDetector()` in `convention-detector.ts`.

### Framework-Specific Rules (CONV-06)
- **D-05:** Rules organized in `src/conventions/rules/frameworks/{name}/` subdirectories (e.g., `rules/frameworks/fastify/detect-fastify-plugin.yml`). Generic rules stay in `rules/typescript/` and `rules/python/` unchanged.
- **D-06:** Only load framework rules for detected frameworks. If Fastify not in package.json, `rules/frameworks/fastify/*.yml` never runs. This prevents false positives entirely.
- **D-07:** Runner needs recursive rule discovery — current `runAstGrepScan()` only scans direct files in a directory. Implement `findAllRuleFiles()` or call `runAstGrepScan()` per framework directory.
- **D-08:** Update `RULE_METADATA` map in runner.ts with entries for every new framework rule (name + category). Missing metadata defaults to `{name: ruleId, category: "unknown"}` which is safe but confusing.
- **D-09:** Framework rule categories use framework prefix: `fastify-plugin`, `fastify-routing`, `express-middleware`, `h3-handler`, etc.
- **D-10:** Framework-specific ast-grep rules to create:
  - **Fastify:** plugin signature (`module.exports = async function(fastify, opts)`), route registration (`fastify.get/post/put/delete`), hooks (`fastify.addHook`), decorators (`fastify.decorate`)
  - **Express:** middleware chaining (`app.use`), error handler signature (4-param function), router registration
  - **h3:** event handler (`defineEventHandler`), utility functions (`readBody`, `getQuery`, `setResponseStatus`)

### Golden File Filtering (CONV-03)
- **D-11:** Exclude from golden file rankings using filename-based pattern matching (cheap, no file content reading):
  - **Test files:** `.test.`, `.spec.`, `__tests__`, `__test__`, `/tests/`, `/test/`
  - **Config files:** `*.config.ts`, `*.config.js`, `.eslintrc*`, `.prettierrc*`, `tsconfig*`, `jest.config.*`, `vitest.config.*`, etc.
  - **Generated files:** `.generated.`, `.gen.`, `.pb.` (protobuf)
  - **Deprecated files:** filename contains `deprecated`, `legacy`, `obsolete`
- **D-12:** Filtering happens in two places (hybrid approach):
  1. `rankGoldenFiles()` — filter noise files from matchingFiles BEFORE density calculation
  2. `countApplicableFiles()` — extend to skip generated, config, and deprecated files (keeps "applicable" definition consistent)
- **D-13:** Safety fallback: if filtering removes ALL files, fall back to unfiltered ranking with a logged warning. Prevents empty golden files on small projects.

### Language Filtering (CONV-04)
- **D-14:** Fix cross-language density bug: golden file density must be calculated per-language. A TypeScript file's density = `TS conventions followed / total TS conventions` (not divided by ALL conventions including Python).
- **D-15:** Determine file language from extension: `.ts/.tsx/.js/.jsx` = TypeScript, `.py` = Python. Use existing `getRuleLanguage()` to determine convention language.
- **D-16:** No type change to `ConventionResult` required — language can be inferred from `ruleId` via existing `getRuleLanguage()` function.

### File-Role Classification (CONV-07)
- **D-17:** New module `src/classifier/file-role.ts` with centralized classification logic.
- **D-18:** 5 core roles: `test`, `config`, `route-handler`, `utility`, `deprecated`. Plus `general` as fallback for unclassified files.
- **D-19:** 3-tier signal chain (highest confidence first):
  1. **Filename patterns:** `.test.ts` → test, `*.config.ts` → config
  2. **Path patterns:** `/tests/` → test, `/utils/` → utility, `/routes/` or `/api/` → route-handler
  3. **Content patterns:** (optional, for ambiguous files) barrel exports → barrel, framework handler signatures → route-handler
- **D-20:** Post-filter approach: scan ALL files with all applicable rules, then filter matches by file-role applicability. Safer than pre-filtering because misclassification doesn't lose scan data.
- **D-21:** Store classification in existing `metadata` JSON column on `nodes` table: `{"role": "utility", "roleConfidence": 0.92}`. No schema migration needed.
- **D-22:** Rule-to-role applicability mapping: which rules apply to which roles. E.g., `explicit-return-type` applies to utility + route-handler but not test or config. Framework rules apply only to route-handler + middleware roles.
- **D-23:** Fallback: unclassified files get role `general` — all rules apply. No file is excluded from convention matching entirely.

### Safety & Integration Guardrails
- **D-24:** Refactor `RULE_METADATA` to a shared module imported by both `runner.ts` and `rule-filter.ts`. Eliminates the manual duplication that risks enforcement breaking when new rules are added.
- **D-25:** Cap readiness convention impact: `highConfidenceConventions` capped at `min(actual_count, totalSourceFiles)` to prevent score inflation when many framework rules produce HIGH-CONF. Add regression test: readiness doesn't jump >5% on same codebase after adding framework rules.
- **D-26:** Validate 500-token hook injection budget: test that a file matching 10+ framework conventions still fits within budget with danger zones preserved (priority 1 items never truncated).
- **D-27:** All convention consumers use canonical `parseDetectorConventions()` from `src/conventions/parser.ts`. No custom parsing in new framework code.
- **D-28:** Add CI-style validation: scan all `.yml` rule files for duplicate ruleIds, verify every ruleId has a `RULE_METADATA` entry, verify every framework rule directory matches a known framework name.

### Claude's Discretion
- Whether to make `findAllRuleFiles()` recursive in runner.ts vs calling `runAstGrepScan()` per framework directory — both achieve the same outcome
- Exact ast-grep YAML pattern syntax for each framework rule — researcher should verify against real Fastify/Express/h3 codebases
- Whether file-role classification uses confidence scores or boolean classification — confidence is nice-to-have, boolean is simpler
- Whether to add `barrel` and `middleware` as additional roles beyond the 5 required

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Convention Detection Pipeline
- `src/conventions/runner.ts` — Main convention scan logic; RULE_METADATA map; `runAstGrepScan()`, `countApplicableFiles()`, `calculateAdoption()`, `getRuleLanguage()`
- `src/conventions/golden-files.ts` — Golden file ranking by convention density; needs filtering + per-language fix
- `src/conventions/types.ts` — ConventionResult, GoldenFileEntry, ConventionScanResult types
- `src/conventions/parser.ts` — Canonical convention parser; ALL consumers must use this
- `src/conventions/rules/typescript/*.yml` — 15 existing generic TypeScript ast-grep rules (reference for new rule authoring)
- `src/conventions/rules/python/*.yml` — 3 existing Python rules

### Convention Consumers (integration points)
- `src/agents/convention-detector.ts` — Detector agent; calls `runConventionScan()`; needs framework detection integration
- `src/artifacts/convention-index.ts` — Builds injection artifact from conventions; uses canonical parser
- `src/tools/conventions.ts` — MCP tool for convention queries
- `src/enforcement/rule-filter.ts` — **DUPLICATED RULE_METADATA** (lines 17-36); must be refactored to shared module
- `src/enforcement/pre-commit-check.ts` — Resolves rule paths; must find new framework rules
- `src/hooks/session-start.ts` — Hook injection with 500-token budget

### Framework Detection
- `src/onboard/detect.ts` — Existing project detection (package.json, languages, E2E tools); extend for framework detection

### Graph Storage
- `src/graph/schema.ts` — Database schema with `metadata` JSON column on nodes table
- `src/graph/builder.ts` — Graph building; `is_test` detection pattern to extend for file roles
- `src/graph/shared-builder.ts` — Shared node/edge creation

### Readiness Scoring
- `src/bootstrap/readiness.ts` — Readiness computation using convention counts; needs inflation cap
- `src/bootstrap/orchestrator.ts` — Bootstrap orchestration; passes convention data to readiness

### Phase 17 Context (prior decisions)
- `.planning/phases/17-foundation-fixes/17-CONTEXT.md` — Canonical parser pattern, convention index format alignment

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `RULE_METADATA` map in `runner.ts` — extend with framework entries, then refactor to shared module
- `getRuleLanguage()` in `runner.ts` — determines convention language from ruleId prefix; extend for framework rules
- `countApplicableFiles()` in `runner.ts` — already skips test files; extend with config/generated/deprecated filtering
- `detectProject()` in `onboard/detect.ts` — already reads package.json; extend for framework detection
- `parseDetectorConventions()` in `conventions/parser.ts` — canonical parser all consumers use
- `metadata` JSON column in nodes table — extensible storage for file roles without schema change
- `is_test` detection pattern in `builder.ts` lines 187-190 — reference pattern for file-role detection

### Established Patterns
- Convention rules are YAML files in `src/conventions/rules/{language}/` — extend with `frameworks/{name}/`
- `runAstGrepScan()` scans a single directory of `.yml` files — either make recursive or call per directory
- Confidence thresholds: HIGH >= 80% + 10 files, MEDIUM >= 50%, LOW < 50%
- Enforcement only acts on VERIFIED conventions (learnings.md), not raw detection output
- Hook injection uses priority queue: danger zones (P1) > conventions (P2) > blast radius (P3)

### Integration Points
- `runConventionScan()` signature needs `detectedFrameworks?: string[]` parameter
- `rankGoldenFiles()` needs filtering predicate + per-language density logic
- `RULE_METADATA` lives in runner.ts but is duplicated in rule-filter.ts — single source needed
- Convention detector → conventions.md → parser → index/tools/enforcement/hooks chain

</code_context>

<specifics>
## Specific Ideas

- Framework rules should be tested against actual Fastify and h3 codebases (the same ones used in v2.1 eval comparison testing)
- Readiness stability test: run bootstrap before and after Phase 18 on same codebase, verify delta < 5%
- Hook budget test: create fixture file matching 10+ conventions, verify injection stays under 500 tokens
- Rule duplication check: automated validation that all .yml ruleIds are unique and have metadata entries

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 18-semantic-conventions*
*Context gathered: 2026-03-30*
