# Phase 1: Plugin Foundation and Infrastructure - Research

**Researched:** 2026-03-22
**Domain:** Claude Code plugin system, MCP server, web-tree-sitter WASM parsing, better-sqlite3 graph storage, onboarding UX
**Confidence:** HIGH

## Summary

Phase 1 is a greenfield build that delivers the foundational skeleton for the CodeScope plugin: manifest, skills, MCP server stub, persistent filesystem structure, interactive onboarding, AST parsing infrastructure with web-tree-sitter WASM, and a SQLite knowledge graph schema. The project root currently contains only planning documents and no code.

The plugin system is well-documented by Anthropic with a clear directory structure (.claude-plugin/plugin.json at the manifest level, skills/commands/agents/hooks/.mcp.json at the plugin root). The MCP SDK v1.27.1 is stable and production-ready with a straightforward McpServer + StdioServerTransport pattern. The critical technical risks are: (1) web-tree-sitter 0.25.x WASM ABI compatibility with tree-sitter-cli for grammar building, (2) memory lifecycle management for parsing 500+ files, and (3) bundling prebuilt WASM grammars so users have zero setup overhead.

**Primary recommendation:** Build the plugin as a standalone directory with tsdown-bundled MCP server (dist/server.js), prebuilt WASM grammars in a grammars/ directory, 5 skill stubs, 11 MCP tool stubs, and a Zod-validated config.yml. Use Docker-based tree-sitter-cli 0.25.x for WASM grammar building at development time, bundle the resulting .wasm files in the plugin package.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use AskUserQuestion menus (structured selection UI) for all onboarding interactions.
- **D-02:** Auto-detect project type, languages, build/test commands, E2E tool from existing config files, then present results for user to confirm or correct ("detect and confirm" pattern).
- **D-03:** For returning users with global memory (~/.codescope/global-memory.md), offer one-click accept: show saved preferences summary with "Use same setup" vs "Customize" options.
- **D-04:** When project detection fails or finds nothing recognizable, fall back to manual entry via menus. No dead ends.
- **D-05:** Single skill invocation -- `/codescope:onboard` runs all 3 phases (detection, model selection, workflow preferences) in sequence. No separate sub-skills.
- **D-06:** Show recommended model defaults for all 6 agents, let user accept all or override specific ones. No per-agent walkthrough, no preset profiles.
- **D-07:** Check prerequisites at onboarding start. Block on critical prerequisites (Node.js 22+, WASM grammars) with clear fix instructions. Non-critical items (e.g., Playwright) get warnings only.
- **D-08:** After writing config, show brief summary of choices + prompt to run `/codescope:bootstrap`. Clear call-to-action.
- **D-09:** If user runs `/codescope:onboard` on a project with existing config, offer "Update existing config" or "Start fresh". Prevents accidental data loss.
- **D-10:** Use `config.yml` (pure YAML) instead of `config.md`. Config is machine-parsed data, not documentation.
- **D-11:** "Inherited" model assignment means the sub-agent runs on whatever model the user's Claude Code session is running. No explicit model override passed to Task tool.
- **D-12:** Thorough defaults out-of-box: orient brief verbosity + thorough clarification, interactive eval mode, suggest-only conventions.
- **D-13:** No environment-specific overrides for v1.
- **D-14:** Include `schema_version: 1` field in config.yml for future migration support.
- **D-15:** Validate config.yml against a Zod schema at load time. Clear error messages for malformed configs.
- **D-16:** config.yml is committed to git (tracked). Team members share CodeScope config.
- **D-17:** Convention detection controlled by config: `conventions.detection_threshold` (default 80%) and `conventions.min_files` (default 10).
- **D-18:** On first plugin load (no config.yml exists), auto-prompt onboarding: "CodeScope isn't configured yet. Run /codescope:onboard to get started." No auto-run, no silent loading.
- **D-19:** WASM grammar files prebuilt and bundled in the plugin package. Zero setup for users.
- **D-20:** Graceful degradation with clear errors at runtime. Each capability checks its dependencies independently.
- **D-21:** Create full `.claude/codescope/` directory tree eagerly during `/codescope:onboard`.
- **D-22:** Auto-add selective `.gitignore` inside `.claude/codescope/`.
- **D-23:** Create `~/.codescope/` and `global-memory.md` during first `/codescope:onboard` run.
- **D-24:** `codescope_status` MCP tool doubles as health check.
- **D-25 through D-33:** Directory and naming conventions for tasks, execution artifacts, services, reports, and graph.db placement.
- **D-34:** Single Parser instance per language, recreated after every N parses (e.g., 100) to prevent memory leaks.
- **D-35:** When parsing fails on a file, skip and log. Continue with remaining files.
- **D-36:** High-level API with escape hatch: primary API returns `{ imports, exports, classes, functions, variables }`. Raw tree access available.
- **D-37:** Large files (>500KB or >10K lines) get shallow parsing: top-level structure only.
- **D-38:** File + symbol level granularity for nodes. Edges: IMPORTS, CALLS, EXTENDS, IMPLEMENTS, USES_TYPE, CONTAINS.
- **D-39:** Store key metadata per node: file_path, language, LOC, last_modified timestamp, node_type.
- **D-40:** JSONL queue with batch insert for multi-agent writes.
- **D-41:** Create all three tables (nodes, edges, communities) in Phase 1. Communities table populated later by Phase 2.
- **D-42:** One skill file per skill: onboard.md, bootstrap.md, orient.md, settings.md, review-learnings.md.
- **D-43:** Register all 5 skills in plugin.json from Phase 1. Unimplemented skills show: "This skill will be available after Phase N."
- **D-44:** No hooks registered in Phase 1.
- **D-45:** MCP server built with tsdown to single `dist/server.js`. `.mcp.json` points to `node dist/server.js`.
- **D-46:** All 11 MCP tools registered from Phase 1. Before bootstrap, return structured errors.
- **D-47:** `codescope_status` always works, even before bootstrap.
- **D-48:** MCP tool input schemas validated strictly with Zod.

### Claude's Discretion
- No areas deferred to Claude's discretion -- all gray areas received explicit user decisions.

### Deferred Ideas (OUT OF SCOPE)
- None -- discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PLUG-01 | Plugin skeleton with manifest (plugin.json), skills directory, hooks, scripts, and .mcp.json for MCP server configuration | Plugin structure documented from official docs; complete manifest schema, .mcp.json format, and directory layout researched |
| PLUG-02 | Plugin installs cleanly via Claude Code plugin system and MCP server starts automatically | MCP auto-start behavior confirmed; StdioServerTransport pattern with tsdown bundle to dist/server.js |
| PLUG-03 | Persistent file structure created at .claude/codescope/ with all required subdirectories | Directory tree defined in spec; eager creation during onboarding per D-21; .gitignore per D-22 |
| PLUG-04 | Global memory directory created at ~/.codescope/ on first use | Per D-23, create during first /codescope:onboard run |
| ONBD-01 | /codescope:onboard detects project type, languages, build/test/E2E commands from existing config files | Detection from package.json, tsconfig, pyproject.toml, docker-compose, CI configs; "detect and confirm" pattern per D-02 |
| ONBD-02 | User can select agent model assignments during onboarding | 6 agents with defaults (haiku/inherited); accept-all or per-agent override per D-06 |
| ONBD-03 | User can configure workflow preferences during onboarding | 4 preference areas: orient verbosity, clarification style, eval gate mode, convention strictness |
| ONBD-04 | Onboard produces .claude/codescope/config.yml with all settings in structured YAML format | Full YAML schema from spec (lines 718-823); Zod validation per D-15; js-yaml for serialization |
| ONBD-05 | Onboard pulls from global memory for returning users to pre-populate preferences | ~/.codescope/global-memory.md read at onboarding start per D-03 |
| PARS-01 | web-tree-sitter WASM parsing for TypeScript, JavaScript, and Python source files | web-tree-sitter 0.25.10 pinned; Parser.init() + Language.load() API documented; prebuilt WASM grammars bundled per D-19 |
| PARS-02 | Import resolution for TS/JS using enhanced-resolve + tsconfig-paths with 95-99% accuracy | enhanced-resolve 5.20.1 + tsconfig-paths 4.2.0; configuration patterns for path aliases |
| PARS-03 | Import resolution for Python using ast-grep patterns with ~80% accuracy | ast-grep CLI 0.42.0 for structural pattern matching on Python import/from statements |
| PARS-04 | Parser lifecycle management: periodic parser.delete() and recreate to prevent memory leaks | Per D-34: single Parser per language, recreate after N parses; tree.delete() after every parse |
| GRPH-01 | SQLite schema with nodes, edges, and communities tables | Schema from spec (lines 869-904); better-sqlite3 12.8.0 synchronous API; WAL mode + indexes |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | ^5.7 | Primary language | Claude Code ecosystem is TypeScript; plugin hooks, skills, MCP servers all expect TS/JS |
| Node.js | >=22.x | Runtime | Required for Claude Code plugin execution; LTS channel; native fetch, WASM support, stable ESM |
| @modelcontextprotocol/sdk | ^1.27.1 | MCP server framework | Official TypeScript SDK v1.x; production-recommended; v2 is pre-alpha |
| better-sqlite3 | ^12.8.0 | Graph database storage | Synchronous API critical for MCP tool handlers; 2000+ QPS; prebuilds for Node 22 |
| web-tree-sitter | ^0.25.10 | AST parsing (WASM) | Pin to 0.25.x; 0.26.x breaks WASM ABI compat; this is what Claude Code uses internally |
| zod | ^3.25 (import from zod/v4) | Schema validation | Required peer dep of MCP SDK; config.yml validation; MCP tool input schemas |
| enhanced-resolve | ^5.20.1 | TS/JS module resolution | Webpack's resolver extracted; handles node_modules, package.json exports, symlinks |
| tsconfig-paths | ^4.2.0 | TypeScript path alias resolution | Resolves @/ and tsconfig paths aliases; feeds into enhanced-resolve |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| js-yaml | ^4.1.1 | YAML parsing/serialization | Parse and write config.yml; well-tested, standard YAML library |
| graphology | ^0.26.0 | In-memory graph data structure | Phase 1 schema only; full graph analysis in Phase 2 |
| graphology-types | ^0.24.8 | TypeScript declarations for graphology | Peer dependency; install explicitly |
| @ast-grep/cli | ^0.42.0 | Structural pattern matching | Python import resolution; convention detection in later phases |
| tree-sitter-cli | ^0.25.10 | Build WASM grammars (dev only) | Build-time tool; MUST match web-tree-sitter ABI (0.25.x) |
| vitest | ^4.1.0 | Test framework | Unit and integration tests for parser, graph, MCP server |
| tsdown | ^0.21.4 | TypeScript bundler | Build MCP server to single dist/server.js; ESM-first, Rolldown-powered |
| tsx | ^4.21.0 | TypeScript runner | Development: run TS files directly without build step |
| @modelcontextprotocol/inspector | latest | MCP server testing | Debug and test MCP tool calls interactively |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| js-yaml | yaml (npm) | yaml package is more spec-compliant (YAML 1.2) but js-yaml is more widely used and sufficient for config.yml |
| tsdown | esbuild (direct) | More control but worse DX; tsdown wraps Rolldown with zero-config for libraries |
| tree-sitter-wasms (prebuilt npm) | Build own WASM | Prebuilt packages may not match 0.25.x ABI; building with tree-sitter-cli@0.25.10 guarantees ABI match |

**Installation:**
```bash
# Core
npm install @modelcontextprotocol/sdk@^1.27.1 better-sqlite3@^12.8.0 web-tree-sitter@0.25.10 zod@^3.25 enhanced-resolve@^5.20.1 tsconfig-paths@^4.2.0 js-yaml@^4.1.1 graphology@^0.26.0 graphology-types@^0.24.8

# Dev dependencies
npm install -D typescript@^5.7 vitest@^4.1.0 tsdown@^0.21.4 tsx@^4.21.0 @types/better-sqlite3 @types/js-yaml @modelcontextprotocol/inspector

# WASM grammar building (dev only, needs Docker)
npm install -D tree-sitter-cli@0.25.10 tree-sitter-typescript tree-sitter-javascript tree-sitter-python
```

**Version verification (checked 2026-03-22 against npm registry):**
| Package | Registry Version | Recommended |
|---------|-----------------|-------------|
| @modelcontextprotocol/sdk | 1.27.1 | ^1.27.1 |
| better-sqlite3 | 12.8.0 | ^12.8.0 |
| web-tree-sitter | 0.26.7 (latest) / 0.25.10 (pinned) | 0.25.10 (exact) |
| zod | 4.3.6 | ^3.25 (with zod/v4 import) |
| enhanced-resolve | 5.20.1 | ^5.20.1 |
| tsconfig-paths | 4.2.0 | ^4.2.0 |
| graphology | 0.26.0 | ^0.26.0 |
| vitest | 4.1.0 | ^4.1.0 |
| tsdown | 0.21.4 | ^0.21.4 |
| tsx | 4.21.0 | ^4.21.0 |
| tree-sitter-cli | 0.26.7 (latest) / 0.25.10 (pinned) | 0.25.10 (exact) |

## Architecture Patterns

### Recommended Project Structure
```
codescope/                              # Plugin root directory
├── .claude-plugin/
│   └── plugin.json                     # Plugin manifest (name, version, description)
├── skills/
│   ├── onboard/
│   │   └── SKILL.md                    # /codescope:onboard skill
│   ├── bootstrap/
│   │   └── SKILL.md                    # /codescope:bootstrap (stub)
│   ├── orient/
│   │   └── SKILL.md                    # /codescope:orient (stub)
│   ├── settings/
│   │   └── SKILL.md                    # /codescope:settings (stub)
│   └── review-learnings/
│       └── SKILL.md                    # /codescope:review-learnings (stub)
├── .mcp.json                           # MCP server configuration
├── src/
│   ├── server.ts                       # MCP server entry point
│   ├── tools/                          # MCP tool implementations
│   │   ├── index.ts                    # Register all 11 tools
│   │   ├── status.ts                   # codescope_status (functional from Phase 1)
│   │   └── stubs.ts                    # 10 stub tools returning not_bootstrapped
│   ├── parser/                         # web-tree-sitter infrastructure
│   │   ├── index.ts                    # Parser pool manager
│   │   ├── lifecycle.ts                # Memory lifecycle (create/delete/recreate)
│   │   ├── extract.ts                  # High-level AST extraction API
│   │   └── languages.ts                # Language loading and WASM paths
│   ├── graph/                          # SQLite graph infrastructure
│   │   ├── schema.ts                   # Schema creation (nodes, edges, communities)
│   │   ├── database.ts                 # Database connection + WAL setup
│   │   └── batch-writer.ts            # JSONL batch insert pattern
│   ├── resolver/                       # Import resolution
│   │   ├── typescript.ts               # enhanced-resolve + tsconfig-paths
│   │   └── python.ts                   # ast-grep pattern-based resolution
│   ├── config/                         # Config management
│   │   ├── schema.ts                   # Zod schema for config.yml
│   │   ├── loader.ts                   # Load + validate config
│   │   ├── writer.ts                   # Write config.yml
│   │   └── defaults.ts                 # Default config values
│   ├── onboard/                        # Onboarding logic
│   │   ├── detect.ts                   # Project type/language/command detection
│   │   └── filesystem.ts              # Directory tree creation, .gitignore
│   └── utils/
│       └── paths.ts                    # Path constants and helpers
├── grammars/                           # Prebuilt WASM grammar files
│   ├── tree-sitter-typescript.wasm
│   ├── tree-sitter-tsx.wasm
│   ├── tree-sitter-javascript.wasm
│   └── tree-sitter-python.wasm
├── dist/                               # tsdown build output
│   └── server.js                       # Bundled MCP server
├── tests/
│   ├── parser/
│   │   ├── lifecycle.test.ts           # Parser creation/deletion/recreation
│   │   └── extract.test.ts            # AST extraction for TS/JS/Python
│   ├── graph/
│   │   ├── schema.test.ts             # Table creation and basic queries
│   │   └── batch-writer.test.ts       # JSONL batch insert
│   ├── resolver/
│   │   ├── typescript.test.ts          # TS/JS import resolution
│   │   └── python.test.ts             # Python import resolution
│   ├── config/
│   │   ├── schema.test.ts             # Zod validation
│   │   └── loader.test.ts             # Load/write round-trip
│   └── tools/
│       └── status.test.ts             # codescope_status tool
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── tsdown.config.ts
```

### Pattern 1: MCP Server with Tool Registration
**What:** McpServer + StdioServerTransport with Zod-validated tool schemas
**When to use:** The single MCP server entry point
**Example:**
```typescript
// Source: @modelcontextprotocol/sdk v1.27.1 official docs
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "codescope",
  version: "1.0.0",
});

// Register a tool with Zod schema
server.tool(
  "codescope_status",
  "Get current CodeScope status, health check, and dependency information",
  {
    verbose: z.boolean().optional().describe("Include detailed dependency health"),
  },
  async ({ verbose }) => {
    const status = getStatus(verbose);
    return {
      content: [{ type: "text", text: JSON.stringify(status, null, 2) }],
    };
  }
);

// Stub tool pattern for unimplemented tools
server.tool(
  "codescope_recall",
  "Retrieve conventions, learnings, overview for a topic",
  {
    topic: z.string().describe("Topic to recall information about"),
  },
  async () => ({
    content: [{
      type: "text",
      text: JSON.stringify({
        status: "not_bootstrapped",
        message: "Run /codescope:bootstrap first",
        tool: "codescope_recall",
      }),
    }],
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

### Pattern 2: web-tree-sitter Parser with Memory Lifecycle
**What:** Parser creation, language loading, parsing with tree.delete(), periodic parser recreation
**When to use:** All AST parsing operations
**Example:**
```typescript
// Source: web-tree-sitter README + CLAUDE.md memory management notes
import Parser from "web-tree-sitter";

// Initialize once at startup
await Parser.init();

// Load language WASM
const TypeScript = await Parser.Language.load(
  path.join(grammarDir, "tree-sitter-typescript.wasm")
);

// Create parser for a language
const parser = new Parser();
parser.setLanguage(TypeScript);

// Parse a file -- ALWAYS delete tree after use
const tree = parser.parse(sourceCode);
try {
  const rootNode = tree.rootNode;
  // ... extract data from AST ...
} finally {
  tree.delete(); // CRITICAL: prevents memory leaks
}

// After N parses (e.g., 100), recreate the parser
parseCount++;
if (parseCount >= MAX_PARSES_BEFORE_RECREATE) {
  parser.delete();
  const newParser = new Parser();
  newParser.setLanguage(TypeScript);
  parseCount = 0;
  // Replace the parser reference
}
```

### Pattern 3: better-sqlite3 Schema with WAL Mode
**What:** Synchronous SQLite database with WAL mode and prepared statements
**When to use:** Graph database creation and queries
**Example:**
```typescript
// Source: better-sqlite3 official docs
import Database from "better-sqlite3";

const db = new Database(dbPath);

// Performance pragmas
db.pragma("journal_mode = WAL");
db.pragma("synchronous = NORMAL");
db.pragma("cache_size = -64000"); // 64MB cache
db.pragma("foreign_keys = ON");

// Create schema in a transaction
db.exec(`
  CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    file_path TEXT NOT NULL,
    start_line INTEGER,
    end_line INTEGER,
    signature TEXT,
    complexity INTEGER,
    is_exported BOOLEAN DEFAULT 0,
    is_test BOOLEAN DEFAULT 0,
    language TEXT,
    loc INTEGER,
    last_modified INTEGER,
    metadata JSON
  );

  CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY,
    source_id INTEGER REFERENCES nodes(id),
    target_id INTEGER REFERENCES nodes(id),
    kind TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    metadata JSON
  );

  CREATE TABLE IF NOT EXISTS communities (
    node_id INTEGER REFERENCES nodes(id),
    community_id INTEGER,
    modularity_class TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(file_path);
  CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
  CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
  CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
  CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
`);
```

### Pattern 4: Plugin .mcp.json Configuration
**What:** MCP server configuration using ${CLAUDE_PLUGIN_ROOT} for path resolution
**When to use:** Plugin .mcp.json at plugin root
**Example:**
```json
{
  "mcpServers": {
    "codescope": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/dist/server.js"],
      "env": {
        "CODESCOPE_GRAMMAR_DIR": "${CLAUDE_PLUGIN_ROOT}/grammars"
      }
    }
  }
}
```

### Pattern 5: Skill SKILL.md with Task Tool Delegation
**What:** Skill that uses Task tool for sub-agent isolation instead of context: fork
**When to use:** The onboard skill needs to run interactive onboarding in the main context (not forked)
**Why not context: fork:** Issue #17283 -- context: fork silently ignored on auto-invoked skills
**Example:**
```markdown
---
name: onboard
description: Configure CodeScope for this project. Detects project type, languages, and build commands, then walks through agent model selection and workflow preferences. Run this before /codescope:bootstrap.
---

# CodeScope Onboarding

You are running the CodeScope onboarding wizard. Follow these steps:

## Step 1: Prerequisites Check
Check that Node.js >= 22 is installed. If not, show clear instructions to upgrade.
Check that .claude/codescope/config.yml does NOT already exist. If it does, ask the user:
"CodeScope is already configured. Would you like to: (1) Update existing config, or (2) Start fresh?"

## Step 2: Project Detection
Read the following files to detect project configuration:
- package.json (project type, scripts, dependencies)
- tsconfig.json / jsconfig.json (TypeScript configuration)
- pyproject.toml / setup.py / requirements.txt (Python)
- docker-compose.yml (services)
- .github/workflows/*.yml (CI/CD)
- playwright.config.ts / cypress.config.ts (E2E)

Present findings for confirmation using structured menus...

[... full onboarding flow instructions ...]
```

### Pattern 6: Config Schema with Zod Validation
**What:** Define config.yml structure as Zod schema, validate on load
**When to use:** Config loading and writing
**Example:**
```typescript
// Source: zod v4 docs + CODESCOPE-SPEC-V6.md config schema
import { z } from "zod/v4";

const AgentModelSchema = z.object({
  model: z.enum(["haiku", "sonnet", "opus", "inherited"]),
});

const ConfigSchema = z.object({
  schema_version: z.literal(1),
  project: z.object({
    name: z.string(),
    type: z.enum(["single", "monorepo", "polyrepo"]),
    languages: z.array(z.string()),
    services: z.array(z.object({
      name: z.string(),
      path: z.string(),
      build: z.string().optional(),
      test: z.string().optional(),
    })).optional(),
  }),
  agents: z.object({
    researcher: AgentModelSchema,
    convention_detector: AgentModelSchema,
    risk_analyzer: AgentModelSchema,
    learning_synthesizer: AgentModelSchema,
    eval_judge: AgentModelSchema,
    debug: AgentModelSchema,
  }),
  orient: z.object({
    verbosity: z.enum(["brief", "detailed"]),
    clarification: z.enum(["thorough", "minimal", "auto"]),
    research_sources: z.array(z.string()),
    max_research_time: z.number(),
  }),
  // ... additional sections per spec schema
});

type Config = z.infer<typeof ConfigSchema>;
```

### Anti-Patterns to Avoid
- **Putting components inside .claude-plugin/:** Only plugin.json goes in .claude-plugin/. Skills, hooks, .mcp.json MUST be at plugin root.
- **Using context: fork for onboard skill:** Issue #17283 -- silently ignored on auto-invoked skills. Use Task tool delegation or run inline.
- **Using node-tree-sitter:** Broken, no maintainer. Use web-tree-sitter WASM exclusively.
- **Using web-tree-sitter 0.26.x:** Breaks ABI compatibility with 0.25.x grammar WASM files.
- **Forgetting tree.delete():** Every parse MUST call tree.delete() in a finally block. Memory grows unbounded otherwise.
- **Using async SQLite:** better-sqlite3 is synchronous by design. MCP tool handlers need immediate results. Do not wrap in async.
- **Hardcoding grammar paths:** Use CODESCOPE_GRAMMAR_DIR env var from .mcp.json to resolve grammar WASM file paths.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| YAML parsing | Custom YAML parser | js-yaml ^4.1.1 | Edge cases in YAML spec (anchors, multiline strings, type coercion) |
| Schema validation | Manual if/else validation | zod ^3.25 (zod/v4) | Already a project dependency (MCP SDK peer dep); type inference; clear errors |
| TS/JS import resolution | Regex-based path resolution | enhanced-resolve ^5.20.1 + tsconfig-paths ^4.2.0 | node_modules resolution, package.json exports field, symlinks, path aliases -- deceptively complex |
| AST parsing | Regex-based code parsing | web-tree-sitter ^0.25.10 | Handles syntax errors gracefully, language-agnostic, incremental parsing |
| SQLite database | File-based JSON storage | better-sqlite3 ^12.8.0 | Indexes, transactions, prepared statements, concurrent reads with WAL |
| MCP server protocol | Custom stdio JSON-RPC | @modelcontextprotocol/sdk ^1.27.1 | Protocol version negotiation, capability discovery, error formatting |
| TypeScript bundling | Manual esbuild config | tsdown ^0.21.4 | Zero-config for libraries, declaration files, ESM output |

**Key insight:** The entire plugin value chain -- MCP protocol, AST parsing, import resolution, graph storage, schema validation -- has mature, battle-tested libraries. Custom solutions add bugs without adding value.

## Common Pitfalls

### Pitfall 1: WASM ABI Mismatch
**What goes wrong:** web-tree-sitter 0.25.x cannot load .wasm grammar files built with tree-sitter-cli 0.26.x (or vice versa). Runtime error: "Invalid WASM binary" or similar.
**Why it happens:** tree-sitter changed the WASM ABI between 0.25 and 0.26. The .wasm file format is not backward-compatible.
**How to avoid:** Pin both web-tree-sitter AND tree-sitter-cli to 0.25.x. Build grammars with tree-sitter-cli@0.25.10, load with web-tree-sitter@0.25.10. Verify by parsing a test file immediately after loading.
**Warning signs:** "RuntimeError" during Language.load(), parser.parse() returning null.

### Pitfall 2: web-tree-sitter Memory Leaks
**What goes wrong:** Memory grows unbounded when parsing many files in sequence. Node.js process eventually crashes or becomes extremely slow.
**Why it happens:** web-tree-sitter allocates C memory for Tree objects that is NOT managed by the JS garbage collector. You must call tree.delete() explicitly.
**How to avoid:** (1) Always call tree.delete() in a finally block after every parse. (2) Recreate parser instances after every 100 parses (parser.delete() + new Parser()). (3) For large files (>500KB), use shallow parsing only.
**Warning signs:** RSS growing linearly with number of files parsed; process.memoryUsage().rss exceeding expectations.

### Pitfall 3: Plugin Directory Structure Confusion
**What goes wrong:** Skills, hooks, or MCP tools don't load. Plugin appears installed but no commands are available.
**Why it happens:** Components placed inside .claude-plugin/ directory instead of at plugin root. Only plugin.json belongs in .claude-plugin/.
**How to avoid:** Strict directory layout: .claude-plugin/ contains ONLY plugin.json. All other directories (skills/, .mcp.json, hooks/) at plugin root level.
**Warning signs:** `claude --debug` shows plugin loading but no components registered.

### Pitfall 4: MCP Server Path Resolution
**What goes wrong:** MCP server fails to start because it can't find dist/server.js or grammar files.
**Why it happens:** Paths in .mcp.json are relative to the wrong directory, or ${CLAUDE_PLUGIN_ROOT} not used.
**How to avoid:** Always use ${CLAUDE_PLUGIN_ROOT} for all intra-plugin path references in .mcp.json. Pass grammar directory via environment variable.
**Warning signs:** "ENOENT" errors in MCP server startup logs.

### Pitfall 5: better-sqlite3 Native Addon Issues
**What goes wrong:** Installation fails or binary crashes at runtime.
**Why it happens:** better-sqlite3 is a native addon. Node.js major version changes can break prebuilds.
**How to avoid:** Verify prebuild availability for your Node.js version (22.x has prebuilds as of 12.8.0). If prebuilds fail, ensure build tools are available (python3, make, gcc).
**Warning signs:** "Could not locate the bindings file" error at require time.

### Pitfall 6: Zod Import Path for MCP SDK v1.x
**What goes wrong:** Type errors or runtime errors when using zod with MCP SDK.
**Why it happens:** MCP SDK v1.x uses zod/v4 import path internally. If you import from "zod" directly (v3 API) your schemas may be incompatible.
**How to avoid:** Install zod@^3.25+ and import from "zod/v4" in new code. This ensures compatibility with MCP SDK v1.27.1.
**Warning signs:** "Expected ZodType but received..." errors from MCP SDK tool registration.

### Pitfall 7: config.yml vs config.md Confusion
**What goes wrong:** Code references config.md (from the original spec) but the actual file is config.yml (per decision D-10).
**Why it happens:** The spec uses "config.md" throughout but the context session explicitly changed this to config.yml.
**How to avoid:** All code and documentation must reference config.yml. The REQUIREMENTS.md still says "config.md" -- treat that as config.yml per D-10.
**Warning signs:** File not found errors when loading config.

## Code Examples

Verified patterns from official sources:

### Project Detection (onboarding)
```typescript
// Detect project type and configuration from filesystem
import * as fs from "node:fs";
import * as path from "node:path";

interface ProjectInfo {
  type: "single" | "monorepo" | "polyrepo";
  languages: string[];
  buildCommand?: string;
  testCommand?: string;
  e2eTool?: string;
  e2eCommand?: string;
  services?: Array<{ name: string; path: string }>;
}

async function detectProject(rootDir: string): Promise<ProjectInfo> {
  const info: ProjectInfo = { type: "single", languages: [] };

  // Check package.json
  const pkgPath = path.join(rootDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    info.languages.push("typescript"); // or javascript based on tsconfig
    if (pkg.scripts?.build) info.buildCommand = `npm run build`;
    if (pkg.scripts?.test) info.testCommand = `npm test`;
    if (pkg.workspaces) info.type = "monorepo";
  }

  // Check for TypeScript
  if (fs.existsSync(path.join(rootDir, "tsconfig.json"))) {
    if (!info.languages.includes("typescript")) info.languages.push("typescript");
  }

  // Check for Python
  if (fs.existsSync(path.join(rootDir, "pyproject.toml")) ||
      fs.existsSync(path.join(rootDir, "requirements.txt"))) {
    info.languages.push("python");
  }

  // Check for E2E
  if (fs.existsSync(path.join(rootDir, "playwright.config.ts"))) {
    info.e2eTool = "playwright";
    info.e2eCommand = "npx playwright test";
  }

  // Check for Docker Compose (monorepo indicator)
  if (fs.existsSync(path.join(rootDir, "docker-compose.yml"))) {
    // Parse for service names
  }

  return info;
}
```

### Directory Tree Creation
```typescript
// Eagerly create .claude/codescope/ directory tree (D-21)
import * as fs from "node:fs";
import * as path from "node:path";

const CODESCOPE_DIRS = [
  ".claude/codescope",
  ".claude/codescope/services",
  ".claude/codescope/orient",
  ".claude/codescope/plans",
  ".claude/codescope/execution",
  ".claude/codescope/reports",
  ".claude/codescope/reports/screenshots",
];

function createDirectoryTree(projectRoot: string): void {
  for (const dir of CODESCOPE_DIRS) {
    const fullPath = path.join(projectRoot, dir);
    fs.mkdirSync(fullPath, { recursive: true });
  }

  // Write selective .gitignore (D-22)
  const gitignoreContent = `# CodeScope - ignore transient files, track shareable files
# Tracked: config.yml, conventions-enforced.md
# Ignored: database, execution artifacts, reports

graph.db
graph.db-wal
graph.db-shm
execution/
reports/screenshots/
usage.md
`;
  fs.writeFileSync(
    path.join(projectRoot, ".claude/codescope/.gitignore"),
    gitignoreContent
  );
}
```

### High-Level AST Extraction API
```typescript
// Per D-36: High-level API returning structured data
import Parser from "web-tree-sitter";

interface ParseResult {
  imports: Array<{ source: string; specifiers: string[]; line: number }>;
  exports: Array<{ name: string; kind: string; line: number }>;
  classes: Array<{ name: string; methods: string[]; startLine: number; endLine: number }>;
  functions: Array<{ name: string; params: string[]; startLine: number; endLine: number; isExported: boolean }>;
  variables: Array<{ name: string; isExported: boolean; line: number }>;
}

function extractFromTree(tree: Parser.Tree, language: string): ParseResult {
  const root = tree.rootNode;
  const result: ParseResult = {
    imports: [],
    exports: [],
    classes: [],
    functions: [],
    variables: [],
  };

  // Walk top-level children only (or deeper based on file size)
  for (let i = 0; i < root.childCount; i++) {
    const node = root.child(i);
    if (!node) continue;

    switch (node.type) {
      case "import_statement":
        // Extract import specifiers and source
        break;
      case "export_statement":
        // Extract exported name and kind
        break;
      case "class_declaration":
        // Extract class name and method signatures
        break;
      case "function_declaration":
        // Extract function name and parameters
        break;
      // ... language-specific node types
    }
  }

  return result;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| node-tree-sitter (native) | web-tree-sitter (WASM) | 2024+ | node-tree-sitter has no active maintainer; web-tree-sitter is what Claude Code uses internally |
| tsup | tsdown | 2025 | tsup no longer actively maintained; tsdown is its successor powered by Rolldown |
| zod v3 (import "zod") | zod v4 (import "zod/v4") | 2025 | MCP SDK v1.27.1 uses zod/v4 internally; new code should use zod/v4 import path |
| MCP SDK v2 (pre-alpha) | MCP SDK v1.27.1 (stable) | Current | v2 is NOT production-ready; v1.x is the recommended version |
| Manual WASM grammar builds | Prebuilt + bundled in plugin | Design decision D-19 | Zero user setup; grammars bundled in plugin package |

**Deprecated/outdated:**
- node-tree-sitter: broken, no maintainer -- never use
- web-tree-sitter 0.26.x: WASM ABI break -- pin to 0.25.10
- tsup: no longer actively maintained -- use tsdown
- tree-sitter-wasm-prebuilt (npm): stale at v0.0.3 -- build your own with matching CLI version

## Open Questions

1. **WASM Grammar Building at Development Time**
   - What we know: tree-sitter-cli needs Docker or Emscripten to build .wasm files. Docker is available on this machine. The command is `npx tree-sitter build --wasm node_modules/tree-sitter-<lang>`.
   - What's unclear: Whether the tree-sitter-typescript npm package (v0.23.2) is compatible with tree-sitter-cli 0.25.10 for WASM building. The npm package version (0.23.2) differs from the CLI version (0.25.10).
   - Recommendation: Test the build at plan execution time. If tree-sitter-typescript@0.23.2 does not produce valid WASM with CLI 0.25.10, use the git repository directly or find a compatible grammar version. Alternatively, check if `tree-sitter-wasms` npm package (0.1.13) provides compatible prebuilt grammars.

2. **Onboarding Skill Execution Model**
   - What we know: The onboard skill needs interactive AskUserQuestion menus. It should NOT use context: fork (Issue #17283). The skill runs in the main context.
   - What's unclear: Whether AskUserQuestion is a Claude Code tool or a pattern for skills. The skill body should instruct Claude to ask structured questions.
   - Recommendation: Write the onboard skill as a detailed prompt that instructs Claude to ask structured questions in sequence. The skill runs inline (no context: fork, no Task tool delegation for onboard itself -- it IS the main interaction).

3. **tsdown Configuration for MCP Server Bundle**
   - What we know: tsdown should bundle src/server.ts to dist/server.js. The server uses better-sqlite3 (native addon) and web-tree-sitter (WASM loading).
   - What's unclear: How to handle native addons (better-sqlite3) in the bundle -- they cannot be bundled and must be external. WASM files also cannot be bundled.
   - Recommendation: Mark better-sqlite3 as external in tsdown config. WASM files loaded from the grammars/ directory via env var. The plugin's ${CLAUDE_PLUGIN_DATA} can hold node_modules for native addons, with a SessionStart hook to install dependencies.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Runtime, Claude Code plugin | Yes | v25.6.1 | -- (required) |
| npm | Package management | Yes | 11.9.0 | -- (required) |
| Docker | Building WASM grammars (dev time) | Yes | 29.2.1 | Emscripten (not installed) |
| ast-grep | Python import resolution, convention detection | Yes | 0.42.0 | -- |
| ripgrep | Text search | Yes | 15.1.0 | -- |
| Emscripten | Building WASM grammars (alt to Docker) | No | -- | Docker (available) |

**Missing dependencies with no fallback:**
- None -- all required dependencies are available.

**Missing dependencies with fallback:**
- Emscripten not installed, but Docker is available for WASM grammar building.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.0 |
| Config file | vitest.config.ts (Wave 0 -- needs creation) |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run --coverage` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PLUG-01 | Plugin manifest valid, skills registered, .mcp.json correct | unit | `npx vitest run tests/plugin/manifest.test.ts -t "plugin structure"` | Wave 0 |
| PLUG-02 | MCP server starts without errors | integration | `npx vitest run tests/server/startup.test.ts -t "server starts"` | Wave 0 |
| PLUG-03 | .claude/codescope/ directory tree created with all subdirs | unit | `npx vitest run tests/onboard/filesystem.test.ts -t "directory tree"` | Wave 0 |
| PLUG-04 | ~/.codescope/ global memory directory created | unit | `npx vitest run tests/onboard/filesystem.test.ts -t "global memory"` | Wave 0 |
| ONBD-01 | Project detection from config files | unit | `npx vitest run tests/onboard/detect.test.ts` | Wave 0 |
| ONBD-02 | Agent model assignment in config | unit | `npx vitest run tests/config/schema.test.ts -t "agents"` | Wave 0 |
| ONBD-03 | Workflow preferences in config | unit | `npx vitest run tests/config/schema.test.ts -t "preferences"` | Wave 0 |
| ONBD-04 | config.yml produced with valid YAML structure | unit | `npx vitest run tests/config/loader.test.ts -t "write and load"` | Wave 0 |
| ONBD-05 | Global memory read for returning users | unit | `npx vitest run tests/onboard/global-memory.test.ts` | Wave 0 |
| PARS-01 | web-tree-sitter parses TS, JS, Python files | integration | `npx vitest run tests/parser/extract.test.ts` | Wave 0 |
| PARS-02 | TS/JS import resolution accuracy | integration | `npx vitest run tests/resolver/typescript.test.ts` | Wave 0 |
| PARS-03 | Python import resolution | integration | `npx vitest run tests/resolver/python.test.ts` | Wave 0 |
| PARS-04 | Parser lifecycle (no leaks after 500+ files) | integration | `npx vitest run tests/parser/lifecycle.test.ts` | Wave 0 |
| GRPH-01 | SQLite schema with nodes, edges, communities tables | unit | `npx vitest run tests/graph/schema.test.ts` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run --coverage`
- **Phase gate:** Full suite green before /gsd:verify-work

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- vitest configuration file
- [ ] `tsconfig.json` -- TypeScript configuration
- [ ] `package.json` -- project dependencies and scripts
- [ ] `tests/plugin/manifest.test.ts` -- validates plugin directory structure
- [ ] `tests/server/startup.test.ts` -- MCP server startup verification
- [ ] `tests/onboard/filesystem.test.ts` -- directory tree creation
- [ ] `tests/onboard/detect.test.ts` -- project detection logic
- [ ] `tests/onboard/global-memory.test.ts` -- global memory reading
- [ ] `tests/config/schema.test.ts` -- Zod schema validation
- [ ] `tests/config/loader.test.ts` -- config load/write round-trip
- [ ] `tests/parser/extract.test.ts` -- AST extraction for all 3 languages
- [ ] `tests/parser/lifecycle.test.ts` -- parser memory lifecycle
- [ ] `tests/resolver/typescript.test.ts` -- TS/JS import resolution
- [ ] `tests/resolver/python.test.ts` -- Python import resolution
- [ ] `tests/graph/schema.test.ts` -- SQLite schema creation and queries
- [ ] `tests/graph/batch-writer.test.ts` -- JSONL batch insert
- [ ] `tests/tools/status.test.ts` -- codescope_status tool
- [ ] Framework install: `npm install -D vitest@^4.1.0`

## Project Constraints (from CLAUDE.md)

The following CLAUDE.md directives constrain this phase's implementation:

- **Tech stack (locked):** TypeScript, web-tree-sitter WASM (NOT node-tree-sitter), ast-grep CLI, better-sqlite3, graphology, enhanced-resolve, @modelcontextprotocol/sdk, vitest
- **web-tree-sitter pin:** ^0.25.10, NOT 0.26.x (WASM ABI break)
- **MCP SDK pin:** v1.27.1 (v1.x stable; v2 pre-alpha NOT production-ready)
- **zod import:** Use zod/v4 import path with zod@^3.25+
- **Build tool:** tsdown (NOT tsup -- no longer maintained)
- **Test framework:** vitest (NOT jest)
- **Memory management:** Call tree.delete() after every parse; periodically call parser.delete() and recreate
- **MCP transport:** StdioServerTransport (Claude Code spawns the process)
- **better-sqlite3:** Synchronous API; do NOT wrap in async patterns
- **Plugin structure:** .claude-plugin/plugin.json + skills/ + .mcp.json at root
- **Data persistence:** Filesystem-first at .claude/codescope/
- **Version compatibility matrix:** web-tree-sitter@0.25.10 <-> tree-sitter-cli@0.25.x (ABI 14); @modelcontextprotocol/sdk@^1.27.1 <-> zod@^3.25; graphology@^0.26.0 <-> graphology-types@^0.24.8; better-sqlite3@^12.8.0 <-> Node.js 22.x
- **What NOT to use:** node-tree-sitter, web-tree-sitter 0.26.x, tsup, sqlite3 (npm), node:sqlite, graphology-communities (old), @modelcontextprotocol/sdk v2.x, jest, tree-sitter-wasm-prebuilt

## Sources

### Primary (HIGH confidence)
- [Claude Code Plugins documentation](https://code.claude.com/docs/en/plugins) -- complete plugin structure, manifest schema, MCP server configuration
- [Claude Code Plugins reference](https://code.claude.com/docs/en/plugins-reference) -- full plugin.json schema, .mcp.json format, environment variables, debugging
- [Claude Code Skills documentation](https://code.claude.com/docs/en/skills) -- SKILL.md frontmatter fields, $ARGUMENTS, Task tool delegation
- [MCP TypeScript SDK server.md](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md) -- McpServer API, tool registration, StdioServerTransport
- [web-tree-sitter README](https://github.com/tree-sitter/tree-sitter/blob/master/lib/binding_web/README.md) -- Parser.init(), Language.load(), tree.delete() API
- [better-sqlite3 GitHub](https://github.com/WiseLibs/better-sqlite3) -- synchronous API, WAL mode, performance docs
- npm registry (checked 2026-03-22) -- all package versions verified against latest published

### Secondary (MEDIUM confidence)
- [tree-sitter/tree-sitter#5171](https://github.com/tree-sitter/tree-sitter/issues/5171) -- 0.26.x WASM ABI incompatibility confirmed (cited in CLAUDE.md)
- [tree-sitter-wasms npm](https://www.npmjs.com/package/tree-sitter-wasms) -- prebuilt WASM package (v0.1.13), ABI compatibility unverified with 0.25.x runtime
- [CODESCOPE-SPEC-V6.md](./../../CODESCOPE-SPEC-V6.md) -- SQLite schema (lines 869-904), config YAML schema (lines 718-823), onboarding flow (Part 4)

### Tertiary (LOW confidence)
- tree-sitter-typescript npm version (0.23.2) compatibility with tree-sitter-cli 0.25.10 for WASM building -- untested, flagged as open question

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all versions verified against npm registry; CLAUDE.md provides explicit version pins and compatibility matrix
- Architecture: HIGH -- plugin structure fully documented by Anthropic; MCP SDK API verified; spec provides detailed schemas
- Pitfalls: HIGH -- known issues documented in CLAUDE.md (memory management, ABI compatibility, Issue #17283, Issue #5812)
- WASM grammar building: MEDIUM -- Docker available, CLI version pinning clear, but grammar npm package version compatibility needs testing

**Research date:** 2026-03-22
**Valid until:** 2026-04-22 (30 days -- stable technology stack, pinned versions)
