# Phase 9: Graph Foundation + Debt Tracking - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-27
**Phase:** 09-graph-foundation-debt-tracking
**Areas discussed:** Staleness detection, Incremental reparse, v1→v2 migration, Trends & history

---

## Staleness Detection

### Q1: When should staleness checks run?

| Option | Description | Selected |
|--------|-------------|----------|
| Every MCP tool call | Check file hashes before every tool response. Guarantees fresh data but adds latency per call. | ✓ |
| First call after idle period | Check once after configurable idle gap, then serve cached for rapid calls. | |
| On-demand + file watcher | Use fs.watch to detect changes in real-time, mark affected files dirty. | |

**User's choice:** Every MCP tool call (Recommended)
**Notes:** None

### Q2: How should file changes be detected?

| Option | Description | Selected |
|--------|-------------|----------|
| Content hash (SHA-256) | Hash file contents. 100% reliable. Slower (~1-5ms per file). | ✓ |
| mtime + size | Compare modification time and size. Very fast (<0.1ms). Rare edge cases. | |
| Git status | Use git diff against stored commit hash. Fast but misses untracked files. | |

**User's choice:** Content hash (SHA-256)
**Notes:** None

### Q3: How many files should be hash-checked per MCP call?

| Option | Description | Selected |
|--------|-------------|----------|
| Queried files only | Only hash-check files relevant to the current tool query. | ✓ |
| All source files every call | Full sweep on every call. Guarantees complete freshness. | |
| Git diff shortcut + fallback hash | Quick git status first, then hash only candidates. | |

**User's choice:** Queried files only (Recommended)
**Notes:** None

### Q4: Should stale files block the response until reparsed?

| Option | Description | Selected |
|--------|-------------|----------|
| Block and reparse first | Reparse stale files before returning results. User never sees outdated data. | ✓ |
| Return stale + async reparse | Return current data with staleness flag, trigger background reparse. | |

**User's choice:** Block and reparse first (Recommended)
**Notes:** None

---

## Incremental Reparse

### Q1: How should file graph data be updated?

| Option | Description | Selected |
|--------|-------------|----------|
| Delete-and-rebuild per file | Delete all nodes/edges for changed file, re-parse, insert fresh. | ✓ |
| Diff-based patching | Compare old AST vs new AST, apply targeted inserts/updates/deletes. | |
| You decide | Let Claude pick based on existing code. | |

**User's choice:** Delete-and-rebuild per file (Recommended)
**Notes:** None

### Q2: How should orphaned graph data be cleaned up?

| Option | Description | Selected |
|--------|-------------|----------|
| Cascade from nodes | ON DELETE CASCADE handles it at SQL level. | ✓ |
| Explicit application cleanup | Application code queries and deletes edges before nodes. | |
| You decide | Let Claude pick. | |

**User's choice:** Cascade from nodes (Recommended)
**Notes:** None

---

## v1→v2 Migration

**User's choice:** Go with recommended — auto-migrate in place on database open. Fall back to re-bootstrap on failure.
**Notes:** User asked to go with recommended options for remaining areas. Reference GitHub repos for implementation patterns.

---

## Trends & History

**User's choice:** Go with recommended — event-driven snapshots per bootstrap/incremental update. Three period comparisons (previous, 7-day, 30-day).
**Notes:** User asked to go with recommended options for remaining areas.

---

## Claude's Discretion

- file_hash storage strategy (new column vs. separate table)
- Schema version detection mechanism
- Centrality recomputation strategy after incremental reparse

## Deferred Ideas

None — discussion stayed within phase scope
