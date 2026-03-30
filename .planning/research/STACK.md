# Stack Research

**Domain:** v2.1 Eval Fixes -- Import Graph, Semantic Conventions, Reference File Injection, Plugin Distribution
**Researched:** 2026-03-30
**Confidence:** HIGH (no new dependencies required; all features build on existing stack)

## Executive Summary

The v2.1 fixes require **zero new npm dependencies**. Every feature can be implemented using existing infrastructure: web-tree-sitter for CommonJS AST extraction, ast-grep YAML rules for semantic convention detection, the existing SQLite schema + graphology for reference file similarity, and the documented Claude Code marketplace schema for plugin distribution. The core problem in v2.0 was not missing technology -- it was incomplete use of the technology already present.

## Recommended Stack

### Core Technologies (No Changes)

The existing stack from CLAUDE.md remains fully applicable. No version bumps or new packages needed.

| Technology | Version | Purpose | v2.1 Change |
|------------|---------|---------|-------------|
| web-tree-sitter | 0.25.10 | AST parsing | Add CommonJS `call_expression` extraction to `src/parser/extract.ts` |
| ast-grep CLI | ^0.40.5 | Convention detection | Add framework-specific YAML rules (Fastify plugins, Express middleware, Hono handlers) |
| better-sqlite3 | ^12.8.0 | Knowledge graph | No schema changes needed; existing `nodes`/`edges` tables support all features |
| enhanced-resolve | ^5.20.1 | Import resolution | Already handles CommonJS `conditionNames: ["import", "require"]`; resolver works for both |
| graphology | ^0.26.0 | Graph analysis | Existing BFS/centrality sufficient for reference file similarity via graph distance |

### Supporting Libraries (No Changes)

No new supporting libraries needed. Existing infrastructure covers all v2.1 requirements.

| Library | Version | v2.1 Usage |
|---------|---------|------------|
| graphology-traversal | ^0.3.1 | BFS for finding structurally similar files (same community, similar import patterns) |
| graphology-metrics | ^2.4.0 | Centrality already computed; used for golden file ranking improvement |
| graphology-communities-louvain | ^2.0.2 | Community assignment already exists; used to scope reference file candidates |
| zod | ^3.25 | Validation for new convention rule metadata (if needed for semantic rules) |

## Implementation Approaches by Feature

### 1. CommonJS require() AST Extraction

**Problem:** `src/parser/extract.ts` only handles `import_statement` AST nodes (line 572 switch case). CommonJS `require()` calls produce `call_expression` nodes in tree-sitter, which are never visited.

**Tree-sitter AST for CommonJS patterns (verified against tree-sitter-javascript node-types.json):**

```
// Pattern 1: const fs = require('fs')
lexical_declaration
  variable_declarator
    name: identifier ("fs")
    value: call_expression
      function: identifier ("require")
      arguments: arguments
        string ("fs")

// Pattern 2: const { readFile } = require('fs')
lexical_declaration
  variable_declarator
    name: object_pattern
      shorthand_property_identifier_pattern ("readFile")
    value: call_expression
      function: identifier ("require")
      arguments: arguments
        string ("fs")

// Pattern 3: require('./side-effect-module') (bare require, no assignment)
expression_statement
  call_expression
    function: identifier ("require")
    arguments: arguments
      string ("./side-effect-module")

// Pattern 4: module.exports = { ... }
expression_statement
  assignment_expression
    left: member_expression
      object: identifier ("module")
      property: property_identifier ("exports")
    right: object (the exported value)

// Pattern 5: module.exports.foo = bar
expression_statement
  assignment_expression
    left: member_expression
      object: member_expression (module.exports)
      property: property_identifier ("foo")
    right: expression
```

**Implementation approach (no new deps):**

Extend `extractFromSource()` in `src/parser/extract.ts` to handle CommonJS patterns. The key change is handling additional node types in the TS/JS switch case that already processes top-level children:

```typescript
// New function to add to extract.ts
function extractCJSRequire(node: SyntaxNode): ImportInfo | null {
  // Match: call_expression where function is identifier "require"
  if (node.type !== "call_expression") return null;

  const funcNode = node.childForFieldName("function");
  if (!funcNode || funcNode.type !== "identifier" || funcNode.text !== "require")
    return null;

  const argsNode = node.childForFieldName("arguments");
  if (!argsNode || argsNode.childCount < 2) return null;

  // First real argument after opening paren
  const sourceNode = argsNode.child(1);
  if (!sourceNode || sourceNode.type !== "string") return null;

  const source = sourceNode.text.replace(/['"]/g, "");
  return {
    source,
    specifiers: [],
    line: node.startPosition.row + 1,
    isDefault: true,
    isNamespace: false,
  };
}
```

For destructured requires (`const { x, y } = require('z')`), walk up from the `call_expression` to its parent `variable_declarator`, then extract specifier names from the `object_pattern` in the `name` field:

```typescript
function extractCJSRequireFromDeclaration(node: SyntaxNode, result: ParseResult): void {
  // node is a lexical_declaration or variable_declaration
  for (let i = 0; i < node.childCount; i++) {
    const declarator = node.child(i)!;
    if (declarator.type !== "variable_declarator") continue;

    const valueNode = declarator.childForFieldName("value");
    const requireInfo = valueNode ? extractCJSRequire(valueNode) : null;
    if (!requireInfo) continue;

    const nameNode = declarator.childForFieldName("name");
    if (!nameNode) continue;

    if (nameNode.type === "identifier") {
      // const fs = require('fs') -- default/namespace import
      requireInfo.specifiers = [nameNode.text];
      requireInfo.isDefault = true;
    } else if (nameNode.type === "object_pattern") {
      // const { readFile, writeFile } = require('fs') -- named imports
      requireInfo.isDefault = false;
      requireInfo.specifiers = [];
      for (let j = 0; j < nameNode.childCount; j++) {
        const prop = nameNode.child(j)!;
        if (prop.type === "shorthand_property_identifier_pattern") {
          requireInfo.specifiers.push(prop.text);
        } else if (prop.type === "pair_pattern") {
          const alias = prop.childForFieldName("value");
          const key = prop.childForFieldName("key");
          requireInfo.specifiers.push(alias?.text ?? key?.text ?? "");
        }
      }
    }

    result.imports.push(requireInfo);
  }
}
```

**AST node types to match (HIGH confidence -- verified against tree-sitter-javascript node-types.json):**

| Pattern | Parent Node | Name Field | Value Field |
|---------|------------|------------|-------------|
| `const x = require('y')` | `variable_declarator` | `identifier` | `call_expression` |
| `const { x } = require('y')` | `variable_declarator` | `object_pattern` | `call_expression` |
| `const [x] = require('y')` | `variable_declarator` | `array_pattern` | `call_expression` |
| `require('y')` (bare) | `expression_statement` | N/A | `call_expression` |
| `module.exports = x` | `assignment_expression` | `member_expression` | expression |

**Import resolution (no changes):** The existing `enhanced-resolve` resolver already has `conditionNames: ["import", "require"]` configured (line 56 of `src/resolver/typescript.ts`). Once `require()` sources are extracted, the same `resolveTypeScriptImport()` function resolves them correctly. The resolver also already handles `.js`, `.cjs`, `.mjs` extensions.

**Edge creation (no changes):** The existing `buildGraph()` in `src/graph/builder.ts` already correctly creates IMPORTS edges from extracted imports (lines 261-309). The bug was solely that `require()` calls were never extracted, so there were zero imports to resolve for CommonJS codebases.

### 2. Semantic Convention Detection

**Problem:** Current ast-grep rules in `src/conventions/rules/typescript/` are generic syntax patterns (async/await, named exports, arrow functions). They miss framework-specific conventions like Fastify plugin architecture, Express middleware chains, or Hono route handler patterns.

**Approach: ast-grep YAML rules for framework-specific patterns (no new deps).**

ast-grep's `kind` + `has` relational rules can match framework-specific structural patterns. The key insight: framework conventions are detectable by their AST shape, not just their syntax.

**Example Fastify plugin convention rule:**

```yaml
# detect-fastify-plugin.yml
id: detect-fastify-plugin
language: JavaScript
rule:
  any:
    - pattern: module.exports = $PLUGIN
    - pattern: module.exports = async function($FASTIFY, $OPTS) { $$$BODY }
    - pattern: module.exports = function($FASTIFY, $OPTS) { $$$BODY }
severity: info
message: "Fastify plugin pattern (module.exports function with fastify, opts parameters)"
```

**Example Fastify route decorator pattern:**

```yaml
# detect-fastify-decorators.yml
id: detect-fastify-decorator
language: JavaScript
rule:
  any:
    - pattern: $FASTIFY.decorate($NAME, $$$ARGS)
    - pattern: $FASTIFY.decorateRequest($NAME, $$$ARGS)
    - pattern: $FASTIFY.decorateReply($NAME, $$$ARGS)
severity: info
message: "Fastify decorator pattern"
```

**Example Fastify route registration:**

```yaml
# detect-fastify-routes.yml
id: detect-fastify-routes
language: JavaScript
rule:
  any:
    - pattern: $FASTIFY.get($PATH, $$$ARGS)
    - pattern: $FASTIFY.post($PATH, $$$ARGS)
    - pattern: $FASTIFY.put($PATH, $$$ARGS)
    - pattern: $FASTIFY.delete($PATH, $$$ARGS)
    - pattern: $FASTIFY.route($$$ARGS)
severity: info
message: "Fastify route registration"
```

**Example Express middleware pattern:**

```yaml
# detect-express-middleware.yml
id: detect-express-middleware
language: TypeScript
rule:
  any:
    - pattern: $APP.use($$$ARGS)
    - pattern: $ROUTER.use($$$ARGS)
severity: info
message: "Express/Connect middleware registration"
```

**Example Hono handler pattern:**

```yaml
# detect-hono-handler.yml
id: detect-hono-handler
language: TypeScript
rule:
  any:
    - pattern: $APP.get($PATH, $$$HANDLERS)
    - pattern: $APP.post($PATH, $$$HANDLERS)
    - pattern: $APP.put($PATH, $$$HANDLERS)
    - pattern: $APP.delete($PATH, $$$HANDLERS)
    - pattern: $APP.patch($PATH, $$$HANDLERS)
    - pattern: $APP.all($PATH, $$$HANDLERS)
severity: info
message: "HTTP route handler pattern"
```

**Framework detection strategy:**

1. During bootstrap, scan `package.json` dependencies to detect which frameworks are present
2. Only load framework-specific rules for detected frameworks (avoid false positives from generic patterns matching unrelated code)
3. Add framework detection to the convention runner as a pre-scan step

**Rule organization:**

```
src/conventions/rules/
  typescript/           # existing generic TS rules (16 rules)
  python/               # existing generic Python rules (3 rules)
  javascript/           # new: CJS-specific generic rules (module.exports patterns)
  frameworks/
    fastify/            # Fastify-specific patterns (plugin, decorator, route, schema)
    express/            # Express-specific patterns (middleware, router, error handler)
    hono/               # Hono-specific patterns (route handler, middleware, context)
    react/              # React-specific patterns (move existing functional-component here)
    nextjs/             # Next.js-specific patterns (page, API route, middleware, server action)
```

**RULE_METADATA update:** The existing `RULE_METADATA` map in `src/conventions/runner.ts` gets new entries for each framework rule. The category field already supports arbitrary strings, so categories like `"fastify-plugin"`, `"express-middleware"`, `"route-handler"` work without schema changes.

**Runner modification:** `runConventionScan()` needs a new optional parameter: `detectedFrameworks: string[]`. This list is built by scanning `package.json` dependencies at bootstrap time. The runner then loads rules from the matching `frameworks/<name>/` directories in addition to the generic rules.

**Confidence:** HIGH -- ast-grep pattern syntax is well-documented. The `any` combinator and `$$$` multi-match metavariable handle the variadic argument patterns frameworks use. Framework-specific rules use the same runner infrastructure (`scanSingleRule` + `runAstGrepScan`) without modification.

### 3. Reference File Injection (Similarity Algorithms)

**Problem:** When a user is about to edit a file, CodeScope should suggest "write this like X" -- finding exemplar files that follow the same conventions and have similar structure.

**Approach: Graph-structural similarity using existing graphology + SQLite infrastructure (no new deps).**

Reference file similarity does NOT need embeddings or vector search. The existing knowledge graph already contains the signals needed:

**Similarity signals (all available in current schema):**

| Signal | Source | Weight | Why |
|--------|--------|--------|-----|
| Same Louvain community | `communities` table | 0.30 | Files in same community are architecturally related |
| Shared import targets | `edges` table (IMPORTS) | 0.25 | Files importing same modules serve similar purposes |
| Same directory | `nodes.file_path` | 0.15 | Co-located files typically follow same patterns |
| Same convention set | `convention-index.json` | 0.20 | Files following same conventions are structural peers |
| Similar LOC range | `nodes.loc` | 0.10 | Similar-sized files are better exemplars |

**Algorithm: Weighted Jaccard similarity on feature vectors.**

```typescript
// No new deps -- uses existing SQLite queries + convention index

interface FileSimilarityFeatures {
  communityId: number;
  importTargets: Set<string>;    // resolved file paths this file imports
  directory: string;             // path.dirname(file_path)
  conventions: Set<string>;      // convention names from convention-index.json
  loc: number;                   // lines of code
}

function computeSimilarity(a: FileSimilarityFeatures, b: FileSimilarityFeatures): number {
  let score = 0;

  // Community match (binary)
  if (a.communityId === b.communityId) score += 0.30;

  // Shared imports (Jaccard)
  const importUnion = new Set([...a.importTargets, ...b.importTargets]);
  const importIntersect = [...a.importTargets].filter(x => b.importTargets.has(x));
  if (importUnion.size > 0) score += 0.25 * (importIntersect.length / importUnion.size);

  // Same directory (binary, partial credit for sibling dirs)
  if (a.directory === b.directory) score += 0.15;
  else if (path.dirname(a.directory) === path.dirname(b.directory)) score += 0.05;

  // Convention overlap (Jaccard)
  const convUnion = new Set([...a.conventions, ...b.conventions]);
  const convIntersect = [...a.conventions].filter(x => b.conventions.has(x));
  if (convUnion.size > 0) score += 0.20 * (convIntersect.length / convUnion.size);

  // LOC similarity (ratio-based, closer = higher)
  const locRatio = Math.min(a.loc, b.loc) / Math.max(a.loc, b.loc);
  score += 0.10 * locRatio;

  return score;
}
```

**Why NOT vector embeddings:** The project constraints explicitly defer semantic search to V3 (`@lancedb/lancedb + Ollama`). Graph-structural similarity is sufficient because reference files need to be structurally similar (same patterns, same imports), not semantically similar (same meaning). A file with the same imports and conventions IS the right exemplar for "write this like X."

**Why NOT tree edit distance:** Academic literature (arxiv:2404.08817) confirms AST edit distance works but is O(n^2 * m^2) per comparison -- impractical at bootstrap time for 1000+ file codebases. Weighted Jaccard on pre-computed feature vectors is O(n) per comparison.

**Candidate scoping:** Only compare against files in the same Louvain community (+ adjacent communities via BFS depth=1 on the community graph). This bounds the comparison set to ~20-50 files instead of the full codebase, making O(n) comparison per file fast enough (<100ms for the entire set).

**Integration with injection hooks:** The top-k similar files (k=3) get added to the convention-index.json artifact as a new `referenceFiles` field per file entry. The PreToolUse hook already reads convention-index.json and composes budget-limited injection messages. The golden file ranking from `src/conventions/golden-files.ts` can be used as a tiebreaker when similarity scores are equal.

**Artifact schema extension:**

```typescript
// Add to src/artifacts/types.ts
export interface ConventionFileEntry {
  name: string;
  adoption_pct: number;
  confidence: string;
  category: string;
}

// New -- extend per-file entry in convention index
export interface ConventionIndexFileData {
  conventions: ConventionFileEntry[];
  referenceFiles?: ReferenceFileEntry[];  // NEW: top-k similar files
}

export interface ReferenceFileEntry {
  filePath: string;       // relative path to the reference file
  similarity: number;     // 0.0-1.0 composite score
  reason: string;         // human-readable: "same community, 3 shared imports"
}
```

### 4. Plugin Distribution (Marketplace + Manifest)

**Problem:** The existing `.claude-plugin/marketplace.json` and `plugin.json` need fixes for correct Claude Code marketplace integration.

**Current state analysis:**

The existing `plugin.json` is minimal and has issues:
```json
{
  "name": "codescope",
  "version": "0.1.0",
  "description": "...",
  "author": { "name": "Jay Wadhwa", "url": "..." },
  "repository": "...",
  "license": "MIT",
  "skills": "./skills/",
  "mcpServers": "./.mcp.json"
}
```

**Issues to fix (verified against official Claude Code docs at code.claude.com/docs/en/plugin-marketplaces):**

1. **`version` mismatch:** `plugin.json` says `0.1.0` but should match milestone version. When marketplace.json and plugin.json both declare a version, plugin.json wins silently.

2. **`CLAUDE_PLUGIN_ROOT` fallback in .mcp.json:** Uses `${CLAUDE_PLUGIN_ROOT:-./}` which works for local dev but the fallback `./` may resolve incorrectly when installed from a marketplace (plugins are copied to `~/.claude/plugins/cache/`). For marketplace distribution, use `${CLAUDE_PLUGIN_ROOT}` without fallback.

3. **Missing `hooks` field:** The plugin has hooks at `hooks/hooks.json` but `plugin.json` does not declare the `hooks` field. Claude Code auto-discovers from standard directories, but explicit declaration is more reliable.

4. **`author.url` not in schema:** The `author` object supports `name` (required) and `email` (optional). The `url` field is not part of the author schema; use `homepage` or `repository` instead.

5. **Missing `keywords`/`category`:** Not required but recommended for marketplace discoverability.

**Marketplace schema (verified -- all fields confirmed against official docs):**

Required: `name`, `owner` (with `name`), `plugins` array
Each plugin requires: `name`, `source`
Plugin optional: `description`, `version`, `author`, `homepage`, `repository`, `license`, `keywords`, `category`, `tags`, `strict`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`

Source types:
- Relative path: `"./plugins/my-plugin"` (string starting with `./`)
- GitHub: `{ "source": "github", "repo": "owner/repo", "ref?": "tag", "sha?": "commit" }`
- Git URL: `{ "source": "url", "url": "https://...", "ref?": "...", "sha?": "..." }`
- Git subdirectory: `{ "source": "git-subdir", "url": "...", "path": "...", "ref?": "...", "sha?": "..." }`
- npm: `{ "source": "npm", "package": "@scope/pkg", "version?": "^1.0", "registry?": "..." }`

**Corrected marketplace.json:**

```json
{
  "name": "codescope-marketplace",
  "owner": {
    "name": "Jay Wadhwa"
  },
  "metadata": {
    "description": "CodeScope plugin marketplace - deep codebase intelligence for Claude Code",
    "version": "1.0.0"
  },
  "plugins": [
    {
      "name": "codescope",
      "source": {
        "source": "github",
        "repo": "jwadhwa2259/codescope"
      },
      "description": "Deep codebase understanding for Claude Code",
      "category": "code-analysis",
      "tags": ["codebase-analysis", "conventions", "knowledge-graph", "brownfield"],
      "keywords": ["analysis", "conventions", "graph", "intelligence"]
    }
  ]
}
```

**Corrected plugin.json:**

```json
{
  "name": "codescope",
  "version": "2.1.0",
  "description": "Deep codebase understanding for Claude Code",
  "author": {
    "name": "Jay Wadhwa"
  },
  "repository": "https://github.com/jwadhwa2259/codescope",
  "homepage": "https://github.com/jwadhwa2259/codescope",
  "license": "MIT",
  "keywords": ["analysis", "conventions", "graph", "intelligence"],
  "skills": "./skills/",
  "hooks": "./hooks/hooks.json",
  "mcpServers": "./.mcp.json"
}
```

**Key fixes:**
- Add `hooks` field explicitly pointing to `hooks/hooks.json`
- Remove `url` from author (not in official schema)
- Add `homepage` (valid field)
- Add `keywords` for discoverability
- Version bumped to match milestone
- Do NOT set `version` in marketplace.json plugin entry (avoid silent conflict with plugin.json)

**CLAUDE_PLUGIN_ROOT fix for .mcp.json:**

```json
{
  "mcpServers": {
    "codescope": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/server.mjs"],
      "env": {
        "CODESCOPE_GRAMMAR_DIR": "${CLAUDE_PLUGIN_ROOT}/grammars"
      }
    }
  }
}
```

Remove the `:-./` fallback. For local development, set `CLAUDE_PLUGIN_ROOT` to the project root, or use `--plugin-dir ./` when testing with `claude`.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Weighted Jaccard similarity (graph features) | Vector embeddings (@lancedb/lancedb + Ollama) | V3 when semantic search lands. Jaccard on structural features is sufficient for "write like X" exemplar selection. Embeddings add 500MB+ model weight and inference latency. |
| ast-grep YAML rules for framework detection | Custom tree-sitter queries via web-tree-sitter | When ast-grep cannot express a pattern (extremely rare -- ast-grep supports all tree-sitter node types). Custom tree-sitter is more code to maintain. |
| ast-grep YAML rules for framework detection | @ast-grep/napi (programmatic) | When convention detection is on a hot path. For bootstrap-time scanning, CLI is simpler and avoids native addon. |
| package.json dependency scan for framework detection | AST-based framework import detection | If package.json is unreliable (e.g., transitive-only deps). Both approaches complement each other. |
| Graph distance for reference files | TF-IDF on token bags | When you need content-level similarity (same variable names). Graph distance captures architectural similarity better for convention enforcement use case. |
| GitHub source for marketplace | npm source | When you want versioned releases via npm registry. GitHub source is simpler for single-repo plugin. npm source adds publish workflow overhead. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| @lancedb/lancedb for reference files | V3 feature; adds 500MB+ model dependency, unnecessary for structural similarity | Weighted Jaccard on graph features (community, imports, conventions, LOC) |
| Ollama / local LLMs for convention detection | Adds infrastructure dependency, nondeterministic results, latency | Deterministic ast-grep YAML rules |
| Custom tree-sitter walker for CJS detection | More code to maintain, harder to test, duplicates what ast-grep does | Extend existing `extractFromSource()` with CJS-specific branches |
| Dynamic require() detection (computed paths) | `require(variable)` is unresolvable statically; too many false positives | Only extract string literal require sources: `require('string-literal')` |
| Tree edit distance for file similarity | O(n^2 * m^2) complexity per comparison; academic, not practical for real-time | Weighted Jaccard on pre-computed feature vectors (O(n) per comparison) |
| New npm dependencies for any v2.1 feature | Unnecessary complexity; all features map to existing infrastructure | Extend existing web-tree-sitter, ast-grep, graphology, SQLite usage |

## Stack Patterns by Variant

**CommonJS-heavy codebases (like Fastify):**
- Extract both `import_statement` AND `call_expression` (require) nodes from tree-sitter AST
- Use `language: JavaScript` in ast-grep rules for CJS-specific patterns (not `TypeScript`) since CJS files use `.js`
- The enhanced-resolve resolver already handles `.cjs` extension and CommonJS `main` field; no config changes needed
- `module.exports` patterns should be extracted as exports (new export kind: `"cjs-export"`)

**ESM codebases (like h3):**
- Import extraction already works (`import_statement` nodes)
- Need to verify the full IMPORTS edge creation pipeline end-to-end: extract -> resolve -> edge write
- ESM `export` statements already fully extracted
- Dynamic `import()` expressions should also be handled as `call_expression` similar to `require()` (secondary priority)

**Mixed codebases (ESM + CJS interop):**
- Both extraction paths active simultaneously
- enhanced-resolve handles `conditionNames: ["import", "require"]` which covers both module systems
- Convention rules should detect module system consistency as a convention itself (e.g., "This codebase uses ESM exclusively")

**Framework-specific convention detection:**
- Scan `package.json` dependencies first to determine which framework rule sets to load
- Only run applicable rules (don't run Fastify rules on a Hono codebase)
- Framework rules live in `src/conventions/rules/frameworks/<name>/` directory
- `runConventionScan()` needs a new `detectedFrameworks` parameter for scoping

## Version Compatibility

No new packages, so no new compatibility concerns. Existing compatibility matrix from CLAUDE.md remains valid:

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| web-tree-sitter@0.25.10 | tree-sitter-cli@^0.25.x | CJS node types (call_expression, variable_declarator, object_pattern) are stable across all 0.25.x versions |
| ast-grep CLI@^0.40.5 | JavaScript + TypeScript languages | Framework-specific rules use same pattern syntax; `any` combinator and `$$$` multi-match work for both languages |
| enhanced-resolve@^5.20.1 | CommonJS + ESM | Already configured with both `import` and `require` condition names; handles `.cjs`, `.mjs`, `.js` |
| Claude Code plugin schema | marketplace.json + plugin.json | Schema verified against official docs (code.claude.com, March 2026); `source`, `category`, `tags`, `keywords`, `strict` all confirmed |

## Critical Implementation Notes

### CommonJS require() Extraction Scope

The extractor must handle `require()` calls that appear:
1. At the top level (`const x = require('y')`) -- `lexical_declaration` or `variable_declaration` child of `program`
2. Inside `expression_statement` (bare `require('y')` for side effects)
3. **NOT** inside function bodies or conditionals -- those are dynamic requires and unresolvable statically

Only extract `require()` with string literal arguments. Computed requires (`require(variable)`) cannot be statically resolved and should be silently skipped.

### module.exports Detection for Export Completeness

For CommonJS export detection, match these tree-sitter patterns:
- `assignment_expression` where left is `member_expression` with text `module.exports` -- `kind: "default"` export
- `assignment_expression` where left is `member_expression` `module.exports.foo` -- named CJS export
- `assignment_expression` where left is `member_expression` `exports.foo` -- shorthand named CJS export

### ast-grep Rule Language Field for CJS

CommonJS files typically use `.js` extension. In ast-grep YAML rules, use `language: JavaScript` for CJS-specific patterns. The existing TypeScript rules handle `.ts`/`.tsx` files. The runner needs to route `.js` files through both JavaScript and TypeScript rule sets (since `.js` files in TypeScript projects may use ESM syntax).

### Reference File Pre-computation

Compute similarity scores at bootstrap/incremental-rebuild time, not at hook invocation time. Store top-k reference files per file in the injection artifact JSON. This keeps hook latency under 50ms (reading pre-computed JSON) rather than running graph queries on every Edit/Write. The existing `generateInjectionArtifacts()` in `src/artifacts/generator.ts` is the right place to add this computation.

### Plugin Manifest Version Sync

The `version` field must be consistent across `package.json` and `.claude-plugin/plugin.json`. When the marketplace entry and plugin.json both declare a version, the plugin.json version wins silently (per official docs). Set version in plugin.json; omit from marketplace.json plugin entry to avoid silent conflicts.

### ESM Edge Creation Bug Investigation

The v2.0 eval showed 0 edges even on ESM codebases (h3). This means the bug may not be limited to missing `require()` extraction. The edge creation pipeline needs end-to-end verification:
1. Are imports extracted correctly? (check `parseResult.imports`)
2. Does the resolver find the target file? (check `resolveTypeScriptImport` return value)
3. Is the resolved path within the project? (check `resolvedRelative` calculation)
4. Is the target node found for edge creation? (check `processBatchFiles` edge resolution)

Any of these steps could silently fail. Add logging/error reporting at each step during development.

## Confidence Assessment

| Technology / Approach | Confidence | Reason |
|-----------------------|------------|--------|
| CommonJS require() AST extraction via tree-sitter | HIGH | tree-sitter-javascript node-types.json verified: `call_expression` with `identifier` "require" is the standard pattern. Same approach used by every tree-sitter-based CJS analyzer. |
| Enhanced-resolve for CJS import resolution | HIGH | Already configured with `conditionNames: ["import", "require"]`. Handles `.cjs`, `.js`, CommonJS `main` field in package.json. No code changes needed in resolver. |
| ast-grep framework-specific rules | HIGH | Pattern syntax supports `any` combinator, `$$$` multi-match, `kind` + `has` relational rules. All patterns needed for framework detection (plugin patterns, middleware registration, route handlers) are expressible. Verified against ast-grep docs. |
| Weighted Jaccard for reference file similarity | MEDIUM | Algorithm is straightforward but weight tuning (0.30/0.25/0.20/0.15/0.10) is heuristic. May need adjustment based on eval results. The approach is sound -- the specific weights need empirical validation. |
| Claude Code marketplace schema | HIGH | Official documentation verified (code.claude.com/docs/en/plugin-marketplaces, March 2026). Schema fields confirmed. Source types documented. |
| No new dependencies needed | HIGH | Every feature maps to existing infrastructure. CommonJS extraction = web-tree-sitter. Conventions = ast-grep CLI. Similarity = SQLite + graphology. Distribution = JSON schema files. |

## Sources

- [tree-sitter-javascript GitHub](https://github.com/tree-sitter/tree-sitter-javascript) -- node-types.json verified for call_expression, variable_declarator, object_pattern, identifier fields
- [tree-sitter static node types docs](https://tree-sitter.github.io/tree-sitter/using-parsers/6-static-node-types.html) -- AST structure reference for JavaScript grammar
- [ast-grep pattern syntax](https://ast-grep.github.io/guide/pattern-syntax.html) -- pattern matching with `$` metavariables and `$$$` multi-match
- [ast-grep atomic rules](https://ast-grep.github.io/guide/rule-config/atomic-rule.html) -- kind, pattern, regex, has rule types
- [ast-grep rule configuration](https://ast-grep.github.io/guide/rule-config.html) -- relational rules (has, inside, follows, precedes)
- [Claude Code plugin marketplaces docs](https://code.claude.com/docs/en/plugin-marketplaces) -- full marketplace schema, source types, strict mode, CLAUDE_PLUGIN_ROOT, version resolution
- [Anthropic claude-code marketplace.json](https://github.com/anthropics/claude-code/blob/main/.claude-plugin/marketplace.json) -- reference marketplace structure
- [Revisiting Code Similarity with AST Edit Distance](https://arxiv.org/abs/2404.08817) -- academic reference; confirms structural feature comparison outperforms token-only approaches; validates Jaccard on structural features as practical alternative to tree edit distance
- Existing codebase verified: `src/parser/extract.ts` (import extraction), `src/graph/builder.ts` (edge creation), `src/conventions/runner.ts` (convention scanning), `src/resolver/typescript.ts` (enhanced-resolve config), `src/artifacts/types.ts` (injection artifact schema), `.claude-plugin/plugin.json` and `marketplace.json` (current state)

---
*Stack research for: CodeScope v2.1 Eval Fixes*
*Researched: 2026-03-30*
