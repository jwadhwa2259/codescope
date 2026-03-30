# Pitfalls Research

**Domain:** CodeScope v2.1 -- Eval Fixes & Real-World Quality (CommonJS parsing, semantic convention detection, reference file injection, post-edit validation)
**Researched:** 2026-03-30
**Confidence:** HIGH (grounded in CodeScope's actual source code, v2.1 eval failures on Fastify/h3, and verified against tree-sitter grammar specs and ast-grep documentation)

**Scope:** Pitfalls specific to adding CommonJS `require()` parsing, fixing ESM edge creation, semantic framework-aware convention detection, reference file injection, and post-edit convention validation to the existing CodeScope v2.0 system (33,657 LOC).

**Note:** v1.0 pitfalls (sub-agent file content blindness Issue #5812, context:fork silently ignored Issue #17283, web-tree-sitter memory leaks) and v2.0 pitfalls (auto-injection context bloat, incremental graph corruption, hook build isolation) remain valid. This document covers NEW pitfalls for v2.1 features.

---

## Critical Pitfalls

### Pitfall 1: Parser Only Matches `import_statement` Nodes -- All CommonJS `require()` Calls Silently Ignored

**What goes wrong:**
The current `extractFromSource()` in `src/parser/extract.ts` only matches `import_statement` AST nodes at the root level of the file (line 572: `case "import_statement"`). CommonJS `require()` calls produce `call_expression` nodes in tree-sitter-javascript, not `import_statement` nodes. This is the confirmed root cause of the Fastify eval producing 0 import edges -- every `require()` call was silently skipped. The parser returns an empty `imports[]` array for any CommonJS file.

**Why it happens:**
The parser was written for ESM-first TypeScript (CodeScope's own stack). In tree-sitter-javascript, `require('mod')` parses as a `call_expression` with an `identifier` child (text="require") and an `arguments` child containing a `string` literal. This is a completely different AST shape from `import_statement`. The root-level switch/case simply has no handler for `call_expression`.

**How to avoid:**
1. Add `call_expression` handling to the TS/JS branch of `extractFromSource()`. Check if the function child is an `identifier` with text "require" and the first argument is a string literal.
2. Handle these CommonJS-specific patterns, all of which appear as root-level statements wrapping `call_expression`:
   - `const x = require('mod')` -- `lexical_declaration` > `variable_declarator` > `call_expression`
   - `const { a, b } = require('mod')` -- destructured, same nesting
   - `module.exports = require('mod')` -- `expression_statement` > `assignment_expression` > `call_expression`
   - `require('mod')` -- bare `expression_statement` > `call_expression`
3. Do NOT add a full recursive AST walk. Target depth-2 extraction from `variable_declarator.value` and `expression_statement` children.
4. If the argument to `require()` is not a string literal (it is a variable, concatenation, or template literal), log it as unresolvable and move on. Do not crash or attempt resolution.

**Warning signs:**
- Bootstrap on a CommonJS project produces 0 import edges (this already happened with Fastify)
- `buildGraph()` result shows `edgesCreated: 0` or only CONTAINS edges
- Readiness score shows "Import Graph Health: 0%" on a working project

**Phase to address:**
Phase 1 (Import Graph Fix) -- foundational blocker. Without import edges, blast radius, danger zones, and all downstream features produce empty/useless results.

---

### Pitfall 2: `require()` Calls Nested Inside Variable Declarations Are Invisible at Root Level

**What goes wrong:**
Even after adding `call_expression` handling, the most common CommonJS pattern -- `const foo = require('bar')` -- will be missed if the code only checks root children for `call_expression` nodes. The root child is `lexical_declaration` or `variable_declaration`, not `call_expression`. The `call_expression` is buried two levels deep: `lexical_declaration` > `variable_declarator` > (value=)`call_expression`.

**Why it happens:**
ESM `import` statements are always top-level by language spec -- they cannot appear inside blocks. The parser architecture was designed around this constraint: iterate root children, match by node type. CommonJS `require()` is just a function call and can appear at any nesting depth. The most common pattern wraps it in a variable declaration, which IS a root child but whose `call_expression` is not.

**How to avoid:**
Extend the existing `lexical_declaration` and `variable_declaration` handlers (currently lines 586-589 in extract.ts) to also check if any `variable_declarator` child has a `call_expression` value where the function is `require`:
1. For each `variable_declarator` child, check `child.childForFieldName("value")`
2. If the value is a `call_expression` whose function child is `identifier` with text "require"
3. Extract the source from the first argument (a `string` node)
4. This reuses the existing root-level iteration without needing a recursive walk

**Warning signs:**
- Parser extracts 0 requires from a file that clearly has `const x = require('y')` at the top
- Edge count is dramatically lower than expected (Fastify has ~100+ internal requires)

**Phase to address:**
Phase 1 (Import Graph Fix) -- same code change as Pitfall 1.

---

### Pitfall 3: ESM Import Extraction Works But Edge Creation Silently Fails -- 0 Edges Even on Pure ESM Projects

**What goes wrong:**
The v2.1 eval showed that h3 (a pure ESM TypeScript project) also produced 0 edges. The parser correctly extracts `import_statement` nodes into `ImportInfo[]`, but `buildGraph()` fails to create IMPORTS edges. The import resolution step (`resolveTypeScriptImport()`) returns `null` for every import, and the error is caught silently in a try/catch (line 312 in builder.ts), pushed to an errors array that nobody reads.

**Why it happens:**
Edge creation depends on `createTypeScriptResolver()` finding a `tsconfig.json` and `resolveTypeScriptImport()` succeeding with the configured resolver. Failure modes include:
- No tsconfig.json in the project (many JS projects, some TS projects with only `jsconfig.json`)
- tsconfig paths pointing to non-standard locations
- Project using `package.json` "exports" field with conditions not in the resolver's `conditionNames`
- enhanced-resolve's `CachedInputFileSystem` cache timing out on slow filesystems
- Symlink resolution mismatch: `fs.realpathSync()` resolves to `/private/var/...` on macOS but enhanced-resolve returns `/var/...`

**How to avoid:**
1. Add a post-build sanity check: if `edgesCreated === 0` and `filesProcessed > 5`, emit a prominent WARNING (not just a buried error array entry). Zero edges on a multi-file project is always wrong.
2. Add a fallback resolver: when enhanced-resolve fails, try naive relative path resolution (`path.resolve(dirname, importSource)` with extension probing `.ts`, `.js`, `.tsx`, `/index.ts`, `/index.js`). This catches `./foo` imports even without tsconfig.
3. Surface resolver errors prominently in bootstrap output: "Import resolution failed for 47/52 imports. Check tsconfig.json configuration."
4. Test against projects without tsconfig.json. Fastify has none. Many JavaScript projects have none.
5. Handle the macOS symlink issue: normalize both the project root AND resolved paths through `fs.realpathSync()` before computing relative paths. The current code does this for projectRoot (line 119 in builder.ts) but verify it is consistent throughout.

**Warning signs:**
- `edgesCreated: 0` with `filesProcessed: N > 0`
- Builder errors array contains "Import resolution failed" entries that scroll off screen
- Readiness report shows 0% import graph health on a project that clearly works

**Phase to address:**
Phase 1 (Import Graph Fix) -- arguably more critical than CommonJS support because it affects the supposedly-working ESM path.

---

### Pitfall 4: Convention Rules Detect Language Features, Not Framework Patterns -- Useless on Real Codebases

**What goes wrong:**
The current 18 convention rules in `src/conventions/rules/` detect generic syntax patterns: "uses async/await," "uses named exports," "uses interface vs type." On Fastify, these rules correctly report that most files use `module.exports` -- but that is not a meaningful convention for a CommonJS project. Every CommonJS file uses `module.exports` by definition. The convention detector reports obvious language features as "conventions," providing zero value over what a developer already knows.

Framework-specific conventions that actually matter are missed entirely:
- **Fastify:** plugin function signature (`module.exports = function(fastify, opts, done)` or `module.exports = async function(fastify, opts)`), decorator patterns, schema validation, route registration via `fastify.register()`
- **Express:** middleware signature `(req, res, next)`, error middleware `(err, req, res, next)`, `router.use()` patterns
- **React:** hook naming `use*`, component return JSX patterns, custom hook return shapes

**Why it happens:**
Convention rules are pure structural patterns matching AST shapes. They have zero awareness of what framework the project uses. The rule set was designed to be universal -- but universal rules produce generic findings that no developer finds useful.

**How to avoid:**
1. Add a framework detection step: parse `package.json` dependencies for known frameworks. This is a simple JSON parse, not AI-powered.
2. Create framework-specific rule sets alongside generic rules. For Fastify: detect plugin function signatures, schema validation, decorator patterns. Load these rules only when the framework is detected.
3. Weight framework-specific conventions higher than generic ones in golden file ranking and convention reporting.
4. Include the detected framework in convention output so downstream features (reference file injection, eval) can make framework-aware decisions.
5. Start with rules for the top 5 frameworks by npm downloads: React, Express, Next.js, Fastify, Nest.js. Each needs 3-5 rules covering the framework's core patterns.

**Warning signs:**
- Convention report shows only generic patterns like "Async/Await Functions" on a framework-heavy project
- Convention report is nearly identical across two completely different frameworks
- Eval skill cannot distinguish framework-correct code from framework-incorrect code
- Golden files are ranked by generic convention density, not framework-pattern density

**Phase to address:**
Phase 2 (Semantic Convention Detection) -- depends on package.json parsing for framework detection (independent of import graph).

---

### Pitfall 5: Over-Fitting Conventions to One File Type -- Flagging Utilities for Not Being Route Handlers

**What goes wrong:**
When adding semantic convention detection, there is a temptation to create framework rules that match the dominant pattern and flag everything else as deviations. But codebases have legitimate structural variation: utility files differ from route handlers, configuration files differ from business logic, entry points differ from library code. A "plugin function signature" rule applied to `src/utils/hash.ts` is a false positive.

**Why it happens:**
Convention detection operates on a flat file list. The current `countApplicableFiles()` in `runner.ts` excludes test files (`.test.`, `.spec.`, `__tests__`) but does not distinguish config files, entry points, type declarations, generated files, or utilities from domain files. All non-test source files are treated as equally relevant to every convention rule.

**How to avoid:**
1. Add file-role classification: entry points (`require.main === module` or `app.listen()`), config files (exporting plain objects/constants), type declarations (`.d.ts`), generated files (`@generated` or `AUTO-GENERATED` comments), utilities vs. domain files.
2. Make convention rules specify applicable file roles. A "plugin function signature" rule should only apply to files likely to be plugins (detected by their registration pattern or directory placement).
3. Keep the 10-file minimum threshold for reporting conventions. Consider raising it for framework-specific rules since framework conventions should appear in many files to be meaningful.
4. Report adoption percentage relative to the applicable subset, not the entire codebase. "80% of route handlers follow this pattern" is actionable; "15% of all files" is misleading.

**Warning signs:**
- Convention adoption percentages are always very low (10-20%) because the denominator includes all files
- Many false positives flagging utility files for not following route-handler patterns
- Golden file ranking promotes config files that happen to match several generic rules
- False positive rate exceeds the <5% target constraint

**Phase to address:**
Phase 2 (Semantic Convention Detection) -- file-role classification is a prerequisite for accurate framework-specific rules.

---

### Pitfall 6: Reference File Injection Suggests Deprecated, Generated, or Irrelevant Files

**What goes wrong:**
The golden file ranking system (`src/conventions/golden-files.ts`) ranks files by convention density -- `conventionsFollowed / totalConventions`. This purely quantitative ranking has no concept of file quality, recency, or task relevance. It promotes:
- Deprecated files (still in repo, superseded by newer implementations)
- Files with high convention density but wrong domain (suggesting a database utility as reference for an HTTP handler)
- Tiny files (under 10 lines) that trivially match all applicable rules
- Generated files or boilerplate following patterns mechanically
- `index.ts` barrel files that re-export everything (high export convention matches)

**Why it happens:**
Convention density correlates weakly with "good reference file." The ranking does not consider: file size (tiny files score artificially high), git recency, path relevance to the task, deprecation markers, or semantic similarity to what the user is building.

**How to avoid:**
1. Add negative signals: exclude files containing `@deprecated`, `DEPRECATED`, `_deprecated` in name, `legacy` in path. Exclude generated files (`@generated`, `auto-generated`). Exclude `.d.ts` type declaration files. Exclude `index.ts` barrel files. Exclude files in `__mocks__/`, `__fixtures__/`.
2. Add task-relevance filtering: when suggesting references for a specific task, filter to files in the same directory subtree or with similar structural patterns. A reference for writing `src/routes/users.ts` should come from `src/routes/`, not `src/utils/`.
3. Add a minimum file size threshold (20+ lines). Files under 20 lines are too small to be meaningful exemplars.
4. Weight by import graph centrality: files imported by many others are more likely to be canonical patterns than leaf files.

**Warning signs:**
- Reference suggestions include files with "deprecated" in the name
- Suggested references are in completely different directory subtrees from the target
- Very short files (5-10 lines) appear as top golden files
- Users consistently ignore reference suggestions

**Phase to address:**
Phase 5 (Reference File Injection) -- depends on Phase 2 (semantic conventions) for better ranking signals, and Phase 1 (import graph) for centrality-based weighting.

---

### Pitfall 7: Reference File Content Blows the 500-Token Hook Budget

**What goes wrong:**
The hook injection system has a strict 500-token budget (`MAX_TOKENS = 500` in `budget-composer.ts`). Reference file content is typically 50-200 lines (1,000-5,000 tokens). Injecting actual file content through the PreToolUse hook would immediately exhaust the budget, leaving no room for danger zone warnings, conventions, or blast radius information. If the budget is expanded, hook latency increases and Claude's context fills with reference content on every Edit operation.

**Why it happens:**
The 500-token budget was designed for metadata summaries (convention names, risk scores, file paths), not for source code content. Reference file injection is fundamentally different -- it needs actual code, not metadata.

**How to avoid:**
1. Do NOT inject reference file content through the PreToolUse/PostToolUse hook system. Hooks are for lightweight metadata.
2. Make reference file injection a deliberate MCP tool action. Create a `codescope_suggest_reference` tool that Claude calls when starting a file creation task, separate from the per-Edit hooks.
3. If auto-injection is desired, inject only the reference file path and a one-line description: "Write this like src/routes/health.ts (Fastify route handler pattern)." Let Claude read the file itself.
4. If a separate "reference context" budget is needed, make it independent of the 500-token metadata budget and only inject when reference files are actually relevant (new file creation, not edits to existing files).

**Warning signs:**
- Hook output is truncated, losing danger zone warnings because reference content consumed the budget
- Hook latency exceeds 50ms target when reference content is included
- Claude's context fills with repeated reference file content on sequential Edit operations
- Budget composer drops priority-1 danger zone warnings because reference content was priority-1 too

**Phase to address:**
Phase 5 (Reference File Injection) -- requires an architectural decision: MCP tool approach vs. hook injection approach. The MCP tool approach is strongly recommended.

---

### Pitfall 8: Post-Edit Validation Calibration -- Too Strict Blocks Valid Code, Too Lenient Misses Real Issues

**What goes wrong:**
Post-edit convention validation must check if a just-written file follows detected conventions. The calibration problem is severe:
- **Too strict:** Flags a utility file for not following route-handler conventions. Flags a test helper for not having explicit return types. Flags a config file for not using async/await.
- **Too lenient:** A new route handler uses callback-style instead of the project's async/await convention, but validation does not catch it because it only checks generic patterns.
- **Trust erosion:** If validation produces 3 false positives in a row, users disable it permanently. Trust is very hard to rebuild.

**Why it happens:**
The <5% false positive target is achievable for HIGH-CONF conventions (80%+ adoption, 10+ files) but extremely difficult for MEDIUM-CONF and LOW-CONF ones. The current pre-commit enforcement (`pre-commit-check.ts`) only runs VERIFIED conventions. But post-edit validation needs to run during the session, before commit, potentially on unverified conventions. The trust threshold for real-time feedback is much higher than for batch checks.

**How to avoid:**
1. Only validate HIGH-CONF conventions (80%+ adoption, 10+ files) during post-edit. MEDIUM and LOW confidence conventions should appear in reports but never trigger real-time warnings.
2. Apply file-role filtering (Pitfall 5): only check conventions applicable to the file's role. Do not check route conventions on utility files.
3. Make validation output purely advisory: "This file does not follow the project's async/await convention." No blocking behavior. The eval skill handles scoring.
4. Implement dismissal: if the user proceeds after a warning, do not warn again for the same convention on the same file in the same session.
5. Rate-limit validation: do not validate on every Edit. Validate on file completion (when Claude moves to a new file or the task completes). This also avoids performance overhead.

**Warning signs:**
- Users report "CodeScope keeps warning me about things that are fine"
- Validation warnings appear on every Edit operation, creating noise fatigue
- False positive rate exceeds 5% on eval codebases (Fastify, h3)
- Users disable post-edit validation within the first week of use

**Phase to address:**
Phase 6 (Post-Edit Validation) -- depends on Phase 2 (accurate conventions) and Phase 5 (reference files for knowing what "correct" looks like).

---

### Pitfall 9: Circular CommonJS `require()` Inflates Graph Metrics and May Hang BFS

**What goes wrong:**
Node.js handles circular CommonJS requires by returning a partially-constructed module object. File A requires file B, file B requires file A -- B gets whatever A has exported at the point of the `require()` call. The import graph correctly shows A->B and B->A edges, creating a cycle. Graph algorithms (centrality, blast radius BFS) may treat these as full bidirectional dependencies, inflating both files' metrics. If BFS does not track visited nodes, it loops infinitely.

**Why it happens:**
Static analysis of `require()` statements cannot determine that a circular require results in a partial module. Both `require('./a')` and `require('./b')` resolve to valid paths, so both edges are created with equal weight. The current graphology BFS (`graphology-traversal`) does track visited nodes (so it will not loop), but edge weights and centrality calculations treat all edges equally.

**How to avoid:**
1. After all edges are collected, run a cycle detection pass. Mark edges participating in cycles with a metadata flag (`is_circular: true`).
2. Do NOT try to determine which direction is "primary" -- that requires runtime analysis. Instead, document cycles in the readiness report as a code quality concern.
3. Verify that graphology-traversal BFS handles cycles correctly with a specific test case (circular graph with 3+ nodes).
4. Consider reducing edge weight for cycle-participating edges so they contribute less to centrality.

**Warning signs:**
- Blast radius computation takes unexpectedly long on codebases with circular deps
- Files in circular dependency chains show artificially high centrality (they are not actually more important than non-circular files)
- Readiness report does not mention circular dependencies at all

**Phase to address:**
Phase 1 (Import Graph Fix) -- cycle detection should be part of edge creation, not deferred.

---

### Pitfall 10: Plugin Marketplace Recursive Clone -- Self-Referencing Source Path

**What goes wrong:**
This already happened in CodeScope v2.0. When `marketplace.json` `source` field points back to the same repository containing the manifest, `claude /install-plugin` clones the plugin source, finds another `marketplace.json`, and recursively clones again. This infinite loop consumes disk space and hangs installation.

**Why it happens:**
The marketplace.json format expects plugin sources to be relative paths or external repos. If CodeScope is both the marketplace (for testing/development) and the plugin source, the self-reference creates recursion.

**How to avoid:**
1. Never reference the same repository as both marketplace root and plugin source. Use a separate test marketplace repo.
2. In marketplace.json, use explicit commit hashes or tags, not `main` branch HEAD.
3. Test plugin installation from a clean directory that does not contain the marketplace manifest.
4. Add installation guard: if the cloned repo already exists at the target path, skip re-cloning.

**Warning signs:**
- `claude /install-plugin` hangs indefinitely
- Disk space fills with nested clone directories
- Plugin installation works locally but fails when published

**Phase to address:**
Phase 3 (Plugin Distribution Fix) -- known issue with known fix, should be addressed early.

---

### Pitfall 11: CLAUDE_PLUGIN_ROOT Not Available in Project-Level .mcp.json

**What goes wrong:**
When CodeScope is installed as a plugin (not a local development checkout), the MCP server needs to know its own installation path to find grammar WASM files, convention rules, and other bundled assets. `CLAUDE_PLUGIN_ROOT` provides this -- but it is not available when the MCP server is configured in a project-level `.mcp.json` file. Project-level MCP servers run with the project's environment, not the plugin's.

**Why it happens:**
Claude Code injects `CLAUDE_PLUGIN_ROOT` only for MCP servers defined within a plugin's own `.mcp.json` or `plugin.json`. Project-level `.mcp.json` configurations are a different execution context.

**How to avoid:**
1. Always define the MCP server in the plugin's own configuration (`.claude-plugin/plugin.json` inline or `.mcp.json`), never in the project's `.mcp.json`.
2. As a fallback, resolve asset paths relative to `import.meta.url` (the MCP server's own location in the filesystem), not relative to `process.cwd()` or environment variables.
3. Test both installation methods: plugin-installed (via marketplace) and project-local (via `.mcp.json`). The asset resolution must work in both cases.

**Warning signs:**
- MCP server starts but cannot find WASM grammar files
- Convention rules directory resolves to a nonexistent path
- Plugin works in development but breaks after npm publish and marketplace install

**Phase to address:**
Phase 3 (Plugin Distribution Fix) -- must be tested as part of distribution validation.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skipping dynamic `require()` resolution entirely | Simpler parser, no false edges | Incomplete graph for projects using dynamic loading (plugin systems, config loading, test fixtures) | Always -- dynamic requires are unresolvable by definition. Log them for the readiness report; do not attempt resolution. |
| Hardcoding framework detection to package.json name matching | Quick to implement, works for top 10 frameworks | Misses forked/custom frameworks, breaks on monorepo workspaces where the dependency is in root but source is in packages/* | Acceptable for v2.1 MVP. Add user-configurable framework hints later. |
| Two separate markdown parsers for conventions.md | Both `convention-index.ts` and `tools/conventions.ts` parse the same markdown format independently | Changing the markdown format breaks one parser but not the other, causing silent data inconsistency | Technical debt. Acceptable for v2.1 but should unify in v3 by outputting structured JSON from scanner. |
| Storing convention results as markdown (not JSON) | Human-readable, no schema migration | Markdown parsing is fragile -- the `parseConventions()` in convention-index.ts uses string matching (`**Convention:**`) that breaks if format changes | Acceptable for v2.1. Move to structured JSON output for v3. |
| Rule paths resolved relative to CodeScope source tree | Works during development | Breaks for bundled npm distribution where `src/conventions/rules/` may not exist | Must fix in Phase 3. Resolve relative to `import.meta.url` or bundle rules into dist/. |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Hook scripts importing new modules | Adding `import { something } from '../conventions/runner.js'` to a hook file, which transitively loads child_process (for ast-grep CLI), increasing hook startup time | Hook scripts (`src/hooks/`) must NEVER import from `src/graph/`, `src/tools/`, `src/parser/`, `src/conventions/`, or `src/server.ts`. Duplicate types/logic in `hooks/lib/`. This is per D-01 build isolation. Reference file injection in hooks must only inject file paths, never import the file-reading infrastructure. |
| Convention index format mismatch | The convention index builder (`convention-index.ts`) expects markdown sections starting with `## ` and fields like `**Convention:**`. The convention detector (`convention-detector.ts`) generates sections starting with `### ` and uses a table format. The index builder never matches anything. | Verify that the generated markdown format exactly matches what the index builder parses. Better: add an integration test that generates conventions.md and then parses it with the index builder, asserting non-empty output. |
| Batch writer two-pass ordering | Adding CommonJS require edges during the file parse loop (pass 1), before all target file nodes exist (pass 2) | CommonJS import edges must follow the same two-pass pattern as ESM: collect all nodes first, then resolve and create all edges. The current `buildGraph()` does this correctly for ESM. CommonJS support must use the same writer pattern. |
| enhanced-resolve conditionNames for CJS | Not adding "require" to `conditionNames` when resolving CommonJS imports | The current resolver config already includes `conditionNames: ["import", "require", "node", "default"]`. But some projects use package.json "exports" with conditions not in this list (e.g., "browser", "production"). Test with projects having complex exports maps. |
| ast-grep exit code semantics | Treating exit code 1 as an error when it means "matches found" | The current `scanSingleRule()` correctly catches this. New convention scanning code must replicate the same try/catch pattern. New framework-specific rules must be tested against both "matches" and "no matches" cases. |
| File path normalization across systems | Pre-computed injection artifacts use relative paths from `buildGraph()`. Hook scripts receive absolute paths from Claude Code's `tool_input.file_path`. If normalization is inconsistent, hook lookups miss. | Both hooks already normalize via `relative(projectDir, absPath).split("\\").join("/")`. New code (reference file lookup) must use identical normalization. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Running `sg scan` per rule file sequentially for 18+ rules | Convention detection takes 30+ seconds on 500+ file codebases | Batch all rules into a single `sgconfig.yml` and run one `sg scan` pass. Or use `@ast-grep/napi` for in-process scanning without subprocess overhead. | Noticeable at 500+ files with 20+ rules (~10K rule evaluations). Already slow on Fastify (1200+ files). |
| Full tree-sitter reparse for post-edit validation on every Edit | Adds 100-200ms latency per Edit operation. With 50+ edits per file during iterative development, this is 5-10 seconds of overhead per file. | Only validate on file completion (when Claude moves to a different file), not on every Edit. Cache parse results per file path within a session. | Noticeable at 10+ edits per file (common in iterative coding). |
| Recursive AST walk for require detection | Walking every node in the AST looking for `call_expression` with text "require" -- O(n) where n = all AST nodes | Use targeted depth-2 extraction from `variable_declarator.value` and `expression_statement` children. For deep/conditional requires, use ast-grep structural search instead of manual traversal. | Noticeable on files with 1000+ nodes (any file over ~200 lines). |
| Re-generating all injection artifacts after every incremental rebuild | `generateInjectionArtifacts()` rebuilds all three JSON indexes for the entire graph, even if one file changed | Implement incremental artifact updates: only recompute for files whose graph neighborhood changed. Or only regenerate when explicitly requested, not on every incremental rebuild. | Noticeable at 500+ files in the graph. |
| Framework detection re-reading package.json on every convention scan | If convention detection is called multiple times (incremental updates), re-parsing package.json and re-detecting the framework each time | Cache framework detection result alongside the bootstrap output. Invalidate only when package.json changes (check via file hash). | Minor performance issue but indicative of unnecessary I/O. |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Reference file injection suggesting files containing secrets | If a file with API keys or credentials happens to follow many conventions, it could be suggested as a reference. Claude reads and potentially reproduces secret patterns. | Exclude files matching secret patterns from golden file ranking: `.env`, `*credentials*`, `*secret*`, `*.key`, `*.pem`, `*config/production*`. Check content for `API_KEY=`, `password=`, `token=` before suggesting. |
| Convention evidence chains leaking sensitive string content | ast-grep match output includes the `text` field with the full matched source code. Convention reports with `buildEvidence()` include up to 80 chars of matched text. This could expose inline credentials or API endpoints. | Truncate evidence text to identifier/structure only, stripping string literal contents. The current 80-char truncation may not be sufficient for patterns like `const API_KEY = "sk-..."`. |
| Plugin distribution including local analysis artifacts | Publishing with `.claude/codescope/` data (graph.db, conventions.md, injection artifacts) exposes project structure, file paths, and potentially sensitive architecture to npm. | Ensure `.npmignore` or package.json `"files"` field explicitly excludes `.claude/`, `graph.db`, injection artifacts. Test with `npm pack --dry-run` to verify published content. |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Reporting "0 conventions detected" without explanation | User thinks the tool is broken. Actual cause: codebase too small (<10 files) or uses an unsupported framework. | Report "0 conventions detected. Minimum 10 applicable files required. Detected framework: Fastify (no framework-specific rules available yet)." Give actionable info. |
| Silent failure on import resolution | User runs bootstrap, gets "successful" result with 0 edges, never realizes graph is empty. All downstream features silently produce useless output. | Add a prominent warning when edges are disproportionately low: "WARNING: 3 import edges from 150 imports. Resolution may be misconfigured." |
| Post-edit warnings with no "why" or "how to fix" | "Does not follow convention X" without explaining what X is, what the expected pattern looks like, or where to find an example. | Include in every warning: convention name, expected pattern (one-line code example), reference file path ("See src/routes/health.ts for an example"). |
| Convention conflicts displayed as errors | "CONFLICT: Named vs Default Exports" makes users think something is wrong. Many codebases legitimately use both. | Frame conflicts as informational: "Your codebase uses both patterns. Consider choosing one for new files." No error-style formatting. |
| Readiness score drops after adding CommonJS support | Before: 0% import health (no edges). After: 30% (some dynamic requires unresolvable). User sees the number drop and thinks things got worse. | Show absolute improvement ("Import edges: 0 -> 847") alongside percentage. Frame unresolvable requires as known limitation, not score penalty. |
| Reference file suggestions ignored because they are not relevant | Suggesting a database utility as a reference for writing an HTTP handler. User ignores it, learns to distrust the feature. | Filter reference suggestions by task relevance (directory proximity, similar file structure). Only suggest when confidence is HIGH. Omit suggestions rather than provide bad ones. |

## "Looks Done But Isn't" Checklist

- [ ] **CommonJS require() parsing:** Often missing destructured requires (`const { a, b } = require('mod')`) -- verify with test file containing all 6 patterns: bare require, assigned, destructured, re-export via module.exports, dynamic (variable argument), conditional (inside if block)
- [ ] **ESM edge creation:** Often missing re-exports (`export { foo } from './bar'`) and dynamic imports (`import('./module')`) -- verify edge count against manual import count on a 20-file test project
- [ ] **Framework detection:** Often missing monorepo detection where the framework dependency is in root package.json but source is in `packages/*/src/` -- verify with a workspace structure
- [ ] **Convention rules on .js files:** Often assuming ast-grep TypeScript rules only match .ts files -- verify that `language: TypeScript` in rule YAML also matches `.js` files (ast-grep's TypeScript parser handles JavaScript as a subset)
- [ ] **Reference file exclusion:** Often missing `.d.ts` files, `index.ts` barrel files, and `__mocks__/`/`__fixtures__/` directories -- verify exclusion list covers all non-exemplar file types
- [ ] **Post-edit validation scope:** Often missing the "only validate the just-edited file" filter -- accidentally validating all project files on every edit
- [ ] **Plugin distribution assets:** Often missing the `postinstall` script that builds WASM grammar files -- verify `npx codescope` works from a clean npm install without tree-sitter-cli installed
- [ ] **Hook build isolation after changes:** Often broken by adding a new import to a hook file -- verify hooks load without better-sqlite3/graphology/web-tree-sitter native addons

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| 0 import edges (ESM or CJS) | LOW | Fix parser/resolver, re-run bootstrap. Full rebuild replaces all nodes and edges. No data migration needed. |
| False convention detections | LOW | Delete `conventions.md` and `injection/conventions.json`, re-run convention detector with updated rules. No schema change. |
| Wrong reference file suggestions | LOW | Update golden file ranking algorithm, re-run `rankGoldenFiles()`. Golden files are computed on-the-fly, not stored persistently. |
| Post-edit validation erodes user trust | MEDIUM | Cannot undo trust damage. Must disable validation, fix accuracy, and re-enable with explanation. Consider a per-session trust score that starts high and degrades with false positives. |
| Recursive marketplace clone fills disk | LOW | Delete nested clone directories. Fix marketplace.json self-reference. No data loss. |
| Hook importing heavy modules breaks startup | MEDIUM | Revert import, rebuild hooks. If the broken hook shipped in a release, users experience 500ms+ latency until they update. |
| Convention index JSON grows too large | MEDIUM | Implement lazy loading or directory-split indexes. Requires changes to both generator and artifact reader. |
| Circular requires inflate centrality | LOW | Add cycle detection, re-run bootstrap. Graph metrics adjust automatically. |
| CLAUDE_PLUGIN_ROOT not available | MEDIUM | Switch asset resolution to `import.meta.url` relative paths. Requires rebuild and re-publish. |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Missing require() parsing (P1) | Phase 1: Import Graph Fix | Bootstrap on Fastify produces >100 import edges |
| Nested require in variable decl (P2) | Phase 1: Import Graph Fix | `const x = require('y')` at file top produces ImportInfo in parse result |
| ESM edge creation bug (P3) | Phase 1: Import Graph Fix | Bootstrap on h3 produces >0 edges; count matches manual count within 10% |
| Generic conventions (P4) | Phase 2: Semantic Conventions | Fastify convention report includes 3+ framework-specific patterns |
| Over-fitting to file type (P5) | Phase 2: Semantic Conventions | No convention has >20% false positive rate on mixed codebase |
| Wrong reference files (P6) | Phase 5: Reference File Injection | No deprecated/generated/sub-20-line file in top 5 golden files |
| Reference blows token budget (P7) | Phase 5: Reference File Injection | Hook output stays under 500 tokens with reference suggestions enabled |
| Validation calibration (P8) | Phase 6: Post-Edit Validation | False positive rate <5% on Fastify and h3, measured across 50+ Edits |
| Circular requires (P9) | Phase 1: Import Graph Fix | Bootstrap on project with known cycles completes; cycles are reported |
| Recursive marketplace clone (P10) | Phase 3: Plugin Distribution | `claude /install-plugin` completes in <30s from clean environment |
| CLAUDE_PLUGIN_ROOT (P11) | Phase 3: Plugin Distribution | MCP server finds WASM files and rules when installed via marketplace |

## Sources

- CodeScope source: `src/parser/extract.ts` lines 571-589 -- parser only handles `import_statement`, no `call_expression`
- CodeScope source: `src/graph/builder.ts` lines 261-317 -- edge creation depends on resolver success, errors caught silently
- CodeScope source: `src/conventions/runner.ts` -- 18 generic rules, no framework awareness
- CodeScope source: `src/hooks/lib/budget-composer.ts` -- 500-token budget, character/4 estimation
- CodeScope source: `src/hooks/pre-tool-use.ts` -- build isolation constraint
- CodeScope source: `src/conventions/golden-files.ts` -- convention density ranking without quality signals
- CodeScope PROJECT.md v2.1 eval findings -- 0 edges on both Fastify (CJS) and h3 (ESM)
- [tree-sitter-javascript grammar](https://github.com/tree-sitter/tree-sitter-javascript) -- `require()` is `call_expression`, not `import_statement`
- [tree-sitter: Using Parsers](https://tree-sitter.github.io/tree-sitter/using-parsers/) -- node type structure
- [Node.js CommonJS modules docs](https://nodejs.org/api/modules.html) -- circular require behavior, dynamic require
- [Fastify plugin reference](https://fastify.dev/docs/latest/Reference/Plugins/) -- `module.exports = function(fastify, opts, done)` pattern
- [ast-grep core concepts](https://ast-grep.github.io/advanced/core-concepts.html) -- structural matching, syntax-level limitations
- [ast-grep tool comparison](https://ast-grep.github.io/advanced/tool-comparison.html) -- no deep semantic info
- [SonarQube false positive minimization](https://securityboulevard.com/2026/02/how-sonarqube-minimizes-false-positives-in-code-analysis-below-5/) -- 3.2% FP rate achievable
- [Exemplar pattern for code generation](https://www.ivanturkovic.com/2026/02/01/prompt-patterns-decomposition-exemplar-constraint/) -- exemplar selection criteria
- [Claude Code plugin docs](https://code.claude.com/docs/en/plugins) -- marketplace structure, CLAUDE_PLUGIN_ROOT
- [Rollup CommonJS plugin](https://github.com/rollup/plugins/blob/master/packages/commonjs/README.md) -- conditional/dynamic require gotchas

---
*Pitfalls research for: CodeScope v2.1 -- CommonJS parsing, semantic convention detection, reference file injection, post-edit validation*
*Researched: 2026-03-30*
