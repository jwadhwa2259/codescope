# Phase 10: Auto-Injection - Context

**Gathered:** 2026-03-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Claude receives relevant codebase context (conventions, blast radius, danger zones) automatically on every file edit via Claude Code hooks -- invisible to the user, bounded to 500 tokens per file to avoid context bloat.

Requirements: INJECT-01, INJECT-02, INJECT-03, INJECT-04, INJECT-05

</domain>

<decisions>
## Implementation Decisions

### Hook Data Access Strategy
- **D-01:** Hook scripts read **pre-computed artifact files** from `.claude/codescope/` (text/markdown files). No SQLite imports, no graphology, no web-tree-sitter in hooks. This resolves the STATE.md blocker ("hook daemon vs MCP server HTTP endpoint") -- neither is needed.
- **D-02:** Artifact files are plain text/markdown -- fast `fs.readFileSync` reads with ~50ms total hook startup. Keeps well within the 5-10s hook timeout.
- **D-03:** No sidecar HTTP server, no daemon process. Hooks are stateless scripts that read files and return JSON.

### Injection Content & Budget (INJECT-03)
- **D-04:** 500-token budget per file allocated via **priority queue**: danger zones (highest) > conventions > blast radius summary > general context (lowest). If a file is a danger zone with 5 conventions, danger zone warning gets tokens first, conventions fill remaining budget, blast radius may be truncated or omitted.
- **D-05:** Injection format is **structured bullet points** -- scannable by Claude and human-readable in reasoning output. Not prose paragraphs, not raw JSON.
- **D-06:** PreToolUse injection (INJECT-01): file-specific conventions, blast radius summary, danger zone warnings composed into a single `message` field in the hook's approve response.
- **D-07:** PostToolUse validation (INJECT-02): checks the written file against conventions and warns on blast radius expansion. Returns warnings as `message` in the hook response.

### Trigger Rules & Visibility (INJECT-04)
- **D-08:** Injection triggers when file has **centrality > 0.3 OR detected conventions** (medium aggressiveness per INJECT-04). Files below both thresholds produce zero injection overhead -- hook returns bare approve with no message.
- **D-09:** Injection is **silent context** -- delivered as the hook's `message` field in the approve response. Visible in Claude's reasoning/context but not surfaced as a separate user-facing warning or notification.
- **D-10:** PostToolUse warnings (convention violations, blast radius expansion) use the same silent message mechanism -- Claude sees them, user sees them in reasoning if they look.

### Artifact Refresh Pipeline
- **D-11:** Artifacts regenerated on **every bootstrap AND every incremental reparse**. No separate background process or cron. Piggybacks on Phase 9's existing staleness detection + rebuild pipeline.
- **D-12:** Artifact generation is a **post-rebuild step** -- after the MCP server's incremental reparse completes, updated artifacts are written to disk. Hooks always read the latest artifacts.
- **D-13:** Artifact files include: per-file danger zone index, per-file convention summary, per-file blast radius snapshot. Exact file format and naming are Claude's discretion.

### Graceful Degradation (INJECT-05)
- **D-14:** When bootstrap hasn't run or graph.db doesn't exist, hooks **silently no-op** -- return bare approve with no message. No errors, no warnings, no degraded experience.
- **D-15:** When artifact files are missing (e.g., partial bootstrap), hooks skip that artifact category and inject whatever is available. Never fail due to missing artifacts.

### Claude's Discretion
- Exact artifact file format and naming convention (e.g., `danger-zones.json` vs `danger-zones.md`, per-file vs single index file)
- Hook script internal structure (single script vs separate PreToolUse/PostToolUse scripts)
- Token counting implementation (character-based approximation vs tiktoken-equivalent)
- Whether to cache parsed artifact data within a single hook invocation or re-read per file

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Hook System Architecture
- `.planning/research/ARCHITECTURE.md` -- Hook handler script patterns (lines 96-150), Anti-Pattern 2 (hooks must not import MCP server modules), Anti-Pattern 3 (no full graph recomputation on delta)
- `.planning/REQUIREMENTS.md` -- INJECT-01 through INJECT-05 acceptance criteria

### Existing Graph Infrastructure (Phase 9)
- `src/graph/cache.ts` -- `getGraph()` with staleness-aware cache, `CachedGraph` interface with centralities map
- `src/graph/analytics.ts` -- `blastRadius()` BFS, `DangerZoneEntry` type, `computeCentrality()`, `CentralityResult`
- `src/graph/incremental.ts` -- `rebuildStaleFiles()` post-rebuild hook point for artifact generation
- `src/graph/file-hash.ts` -- `getStaleFiles()` for staleness detection
- `src/graph/database.ts` -- `openDatabase()` with WAL mode + busy_timeout pragma

### Existing Convention & Readiness Data
- `src/tools/conventions.ts` -- Convention parsing from markdown, `ParsedConvention` type
- `src/tools/blast-radius.ts` -- `handleBlastRadius()` MCP tool handler (reuse query patterns)
- `src/agents/convention-detector.ts` -- Convention detection during bootstrap
- `src/agents/risk-analyzer.ts` -- Danger zone computation during bootstrap
- `src/conventions/types.ts` -- Convention type definitions

### Plugin Infrastructure
- `.claude-plugin/plugin.json` -- Current plugin manifest (needs hooks.json addition)
- `src/config/schema.ts` -- `ConfigSchema` (may need injection config extension)
- `src/config/defaults.ts` -- Default config values

### External References
- GitHub: `WiseLibs/better-sqlite3` -- WAL concurrent reader patterns (hooks read while MCP server writes)
- GitHub: `graphology/graphology` -- Node attribute access patterns for centrality/community data
- Claude Code plugin docs -- `hooks.json` format, PreToolUse/PostToolUse hook contracts, `message` field in approve response

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `blastRadius()` in `src/graph/analytics.ts` -- BFS traversal for blast radius computation, reuse query pattern for artifact generation
- `DangerZoneEntry` type in `src/graph/analytics.ts` -- Already has filePath, inDegree, communitiesTouched, riskScore, reasons
- `ParsedConvention` type in `src/tools/conventions.ts` -- Convention structure with name, adoption_pct, confidence, category, files, evidence
- `CachedGraph.centralities` in `src/graph/cache.ts` -- Pre-computed centrality map (nodeId -> 0-1 score) for trigger threshold checks
- `okResponse()`/`errorResponse()` in `src/tools/helpers.ts` -- Response envelope pattern (reference for hook response format)
- `isBootstrapped()` in `src/tools/helpers.ts` -- Bootstrap guard pattern (reuse for graceful degradation)

### Established Patterns
- MCP tools use `getGraph()` from cache with staleness-aware queries -- artifact generation should hook into the same flow
- Bootstrap agents write markdown artifacts to `.claude/codescope/` -- hooks read from the same location
- All config via `config.yml` validated by Zod schema in `src/config/schema.ts`
- Convention detection produces `conventions.md` with structured format (name, adoption%, confidence, files, evidence)

### Integration Points
- `src/graph/incremental.ts` `rebuildStaleFiles()` -- post-rebuild hook point for artifact regeneration
- `src/bootstrap/orchestrator.ts` -- bootstrap completion triggers for full artifact generation
- `.claude-plugin/plugin.json` -- needs hooks.json reference added
- New `hooks/` directory needed under `.claude-plugin/` or project root with hook scripts

</code_context>

<specifics>
## Specific Ideas

- Reference GitHub repos (better-sqlite3, graphology) for implementation patterns, consistent with Phase 9 approach
- Hook scripts should be minimal -- read artifacts, compose message, return JSON. All heavy computation happens in the MCP server during reparse/bootstrap.

</specifics>

<deferred>
## Deferred Ideas

None -- discussion stayed within phase scope

</deferred>

---

*Phase: 10-auto-injection*
*Context gathered: 2026-03-28*
