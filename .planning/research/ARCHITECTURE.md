# Architecture Patterns

**Domain:** v2.1 Eval Fixes & Real-World Quality -- Integration Architecture
**Researched:** 2026-03-30
**Confidence:** HIGH (based on direct source code analysis of all affected modules)

## Current Architecture Overview

CodeScope's architecture follows a layered pipeline pattern with strict isolation boundaries:

```
Bootstrap Pipeline:
  Scout -> Researcher -> ConventionDetector -> RiskAnalyzer -> LearningSynthesizer
       -> Synthesis -> Readiness -> InjectionArtifacts -> Metadata

Runtime Pipeline:
  PreToolUse hook -> [reads injection JSON] -> injects context
  PostToolUse hook -> [reads injection JSON] -> reminds conventions

MCP Server:
  15 tools -> graph queries, conventions, blast radius, review, eval
```

### Critical Isolation Boundary

Hook scripts (`src/hooks/`) have ZERO imports from `src/graph/`, `src/tools/`, `src/parser/`, or any module that transitively imports `better-sqlite3/graphology/web-tree-sitter`. They read pre-computed JSON artifacts only. This boundary MUST be preserved in v2.1.

---

## v2.1 Feature Integration Map

### Feature 1: Fix Import Graph (ESM + CommonJS)

**Root Cause Analysis:**

The parser (`src/parser/extract.ts` lines 570-593) only handles `import_statement` in the top-level TS/JS switch. CommonJS `require()` calls are `call_expression` nodes nested inside `variable_declaration` or `expression_statement` -- never matched. Dynamic imports (`import("...")`) are also `call_expression` nodes and equally missed.

The graph builder (`src/graph/builder.ts` lines 260-317) correctly processes whatever `parseResult.imports` contains. The builder is NOT the problem -- it faithfully resolves and creates edges for every ImportInfo in the parse result. The bug is upstream: the parser returns an empty imports array for CommonJS codebases.

**Modules to MODIFY:**

| Module | File | Change | Risk |
|--------|------|--------|------|
| Parser extract | `src/parser/extract.ts` | Add `extractTSRequire()` for `call_expression` where callee is `require`. Add to switch cases for `expression_statement` and `variable_declaration` (children may contain require). Must also handle `const foo = require("bar").something` patterns. | MEDIUM -- core parser change affects all downstream consumers |
| Parser extract | `src/parser/extract.ts` | Add dynamic `import()` extraction: `call_expression` where function is `import`. Map to ImportInfo with `isDynamic: true` flag. | LOW -- additive |
| ImportInfo type | `src/parser/extract.ts` | Add optional `isDynamic?: boolean` and `isRequire?: boolean` fields to ImportInfo interface | LOW -- backward compatible |

**Modules to VERIFY but NOT modify:**

| Module | File | Why verify |
|--------|------|-----------|
| Graph builder | `src/graph/builder.ts` | Already handles ImportInfo correctly -- just confirm edge creation works for newly-parsed require() imports |
| Incremental rebuild | `src/graph/incremental.ts` | Duplicates builder logic (lines 153-270) -- must verify it picks up new parser output. NOTE: this is a code duplication smell but not a v2.1 concern |
| Batch writer | `src/graph/batch-writer.ts` | Unchanged -- edge records are format-agnostic |
| TS resolver | `src/resolver/typescript.ts` | Enhanced-resolve already handles CommonJS resolution (`conditionNames: ["import", "require", "node", "default"]`) -- no changes needed |

**New modules:** NONE

**Data flow change:**

```
BEFORE: extract.ts -> only import_statement -> ImportInfo[] (empty for CJS)
AFTER:  extract.ts -> import_statement + call_expression(require) + call_expression(import) -> ImportInfo[]
                       (rest of pipeline unchanged)
```

**Key insight:** The graph builder, batch writer, resolver, and all downstream consumers are already correct. This is a parser-only fix with large downstream impact (graph goes from 0 edges to hundreds/thousands).

---

### Feature 2: Semantic Convention Detection

**Root Cause Analysis:**

Current convention rules (`src/conventions/rules/typescript/*.yml`) detect generic syntax patterns: async/await, named exports, arrow functions, interface vs type. These match on any TS/JS codebase identically. They miss framework-specific conventions like:
- Fastify: plugin registration pattern (`export default fp(async function plugin(fastify, opts) {...})`)
- Fastify: schema-first validation (`schema: { body: Type(...) }`)
- Express: middleware chaining (`app.use(...)`)
- h3: event handler pattern (`defineEventHandler(...)`)
- React: hooks rules, component naming
- Generic: error handling patterns specific to the framework, logging conventions

The convention detector agent (`src/agents/convention-detector.ts`) and runner (`src/conventions/runner.ts`) are framework-agnostic by design -- they scan all YAML rules in the rules directory. Adding framework-specific rules is purely additive.

**Modules to MODIFY:**

| Module | File | Change | Risk |
|--------|------|--------|------|
| Rule metadata | `src/conventions/runner.ts` | Add entries to `RULE_METADATA` map for new framework rules. Add competing pairs if applicable (e.g., fp-plugin vs manual-plugin). | LOW -- additive map entries |
| Convention types | `src/conventions/types.ts` | Add `framework?: string` field to `ConventionResult` so rules can be tagged with which framework they apply to. | LOW -- optional field, backward compatible |

**New modules:**

| Module | Location | Purpose |
|--------|----------|---------|
| Fastify rules | `src/conventions/rules/typescript/fastify-*.yml` | 3-5 YAML rules for fp plugin pattern, schema validation, decorator usage |
| Express rules | `src/conventions/rules/typescript/express-*.yml` | 2-3 YAML rules for middleware pattern, router pattern |
| h3 rules | `src/conventions/rules/typescript/h3-*.yml` | 2-3 YAML rules for defineEventHandler, createRouter |
| React rules | `src/conventions/rules/typescript/react-*.yml` | 2-3 YAML rules for hooks naming, component patterns (beyond existing functional/class) |
| Framework detector | `src/conventions/framework-detector.ts` | Reads package.json to detect frameworks, returns which rule sets to prioritize. Informs golden file ranking. |

**Data flow change:**

```
BEFORE: runConventionScan() -> scan ALL rules -> generic conventions
AFTER:  runConventionScan() -> detect frameworks from package.json
                            -> scan ALL rules (generic + framework-specific)
                            -> tag results with framework
                            -> framework-aware golden file ranking
```

**Key insight:** ast-grep rules are the right abstraction. Each framework convention is a YAML file with a tree-sitter structural pattern. No code changes needed to the scanning infrastructure -- just new rule files and metadata entries. The framework detector is the only new module, and it is simple (read package.json dependencies, return framework list).

---

### Feature 3: Fix Readiness Scoring

**Root Cause Analysis:**

`src/bootstrap/readiness.ts` line 150-156 computes convention coverage as:
```
conventionPct = (highConfidenceConventions / totalSourceFiles) * 100
```

But `highConfidenceConventions` in the orchestrator (line 357) is computed as `Math.round(totalConventions * 0.6)` -- a HARDCODED APPROXIMATION that ignores actual convention detection results. The convention detector returns actual confidence levels per convention, but the orchestrator never reads them.

Furthermore, `totalSourceFiles` on line 351 is set to `allServices.reduce((sum, s) => sum + s.loc, 0)` -- that is LINE COUNT, not file count. So convention coverage divides "number of high-confidence conventions" by "total lines of code," producing near-zero results for any real codebase.

**Modules to MODIFY:**

| Module | File | Change | Risk |
|--------|------|--------|------|
| Bootstrap orchestrator | `src/bootstrap/orchestrator.ts` | Fix readiness input: use actual file counts (not LOC), compute actual high-confidence convention count from convention detector output, compute actual test file count, compute actual import resolution stats from graph builder results. Lines 350-363 need rewrite. | MEDIUM -- central orchestrator change |
| Service result type | `src/bootstrap/orchestrator.ts` | Add `highConfidenceConventions`, `totalApplicableFiles`, `testFileCount`, `totalImports`, `resolvedImports` to the per-service result tracking (lines 221-229). | LOW -- additive fields |
| Convention detector result | `src/agents/convention-detector.ts` | Return `highConfidenceCount` in result (count conventions with confidence === "HIGH-CONF"). Currently only returns `conventionsDetected`. | LOW -- additive field |
| Graph builder result | `src/graph/builder.ts` | Already returns `edgesCreated` but does not distinguish IMPORTS from CONTAINS edges. Add `importEdgesCreated` and `totalImportsAttempted` to `BuildGraphResult`. | LOW -- additive fields |

**New modules:** NONE

**Data flow change:**

```
BEFORE: orchestrator -> hardcoded approximations -> computeReadiness()
AFTER:  orchestrator -> actual counts from convention detector + graph builder -> computeReadiness()
```

The `computeReadiness()` function itself is correct -- it just receives wrong inputs.

---

### Feature 4: Fix Golden File Ranking

**Root Cause Analysis:**

`src/conventions/golden-files.ts` ranks files by how many conventions they match out of total conventions. The problem: `conventionsApplicable` is set to `conventions.length` (total count of ALL conventions) for every file. This means a TypeScript file is penalized for not matching Python conventions, and vice versa.

Additionally, there is no filtering by file quality signals:
- Deprecated files should be excluded or penalized
- Test files should be excluded
- Generated files should be excluded
- Very small files (< 10 lines) should be excluded

**Modules to MODIFY:**

| Module | File | Change | Risk |
|--------|------|--------|------|
| Golden file ranker | `src/conventions/golden-files.ts` | Filter out test files, deprecated files (name contains `deprecated`, `legacy`, `old`), generated files. Compute `conventionsApplicable` per-language (TS files only count TS conventions). Add optional file metadata parameter for LOC filtering. | MEDIUM -- changes ranking algorithm |
| Convention result | `src/conventions/types.ts` | Already has `matchingFiles: string[]` -- no change needed, but golden-files.ts needs to know which conventions apply to which language. The `category` or a new `language` field on ConventionResult would work. | LOW -- additive |

**New modules:** NONE

---

### Feature 5: Fix Bootstrap Error Surfacing

**Root Cause Analysis:**

The graph builder (`src/graph/builder.ts` lines 312-313) catches import resolution errors and pushes them to an `errors` array, but the orchestrator never reads this array. The builder returns `BuildGraphResult.errors`, which propagates through the risk analyzer, but errors are not surfaced in the bootstrap output or written to any artifact.

Additionally, `runConventionScan()` swallows ast-grep errors (line 63-68 in convention-detector.ts) with graceful degradation, which is correct behavior, but the error message should be included in bootstrap warnings.

**Modules to MODIFY:**

| Module | File | Change | Risk |
|--------|------|--------|------|
| Bootstrap orchestrator | `src/bootstrap/orchestrator.ts` | Collect errors from convention detector (if scanError), risk analyzer (graph build errors), and include them in `warnings` array. Also log error counts in progress messages. | LOW -- additive error collection |
| Risk analyzer | `src/agents/risk-analyzer.ts` | Return graph build errors in result. | LOW -- additive field |

**New modules:** NONE

---

### Feature 6: `/codescope:eval` Skill

**Root Cause Analysis:**

The eval agent (`src/eval/eval-agent.ts`) exists and works within the pipeline (execute -> verify -> eval -> gate -> debug). But there is no standalone skill that lets a user run eval on-demand against working tree changes. This is a new skill, not a fix.

Three modes needed:
1. **pre-commit**: Score uncommitted changes against conventions
2. **post-change**: Score a specific set of changed files
3. **full-audit**: Score entire codebase conventions coverage

**Modules to MODIFY:**

| Module | File | Change | Risk |
|--------|------|--------|------|
| Eval tool | `src/tools/eval.ts` | Currently exists but may need expansion for the 3 modes. Verify current capabilities. | LOW |

**New modules:**

| Module | Location | Purpose |
|--------|----------|---------|
| Eval skill | `skills/eval/SKILL.md` | Skill definition for `/codescope:eval` with 3 mode descriptions |
| Eval runner (standalone) | `src/eval/standalone-eval.ts` | Standalone eval that reads conventions.json + golden-files, runs ast-grep on changed files, scores without requiring full verify pipeline |

**Data flow:**

```
/codescope:eval [mode]
  -> read conventions.json artifact
  -> read golden-files.md artifact
  -> identify changed files (git diff for pre-commit, explicit list for post-change, all for audit)
  -> run ast-grep rules on changed files
  -> compute convention adherence score
  -> output findings with golden file references
```

**Key insight:** This should NOT reuse the full verify -> eval pipeline. It needs a lightweight path that reads pre-computed artifacts and runs ast-grep directly. The existing `runConventionScan()` in `src/conventions/runner.ts` can be reused for the scanning, but scoped to specific files.

---

### Feature 7: Reference File Injection

**Root Cause Analysis:**

The pre-tool-use hook (`src/hooks/pre-tool-use.ts`) currently injects:
- Danger zone warnings (priority 1)
- Convention metadata -- name, adoption %, confidence (priority 2)
- Blast radius summary (priority 3)

It does NOT inject:
- Which files exemplify these conventions (golden file references)
- Specific code patterns to follow ("write like this file")

The golden files data exists in `golden-files.md` but is never consumed by the injection pipeline. The convention index (`src/artifacts/convention-index.ts`) parses `conventions.md` but uses a format (`**Convention:**`, `**Files:**`) that does NOT match the actual `conventions.md` output format (which uses `### ConventionName` with markdown tables).

**FORMAT MISMATCH BUG:** `buildConventionIndex()` in `src/artifacts/convention-index.ts` expects:
```
**Convention:** Prefer Named Exports
**Adoption:** 95%
**Confidence:** HIGH-CONF
**Category:** exports
**Files:** src/a.ts, src/b.ts
```

But `generateConventionsMarkdown()` in `src/agents/convention-detector.ts` actually writes:
```
### Prefer Named Exports

| Metric | Value |
|--------|-------|
| Adoption | 95% (48/50 files) |
| Confidence | HIGH-CONF |
...

**Evidence:**
- `src/a.ts:12` -- Named export detected
```

This means `conventions.json` is always empty (the parser finds no `**Convention:**` lines). This is the root cause of conventions not appearing in hook injection.

**Modules to MODIFY:**

| Module | File | Change | Risk |
|--------|------|--------|------|
| Convention index builder | `src/artifacts/convention-index.ts` | Rewrite `parseConventions()` to match actual conventions.md format: parse `### Name` headers, markdown table rows for Adoption/Confidence/Category, and `**Evidence:**` entries for file references. | HIGH -- fixes a broken pipeline that currently produces empty results |
| Convention index builder | `src/artifacts/convention-index.ts` | Add golden file references to the index: read `golden-files.md`, parse rankings, include `goldenFiles: string[]` at top level of ConventionIndex. | MEDIUM -- new data in existing artifact |
| Artifact types | `src/artifacts/types.ts` | Add `goldenFiles?: string[]` to ConventionIndex. Add `referenceFile?: string` to ConventionFileEntry (the best exemplar file for that convention). | LOW -- additive fields |
| Hook types (duplicated) | `src/hooks/lib/types.ts` | Mirror any ConventionIndex/ConventionFileEntry changes here (build isolation requires duplication). | LOW -- must stay in sync |
| Pre-tool-use hook | `src/hooks/pre-tool-use.ts` | Add priority 2.5 injection item: "Reference: write like `golden-file.ts`" when editing a file that has conventions. Pull golden file path from convention index. | MEDIUM -- changes injection content |

**New modules:**

| Module | Location | Purpose |
|--------|----------|---------|
| Golden file index | `src/artifacts/golden-file-index.ts` | Parses golden-files.md into structured JSON for hook consumption. Alternative: fold into convention-index.ts. |

**Data flow change:**

```
BEFORE: conventions.md -> parseConventions() [FORMAT MISMATCH] -> empty conventions.json -> hooks see nothing
AFTER:  conventions.md -> fixed parser -> populated conventions.json with file lists + golden refs -> hooks inject reference files
```

---

### Feature 8: Post-Edit Convention Validation

**Root Cause Analysis:**

The post-tool-use hook (`src/hooks/post-tool-use.ts`) currently only reminds Claude of conventions (advisory text). It does NOT:
- Read the edited file content
- Run any validation against conventions
- Detect specific pattern deviations
- Flag wrong type names or missing patterns

True post-edit validation requires running ast-grep on the just-written content. But hooks have the build isolation constraint -- they cannot import ast-grep or heavy dependencies.

**Architecture Decision: Two-tier approach.**

1. **Hook layer (lightweight):** Enhanced PostToolUse hook reads the written content from `tool_input.content` (for Write) or computes new content from `tool_input.old_string`/`new_string` (for Edit). Performs simple string-based checks: file naming conventions, import style consistency, export pattern matching. No ast-grep.

2. **MCP tool layer (full power):** New `codescope_validate_edit` tool that the eval skill or pipeline can call. This runs ast-grep on the specific file, compares against conventions, returns findings. Not called by hooks -- called by agents.

**Modules to MODIFY:**

| Module | File | Change | Risk |
|--------|------|--------|------|
| Post-tool-use hook | `src/hooks/post-tool-use.ts` | Add lightweight content validation: check if written content follows naming conventions from conventions.json (e.g., export style matches dominant pattern). Read `tool_input.content` or compute from edit operations. Report violations as additionalContext. | MEDIUM -- adds validation logic to critical-path hook |
| Hook types | `src/hooks/lib/types.ts` | HookInput already has `tool_input.content`, `tool_input.old_string`, `tool_input.new_string` -- no changes needed. | NONE |

**New modules:**

| Module | Location | Purpose |
|--------|----------|---------|
| Edit validator | `src/hooks/lib/edit-validator.ts` | Lightweight content checks within build isolation. Pattern-matches against convention rules without ast-grep. |
| Validate edit tool | `src/tools/validate-edit.ts` | Full ast-grep-powered validation MCP tool. Runs targeted convention scan on a single file. |

**Data flow:**

```
PostToolUse hook (lightweight):
  tool_input.content -> edit-validator.ts -> string-based pattern checks -> additionalContext warning

codescope_validate_edit tool (full power):
  file_path -> ast-grep scan with convention rules -> convention adherence score + specific violations
```

---

## Component Dependency Graph

```
Feature dependencies (must build in this order):

1. Import Graph Fix (parser)
   |
   +-- no dependencies on other v2.1 features
   |
   +-- unlocks: correct graph edges -> correct blast radius -> correct readiness scoring

2. Convention Index Format Fix (artifact)
   |
   +-- no dependencies on other v2.1 features
   |
   +-- unlocks: populated conventions.json -> hook injection works -> reference file injection

3. Semantic Convention Detection (rules)
   |
   +-- no dependencies on other v2.1 features (additive rules)
   |
   +-- enhances: convention index, readiness scoring, golden file ranking

4. Golden File Ranking Fix
   |
   +-- benefits from: semantic conventions (better ranking with framework rules)
   |   but works independently (fixes generic ranking too)

5. Readiness Scoring Fix (orchestrator)
   |
   +-- depends on: import graph fix (for correct import counts)
   |   depends on: convention detector returning real counts
   |
   +-- should come after features 1 and 3

6. Bootstrap Error Surfacing
   |
   +-- depends on: import graph fix (to verify errors surface correctly)
   |   but is independently implementable

7. Reference File Injection
   |
   +-- depends on: convention index format fix (feature 2)
   |   depends on: golden file ranking fix (feature 4)
   |
   +-- must come after features 2 and 4

8. Post-Edit Convention Validation
   |
   +-- depends on: convention index format fix (feature 2)
   |   depends on: reference file injection (feature 7) for consistency

9. /codescope:eval Skill
   |
   +-- depends on: semantic conventions (feature 3) for meaningful eval
   |   depends on: convention index format fix (feature 2) for artifact reading
   |
   +-- can be built in parallel with features 7 and 8

10. Plugin Distribution Fix
    |
    +-- independent of all other features
    |
    +-- can be done at any point
```

## Recommended Build Order

Based on the dependency graph above:

```
Phase 1: Foundation Fixes (no inter-dependencies)
  1a. Fix import graph (parser/extract.ts)          -- unblocks everything downstream
  1b. Fix convention index format (convention-index.ts) -- unblocks hook injection
  1c. Fix plugin distribution                       -- independent, can parallel
  1d. Fix bootstrap error surfacing                 -- independent, small

Phase 2: Quality Improvements (depend on Phase 1)
  2a. Semantic convention detection (new YAML rules) -- adds framework rules
  2b. Fix golden file ranking                        -- uses convention data
  2c. Fix readiness scoring                          -- uses import + convention data

Phase 3: New Capabilities (depend on Phases 1+2)
  3a. Reference file injection (hooks)               -- needs conventions.json populated
  3b. Post-edit convention validation                 -- needs conventions.json populated
  3c. /codescope:eval skill                          -- needs conventions, golden files
```

## Patterns to Follow

### Pattern 1: Parser Extension via Switch Case Addition

**What:** Adding new AST node types to the parser's switch statement.
**When:** Extracting new syntactic constructs (require(), dynamic import).
**Why:** The parser uses a single-pass top-level node walker. New node types go in the switch.

```typescript
// In extractFromSource() TS/JS section, add to switch:
case "expression_statement": {
  // Check for require() calls: const foo = require("bar")
  const requireImport = extractTSRequire(node);
  if (requireImport) result.imports.push(requireImport);
  break;
}
```

**Critical caveat:** The current parser only walks `root.childCount` (top-level nodes). Require calls inside functions would need recursive walking or a different strategy. For v2.1, top-level require() is sufficient -- CommonJS modules typically have all requires at file top level.

### Pattern 2: Additive YAML Rule Files

**What:** Adding convention detection rules as standalone YAML files.
**When:** Detecting new framework-specific patterns.
**Why:** No code changes needed -- the runner scans all .yml files in the rules directory.

```yaml
# src/conventions/rules/typescript/fastify-plugin-pattern.yml
id: fastify-plugin-pattern
language: TypeScript
rule:
  any:
    - pattern: "export default fp($PLUGIN)"
    - pattern: "export default fp($PLUGIN, $OPTS)"
    - pattern: "module.exports = fp($PLUGIN)"
severity: info
message: "Fastify plugin registration pattern detected"
```

**Key:** Add corresponding entry to `RULE_METADATA` in `runner.ts` and optionally to `COMPETING_PAIRS`.

### Pattern 3: Artifact Type Extension with Build Isolation Sync

**What:** Adding fields to artifact types.
**When:** Enriching injection data for hooks.
**Why:** Types are duplicated between `src/artifacts/types.ts` and `src/hooks/lib/types.ts`.

```
1. Add field to src/artifacts/types.ts
2. Mirror EXACTLY to src/hooks/lib/types.ts (build isolation copy)
3. Add field population in the artifact builder (src/artifacts/*.ts)
4. Add field consumption in the hook (src/hooks/*.ts)
```

**Critical:** Never skip step 2. The types MUST stay in sync manually.

### Pattern 4: Hook Validation Within Build Isolation

**What:** Adding validation logic to hooks without importing heavy modules.
**When:** Post-edit checks, content validation.
**Why:** Hooks cannot import better-sqlite3, graphology, web-tree-sitter, or ast-grep.

Acceptable in hooks:
- `node:fs`, `node:path`, `node:process`
- String matching, regex
- JSON parsing of pre-computed artifacts
- Files within `src/hooks/lib/`

NOT acceptable in hooks:
- Tree-sitter parsing
- ast-grep scanning
- Database queries
- Graph traversal

## Anti-Patterns to Avoid

### Anti-Pattern 1: Duplicating Builder Logic in Incremental

**What:** `src/graph/incremental.ts` lines 120-270 duplicate `src/graph/builder.ts` lines 150-317 nearly verbatim.
**Why bad:** Parser changes (like adding require() support) must be applied in BOTH places. Easy to miss one.
**Instead:** Extract shared `buildFileGraph(parseResult, relPath, lang, writer)` function callable by both builder and incremental. This is a v2.1 opportunity to fix during the import graph work.

### Anti-Pattern 2: Hardcoded Approximations in Orchestrator

**What:** `src/bootstrap/orchestrator.ts` lines 351-363 use hardcoded multipliers (`* 0.6`, `* 0.9`, `* 0.2`) instead of actual data.
**Why bad:** Readiness scores are meaningless fabrications. Users see grades that do not reflect reality.
**Instead:** Thread actual counts from agent results through to readiness computation.

### Anti-Pattern 3: Format Mismatch Between Writer and Reader

**What:** `convention-index.ts` parses a format (`**Convention:**`) that `convention-detector.ts` does not write (uses `### Name` + tables).
**Why bad:** Convention injection silently produces empty results. No error, no warning.
**Instead:** Either change the parser to match the actual format, or change the writer. Changing the parser is safer (writer format is already established across versions).

### Anti-Pattern 4: Swallowing Errors Without Surfacing

**What:** Bootstrap orchestrator ignores errors from graph builder, convention detector returns error count but not details.
**Why bad:** Users get "0 edges" with no explanation. Debugging requires reading source code.
**Instead:** Collect errors in bootstrap warnings. Show counts in progress messages. Write errors to an artifact for debugging.

## Module Modification Summary

### Files that need MODIFICATION (14 files):

| File | Changes | Complexity |
|------|---------|------------|
| `src/parser/extract.ts` | Add require() and dynamic import() extraction | HIGH |
| `src/graph/builder.ts` | Add import edge tracking counts (additive) | LOW |
| `src/graph/incremental.ts` | Must pick up parser changes (or refactor to share code) | MEDIUM |
| `src/conventions/runner.ts` | Add RULE_METADATA entries for framework rules | LOW |
| `src/conventions/types.ts` | Add optional `framework` field to ConventionResult | LOW |
| `src/conventions/golden-files.ts` | Filter deprecated/test/generated files, per-language counts | MEDIUM |
| `src/agents/convention-detector.ts` | Return highConfidenceCount | LOW |
| `src/bootstrap/orchestrator.ts` | Fix readiness inputs, collect errors | MEDIUM |
| `src/artifacts/convention-index.ts` | Rewrite parser to match actual conventions.md format | HIGH |
| `src/artifacts/types.ts` | Add goldenFiles, referenceFile fields | LOW |
| `src/hooks/lib/types.ts` | Mirror artifact type changes (build isolation) | LOW |
| `src/hooks/pre-tool-use.ts` | Add golden file reference injection | MEDIUM |
| `src/hooks/post-tool-use.ts` | Add lightweight content validation | MEDIUM |
| `src/tools/eval.ts` | Expand for standalone eval modes | LOW |

### Files to CREATE (new modules, ~10-15 files):

| File | Purpose | LOC Estimate |
|------|---------|-------------|
| `src/conventions/rules/typescript/fastify-*.yml` (3-5 files) | Framework-specific rules | ~50 total |
| `src/conventions/rules/typescript/express-*.yml` (2-3 files) | Framework-specific rules | ~30 total |
| `src/conventions/rules/typescript/h3-*.yml` (2-3 files) | Framework-specific rules | ~30 total |
| `src/conventions/framework-detector.ts` | Package.json framework detection | ~80 |
| `src/hooks/lib/edit-validator.ts` | Lightweight content validation | ~120 |
| `src/tools/validate-edit.ts` | Full ast-grep validation MCP tool | ~150 |
| `src/eval/standalone-eval.ts` | Standalone eval runner | ~200 |
| `skills/eval/SKILL.md` | Eval skill definition | ~50 |
| `src/artifacts/golden-file-index.ts` | Golden file artifact builder (or fold into convention-index) | ~80 |

### Files that are UNCHANGED but verified correct:

| File | Reason |
|------|--------|
| `src/resolver/typescript.ts` | Already handles CJS resolution |
| `src/resolver/python.ts` | No changes for v2.1 |
| `src/graph/schema.ts` | No schema changes needed |
| `src/graph/database.ts` | No changes needed |
| `src/graph/batch-writer.ts` | Format-agnostic, works with any edge type |
| `src/graph/cache.ts` | No changes needed |
| `src/bootstrap/readiness.ts` | Logic is correct -- inputs from orchestrator are the problem |
| `src/hooks/lib/artifact-reader.ts` | Reads whatever JSON is there, no format assumptions |
| `src/hooks/lib/budget-composer.ts` | Priority queue works with new injection items |

## Scalability Considerations

| Concern | Current (v2.0) | After v2.1 | Notes |
|---------|---------------|------------|-------|
| Parse time per file | ~2ms (import_statement only) | ~3ms (+ require + dynamic import walk) | Negligible increase |
| Convention rules | 18 rules | ~30 rules | Linear scan, each rule is a separate sg invocation -- may want batching |
| Convention index size | ~0 bytes (empty due to format bug) | ~50-200KB depending on codebase | Well within JSON read budget |
| Hook execution time | <50ms | <50ms (still just JSON reads + string ops) | Build isolation preserved |
| Bootstrap time | <5 min for 100K LOC | Slight increase from more rules | Monitor, may need rule batching |

## Sources

- Direct source code analysis of all listed files (HIGH confidence)
- CodeScope PROJECT.md for architectural constraints (HIGH confidence)
- CLAUDE.md for technology stack constraints (HIGH confidence)
- ast-grep documentation for YAML rule syntax (HIGH confidence)
- Enhanced-resolve source for CJS resolution capability verification (HIGH confidence)
