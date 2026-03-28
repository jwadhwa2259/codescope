# Phase 10: Auto-Injection - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 10-auto-injection
**Areas discussed:** Hook data access strategy, Injection content & budget, Trigger rules & visibility, Artifact refresh pipeline

---

## Hook Data Access Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Pre-computed artifact files | Hooks read .claude/codescope/ text files. ~50ms startup, no DB dependency, no connection conflicts. Recommended by ARCHITECTURE.md Anti-Pattern 2. | ✓ |
| Lightweight SQLite reader | Hook scripts open graph.db read-only (WAL mode). ~150ms startup, always fresh but heavier native addon loading. | |
| MCP tool call via HTTP | Sidecar HTTP server alongside MCP server. Most accurate but adds process management complexity, port allocation. | |

**User's choice:** Pre-computed artifact files (recommended default)
**Notes:** User asked for recommended defaults across all areas. Resolves STATE.md blocker: "hook daemon vs MCP server HTTP endpoint" -- neither needed.

---

## Injection Content & Budget

| Option | Description | Selected |
|--------|-------------|----------|
| Priority queue (danger > conventions > blast radius > general) | 500-token budget allocated by priority. Danger zones get tokens first, conventions fill remaining, blast radius may be truncated. | ✓ |
| Equal allocation | Split 500 tokens evenly across categories. Simpler but may waste budget on low-value context. | |
| Single-category injection | Pick the most relevant single category per file. Simplest but loses multi-signal value. | |

**User's choice:** Priority queue with structured bullet point format (recommended default)
**Notes:** Format is structured bullet points -- scannable by Claude, human-readable in reasoning output. Not prose, not raw JSON.

---

## Trigger Rules & Visibility

| Option | Description | Selected |
|--------|-------------|----------|
| Silent context, medium aggressiveness | Centrality > 0.3 OR detected conventions. Message in approve response, visible in reasoning only. | ✓ |
| Visible warnings, high aggressiveness | Inject for all bootstrapped files. Show as distinct warnings to user. | |
| Silent context, conservative | Only danger zones (top 5% centrality). Minimal noise but misses conventions. | |

**User's choice:** Silent context, medium aggressiveness per INJECT-04 (recommended default)
**Notes:** Zero overhead for files below threshold. Injection delivered as hook message field in approve response.

---

## Artifact Refresh Pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| Piggyback on existing infrastructure | Regenerate on every bootstrap + incremental reparse. Post-rebuild step. No separate process. | ✓ |
| Separate background watcher | fs.watch on source files, regenerate artifacts independently. More responsive but adds process complexity. | |
| On-demand in hooks | Hook scripts compute artifacts on the fly from DB. Fresh but slow, violates Anti-Pattern 2. | |

**User's choice:** Piggyback on existing infrastructure (recommended default)
**Notes:** Phase 9's staleness detection + rebuild already keeps DB fresh. Artifact generation is just a post-rebuild step added to that pipeline.

---

## Claude's Discretion

- Exact artifact file format and naming convention
- Hook script internal structure (single vs separate scripts)
- Token counting implementation
- Parsed artifact caching within hook invocation

## Deferred Ideas

None -- discussion stayed within phase scope
