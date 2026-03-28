# Phase 11: PR Review + Impact Prediction - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md -- this log preserves the alternatives considered.

**Date:** 2026-03-28
**Phase:** 11-pr-review-impact-prediction
**Areas discussed:** Review report structure, Diff input sources, Impact prediction scope, Cross-boundary detection

---

## Review Report Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Extend structured JSON | Add sections to existing okResponse pattern (summary, files, dependency_changes, convention_violations, cross_community_changes) | ✓ |
| Narrative summary | Prose-based report format | |
| Hybrid table + narrative | Mix of structured data and narrative sections | |

**User's choice:** Extend structured JSON (recommended default)
**Notes:** User said "go with recommended options and use the GitHub as reference to how to build." Consistent with all 13 existing MCP tools using okResponse() envelope.

---

## Diff Input Sources

| Option | Description | Selected |
|--------|-------------|----------|
| Priority chain: PR > branch > working tree | PR number via gh, branch via git diff, working tree as default | ✓ |
| Working tree only | Simplest, no external dependencies | |
| Branch only | Requires explicit branch name | |

**User's choice:** Priority chain (recommended default)
**Notes:** Matches REVIEW-04 requirements exactly. gh CLI failure gracefully falls back.

---

## Impact Prediction Scope

| Option | Description | Selected |
|--------|-------------|----------|
| 4-hop reverse BFS with risk scoring | Same depth as blast_radius, includes centrality-based risk | ✓ |
| Raw dependency list only | No risk scoring, just file paths | |
| Configurable depth, no default | User must specify hops | |

**User's choice:** 4-hop reverse BFS with risk scoring (recommended default)
**Notes:** Consistent with existing blast_radius tool's 4-hop default. Same BlastRadiusNode shape for API consistency.

---

## Cross-Boundary Detection

| Option | Description | Selected |
|--------|-------------|----------|
| 3+ communities threshold | Flag when diff touches 3+ distinct Louvain communities | ✓ |
| Any cross-community | Flag any file touching a different community | |
| 5+ communities | Higher threshold, fewer flags | |

**User's choice:** 3+ communities threshold (recommended default)
**Notes:** Below 3 is normal refactoring. Edge detection compares against stored edges table. Circular dep detection only reports NEW cycles.

---

## Claude's Discretion

- Internal implementation of reverse BFS
- Exact markdown formatting of /codescope:review skill report
- Community lookup caching strategy
- Convention violation severity ordering
- Token estimation for review output

## Deferred Ideas

None -- discussion stayed within phase scope
