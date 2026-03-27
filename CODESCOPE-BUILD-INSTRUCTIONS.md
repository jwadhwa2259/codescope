# CodeScope — Build Instructions

**Date:** March 22, 2026
**Purpose:** Environment setup, tooling installation, GSD build commands, and competitor study guide.
**Companion to:** CODESCOPE-SPEC-V6.md (product specification)

---

## Step 1: Install CLI Tools

```bash
# GSD — build methodology (spec-driven, fresh context per plan)
npx get-shit-done-cc@latest
# Choose: Claude Code, Global install
# Verify: /gsd:help in Claude Code shows GSD commands

# ast-grep — structural code search (27 languages)
# Used by: Convention detection. Finds patterns by syntax structure, not text.
npm install -g @ast-grep/cli
# Verify: ast-grep --version

# ripgrep — fast text search
# Used by: Exact identifier matching. Claude Code uses it internally too.
brew install ripgrep          # macOS
# sudo apt install ripgrep    # Linux
# Verify: rg --version

# uv — Python package runner (for dev MCP servers)
# Used by: Some helper MCP servers are Python-based.
curl -LsSf https://astral.sh/uv/install.sh | sh
# Verify: uv --version
```

---

## Step 2: Install Development MCP Servers

These are external tools used during development. They are NOT part of CodeScope — they're tools used alongside it.

```bash
# ast-grep MCP — lets Claude search patterns structurally
# Used by: Building and testing convention detection
claude mcp add ast-grep -- uv run --from ast-grep-mcp ast-grep-mcp
# Verify: Ask Claude "Search for all function definitions using ast-grep"

# Context7 — fetches current, version-specific library documentation
# Used by: GSD/Claude to use correct APIs for fast-moving dependencies (MCP SDK, graphology, etc.)
claude mcp add context7 -- npx -y @upstash/context7-mcp@latest
# Verify: Ask Claude "use context7 to look up how to create an MCP server with @modelcontextprotocol/sdk"

# OPTIONAL: XRAY MCP — cross-validate blast radius during development
# Used by: Cross-checking CodeScope's blast radius against an independent tool
claude mcp add xray -- uv run --from xray-mcp xray-mcp
```

---

## Step 3: Study the Competition (During Build)

Install these to understand what you're building against. This is research, not dependencies.

```bash
# codebase-context — closest competitor for convention detection
# Study: conventions output, memory.json format, search quality scoring,
#         trend direction, golden files, conflict detection, preflight cards
npx codebase-context /path/to/test-project

# codebase-memory-mcp — closest competitor for knowledge graph + blast radius
# Study: SQLite graph schema, Louvain implementation, blast radius calculation,
#         detect_changes tool, get_architecture single-call overview, Cypher queries
# Download from: github.com/DeusData/codebase-memory-mcp/releases
curl -L -o codebase-memory-mcp https://github.com/DeusData/codebase-memory-mcp/releases/latest/download/codebase-memory-mcp-darwin-arm64
chmod +x codebase-memory-mcp
./codebase-memory-mcp install
```

**What to learn from codebase-context:**
- How it scores confidence (ok vs low_confidence)
- How trend direction works (Rising/Declining based on git recency)
- How golden files are ranked (modern pattern density)
- How conflict detection works (competing patterns >20%)
- How git commit mining works (refactor:/migrate:/fix: extraction)
- How preflight cards decide ready: true/false

**What to learn from codebase-memory-mcp:**
- How detect_changes maps git diff to symbols
- How get_architecture returns everything in one call
- How trace_call_path does risk-classified BFS
- Their SQLite schema design

**Other references to study:**
- Anthropic's feature-dev plugin (official plugin patterns, 89K installs)
- Understand Anything plugin (5-agent architecture reference)

---

## Step 4: Initialize the Project

```bash
mkdir codescope && cd codescope && git init

# Copy CODESCOPE-SPEC-V6.md into the directory
# Then:
claude
/gsd:new-project --auto @CODESCOPE-SPEC-V6.md
```

During GSD's research phase, point it to the competitors listed in Step 3.

---

## Step 5: Build

Build straight through — no hard stops between phases. Fix issues as you go, keep moving.

```bash
# Phase 1a: Plugin Skeleton + Onboard + Scout + Researcher (Days 1-5)
/gsd:discuss-phase 1a
/gsd:plan-phase 1a
/gsd:execute-phase 1a
# Run gate test from spec → fix issues, keep moving

# Phase 1b: Full Bootstrap Squad + Learning (Days 6-10)
/gsd:discuss-phase 1b
/gsd:plan-phase 1b
/gsd:execute-phase 1b
# Run gate test from spec → fix issues, keep moving

# Phase 1c: Orient + Execute + Verify (Days 11-18)
/gsd:discuss-phase 1c
/gsd:plan-phase 1c
/gsd:execute-phase 1c
# Run gate test from spec → fix issues, keep moving

# Phase 1d: Eval + User Gate + Debug + Learn (Days 19-25)
/gsd:discuss-phase 1d
/gsd:plan-phase 1d
/gsd:execute-phase 1d
# Run gate test from spec → full pipeline test

# V1 Comparison Testing (Days 26-30)
# Run CodeScope vs GSD on real repos
# See spec Part 6 for test plan details
```

---

## Step 6: V1 Comparison Testing

**Test codebases:**
1. CodeScope itself (dogfooding)
2. An unfamiliar medium-sized TS/JS open-source repo (candidates: Fastify, Hono, or GSD itself)
3. A larger monorepo if available (stress test squad scaling)

**Test tasks (run on the unfamiliar repo):**
1. Simple: Add a new API endpoint following existing patterns
2. Medium: Refactor error handling in one service to match a new pattern
3. Complex: Add a feature that spans multiple services/modules

**Run each task twice** — once with CodeScope, once with GSD. Measure:
- Human touches required
- Time to first working change
- Convention adherence (ast-grep scan)
- Build + E2E pass rate
- Issues caught by eval (CodeScope only)

**Keep a pain journal.** Track what's useful, what's broken, what's missing. These become V2 priorities.

**Check telemetry:** After testing, review `.claude/codescope/usage.md`. Which commands were run? Which MCP tools did Claude call? Which features were never touched?

---

## Common Problems

### "web-tree-sitter WASM files not loading"
Grammar .wasm files must be loaded asynchronously via `Parser.Language.load()`. Ensure .wasm files are accessible at runtime (bundled with the plugin, not just in node_modules). Use `@vscode/tree-sitter-wasm` as reference.

### "web-tree-sitter memory growing over long sessions"
Periodically call `parser.delete()` and recreate. Same fix Claude Code uses internally.

### "Auto-triggered skill runs inline instead of isolated context"
Issue #17283. Don't use `context: fork` in auto-triggered skill frontmatter. Use explicit Task tool delegation in the skill body.

### "Sub-agent created files but parent can't see contents"
Issue #5812. Don't expect return values from sub-agents. Pattern: agent writes to `.claude/codescope/*.md` → agent's final message says "Wrote to [file]" → parent reads the file.

### "Learning synthesizer captured a wrong gotcha"
Expected. Learnings start as UNVERIFIED. Phase 1d adds: review command, contradiction detection against actual code, and the rule that learnings never auto-promote to enforced conventions.

### "Convention detection finds patterns nobody cares about"
Check confidence threshold. Only surface >80% frequency AND >10 files. Separate test/config/generated file conventions from source conventions. Use conflict detection to flag ambiguous patterns.

### "Orient brief is too long / too short"
Use the persona-adaptive verbosity setting. Default to "brief" (~50 lines). Offer "detailed" (~200 lines) for complex tasks. Configurable in `.claude/codescope/config.md`.

### "Blast radius shows too many files"
Default maxHops to 3. Hop-distance coloring helps — developers focus on 🔴 and 🟠, ignore 🟢. For codebases with >1000 files at hop 1, show top 10 by in-degree with "and 47 more."

### "Python import resolution is inaccurate"
Expected for V1. Python uses pattern-based extraction (~80% accuracy). Report Python imports as "approximate." Full resolution is V2 if demand warrants it.

### "Rate limits hit during bootstrap"
Reduce `execute.max_agents_concurrent` in config.md. Default is 3. On Pro plans, set to 1 (fully sequential). On Max plans, 3 is usually safe.

---

## Key Reference Links

**Competitors:**
- codebase-context: github.com/PatrickSys/codebase-context
- codebase-memory-mcp: github.com/DeusData/codebase-memory-mcp
- Understand Anything: (search Claude Code plugin registry)
- GitNexus: github.com/nicholascui1118/gitnexus (PolyForm NC license)

**Research:**
- HumanLayer ACE: github.com/humanlayer/advanced-context-engineering-for-coding-agents
- Codified Context paper: arxiv.org/abs/2602.20478
- The Brownfield Problem: jjmasse.com/2026/03/06/the-brownfield-problem
- GSD Framework: github.com/get-shit-done-cc

**Tools:**
- ast-grep: ast-grep.github.io
- web-tree-sitter: github.com/nicolo-ribaudo/tree-sitter/tree/nicolo/web-bindings
- graphology: graphology.github.io
- enhanced-resolve: github.com/webpack/enhanced-resolve
- MCP SDK: github.com/modelcontextprotocol/sdk

---

*Set up your environment with Steps 1-3, then initialize with Step 4 and build with Step 5.*
