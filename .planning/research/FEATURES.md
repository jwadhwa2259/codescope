# Feature Research: CodeScope v2.1 Eval Fixes & Real-World Quality

**Domain:** Codebase intelligence layer -- import graph accuracy, semantic convention detection, plugin distribution fixes, reference file injection, post-edit validation, eval skill
**Researched:** 2026-03-30
**Confidence:** HIGH (specific gaps identified from eval testing against Fastify + h3; comparable tool approaches well-documented)

## Context

v2.1 is a quality-focused milestone. Comparison testing on Fastify (CommonJS) and h3 (TypeScript ESM) revealed that CodeScope's import graph produced 0 edges on both codebases, convention detection found only generic syntax patterns (missing framework-specific conventions), and vanilla Claude Code scored equal or better. This research investigates how comparable tools solve these exact problems.

## Feature Landscape

### Table Stakes (Users Expect These)

Features that must work correctly for CodeScope to be credible as a codebase intelligence layer. Failing at these makes the tool worse than no tool at all.

| Feature | Why Expected | Complexity | CodeScope Dependency | Notes |
|---------|--------------|------------|---------------------|-------|
| **CommonJS `require()` import extraction** | Fastify, Express, Koa, and most Node.js libraries use CommonJS. A graph tool that produces 0 edges on CommonJS codebases is broken, not incomplete. codebase-memory-mcp handles 66 languages including CJS. code-review-graph handles 18 languages with call-site resolution. | MEDIUM | `src/parser/extract.ts` (add `call_expression` handling), `src/graph/builder.ts` (edge creation) | The parser only handles `import_statement` AST nodes (line 572 of extract.ts). Must add `call_expression` where callee is `require` and `expression_statement` for `module.exports` assignments. enhanced-resolve already supports `conditionNames: ["require"]`. |
| **ESM edge creation fix** | Even on h3 (pure ESM TypeScript), 0 edges were created. The parser extracts imports correctly but edges are not written to SQLite. This is a bug, not a missing feature. | LOW | `src/graph/builder.ts` (lines 260-317), `src/graph/batch-writer.ts` | Likely a path normalization or edge flush issue. The two-pass batch insert (nodes first, then edges) may be silently dropping edges when target file paths don't match node file paths exactly. |
| **`module.exports` / `exports.*` extraction** | CommonJS exports are how modules declare their public API. Without extracting these, the graph has no export nodes for CJS files, making the graph structurally incomplete. | MEDIUM | `src/parser/extract.ts` (add `assignment_expression` handling for `module.exports`) | tree-sitter parses `module.exports = X` as `expression_statement > assignment_expression`. Extract the right-hand side to determine what's exported (function, object, class). |
| **Plugin distribution fixes** | Claude Code marketplace requires `${CLAUDE_PLUGIN_ROOT}` for hook/MCP server paths. Plugin caching copies files to `~/.claude/plugins/cache/`. Hooks referencing absolute paths or relative paths outside the plugin dir break after install. | LOW | `.claude-plugin/plugin.json`, hook scripts, `.mcp.json` | Must use `${CLAUDE_PLUGIN_ROOT}` in all hook command paths and MCP server configs. Verify that `npx codescope` install flow works with marketplace sources (github, npm, git-subdir). |
| **Readiness scoring accuracy** | Readiness scores should reflect actual codebase quality metrics. If convention detection produces zero or generic results, the "convention adherence" dimension is meaningless. | LOW | `src/bootstrap/readiness.ts`, convention scan results | Fix is downstream of convention detection improvements -- once conventions are accurate, readiness scoring automatically improves. |
| **Bootstrap error surfacing** | When import resolution fails or convention scanning produces no results, the user should see clear diagnostics, not silent zeroes. | LOW | `src/graph/builder.ts` (error aggregation), bootstrap pipeline | Surface resolution failures, edge creation stats (expected vs actual), and convention scan coverage in bootstrap output. |

### Differentiators (Competitive Advantage)

Features that make CodeScope better than vanilla Claude Code + manual file reading. These justify the tool's existence.

| Feature | Value Proposition | Complexity | CodeScope Dependency | Notes |
|---------|-------------------|------------|---------------------|-------|
| **Semantic convention detection (framework-specific)** | Generic patterns (named exports, async/await, interface vs type) match every TypeScript project. Framework-specific patterns (Fastify schema validation on routes, Express error-handling middleware signatures, React hook rules, Zod schema co-location) reveal what makes *this* codebase different. Cursor achieves this through `.cursor/rules/` files authored by humans; CodeScope should detect it automatically from code. | HIGH | `src/conventions/runner.ts`, `src/conventions/rules/` directory, ast-grep YAML rules | ast-grep composite rules (`all`, `any`, `has`, `inside`, `not`) enable framework-specific detection. Example: detect "Fastify route with schema" via `pattern: "app.$METHOD($PATH, { schema: $SCHEMA }, $HANDLER)"`. Requires framework detection during bootstrap (check package.json deps) then loading framework-specific rule sets. |
| **Reference file injection ("write this like X")** | When Claude writes a new route handler, it should be told "look at `src/routes/users.ts` as a reference -- it follows all 6 detected conventions." Cursor uses `@file` references; codebase-context-spec uses `.context/` directories; Continue.dev uses `repo-map` context providers. CodeScope already computes golden files (files with highest convention density) but never injects them. | MEDIUM | `src/conventions/golden-files.ts` (already ranks files), `src/hooks/pre-tool-use.ts` (injection point) | Extend PreToolUse to include "Reference: see `{golden_file}` for an example of this pattern" when the target file is in the same module/directory as a golden file. Budget: ~100 tokens for reference suggestion within existing 500-token budget. |
| **`/codescope:eval` skill (3 modes)** | Structured evaluation of code changes against project conventions. Three modes: pre-commit (staged files), post-change (working directory diff), and on-demand (specific files). No competitor offers automated convention-aware evaluation as an MCP skill. | HIGH | Convention detection results, golden file rankings, blast radius analysis, readiness scores | Compose existing capabilities: convention scan on target files, blast radius of changes, readiness delta. Output structured findings with severity and remediation guidance. |
| **Post-edit convention validation** | Current PostToolUse hook only reminds Claude of conventions advisory. Real validation means running ast-grep on the just-written file and reporting actual violations, not just restating what conventions exist. The `decision: "block"` pattern (used in lint hooks) forces Claude to fix deviations before proceeding. | MEDIUM | `src/hooks/post-tool-use.ts`, ast-grep CLI or NAPI, convention rules | PostToolUse receives `tool_response` with the file path. Run `sg scan --rule` on that specific file. If violations found, return `decision: "block"` with `reason` containing specific violations. Claude will auto-correct. Critical: `decision: "block"` in PostToolUse doesn't prevent the edit (already happened) -- it prompts Claude to fix it. |
| **Golden file ranking improvements** | Current ranking uses raw convention density (conventions matched / total conventions). This treats all conventions equally and doesn't account for file relevance to the current task. Should weight by convention confidence, file proximity (same directory/module), and recency. | LOW | `src/conventions/golden-files.ts` | Weight HIGH-CONF conventions 3x, MEDIUM-CONF 2x, LOW-CONF 1x. Add proximity scoring when suggesting references for a specific target file. Filter by language (don't suggest Python golden files for TypeScript edits). |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Auto-fix convention violations** | "If you detect the violation, just fix it." | ast-grep rewrite rules are mechanical transforms -- they can't understand intent or context. An auto-fix might break the code in ways the convention check doesn't catch. The PostToolUse `decision: "block"` pattern is better: tell Claude what's wrong and let it fix with full context. | Return specific violation details + golden file reference in PostToolUse. Claude fixes with architectural understanding. |
| **LLM-based convention detection** | "Use the LLM to understand conventions semantically instead of AST patterns." | Expensive (tokens), non-deterministic (different results each run), slow (API calls during bootstrap), and can't be cached/pre-computed. ast-grep is deterministic, fast, and cacheable. | Use ast-grep for structural detection + framework detection from package.json for rule selection. LLM involvement is in the agent that writes new convention rules, not in the detection itself. |
| **Full TypeScript type-aware analysis** | "Use the TypeScript compiler API for type information." | Massive dependency (typescript package is ~50MB), slow (full program type-checking), fragile (requires exact tsconfig resolution), and most convention patterns are structural, not type-based. | enhanced-resolve for import resolution + tree-sitter for structural analysis covers 95%+ of cases. Type-aware analysis is v3 territory if evidence shows it's needed. |
| **Dynamic require() resolution** | "Handle `require(variable)` and `require(\`template\`)` dynamic imports." | Dynamic requires are fundamentally unresolvable statically -- the value is only known at runtime. Attempting to resolve them produces false edges in the graph. | Extract and resolve only static `require('string-literal')` calls. Flag dynamic requires as unresolvable in bootstrap diagnostics. This matches what webpack/enhanced-resolve does. |
| **Cross-framework convention templates** | "Ship pre-built convention rules for every popular framework." | Maintenance burden grows linearly with framework count. Rules go stale as frameworks evolve. Creates false expectations ("why doesn't it detect my Remix conventions?"). | Ship a small set of framework-specific rules for top 5 Node.js frameworks (Express, Fastify, Next.js, Nest.js, Hono). Provide documentation for writing custom rules. Focus on the detection-and-suggestion loop, not exhaustive coverage. |

## Feature Dependencies

```
[ESM Edge Creation Fix]
    |
    +--required-by--> [CommonJS require() Extraction]
    |                     |
    |                     +--required-by--> [Accurate Import Graph]
    |                                          |
    |                                          +--required-by--> [Blast Radius Accuracy]
    |                                          +--required-by--> [Readiness Scoring Accuracy]
    |
    +--required-by--> [module.exports Extraction]

[Framework Detection (package.json)]
    |
    +--required-by--> [Semantic Convention Detection]
    |                     |
    |                     +--required-by--> [Post-Edit Convention Validation]
    |                     +--required-by--> [/codescope:eval Skill]
    |                     +--enhances--> [Golden File Ranking]
    |
    +--enhances--> [Reference File Injection]

[Golden File Ranking Improvements]
    |
    +--required-by--> [Reference File Injection]
    +--enhances--> [/codescope:eval Skill]

[Plugin Distribution Fixes]
    |
    +--independent-of--> [all other v2.1 features]
    +--required-by--> [marketplace listing]

[Bootstrap Error Surfacing]
    |
    +--independent-of--> [core features]
    +--enhances--> [user trust and debugging]
```

### Dependency Notes

- **ESM fix must come before CJS support:** If ESM edges are broken, adding CJS extraction will also produce 0 edges. The fundamental edge creation pipeline must work first.
- **Framework detection enables semantic conventions:** Without knowing the project uses Fastify, you can't load Fastify-specific convention rules. Framework detection from package.json is the gate.
- **Golden file improvements enable reference injection:** Current golden files treat all conventions equally and don't consider file proximity. Reference injection needs weighted, proximity-aware rankings to be useful.
- **Plugin distribution is fully independent:** Pure packaging/path fixes. Can ship in any phase.
- **Post-edit validation requires accurate conventions:** Validating against inaccurate conventions creates false positives that erode trust.

## Detailed Feature Analysis

### 1. CommonJS Import Graph Support

**The problem:** CodeScope's parser (`src/parser/extract.ts`) only matches `import_statement` AST nodes. CommonJS `require()` calls are `call_expression` nodes in tree-sitter's JavaScript grammar. The entire Fastify codebase uses `require()` -- producing 0 import edges.

**How comparable tools handle it:**

| Tool | Approach | CJS Support | Notes |
|------|----------|-------------|-------|
| **codebase-memory-mcp** | tree-sitter across 66 languages, IMPORTS edges | Yes (implicit via tree-sitter) | Single Rust binary; doesn't expose resolution details but handles module relationships |
| **code-review-graph** | tree-sitter with `_IMPORT_TYPES` and `_CALL_TYPES` mappings per language | Yes (12 languages including JS) | Uses Python; recent update added "call target resolution -- bare call targets resolved to qualified names" |
| **webpack/enhanced-resolve** | Configurable module resolution with `conditionNames: ["import", "require"]` | Yes (primary use case) | CodeScope already uses this library but only passes `import` paths to it |
| **oxc-resolver** | Rust port of enhanced-resolve | Yes | Faster alternative, but adding a native Rust dependency is unnecessary when enhanced-resolve already works |
| **Codegen (graph-sitter)** | tree-sitter with semantic layer for call graph construction | Yes | Commercial product; uses tree-sitter for initial parse then builds semantic call graph |

**Recommended approach:** Extract `call_expression` nodes where the callee is `require` and the first argument is a string literal. Feed the string literal to the existing `resolveTypeScriptImport` function (enhanced-resolve already handles `require` paths via `conditionNames: ["require"]`). This is 90% of CJS import resolution with minimal code change.

**tree-sitter AST structure for `require()`:**

```
call_expression
  function: identifier "require"
  arguments: arguments
    string: string_fragment "path/to/module"
```

Query: match `call_expression` where child `identifier` text is `"require"` and first argument is a `string` or `template_string` with no substitutions.

**Also handle:**
- `const { x, y } = require('module')` -- destructured require (common in Fastify)
- `const mod = require('module')` -- assigned require
- `require('./relative')` and `require('package')` -- relative vs package requires
- Do NOT handle: `require(variable)` -- dynamic requires are unresolvable

**Confidence:** HIGH -- tree-sitter grammar is well-documented, enhanced-resolve already supports CJS resolution.

### 2. ESM Edge Creation Fix

**The problem:** Even on h3 (pure ESM TypeScript), 0 edges were created. The parser correctly extracts `ImportInfo` objects, and `resolveTypeScriptImport` likely resolves paths. The bug is in the edge writing pipeline between resolution and SQLite insertion.

**Likely root causes (ranked by probability):**

1. **Path normalization mismatch:** `builder.ts` uses `path.relative(options.projectRoot, ...)` for file node paths but `path.relative(realProjectRoot, normalizedResolved)` for edge targets (lines 288-302). If `projectRoot` and `realProjectRoot` differ (macOS `/var` vs `/private/var`), node file_paths and edge target_file_paths won't match, causing edges to reference nonexistent targets.

2. **Two-pass batch insert edge resolution failure:** Edges reference target nodes by `target_name` (basename) and `target_file_path`. If the target file hasn't been processed yet when the edge is written, or if the target_file_path doesn't exactly match any node's file_path, the edge is silently dropped during `processBatchFiles`.

3. **External module filtering:** Lines 296-302 check `!resolvedRelative.startsWith("..") && !path.isAbsolute(resolvedRelative)`. If the resolved path falls outside the project root (e.g., symlinked node_modules or workspace packages), all edges to those modules are dropped.

**Recommended approach:** Add diagnostic logging to `buildGraph` that counts: imports extracted, imports resolved, imports with matching target nodes, edges actually written. The delta between these numbers will pinpoint the exact failure. This is a debugging task, not a feature.

**Confidence:** HIGH -- this is a bug fix, not a design problem.

### 3. Semantic Convention Detection

**The problem:** CodeScope's 18 convention rules are all generic TypeScript/Python syntax patterns. They detect "uses async/await" and "prefers named exports" -- patterns that match every TypeScript project identically. They miss framework-specific conventions that distinguish *this* codebase from others.

**What framework-specific conventions look like:**

| Framework | Convention | ast-grep Rule Pattern |
|-----------|-----------|----------------------|
| **Fastify** | Routes use schema validation | `app.$METHOD($PATH, { schema: $_ }, $HANDLER)` with `has` check for schema property |
| **Fastify** | Plugins use `fp()` wrapper | `module.exports = fp($PLUGIN)` or `export default fp($PLUGIN)` |
| **Express** | Error middleware has 4 params | `function($ERR, $REQ, $RES, $NEXT) { $$$ }` with `kind: function_declaration` |
| **Express** | Router patterns | `const router = express.Router()` followed by `router.$METHOD` |
| **Next.js** | Page components export default | Files in `pages/` or `app/` with `export default` |
| **Next.js** | API routes export handler | `export default function handler($REQ, $RES)` or `export async function $METHOD($REQ)` |
| **Nest.js** | Decorators on classes | `@Controller()`, `@Injectable()`, `@Module()` |
| **Hono** | Route chaining pattern | `app.get($PATH, $HANDLER)` or `app.post($PATH, $HANDLER)` |
| **Zod** | Schema co-location | `const $SCHEMA = z.object({$$$})` in same file as handler |
| **General** | Error boundary pattern | `try { $$$ } catch ($E) { $$$ }` with specific error handling |

**How comparable tools handle framework-specific detection:**

| Tool | Approach | Automatic? | Notes |
|------|----------|-----------|-------|
| **Cursor** | `.cursor/rules/` .mdc files with framework-specific instructions | No -- human-authored | Rules include code examples. Good for enforcing, not discovering. |
| **codebase-context-spec** | `.context/` directory with index.md describing conventions | No -- human-authored | Documentation-first approach. |
| **GitHub Copilot** | Repository Intelligence with "contextual embeddings" and semantic clustering | Yes (but black-box) | Uses vector similarity to find similar patterns. Not inspectable. |
| **Continue.dev** | Codebase indexing + repo-map context provider | Semi-auto | Provides structural context but doesn't detect conventions. |
| **ESLint plugins** | Framework-specific plugins (eslint-plugin-react, eslint-plugin-fastify) | Config-required | Hundreds of framework plugins exist. Rules are static, not discovered. |

**Recommended approach -- two-phase detection:**

**Phase A: Framework detection (LOW complexity)**
- Read `package.json` dependencies during bootstrap
- Map dependency names to framework identifiers: `fastify` -> "fastify", `express` -> "express", `next` -> "nextjs", `@nestjs/core` -> "nestjs", `hono` -> "hono"
- Store detected frameworks in bootstrap metadata

**Phase B: Framework-specific rule loading (MEDIUM complexity)**
- Create `src/conventions/rules/frameworks/` directory with subdirectories per framework
- Each framework gets 3-5 targeted YAML rules using ast-grep composite patterns
- Only load rules for detected frameworks
- Compute adoption rates same as generic conventions
- Example Fastify rule:

```yaml
id: fastify-schema-validation
language: JavaScript
rule:
  all:
    - pattern: "$APP.$METHOD($$$)"
    - has:
        pattern: "schema"
        stopBy: end
message: "Fastify route with schema validation"
```

**Key insight:** ast-grep's composite rules (`all`, `any`, `has`, `inside`, `not`, `follows`, `precedes`) are powerful enough for framework-specific detection. The `has` and `inside` relational rules check structural context -- e.g., "a function call that has a schema property inside its options argument." This is more reliable than regex and faster than LLM-based detection.

**Confidence:** HIGH for the detection mechanism (ast-grep composite rules are well-documented). MEDIUM for specific rule accuracy (will need iteration per framework).

### 4. Reference File Injection

**The problem:** CodeScope computes golden files (files with highest convention density) but never uses them. When Claude writes a new file, it gets convention names and adoption rates but no concrete examples of what "following the conventions" looks like.

**How comparable tools handle exemplar/reference suggestions:**

| Tool | Approach | Automatic? | Quality |
|------|----------|-----------|---------|
| **Cursor** | `@file` references in prompts; `.cursor/rules/` with code examples | Manual | High -- human selects relevant files |
| **Continue.dev** | `repo-map` context provider lists top-level signatures | Automatic | Medium -- structural but not convention-aware |
| **codebase-context-spec** | `.context/index.md` documents with file references | Manual | High -- human curated |
| **Context Engineering** | PRPs (Product Requirements Prompts) with example patterns | Manual | High -- but requires upfront investment |
| **v0.dev** | "Attach example components or design references" | Manual | High for UI components |

**No tool automatically suggests reference files based on detected conventions.** This is a genuine differentiator for CodeScope.

**Recommended approach:**

1. **Extend golden file ranking** (already exists in `golden-files.ts`):
   - Weight conventions by confidence level (HIGH-CONF: 3x, MEDIUM-CONF: 2x, LOW-CONF: 1x)
   - Add proximity scoring: files in same directory get 2x boost, same parent directory 1.5x
   - Filter by language match (don't suggest `.py` golden files for `.ts` edits)

2. **Inject in PreToolUse** (within existing 500-token budget):
   - When target file is new (Write) or in a directory with a golden file, add:
     ```
     [REFERENCE] For this pattern, see src/routes/users.ts (follows 5/6 conventions, HIGH-CONF)
     ```
   - Budget: ~80-120 tokens for reference suggestion
   - Only suggest if golden file density > 0.6 (follows 60%+ of conventions)

3. **Include golden file path in convention artifact** (pre-computed):
   - Add `referenceFile` field to the conventions injection artifact
   - Pre-compute at bootstrap time, not at hook time

**Confidence:** HIGH -- uses existing infrastructure (golden files, PreToolUse hook, injection artifacts).

### 5. Post-Edit Convention Validation

**The problem:** The current PostToolUse hook (post-tool-use.ts) only reminds Claude of conventions that exist. It doesn't check whether the just-written code actually follows them. This is the difference between "here are the conventions" (advisory) and "you just violated convention X" (validation).

**How comparable tools handle post-edit validation:**

| Tool | Mechanism | Blocking? | Notes |
|------|-----------|----------|-------|
| **Claude Code lint hooks** | PostToolUse with `decision: "block"` + `reason` | Yes (prompts fix) | Standard pattern documented by Anthropic. Used for ESLint, RuboCop, Ruff. |
| **VS Code hooks (Feb 2026)** | Deterministic lifecycle hooks for agent-driven changes | Yes | "automatically lint code before edits are applied" |
| **ESLint + VS Code** | Format-on-save with auto-fix | Yes (auto-fix) | Real-time but IDE-specific |
| **Husky + lint-staged** | Pre-commit hooks | Yes (blocks commit) | Batch validation, not per-edit |

**The Claude Code pattern is clear:** PostToolUse with `decision: "block"` and `reason` containing specific violations. Claude sees the feedback and auto-corrects in its next turn. This creates a loop: write -> validate -> fix -> validate -> pass.

**Critical insight from research:** `"Without 'decision': 'block', the reason field is silently discarded."` The current PostToolUse hook returns `additionalContext` but never uses `decision: "block"`. This means convention reminders are visible to Claude but have no enforcement weight.

**Recommended approach:**

1. **Run ast-grep on the just-written file** in PostToolUse:
   ```
   sg scan --rule <convention-rule.yml> --json <file_path>
   ```
   - Only check conventions with HIGH-CONF or MEDIUM-CONF confidence
   - Only check conventions relevant to the file's language
   - Time budget: must complete in <500ms to avoid hook timeout

2. **Return `decision: "block"` with specific violations:**
   ```json
   {
     "decision": "block",
     "reason": "Convention violation in src/routes/users.ts:\n- Missing schema validation (Fastify convention, 85% adoption)\n- Reference: see src/routes/health.ts for correct pattern",
     "hookSpecificOutput": {
       "hookEventName": "PostToolUse",
       "additionalContext": "Fix the convention violations above before proceeding."
     }
   }
   ```

3. **Threshold for blocking:**
   - Only block for HIGH-CONF conventions (>80% adoption, >10 files)
   - MEDIUM-CONF violations: include in `additionalContext` as advisory
   - LOW-CONF violations: ignore in post-edit validation

4. **Performance consideration:**
   - ast-grep CLI on a single file is fast (~50ms)
   - Pre-filter: only run validation if the file matches a language with active conventions
   - The hook script must exit within Claude Code's hook timeout (configurable, default ~5s)

**Build isolation concern:** The current PostToolUse hook has ZERO imports from heavy modules (per D-01). Running ast-grep CLI via `execFileSync` from a hook script maintains this isolation -- it's a subprocess, not an import.

**Confidence:** HIGH -- the `decision: "block"` pattern is well-documented and used by multiple production hooks.

### 6. Plugin Distribution Fixes

**The problem:** CodeScope's plugin structure uses paths that may break when installed via marketplace. Claude Code copies plugins to `~/.claude/plugins/cache/` on install, so any path referencing the original location fails.

**How Claude Code plugin distribution works (verified from official docs):**

- Plugins are cached at `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/`
- `${CLAUDE_PLUGIN_ROOT}` resolves to the plugin's installation directory
- `${CLAUDE_PLUGIN_DATA}` resolves to persistent data directory that survives updates
- Hook commands, MCP server commands, and script paths must use these variables
- marketplace.json supports source types: relative path, github, url, git-subdir, npm
- Version tracking via `plugin.json` version field
- Auto-updates at Claude Code startup when enabled
- `strict: true` (default) means `plugin.json` is authoritative for component definitions

**Required fixes:**

| Component | Current Issue | Fix |
|-----------|--------------|-----|
| Hook scripts | May use absolute/relative paths | Use `${CLAUDE_PLUGIN_ROOT}/hooks/pre-tool-use.js` |
| MCP server | May reference local build output | Use `${CLAUDE_PLUGIN_ROOT}/dist/server.js` |
| Plugin data | Bootstrap data path may be hardcoded | Use `${CLAUDE_PLUGIN_DATA}` for `.claude/codescope/` equivalent |
| marketplace.json | Not yet created | Create with npm source type for `codescope` package |
| Version field | May be missing from plugin.json | Add semver version that tracks npm package version |

**Confidence:** HIGH -- Claude Code plugin distribution is well-documented with clear requirements.

### 7. `/codescope:eval` Skill

**The problem:** No structured way to evaluate code changes against project conventions. The eval agent exists internally but isn't exposed as a user-facing skill.

**Three modes:**

| Mode | Input | Use Case |
|------|-------|----------|
| **Pre-commit** | Staged files (`git diff --cached`) | Run before committing to catch violations |
| **Post-change** | Working tree diff (`git diff`) | Evaluate work-in-progress changes |
| **On-demand** | Specific file paths | Check specific files for convention compliance |

**Composition from existing capabilities:**
- Convention scan (ast-grep) on target files
- Blast radius analysis for changed files
- Golden file comparison for remediation guidance
- Readiness delta computation (before/after change)

**Output format:** Structured findings with severity (ERROR, WARNING, INFO), specific file/line references, convention name and adoption rate, and reference file suggestions.

**Confidence:** HIGH -- composes existing capabilities into a new skill.

## v2.1 Phase Recommendations

### Phase 1: Fix the Graph (ESM + CJS)

Must-fix-first. Everything else depends on an accurate import graph.

- [ ] **Debug and fix ESM edge creation** -- Diagnose why 0 edges on h3. Likely path normalization bug. LOW complexity, HIGH impact.
- [ ] **Add CommonJS `require()` extraction** -- Handle `call_expression` where callee is `require`. MEDIUM complexity.
- [ ] **Add `module.exports` extraction** -- Handle `assignment_expression` for CJS exports. MEDIUM complexity.
- [ ] **Add bootstrap diagnostics** -- Report imports extracted / resolved / edges created pipeline metrics. LOW complexity.

### Phase 2: Semantic Conventions

Build on fixed graph to deliver meaningful convention detection.

- [ ] **Framework detection from package.json** -- Detect Express, Fastify, Next.js, Nest.js, Hono. LOW complexity.
- [ ] **Framework-specific convention rules** -- 3-5 ast-grep YAML rules per framework using composite patterns. MEDIUM complexity.
- [ ] **Golden file ranking improvements** -- Confidence weighting, proximity scoring, language filtering. LOW complexity.

### Phase 3: Injection & Validation

Use accurate conventions for proactive assistance and enforcement.

- [ ] **Reference file injection in PreToolUse** -- Suggest golden files when writing new code. MEDIUM complexity.
- [ ] **Post-edit convention validation** -- Run ast-grep on written files, use `decision: "block"` for HIGH-CONF violations. MEDIUM complexity.
- [ ] **`/codescope:eval` skill** -- Three-mode convention evaluation. HIGH complexity (composition).

### Phase 4: Distribution & Polish

Independent packaging work.

- [ ] **Plugin distribution fixes** -- `${CLAUDE_PLUGIN_ROOT}`, marketplace.json, version tracking. LOW complexity.
- [ ] **Readiness scoring accuracy** -- Fix downstream of convention improvements. LOW complexity.

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Phase |
|---------|------------|---------------------|----------|-------|
| ESM edge creation fix | HIGH | LOW | P1 | 1 |
| CommonJS require() extraction | HIGH | MEDIUM | P1 | 1 |
| module.exports extraction | HIGH | MEDIUM | P1 | 1 |
| Bootstrap diagnostics | MEDIUM | LOW | P1 | 1 |
| Framework detection | HIGH | LOW | P1 | 2 |
| Framework-specific convention rules | HIGH | MEDIUM | P1 | 2 |
| Post-edit convention validation | HIGH | MEDIUM | P1 | 3 |
| Reference file injection | HIGH | MEDIUM | P1 | 3 |
| Golden file ranking improvements | MEDIUM | LOW | P2 | 2 |
| /codescope:eval skill | HIGH | HIGH | P2 | 3 |
| Plugin distribution fixes | MEDIUM | LOW | P1 | 4 |
| Readiness scoring accuracy | MEDIUM | LOW | P2 | 4 |

**Priority key:**
- P1: Must have for v2.1 -- these fix the eval-exposed failures
- P2: Should have -- adds significant value but v2.1 is functional without them

## Competitor Feature Analysis

| Feature Area | codebase-memory-mcp | code-review-graph | Cursor | GitHub Copilot | CodeScope v2.1 Approach |
|-------------|---------------------|-------------------|--------|---------------|------------------------|
| **CJS import resolution** | Yes (66 languages, tree-sitter) | Yes (18 languages, `_IMPORT_TYPES`) | N/A (editor) | N/A (editor) | Add `call_expression` matching in parser, feed to existing enhanced-resolve |
| **Framework convention detection** | No | No | Human-authored `.cursor/rules/` | Semantic embeddings (black-box) | Auto-detect from code via ast-grep composite rules + package.json framework detection |
| **Reference file suggestion** | No | No | Manual `@file` references | Semantic similarity | Auto-suggest golden files based on convention density + proximity |
| **Post-edit validation** | No | No | `.cursor/rules/` advisory | Auto-review (black-box) | PostToolUse with `decision: "block"` + ast-grep validation |
| **Plugin distribution** | Single binary download | npm + MCP config | IDE extension | IDE extension | npm package + marketplace.json + `${CLAUDE_PLUGIN_ROOT}` paths |
| **Eval skill** | No | No | No | No | `/codescope:eval` with 3 modes composing existing capabilities |

## Sources

### Import Resolution & Graph Building
- [enhanced-resolve GitHub](https://github.com/webpack/enhanced-resolve) -- configurable module resolution, CJS + ESM support
- [webpack Module Resolution docs](https://webpack.js.org/concepts/module-resolution/) -- how CJS require() resolution works
- [codebase-memory-mcp GitHub](https://github.com/DeusData/codebase-memory-mcp) -- 66 languages, IMPORTS edges, tree-sitter parsing
- [code-review-graph GitHub](https://github.com/tirth8205/code-review-graph) -- 18 languages, `_IMPORT_TYPES`/`_CALL_TYPES` mappings, call target resolution
- [Codegen (graph-sitter)](https://graph-sitter.com/introduction/overview) -- tree-sitter with semantic call graph layer
- [oxc-resolver GitHub](https://github.com/oxc-project/oxc-resolver) -- Rust port of enhanced-resolve

### Convention Detection & ast-grep
- [ast-grep Rule Essentials](https://ast-grep.github.io/guide/rule-config.html) -- composite rules (all, any, not, has, inside)
- [ast-grep YAML Configuration Reference](https://ast-grep.github.io/reference/yaml.html) -- full rule schema
- [ast-grep Pattern Syntax](https://ast-grep.github.io/guide/pattern-syntax.html) -- meta variables ($X, $$$)
- [ESLint Custom Rules](https://eslint.org/docs/latest/extend/custom-rules) -- framework-specific rule patterns
- [Custom ESLint Rules for AI Determinism](https://understandingdata.com/posts/custom-eslint-rules-determinism/) -- teaching LLMs through structured errors

### Reference File & Context Injection
- [Context Engineering: The AI Coding Revolution](https://www.blog.brightcoding.dev/2026/03/28/context-engineering-the-ai-coding-revolution) -- reference file patterns for AI code generation
- [Cursor Rules Guide 2026](https://dev.to/deadbyapril/the-best-cursor-rules-for-every-framework-in-2026-20-examples-29ag) -- .cursor/rules/ with code examples
- [Context Management Strategies for Cursor](https://datalakehousehub.com/blog/2026-03-context-management-cursor/) -- combining rules, @codebase, and MCP
- [Continue.dev Codebase Documentation Awareness](https://docs.continue.dev/guides/codebase-documentation-awareness) -- repo-map context provider
- [codebase-context-spec GitHub](https://github.com/Agentic-Insights/codebase-context-spec) -- .context/ directory standard

### Post-Edit Validation & Hooks
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) -- PostToolUse API, decision: "block", additionalContext
- [Make Claude Code Fix Its Own Lint Errors](https://boehs.com/blog/2026/03/17/claude-code-lint-hooks/) -- PostToolUse lint validation pattern
- [Claude Code Hooks Complete Guide (March 2026)](https://smartscope.blog/en/generative-ai/claude/claude-code-hooks-guide/) -- comprehensive walkthrough
- [VS Code Making Agents Practical (Feb 2026)](https://code.visualstudio.com/blogs/2026/03/05/making-agents-practical-for-real-world-development) -- deterministic hooks for agent-driven changes

### Plugin Distribution
- [Claude Code Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces) -- marketplace.json schema, source types, ${CLAUDE_PLUGIN_ROOT}
- [Claude Code Plugin Packaging](https://lobehub.com/skills/phazurlabs-install-labs-claude-code-plugin-packaging) -- packaging best practices
- [Claude Code Plugin Ecosystem 2026](https://aitoolanalysis.com/claude-code-plugins/) -- 9,000+ plugins, distribution patterns

### Competitive Intelligence
- [GitHub Copilot Repository Intelligence](https://www.browse-ai.tools/blog/repository-intelligence-github-copilot-vs-code-2026) -- semantic conventions via embeddings
- [Augment Code Semantic Coding](https://siliconangle.com/2026/02/06/augment-code-makes-semantic-coding-capability-available-ai-agent/) -- Context Engine for semantic search
- [AI Coding Tools for Complex Codebases](https://www.augmentcode.com/tools/13-best-ai-coding-tools-for-complex-codebases) -- competitive landscape overview

---
*Feature research for: CodeScope v2.1 Eval Fixes & Real-World Quality*
*Researched: 2026-03-30*
