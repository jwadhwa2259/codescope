# Phase 18: Semantic Conventions - Research

**Researched:** 2026-03-30
**Domain:** Convention detection pipeline, framework-specific AST pattern matching, file classification
**Confidence:** HIGH

## Summary

Phase 18 transforms CodeScope's convention detection from generic syntax matching to codebase-aware intelligence. The phase addresses five requirements: golden file noise filtering (CONV-03), cross-language density correction (CONV-04), framework detection from package.json (CONV-05), framework-specific ast-grep rules (CONV-06), and file-role classification (CONV-07).

The existing codebase is well-structured for these additions. The convention pipeline (`runner.ts` -> `golden-files.ts` -> `types.ts`) has clear extension points. The `runAstGrepScan()` function scans a single directory of `.yml` files -- it needs to be called per-framework-directory (or made recursive). The `countApplicableFiles()` function already skips test files but needs extending for config/generated/deprecated. The `rankGoldenFiles()` function divides by total convention count regardless of language -- the cross-language bug is clearly visible at `golden-files.ts:28-29`. The `RULE_METADATA` map in `runner.ts` is duplicated verbatim in `rule-filter.ts:17-36` -- refactoring to a shared module eliminates a maintenance risk.

**Primary recommendation:** Implement in dependency order: (1) shared RULE_METADATA module, (2) file-role classifier, (3) framework detection, (4) framework-specific rules, (5) golden file filtering + language fix, (6) readiness cap + integration validation. All ast-grep YAML patterns have been verified against real framework code on the host machine using `sg 0.42.0`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Detect frameworks by scanning `package.json` `dependencies` + `devDependencies` for known framework package names. No AST-based detection needed -- package.json is authoritative.
- **D-02:** Minimum 3 frameworks supported: Fastify, Express, h3.
- **D-03:** Store detected frameworks as `string[]`. Pass to `runConventionScan()` as new parameter. Default to empty array.
- **D-04:** Extend `detectProject()` in `src/onboard/detect.ts` or create a focused `detectFrameworks()` function. Call from `runConventionDetector()`.
- **D-05:** Rules organized in `src/conventions/rules/frameworks/{name}/` subdirectories.
- **D-06:** Only load framework rules for detected frameworks. If Fastify not in package.json, its rules never run.
- **D-07:** Runner needs recursive rule discovery or per-framework-directory calls.
- **D-08:** Update `RULE_METADATA` map with entries for every new framework rule.
- **D-09:** Framework rule categories use framework prefix: `fastify-plugin`, `fastify-routing`, `express-middleware`, `h3-handler`, etc.
- **D-10:** Framework-specific ast-grep rules to create (Fastify: plugin signature, route registration, hooks, decorators; Express: middleware chaining, error handler, router; h3: defineEventHandler, readBody, getQuery, setResponseStatus).
- **D-11:** Exclude from golden file rankings: test files, config files, generated files, deprecated files -- using filename-based pattern matching.
- **D-12:** Filtering in two places: `rankGoldenFiles()` filters noise, `countApplicableFiles()` extends to skip generated/config/deprecated.
- **D-13:** Safety fallback: if filtering removes ALL files, fall back to unfiltered ranking with logged warning.
- **D-14:** Fix cross-language density bug: golden file density calculated per-language.
- **D-15:** File language from extension: `.ts/.tsx/.js/.jsx` = TypeScript, `.py` = Python.
- **D-16:** No type change to `ConventionResult` required -- language inferred from ruleId via `getRuleLanguage()`.
- **D-17:** New module `src/classifier/file-role.ts`.
- **D-18:** 5 core roles: `test`, `config`, `route-handler`, `utility`, `deprecated`. Plus `general` as fallback.
- **D-19:** 3-tier signal chain: filename patterns > path patterns > content patterns.
- **D-20:** Post-filter approach: scan ALL files with all applicable rules, then filter matches by file-role applicability.
- **D-21:** Store classification in existing `metadata` JSON column on `nodes` table: `{"role": "utility", "roleConfidence": 0.92}`. No schema migration.
- **D-22:** Rule-to-role applicability mapping: which rules apply to which roles. Framework rules apply only to route-handler + middleware roles.
- **D-23:** Unclassified files get role `general` -- all rules apply.
- **D-24:** Refactor `RULE_METADATA` to a shared module imported by both `runner.ts` and `rule-filter.ts`.
- **D-25:** Cap readiness convention impact: `highConfidenceConventions` capped at `min(actual_count, totalSourceFiles)`.
- **D-26:** Validate 500-token hook injection budget with 10+ convention matches.
- **D-27:** All convention consumers use canonical `parseDetectorConventions()` from `src/conventions/parser.ts`.
- **D-28:** CI-style validation: scan all `.yml` rule files for duplicate ruleIds, verify metadata entries, verify framework directory names.

### Claude's Discretion
- Whether to make `findAllRuleFiles()` recursive in runner.ts vs calling `runAstGrepScan()` per framework directory
- Exact ast-grep YAML pattern syntax for each framework rule
- Whether file-role classification uses confidence scores or boolean classification
- Whether to add `barrel` and `middleware` as additional roles beyond the 5 required

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CONV-03 | Golden file ranking excludes deprecated, test, generated, and config files from top exemplars | Verified: `rankGoldenFiles()` at golden-files.ts:19-57 has no filtering. D-11/D-12/D-13 define the approach. Filename patterns identified. |
| CONV-04 | Golden file ranking filters convention applicability by language | Verified: Bug at golden-files.ts:28 where `totalConventions = conventions.length` counts ALL conventions regardless of language. Fix: partition by language using `getRuleLanguage()`. |
| CONV-05 | Framework detection from package.json dependencies | Verified: `detectProject()` at onboard/detect.ts already reads package.json (line 33). Extension adds known framework name lookup in `dependencies` + `devDependencies`. |
| CONV-06 | Framework-specific ast-grep rules detect patterns beyond generic syntax | Verified: All 10+ framework patterns tested live on host machine with sg 0.42.0. YAML rule syntax validated for Fastify (plugin, route, hook, decorator), Express (middleware, route, error handler), and h3 (defineEventHandler, utility functions). |
| CONV-07 | File-role classification prevents false positives in convention matching | Verified: `is_test` detection already exists in builder.ts:187-190 using same filename patterns. New `src/classifier/file-role.ts` module extends this to 5 roles. `metadata` JSON column on nodes table supports arbitrary data without migration. |
</phase_requirements>

## Standard Stack

No new libraries needed. This phase uses the existing technology stack exclusively.

### Core (Already Installed)
| Library | Version | Purpose | Phase 18 Usage |
|---------|---------|---------|----------------|
| @ast-grep/cli (sg) | 0.42.0 | Structural pattern matching | New framework-specific YAML rules in `rules/frameworks/{name}/` |
| better-sqlite3 | ^12.8.0 | Knowledge graph storage | Write file-role metadata to `nodes.metadata` JSON column |
| vitest | 4.1.0 | Test framework | Unit tests for classifier, golden files, framework detection |

### No New Dependencies
All Phase 18 functionality is implemented through:
- New YAML rule files (ast-grep patterns)
- New TypeScript modules (file-role classifier, framework detection)
- Modifications to existing modules (runner, golden-files, rule-filter, orchestrator)

## Architecture Patterns

### Recommended Module Structure
```
src/
  classifier/
    file-role.ts          # NEW: File role classification
    types.ts              # NEW: FileRole type, RoleApplicability map
  conventions/
    rule-metadata.ts      # NEW: Shared RULE_METADATA (extracted from runner.ts)
    runner.ts             # MODIFY: Import shared metadata, add framework scanning
    golden-files.ts       # MODIFY: Add filtering + per-language density
    parser.ts             # UNCHANGED: Canonical parser
    types.ts              # MINOR: Add optional role field to GoldenFileEntry
    rules/
      typescript/*.yml    # UNCHANGED: 15 existing generic rules
      python/*.yml        # UNCHANGED: 3 existing Python rules
      frameworks/
        fastify/          # NEW: 4 rules
        express/          # NEW: 3 rules
        h3/               # NEW: 2 rules
  onboard/
    detect.ts             # MODIFY: Add detectFrameworks() function
  enforcement/
    rule-filter.ts        # MODIFY: Import shared RULE_METADATA instead of duplicate
  bootstrap/
    orchestrator.ts       # MODIFY: Pass detected frameworks, cap readiness
```

### Pattern 1: Shared RULE_METADATA Module
**What:** Extract RULE_METADATA from runner.ts into `src/conventions/rule-metadata.ts`. Both `runner.ts` and `rule-filter.ts` import from the shared module.
**When to use:** Immediately -- this is a prerequisite for all other changes.
**Why:** Eliminates the duplicated map that risks enforcement breaking when new framework rules are added (D-24). rule-filter.ts currently has a manual copy (lines 17-36) that must be kept in sync.
**Example:**
```typescript
// src/conventions/rule-metadata.ts
export interface RuleMetadataEntry {
  name: string;
  category: string;
}

export const RULE_METADATA: Record<string, RuleMetadataEntry> = {
  // Existing 15 TypeScript + 3 Python rules
  "prefer-named-exports": { name: "Prefer Named Exports", category: "exports" },
  // ... all existing entries ...

  // Framework: Fastify
  "fastify-plugin-signature": { name: "Fastify Plugin Signature", category: "fastify-plugin" },
  "fastify-route-handler": { name: "Fastify Route Handler", category: "fastify-routing" },
  "fastify-hook": { name: "Fastify Hook Registration", category: "fastify-hooks" },
  "fastify-decorator": { name: "Fastify Decorator", category: "fastify-decorators" },

  // Framework: Express
  "express-middleware": { name: "Express Middleware", category: "express-middleware" },
  "express-route-handler": { name: "Express Route Handler", category: "express-routing" },
  "express-error-handler": { name: "Express Error Handler", category: "express-error-handling" },

  // Framework: h3
  "h3-event-handler": { name: "h3 Event Handler", category: "h3-handler" },
  "h3-utility-functions": { name: "h3 Utility Functions", category: "h3-utilities" },
};

// Derived maps for rule-filter.ts
export const RULE_NAME_TO_ID = new Map(
  Object.entries(RULE_METADATA).map(([id, meta]) => [meta.name, id])
);
export const RULE_ID_TO_NAME = new Map(
  Object.entries(RULE_METADATA).map(([id, meta]) => [id, meta.name])
);
```

### Pattern 2: Framework Detection
**What:** Scan package.json dependencies for known framework names, return `string[]`.
**When to use:** During bootstrap, before convention scanning.
**Example:**
```typescript
// In src/onboard/detect.ts or standalone function
const KNOWN_FRAMEWORKS: Record<string, string> = {
  fastify: "fastify",
  express: "express",
  h3: "h3",
  "hono": "hono",           // future
  "@hapi/hapi": "hapi",     // future
};

export function detectFrameworks(projectRoot: string): string[] {
  const pkgPath = path.join(projectRoot, "package.json");
  if (!fs.existsSync(pkgPath)) return [];

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  return Object.keys(KNOWN_FRAMEWORKS)
    .filter((dep) => dep in allDeps)
    .map((dep) => KNOWN_FRAMEWORKS[dep]);
}
```

### Pattern 3: File Role Classification
**What:** Classify files into roles based on filename, path, and optional content signals.
**When to use:** During graph building (extend `is_test` logic) and convention post-filtering.
**Example:**
```typescript
// src/classifier/file-role.ts
export type FileRole = "test" | "config" | "route-handler" | "utility" | "deprecated" | "general";

export function classifyFileRole(filePath: string): { role: FileRole; confidence: number } {
  const basename = path.basename(filePath);
  const dir = path.dirname(filePath);

  // Tier 1: Filename patterns (highest confidence)
  if (/\.(test|spec)\.(ts|tsx|js|jsx)$/.test(basename)) return { role: "test", confidence: 0.95 };
  if (/\.(config|rc)\.(ts|tsx|js|jsx|json|yml|yaml)$/.test(basename)) return { role: "config", confidence: 0.95 };
  if (/tsconfig|jest\.config|vitest\.config|\.eslintrc|\.prettierrc/.test(basename)) return { role: "config", confidence: 0.95 };
  if (/deprecated|legacy|obsolete/i.test(basename)) return { role: "deprecated", confidence: 0.90 };

  // Tier 2: Path patterns
  if (/__tests__|\/tests?\/|\/test\//.test(filePath)) return { role: "test", confidence: 0.85 };
  if (/\/routes?\/|\/api\/|\/handlers?\/|\/controllers?\//.test(dir)) return { role: "route-handler", confidence: 0.80 };
  if (/\/utils?\/|\/helpers?\/|\/lib\/|\/shared\//.test(dir)) return { role: "utility", confidence: 0.80 };

  // Tier 3: Fallback
  return { role: "general", confidence: 0.50 };
}
```

### Pattern 4: Per-Language Golden File Density
**What:** Calculate golden file density using only conventions matching the file's language.
**When to use:** In `rankGoldenFiles()`.
**Example:**
```typescript
// Fix for golden-files.ts
export function rankGoldenFiles(
  conventions: ConventionResult[],
  maxFiles: number = 5,
): GoldenFileEntry[] {
  // Partition conventions by language
  const tsByRule = conventions.filter(c => !c.ruleId.startsWith("python-"));
  const pyByRule = conventions.filter(c => c.ruleId.startsWith("python-"));

  // For each file, use only same-language convention count
  for (const [filePath, conventionsFollowed] of fileConventionCount) {
    const isPython = filePath.endsWith(".py");
    const applicableConventions = isPython ? pyByRule.length : tsByRule.length;
    const density = applicableConventions > 0 ? conventionsFollowed / applicableConventions : 0;
    // ...
  }
}
```

### Pattern 5: Rule-to-Role Applicability Filtering (Post-filter approach per D-20)
**What:** After scanning all files with all rules, filter out matches where the rule doesn't apply to the file's role.
**Example:**
```typescript
// In rule-metadata.ts or a separate applicability module
export const RULE_ROLE_APPLICABILITY: Record<string, FileRole[]> = {
  // Generic rules: apply broadly
  "prefer-named-exports": ["utility", "route-handler", "general"],
  "explicit-return-type": ["utility", "route-handler", "general"],
  // ... most generic rules apply to utility + route-handler + general

  // Framework rules: apply only to route-handler (+ general as fallback)
  "fastify-route-handler": ["route-handler", "general"],
  "fastify-plugin-signature": ["route-handler", "general"],
  "fastify-hook": ["route-handler", "general"],
  "fastify-decorator": ["route-handler", "utility", "general"],
  "express-middleware": ["route-handler", "general"],
  "express-route-handler": ["route-handler", "general"],
  "express-error-handler": ["route-handler", "general"],
  "h3-event-handler": ["route-handler", "general"],
  "h3-utility-functions": ["route-handler", "utility", "general"],
};
```

### Anti-Patterns to Avoid
- **Pre-filtering files before scan:** D-20 explicitly requires post-filter. Pre-filtering risks losing scan data when classification is wrong.
- **Adding framework rules to generic `typescript/` directory:** Framework rules MUST live in `frameworks/{name}/` and only load when the framework is detected (D-05/D-06).
- **Modifying ConventionResult type for language:** Language is already derivable from ruleId via `getRuleLanguage()`. Adding a field creates sync risk.
- **Custom parsing in new code:** All consumers MUST use `parseDetectorConventions()` from `parser.ts` (D-27).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| AST pattern matching | Custom tree-sitter traversal | ast-grep YAML rules | ast-grep handles tree-sitter grammar details, pattern ambiguity, meta-variables. 15 existing rules prove the approach works. |
| Framework detection | AST-based import analysis | package.json dependency lookup | package.json is authoritative (D-01). AST analysis would be slower, more complex, and still need package.json for version info. |
| Convention markdown parsing | Local regex parsers | `parseDetectorConventions()` | Canonical parser already handles h3+table format. Duplicating is how CONV-01 bug happened. |

## Common Pitfalls

### Pitfall 1: ast-grep Pattern Ambiguity with Method Calls
**What goes wrong:** A pattern like `$APP.get($PATH, $HANDLER)` matches ANY method call named `get()` on ANY object -- not just Express/Fastify route handlers.
**Why it happens:** ast-grep patterns match structural AST patterns without semantic type information. `Map.get()`, `cache.get()`, `localStorage.get()` all match.
**How to avoid:** Framework rules ONLY load when the framework is detected in package.json (D-06). This makes false positives irrelevant for non-framework projects. For framework projects, the adoption percentage calculation naturally handles some noise (a few Map.get() calls among dozens of route handlers dilutes minimally). Accept this tradeoff -- semantic type analysis would require the full TypeScript compiler.
**Warning signs:** Extremely high match counts on files that clearly aren't route handlers. Golden files showing utility modules as top exemplars despite framework rules.

### Pitfall 2: RULE_METADATA Desync After Adding Framework Rules
**What goes wrong:** New framework rules are added as `.yml` files but `RULE_METADATA` in runner.ts is not updated. Convention names display as ruleId instead of human-readable names. Enforcement module (`rule-filter.ts`) has a separate copy that falls even further out of sync.
**Why it happens:** Two manual maps that must mirror each other (D-24 identifies this).
**How to avoid:** Extract to shared `rule-metadata.ts` module FIRST (Wave 1). Add D-28 validation: automated check that every `.yml` ruleId has a corresponding RULE_METADATA entry.
**Warning signs:** Convention names in conventions.md showing raw ruleIds like `fastify-route-handler` instead of "Fastify Route Handler".

### Pitfall 3: Readiness Score Inflation from Framework Rules
**What goes wrong:** Adding 9 new framework rules that all detect as HIGH-CONF on a small framework project could jump `highConfidenceConventions` from 5 to 14, inflating the readiness convention dimension from 25% to 70%.
**Why it happens:** Readiness uses `highConfidenceConventions / totalSourceFiles * 100`. More rules = more HIGH-CONF conventions = higher score, even though the codebase hasn't changed.
**How to avoid:** Apply D-25 cap: `Math.min(highConfidenceConventions, totalSourceFiles)` in the orchestrator before passing to `computeReadiness()`. Add regression test comparing bootstrap output before and after framework rules on same codebase.
**Warning signs:** Readiness grade jumping more than one letter grade (5+ percentage points) when no code changed.

### Pitfall 4: Golden File Filter Removing ALL Files
**What goes wrong:** On a tiny project where every file is a test, config, or generated file, the golden file list becomes empty.
**Why it happens:** Aggressive filtering with no fallback.
**How to avoid:** D-13 safety fallback: if filtering removes ALL files, fall back to unfiltered ranking with a logged warning.
**Warning signs:** Empty golden-files.md on small projects.

### Pitfall 5: Cross-Language Density Still Wrong After Fix
**What goes wrong:** Fix calculates per-language convention count but forgets that framework rules also have a language (TypeScript). The `getRuleLanguage()` function only checks for `python-` prefix, so framework rules like `fastify-route-handler` are treated as TypeScript, which is correct. But `h3-event-handler` could be confused for Python if the function doesn't handle the new prefix correctly.
**Why it happens:** `getRuleLanguage()` uses prefix-based heuristic.
**How to avoid:** Framework rules all use TypeScript syntax. Verify `getRuleLanguage()` returns "TypeScript" for all framework ruleIds (they don't start with `python-`). Add explicit test.
**Warning signs:** Python file density calculations including Fastify/Express/h3 convention counts.

### Pitfall 6: rule-filter.ts Build Isolation Violation
**What goes wrong:** The enforcement module (`rule-filter.ts`) deliberately avoids importing from `runner.ts` to prevent pulling in `execFileSync` and other heavy dependencies. Moving RULE_METADATA to a shared module must maintain this isolation.
**Why it happens:** The new shared module could transitively import heavy dependencies.
**How to avoid:** `rule-metadata.ts` MUST be a pure data module with ZERO imports from runner.ts, node:child_process, or any other heavy module. It exports only data constants and derived Maps.
**Warning signs:** The enforcement module (pre-commit hook) suddenly takes 500ms+ to load, or fails with missing native module errors.

## Code Examples

### Verified ast-grep YAML Rules

All patterns below were tested live on the host machine with `sg 0.42.0` against real framework code and confirmed to produce correct matches.

#### Fastify Route Handler
```yaml
# src/conventions/rules/frameworks/fastify/fastify-route-handler.yml
id: fastify-route-handler
language: TypeScript
rule:
  any:
    - pattern: "$APP.get($PATH, $$$HANDLER)"
    - pattern: "$APP.post($PATH, $$$HANDLER)"
    - pattern: "$APP.put($PATH, $$$HANDLER)"
    - pattern: "$APP.delete($PATH, $$$HANDLER)"
    - pattern: "$APP.patch($PATH, $$$HANDLER)"
    - pattern: "$APP.head($PATH, $$$HANDLER)"
    - pattern: "$APP.options($PATH, $$$HANDLER)"
severity: info
message: "Fastify route handler detected"
```
*Source: Verified with sg 0.42.0 against Fastify-style test file. Matched 2 routes (GET, POST).*

#### Fastify Plugin Signature
```yaml
# src/conventions/rules/frameworks/fastify/fastify-plugin-signature.yml
id: fastify-plugin-signature
language: TypeScript
rule:
  any:
    - pattern: "fp(async function $NAME($FASTIFY, $OPTS) { $$$BODY })"
    - pattern: "fp(async function ($FASTIFY, $OPTS) { $$$BODY })"
    - pattern: "module.exports = async function($FASTIFY, $OPTS) { $$$BODY }"
    - pattern: "module.exports = async function $NAME($FASTIFY, $OPTS) { $$$BODY }"
    - pattern: "export default fp($$$ARGS)"
severity: info
message: "Fastify plugin signature detected"
```
*Source: Verified with sg 0.42.0. Matched 3 plugin patterns (fp-wrapped, module.exports, export default fp).*

#### Fastify Hook
```yaml
# src/conventions/rules/frameworks/fastify/fastify-hook.yml
id: fastify-hook
language: TypeScript
rule:
  pattern: "$APP.addHook($HOOK, $$$HANDLER)"
severity: info
message: "Fastify hook registration detected"
```
*Source: Verified with sg 0.42.0. Matched 1 addHook call.*

#### Fastify Decorator
```yaml
# src/conventions/rules/frameworks/fastify/fastify-decorator.yml
id: fastify-decorator
language: TypeScript
rule:
  any:
    - pattern: "$APP.decorate($NAME, $$$VAL)"
    - pattern: "$APP.decorateRequest($NAME, $$$VAL)"
    - pattern: "$APP.decorateReply($NAME, $$$VAL)"
severity: info
message: "Fastify decorator detected"
```
*Source: Verified with sg 0.42.0. Matched 1 decorate call.*

#### Express Middleware
```yaml
# src/conventions/rules/frameworks/express/express-middleware.yml
id: express-middleware
language: TypeScript
rule:
  pattern: "$APP.use($$$ARGS)"
severity: info
message: "Express middleware detected"
```
*Source: Verified with sg 0.42.0. Matched 3 middleware registrations (json, router mount, error handler).*

#### Express Route Handler
```yaml
# src/conventions/rules/frameworks/express/express-route-handler.yml
id: express-route-handler
language: TypeScript
rule:
  any:
    - pattern: "$APP.get($PATH, $$$HANDLER)"
    - pattern: "$APP.post($PATH, $$$HANDLER)"
    - pattern: "$APP.put($PATH, $$$HANDLER)"
    - pattern: "$APP.delete($PATH, $$$HANDLER)"
    - pattern: "$APP.patch($PATH, $$$HANDLER)"
severity: info
message: "Express route handler detected"
```
*Source: Verified with sg 0.42.0. Matched 2 routes (GET, POST).*

#### Express Error Handler
```yaml
# src/conventions/rules/frameworks/express/express-error-handler.yml
id: express-error-handler
language: TypeScript
rule:
  any:
    - pattern: "function $NAME($ERR, $REQ, $RES, $NEXT) { $$$BODY }"
    - pattern: "($ERR, $REQ, $RES, $NEXT) => { $$$BODY }"
    - pattern: "($ERR, $REQ, $RES, $NEXT) => $EXPR"
severity: info
message: "Express error handler detected (4-parameter signature)"
```
*Source: Verified with sg 0.42.0. Matched 2 error handlers (arrow function, function declaration).*

#### h3 Event Handler
```yaml
# src/conventions/rules/frameworks/h3/h3-event-handler.yml
id: h3-event-handler
language: TypeScript
rule:
  pattern: "defineEventHandler($$$HANDLER)"
severity: info
message: "h3 event handler detected"
```
*Source: Verified with sg 0.42.0. Matched 3 defineEventHandler calls.*

#### h3 Utility Functions
```yaml
# src/conventions/rules/frameworks/h3/h3-utility-functions.yml
id: h3-utility-functions
language: TypeScript
rule:
  any:
    - pattern: "readBody($EVENT)"
    - pattern: "getQuery($EVENT)"
    - pattern: "setResponseStatus($EVENT, $$$ARGS)"
    - pattern: "getRouterParams($EVENT)"
    - pattern: "getHeaders($EVENT)"
    - pattern: "getCookie($EVENT, $$$ARGS)"
    - pattern: "setCookie($EVENT, $$$ARGS)"
    - pattern: "sendRedirect($EVENT, $$$ARGS)"
severity: info
message: "h3 utility function detected"
```
*Source: Verified with sg 0.42.0. Matched 3 utility calls (readBody, getQuery, setResponseStatus).*

### Golden File Filtering Predicate
```typescript
// Noise file exclusion patterns for golden files (D-11)
const NOISE_PATTERNS = {
  test: [/\.test\./, /\.spec\./, /__tests__/, /__test__/, /\/tests\//, /\/test\//],
  config: [/\.config\.(ts|js|mjs|cjs)$/, /\.eslintrc/, /\.prettierrc/, /^tsconfig/, /^jest\.config/, /^vitest\.config/],
  generated: [/\.generated\./, /\.gen\./, /\.pb\./],
  deprecated: [/deprecated/i, /legacy/i, /obsolete/i],
};

function isNoiseFile(filePath: string): boolean {
  const basename = path.basename(filePath);
  const fullPath = filePath;
  return Object.values(NOISE_PATTERNS).some(patterns =>
    patterns.some(p => p.test(basename) || p.test(fullPath))
  );
}
```

### Framework Detection Integration Point
```typescript
// In convention-detector.ts (modified runConventionDetector)
export async function runConventionDetector(
  options: ConventionDetectorOptions,
): Promise<ConventionDetectorResult> {
  // ...existing setup...

  // NEW: Detect frameworks from package.json
  const detectedFrameworks = detectFrameworks(options.projectRoot);

  // Run convention scan with framework info
  scanResult = runConventionScan(options.projectRoot, rulesDir, detectedFrameworks);
  // ...
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| All conventions divided by total convention count | Per-language density (TS rules / TS count, Python rules / Python count) | Phase 18 | Eliminates cross-language penalty that made mixed TS/Python projects score lower for golden files |
| Manual RULE_METADATA in two files | Shared module | Phase 18 | Prevents desync between runner.ts and rule-filter.ts when adding rules |
| Generic syntax patterns only | Framework-specific + generic | Phase 18 | Detects Fastify plugin signatures, h3 event handlers, etc. that generic rules can't see |
| No file role concept | 5 roles + general fallback | Phase 18 | Convention matching respects file purpose (test files not flagged for missing route patterns) |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONV-03 | Golden files exclude noise files | unit | `npx vitest run tests/conventions/golden-files.test.ts -x` | Exists -- needs new test cases |
| CONV-04 | Per-language density calculation | unit | `npx vitest run tests/conventions/golden-files.test.ts -x` | Exists -- needs new test cases |
| CONV-05 | Framework detection from package.json | unit | `npx vitest run tests/onboard/detect-frameworks.test.ts -x` | Wave 0 |
| CONV-06 | Framework-specific rule matching | integration | `npx vitest run tests/conventions/framework-rules.test.ts -x` | Wave 0 |
| CONV-07 | File-role classification | unit | `npx vitest run tests/classifier/file-role.test.ts -x` | Wave 0 |
| D-24 | Shared RULE_METADATA module | unit | `npx vitest run tests/conventions/rule-metadata.test.ts -x` | Wave 0 |
| D-25 | Readiness cap prevents inflation | unit | `npx vitest run tests/bootstrap/readiness.test.ts -x` | Exists -- needs new test case |
| D-28 | Rule validation (no duplicate IDs) | unit | `npx vitest run tests/conventions/rule-validation.test.ts -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/onboard/detect-frameworks.test.ts` -- covers CONV-05
- [ ] `tests/conventions/framework-rules.test.ts` -- covers CONV-06
- [ ] `tests/classifier/file-role.test.ts` -- covers CONV-07
- [ ] `tests/conventions/rule-metadata.test.ts` -- covers D-24 (shared module)
- [ ] `tests/conventions/rule-validation.test.ts` -- covers D-28 (no duplicate ruleIds)
- [ ] Test fixtures: Fastify-like project fixture with package.json containing `"fastify": "^5.0.0"`, h3 project with `"h3": "^1.0.0"`, Express project with `"express": "^4.0.0"`

## Open Questions

1. **Express route pattern false positives with `.get()` calls**
   - What we know: `$APP.get($PATH, $$$HANDLER)` matches `Map.get()` and other `.get()` calls. This is a known limitation of structural matching without type info.
   - What's unclear: How significant this is in practice for Express-specific projects.
   - Recommendation: Accept the tradeoff. Framework rules only run when Express is detected (D-06). The adoption percentage math naturally absorbs sparse false positives. If proved problematic post-phase, add a constraint that $PATH must be a string literal, but skip for now.

2. **File role classification for barrel files (index.ts re-exports)**
   - What we know: `index.ts` files that re-export from other modules are "barrel" files. D-74 mentions `barrel` as an optional additional role.
   - What's unclear: Whether barrel files should be classified as a separate role or treated as `utility`.
   - Recommendation: Classify as `general` for now. Barrel detection requires content analysis (checking for only re-export statements). Not needed for the CONV-03-07 requirements. Can add in a future iteration.

3. **Content-based classification (Tier 3 signals)**
   - What we know: D-19 lists content patterns as optional for ambiguous files.
   - What's unclear: Whether any current requirement actually needs content-based classification.
   - Recommendation: Implement Tier 1 (filename) and Tier 2 (path) only for Phase 18. These cover the requirements. Content-based classification adds file I/O cost and complexity for marginal benefit. The `general` fallback safely handles ambiguous files.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| sg (ast-grep CLI) | Convention scanning | Yes | 0.42.0 | -- |
| vitest | Testing | Yes | 4.1.0 | -- |
| Node.js | Runtime | Yes | 25.6.1 | -- |
| better-sqlite3 | Graph DB metadata writes | Yes (project dep) | ^12.8.0 | -- |

**Missing dependencies:** None.

## Sources

### Primary (HIGH confidence)
- [ast-grep Configuration Reference](https://ast-grep.github.io/reference/yaml.html) -- Full YAML rule syntax, all fields documented
- [ast-grep Atomic Rule Guide](https://ast-grep.github.io/guide/rule-config/atomic-rule.html) -- kind, pattern, regex combinations
- [ast-grep Rule Essentials](https://ast-grep.github.io/guide/rule-config.html) -- Relational and composite rule composition
- [ast-grep Pattern Syntax](https://ast-grep.github.io/guide/pattern-syntax.html) -- Meta-variable syntax ($VAR, $$$ARGS)
- Live verification: All 9 framework rules tested with `sg 0.42.0` on host machine against real framework code
- Existing codebase: `src/conventions/runner.ts`, `src/conventions/golden-files.ts`, `src/conventions/types.ts`, `src/enforcement/rule-filter.ts`, `src/onboard/detect.ts`, `src/bootstrap/readiness.ts`, `src/bootstrap/orchestrator.ts`, `src/graph/schema.ts`, `src/graph/builder.ts`

### Secondary (MEDIUM confidence)
- [Fastify Plugin Guide](https://fastify.dev/docs/latest/Guides/Plugins-Guide/) -- Plugin signature patterns
- [h3 Event Handler Docs](https://v1.h3.dev/guide/event-handler) -- defineEventHandler patterns
- [h3 Request Utilities](https://v1.h3.dev/utils/request) -- readBody, getQuery, etc.

## Project Constraints (from CLAUDE.md)

- **Tech stack:** TypeScript, web-tree-sitter WASM, ast-grep CLI, better-sqlite3, vitest
- **Quality target:** Convention false positive rate <5% (high-confidence)
- **Testing:** Write and run tests. Task not done until tests pass. Run FULL regression suite after implementation.
- **ESM/CJS:** Handle both import styles (relevant for framework detection and rule matching)
- **Git safety:** Never skip hooks. Merge sequentially if parallel worktrees used.
- **No hand-rolling:** Use ast-grep YAML rules for pattern matching, not custom tree-sitter traversal.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- No new libraries. Using ast-grep YAML rules already proven in 18 existing rules.
- Architecture: HIGH -- Extension points are clear. Verified all integration points in source code.
- Pitfalls: HIGH -- Cross-verified with actual sg 0.42.0 behavior on host. Tested patterns against real framework code.
- Framework rules: HIGH -- All 9 YAML rules verified with live ast-grep execution. Match counts confirmed.

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable -- no dependency changes expected)
