# Phase 2: Scout and Analysis Squad - Research

**Researched:** 2026-03-22
**Domain:** Graph analytics (graphology), structural code search (ast-grep), AST parsing (web-tree-sitter), convention detection, file walking
**Confidence:** HIGH

## Summary

Phase 2 builds five agent modules (Scout, Researcher, Convention Detector, Risk Analyzer, Learning Synthesizer) that run end-to-end individually. Each module is callable TypeScript that directly imports Phase 1 infrastructure (ParserPool, extractFromSource, resolver, BatchWriter, openDatabase). The phase has two major technical domains: (1) convention detection via ast-grep CLI with YAML rule scanning and adoption percentage calculation, and (2) graph analytics via graphology's in-memory algorithms (Louvain community detection, in-degree centrality, BFS blast radius traversal).

All Phase 1 infrastructure is in place: ParserPool with memory lifecycle, extractFromSource returning ParseResult with imports/exports/classes/functions/variables, TypeScript and Python import resolvers, BatchWriter with JSONL append and two-pass processBatchFiles, SQLite schema with nodes/edges/communities tables, and detectProject for project type detection. The graph analysis sub-packages (graphology-communities-louvain, graphology-metrics, graphology-traversal) are NOT yet installed and must be added as dependencies in an early task.

The phase produces structured markdown artifacts (service-manifest.md, overview.md, conventions.md, golden-files.md, danger-zones.md, learnings.md) following the UI-SPEC formatting contract defined in 02-UI-SPEC.md. All artifacts use YAML frontmatter, GFM tables, and machine-parseable severity markers.

**Primary recommendation:** Build bottom-up: graph builder module first (walks files, creates nodes/edges via BatchWriter), then analytics module (loads SQLite into graphology, runs algorithms), then convention detection (ast-grep rules + runner), then each agent module that ties them together. Test each module in isolation against fixture projects before composing agents.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** `/codescope:bootstrap` is a skill that runs as the orchestrator itself -- spawns agents sequentially via Task tool, reads results from filesystem (Issue #5812 pattern). Thin orchestrator stays in the skill body.
- **D-02:** Agent prompts written inline in the skill markdown body. Matches Phase 1's onboard skill pattern (skill body is detailed natural language prompt).
- **D-03:** On agent failure or timeout, skip that agent's artifact, log the failure, continue with remaining agents. Produces partial results rather than nothing. Matches D-20 graceful degradation from Phase 1.
- **D-04:** Scout agent extends onboard's detectProject output -- reads config.yml + does targeted file reads to enrich with LOC counts, framework versions, entry points, CI/CD info. Avoids duplicating detection.
- **D-05:** Phase 2 builds each agent as a callable module (Scout, Researcher, Convention Detector, Risk Analyzer, Learning Synthesizer). Phase 3 wires them into the bootstrap skill with orchestration and synthesis. Individual agents only -- no full bootstrap E2E in Phase 2.
- **D-06:** Agents access existing infrastructure (parser, resolver, graph) via direct TypeScript imports. Agent code is TypeScript that runs in-process. Simple, type-safe.
- **D-07:** Convention Detector uses ast-grep CLI via Bash (`sg scan --rule rules.yml --json ./src`). CLI for batch analysis during bootstrap, matching CLAUDE.md recommendation. Rules defined in YAML.
- **D-08:** Ship a bundled rule library of curated ast-grep YAML rules for common TS/JS/Python patterns. Agent runs them all, reports adoption %. Extensible -- users can add custom rules later.
- **D-09:** Core TS/JS patterns (~15-20 rules): error handling (custom error classes vs throw strings), import style (named vs default vs barrel), async patterns (async/await vs .then), export style (named vs default), component patterns (functional vs class for React).
- **D-10:** Adoption % calculated as file-count ratio: (files matching pattern / total files where pattern could apply). Simple, explainable, matches spec's >80% threshold for high-confidence.
- **D-11:** Snapshot-only for v1 -- calculate adoption % from current codebase state. Mark all trends as "Stable." Git-based trend analysis deferred to a future iteration.
- **D-12:** Golden files selected by highest convention density -- rank files by how many detected conventions they follow. Top 3-5 per service. Matches spec: "ranked by modern pattern density."
- **D-13:** Convention conflicts detected via competing pattern pairs defined in the rule library (e.g., arrow vs function, Zustand vs Redux, class vs functional). When both sides exceed 20% adoption, flag as conflict. Report both percentages and trend directions.
- **D-14:** Python convention rules: minimal parity with 3-5 rules (import style, class patterns, error handling, type hints). Python files still get parsed for graph nodes/edges. Full parity deferred.
- **D-15:** Graph analytics run in graphology in-memory: load nodes/edges from SQLite into graphology, run algorithms (graphology-metrics for centrality, graphology-communities-louvain for communities, graphology-traversal for BFS blast radius), write results back to SQLite communities table.
- **D-16:** Danger zones identified by multi-signal scoring: combine in-degree centrality (many dependents), cross-boundary edges (connects different communities), and file size/complexity. Score each file, top N are danger zones. Ranked list with reasons.
- **D-17:** Dedicated `src/graph/builder.ts` module walks files, calls extractFromSource + resolver, produces BatchWriter JSONL. Risk Analyzer agent invokes this module, then runs graphology analytics on the populated graph. Separation of concerns: building vs analyzing.
- **D-18:** `src/graph/analytics.ts` module exposes blastRadius(nodeId, maxHops) returning hop-distance classified results (Red/Orange/Yellow/Green per spec). BFS via graphology-traversal. Available for MCP tools in Phase 3 and orient in Phase 4.
- **D-19:** graphology loaded on demand -- load from SQLite when analytics needed, run algorithms, write results back, discard in-memory graph. Keeps memory bounded. For Phase 3 MCP tools, reload per-query.
- **D-20:** Community detection results stored in SQLite communities table with node_id, community_id, and modularity_class (human-readable label derived from most common directory/namespace in that community).
- **D-21:** All artifacts use structured markdown with consistent sections (## headers, tables, YAML frontmatter for metadata). Human-readable AND grep-able by downstream agents.
- **D-22:** Researcher's overview.md targets ~200 lines, scannable format: structure, frameworks, entry points, key directories, test setup. Organized by sections with bullet points. A map, not a tutorial.
- **D-23:** conventions.md includes evidence chains: adoption %, trend direction, and top 3 representative file:line references per convention. Downstream agents can read golden files to understand the pattern.
- **D-24:** learnings.md initialized with header/schema structure but no entries. Learning Synthesizer's real work happens in Phase 7 when learnings accumulate from completed tasks.
- **D-25:** Unit tests with vitest for each module (graph builder, analytics, convention rules). Small fixture project (test/fixtures/sample-project/) with known patterns for integration tests. Convention detector tested against fixtures with known adoption %.
- **D-26:** Convention detection accuracy (<5% false positive) validated via fixture project with ground truth -- files with intentional patterns + intentional violations. Test asserts detected conventions match ground truth.
- **D-27:** File walking uses glob patterns respecting .gitignore (skip node_modules, dist, build, vendor). Process files in batches. Shallow parsing for large files (D-37 from Phase 1).
- **D-28:** Progress reporting at agent level: "Scout complete (12s) -> Researcher running..." No file-level progress bars. Clean orchestrator output.

### Claude's Discretion
No areas deferred to Claude's discretion -- all gray areas received explicit user decisions.

### Deferred Ideas (OUT OF SCOPE)
- Git-based trend detection for conventions (Rising/Declining/Stable from commit history) -- future iteration
- Full Python convention parity with TS/JS rule count -- defer until Python usage patterns are better understood
- @ast-grep/napi programmatic API -- defer unless CLI subprocess overhead becomes a bottleneck
- Persistent in-memory graphology graph -- revisit in Phase 3 if per-query reload doesn't meet <100ms target
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BOOT-01 | Scout agent (Haiku, read-only) maps top-level project structure from root configs | Scout module extends detectProject output (D-04); reads package.json, docker-compose, workspace configs, CI/CD |
| BOOT-02 | Scout produces service-manifest.md with services, paths, LOC, frameworks | Artifact format defined in UI-SPEC copywriting contract; LOC via line counting during file walk |
| BOOT-03 | Scout completes in under 30 seconds for typical projects | Scout does targeted file reads (not full parse); LOC via stat/line count, not AST parsing |
| BOOT-04 | Researcher maps structure, frameworks, entry points and writes overview.md | ~200 lines, sections defined in UI-SPEC; researcher reads project files + detectProject output |
| BOOT-05 | Convention Detector produces conventions.md with adoption %, trend, golden files, conflicts | ast-grep CLI scan with YAML rules returns JSON; adoption % = files matching / total applicable files |
| BOOT-06 | Convention detection false positive rate below 5% for high-confidence patterns | Fixture project with ground truth for validation; D-26 testing strategy |
| BOOT-07 | Risk Analyzer builds SQLite knowledge graph with nodes, edges, communities | Graph builder module (src/graph/builder.ts) + BatchWriter + processBatchFiles; graphology-communities-louvain for communities |
| BOOT-08 | Risk Analyzer produces danger-zones.md with centrality, churn, cross-boundary deps | Multi-signal scoring (D-16): in-degree centrality + cross-community edges + file size |
| BOOT-09 | Learning Synthesizer initializes learnings.md | Header/schema structure only (D-24); real work in Phase 7 |
| BOOT-10 | Golden files identified and written to golden-files.md | Ranked by convention density (D-12); top 3-5 per service |
| GRPH-02 | In-degree centrality calculation for all nodes | graphology-metrics inDegreeCentrality API; load graph from SQLite, compute, use for danger zone scoring |
| GRPH-03 | Louvain community detection via graphology-communities-louvain | louvain.detailed(graph) returns communities + modularity; write to SQLite communities table |
| GRPH-04 | BFS blast radius traversal with hop-distance classification | graphology-traversal bfsFromNode with depth parameter; classify hop 0=Red, 1=Orange, 2=Yellow, 3+=Green |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack**: TypeScript, web-tree-sitter WASM 0.25.10, ast-grep CLI, better-sqlite3, graphology, enhanced-resolve, vitest
- **Performance**: Bootstrap <5 min for 100K LOC, graph queries <100ms
- **Quality**: Convention false positive rate <5% (high-confidence)
- **Language support**: TypeScript/JavaScript + Python for v1
- **ESM-first**: type:module, NodeNext module resolution
- **Memory management**: tree.delete() after every parse, periodic parser.delete() via ParserPool
- **Testing**: vitest with test timeout 30000ms
- **Build**: tsdown for bundling
- **DO NOT USE**: node-tree-sitter, web-tree-sitter 0.26.x, tsup, sqlite3 (npm), jest

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Status |
|---------|---------|---------|--------|
| graphology | ^0.26.0 | In-memory graph data structure | Installed |
| graphology-types | ^0.24.8 | TypeScript declarations for graphology | Installed (peer dep) |
| better-sqlite3 | ^12.8.0 | SQLite knowledge graph storage | Installed |
| web-tree-sitter | 0.25.10 | AST parsing (WASM, pinned version) | Installed |
| enhanced-resolve | ^5.20.1 | TS/JS import resolution | Installed |
| tsconfig-paths | ^4.2.0 | TypeScript path alias resolution | Installed |

### Must Install

| Library | Version | Purpose | Why Needed |
|---------|---------|---------|------------|
| graphology-communities-louvain | ^2.0.2 | Louvain community detection | GRPH-03: detect module communities. NOT currently installed. |
| graphology-metrics | ^2.4.0 | In-degree centrality, modularity | GRPH-02: compute centrality for danger zone scoring. NOT currently installed. |
| graphology-traversal | ^0.3.1 | BFS/DFS graph traversal | GRPH-04: blast radius computation via BFS. NOT currently installed. |

### External CLI Tools (Already Available)

| Tool | Version Found | Purpose | Notes |
|------|---------------|---------|-------|
| ast-grep (sg) | 0.42.0 | Structural code search for convention detection | Installed globally via homebrew. D-07 uses CLI approach. |
| ripgrep (rg) | 15.1.0 | Fast text search | Available for supplementary searches |
| Node.js | v25.6.1 | Runtime | Exceeds >=22.x requirement |

**Installation command for missing packages:**
```bash
npm install graphology-communities-louvain@^2.0.2 graphology-metrics@^2.4.0 graphology-traversal@^0.3.1
```

## Architecture Patterns

### Recommended Project Structure (New Files for Phase 2)

```
src/
  graph/
    builder.ts         # NEW: walks files, calls parser+resolver, writes JSONL via BatchWriter
    analytics.ts       # NEW: loads SQLite into graphology, runs centrality/communities/BFS
    batch-writer.ts    # EXISTS: JSONL append + processBatchFiles
    database.ts        # EXISTS: openDatabase + closeDatabase
    schema.ts          # EXISTS: SQLite schema (nodes, edges, communities)
  conventions/
    runner.ts          # NEW: orchestrates ast-grep scan, parses JSON output, calculates adoption %
    rules/             # NEW: directory of .yml ast-grep rule files
      typescript/      # TS/JS convention rules (~15-20 rules)
      python/          # Python convention rules (~3-5 rules)
    types.ts           # NEW: ConventionResult, RuleMatch, ConflictInfo interfaces
    golden-files.ts    # NEW: ranks files by convention density
  agents/
    scout.ts           # NEW: extends detectProject, produces service-manifest.md
    researcher.ts      # NEW: reads project files, produces overview.md
    convention-detector.ts  # NEW: runs convention runner, produces conventions.md + golden-files.md
    risk-analyzer.ts   # NEW: runs graph builder + analytics, produces danger-zones.md
    learning-synthesizer.ts # NEW: creates empty learnings.md with schema
  parser/              # EXISTS: ParserPool, extractFromSource, detectLanguage
  resolver/            # EXISTS: TypeScript + Python import resolution
  onboard/             # EXISTS: detectProject, filesystem, global-memory
test/
  fixtures/
    sample-project/    # NEW: fixture with known conventions for testing
      src/
        good-patterns/ # Files following conventions
        bad-patterns/  # Files violating conventions
        mixed/         # Files for conflict testing
      package.json     # Fixture project config
      tsconfig.json    # Fixture TypeScript config
  graph/
    builder.test.ts    # NEW
    analytics.test.ts  # NEW
  conventions/
    runner.test.ts     # NEW
    golden-files.test.ts # NEW
  agents/
    scout.test.ts      # NEW
    researcher.test.ts # NEW
    convention-detector.test.ts # NEW
    risk-analyzer.test.ts # NEW
```

### Pattern 1: Graph Builder Pipeline

**What:** Walk source files, parse with ParserPool, resolve imports, write nodes/edges via BatchWriter, then processBatchFiles into SQLite.

**When to use:** Risk Analyzer agent invokes this to populate the knowledge graph.

**Example:**
```typescript
// Source: Phase 1 infrastructure (batch-writer.ts, extract.ts, resolver)
import { ParserPool, parseFile, detectLanguage } from "../parser/index.js";
import { BatchWriter, processBatchFiles } from "./batch-writer.js";
import { openDatabase, closeDatabase } from "./database.js";
import { createTypeScriptResolver, resolveTypeScriptImport } from "../resolver/typescript.js";
import { resolvePythonImport } from "../resolver/python.js";

export interface BuildGraphOptions {
  projectRoot: string;
  dbPath: string;
  batchDir: string;
  filePatterns?: string[];   // glob patterns to include
  ignorePatterns?: string[]; // patterns to skip (node_modules, dist, etc.)
}

export interface BuildGraphResult {
  filesProcessed: number;
  nodesCreated: number;
  edgesCreated: number;
  errors: string[];
  durationMs: number;
}

export async function buildGraph(options: BuildGraphOptions): Promise<BuildGraphResult> {
  // 1. Walk files matching patterns, respecting .gitignore
  // 2. For each file: parseFile -> create file node + symbol nodes via BatchWriter
  // 3. For each import: resolve -> create IMPORTS edge
  // 4. For each class with extends: create EXTENDS edge
  // 5. processBatchFiles into SQLite
  // Returns summary with counts and errors
}
```

### Pattern 2: SQLite-to-Graphology Load/Analyze/Writeback

**What:** Load nodes/edges from SQLite into an in-memory graphology DirectedGraph, run algorithms, write results back to SQLite, then discard the graph.

**When to use:** Analytics module for centrality, communities, blast radius.

**Example:**
```typescript
// Source: graphology official docs (https://graphology.github.io/)
import { DirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import { inDegreeCentrality } from "graphology-metrics/centrality/degree";
import { bfsFromNode } from "graphology-traversal";
import type { Database as DatabaseType } from "better-sqlite3";

export function loadGraphFromSQLite(db: DatabaseType): DirectedGraph {
  const graph = new DirectedGraph();

  // Load all nodes
  const nodes = db.prepare("SELECT id, name, kind, file_path FROM nodes").all();
  for (const node of nodes) {
    graph.addNode(String(node.id), { name: node.name, kind: node.kind, filePath: node.file_path });
  }

  // Load all edges
  const edges = db.prepare("SELECT source_id, target_id, kind, weight FROM edges").all();
  for (const edge of edges) {
    try {
      graph.addEdge(String(edge.source_id), String(edge.target_id), {
        kind: edge.kind, weight: edge.weight
      });
    } catch {
      // Skip duplicate edges in directed graph
    }
  }

  return graph;
}

export function runCommunityDetection(graph: DirectedGraph, db: DatabaseType): {
  communityCount: number;
  modularity: number;
} {
  const details = louvain.detailed(graph, { resolution: 1.0 });

  // Write to SQLite communities table
  const insert = db.prepare(
    "INSERT INTO communities (node_id, community_id, modularity_class) VALUES (?, ?, ?)"
  );
  const writeAll = db.transaction(() => {
    for (const [nodeId, communityId] of Object.entries(details.communities)) {
      const label = deriveCommunityLabel(graph, communityId, details.communities);
      insert.run(Number(nodeId), communityId, label);
    }
  });
  writeAll();

  return { communityCount: details.count, modularity: details.modularity };
}

export type RiskLevel = "Red" | "Orange" | "Yellow" | "Green";

export interface BlastRadiusNode {
  nodeId: string;
  name: string;
  filePath: string;
  hop: number;
  risk: RiskLevel;
}

export function blastRadius(
  graph: DirectedGraph,
  nodeId: string,
  maxHops: number = 4
): BlastRadiusNode[] {
  const results: BlastRadiusNode[] = [];

  bfsFromNode(graph, nodeId, (node, attr, depth) => {
    if (depth > maxHops) return true; // stop traversal

    const risk: RiskLevel = depth === 0 ? "Red"
                           : depth === 1 ? "Orange"
                           : depth === 2 ? "Yellow"
                           : "Green";

    results.push({
      nodeId: node,
      name: attr.name,
      filePath: attr.filePath,
      hop: depth,
      risk,
    });

    return false; // continue
  });

  return results;
}
```

### Pattern 3: ast-grep Convention Detection

**What:** Run ast-grep CLI with YAML rules against the project, parse JSON output, calculate adoption percentages.

**When to use:** Convention Detector agent runs this for conventions.md.

**Example:**
```typescript
// Source: ast-grep docs (https://ast-grep.github.io/reference/yaml.html)
import { execSync } from "node:child_process";

// ast-grep YAML rule format for a convention:
// File: src/conventions/rules/typescript/named-exports.yml
/*
id: prefer-named-exports
language: TypeScript
rule:
  pattern: "export default $EXPR"
severity: info
message: "Default export detected -- project may prefer named exports"
*/

// Running scan with rules directory:
// sg scan --rule src/conventions/rules/typescript/ --json ./src

export interface RuleMatch {
  ruleId: string;
  file: string;
  line: number;      // zero-based from ast-grep, convert to 1-based
  column: number;
  text: string;
  message: string;
  severity: string;
}

export interface ConventionResult {
  ruleId: string;
  name: string;
  category: string;
  matchingFiles: Set<string>;
  totalApplicableFiles: number;
  adoptionPercent: number;
  confidence: "HIGH-CONF" | "MEDIUM-CONF" | "LOW-CONF";
  trend: "Stable";                    // v1: always Stable (D-11)
  evidence: Array<{ file: string; line: number; description: string }>;
}

export function runAstGrepScan(
  rulesDir: string,
  targetDir: string
): RuleMatch[] {
  const result = execSync(
    `sg scan --rule ${rulesDir} --json=compact ${targetDir}`,
    { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 } // 50MB buffer for large projects
  );
  return JSON.parse(result) as RuleMatch[];
}
```

### Pattern 4: File Walking with .gitignore Respect

**What:** Walk project directory respecting .gitignore exclusions, skip node_modules/dist/build/vendor.

**When to use:** Graph builder and convention detector need to enumerate source files.

**Example:**
```typescript
import * as fs from "node:fs";
import * as path from "node:path";
import { detectLanguage } from "../parser/languages.js";

const DEFAULT_IGNORE = new Set([
  "node_modules", "dist", "build", ".git", "vendor",
  ".next", ".nuxt", "__pycache__", ".venv", "venv",
  "coverage", ".cache", ".output"
]);

export function walkSourceFiles(
  rootDir: string,
  options?: { extensions?: string[] }
): string[] {
  const files: string[] = [];

  function walk(dir: string) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== ".") continue;
      if (DEFAULT_IGNORE.has(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile()) {
        const lang = detectLanguage(fullPath);
        if (lang) files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files;
}
```

### Anti-Patterns to Avoid

- **Loading entire graph into memory permanently (D-19):** Load on demand, run algorithms, write back, discard. Graphology graphs can be large for big codebases.
- **Parsing all files at full depth:** Large files (>500KB or >10K lines) use shallow parsing (D-37) -- top-level declarations only.
- **Running ast-grep per-file:** Use batch scan with rules directory. One CLI invocation scans the entire codebase. Per-file invocation has subprocess overhead per call.
- **Hardcoding node IDs for edge references:** Use name+file_path compound lookup (Phase 1 decision D-40, batch-writer two-pass pattern).
- **Blocking on agent failure:** Graceful degradation (D-03) -- log failure, skip artifact, continue with remaining agents.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Community detection | Custom modularity optimizer | graphology-communities-louvain | Louvain is well-studied, benchmarked (50K nodes + 1M edges in ~940ms). Custom implementations get wrong. |
| Centrality metrics | Custom in-degree counting | graphology-metrics inDegreeCentrality | Normalized centrality (0-1 scale) needs denominator handling for directed graphs. Library handles edge cases. |
| BFS traversal with depth | Custom BFS queue | graphology-traversal bfsFromNode | Handles directed/undirected, provides depth parameter, stop-on-return-true. Handles edge cases (cycles, disconnected components). |
| Structural code pattern matching | Custom AST traversal queries | ast-grep CLI with YAML rules | Pattern syntax is isomorphic to code. Handles 27 languages. Performance is orders of magnitude faster than walking AST in JS. |
| .gitignore parsing | Custom glob matching for ignored files | fs walk with hardcoded skip list | For v1, a hardcoded skip list (node_modules, dist, build, vendor, .git) covers 95%+ of cases. Full .gitignore parsing is deferred complexity. |
| YAML frontmatter parsing | Regex extraction | js-yaml (already installed) | Robust YAML parsing for reading config.yml; simple string concatenation for writing frontmatter to artifacts. |

## Common Pitfalls

### Pitfall 1: graphology Edge Duplicates in Directed Graphs

**What goes wrong:** Calling `graph.addEdge(source, target)` twice with the same source/target throws an error in non-multi graphs, crashing the analytics pipeline.
**Why it happens:** SQLite may contain duplicate edges (same source_id, target_id, kind) from overlapping file walks or re-analysis.
**How to avoid:** Either use `graph.mergeEdge(source, target, attributes)` which upserts, or wrap `addEdge` in try/catch to skip duplicates. Use a `DirectedGraph({ multi: false })` and handle the error.
**Warning signs:** "Edge already exists" errors during loadGraphFromSQLite.

### Pitfall 2: ast-grep Zero-Based Line Numbers

**What goes wrong:** Line references in conventions.md are off by one, causing confusion when humans read them.
**Why it happens:** ast-grep JSON output uses zero-based line/column numbers (matching LSP and tree-sitter conventions), but humans expect 1-based.
**How to avoid:** Add +1 to all line numbers when generating evidence chains for conventions.md. Document this conversion in the runner.
**Warning signs:** Evidence chain references point to the wrong line in source files.

### Pitfall 3: ast-grep maxBuffer Overflow on Large Codebases

**What goes wrong:** `execSync` throws ENOBUFS for large projects because the JSON output exceeds the default 1MB buffer.
**Why it happens:** Convention scan of a 100K LOC project can produce megabytes of JSON matches.
**How to avoid:** Set `maxBuffer: 50 * 1024 * 1024` (50MB) in execSync options. For very large projects, consider `--json=stream` mode (one JSON object per line) with `spawnSync` and process stdout line-by-line.
**Warning signs:** "ENOBUFS" error or "stdout maxBuffer exceeded" in execSync.

### Pitfall 4: File Node Uniqueness in Graph Builder

**What goes wrong:** Multiple file nodes created for the same file path, causing edge resolution to return wrong node IDs.
**Why it happens:** Walking files from different starting points or processing the same file through different code paths.
**How to avoid:** Use file_path as the canonical identifier. Track processed files in a Set. The BatchWriter/processBatchFiles two-pass pattern handles this via name+file_path lookup, but duplicate file nodes still create ambiguity.
**Warning signs:** Edge count much lower than expected (edges resolving to wrong node), duplicate file entries in nodes table.

### Pitfall 5: Louvain on Disconnected Graphs

**What goes wrong:** Community detection assigns all disconnected nodes to a single community or produces unexpected results.
**Why it happens:** If many files have no imports/exports (isolated nodes), Louvain cannot meaningfully cluster them.
**How to avoid:** Accept this as expected behavior. Isolated nodes get their own community. Only report communities with >1 member. Filter out trivial single-node communities from danger zone analysis.
**Warning signs:** Community count equals node count (every node is its own community) or one massive community plus many singletons.

### Pitfall 6: Import Resolution Failures Causing Missing Edges

**What goes wrong:** Knowledge graph has nodes but very few edges, making centrality and community detection meaningless.
**Why it happens:** Import paths that can't be resolved (external packages, dynamic imports, re-exports through barrels) produce no IMPORTS edges.
**How to avoid:** Create IMPORTS edges for external packages too (using the package name as target, marked as external). Log resolution failures. Accept that ~5-20% of edges may be missing -- this is documented in the accuracy targets (95-99% TS/JS, ~80% Python).
**Warning signs:** Edge count is less than 30% of import statement count in the codebase.

### Pitfall 7: Convention Rule Matching Files That Aren't Applicable

**What goes wrong:** False positive rate exceeds 5% because adoption % denominator is wrong.
**Why it happens:** A rule like "prefer-named-exports" matches against all .ts files, but many .ts files have no exports at all (test files, scripts, type-only files). The denominator should be "files with at least one export", not "all .ts files".
**How to avoid:** Each convention rule must define its applicability criteria. Use ast-grep's `files` and `ignores` globs to filter. For adoption calculation, the denominator is files where the convention COULD apply, not all files.
**Warning signs:** Adoption percentages that are suspiciously low (< 20%) for patterns that are clearly dominant in the codebase.

## Code Examples

### ast-grep YAML Rule: Named Exports Preference

```yaml
# Source: ast-grep rule config reference (https://ast-grep.github.io/reference/yaml.html)
# File: src/conventions/rules/typescript/prefer-named-exports.yml
id: prefer-named-exports
language: TypeScript
rule:
  kind: export_statement
  has:
    kind: identifier
    field: declaration
severity: info
message: "Named export detected"
files:
  - "**/*.ts"
  - "**/*.tsx"
ignores:
  - "**/*.test.ts"
  - "**/*.spec.ts"
  - "**/index.ts"
```

### ast-grep YAML Rule: Default Export Detection (Competing Pattern)

```yaml
# File: src/conventions/rules/typescript/detect-default-export.yml
id: detect-default-export
language: TypeScript
rule:
  pattern: "export default $EXPR"
severity: info
message: "Default export detected"
files:
  - "**/*.ts"
  - "**/*.tsx"
ignores:
  - "**/*.test.ts"
  - "**/*.spec.ts"
```

### ast-grep YAML Rule: Async/Await vs .then()

```yaml
# File: src/conventions/rules/typescript/detect-promise-then.yml
id: detect-promise-then
language: TypeScript
rule:
  pattern: "$PROMISE.then($$$ARGS)"
severity: info
message: "Promise .then() chain detected -- project may prefer async/await"
files:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
```

### ast-grep YAML Rule: Error Handling -- Custom Error Classes

```yaml
# File: src/conventions/rules/typescript/custom-error-class.yml
id: custom-error-class
language: TypeScript
rule:
  kind: class_declaration
  has:
    kind: class_heritage
    has:
      kind: identifier
      regex: "Error$"
severity: info
message: "Custom error class extending Error"
```

### ast-grep YAML Rule: Python Type Hints

```yaml
# File: src/conventions/rules/python/type-hints-params.yml
id: python-type-hints
language: Python
rule:
  kind: typed_parameter
  inside:
    kind: function_definition
severity: info
message: "Typed parameter in function definition"
```

### Graphology: In-Degree Centrality Computation

```typescript
// Source: graphology-metrics docs (https://graphology.github.io/standard-library/metrics.html)
import { inDegreeCentrality } from "graphology-metrics/centrality/degree";
import type { DirectedGraph } from "graphology";

// Returns object mapping nodeId -> centrality score (0 to 1)
const centralities = inDegreeCentrality(graph);

// Or assign directly to node attributes
inDegreeCentrality.assign(graph, { nodeCentralityAttribute: "inDegree" });

// Then query per node:
graph.forEachNode((node, attrs) => {
  console.log(`${attrs.name}: centrality=${attrs.inDegree}`);
});
```

### Graphology: Louvain Community Detection with Details

```typescript
// Source: graphology-communities-louvain docs (https://graphology.github.io/standard-library/communities-louvain.html)
import louvain from "graphology-communities-louvain";

// Get full details including modularity score and community count
const details = louvain.detailed(graph, { resolution: 1.0 });

// details.communities: { [nodeId: string]: number } -- maps node -> community ID (0 to N)
// details.count: number -- total communities detected
// details.modularity: number -- modularity score (0 to 1, higher = better separation)

// Assign communities as node attributes
louvain.assign(graph, { nodeCommunityAttribute: "community" });
```

### Graphology: BFS Blast Radius with Hop Classification

```typescript
// Source: graphology-traversal docs (https://graphology.github.io/standard-library/traversal.html)
import { bfsFromNode } from "graphology-traversal";

// depth parameter gives hop distance from start node
bfsFromNode(graph, startNodeId, (node, attr, depth) => {
  if (depth > maxHops) return true; // stop exploring beyond max

  const risk = depth === 0 ? "Red"
             : depth === 1 ? "Orange"
             : depth === 2 ? "Yellow"
             : "Green";

  results.push({ nodeId: node, name: attr.name, hop: depth, risk });
  return false; // continue BFS
});
```

### Convention Conflict Detection

```typescript
// Competing pattern pairs defined in rule library metadata
const COMPETING_PAIRS = [
  { a: "prefer-named-exports", b: "detect-default-export", label: "Named vs Default Exports" },
  { a: "detect-async-await", b: "detect-promise-then", label: "Async/Await vs .then() Chains" },
  { a: "functional-components", b: "class-components", label: "Functional vs Class Components" },
  { a: "arrow-functions", b: "function-declarations", label: "Arrow Functions vs Function Declarations" },
];

// Conflict exists when both patterns in a pair exceed 20% adoption
function detectConflicts(conventions: ConventionResult[]): ConflictInfo[] {
  const byId = new Map(conventions.map(c => [c.ruleId, c]));
  const conflicts: ConflictInfo[] = [];

  for (const pair of COMPETING_PAIRS) {
    const a = byId.get(pair.a);
    const b = byId.get(pair.b);
    if (a && b && a.adoptionPercent > 20 && b.adoptionPercent > 20) {
      conflicts.push({
        label: pair.label,
        patternA: { ruleId: a.ruleId, adoption: a.adoptionPercent },
        patternB: { ruleId: b.ruleId, adoption: b.adoptionPercent },
      });
    }
  }

  return conflicts;
}
```

### Community Label Derivation

```typescript
// Derive human-readable label from most common directory in community
function deriveCommunityLabel(
  graph: DirectedGraph,
  communityId: number,
  communities: Record<string, number>
): string {
  const dirCounts = new Map<string, number>();

  for (const [nodeId, cId] of Object.entries(communities)) {
    if (cId !== communityId) continue;
    const filePath = graph.getNodeAttribute(nodeId, "filePath");
    if (!filePath) continue;
    const dir = path.dirname(filePath).split(path.sep).slice(0, 2).join(path.sep);
    dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
  }

  // Most common directory becomes the label
  let maxDir = "unknown";
  let maxCount = 0;
  for (const [dir, count] of dirCounts) {
    if (count > maxCount) { maxDir = dir; maxCount = count; }
  }

  return maxDir;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| ESLint rules for convention detection | ast-grep structural patterns | 2024+ | ast-grep is language-agnostic (27 langs), faster (Rust-based), pattern syntax matches code |
| Custom graph algorithms | graphology standard library | Stable since 2022 | Tested implementations, consistent API across metrics/communities/traversal |
| node-tree-sitter for AST | web-tree-sitter WASM | Ongoing | node-tree-sitter is unmaintained; web-tree-sitter is what Claude Code uses internally |
| Full AST traversal for convention detection | Structural pattern matching (ast-grep) | 2024+ | Orders of magnitude faster, declarative YAML rules vs imperative tree walking |

## Open Questions

1. **ast-grep rule file organization: single file vs directory?**
   - What we know: ast-grep scan can take `--rule path` where path is a file or directory. Multiple rules can exist in one YAML file separated by `---`. sgconfig.yml can reference `ruleDirs`.
   - What's unclear: Whether performance differs between one big rules file vs many small files.
   - Recommendation: Use a rules directory with one file per rule for maintainability. Group by language subdirectory. Performance difference is negligible for ~20 rules.

2. **Handling projects with no TypeScript/JavaScript/Python files**
   - What we know: detectProject identifies languages from config files. Parser only supports TS/JS/Python.
   - What's unclear: How to handle mixed projects where supported languages are a minority.
   - Recommendation: Scout reports all detected languages. Agents only analyze supported language files. Report in service-manifest.md which languages were analyzed vs detected but unsupported.

3. **Adoption percentage denominator accuracy**
   - What we know: D-10 defines adoption % as files matching / total applicable files. "Applicable" is the key question.
   - What's unclear: How to precisely determine "applicable" for each rule without over-counting or under-counting.
   - Recommendation: Each rule specifies `files` globs that define its applicable scope. For the denominator, count files matching those globs. For rules about exports, further filter to files that actually have export statements (two-pass: first count applicability, then count matches).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All modules | Yes | v25.6.1 | -- |
| ast-grep (sg) CLI | Convention Detector | Yes | 0.42.0 | Skip convention detection with warning (per UI-SPEC error: "ast-grep CLI (sg) not found") |
| ripgrep (rg) | Supplementary search | Yes | 15.1.0 | -- |
| graphology | Graph analytics | Yes | 0.26.0 | -- |
| graphology-communities-louvain | Community detection | **No** | -- | Must install: `npm install graphology-communities-louvain@^2.0.2` |
| graphology-metrics | Centrality computation | **No** | -- | Must install: `npm install graphology-metrics@^2.4.0` |
| graphology-traversal | BFS blast radius | **No** | -- | Must install: `npm install graphology-traversal@^0.3.1` |
| better-sqlite3 | SQLite storage | Yes | 12.8.0 | -- |
| web-tree-sitter | AST parsing | Yes | 0.25.10 | -- |
| WASM grammars | Parser languages | Yes (via tree-sitter-wasms) | -- | -- |

**Missing dependencies with no fallback:**
- graphology-communities-louvain, graphology-metrics, graphology-traversal -- must be installed before implementation.

**Missing dependencies with fallback:**
- None. All non-installed dependencies are required with no fallback.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.0 |
| Config file | `vitest.config.ts` (exists at project root) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BOOT-01 | Scout maps project structure from root configs | unit + integration | `npx vitest run tests/agents/scout.test.ts -t "maps project structure"` | Wave 0 |
| BOOT-02 | Scout produces service-manifest.md with correct format | unit | `npx vitest run tests/agents/scout.test.ts -t "service-manifest"` | Wave 0 |
| BOOT-03 | Scout completes in under 30 seconds | integration | `npx vitest run tests/agents/scout.test.ts -t "performance"` | Wave 0 |
| BOOT-04 | Researcher produces overview.md with required sections | unit | `npx vitest run tests/agents/researcher.test.ts` | Wave 0 |
| BOOT-05 | Convention Detector produces conventions.md with all fields | integration | `npx vitest run tests/conventions/runner.test.ts` | Wave 0 |
| BOOT-06 | Convention false positive rate <5% | integration | `npx vitest run tests/conventions/runner.test.ts -t "false positive"` | Wave 0 |
| BOOT-07 | Risk Analyzer populates graph with nodes/edges/communities | integration | `npx vitest run tests/graph/analytics.test.ts` | Wave 0 |
| BOOT-08 | danger-zones.md has centrality and cross-boundary data | unit | `npx vitest run tests/agents/risk-analyzer.test.ts` | Wave 0 |
| BOOT-09 | learnings.md initialized with schema | unit | `npx vitest run tests/agents/learning-synthesizer.test.ts` | Wave 0 |
| BOOT-10 | Golden files ranked by convention density | unit | `npx vitest run tests/conventions/golden-files.test.ts` | Wave 0 |
| GRPH-02 | In-degree centrality computed for all nodes | unit | `npx vitest run tests/graph/analytics.test.ts -t "centrality"` | Wave 0 |
| GRPH-03 | Louvain community detection populates communities table | unit | `npx vitest run tests/graph/analytics.test.ts -t "community"` | Wave 0 |
| GRPH-04 | BFS blast radius returns hop-distance classifications | unit | `npx vitest run tests/graph/analytics.test.ts -t "blast radius"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/graph/builder.test.ts` -- covers graph building from source files (BOOT-07)
- [ ] `tests/graph/analytics.test.ts` -- covers centrality, communities, blast radius (GRPH-02, GRPH-03, GRPH-04)
- [ ] `tests/conventions/runner.test.ts` -- covers ast-grep scanning + adoption calculation (BOOT-05, BOOT-06)
- [ ] `tests/conventions/golden-files.test.ts` -- covers golden file ranking (BOOT-10)
- [ ] `tests/agents/scout.test.ts` -- covers service-manifest generation (BOOT-01, BOOT-02, BOOT-03)
- [ ] `tests/agents/researcher.test.ts` -- covers overview.md generation (BOOT-04)
- [ ] `tests/agents/convention-detector.test.ts` -- covers full convention detection pipeline (BOOT-05)
- [ ] `tests/agents/risk-analyzer.test.ts` -- covers graph building + analytics pipeline (BOOT-07, BOOT-08)
- [ ] `tests/agents/learning-synthesizer.test.ts` -- covers learnings.md initialization (BOOT-09)
- [ ] `tests/fixtures/sample-project/` -- fixture project with known conventions for integration tests (BOOT-06)

## Sources

### Primary (HIGH confidence)
- [graphology-communities-louvain official docs](https://graphology.github.io/standard-library/communities-louvain.html) -- API reference for louvain(), louvain.assign(), louvain.detailed(); options including resolution, fastLocalMoves; detailed output with communities, count, modularity
- [graphology-metrics official docs](https://graphology.github.io/standard-library/metrics.html) -- degreeCentrality, inDegreeCentrality, outDegreeCentrality API; assign variants; modularity computation
- [graphology-traversal official docs](https://graphology.github.io/standard-library/traversal.html) -- bfsFromNode(graph, node, callback) where callback receives (node, attr, depth); return true to stop
- [graphology instantiation docs](https://graphology.github.io/instantiation.html) -- DirectedGraph constructor, options (multi, allowSelfLoops, type)
- [ast-grep YAML rule configuration reference](https://ast-grep.github.io/reference/yaml.html) -- rule file structure: id, language, rule, severity, message, files, ignores, constraints, transform
- [ast-grep rule object reference](https://ast-grep.github.io/reference/rule.html) -- atomic rules (pattern, kind, regex), relational (inside, has, follows, precedes), composite (all, any, not)
- [ast-grep sgconfig.yml reference](https://ast-grep.github.io/reference/sgconfig.html) -- ruleDirs, testConfigs, utilDirs configuration
- [ast-grep JSON output format](https://ast-grep.github.io/guide/tools/json.html) -- Match object with text, range, file, ruleId, severity, message; zero-based line/column
- [ast-grep scan CLI reference](https://ast-grep.github.io/reference/cli/scan.html) -- scan command options: --rule, --json, --include-metadata

### Secondary (MEDIUM confidence)
- [coderabbitai/ast-grep-essentials](https://github.com/coderabbitai/ast-grep-essentials) -- community rule library organization pattern (language/category/rule.yml)
- [graphology npm package](https://www.npmjs.com/package/graphology) -- v0.26.0 confirmed installed
- [graphology-communities-louvain npm](https://www.npmjs.com/package/graphology-communities-louvain) -- v2.0.2, benchmarks (50K nodes + 1M edges in ~940ms)

### Tertiary (LOW confidence)
- None. All critical findings verified via official documentation.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries verified via official docs and npm. graphology ecosystem well-documented. ast-grep CLI installed and version confirmed.
- Architecture: HIGH -- Graph builder/analytics separation pattern from D-17, D-18, D-19 user decisions. Code examples verified against official graphology and ast-grep APIs.
- Pitfalls: HIGH -- Zero-based line numbers confirmed via ast-grep docs. graphology edge duplicate behavior verified via official API docs. maxBuffer issue is a well-known Node.js execSync limitation.

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (30 days -- stable libraries, no fast-moving dependencies)
