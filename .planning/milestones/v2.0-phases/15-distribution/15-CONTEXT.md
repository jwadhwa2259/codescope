# Phase 15: Distribution - Context

**Gathered:** 2026-03-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Deliver `npx codescope init` install experience and npm package for marketplace launch. Users can install and set up CodeScope with a single command — project detection, config creation, bootstrap, and Claude Code plugin wiring all happen automatically. CLI subcommands expose key features outside of Claude Code context.

</domain>

<decisions>
## Implementation Decisions

### Init Experience
- **D-01:** Auto-detect everything (project type, language, monorepo, frameworks) using existing `src/onboard/detect.ts` logic, show what was found, single confirmation ("Look right? [Y/n]"), then run bootstrap and show summary. No multi-step wizard.
- **D-02:** Output uses colored step indicators (checkmarks, spinners) showing progress through each phase: detect → config → bootstrap → plugin wiring → summary.
- **D-03:** Support `--json` flag for CI/scripted usage — machine-readable output, no colors, no interactive prompts.

### CLI Subcommands
- **D-04:** Subcommands are thin wrappers over existing code, not reimplementations. Commands: `init`, `bootstrap`, `viz`, `review`, `install-hooks`, `status`.
- **D-05:** `codescope status` is the health check diagnostic — shows readiness score, last bootstrap time, staleness, hooks installed, dashboard running, plugin config status.
- **D-06:** Help text is minimal: one line per subcommand in main help, `--help` per subcommand for details.

### Claude Code Auto-Setup
- **D-07:** If `.claude-plugin/` doesn't exist, generate it fully wired (plugin.json, skills, hooks, .mcp.json). If it already exists, warn and skip: "Plugin already configured. Run `codescope init --force` to regenerate." Never silently overwrite.

### Cross-Platform Packaging
- **D-08:** Use `optionalDependencies` pattern (like esbuild/swc) for platform-specific better-sqlite3 packages (`@codescope/better-sqlite3-darwin-arm64`, etc.). npm/pnpm downloads only the right binary.
- **D-09:** WASM grammars are cross-platform — bundle in the npm package `files` array. No postinstall scripts.
- **D-10:** Publish as unscoped `codescope` on npm. Platform-specific sqlite packages are scoped (`@codescope/better-sqlite3-*`).

### Compatibility & Error Handling
- **D-11:** Fail fast on Node <22 with clear error message at CLI entry point. Check Claude Code availability when auto-setup is attempted.
- **D-12:** If better-sqlite3 prebuilds fail, give specific guidance ("No prebuilt binary for your platform — run `npm install` with a C compiler available") rather than cryptic native addon errors.

### README & Marketplace
- **D-13:** Ship concise README with npm package: what it does (2 sentences + dashboard screenshot via VIZ-08 export), quickstart (`npx codescope init`), subcommand reference table.

### Claude's Discretion
- CLI framework choice (commander, yargs, or minimal process.argv parsing) — pick whatever fits best
- Exact spinner/progress library — pick what works well with Node 22+ ESM
- Internal code organization for CLI entry point

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Code to Reuse
- `src/onboard/detect.ts` — Project detection logic (language, framework, monorepo)
- `src/onboard/defaults.ts` — Default configuration values
- `src/onboard/filesystem.ts` — Filesystem operations for onboard
- `src/config/loader.ts` — Config loading logic
- `src/config/writer.ts` — Config writing logic
- `src/config/schema.ts` — Config schema/validation
- `src/server.ts` — MCP server entry point (builds to dist/server.mjs)
- `src/dashboard/server.ts` — Dashboard server entry point
- `src/enforcement/pre-commit-check.ts` — Pre-commit hook script

### Build & Package Config
- `tsdown.config.ts` — Multi-entry build configuration
- `package.json` — Current package config (no bin entry yet, better-sqlite3 external)
- `.claude-plugin/plugin.json` — Plugin manifest structure
- `.mcp.json` — MCP server config template with `${CLAUDE_PLUGIN_ROOT}` variable

### Requirements
- `.planning/REQUIREMENTS.md` §Distribution — DIST-01 through DIST-04

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/onboard/detect.ts` — Full project detection (language, monorepo, frameworks) — direct reuse for `init`
- `src/onboard/defaults.ts` + `src/config/writer.ts` — Config creation pipeline already exists
- `src/dashboard/server.ts` — Dashboard launch logic for `codescope viz` subcommand
- `src/enforcement/pre-commit-check.ts` — Hook installation for `codescope install-hooks`
- `tsdown.config.ts` — Already handles multi-entry builds; add CLI entry point here

### Established Patterns
- ESM-first (`"type": "module"` in package.json)
- tsdown bundles with better-sqlite3 as external
- MCP server uses `${CLAUDE_PLUGIN_ROOT}` variable for path resolution
- WASM grammars loaded via `CODESCOPE_GRAMMAR_DIR` env var

### Integration Points
- `package.json` needs `bin` field pointing to CLI entry
- `tsdown.config.ts` needs CLI entry added to build
- `.mcp.json` template used during auto-setup generation
- `.claude-plugin/plugin.json` template used during auto-setup generation

</code_context>

<specifics>
## Specific Ideas

- Init output should look like step-by-step progress with checkmarks/spinners (not a wall of text)
- `codescope status` should be the "run this first when something seems off" command
- Dashboard screenshots from VIZ-08 export mode should be used in the npm README
- Platform-specific packages follow the esbuild/swc naming pattern

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 15-distribution*
*Context gathered: 2026-03-29*
