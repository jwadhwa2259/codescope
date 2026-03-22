<!-- GSD:project-start source:PROJECT.md -->
## Project

**CodeScope**

CodeScope is a Claude Code plugin that deeply analyzes brownfield codebases once, then autonomously researches, plans, executes, verifies, evaluates, and self-corrects code changes using coordinated sub-agents. The user only steps in twice: to describe what they want, and to approve what gets shipped. It solves the core problem that AI tools write code that doesn't fit into existing systems — every session starts from zero. CodeScope gives AI persistent understanding.

**Core Value:** AI-generated code changes that respect existing conventions, stay within safe blast radius, and actually work in the codebase — verified end-to-end before the user sees them.

### Constraints

- **Tech stack**: TypeScript (same as Claude Code ecosystem), web-tree-sitter WASM (not node-tree-sitter — broken, no maintainer), ast-grep CLI, better-sqlite3, graphology, enhanced-resolve, @modelcontextprotocol/sdk, vitest
- **Performance**: Bootstrap <5 min for 100K LOC, orient <60s after clarification, graph queries <100ms, plugin startup <5K tokens, orchestrator <15K tokens
- **Quality**: Convention false positive rate <5% (high-confidence), eval finding accuracy >70%, debug resolution >80% within 3 cycles
- **Language support**: TypeScript/JavaScript + Python for v1. TS/JS import resolution 95-99% accuracy, Python ~80%
- **Rate limits**: Max 3 concurrent agents (configurable), sequential spawning default on Pro plans
- **Learning bounds**: Max 50 active learnings (~4K tokens), gotcha decay 90 days, decision decay 180 days, never auto-promote to enforced conventions
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | ^5.7 | Primary language | Claude Code ecosystem is TypeScript. Plugin hooks, skills, MCP servers all expect TS/JS. No alternative. |
| Node.js | >=22.x | Runtime | Required for Claude Code plugin execution. LTS channel. Native fetch, WASM support, stable ESM. |
| @modelcontextprotocol/sdk | ^1.27.1 | MCP server framework | Official TypeScript SDK for MCP. V1.x is production-recommended. V2 (pre-alpha, Q1 2026 target) splits into @modelcontextprotocol/server + @modelcontextprotocol/client but is NOT production-ready. Stick with v1.x unified package. |
| better-sqlite3 | ^12.8.0 | Knowledge graph storage | Synchronous API (critical for MCP tool handlers that need immediate results), 2000+ QPS on complex queries, battle-tested with 4800+ dependents. Native addon but prebuild support is excellent. |
| web-tree-sitter | ^0.25.10 | AST parsing (WASM) | Pin to ^0.25.10, NOT 0.26.x. Version 0.26 breaks compatibility with WASM files built by older tree-sitter-cli. 0.25.x maintains backward compat, has ESM+CJS dual publish, TypeScript rewrite. This is what Claude Code uses internally. |
| graphology | ^0.26.0 | In-memory graph data structure | The standard JS graph library. Supports directed/undirected/mixed graphs. TypeScript declarations included. Mature (218 dependents). No real alternative in the JS ecosystem. |
| @ast-grep/cli | ^0.40.5 | Structural pattern matching | CLI for convention detection via structural code search. Supports 27 languages via tree-sitter. Zero compilation. Pattern syntax is isomorphic to code (low learning curve). |
| zod | ^3.25 (import from zod/v4) | Schema validation | Required peer dependency of @modelcontextprotocol/sdk. MCP tool input schemas defined with Zod. Use zod/v4 import path for new code but install zod@^3.25+ which includes v4 compat layer. |
### Supporting Libraries -- Graph Analysis
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| graphology-communities-louvain | ^2.0.2 | Community detection | Bootstrap phase: detect module communities in the knowledge graph. Louvain algorithm. Benchmarks: 50K nodes + 1M edges in ~940ms. |
| graphology-metrics | ^2.4.0 | Centrality, modularity, density | Bootstrap phase: compute in-degree centrality for danger zone detection. Provides degree, betweenness, closeness centrality. |
| graphology-traversal | ^0.3.1 | BFS/DFS graph traversal | Blast radius computation: BFS from changed nodes to find impact scope. Also used for dependency chain analysis. |
| graphology-types | ^0.24.8 | TypeScript declarations | Always -- peer dependency of graphology. Install explicitly to avoid npm peer dep resolution issues. |
### Supporting Libraries -- Import Resolution
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| enhanced-resolve | ^5.20.1 | TS/JS module resolution | Resolves import paths to filesystem locations. Handles node_modules, package.json exports, symlinks. Webpack's resolver extracted as standalone. Extremely configurable. |
| tsconfig-paths | ^4.2.0 | TypeScript path alias resolution | Resolves `@/` and other tsconfig.json `paths` aliases. Feed path mappings into enhanced-resolve for complete TS import resolution. |
### Supporting Libraries -- AST & Parsing
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @ast-grep/napi | ^0.42.0 | Programmatic ast-grep (optional) | Alternative to shelling out to @ast-grep/cli. Native Node.js bindings via NAPI. Use when you need in-process pattern matching without CLI subprocess overhead. Consider for hot paths only -- CLI is simpler for most convention detection. |
| tree-sitter-javascript | (build WASM from latest) | JS grammar WASM | Load into web-tree-sitter for JavaScript file parsing. Build .wasm with `npx tree-sitter build --wasm`. |
| tree-sitter-typescript | (build WASM from latest) | TS/TSX grammar WASM | Load into web-tree-sitter for TypeScript file parsing. Includes both typescript and tsx sub-grammars. |
| tree-sitter-python | (build WASM from latest) | Python grammar WASM | Load into web-tree-sitter for Python file parsing. |
### Supporting Libraries -- Testing & Build
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^4.1.0 | Test framework | Unit and integration tests. Fast, Vite-native, excellent TypeScript support. Watch mode for development. |
| tsdown | ^0.20.3 | TypeScript bundler | Build MCP server and plugin scripts to distributable JS. ESM-first, powered by Rolldown. Successor to tsup (which is no longer actively maintained). |
| tsx | ^4.21.0 | TypeScript runner | Development: run TS files directly without build step. Used for scripts, development server, testing iteration. |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| @modelcontextprotocol/inspector | MCP server testing | Official inspector for testing MCP tool calls interactively. Essential for debugging the 11 MCP tools. |
| tree-sitter-cli | Build WASM grammars | Use `npx tree-sitter build --wasm` to compile grammar .wasm files. Needed at build time, not runtime. Ensure version matches web-tree-sitter ABI (use tree-sitter-cli@0.25.x with web-tree-sitter@0.25.x). |
| claude (CLI) | Plugin testing | Use `claude --plugin-dir ./path` for local plugin development. `/reload-plugins` for hot reload. |
## Installation
# Core
# Graph analysis
# Import resolution
# AST tools (CLI installed globally or as dev dep)
# Optional: programmatic ast-grep (use instead of CLI if needed)
# Build & dev
# MCP development tools
# Tree-sitter grammars (for building WASM files)
# Build WASM grammar files (run after install)
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| better-sqlite3 | node:sqlite (built-in) | When Node.js stabilizes the built-in module (currently Release Candidate, stability 1.2). Requires --experimental-sqlite flag. Missing features: user-defined functions, virtual tables, extensions. Revisit in Node.js 24+. |
| better-sqlite3 | @libsql/client | When you need edge/serverless SQLite (Turso). Not needed for local-only plugin. |
| web-tree-sitter | node-tree-sitter | Never for this project. node-tree-sitter has no active maintainer and is broken. web-tree-sitter is what Claude Code uses internally. |
| @ast-grep/cli | @ast-grep/napi | When convention detection is on a hot path and subprocess overhead matters. CLI is simpler for batch analysis during bootstrap. NAPI is better for real-time checks in MCP tool handlers. |
| graphology | ngraph | When you need only graph algorithms without the full Graph object. graphology has a much richer ecosystem (metrics, communities, traversal, layout, sigma.js visualization). |
| tsdown | tsup | Never for new projects. tsup is no longer actively maintained. tsdown is its spiritual successor powered by Rolldown. |
| tsdown | esbuild (direct) | When you need maximum control over bundling. tsdown wraps Rolldown (not esbuild) but provides better DX with zero-config for libraries. |
| @modelcontextprotocol/sdk v1.x | @modelcontextprotocol/server v2.x | When v2 reaches stable release (anticipated Q1 2026 but still pre-alpha). V2 splits server/client packages and requires zod@v4 peer dep. V1.x will get bug fixes for 6+ months after v2 ships. Start with v1.x, migrate to v2 when stable. |
| zod ^3.25 | zod ^4.x (direct) | When @modelcontextprotocol/sdk v2 is stable and you migrate. V1.x SDK works with zod@^3.25 using the zod/v4 import path. Direct zod@4.x caused issues with SDK v1.17.5 but is resolved in v1.27.x. |
| vitest | jest | Never for new TypeScript projects. Vitest is faster, has native TS support, better ESM handling, and is the modern standard. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| node-tree-sitter | Broken, no active maintainer, native addon compilation issues | web-tree-sitter (WASM, cross-platform, what Claude Code uses) |
| web-tree-sitter 0.26.x | Breaking WASM ABI change -- incompatible with grammar .wasm files built by tree-sitter-cli 0.20.x. Must regenerate all grammars with new CLI. | web-tree-sitter ^0.25.10 (stable, backward-compatible) |
| tsup | No longer actively maintained by its author | tsdown (spiritual successor, powered by Rolldown, faster) |
| sqlite3 (npm) | Async callback API, slower than better-sqlite3, complex native build | better-sqlite3 (synchronous, faster, simpler) |
| node:sqlite | Experimental (Release Candidate stability), requires --experimental-sqlite flag, missing user-defined functions and virtual tables | better-sqlite3 (stable, full-featured, battle-tested) |
| graphology-communities (old package) | OBSOLETE -- see GitHub repo notice | graphology-communities-louvain (current, maintained) |
| @modelcontextprotocol/sdk v2.x (pre-alpha) | Not production-ready. Main branch is v2 pre-alpha. Breaking API changes expected. | @modelcontextprotocol/sdk@^1.27.1 (v1.x branch, production-recommended) |
| jest | Slower, worse TypeScript support, CJS-oriented, heavier config | vitest (faster, native TS, ESM-first) |
| tree-sitter-wasm-prebuilt (npm) | Stale (v0.0.3), may not match web-tree-sitter ABI version | Build .wasm files yourself with tree-sitter-cli matching your web-tree-sitter version |
## Stack Patterns by Variant
- Use @modelcontextprotocol/sdk@^1.27.1 (v1.x, stable)
- Plugin structure: .claude-plugin/plugin.json + skills/ + hooks/ + .mcp.json
- MCP server transport: StdioServerTransport (Claude Code spawns the process)
- Build with tsdown to single JS entry point for the MCP server
- All data persists to .claude/codescope/ (filesystem-first architecture)
- Replace `@modelcontextprotocol/sdk` with `@modelcontextprotocol/server`
- Update zod peer dep to zod@^4.x directly
- Import paths change but McpServer + StdioServerTransport API is similar
- Monitor v2 stability (check releases at github.com/modelcontextprotocol/typescript-sdk)
- Switch convention detection from @ast-grep/cli to @ast-grep/napi for in-process execution
- Add parser pooling: create N web-tree-sitter Parser instances, round-robin assignment
- Consider pre-computing graph metrics and caching in SQLite instead of recomputing on every query
- Install the corresponding tree-sitter grammar package (e.g., tree-sitter-go, tree-sitter-rust)
- Build WASM with `npx tree-sitter build --wasm node_modules/tree-sitter-<lang>`
- Add import resolution strategy per language (or mark as "AST-only, no import resolution")
- Add ast-grep patterns for the new language (ast-grep supports 27 languages via tree-sitter)
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| web-tree-sitter@^0.25.10 | tree-sitter-cli@^0.25.x | MUST match ABI versions. 0.25.x uses ABI 14. Do NOT use tree-sitter-cli 0.20.x (ABI mismatch). Do NOT use tree-sitter-cli 0.26.x (ABI 15, not backward-compat with 0.25 runtime). |
| @modelcontextprotocol/sdk@^1.27.1 | zod@^3.25 | SDK v1.x internally uses zod/v4 import path but works with zod@^3.25+. Earlier SDK versions (<=1.17.5) were incompatible with zod v4. |
| graphology@^0.26.0 | graphology-types@^0.24.8 | graphology-types is a peer dependency. Pin explicitly to avoid resolution issues with older npm versions. |
| graphology@^0.26.0 | graphology-communities-louvain@^2.0.2, graphology-metrics@^2.4.0, graphology-traversal@^0.3.1 | All standard library packages are designed for graphology 0.26.x. |
| better-sqlite3@^12.8.0 | Node.js 22.x | Prebuilds available. Node.js 24.x had build issues in some reports -- test before upgrading Node. |
| @ast-grep/cli@^0.40.5 | @ast-grep/napi@^0.42.0 | CLI and NAPI versions track separately but use the same pattern language. NAPI is slightly ahead in versioning. |
| tsdown@^0.20.3 | TypeScript ^5.7 | ESM-first output. Rolldown-powered. Generates declaration files. |
## Critical Implementation Notes
### web-tree-sitter Memory Management
- Call `tree.delete()` after every parse operation
- Periodically call `parser.delete()` and recreate the parser to prevent memory leaks
- The PROJECT.md documents this as a known platform constraint
- Pattern: parse file -> extract data -> tree.delete() -> continue
### MCP Server Transport
### better-sqlite3 Synchronous API
### Plugin Directory Structure
### ast-grep Convention Detection Strategy
- **Bootstrap (CLI):** `sg scan --rule conventions.yml --json ./src` -- processes entire codebase
- **MCP tool (NAPI or CLI):** Check specific files against detected conventions on demand
- Convention patterns are expressed as YAML rules with tree-sitter pattern syntax
## Confidence Assessment
| Technology | Confidence | Reason |
|------------|------------|--------|
| @modelcontextprotocol/sdk v1.x | HIGH | Official SDK, v1.27.1 is latest stable, production-recommended by maintainers |
| better-sqlite3 | HIGH | 12.8.0 released March 2026, 4800+ dependents, synchronous API is ideal for MCP handlers |
| web-tree-sitter ^0.25.10 | HIGH | Verified 0.26.x WASM ABI break via GitHub issue #5171. 0.25.10 is the safe pin. |
| graphology ecosystem | HIGH | 0.26.0 is latest, well-documented standard library, Louvain benchmarks verified |
| @ast-grep/cli | HIGH | 0.40.5 latest, actively maintained (0.42.0 on Rust side), 27 language support |
| enhanced-resolve | HIGH | 5.20.1, webpack core dependency, extremely well-tested |
| tsconfig-paths | MEDIUM | 4.2.0 is 3 years old but stable and correct. No active development needed -- the problem is solved. |
| vitest | HIGH | 4.1.0, dominant test framework in TS ecosystem |
| tsdown | MEDIUM | 0.20.3, relatively new (successor to tsup), but backed by Rolldown/Vite team. Pre-1.0 but functional. Fallback: use tsx for development, esbuild directly for production builds. |
| zod | HIGH | 4.3.6 latest, 82M weekly downloads, MCP SDK peer dependency |
| @ast-grep/napi | MEDIUM | 0.42.0, works but adds native addon complexity. CLI is simpler default. Use NAPI only if benchmarks show CLI subprocess overhead is a bottleneck. |
| tree-sitter WASM grammars | MEDIUM | Must build yourself with matching tree-sitter-cli version. Prebuilt packages are stale. Build process is straightforward but adds a build step. |
## Sources
- [web-tree-sitter npm](https://www.npmjs.com/package/web-tree-sitter) -- version 0.26.6 latest, 0.25.10 recommended for compat
- [tree-sitter/tree-sitter#5171](https://github.com/tree-sitter/tree-sitter/issues/5171) -- 0.26.x WASM ABI incompatibility confirmed
- [better-sqlite3 npm](https://www.npmjs.com/package/better-sqlite3) -- v12.8.0, March 2026
- [better-sqlite3 vs node:sqlite discussion](https://github.com/WiseLibs/better-sqlite3/discussions/1245) -- comparison with built-in module
- [graphology standard library](https://graphology.github.io/standard-library/) -- ecosystem packages documentation
- [graphology-communities-louvain npm](https://www.npmjs.com/package/graphology-communities-louvain) -- v2.0.2, benchmarks
- [@modelcontextprotocol/sdk npm](https://www.npmjs.com/package/@modelcontextprotocol/sdk) -- v1.27.1 latest stable
- [MCP TypeScript SDK GitHub](https://github.com/modelcontextprotocol/typescript-sdk) -- v2 pre-alpha status, v1.x recommended
- [MCP TypeScript SDK v2 docs](https://ts.sdk.modelcontextprotocol.io/v2/) -- package split: @modelcontextprotocol/server + /client
- [MCP SDK Zod compatibility issues](https://github.com/modelcontextprotocol/typescript-sdk/issues/925) -- v1.17.5 incompatibility resolved in later versions
- [@ast-grep/cli npm](https://www.npmjs.com/package/@ast-grep/cli) -- v0.40.5
- [@ast-grep/napi npm](https://www.npmjs.com/package/@ast-grep/napi) -- v0.42.0, programmatic API
- [ast-grep documentation](https://ast-grep.github.io/) -- pattern syntax, language support
- [enhanced-resolve npm](https://www.npmjs.com/package/enhanced-resolve) -- v5.20.1
- [tsconfig-paths npm](https://www.npmjs.com/package/tsconfig-paths) -- v4.2.0
- [vitest releases](https://github.com/vitest-dev/vitest/releases) -- v4.1.0
- [tsdown npm](https://www.npmjs.com/package/tsdown) -- v0.20.3, tsup successor
- [tsx npm](https://www.npmjs.com/package/tsx) -- v4.21.0
- [zod npm](https://www.npmjs.com/package/zod) -- v4.3.6
- [Claude Code plugins documentation](https://code.claude.com/docs/en/plugins) -- plugin structure, manifest, hooks, MCP
- [Node.js SQLite documentation](https://nodejs.org/api/sqlite.html) -- Release Candidate stability status
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
