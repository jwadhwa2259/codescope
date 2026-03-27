# Phase 3: Bootstrap Synthesis and MCP Server - Research

**Researched:** 2026-03-23
**Domain:** Bootstrap orchestration, monorepo scaling, MCP tool implementation, graph caching, AI readiness scoring
**Confidence:** HIGH

## Summary

Phase 3 transforms individual analysis agents (Phase 2) into a complete bootstrap pipeline with monorepo support and makes all 11 MCP tools operational. The codebase has strong foundations: 5 agent modules (`src/agents/*.ts`), graph analytics (`src/graph/analytics.ts`), convention detection (`src/conventions/runner.ts`), 10 stub MCP tools with Zod schemas (`src/tools/stubs.ts`), and a working status tool pattern (`src/tools/status.ts`). The main work falls into four categories: (1) bootstrap orchestrator with monorepo squad scaling and synthesis, (2) graph caching layer for sub-100ms queries, (3) AI readiness scoring with 4-dimension rubric, and (4) replacing 10 stub tools with real implementations.

The existing code follows consistent patterns (agent module pattern with Options/Result interfaces, BatchWriter for graph data, filesystem coordination) that Phase 3 must continue. The MCP server entry point (`src/server.ts`) is minimal (14 lines) and needs expansion for metadata tracking and caching. All 233 existing tests pass, and the test infrastructure (vitest 4.1.x, sample fixture project) supports the new modules.

**Primary recommendation:** Structure implementation around four work streams: (A) graph cache + response helpers (shared foundation), (B) MCP tool implementations (10 tools replacing stubs), (C) bootstrap orchestrator with synthesis and readiness scoring, (D) bootstrap skill body. Each stream has clear dependencies and testable outputs.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** AI readiness score: 4 dimensions with equal weighting (25% each): convention coverage, type safety coverage, test coverage proxy, import graph health
- **D-02:** Letter grade presentation (A-F) with +/- granularity using standard academic thresholds
- **D-03:** Top 3 actionable improvement steps citing specific files/patterns
- **D-04:** One-sentence "what this means for AI" explainer per dimension
- **D-05:** Delta tracking on re-bootstrap comparing current to previous scores
- **D-06:** Progress reporting uses phase banners + agent completion status (not file-level)
- **D-07:** Monorepo squads run sequentially per service (one squad at a time), rate-limit safe
- **D-08:** Completion summary shows artifact list, key stats, AI readiness grade, and "Next: /codescope:orient" CTA
- **D-09:** Incremental re-bootstrap by default via git diff; falls back to full if >50% changed; --force for full
- **D-10:** Cross-service synthesis captures shared type imports only; merged conventions.md with per-service adoption tags
- **D-11:** Cross-service map written as both markdown artifact and queryable via codescope_service_map MCP tool
- **D-12:** Convention promotion via /codescope:review-learnings (Phase 7); user confirms/rejects each
- **D-13:** "Enforced" means warning with evidence in verify reports; never blocks
- **D-14:** conventions-enforced.md starts completely empty; no auto-promotion ever
- **D-15:** Only high-confidence conventions (>=80% adoption, >=10 files) eligible for enforcement
- **D-16:** Rollback via /codescope:settings (Phase 7)
- **D-17:** All tools return structured JSON: `{ status: "ok"|"error"|"partial", data: {...}, metadata: {...} }`
- **D-18:** Staleness tracking in every response: last_bootstrap timestamp and staleness field (fresh/stale/very_stale)
- **D-19:** Structured errors with recovery hints: `{ status: "error", error: { code, message, recovery } }`
- **D-20:** codescope_recall returns combined inline response from overview.md, conventions.md, learnings.md
- **D-21:** Graph tools use lazy-load + cache with 5-minute TTL; first call ~200ms, subsequent ~5ms
- **D-22:** codescope_search supports graph-based search only in Phase 3
- **D-23:** codescope_detect_changes classifies risk using centrality tiers: HIGH (>0.7), MEDIUM (0.3-0.7), LOW (<0.3)
- **D-24:** detect_changes includes risk level AND blast_radius_count per file, not full affected list
- **D-25:** Squad cap configured in config.yml as bootstrap.squad_cap (mapped to bootstrap.max_squads, default 10)
- **D-26:** When services exceed cap, analyze N largest by LOC; remaining get lightweight scan
- **D-27:** codescope_orient MCP tool returns lightweight brief (NOT full orient pipeline)
- **D-28:** Orient file matching uses keyword extraction + graph walk (1-2 hop neighbors, rank by centrality + keyword relevance)
- **D-29:** --force resets analysis artifacts, preserves user data
- **D-30:** --force shows confirmation before wiping
- **D-31:** Performance budget for 100K LOC (~260s / 4.3min target): file walking 10s, AST parsing 120s, import resolution 30s, graph construction 20s, graph analytics 10s, convention detection 30s, artifact generation 10s, synthesis 30s
- **D-32:** If bootstrap exceeds 5-min budget, complete and report timing warning (not hard cutoff)
- **D-33:** codescope_service_map returns service list + dependency edges with shared types and import counts
- **D-34:** Single-service projects return one-service response with empty dependencies array
- **D-35:** Rich MCP tool descriptions with use-case examples and "Related tools" pointers
- **D-36:** codescope_verify has partial functionality: convention compliance only in Phase 3
- **D-37:** codescope_search has partial functionality: graph-based search only in Phase 3
- **D-38:** Partial tools include capabilities and upcoming arrays in metadata

### Claude's Discretion
- No areas deferred to Claude's discretion -- all gray areas received explicit user decisions.

### Deferred Ideas (OUT OF SCOPE)
- Text-based and hybrid search for codescope_search -- Phase 4
- Full verification (blast radius diff, build/test) for codescope_verify -- Phase 5
- Convention enforcement rollback via /codescope:settings -- Phase 7
- Convention promotion via /codescope:review-learnings -- Phase 7
- @ast-grep/napi programmatic API -- defer unless CLI subprocess overhead becomes bottleneck
- Persistent in-memory graphology graph (replaced by TTL cache approach)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| BOOT-11 | Monorepo: one analysis squad per service, writing to services/[name]/ | Bootstrap orchestrator iterates config.services, runs squad per service sequentially (D-07), writes to services subdirs |
| BOOT-12 | Squad cap configurable (default 10) to prevent runaway | Config schema already has `bootstrap.max_squads`; orchestrator checks service count against cap, does lightweight scan for overflow |
| BOOT-13 | Synthesis agent: cross-service dependency map, merged conventions, global danger zones | New `src/bootstrap/synthesis.ts` module; reads per-service artifacts + graph edges crossing service boundaries |
| BOOT-14 | AI readiness score in readiness.md with transparent rubric and improvement steps | New `src/bootstrap/readiness.ts` module; 4-dimension scoring (D-01 through D-05); reads graph + conventions + file stats |
| BOOT-15 | High-confidence conventions to conventions-enforced.md (never auto-promoted) | Create empty conventions-enforced.md during bootstrap; actual promotion deferred to Phase 7 review command |
| BOOT-16 | Full bootstrap < 5 minutes for 100K LOC | Performance budget D-31; sequential squads; timing instrumentation; warning if exceeded (D-32) |
| GRPH-05 | Graph queries < 100ms | Graph cache layer with 5-minute TTL (D-21); lazy-load from SQLite ~200ms first call, ~5ms subsequent |
| GRPH-06 | Cross-service dependency map for monorepos | Synthesis module reads graph edges where source/target span different service paths; outputs shared types + import counts |
| MCP-01 | MCP server with @modelcontextprotocol/sdk and StdioServerTransport | Server already exists at `src/server.ts`; expand with metadata tracking, error handling, bootstrap state checks |
| MCP-02 | codescope_recall tool | Read overview.md, conventions.md, learnings.md; extract relevant sections by topic keyword matching |
| MCP-03 | codescope_graph_query tool | Load cached graph; query neighbors, paths, communities by node ID or file path |
| MCP-04 | codescope_blast_radius tool | Load cached graph; run existing blastRadius() from analytics.ts; format with hop-distance classification |
| MCP-05 | codescope_conventions tool | Read conventions.md; filter by file path or module; return matching conventions with adoption % |
| MCP-06 | codescope_orient tool | Lightweight brief: keyword extraction from task, graph walk 1-2 hops, return relevant files + conventions + danger zones |
| MCP-07 | codescope_verify tool (partial) | Convention compliance check only in Phase 3; run ast-grep on specified files against detected conventions |
| MCP-08 | codescope_search tool (partial) | Graph-based search only: by symbol name, file path, or relationship type |
| MCP-09 | codescope_readiness tool | Read readiness.md; parse and return structured readiness score data |
| MCP-10 | codescope_status tool | Already functional; update to use D-17 response format with staleness metadata |
| MCP-11 | codescope_detect_changes tool | Parse git diff; map changed files to graph nodes; classify risk using centrality tiers (D-23) |
| MCP-12 | codescope_service_map tool | Read service-manifest.md + cross-service-map.md; return structured service + dependency data |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack locked:** TypeScript, web-tree-sitter WASM 0.25.10, ast-grep CLI, better-sqlite3, graphology, enhanced-resolve, @modelcontextprotocol/sdk v1.x, vitest
- **Performance targets:** Bootstrap <5 min for 100K LOC, graph queries <100ms
- **Quality targets:** Convention false positive rate <5% for high-confidence
- **MCP SDK:** Use @modelcontextprotocol/sdk@^1.27.1 (v1.x, NOT v2 pre-alpha)
- **Zod:** Import from `zod/v4` path with zod@^3.25+
- **web-tree-sitter:** Call `tree.delete()` after every parse; periodic `parser.delete()` and recreate
- **Build:** tsdown to single JS entry point for MCP server
- **ESM-first:** type:module, NodeNext module resolution
- **Testing:** vitest for all tests
- **Plugin structure:** skills/ + src/ + .mcp.json
- **No node-tree-sitter, no web-tree-sitter 0.26.x, no tsup, no jest**

## Standard Stack

### Core (Already Installed)

| Library | Version | Purpose | Verified |
|---------|---------|---------|----------|
| @modelcontextprotocol/sdk | ^1.27.1 (npm: 1.27.1) | MCP server framework | package.json |
| better-sqlite3 | ^12.8.0 (npm: 12.8.0) | Knowledge graph storage | package.json |
| graphology | ^0.26.0 (npm: 0.26.0) | In-memory graph operations | package.json |
| graphology-communities-louvain | ^2.0.2 | Community detection | package.json |
| graphology-metrics | ^2.4.0 | Centrality calculations | package.json |
| graphology-traversal | ^0.3.1 | BFS blast radius | package.json |
| web-tree-sitter | 0.25.10 (pinned) | AST parsing | package.json |
| zod | ^3.25.0 (npm: 4.3.6) | Schema validation | package.json |
| vitest | ^4.1.0 (npm: 4.1.1) | Test framework | package.json |

### No New Dependencies Required

Phase 3 requires zero new npm dependencies. All needed libraries are already installed from Phases 1 and 2. The work is entirely about composing existing infrastructure into new modules.

## Architecture Patterns

### Recommended Project Structure (Phase 3 additions)

```
src/
├── bootstrap/               # NEW: Bootstrap orchestration
│   ├── orchestrator.ts      # Bootstrap pipeline controller
│   ├── synthesis.ts         # Cross-service analysis + merged conventions
│   ├── readiness.ts         # AI readiness score calculation
│   └── incremental.ts       # Git diff change detection for incremental re-bootstrap
├── graph/
│   ├── cache.ts             # NEW: Lazy-load + TTL cache for graphology instance
│   ├── analytics.ts         # EXISTING: centrality, communities, blastRadius
│   ├── builder.ts           # EXISTING: file walking, parsing, edge creation
│   ├── batch-writer.ts      # EXISTING: JSONL batch write
│   ├── database.ts          # EXISTING: openDatabase with WAL mode
│   └── schema.ts            # EXISTING: CREATE TABLE statements
├── tools/
│   ├── index.ts             # MODIFY: register real tools instead of stubs
│   ├── status.ts            # EXISTING: codescope_status (update response format)
│   ├── stubs.ts             # EXISTING: kept as fallback for pre-bootstrap state
│   ├── helpers.ts           # NEW: shared response builders, staleness calc, error formatting
│   ├── recall.ts            # NEW: codescope_recall implementation
│   ├── graph-query.ts       # NEW: codescope_graph_query implementation
│   ├── blast-radius.ts      # NEW: codescope_blast_radius implementation
│   ├── conventions.ts       # NEW: codescope_conventions implementation
│   ├── orient.ts            # NEW: codescope_orient lightweight brief
│   ├── verify.ts            # NEW: codescope_verify (partial: convention check)
│   ├── search.ts            # NEW: codescope_search (partial: graph-based)
│   ├── readiness.ts         # NEW: codescope_readiness implementation
│   ├── detect-changes.ts    # NEW: codescope_detect_changes implementation
│   └── service-map.ts       # NEW: codescope_service_map implementation
├── server.ts                # MODIFY: expand with bootstrap state tracking
├── agents/                  # EXISTING: 5 agent modules (used by orchestrator)
├── conventions/             # EXISTING: ast-grep runner + rules
├── config/                  # EXISTING: config schema, loader, writer
└── utils/
    └── paths.ts             # EXISTING: path helpers (may add new helpers)

skills/
└── bootstrap/
    └── SKILL.md             # MODIFY: replace placeholder with full bootstrap skill body
```

### Pattern 1: Graph Cache with TTL (D-21)

**What:** Singleton cache that lazily loads the graphology DirectedGraph from SQLite on first access, caches it with a 5-minute TTL, and invalidates on bootstrap completion.

**When to use:** All graph-querying MCP tools (graph_query, blast_radius, detect_changes, orient, search).

**Example:**
```typescript
// src/graph/cache.ts
import { DirectedGraph } from "graphology";
import { loadGraphFromSQLite, computeCentrality } from "./analytics.js";
import { openDatabase, closeDatabase } from "./database.js";
import { getGraphDbPath } from "../utils/paths.js";

interface CachedGraph {
  graph: DirectedGraph;
  centralities: Map<string, number>;
  loadedAt: number;
}

const TTL_MS = 5 * 60 * 1000; // 5 minutes
let cached: CachedGraph | null = null;

export function getGraph(projectRoot: string): CachedGraph {
  const now = Date.now();
  if (cached && (now - cached.loadedAt) < TTL_MS) {
    return cached;
  }

  const dbPath = getGraphDbPath(projectRoot);
  const db = openDatabase(dbPath);
  try {
    const graph = loadGraphFromSQLite(db);
    const { centralities } = computeCentrality(graph);
    cached = { graph, centralities, loadedAt: now };
    return cached;
  } finally {
    closeDatabase(db);
  }
}

export function invalidateCache(): void {
  cached = null;
}
```

**Key considerations:**
- First call takes ~200ms (SQLite read + graphology construction + centrality computation)
- Subsequent calls take ~0ms (return cached reference)
- Centralities cached alongside graph since every risk/danger zone query needs them
- Cache invalidated after bootstrap completes (call `invalidateCache()`)
- Thread-safe in Node.js single-threaded model -- no mutex needed
- Memory: graphology graph with 10K nodes + edges is approximately 10-30MB, well within bounds

### Pattern 2: MCP Tool Response Helpers (D-17, D-18, D-19)

**What:** Shared utility functions for building consistent MCP responses per the UI-SPEC contract.

**When to use:** Every MCP tool implementation.

**Example:**
```typescript
// src/tools/helpers.ts
import * as fs from "node:fs";
import { getGraphDbPath } from "../utils/paths.js";

export type Staleness = "fresh" | "stale" | "very_stale";

export interface ToolMetadata {
  last_bootstrap: string | null;
  staleness: Staleness;
  query_ms: number;
  capabilities?: string[];
  upcoming?: string[];
}

export function computeStaleness(lastBootstrap: Date | null): Staleness {
  if (!lastBootstrap) return "very_stale";
  const daysSince = (Date.now() - lastBootstrap.getTime()) / (1000 * 60 * 60 * 24);
  if (daysSince < 7) return "fresh";
  if (daysSince < 30) return "stale";
  return "very_stale";
}

export function okResponse(data: unknown, metadata: ToolMetadata) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ status: "ok", data, metadata }, null, 2),
    }],
  };
}

export function errorResponse(code: string, message: string, recovery: string) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({
        status: "error",
        error: { code, message, recovery },
      }, null, 2),
    }],
  };
}

export function partialResponse(data: unknown, warnings: string[], metadata: ToolMetadata) {
  return {
    content: [{
      type: "text" as const,
      text: JSON.stringify({ status: "partial", data, warnings, metadata }, null, 2),
    }],
  };
}

export function isBootstrapped(projectRoot: string): boolean {
  const dbPath = getGraphDbPath(projectRoot);
  return fs.existsSync(dbPath);
}
```

### Pattern 3: Bootstrap Orchestrator Module Pattern

**What:** The orchestrator module that sequences scout, per-service squads, synthesis, and readiness scoring.

**When to use:** Called by the bootstrap SKILL.md body.

**Example:**
```typescript
// src/bootstrap/orchestrator.ts
export interface BootstrapOptions {
  projectRoot: string;
  force?: boolean;
  // Config-derived settings
  maxSquads: number;
}

export interface BootstrapResult {
  services: Array<{ name: string; status: "full" | "lightweight"; durationMs: number }>;
  readinessGrade: string;
  readinessPercent: number;
  totalNodes: number;
  totalEdges: number;
  totalCommunities: number;
  conventionsDetected: number;
  highConfidenceConventions: number;
  durationMs: number;
  artifacts: Array<{ path: string; description: string }>;
  timingBreakdown: Record<string, number>;
}
```

**Important:** The orchestrator is NOT a sub-agent spawner (that is the SKILL.md's job via Task tool). The orchestrator is an in-process TypeScript module that the skill body calls to run the analysis pipeline directly. Agents in Phases 1-2 were designed as callable modules (D-05 from Phase 2) precisely for this reason -- they are regular async functions, not sub-agent prompts.

### Pattern 4: Agent Module Reuse

**What:** Phase 2 agents are callable TypeScript functions with Options/Result interfaces. Phase 3 calls them directly.

**When to use:** Bootstrap orchestrator calls each agent function in sequence.

**Existing pattern (from Phase 2 D-05):**
```typescript
// Each agent follows this pattern:
import { runScout, type ScoutOptions, type ScoutResult } from "../agents/scout.js";
import { runResearcher, type ResearcherOptions } from "../agents/researcher.js";
import { runConventionDetector } from "../agents/convention-detector.js";
import { runRiskAnalyzer } from "../agents/risk-analyzer.js";
import { runLearningSynthesizer } from "../agents/learning-synthesizer.js";

// In the orchestrator:
const scoutResult = await runScout({ projectRoot, outputDir: codescopeDir });
// For each service:
const researcherResult = await runResearcher({ projectRoot: servicePath, outputDir: serviceDir });
// etc.
```

### Pattern 5: Incremental Bootstrap Detection (D-09)

**What:** Use `git diff` to detect changes since the last bootstrap timestamp stored in graph.db metadata.

**When to use:** At bootstrap start, before scanning services.

**Example approach:**
```typescript
// src/bootstrap/incremental.ts
import { execSync } from "node:child_process";

export interface IncrementalAnalysis {
  mode: "full" | "incremental";
  reason: string;
  changedFiles: string[];
  changedPercentage: number;
  affectedServices: string[]; // service names with changes
}

export function analyzeChanges(
  projectRoot: string,
  lastBootstrapTimestamp: string | null,
  totalFileCount: number,
): IncrementalAnalysis {
  if (!lastBootstrapTimestamp) {
    return { mode: "full", reason: "First bootstrap", changedFiles: [], changedPercentage: 100, affectedServices: [] };
  }

  try {
    const diff = execSync(
      `git diff --name-only --diff-filter=ACMRD "${lastBootstrapTimestamp}" HEAD`,
      { cwd: projectRoot, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    ).trim();

    const changedFiles = diff ? diff.split("\n") : [];
    const changedPercentage = totalFileCount > 0
      ? Math.round((changedFiles.length / totalFileCount) * 100)
      : 100;

    if (changedPercentage >= 50) {
      return { mode: "full", reason: `>${changedPercentage}% files changed (exceeds 50% threshold)`, changedFiles, changedPercentage, affectedServices: [] };
    }

    return { mode: "incremental", reason: `${changedFiles.length} files changed`, changedFiles, changedPercentage, affectedServices: [] };
  } catch {
    return { mode: "full", reason: "Git diff failed", changedFiles: [], changedPercentage: 100, affectedServices: [] };
  }
}
```

### Anti-Patterns to Avoid

- **Loading full graph into every MCP tool handler:** Use the cache layer. Never call loadGraphFromSQLite() directly from a tool handler.
- **Returning MCP responses without staleness metadata:** Every tool response MUST include the D-17/D-18 metadata block, even error responses.
- **Auto-promoting conventions:** BOOT-15 creates an empty conventions-enforced.md. Never write conventions to it programmatically. Promotion is Phase 7 only.
- **Spawning sub-agents from the bootstrap module:** The orchestrator calls agent functions directly as TypeScript modules. Sub-agent spawning (via Task tool) is only done by the SKILL.md body if needed for isolation, but given that Phase 2 agents are in-process modules, direct calls are the pattern.
- **Blocking on 5-minute timeout:** Per D-32, if bootstrap exceeds budget, it completes the analysis and reports a timing warning. Never use a hard timeout that kills analysis mid-flight.
- **Registering real tools AND stubs simultaneously:** The registration logic must check bootstrap state. Before bootstrap: stubs. After bootstrap: real implementations. The switch happens at tool registration time based on whether graph.db exists and has data.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph algorithms | Custom BFS/centrality/community | graphology-traversal, graphology-metrics, graphology-communities-louvain | Battle-tested, handles edge cases (disconnected graphs, self-loops, parallel edges) |
| MCP transport | Custom stdio protocol | StdioServerTransport from @modelcontextprotocol/sdk | Protocol compliance, message framing, error handling |
| Zod schema validation | Manual input checking | Zod schemas (already defined in stubs.ts) | Type inference, error messages, consistent with MCP SDK |
| Git diff parsing | Custom diff parser | `git diff --name-only` via execSync | Reliable, handles renames, respects .gitignore |
| Convention scanning | Custom AST walking | ast-grep CLI (runConventionScan from runner.ts) | Already built and tested in Phase 2 |
| Import resolution | Manual path resolution | enhanced-resolve + tsconfig-paths (already in graph builder) | Handles aliases, node_modules, package.json exports |

## Common Pitfalls

### Pitfall 1: MCP Tool Registration Timing

**What goes wrong:** Registering real tool implementations at server startup when no bootstrap data exists causes runtime errors (missing graph.db, missing artifact files).

**Why it happens:** The MCP server starts when Claude Code launches the plugin, potentially before any bootstrap has run.

**How to avoid:** Use a two-tier registration strategy. Register ALL tools at startup, but have each tool handler check `isBootstrapped(projectRoot)` internally. If not bootstrapped, return the standard NOT_BOOTSTRAPPED error response (same as current stubs but with D-17 format). This avoids the complexity of re-registering tools after bootstrap and keeps the tool list stable for MCP protocol discovery.

**Warning signs:** Tools throwing unhandled errors about missing files. MCP client seeing different tool lists at different times.

### Pitfall 2: Graph Cache Stale After Bootstrap

**What goes wrong:** The graph cache holds a stale graphology instance after a bootstrap run completes, causing MCP tools to return outdated data.

**Why it happens:** Bootstrap rebuilds graph.db but the in-memory cache still holds the old graph.

**How to avoid:** Call `invalidateCache()` at the end of every bootstrap run (both full and incremental). The next MCP tool call will lazy-load the fresh graph.

**Warning signs:** Graph queries returning stale node counts. Blast radius missing newly-added files.

### Pitfall 3: Monorepo Service Path Resolution

**What goes wrong:** Per-service analysis squads pass the wrong project root, causing agent modules to scan files outside the service boundary or miss files.

**Why it happens:** Service paths in config.yml are relative (e.g., `services/auth/`), but agent modules expect absolute paths. Also, symlink resolution (macOS /var -> /private/var) can cause path mismatches.

**How to avoid:** Resolve service paths to absolute using `path.resolve(projectRoot, service.path)`. Use `fs.realpathSync()` for symlink safety (already established pattern from Phase 2 graph builder).

**Warning signs:** Convention detection finding 0 files for a service. Graph nodes with paths outside the service directory.

### Pitfall 4: Readiness Score Division by Zero

**What goes wrong:** Dimension calculations produce NaN or Infinity when the denominator is zero (e.g., no typed files, no test files, no import edges).

**Why it happens:** Small projects or projects with no TypeScript (pure Python) can have zero values for type safety or import graph health dimensions.

**How to avoid:** Guard every dimension calculation: if the denominator is zero, set that dimension's score to 0% with a note explaining why (e.g., "No TypeScript files found -- type safety score not applicable"). Still include it in the overall calculation at 0%.

**Warning signs:** readiness.md showing "NaN%" or "Infinity%". Overall grade calculation producing unexpected results.

### Pitfall 5: Convention Scan Subprocess Timeout for Large Monorepos

**What goes wrong:** ast-grep CLI hangs or OOM-kills when scanning very large service directories with many rule files.

**Why it happens:** Each rule file spawns a separate `sg scan` process (current runner pattern), and for a monorepo service with 50K+ files, each scan can take significant time and memory.

**How to avoid:** The current runner pattern iterates per-rule file. For Phase 3 monorepo support, pass the service directory (not root) to convention detection, limiting scan scope. Also add a per-scan timeout (30s) to prevent hangs. The performance budget allocates 30s total for convention detection.

**Warning signs:** Bootstrap hanging during convention detection phase. Bootstrap exceeding 5-minute budget with most time in convention detection.

### Pitfall 6: Cross-Service Dependency Detection Missing Types

**What goes wrong:** The synthesis module fails to detect cross-service dependencies because import edges in the graph use resolved file paths, not service names.

**Why it happens:** Graph edges store source/target as file paths relative to project root. Cross-service detection requires mapping file paths to service boundaries.

**How to avoid:** During synthesis, map each node's file_path to its service using the service paths from scout's service-manifest. Then identify edges where source service differs from target service. These are cross-service imports. The "shared types" are the target node names from these cross-service edges.

**Warning signs:** Cross-service map showing "No dependencies" for a monorepo where services clearly import from each other.

### Pitfall 7: Existing codescope_status Tool Response Format Mismatch

**What goes wrong:** codescope_status returns its current format (flat JSON object) while all other tools use the D-17 structured format (status/data/metadata wrapper).

**Why it happens:** codescope_status was implemented in Phase 1 before the D-17 response contract was established.

**How to avoid:** Update codescope_status to wrap its existing response inside the D-17 format. The StatusResponse interface becomes the `data` field; add `status: "ok"` wrapper and staleness metadata.

**Warning signs:** Agents parsing codescope_status differently from other tools. Inconsistent error handling across tools.

### Pitfall 8: Bootstrap Metadata Storage

**What goes wrong:** Staleness calculations fail because there is no record of when the last bootstrap ran.

**Why it happens:** The current codebase has `last_bootstrap: null` in the status tool with a TODO comment. No metadata storage mechanism exists yet.

**How to avoid:** Store bootstrap metadata in a dedicated SQLite table or a simple JSON file at `.claude/codescope/bootstrap-meta.json`. The metadata should include: `{ last_bootstrap: ISO timestamp, duration_ms: number, mode: "full"|"incremental", version: "0.1.0" }`. This is read by the staleness computation in every MCP tool response.

**Warning signs:** All MCP responses showing "very_stale" even immediately after bootstrap. Status tool showing `last_bootstrap: null`.

## Code Examples

### MCP Tool Implementation Pattern (following status.ts)

```typescript
// src/tools/blast-radius.ts
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getGraph } from "../graph/cache.js";
import { blastRadius } from "../graph/analytics.js";
import { okResponse, errorResponse, isBootstrapped, computeStaleness, getBootstrapMeta } from "./helpers.js";

export function registerBlastRadiusTool(server: McpServer, projectRoot: string): void {
  server.tool(
    "codescope_blast_radius",
    "Compute the blast radius of changes to a file via BFS graph traversal. " +
    "Returns hop-distance classification (Red/Orange/Yellow/Green). " +
    "Related tools: codescope_graph_query, codescope_detect_changes.",
    {
      file_path: z.string().describe("File to compute blast radius for"),
      max_hops: z.number().int().min(1).max(10).optional()
        .describe("Maximum BFS hops from the file (default: 4)"),
    },
    async ({ file_path, max_hops }) => {
      const startMs = Date.now();

      if (!isBootstrapped(projectRoot)) {
        return errorResponse(
          "NOT_BOOTSTRAPPED",
          "No bootstrap data found. Run /codescope:bootstrap first.",
          "Run /codescope:bootstrap to analyze your codebase.",
        );
      }

      try {
        const { graph } = getGraph(projectRoot);

        // Find node by file_path
        const matchingNodes = graph.filterNodes(
          (_n, attr) => attr.filePath === file_path && attr.kind === "file",
        );

        if (matchingNodes.length === 0) {
          return errorResponse(
            "NODE_NOT_FOUND",
            `File "${file_path}" not found in the knowledge graph.`,
            "Verify the file path. Run codescope_search to find similar files.",
          );
        }

        const results = blastRadius(graph, matchingNodes[0], max_hops ?? 4);
        const meta = getBootstrapMeta(projectRoot);

        return okResponse(
          { file_path, max_hops: max_hops ?? 4, nodes: results },
          {
            last_bootstrap: meta?.last_bootstrap ?? null,
            staleness: computeStaleness(meta?.last_bootstrap ? new Date(meta.last_bootstrap) : null),
            query_ms: Date.now() - startMs,
          },
        );
      } catch (err) {
        return errorResponse(
          "GRAPH_LOAD_FAILED",
          `Failed to load knowledge graph: ${String(err)}`,
          "Database may be corrupted. Run /codescope:bootstrap --force to rebuild.",
        );
      }
    },
  );
}
```

### Readiness Score Calculation

```typescript
// src/bootstrap/readiness.ts
export interface ReadinessScore {
  overall: { grade: string; percent: number };
  dimensions: {
    conventionCoverage: DimensionScore;
    typeSafety: DimensionScore;
    testCoverageProxy: DimensionScore;
    importGraphHealth: DimensionScore;
  };
  improvements: Array<{ action: string; reference: string }>;
  previousScores: ReadinessScore["dimensions"] | null; // for delta tracking
}

interface DimensionScore {
  percent: number;
  grade: string;
  delta: string | null; // e.g., "+13%" or null if first run
  explainer: string; // D-04: one-sentence AI impact
}

// Grading scale (D-02)
function percentToGrade(pct: number): string {
  if (pct >= 97) return "A+";
  if (pct >= 93) return "A";
  if (pct >= 90) return "A-";
  if (pct >= 87) return "B+";
  if (pct >= 83) return "B";
  if (pct >= 80) return "B-";
  if (pct >= 77) return "C+";
  if (pct >= 73) return "C";
  if (pct >= 70) return "C-";
  if (pct >= 67) return "D+";
  if (pct >= 63) return "D";
  if (pct >= 60) return "D-";
  return "F";
}

// Convention coverage (D-01): % of high-confidence conventions detected
// Type safety: % of typed files (TS+TSX) vs total source files
// Test coverage proxy: ratio of test files to source files
// Import graph health: % of import edges successfully resolved
```

### Tool Registration Switch

```typescript
// src/tools/index.ts (modified)
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerStatusTool } from "./status.js";
import { registerRecallTool } from "./recall.js";
import { registerGraphQueryTool } from "./graph-query.js";
import { registerBlastRadiusTool } from "./blast-radius.js";
import { registerConventionsTool } from "./conventions.js";
import { registerOrientTool } from "./orient.js";
import { registerVerifyTool } from "./verify.js";
import { registerSearchTool } from "./search.js";
import { registerReadinessTool } from "./readiness.js";
import { registerDetectChangesTool } from "./detect-changes.js";
import { registerServiceMapTool } from "./service-map.js";

export function registerTools(server: McpServer, projectRoot: string): void {
  // Status tool always functional
  registerStatusTool(server, projectRoot);

  // All tools registered with real implementations.
  // Each handler checks isBootstrapped() internally and returns
  // NOT_BOOTSTRAPPED error if no data exists.
  registerRecallTool(server, projectRoot);
  registerGraphQueryTool(server, projectRoot);
  registerBlastRadiusTool(server, projectRoot);
  registerConventionsTool(server, projectRoot);
  registerOrientTool(server, projectRoot);
  registerVerifyTool(server, projectRoot);
  registerSearchTool(server, projectRoot);
  registerReadinessTool(server, projectRoot);
  registerDetectChangesTool(server, projectRoot);
  registerServiceMapTool(server, projectRoot);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Stub tools returning fixed error | Real tools with isBootstrapped() guard | Phase 3 | Tools always registered, behavior changes based on state |
| Per-query graph loading from SQLite | Lazy-load + TTL cache (5 min) | Phase 3 | <100ms graph queries after first load |
| Flat JSON responses from tools | Structured status/data/metadata envelope | Phase 3 (D-17) | Consistent parsing, staleness awareness, error recovery |
| Individual agent runs | Orchestrated pipeline with squad scaling | Phase 3 | Full bootstrap from one command |
| No readiness assessment | 4-dimension AI readiness score | Phase 3 (D-01) | Quantified codebase quality for AI |

**Deprecated/outdated:**
- `registerStubTools()` in `src/tools/stubs.ts`: No longer called from index.ts. The stubs.ts file can be kept for reference but is not imported. Each tool now handles its own pre-bootstrap state via `isBootstrapped()`.
- `makeStubResponse()`: Replaced by `errorResponse("NOT_BOOTSTRAPPED", ...)` from helpers.ts.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.x |
| Config file | `vitest.config.ts` (exists, 7 lines) |
| Quick run command | `npx vitest run` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BOOT-11 | Monorepo: per-service squads writing to services/[name]/ | integration | `npx vitest run tests/bootstrap/orchestrator.test.ts -t "monorepo"` | Wave 0 |
| BOOT-12 | Squad cap limits analysis to N largest services | unit | `npx vitest run tests/bootstrap/orchestrator.test.ts -t "squad cap"` | Wave 0 |
| BOOT-13 | Synthesis: cross-service map, merged conventions | unit | `npx vitest run tests/bootstrap/synthesis.test.ts` | Wave 0 |
| BOOT-14 | AI readiness score with 4 dimensions | unit | `npx vitest run tests/bootstrap/readiness.test.ts` | Wave 0 |
| BOOT-15 | Empty conventions-enforced.md created | unit | `npx vitest run tests/bootstrap/orchestrator.test.ts -t "conventions-enforced"` | Wave 0 |
| BOOT-16 | Performance: timing instrumentation | unit | `npx vitest run tests/bootstrap/orchestrator.test.ts -t "timing"` | Wave 0 |
| GRPH-05 | Graph cache: <100ms after first load | unit | `npx vitest run tests/graph/cache.test.ts` | Wave 0 |
| GRPH-06 | Cross-service dependency map | unit | `npx vitest run tests/bootstrap/synthesis.test.ts -t "cross-service"` | Wave 0 |
| MCP-01 | MCP server with StdioServerTransport | integration | `npx vitest run tests/tools/server.test.ts` | Wave 0 |
| MCP-02 | codescope_recall combines overview+conventions+learnings | unit | `npx vitest run tests/tools/recall.test.ts` | Wave 0 |
| MCP-03 | codescope_graph_query: neighbors, paths, communities | unit | `npx vitest run tests/tools/graph-query.test.ts` | Wave 0 |
| MCP-04 | codescope_blast_radius: BFS with hop classification | unit | `npx vitest run tests/tools/blast-radius.test.ts` | Wave 0 |
| MCP-05 | codescope_conventions: filter by file/module | unit | `npx vitest run tests/tools/conventions.test.ts` | Wave 0 |
| MCP-06 | codescope_orient: lightweight brief with graph walk | unit | `npx vitest run tests/tools/orient.test.ts` | Wave 0 |
| MCP-07 | codescope_verify: convention compliance check | unit | `npx vitest run tests/tools/verify.test.ts` | Wave 0 |
| MCP-08 | codescope_search: graph-based symbol search | unit | `npx vitest run tests/tools/search.test.ts` | Wave 0 |
| MCP-09 | codescope_readiness: structured score response | unit | `npx vitest run tests/tools/readiness.test.ts` | Wave 0 |
| MCP-10 | codescope_status: updated D-17 format | unit | `npx vitest run tests/tools/status.test.ts` | Exists (update) |
| MCP-11 | codescope_detect_changes: risk classification | unit | `npx vitest run tests/tools/detect-changes.test.ts` | Wave 0 |
| MCP-12 | codescope_service_map: service list + dependencies | unit | `npx vitest run tests/tools/service-map.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/graph/cache.test.ts` -- graph cache TTL, invalidation, lazy loading
- [ ] `tests/tools/helpers.test.ts` -- response builders, staleness calc
- [ ] `tests/tools/recall.test.ts` -- topic matching, artifact reading
- [ ] `tests/tools/graph-query.test.ts` -- neighbors, paths, communities queries
- [ ] `tests/tools/blast-radius.test.ts` -- BFS, hop classification, node-not-found
- [ ] `tests/tools/conventions.test.ts` -- file/module filtering
- [ ] `tests/tools/orient.test.ts` -- keyword extraction, graph walk, brief generation
- [ ] `tests/tools/verify.test.ts` -- convention compliance (partial)
- [ ] `tests/tools/search.test.ts` -- graph-based symbol/file/relationship search
- [ ] `tests/tools/readiness.test.ts` -- structured score response
- [ ] `tests/tools/detect-changes.test.ts` -- git diff parsing, risk classification
- [ ] `tests/tools/service-map.test.ts` -- service list, dependencies, single-project
- [ ] `tests/bootstrap/orchestrator.test.ts` -- pipeline sequencing, monorepo, squad cap, timing
- [ ] `tests/bootstrap/synthesis.test.ts` -- cross-service deps, merged conventions, global danger zones
- [ ] `tests/bootstrap/readiness.test.ts` -- 4-dimension scoring, grading, delta tracking, improvements
- [ ] `tests/bootstrap/incremental.test.ts` -- git diff detection, threshold, --force
- [ ] Update `tests/tools/status.test.ts` -- verify D-17 response format wrapper

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime | Yes | v25.6.1 | -- |
| npm | Package management | Yes | 11.9.0 | -- |
| ast-grep (sg) | Convention detection | Yes | 0.42.0 | -- |
| git | Incremental bootstrap, detect_changes | Yes | (system) | -- |
| better-sqlite3 | Graph storage | Yes | ^12.8.0 (installed) | -- |
| vitest | Testing | Yes | 4.1.1 | -- |

**Note:** Node.js version is 25.6.1 which is newer than the recommended >=22.x. Phase 2 decision noted that better-sqlite3@^12.8.0 had build issues with Node.js 24.x in some reports. The current setup has all 233 tests passing, so the native addon is working correctly.

**Missing dependencies with no fallback:** None.

## Open Questions

1. **Bootstrap metadata storage location**
   - What we know: Need to store last_bootstrap timestamp for staleness calculations (D-18). Current status tool has `last_bootstrap: null` with a TODO.
   - What's unclear: Whether to use a SQLite table in graph.db or a separate JSON file.
   - Recommendation: Use a simple JSON file at `.claude/codescope/bootstrap-meta.json`. It survives graph.db rebuilds (--force preserves user data, but graph.db is rebuilt). A SQLite metadata table in graph.db would be destroyed on --force.

2. **Bootstrap skill body: in-process vs Task tool delegation**
   - What we know: Phase 2 agents are all callable TypeScript modules. The orchestrator can call them directly in-process. But the bootstrap skill body runs in the main Claude Code context.
   - What's unclear: Whether the SKILL.md body should call the orchestrator module directly (via an MCP tool that triggers it) or spawn it as a sub-agent via Task tool.
   - Recommendation: Add a new MCP tool `codescope_bootstrap` (internal, not in the 11 user-facing tools) or trigger the orchestrator via the bootstrap skill body's instructions to "use Bash to run `node dist/bootstrap.js`" or similar. The simplest approach: the skill body instructs the agent to call each MCP tool in sequence (codescope_status to verify prerequisites, then a bootstrap-specific tool). However, given that the bootstrap orchestrator does heavy file I/O and subprocess calls (ast-grep), it should run in-process in the MCP server. **Best approach: The skill body invokes a single internal MCP tool that runs the full pipeline, then reads the completion summary from the filesystem.**

3. **codescope_orient graph walk scalability**
   - What we know: D-28 describes keyword extraction + 1-2 hop graph walk. For large graphs, even 2-hop walks can return thousands of nodes.
   - What's unclear: Exact ranking algorithm for relevance.
   - Recommendation: Limit to top 20 results. Rank by: exact keyword match on node name (highest), file path contains keyword (medium), 1-hop neighbor of a match (lower). Weight by centrality within each tier. This keeps the brief lightweight (D-27).

## Sources

### Primary (HIGH confidence)
- Project source code: `src/tools/stubs.ts`, `src/tools/status.ts`, `src/tools/index.ts`, `src/graph/analytics.ts`, `src/graph/builder.ts`, `src/graph/cache.ts`, `src/graph/database.ts`, `src/graph/schema.ts`, `src/server.ts` -- current implementation state
- Project decisions: `03-CONTEXT.md` (D-01 through D-38) -- locked user decisions
- Project spec: `CODESCOPE-SPEC-V6.md` -- MCP tool definitions, bootstrap pipeline, readiness score
- Project UI contract: `03-UI-SPEC.md` -- response format contracts, copywriting, error codes
- Phase 1/2 context: `01-CONTEXT.md`, `02-CONTEXT.md` -- established patterns and decisions
- Package versions verified via `npm view` against npm registry (March 2026)

### Secondary (MEDIUM confidence)
- [@modelcontextprotocol/sdk server docs](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) -- McpServer.tool() registration API
- [graphology documentation](https://graphology.github.io/) -- DirectedGraph API, filterNodes, forEachNode

### Tertiary (LOW confidence)
- None -- all findings verified against primary sources.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already installed and proven in Phases 1-2, versions verified against npm
- Architecture: HIGH -- patterns extend established Phase 2 patterns (agent modules, graph analytics, tool registration)
- Pitfalls: HIGH -- derived from reading actual source code and understanding the integration points
- MCP tools: HIGH -- Zod schemas already defined in stubs.ts, response contract locked in UI-SPEC
- Bootstrap pipeline: HIGH -- all component modules exist, orchestration is composition of proven parts
- Readiness score: MEDIUM -- calculation approach is straightforward but specific edge cases (empty dimensions, single-service vs monorepo) need implementation-time validation

**Research date:** 2026-03-23
**Valid until:** 2026-04-23 (30 days -- stable domain, all libraries pinned)
