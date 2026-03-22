# Phase 1: Plugin Foundation and Infrastructure - Context

**Gathered:** 2026-03-22
**Status:** Ready for planning

<domain>
## Phase Boundary

A working Claude Code plugin that installs cleanly, creates its filesystem structure, walks the user through interactive onboarding, and has AST parsing (web-tree-sitter WASM) and graph storage (better-sqlite3) infrastructure ready for bootstrap agents in Phase 2. This phase delivers: plugin skeleton (manifest, skills, MCP server config), `/codescope:onboard` skill, persistent file structure at `.claude/codescope/` and `~/.codescope/`, web-tree-sitter parsing for TS/JS/Python with memory lifecycle management, and SQLite graph schema with nodes/edges/communities tables.

</domain>

<decisions>
## Implementation Decisions

### Onboarding Interaction Style
- **D-01:** Use AskUserQuestion menus (structured selection UI) for all onboarding interactions. Consistent with Claude Code patterns, fast to navigate.
- **D-02:** Auto-detect project type, languages, build/test commands, E2E tool from existing config files, then present results for user to confirm or correct ("detect and confirm" pattern).
- **D-03:** For returning users with global memory (~/.codescope/global-memory.md), offer one-click accept: show saved preferences summary with "Use same setup" vs "Customize" options.
- **D-04:** When project detection fails or finds nothing recognizable, fall back to manual entry via menus. No dead ends.
- **D-05:** Single skill invocation — `/codescope:onboard` runs all 3 phases (detection, model selection, workflow preferences) in sequence. No separate sub-skills.
- **D-06:** Show recommended model defaults for all 6 agents, let user accept all or override specific ones. No per-agent walkthrough, no preset profiles.
- **D-07:** Check prerequisites at onboarding start. Block on critical prerequisites (Node.js 22+, WASM grammars) with clear fix instructions. Non-critical items (e.g., Playwright) get warnings only.
- **D-08:** After writing config, show brief summary of choices + prompt to run `/codescope:bootstrap`. Clear call-to-action.
- **D-09:** If user runs `/codescope:onboard` on a project with existing config, offer "Update existing config" or "Start fresh". Prevents accidental data loss.

### Config Format & Defaults
- **D-10:** Use `config.yml` (pure YAML) instead of `config.md`. Config is machine-parsed data, not documentation — deserves proper YAML format with editor support, validation, and autocomplete.
- **D-11:** "Inherited" model assignment means the sub-agent runs on whatever model the user's Claude Code session is running. No explicit model override passed to Task tool.
- **D-12:** Thorough defaults out-of-box: orient brief verbosity + thorough clarification, interactive eval mode, suggest-only conventions. Best first experience showing full CodeScope capabilities.
- **D-13:** No environment-specific overrides for v1. Single config.yml, no environment variants. CI/CD integration is out of scope for v1.
- **D-14:** Include `schema_version: 1` field in config.yml for future migration support.
- **D-15:** Validate config.yml against a Zod schema at load time. Clear error messages for malformed configs. Zod is already a project dependency (MCP SDK peer dep).
- **D-16:** config.yml is committed to git (tracked). Team members share CodeScope config. Individual overrides possible via global memory.
- **D-17:** Convention detection controlled by config: `conventions.detection_threshold` (default 80%) and `conventions.min_files` (default 10) control what gets flagged. Promotion to enforced still requires explicit user confirmation.

### First-Run & Install Experience
- **D-18:** On first plugin load (no config.yml exists), auto-prompt onboarding: "CodeScope isn't configured yet. Run /codescope:onboard to get started." No auto-run, no silent loading.
- **D-19:** WASM grammar files (tree-sitter-typescript.wasm, etc.) are prebuilt and bundled in the plugin package. Zero setup for users — grammars ready immediately. Eliminates tree-sitter-cli build step.
- **D-20:** Graceful degradation with clear errors at runtime. Each capability checks its dependencies independently. If SQLite fails, graph tools report "graph unavailable" while other tools still work.
- **D-21:** Create full `.claude/codescope/` directory tree eagerly during `/codescope:onboard`. User sees the complete structure immediately. Matches PLUG-03 requirement.
- **D-22:** Auto-add selective `.gitignore` inside `.claude/codescope/`. Ignore transient files (graph.db, execution/, reports/screenshots/) but track shareable files (config.yml, conventions-enforced.md).
- **D-23:** Create `~/.codescope/` and `global-memory.md` during first `/codescope:onboard` run.
- **D-24:** `codescope_status` MCP tool doubles as health check — reports config status, dependency health, last bootstrap date, and issues. No separate diagnostic command needed.

### Directory & Naming Conventions
- **D-25:** Task slugs auto-generated from task description: "Add user auth flow" → "add-user-auth-flow". Truncate at ~50 chars. No timestamp prefix, no sequential numbering.
- **D-26:** Execution artifacts scoped per-task in subdirectories: `execution/[task-slug]/` contains coordination.md and agent change reports. Old tasks preserved.
- **D-27:** Monorepo service names derived from filesystem directory names (e.g., `services/auth/` → "auth").
- **D-28:** Task artifacts accumulate, never auto-cleaned. Manual cleanup by user. Disk space is cheap, history is valuable.
- **D-29:** Usage tracking captures full task history in structured YAML/JSONL format: commands, task descriptions, outcomes, debug cycles, agent models, eval scores, timing.
- **D-30:** Verify+eval reports organized by task slug: `reports/[task-slug].md`. Overwritten on re-run.
- **D-31:** Screenshots organized per-task: `reports/screenshots/[task-slug]/`.
- **D-32:** `graph.db` lives at top level of `.claude/codescope/` (not in a subdirectory). Matches spec.
- **D-33:** Keep separate directories per spec: `orient/` for briefs, `plans/` for execution plans, `execution/` for runtime artifacts. No unified tasks/ directory.

### AST Parser Lifecycle
- **D-34:** Single Parser instance per language, recreated after every N parses (e.g., 100) to prevent memory leaks. Simple sequential approach for bootstrap.
- **D-35:** When parsing fails on a file (syntax errors, encoding issues, binary files), skip and log the file path + error. Continue with remaining files. Report skipped files in bootstrap summary.
- **D-36:** High-level API with escape hatch: primary API returns `{ imports, exports, classes, functions, variables }`. Raw tree access available for callers that need custom traversal (convention detection).
- **D-37:** Large files (>500KB or >10K lines) get shallow parsing: top-level structure only (imports, exports, class/function declarations). No descent into function bodies. Full graph data with minimal memory cost.

### Graph Schema Design
- **D-38:** File + symbol level granularity for nodes: files, classes, functions/methods, exported variables, modules. Edges: IMPORTS, CALLS, EXTENDS, IMPLEMENTS, USES_TYPE, CONTAINS.
- **D-39:** Store key metadata per node: file_path, language, LOC, last_modified timestamp, node_type. Enables fast queries without filesystem access.
- **D-40:** JSONL queue with batch insert for multi-agent writes. Sub-agents write JSONL files, batch inserter reads and inserts into SQLite. Matches single-writer pattern from STATE.md decisions.
- **D-41:** Create all three tables (nodes, edges, communities) in Phase 1. Communities table populated later by Phase 2's Risk Analyzer with Louvain results.

### Plugin Manifest & Skill Registration
- **D-42:** One skill file per skill: `skills/onboard.md`, `skills/bootstrap.md`, `skills/orient.md`, `skills/settings.md`, `skills/review-learnings.md`.
- **D-43:** Register all 5 skills in plugin.json from Phase 1. Unimplemented skills show: "This skill will be available after Phase N." Users see the full product surface.
- **D-44:** No hooks registered in Phase 1. Hooks added in phases where they're needed (Phase 7 for learning hooks). Keep Phase 1 focused on the skeleton.
- **D-45:** MCP server built with tsdown to single `dist/server.js`. `.mcp.json` points to `node dist/server.js`. Fast startup, no runtime TS compilation.

### MCP Server Behavior Before Bootstrap
- **D-46:** All 11 MCP tools registered from Phase 1. Before bootstrap, they return structured errors: `{ status: 'not_bootstrapped', message: 'Run /codescope:bootstrap first', tool: '<tool_name>' }`.
- **D-47:** `codescope_status` is the exception — it always works, even before bootstrap. Reports: config exists (y/n), bootstrap completed (y/n), last bootstrap date, graph node/edge count, dependency health.
- **D-48:** MCP tool input schemas validated strictly with Zod. Reject calls with unknown or malformed parameters. Clear errors help agents learn correct interfaces.

### Claude's Discretion
- No areas deferred to Claude's discretion — all gray areas received explicit user decisions.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Product Specification
- `CODESCOPE-SPEC-V6.md` — Full product specification. Part 2 (Architecture) defines the 5 components. Part 4 (Onboarding & Settings) defines the onboarding flow, config structure, and settings skill. Full config YAML schema at line 719.

### Build Instructions
- `CODESCOPE-BUILD-INSTRUCTIONS.md` — Environment setup, tooling installation, dependency versions, common problems.

### Project Context
- `.planning/PROJECT.md` — Vision, constraints, key decisions (thin orchestrator, filesystem coordination, WASM pinning).
- `.planning/REQUIREMENTS.md` — Phase 1 requirements: PLUG-01 through PLUG-04, ONBD-01 through ONBD-05, PARS-01 through PARS-04, GRPH-01.
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, and dependency chain.

### Technology Stack
- `CLAUDE.md` §Technology Stack — Pinned versions, compatibility matrix, what NOT to use, critical implementation notes (web-tree-sitter memory management, MCP transport, better-sqlite3 sync API).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — this is a greenfield project. No existing code to reuse.

### Established Patterns
- None — patterns will be established by this phase. The CLAUDE.md conventions section notes "Conventions not yet established."

### Integration Points
- Claude Code plugin system: plugin.json manifest, skills/ directory, .mcp.json for MCP server
- Claude Code session: AskUserQuestion for onboarding menus, Task tool for sub-agent spawning
- Filesystem: .claude/codescope/ for project data, ~/.codescope/ for global memory

</code_context>

<specifics>
## Specific Ideas

- Config format changed from spec's config.md to config.yml — pure YAML for better tooling support. All spec references to config.md should be read as config.yml.
- Parser should use shallow parsing (top-level declarations only) for large files rather than skipping them entirely — preserves graph edges while managing memory.
- All 5 skills and all 11 MCP tools registered from Phase 1, with stubs/structured errors for unimplemented features. Users and agents see the full product surface from day one.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-plugin-foundation-and-infrastructure*
*Context gathered: 2026-03-22*
