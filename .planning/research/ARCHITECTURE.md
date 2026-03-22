# Architecture Research

**Domain:** Claude Code plugin with MCP backend, multi-agent orchestration, and knowledge graph
**Researched:** 2026-03-22
**Confidence:** HIGH

## System Overview

```
                          Claude Code Host Process
 ............................................................................
 :                                                                          :
 :  ┌─────────────────────────────────────────────────────────────────────┐  :
 :  │                    PLUGIN ENTRY LAYER                              │  :
 :  │                                                                     │  :
 :  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────┐  │  :
 :  │  │  /codescope:  │ │  /codescope:  │ │  /codescope:  │ │ /codescope│  │  :
 :  │  │  onboard     │ │  bootstrap   │ │  orient      │ │ :settings │  │  :
 :  │  │  (SKILL.md)  │ │  (SKILL.md)  │ │  (SKILL.md)  │ │ :review   │  │  :
 :  │  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘ └─────┬─────┘  │  :
 :  └─────────┼────────────────┼────────────────┼────────────────┼────────┘  :
 :            │                │                │                │           :
 :            v                v                v                v           :
 :  ┌─────────────────────────────────────────────────────────────────────┐  :
 :  │                ORCHESTRATOR LAYER (<15K tokens)                     │  :
 :  │                                                                     │  :
 :  │  Reads disk state -> Routes to agents -> Reads results from disk   │  :
 :  │  Never does heavy work. Spawns via Task tool. Sequential default.  │  :
 :  └──────────┬──────────────┬──────────────┬──────────────┬────────────┘  :
 :             │              │              │              │                :
 :      ┌──────┘      ┌──────┘      ┌──────┘      ┌──────┘                 :
 :      v             v             v             v                         :
 :  ┌────────┐   ┌────────┐   ┌────────┐   ┌────────┐    SUB-AGENT        :
 :  │ Scout  │   │Research│   │ Conv.  │   │  Risk  │    CONTEXTS          :
 :  │ Agent  │   │ Agent  │   │Detect. │   │Analyze │    (200K tokens      :
 :  │(Haiku) │   │(Haiku) │   │(Inher.)│   │(Inher.)│     each, isolated) :
 :  └───┬────┘   └───┬────┘   └───┬────┘   └───┬────┘                     :
 :      │             │             │             │                         :
 :      │   ┌─────────┼─────────────┼─────────────┼──────────────┐         :
 :      │   │         │             │             │              │         :
 :      v   v         v             v             v              │         :
 :  ┌─────────────────────────────────────────────────────────┐  │         :
 :  │              FILESYSTEM COORDINATION                     │  │         :
 :  │              .claude/codescope/                           │  │         :
 :  │                                                          │  │         :
 :  │  config.md | overview.md | conventions.md | graph.db     │  │         :
 :  │  danger-zones.md | learnings.md | execution/coord.md     │  │         :
 :  │  plans/ | reports/ | services/ | orient/                 │  │         :
 :  └─────────────────────────────────────┬────────────────────┘  │         :
 :                                        │                       │         :
 :.........................................│.......................│..........:
                                          │                       │
              ┌───────────────────────────┘                       │
              v                                                   v
 ┌────────────────────────────────────────────────────────────────────────┐
 │                    MCP SERVER (stdio transport)                        │
 │                                                                        │
 │  ┌─────────────┐ ┌──────────────┐ ┌──────────────┐ ┌───────────────┐  │
 │  │ codescope_  │ │ codescope_   │ │ codescope_   │ │ codescope_    │  │
 │  │ recall      │ │ graph_query  │ │ blast_radius │ │ conventions   │  │
 │  └──────┬──────┘ └──────┬───────┘ └──────┬───────┘ └──────┬────────┘  │
 │         │               │                │                │           │
 │  ┌──────┴───────────────┴────────────────┴────────────────┴────────┐  │
 │  │                     CORE SERVICES                                │  │
 │  │                                                                  │  │
 │  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │  │
 │  │  │  Graph       │  │  Convention  │  │  Import Resolution     │ │  │
 │  │  │  Service     │  │  Service     │  │  Service               │ │  │
 │  │  │ (graphology) │  │ (ast-grep)   │  │ (enhanced-resolve)     │ │  │
 │  │  └──────┬───────┘  └──────┬───────┘  └──────────┬─────────────┘ │  │
 │  │         │                 │                      │              │  │
 │  │  ┌──────┴─────────────────┴──────────────────────┴────────────┐ │  │
 │  │  │                  AST PARSING LAYER                          │ │  │
 │  │  │            (web-tree-sitter WASM)                           │ │  │
 │  │  └──────────────────────┬──────────────────────────────────────┘ │  │
 │  │                         │                                       │  │
 │  │  ┌──────────────────────┴──────────────────────────────────────┐ │  │
 │  │  │                  STORAGE LAYER                               │ │  │
 │  │  │              (better-sqlite3)                                │ │  │
 │  │  │           graph.db — nodes, edges, communities               │ │  │
 │  │  └─────────────────────────────────────────────────────────────┘ │  │
 │  └──────────────────────────────────────────────────────────────────┘  │
 └────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Implementation |
|-----------|----------------|----------------|
| **Plugin Entry (Skills)** | User-facing slash commands. Each skill is a SKILL.md that triggers orchestration. | `skills/onboard/SKILL.md`, `skills/bootstrap/SKILL.md`, `skills/orient/SKILL.md`, `skills/settings/SKILL.md`, `skills/review-learnings/SKILL.md` |
| **Orchestrator** | Thin routing layer that reads disk state, spawns sub-agents via Task tool, reads their output from disk. Never does computation. Stays under 15K tokens. | Inline logic in SKILL.md body + agent definitions in `agents/` |
| **Sub-Agents** | Isolated 200K-token contexts that do all heavy work. Cannot nest. Communicate via filesystem only. | `agents/*.md` definitions with frontmatter (model, tools, permissions) |
| **Filesystem Coordination** | Append-only files that serve as the communication bus between agents. Source of truth for all state. | `.claude/codescope/**` directory tree |
| **MCP Server** | Backend intelligence layer. Exposes 11 tools for graph queries, conventions, blast radius, verification. Agents call these tools; heavy data never enters context windows directly. | TypeScript MCP server via `@modelcontextprotocol/sdk`, stdio transport |
| **Graph Service** | In-memory graph operations: centrality, community detection, BFS blast radius. | `graphology` + `graphology-communities-louvain` + `graphology-metrics` + `graphology-traversal` |
| **Convention Service** | Structural pattern matching, frequency analysis, trend detection, golden file ranking. | `ast-grep` CLI (spawned via child_process), frequency counters |
| **Import Resolution Service** | Resolves import/require statements to absolute file paths for graph edge construction. | `enhanced-resolve` + `tsconfig-paths` for TS/JS, ast-grep patterns for Python |
| **AST Parsing Layer** | Parses source files into syntax trees for symbol extraction (functions, classes, exports, imports). | `web-tree-sitter` WASM with periodic `parser.delete()` for memory leak mitigation |
| **Storage Layer** | Persistent knowledge graph with nodes (symbols), edges (relationships), and communities. | `better-sqlite3` with synchronous API, WAL mode |

## Recommended Project Structure

```
codescope/
├── .claude-plugin/
│   └── plugin.json              # Plugin manifest (name, version, description)
├── .mcp.json                    # MCP server configuration (stdio transport)
├── skills/                      # User-facing slash commands
│   ├── onboard/
│   │   └── SKILL.md             # Interactive config creation
│   ├── bootstrap/
│   │   └── SKILL.md             # Full codebase analysis pipeline
│   ├── orient/
│   │   └── SKILL.md             # Research-plan-execute-verify pipeline
│   ├── settings/
│   │   └── SKILL.md             # Interactive config changes
│   └── review-learnings/
│       └── SKILL.md             # Review/confirm accumulated learnings
├── agents/                      # Sub-agent definitions (YAML frontmatter + prompt)
│   ├── scout.md                 # Haiku — map service boundaries
│   ├── researcher.md            # Haiku — map structure, frameworks, entry points
│   ├── convention-detector.md   # Inherited — ast-grep frequency analysis
│   ├── risk-analyzer.md         # Inherited — graph construction, danger zones
│   ├── learning-synthesizer.md  # Haiku — initialize/update learnings
│   ├── synthesis.md             # Inherited — cross-service merge
│   ├── research.md              # Inherited — Context7 + web search
│   ├── planner.md               # Inherited — execution plan generation
│   ├── executor.md              # Inherited — code changes per concern
│   ├── static-verify.md         # Inherited — convention compliance, blast diff
│   ├── runtime-verify.md        # Inherited — build, tests, E2E
│   ├── eval.md                  # Inherited — LLM-as-judge scoring
│   └── debug.md                 # Inherited — targeted fixes, broadest tool access
├── src/                         # MCP server source (TypeScript)
│   ├── index.ts                 # Server entry point, stdio transport
│   ├── server.ts                # McpServer instantiation + tool registration
│   ├── tools/                   # Tool handler modules (1 file per tool)
│   │   ├── recall.ts            # codescope_recall
│   │   ├── graph-query.ts       # codescope_graph_query
│   │   ├── blast-radius.ts      # codescope_blast_radius
│   │   ├── conventions.ts       # codescope_conventions
│   │   ├── orient.ts            # codescope_orient
│   │   ├── verify.ts            # codescope_verify
│   │   ├── search.ts            # codescope_search
│   │   ├── readiness.ts         # codescope_readiness
│   │   ├── status.ts            # codescope_status
│   │   ├── detect-changes.ts    # codescope_detect_changes
│   │   └── service-map.ts       # codescope_service_map
│   ├── services/                # Core business logic
│   │   ├── graph.ts             # Graphology wrapper (centrality, BFS, Louvain)
│   │   ├── conventions.ts       # Convention detection + frequency analysis
│   │   ├── import-resolver.ts   # enhanced-resolve + tsconfig-paths wrapper
│   │   ├── ast-parser.ts        # web-tree-sitter WASM lifecycle management
│   │   ├── learning.ts          # Learning CRUD, decay, contradiction detection
│   │   └── config.ts            # Config file reader/writer
│   ├── db/                      # Database layer
│   │   ├── schema.ts            # CREATE TABLE statements, migrations
│   │   ├── connection.ts        # better-sqlite3 connection factory
│   │   └── queries.ts           # Prepared statement library
│   ├── parsers/                 # Language-specific AST extraction
│   │   ├── typescript.ts        # TS/JS symbol + import extraction
│   │   └── python.ts            # Python symbol + import extraction
│   └── types/                   # Shared TypeScript interfaces
│       ├── graph.ts             # Node, Edge, Community types
│       ├── convention.ts        # Convention, GoldenFile, Conflict types
│       ├── config.ts            # Config schema types
│       └── tools.ts             # Tool input/output types
├── grammars/                    # WASM grammar files (bundled, not from node_modules)
│   ├── tree-sitter-typescript.wasm
│   ├── tree-sitter-tsx.wasm
│   ├── tree-sitter-javascript.wasm
│   └── tree-sitter-python.wasm
├── tests/                       # vitest test suite
│   ├── services/                # Unit tests for services
│   ├── tools/                   # Integration tests for MCP tools
│   ├── db/                      # Database tests
│   └── fixtures/                # Test codebases for E2E
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### Structure Rationale

- **`skills/` at plugin root:** Claude Code requires skills in `skills/` directory at plugin root level (NOT inside `.claude-plugin/`). Each skill gets its own folder with a SKILL.md. This is the official plugin convention.
- **`agents/` at plugin root:** Agent definitions are Markdown files with YAML frontmatter. Claude Code loads these automatically and the orchestrator invokes them by name via the Task/Agent tool.
- **`src/` for MCP server:** The MCP server is a standalone TypeScript process spawned via stdio. It has its own module structure independent of the plugin entry layer. The `tools/` subdirectory maps 1:1 to the 11 MCP tools for clear ownership. The `services/` subdirectory contains reusable business logic shared across tools.
- **`grammars/` at project root:** WASM grammar files must be accessible at runtime. They are bundled with the plugin rather than loaded from `node_modules` because `Parser.Language.load()` needs a direct file path or URL. This prevents runtime resolution failures.
- **`src/db/` separate from `src/services/`:** The database layer (schema, connection, prepared statements) is isolated from the graph analysis logic. This prevents `better-sqlite3` from leaking into service interfaces and makes testing easier (mock the db layer).

## Architectural Patterns

### Pattern 1: Thin Orchestrator with Filesystem Bus

**What:** The orchestrator (main context) never performs computation. It reads state from `.claude/codescope/` files, decides which agent to spawn next, spawns it via the Task tool, then reads the agent's output from disk. All inter-agent communication goes through the filesystem, never through the orchestrator's context window.

**When to use:** Always. This is the foundational pattern for CodeScope. It solves two constraints simultaneously: the 15K orchestrator token budget and Issue #5812 (sub-agents cannot return file contents to parent).

**Trade-offs:**
- Pro: Orchestrator context never grows. Compaction is irrelevant.
- Pro: Agent crash recovery is possible (state is on disk, not lost with context).
- Pro: Any agent can read any previous agent's output without the orchestrator relaying it.
- Con: Latency from filesystem I/O (negligible for markdown files).
- Con: Agents must agree on file formats and locations (requires strict contracts).

**Example pattern in SKILL.md:**
```markdown
---
description: Full codebase analysis pipeline
---
# Bootstrap Orchestrator

Read .claude/codescope/config.md to load project configuration.

## Phase A: Scout
Use the Task tool to delegate to the "scout" agent:
"Scan the project root. Read package.json, docker-compose.yml, workspace
configs. Identify service boundaries, entry points, primary languages.
Write your findings to .claude/codescope/service-manifest.md."

After the scout agent completes, read .claude/codescope/service-manifest.md.

## Phase B: Squad Deployment
For each service in the manifest, use the Task tool to delegate sequentially:

1. Delegate to "researcher" agent: "Analyze [service-path]. Map structure,
   frameworks, entry points. Write to .claude/codescope/services/[name]/overview.md."

2. After researcher completes, read its output, then delegate to
   "convention-detector" agent...

[Continue for each squad member, reading disk between each spawn]
```

### Pattern 2: Agent Definition via Markdown Frontmatter

**What:** Each sub-agent is defined as a `.md` file in `agents/` with YAML frontmatter specifying `name`, `description`, `model`, `tools`, and optionally `mcpServers`, `permissionMode`, `skills`, and `hooks`. The Markdown body is the agent's system prompt. The orchestrator invokes agents by name using the Task/Agent tool.

**When to use:** For every sub-agent in the system. This is the Claude Code-native pattern for agent definitions.

**Trade-offs:**
- Pro: Declarative, version-controlled agent definitions.
- Pro: Claude Code handles agent lifecycle (context creation, tool injection, cleanup).
- Pro: Model selection per agent (Haiku for cheap read-only work, inherited for reasoning).
- Con: Cannot dynamically compose agents at runtime (fixed definitions).
- Con: Agent descriptions must be precise enough for Claude to match delegation correctly.

**Example:**
```yaml
---
name: risk-analyzer
description: Analyze codebase risk by building a knowledge graph. Use when
  bootstrap needs to identify high-risk files and danger zones.
model: inherit
tools: Read, Grep, Glob
mcpServers:
  - codescope
permissionMode: plan
---

You are a risk analysis agent. Your job is to build a knowledge graph of the
codebase and identify danger zones based on structural centrality.

## Your Tools
- Use codescope_graph_query to query the knowledge graph
- Use codescope_blast_radius to calculate impact of files
- Use Read/Grep/Glob for direct file access

## Output Contract
Write your findings to .claude/codescope/danger-zones.md in this format:
[format specification...]

When complete, your final message MUST say:
"Wrote danger zones to .claude/codescope/danger-zones.md - [N] danger zones identified"
```

### Pattern 3: MCP Server as Stateful Backend

**What:** The MCP server is a long-running TypeScript process connected via stdio transport. It owns the SQLite database, the graphology in-memory graph, and the web-tree-sitter parser pool. Agents query it through MCP tool calls. The server process persists across agent lifecycles, maintaining state (db connections, cached graph) that individual agents cannot.

**When to use:** For all data-intensive operations: graph queries, blast radius calculations, convention lookups, import resolution. The MCP server is the only component that touches better-sqlite3, graphology, web-tree-sitter, and enhanced-resolve directly.

**Trade-offs:**
- Pro: Heavy data stays out of agent context windows (queried on demand, <100ms).
- Pro: Single process owns all state (no concurrent SQLite write conflicts).
- Pro: Parser lifecycle management centralized (periodic `parser.delete()` in one place).
- Con: MCP server process must be running before agents can use it.
- Con: All 11 tools share one process (a crash takes down all tools).

**Example:**
```typescript
// src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { GraphService } from './services/graph.js';
import { getConnection } from './db/connection.js';

const db = getConnection();  // better-sqlite3, synchronous
const graphService = new GraphService(db);

const server = new McpServer({
  name: 'codescope',
  version: '1.0.0'
});

server.registerTool(
  'codescope_blast_radius',
  {
    description: 'Calculate blast radius for a file using BFS traversal',
    inputSchema: z.object({
      filePath: z.string(),
      maxHops: z.number().default(3)
    })
  },
  async ({ filePath, maxHops }) => {
    const result = graphService.blastRadius(filePath, maxHops);
    return {
      content: [{ type: 'text', text: JSON.stringify(result) }]
    };
  }
);

// Register remaining 10 tools...

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Pattern 4: Append-Only Coordination File

**What:** During execution of a multi-agent task (orient/execute), all agents share an append-only coordination file at `.claude/codescope/execution/coordination.md`. Each agent reads it before starting, appends its status and summary when done. This replaces return-value communication (impossible per Issue #5812) and prevents write conflicts (append-only, agents run sequentially by default).

**When to use:** During the execute phase when multiple agents work on different parts of a task. Also used during bootstrap when squad members need to see each other's findings.

**Trade-offs:**
- Pro: No write conflicts (append-only + sequential default).
- Pro: Full audit trail of what happened and in what order.
- Pro: Downstream agents get rich context about what upstream agents did.
- Con: File grows unbounded during long tasks (mitigated by per-task scoping).
- Con: Parallel agents need care (dependency ordering from the plan prevents conflicts).

### Pattern 5: Layered Service Architecture in MCP Server

**What:** The MCP server internals follow a strict layered architecture: Tool Handlers -> Services -> Database. Tool handlers in `src/tools/` are thin wrappers that validate input, call service methods, and format output. Services in `src/services/` contain reusable business logic. The database layer in `src/db/` handles SQLite operations with prepared statements. No tool handler touches the database directly. No service imports from the tool layer.

**When to use:** Always. This separation makes the MCP server testable and maintainable.

**Trade-offs:**
- Pro: Services can be unit-tested without MCP infrastructure.
- Pro: Multiple tools can share the same service (e.g., `blast_radius` and `graph_query` both use `GraphService`).
- Pro: Database migrations/schema changes are isolated.
- Con: More files and indirection for simple operations.

## Data Flow

### Bootstrap Data Flow

```
User: /codescope:bootstrap
    |
    v
SKILL.md body (orchestrator)
    |
    ├──[1]──> Scout Agent
    |           |── Reads: root configs (package.json, docker-compose, etc.)
    |           └── Writes: .claude/codescope/service-manifest.md
    |
    ├──[2]──> Researcher Agent (per service)
    |           |── Reads: service source files
    |           └── Writes: .claude/codescope/[services/X/]overview.md
    |
    ├──[3]──> Convention Detector Agent (per service)
    |           |── Reads: source files via ast-grep CLI
    |           |── Calls: MCP tools for graph queries
    |           └── Writes: conventions.md, golden-files.md
    |
    ├──[4]──> Risk Analyzer Agent (per service)
    |           |── Reads: source files via web-tree-sitter (through MCP)
    |           |── Calls: MCP tools to build graph, compute centrality
    |           └── Writes: danger-zones.md, graph.db (via MCP)
    |
    ├──[5]──> Learning Synthesizer Agent
    |           |── Reads: all generated artifacts
    |           └── Writes: learnings.md (initial/empty)
    |
    └──[6]──> Synthesis Agent (monorepos only)
                |── Reads: all per-service artifacts
                └── Writes: top-level overview.md, readiness.md, merged conventions.md
```

**Key:** Each numbered step is a separate Task tool invocation. The orchestrator reads disk between each step. Agents 2-5 repeat per service for monorepos (sequentially by default, up to 3 concurrent on Max plans).

### Orient-to-Debug Data Flow

```
User: /codescope:orient [task]
    |
    v
SKILL.md body (orchestrator)
    |
    ├──[A: Clarify]──> Orchestrator reads disk artifacts, presents
    |                  graph-informed questions to user.
    |                  User answers -> Scope Contract written to disk.
    |
    ├──[B: Research]──> Research Agent
    |                    |── Calls: Context7, web search
    |                    └── Writes: execution/research.md
    |
    ├──[C: Analyze]──> Orchestrator calls MCP tools directly:
    |                  codescope_graph_query, codescope_blast_radius,
    |                  codescope_conventions, codescope_search
    |                  Results: internal analysis written to orient brief
    |
    ├──[D: Plan]──> Planner Agent
    |                |── Reads: scope contract, research, analysis
    |                └── Writes: plans/[task-slug].md
    |
    ├──[E: Execute]──> Executor Agent(s) per plan
    |                   |── Reads: plan, conventions, coordination.md
    |                   |── Makes: code changes
    |                   └── Appends: coordination.md, writes changes.md
    |
    ├──[F: Verify]──> Static Verify Agent + Runtime Verify Agent
    |                  |── Reads: git diff, conventions-enforced.md
    |                  |── Calls: ast-grep, build, tests, E2E
    |                  └── Writes: reports/[task]-[date].md
    |
    ├──[G: Eval]──> Eval Agent
    |                |── Reads: scope contract, plan, coordination, diff, report
    |                └── Writes: eval findings appended to report
    |
    ├──[H: User Gate]──> Orchestrator presents findings, user selects
    |
    └──[I: Debug]──> Debug Agent (max 3 cycles)
                      |── Reads: findings, code, research
                      |── Makes: targeted fixes
                      |── Triggers: re-verify, re-eval
                      └── Writes: updated report, coordination entries
```

### MCP Server Internal Data Flow

```
MCP Tool Call (from any agent)
    |
    v
Tool Handler (src/tools/*.ts)
    |── Validates input schema (zod)
    |── Calls service method(s)
    |── Formats response
    v
Service Layer (src/services/*.ts)
    |
    ├── GraphService
    |     |── Loads graph from SQLite into graphology (cached)
    |     |── BFS traversal for blast radius
    |     |── Louvain community detection
    |     └── In-degree centrality computation
    |
    ├── ConventionService
    |     |── Spawns ast-grep CLI for pattern matching
    |     |── Frequency analysis across files
    |     └── Trend computation from git log
    |
    ├── ImportResolverService
    |     |── enhanced-resolve for TS/JS (95-99% accuracy)
    |     |── tsconfig-paths for path alias resolution
    |     └── ast-grep patterns for Python (~80% accuracy)
    |
    └── ASTParserService
          |── web-tree-sitter WASM parser pool
          |── Symbol extraction (functions, classes, exports)
          |── Periodic parser.delete() + recreate
          v
Database Layer (src/db/*.ts)
    |── better-sqlite3 synchronous API
    |── Prepared statements for all queries
    |── Schema: nodes, edges, communities tables
    └── WAL mode for concurrent reads
```

### Key Data Flows

1. **Graph Construction (bootstrap):** Source files -> AST Parser (web-tree-sitter) -> symbol extraction -> Import Resolver (enhanced-resolve) -> edges between symbols -> better-sqlite3 INSERT -> graphology load -> centrality/community computation -> danger-zones.md
2. **Blast Radius Query (orient):** File path -> GraphService.blastRadius() -> BFS on graphology graph -> hop-distance classification (0-3) -> JSON response to agent -> formatted in orient brief
3. **Convention Detection (bootstrap):** ast-grep CLI patterns -> frequency count per pattern -> cluster by module -> confidence scoring -> trend direction from git recency -> golden file ranking by modern pattern density -> conventions.md
4. **Agent Communication (all phases):** Agent N writes to `.claude/codescope/[artifact].md` -> Agent N's final message says "Wrote to [path]" -> Orchestrator reads file -> Orchestrator spawns Agent N+1 with reference to file

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Small codebase (<50K LOC) | Single squad, sequential agent spawning, graph fits in memory easily. No scaling concerns. |
| Medium codebase (50K-200K LOC) | Single or multi-squad depending on service count. Graphology graph may use 50-200MB RAM. SQLite WAL mode handles concurrent tool reads. |
| Large monorepo (200K-1M LOC) | Multi-squad with cap (default 10). Graphology graph could use 500MB+. Consider partial graph loading per service. ast-grep CLI may need file filtering. |
| Very large monorepo (>1M LOC) | Squad cap becomes essential. Bootstrap may exceed 5-minute budget. Consider incremental indexing (detect_changes + partial re-index). Graph partitioning by service. |

### Scaling Priorities

1. **First bottleneck: Graphology memory on large codebases.** A codebase with 100K symbols and 500K edges will use substantial memory in the MCP server process. Mitigation: lazy graph loading per query scope rather than full graph materialization. For v1, full load is acceptable for codebases up to 200K LOC.

2. **Second bottleneck: Bootstrap time scaling linearly with services.** Sequential agent spawning means bootstrap time = (number of services * 4 agents * agent runtime). Mitigation: parallel squad execution where rate limits allow. The 5-minute budget for 100K LOC is achievable with sequential spawning if each agent completes in ~15-30 seconds.

3. **Third bottleneck: web-tree-sitter memory leaks over long sessions.** The MCP server process runs continuously. Without periodic `parser.delete()`, memory grows unboundedly. Mitigation: parser pool with usage counter; recreate after N files parsed (suggested: every 500 files).

## Anti-Patterns

### Anti-Pattern 1: Fat Orchestrator

**What people do:** Put analysis logic, file processing, or data transformation in the orchestrator (SKILL.md body or main context).
**Why it's wrong:** Orchestrator context grows past 15K tokens. Compaction becomes necessary. State that should be persistent ends up in ephemeral context. The orchestrator loses track of what happened after compaction.
**Do this instead:** Every operation that produces or consumes data goes into a sub-agent. The orchestrator only reads paths and spawns agents.

### Anti-Pattern 2: Agent Nesting

**What people do:** Have a sub-agent spawn another sub-agent to decompose its work.
**Why it's wrong:** Claude Code explicitly prohibits sub-agent nesting. Sub-agents cannot spawn other sub-agents. The Task/Agent tool in a sub-agent's context does not work.
**Do this instead:** All agent spawning happens from the orchestrator. If an agent's work is too large, break it into multiple agents that the orchestrator spawns sequentially.

### Anti-Pattern 3: Relying on Agent Return Values for File Contents

**What people do:** Expect a sub-agent's response to contain file contents, data structures, or large results that the orchestrator parses.
**Why it's wrong:** Issue #5812 -- sub-agents cannot return file contents to the parent. The return value is a short summary string, not structured data.
**Do this instead:** Agent writes output to a well-known path on disk. Agent's final message says "Wrote to [path] -- [summary]". Orchestrator reads the file after agent completes.

### Anti-Pattern 4: Using `context: fork` in Skill Frontmatter

**What people do:** Add `context: fork` to SKILL.md frontmatter to run the skill in an isolated context.
**Why it's wrong:** Issue #17283 -- `context: fork` is silently ignored on auto-invoked skills. The skill runs inline in the main context, consuming the orchestrator's token budget.
**Do this instead:** Use explicit Task tool delegation in the SKILL.md body. The SKILL.md body tells the orchestrator to spawn agents, not to do the work itself.

### Anti-Pattern 5: Shared Mutable State Between Concurrent Agents

**What people do:** Have parallel agents read and write the same file.
**Why it's wrong:** Race conditions are silent. Multiple agents writing to the same file concurrently produces garbage or lost writes.
**Do this instead:** Each agent writes to its own output file (e.g., `execution/[agent-name]-changes.md`). The coordination file is append-only. The plan specifies dependency ordering so agents with file overlaps run sequentially.

### Anti-Pattern 6: Bundling All Services Into One Module

**What people do:** Put graph logic, convention detection, import resolution, and AST parsing in a single service file.
**Why it's wrong:** These are independent concerns with different dependencies. A change to convention detection should not risk breaking graph queries. Testing becomes difficult. The file becomes unmaintainably large.
**Do this instead:** One service per concern. GraphService owns graphology. ConventionService owns ast-grep. ImportResolverService owns enhanced-resolve. ASTParserService owns web-tree-sitter. They communicate through typed interfaces, not internal state.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Claude Code Host | Plugin manifest + SKILL.md + agents/*.md loaded at startup | Skills namespaced as `/codescope:*`. Agents loaded into `/agents` list. |
| Claude Code Task Tool | Orchestrator calls Task tool with agent name and prompt | Agent name must match `name` field in agents/*.md frontmatter. |
| MCP Protocol (stdio) | `.mcp.json` defines server command; Claude Code spawns process | Server stays alive for the session. Agents call tools by name. |
| ast-grep CLI | `child_process.execSync()` from ConventionService | CLI must be installed globally (`@ast-grep/cli`). Called synchronously. |
| git CLI | `child_process.execSync()` from agents and MCP tools | Used for trend analysis (git log), change detection (git diff), blast radius diff. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Skill -> Orchestrator | SKILL.md body IS the orchestrator. No boundary. | The skill body contains the routing logic inline. |
| Orchestrator -> Sub-Agent | Task tool invocation with agent name + task prompt | One-way: orchestrator sends task, reads output from disk after completion. |
| Sub-Agent -> Filesystem | Direct file write/read to `.claude/codescope/` | Agents have Write/Edit/Read tools as specified in their frontmatter. |
| Sub-Agent -> MCP Server | MCP tool calls (codescope_*) | Only agents with `mcpServers: [codescope]` in frontmatter can call these. |
| MCP Tool -> Service | Direct function call within same process | Synchronous for db operations, async for file I/O. |
| Service -> Database | `better-sqlite3` prepared statements | Synchronous API. Single connection. WAL mode for read concurrency. |
| Service -> AST Parser | `web-tree-sitter` API calls | Parser pool managed by ASTParserService with periodic cleanup. |
| Service -> Import Resolver | `enhanced-resolve` API calls | Synchronous resolution with tsconfig-paths plugin. |

## Build Order (Dependencies Between Components)

The components have clear dependency chains that dictate build order. This directly informs the roadmap phase structure.

```
LAYER 0 (no dependencies — build first):
  ├── Plugin skeleton (manifest, .mcp.json, directory structure)
  ├── Database layer (schema, connection, queries)
  └── Type definitions (shared interfaces)

LAYER 1 (depends on Layer 0):
  ├── AST Parser Service (web-tree-sitter WASM setup + symbol extraction)
  ├── Import Resolver Service (enhanced-resolve + tsconfig-paths)
  └── MCP Server shell (McpServer + StdioTransport, no tools yet)

LAYER 2 (depends on Layer 1):
  ├── Graph Service (graphology, centrality, BFS — needs db + parser + resolver)
  ├── Convention Service (ast-grep CLI, frequency — needs parser)
  └── Config Service (read/write config.md)

LAYER 3 (depends on Layer 2):
  ├── MCP Tools (all 11 tools — thin wrappers around services)
  ├── Onboard Skill (needs Config Service)
  └── Scout Agent + Researcher Agent (needs Read/Grep, writes to disk)

LAYER 4 (depends on Layer 3):
  ├── Convention Detector Agent (needs MCP tools + ast-grep)
  ├── Risk Analyzer Agent (needs MCP tools + graph)
  ├── Learning Synthesizer Agent (reads other agents' output)
  └── Bootstrap Skill (orchestrates Layer 3-4 agents)

LAYER 5 (depends on Layer 4):
  ├── Orient Skill — Clarify phase (reads bootstrap artifacts + MCP tools)
  ├── Research Agent (Context7 + web search)
  ├── Planner Agent (reads all orient phases)
  └── Executor Agent(s) (makes code changes)

LAYER 6 (depends on Layer 5):
  ├── Static Verify Agent (ast-grep + blast radius diff)
  ├── Runtime Verify Agent (build + tests + E2E)
  └── Synthesis Agent (cross-service merge for monorepos)

LAYER 7 (depends on Layer 6):
  ├── Eval Agent (LLM-as-judge)
  ├── User Gate (interactive finding selection)
  ├── Debug Agent (broadest tool access)
  ├── Learning capture (post-completion)
  ├── Settings Skill
  └── Review-Learnings Skill
```

**Implication for roadmap:** Build bottom-up. Phase 1a should deliver Layers 0-3 (infrastructure + first agents). Phase 1b adds Layers 3-4 (full bootstrap). Phase 1c adds Layers 5-6 (orient through verify). Phase 1d adds Layer 7 (eval, debug, learning). This matches the spec's phasing exactly, which is encouraging -- the architecture naturally supports it.

## Sources

- [Claude Code Plugin Documentation](https://code.claude.com/docs/en/plugins) -- Official plugin structure, manifest format, skills, hooks, agents (HIGH confidence)
- [Claude Code Sub-Agent Documentation](https://code.claude.com/docs/en/sub-agents) -- Task tool delegation, agent frontmatter, nesting constraints, filesystem coordination (HIGH confidence)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) -- McpServer API, tool registration, stdio transport (HIGH confidence)
- [Graphology Documentation](https://graphology.github.io/) -- Graph API, BFS traversal, Louvain community detection (HIGH confidence)
- [codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp) -- Reference architecture for SQLite graph + MCP tools (MEDIUM confidence -- closed source binary, architecture inferred)
- [Anthropic feature-dev Plugin](https://deepwiki.com/anthropics/claude-plugins-official/7.2.3-feature-dev-and-agent-sdk-dev) -- Reference for 7-phase agent workflow, agent definitions (MEDIUM confidence -- third-party analysis)
- [web-tree-sitter](https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md) -- WASM parser API, memory management (HIGH confidence)
- [enhanced-resolve](https://github.com/webpack/enhanced-resolve) -- Module resolution API, TypeScript integration (HIGH confidence)
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) -- Synchronous SQLite API, prepared statements (HIGH confidence)

---
*Architecture research for: Claude Code plugin with MCP backend, multi-agent orchestration, and knowledge graph*
*Researched: 2026-03-22*
