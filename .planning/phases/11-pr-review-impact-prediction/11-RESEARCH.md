# Phase 11: PR Review + Impact Prediction - Research

**Researched:** 2026-03-28
**Domain:** MCP tool development, graph traversal, git diff parsing, convention compliance
**Confidence:** HIGH

## Summary

Phase 11 adds two new MCP tools (`codescope_review`, `codescope_predict_impact`) and one skill (`/codescope:review`). The implementation is predominantly a composition of existing, battle-tested subsystems: diff parsing from `detect-changes.ts`, BFS traversal from `analytics.ts`, convention checking from `conventions.ts` + `verify.ts`, and community data from SQLite. No new libraries are needed. The graph infrastructure (cache, centrality, community detection) is fully built and tested.

The highest-value finding is that graphology-traversal's `bfsFromNode` already supports an `{ mode: 'inbound' }` option, enabling reverse BFS traversal without writing a custom walker. This directly satisfies IMPACT-02's reverse dependency walking requirement. The existing `blastRadius()` function in `analytics.ts` can be adapted with a single parameter change to produce reverse blast radius results.

**Primary recommendation:** Build both tools as compositions of existing handlers and analytics functions. The review tool is an enhanced `handleDetectChanges()` with convention and cross-community overlays. The impact prediction tool is `blastRadius()` with `mode: 'inbound'`. Both follow the established handler-extraction pattern for testability.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Review output follows existing `okResponse()` envelope with structured sections: `summary` (totals, risk breakdown), `files` (per-file risk table with centrality + blast_radius_count), `dependency_changes` (new/removed edges, circular deps), `convention_violations` (per-file with evidence), `cross_community_changes` (flagged boundary crossings).
- **D-02:** `/codescope:review` skill formats MCP tool output into readable markdown report -- the MCP tool (`codescope_review`) is the engine, the skill is the UX. Consistent with existing tool/skill separation pattern.
- **D-03:** Input priority: PR number (via `gh pr diff`) > branch name (via `git diff main...{branch}`) > working tree diff (default `git diff --name-only HEAD`). Matches REVIEW-04 exactly. Working tree diff is the default when no args provided, consistent with existing `handleDetectChanges()` behavior.
- **D-04:** `gh` CLI failure (not installed, not authenticated) returns `errorResponse("GH_CLI_UNAVAILABLE", ...)` with suggestion to use branch name or working tree diff instead. Never hard-fail on missing external tools.
- **D-05:** `codescope_predict_impact` defaults to 4 hops, configurable via `max_hops` param (same interface as existing `codescope_blast_radius` tool).
- **D-06:** Reverse dependency walk uses graphology's `inNeighbors` / `forEachInNeighbor` to traverse import edges backward (callers/importers). Returns the same `BlastRadiusNode` shape (`nodeId`, `name`, `filePath`, `hop`, `risk`) for consistency with existing blast radius tool.
- **D-07:** Risk scoring included -- each node in the reverse walk gets centrality-based risk classification (HIGH >0.7, MEDIUM 0.3-0.7, LOW <0.3), matching `classifyRisk()` in `src/tools/detect-changes.ts`.
- **D-08:** Cross-community threshold: flag when a diff touches files in 3+ distinct communities. Below that is normal refactoring. Community data comes from existing `communities` SQLite table populated by Louvain.
- **D-09:** New edge detection: parse changed files from diff, resolve their imports, compare against stored edges in the `edges` table. Report added/removed edges with source/target file paths.
- **D-10:** Circular dependency detection: after computing new edges, run DFS cycle detection on the subgraph of changed files + their immediate neighbors. Only report new cycles (not pre-existing ones).

### Claude's Discretion
- Internal implementation of reverse BFS (custom walker vs graphology-traversal adaptation)
- Exact markdown formatting of the `/codescope:review` skill report
- Whether to cache community lookups per-review or query SQLite per-file
- Convention violation severity ordering in the report
- Token estimation for review output size

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REVIEW-01 | `codescope_review` MCP tool accepts git diff/branch and returns structural impact analysis with risk scores per file | Reuse `parseFilesFromDiff()`, `getWorkingDirChanges()`, `classifyRisk()`, `blastRadius()` from existing tools. okResponse envelope per D-01. |
| REVIEW-02 | Review detects new dependency edges, circular dependencies, and cross-community changes in the diff | SQLite `edges` table comparison for edge detection. DFS cycle detection on subgraph. `communities` table query for cross-community (D-08 threshold 3+). |
| REVIEW-03 | Review runs convention compliance on changed files and flags violations with evidence | Reuse `parseConventions()` from `conventions.ts` for convention data. Match conventions to changed files. Include adoption_pct and evidence per convention. |
| REVIEW-04 | `/codescope:review` skill accepts branch name, PR number (via gh), or defaults to working tree diff | `gh pr diff {number}` for PR input, `git diff main...{branch}` for branch input, `git diff --name-only HEAD` for working tree (D-03). Skill wraps MCP tool. |
| IMPACT-01 | `codescope_predict_impact` MCP tool accepts file paths and returns pre-change blast radius with risk assessment | Reverse BFS via `bfsFromNode` with `{ mode: 'inbound' }`. Returns `BlastRadiusNode[]` shape. Risk scoring via `classifyRisk()`. |
| IMPACT-02 | Reverse dependency query walks import edges backward to find all callers/importers up to N hops | graphology-traversal `bfsFromNode` with `mode: 'inbound'` traverses incoming edges. Verified in source: uses `forEachInboundNeighbor`. Default 4 hops per D-05. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack**: TypeScript, web-tree-sitter WASM, ast-grep CLI, better-sqlite3, graphology, enhanced-resolve, @modelcontextprotocol/sdk, vitest
- **Performance**: Graph queries <100ms
- **Quality**: Convention false positive rate <5%
- **Testing**: vitest (^4.1.0) with `tests/**/*.test.ts` pattern
- **MCP SDK**: @modelcontextprotocol/sdk ^1.27.1 (v1.x stable)
- **Zod**: ^3.25 with `zod/v4` import path
- **Response format**: All tools use `okResponse()`/`errorResponse()` from `src/tools/helpers.ts`
- **Tool pattern**: Handler functions extracted for testability, registered via `server.tool()` with Zod schemas
- **Plugin structure**: Skills in `skills/` directory, registered in `.claude-plugin/plugin.json`

## Standard Stack

No new libraries needed. This phase exclusively uses the existing installed stack.

### Core (already installed)
| Library | Version | Purpose | Role in Phase 11 |
|---------|---------|---------|-------------------|
| graphology | ^0.26.0 | Directed graph | Node lookup, edge comparison, neighbor queries |
| graphology-traversal | ^0.3.1 | BFS/DFS traversal | Reverse BFS for impact prediction (`mode: 'inbound'`) |
| better-sqlite3 | ^12.8.0 | SQLite access | Query `edges` and `communities` tables |
| @modelcontextprotocol/sdk | ^1.27.1 | MCP server | Tool registration via `server.tool()` |
| zod | ^3.25 (zod/v4) | Input validation | Zod schemas for tool parameters |

### External Tools
| Tool | Purpose | Required | Fallback |
|------|---------|----------|----------|
| git | Diff computation, branch comparison | Yes | None (core dependency) |
| gh | PR diff retrieval | No | Branch name or working tree diff (D-04) |

## Architecture Patterns

### Recommended Project Structure
```
src/tools/
  review.ts              # codescope_review MCP tool + handler
  impact-prediction.ts   # codescope_predict_impact MCP tool + handler
  index.ts               # Updated: register both new tools
src/graph/
  analytics.ts           # Updated: add reverseBlastRadius() function
  analytics.ts           # Updated: add detectCycles() function
skills/
  review/
    SKILL.md             # /codescope:review skill definition
.claude-plugin/
  plugin.json            # Updated: add review skill entry
```

### Pattern 1: Handler Extraction for Testability
**What:** Extract core logic into exported async handler functions. MCP registration is a thin wrapper.
**When to use:** Every MCP tool in this project.
**Example (from existing blast-radius.ts):**
```typescript
// Handler: testable without MCP transport
export async function handleReview(
  args: Record<string, unknown>,
  projectRoot: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startMs = Date.now();
  if (!isBootstrapped(projectRoot)) {
    return errorResponse("NOT_BOOTSTRAPPED", "...", "...");
  }
  // ... core logic ...
  return okResponse(data, buildMetadata(projectRoot, startMs));
}

// Registration: thin wrapper
export function registerReviewTool(server: McpServer, projectRoot: string): void {
  server.tool("codescope_review", "description", { /* zod schema */ },
    async (args) => handleReview(args as Record<string, unknown>, projectRoot)
  );
}
```

### Pattern 2: Diff Input Resolution Chain (D-03)
**What:** Resolve diff input through priority chain: PR number > branch name > working tree.
**When to use:** `codescope_review` tool.
```typescript
async function resolveDiff(args: {
  pr_number?: number;
  branch?: string;
  diff?: string;
}, projectRoot: string): Promise<{ files: string[]; diffText: string; source: string }> {
  // 1. Explicit diff string provided
  if (args.diff) {
    return { files: parseFilesFromDiff(args.diff), diffText: args.diff, source: "diff" };
  }

  // 2. PR number (via gh CLI)
  if (args.pr_number) {
    try {
      const diff = execSync(`gh pr diff ${args.pr_number}`, {
        cwd: projectRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
      });
      return { files: parseFilesFromDiff(diff), diffText: diff, source: "pr" };
    } catch {
      return errorResponse("GH_CLI_UNAVAILABLE", "...", "Use branch or working tree diff instead.");
    }
  }

  // 3. Branch name (via git diff)
  if (args.branch) {
    const diff = execSync(`git diff main...${args.branch}`, {
      cwd: projectRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"],
    });
    return { files: parseFilesFromDiff(diff), diffText: diff, source: "branch" };
  }

  // 4. Working tree diff (default)
  return { files: getWorkingDirChanges(projectRoot), diffText: "", source: "working_tree" };
}
```

### Pattern 3: Reverse BFS via graphology-traversal mode option
**What:** Use existing `bfsFromNode` with `{ mode: 'inbound' }` for reverse dependency walking.
**When to use:** `codescope_predict_impact` tool.
**Source:** Verified in graphology-traversal source (bfs.js line 42): `graph['forEach' + capitalize(options.mode || 'outbound') + 'Neighbor']`
```typescript
import { bfsFromNode } from "graphology-traversal";

export function reverseBlastRadius(
  graph: DirectedGraph,
  nodeId: string,
  maxHops: number = 4,
): BlastRadiusNode[] {
  if (!graph.hasNode(nodeId)) return [];

  const results: BlastRadiusNode[] = [];

  bfsFromNode(
    graph,
    nodeId,
    (node: string, attr: Record<string, unknown>, depth: number) => {
      if (depth > maxHops) return true; // Stop traversal

      let risk: RiskLevel;
      if (depth === 0) risk = "Red";
      else if (depth === 1) risk = "Orange";
      else if (depth === 2) risk = "Yellow";
      else risk = "Green";

      results.push({
        nodeId: node,
        name: (attr.name as string) ?? node,
        filePath: (attr.filePath as string) ?? "",
        hop: depth,
        risk,
      });

      return false;
    },
    { mode: "inbound" }, // <-- key change: traverse incoming edges
  );

  results.sort((a, b) => a.hop - b.hop);
  return results;
}
```

### Pattern 4: SQLite Edge Comparison for New/Removed Edge Detection
**What:** Compare edges from the parsed diff against stored edges in the `edges` table.
**When to use:** `codescope_review` dependency change detection (D-09).
```typescript
// Get stored edges for changed file nodes
const storedEdges = db.prepare(`
  SELECT e.source_id, e.target_id, e.kind,
         src.file_path AS source_path, tgt.file_path AS target_path
  FROM edges e
  JOIN nodes src ON e.source_id = src.id
  JOIN nodes tgt ON e.target_id = tgt.id
  WHERE src.file_path IN (${placeholders}) OR tgt.file_path IN (${placeholders})
`).all(...changedFiles, ...changedFiles);
```

### Pattern 5: DFS Cycle Detection on Subgraph
**What:** After computing new edges, run DFS on changed files + neighbors to find new cycles.
**When to use:** `codescope_review` circular dependency detection (D-10).
```typescript
function detectCycles(
  graph: DirectedGraph,
  startNodes: string[],
): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();

  function dfs(node: string, path: string[]): void {
    if (inStack.has(node)) {
      // Found cycle: extract cycle from path
      const cycleStart = path.indexOf(node);
      cycles.push(path.slice(cycleStart));
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    path.push(node);

    graph.forEachOutNeighbor(node, (neighbor) => {
      dfs(neighbor, [...path]);
    });

    inStack.delete(node);
  }

  for (const node of startNodes) {
    if (!visited.has(node)) {
      dfs(node, []);
    }
  }

  return cycles;
}
```

### Anti-Patterns to Avoid
- **Building a full graph diff engine:** The edge comparison should only look at changed files' edges, not rebuild the entire graph. Keep the scope tight to meet the <100ms query time constraint.
- **Re-parsing changed files for imports:** Import resolution is expensive. Compare against the stored edges in SQLite rather than re-parsing with tree-sitter. The stored `edges` table already has the resolved import graph from bootstrap.
- **Blocking on gh CLI:** Per D-04, `gh` failure must degrade gracefully. Never throw or hard-fail on `gh` unavailability.
- **Computing centrality per-request:** Use `CachedGraph.centralities` from `getGraph()`. Centrality is pre-computed and cached with 5-minute TTL.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Reverse graph traversal | Custom BFS with manual queue and inNeighbors iteration | `bfsFromNode(graph, nodeId, callback, { mode: 'inbound' })` | graphology-traversal already handles visited tracking, depth counting, and early termination. Verified in source code. |
| Diff parsing | Custom regex parser for unified diff format | Existing `parseFilesFromDiff()` from `src/tools/detect-changes.ts` | Already handles `diff --git a/ b/` format, tested. |
| Risk classification | New risk thresholds or scoring | Existing `classifyRisk()` from `src/tools/detect-changes.ts` | Established thresholds (0.7/0.3) used across the codebase. D-07 mandates reuse. |
| Convention data access | Direct file parsing | Existing `parseConventions()` from `src/tools/conventions.ts` | Handles all convention.md format variations. |
| Working tree changes | New git diff wrapper | Existing `getWorkingDirChanges()` from `src/tools/detect-changes.ts` | Already handles edge cases (no commits, not a repo). |
| Community lookup | In-memory community map | Direct SQLite query on `communities` table | Communities table is indexed. Query is O(1) per file. No need to load all community data into memory. |
| Blast radius (forward) | Custom traversal | Existing `blastRadius()` from `src/graph/analytics.ts` | Already tested and used by multiple tools. |

**Key insight:** Phase 11 is primarily a composition phase. Nearly every computation primitive exists. The new code is glue: resolving inputs, orchestrating existing functions, and formatting outputs.

## Common Pitfalls

### Pitfall 1: Shell Injection in gh/git Commands
**What goes wrong:** Unsanitized PR numbers or branch names passed to `execSync` allow command injection.
**Why it happens:** PR numbers and branch names come from user input via MCP tool args.
**How to avoid:** Use `execFileSync` (array arguments) instead of `execSync` (shell string). Validate PR number is a positive integer. Validate branch name matches `^[a-zA-Z0-9._/-]+$`.
**Warning signs:** Using string interpolation in `execSync` calls with user input.

### Pitfall 2: Large Diff Output Exceeding Buffer
**What goes wrong:** `execSync`/`execFileSync` with default `maxBuffer` (1MB) throws on large PRs.
**Why it happens:** PRs with many files or large diffs produce output exceeding the default buffer.
**How to avoid:** Set `maxBuffer: 50 * 1024 * 1024` (50MB) consistent with `verify.ts` pattern. For extremely large diffs, consider streaming but this is unlikely to be needed.
**Warning signs:** `ENOBUFS` or `maxBuffer exceeded` errors in production.

### Pitfall 3: Missing Nodes in Graph for Changed Files
**What goes wrong:** Changed files from the diff may not have corresponding nodes in the graph (new files, files excluded from bootstrap, test files).
**Why it happens:** The diff includes ALL changed files but the knowledge graph only contains files that were parsed during bootstrap.
**How to avoid:** Handle gracefully per existing pattern in `handleDetectChanges()`: files not in graph get LOW risk, 0 centrality, 0 blast radius. Never throw on missing nodes.
**Warning signs:** `undefined` node lookups, missing file paths in results.

### Pitfall 4: Branch Name Resolution Ambiguity
**What goes wrong:** `git diff main...{branch}` fails when the default branch is not `main` (could be `master`, `develop`, etc.).
**Why it happens:** Hard-coded base branch assumption.
**How to avoid:** Detect the default branch with `git symbolic-ref refs/remotes/origin/HEAD --short 2>/dev/null` or fall back to common names. Or accept an optional `base_branch` parameter.
**Warning signs:** `fatal: ambiguous argument 'main...feature'` from git.

### Pitfall 5: Stale Community Data
**What goes wrong:** Community assignments in SQLite may be stale if bootstrap ran long ago. Cross-community detection gives misleading results.
**Why it happens:** Communities are computed during bootstrap and not updated incrementally.
**How to avoid:** Include staleness metadata in the response (already available via `buildMetadata()`). The staleness indicator warns users when data may be outdated. This is a known limitation, not something to solve in this phase.
**Warning signs:** `metadata.staleness` showing `stale` or `very_stale`.

### Pitfall 6: Cycle Detection Performance on Dense Subgraphs
**What goes wrong:** DFS cycle detection on the subgraph of changed files + neighbors can be slow if a changed file has many neighbors (e.g., a central utility file).
**Why it happens:** Including "immediate neighbors" of changed files can expand the subgraph significantly for high-centrality files.
**How to avoid:** Cap the neighbor expansion. If a changed file has >50 outbound neighbors, skip neighbor expansion for that file and only include it directly. The goal is detecting NEW cycles from the change, not auditing the entire graph.
**Warning signs:** Review tool taking >100ms on large codebases with central files changed.

## Code Examples

### Review Tool Response Shape (D-01)
```typescript
// Source: D-01 from CONTEXT.md
interface ReviewData {
  summary: {
    total_files: number;
    high_risk: number;
    medium_risk: number;
    low_risk: number;
  };
  files: Array<{
    path: string;
    risk: "HIGH" | "MEDIUM" | "LOW";
    centrality: number;
    blast_radius_count: number;
  }>;
  dependency_changes: {
    new_edges: Array<{ source: string; target: string; kind: string }>;
    removed_edges: Array<{ source: string; target: string; kind: string }>;
    circular_dependencies: string[][]; // Each inner array is a cycle path
  };
  convention_violations: Array<{
    file: string;
    convention: string;
    adoption_pct: number;
    confidence: string;
    evidence: string[];
  }>;
  cross_community_changes: {
    communities_touched: number;
    flagged: boolean; // true when >= 3 communities per D-08
    community_breakdown: Array<{
      community_id: number;
      label: string;
      files: string[];
    }>;
  };
}
```

### Tool Registration Zod Schema (Review)
```typescript
// Source: established pattern from blast-radius.ts, detect-changes.ts
{
  pr_number: z.number().int().positive().optional()
    .describe("GitHub PR number to review (requires gh CLI)"),
  branch: z.string().optional()
    .describe("Branch name to diff against default branch"),
  diff: z.string().optional()
    .describe("Raw git diff string to analyze"),
}
```

### Tool Registration Zod Schema (Impact Prediction)
```typescript
// Source: D-05, D-06, modeled after blast-radius.ts
{
  file_paths: z.array(z.string()).min(1)
    .describe("File paths to predict impact for"),
  max_hops: z.number().int().min(1).max(10).optional()
    .describe("Maximum reverse BFS hops (default: 4)"),
}
```

### Community Lookup via SQLite
```typescript
// Source: schema.ts communities table structure
function getFileCommunities(
  db: DatabaseType,
  nodeIds: string[],
): Map<string, { communityId: number; label: string }> {
  const placeholders = nodeIds.map(() => "?").join(",");
  const rows = db.prepare(`
    SELECT node_id, community_id, modularity_class
    FROM communities
    WHERE node_id IN (${placeholders})
  `).all(...nodeIds.map(Number)) as Array<{
    node_id: number;
    community_id: number;
    modularity_class: string;
  }>;

  const map = new Map<string, { communityId: number; label: string }>();
  for (const row of rows) {
    map.set(String(row.node_id), {
      communityId: row.community_id,
      label: row.modularity_class,
    });
  }
  return map;
}
```

### Skill File Structure
```markdown
---
name: review
description: Run structural impact analysis on a branch, PR, or working tree diff.
allowed-tools:
  - Bash
  - Read
---

# /codescope:review

[Skill content that calls codescope_review MCP tool and formats output as markdown]
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| No reverse traversal | `bfsFromNode` with `mode: 'inbound'` | graphology-traversal 0.3.x | Eliminates need for custom reverse BFS walker |
| Manual edge tracking | SQLite `edges` table with CASCADE | Phase 9 (v2 schema) | Reliable edge data for comparison |
| No staleness detection | File hash staleness on every tool call | Phase 9 (GRAPH-01) | Review results reflect current graph state when queriedFiles passed |

## Open Questions

1. **Base branch detection for `git diff`**
   - What we know: The codebase currently hard-codes patterns like `git diff --name-only HEAD` in `getWorkingDirChanges()`. The branch diff command `git diff main...{branch}` assumes `main` as the default branch.
   - What's unclear: Whether to detect the default branch dynamically or accept it as a parameter.
   - Recommendation: Accept an optional `base_branch` parameter in the Zod schema (default: auto-detect via `git symbolic-ref refs/remotes/origin/HEAD`). This is Claude's discretion area.

2. **New edge detection requires import re-resolution**
   - What we know: D-09 says "parse changed files from diff, resolve their imports, compare against stored edges." The stored edges come from bootstrap. But if a changed file adds a new import, we need to know the resolved target to detect the new edge.
   - What's unclear: Whether to re-parse the changed files with tree-sitter to extract new imports, or to rely on the incremental rebuild (GRAPH-01/02) to update edges first.
   - Recommendation: Trigger `getGraph(projectRoot, changedFiles)` which performs staleness check and incremental rebuild (Phase 9 infrastructure). After the rebuild, the edges table is current. Then compare the current edges against a "before" snapshot. However, we do not have a "before" snapshot readily available. Alternative: skip deep new-edge detection in the initial implementation and report edges involving changed files from the current graph. Flag this as a simplification that can be enhanced later. The circular dependency detection (D-10) works on the current graph regardless.

3. **Convention checking scope for review**
   - What we know: `parseConventions()` reads conventions.md and returns all conventions. The review needs to check which conventions the changed files violate.
   - What's unclear: Whether "violation" means "file should follow this convention but doesn't" (negative match) or "file contains an anti-pattern" (positive match against a negative rule).
   - Recommendation: Follow the existing verify.ts pattern: match each changed file against conventions that list it in their `files` array. If the file is listed in a convention's file list but doesn't follow the pattern, that is a violation. For the initial implementation, listing conventions applicable to changed files with their adoption rates is the most practical approach. True violation detection (running ast-grep against rules) is the verify tool's domain -- the review tool should reference it.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| git | Diff computation, branch comparison | Yes | 2.50.1 | None (core dependency) |
| gh | PR diff retrieval (REVIEW-04) | Yes | 2.87.3 | Branch name or working tree diff (D-04) |
| Node.js | Runtime | Yes | >=22.x | None |
| graphology-traversal | Reverse BFS | Yes | ^0.3.1 (installed) | None |
| better-sqlite3 | Community/edge queries | Yes | ^12.8.0 (installed) | None |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** None (gh is available but has a fallback regardless)

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.0 |
| Config file | vitest.config.ts (root) |
| Quick run command | `npx vitest run tests/tools/review.test.ts tests/tools/impact-prediction.test.ts --reporter=verbose` |
| Full suite command | `npx vitest run --reporter=verbose` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REVIEW-01 | Review tool returns structural impact with risk scores per file | unit | `npx vitest run tests/tools/review.test.ts -t "risk scores" -x` | No -- Wave 0 |
| REVIEW-02 | Detects new edges, circular deps, cross-community changes | unit | `npx vitest run tests/tools/review.test.ts -t "dependency changes" -x` | No -- Wave 0 |
| REVIEW-03 | Convention compliance on changed files with evidence | unit | `npx vitest run tests/tools/review.test.ts -t "convention" -x` | No -- Wave 0 |
| REVIEW-04 | Skill accepts branch name, PR number, working tree diff | unit | `npx vitest run tests/tools/review.test.ts -t "input resolution" -x` | No -- Wave 0 |
| IMPACT-01 | Predict impact returns reverse blast radius with risk | unit | `npx vitest run tests/tools/impact-prediction.test.ts -t "reverse blast" -x` | No -- Wave 0 |
| IMPACT-02 | Reverse dependency walk via inbound traversal up to N hops | unit | `npx vitest run tests/tools/impact-prediction.test.ts -t "reverse BFS" -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/tools/review.test.ts tests/tools/impact-prediction.test.ts --reporter=verbose`
- **Per wave merge:** `npx vitest run --reporter=verbose`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/tools/review.test.ts` -- covers REVIEW-01, REVIEW-02, REVIEW-03, REVIEW-04
- [ ] `tests/tools/impact-prediction.test.ts` -- covers IMPACT-01, IMPACT-02
- [ ] `tests/graph/reverse-blast-radius.test.ts` -- covers reverseBlastRadius() analytics function
- No framework install needed -- vitest is already configured and all existing tests pass

## Sources

### Primary (HIGH confidence)
- graphology-traversal source code (`node_modules/graphology-traversal/bfs.js`) - verified `mode` option supports `'inbound'` for reverse traversal
- graphology-traversal type definitions (`node_modules/graphology-traversal/types.d.ts`) - `TraversalMode` includes `'inbound'`
- `src/tools/detect-changes.ts` - existing `parseFilesFromDiff()`, `getWorkingDirChanges()`, `classifyRisk()` functions
- `src/tools/blast-radius.ts` - existing `handleBlastRadius()` pattern with `getGraph()` + `blastRadius()`
- `src/tools/conventions.ts` - existing `parseConventions()` function and `ParsedConvention` type
- `src/tools/verify.ts` - convention compliance checking pattern with ast-grep
- `src/graph/analytics.ts` - existing `blastRadius()` BFS implementation, `BlastRadiusNode` type
- `src/graph/cache.ts` - `getGraph()` with staleness-aware cache, `CachedGraph` interface
- `src/graph/schema.ts` - `edges` and `communities` table schemas (v2 with CASCADE)
- `src/tools/helpers.ts` - `okResponse()`, `errorResponse()`, `isBootstrapped()`, `buildMetadata()`
- `src/tools/index.ts` - tool registration pattern
- `.claude-plugin/plugin.json` - plugin manifest structure
- `skills/settings/SKILL.md` - skill file format reference

### Secondary (MEDIUM confidence)
- graphology API (verified via Node.js REPL): `inNeighbors()`, `forEachInboundNeighbor()` confirmed working
- git diff format: `diff --git a/ b/` line parsing verified via existing test coverage in detect-changes.test.ts

### Tertiary (LOW confidence)
- None -- all findings verified against source code or runtime testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already installed and used in the project
- Architecture: HIGH - patterns directly observed in existing tool implementations
- Pitfalls: HIGH - based on observed code patterns and known edge cases in existing tools
- Reverse BFS: HIGH - verified in graphology-traversal source code and type definitions
- Edge detection: MEDIUM - the "before vs after" comparison approach needs implementation design decisions (see Open Questions)

**Research date:** 2026-03-28
**Valid until:** 2026-04-28 (stable -- all dependencies are locked, no external API changes expected)
