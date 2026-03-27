---
phase: 3
slug: bootstrap-synthesis-and-mcp-server
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-03-23
validated: 2026-03-27
---

# Phase 3 -- Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~4 seconds (850 tests) |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 4 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | GRPH-05 | unit | `npx vitest run tests/graph/cache.test.ts` | yes | green |
| 03-01-02 | 01 | 1 | MCP-10 | unit | `npx vitest run tests/tools/helpers.test.ts` | yes | green |
| 03-01-03 | 01 | 1 | MCP-10 | unit | `npx vitest run tests/tools/status.test.ts` | yes | green |
| 03-02-01 | 02 | 2 | MCP-02 | unit | `npx vitest run tests/tools/recall.test.ts` | yes | green |
| 03-02-02 | 02 | 2 | MCP-05 | unit | `npx vitest run tests/tools/conventions.test.ts` | yes | green |
| 03-02-03 | 02 | 2 | MCP-09 | unit | `npx vitest run tests/tools/readiness-tool.test.ts` | yes | green |
| 03-02-04 | 02 | 2 | MCP-12 | unit | `npx vitest run tests/tools/service-map.test.ts` | yes | green |
| 03-03-01 | 03 | 2 | MCP-03 | unit | `npx vitest run tests/tools/graph-query.test.ts` | yes | green |
| 03-03-02 | 03 | 2 | MCP-04 | unit | `npx vitest run tests/tools/blast-radius.test.ts` | yes | green |
| 03-03-03 | 03 | 2 | MCP-08 | unit | `npx vitest run tests/tools/search.test.ts` | yes | green |
| 03-03-04 | 03 | 2 | MCP-11 | unit | `npx vitest run tests/tools/detect-changes.test.ts` | yes | green |
| 03-04-01 | 04 | 2 | BOOT-14 | unit | `npx vitest run tests/bootstrap/readiness.test.ts` | yes | green |
| 03-04-02 | 04 | 2 | BOOT-14 | unit | `npx vitest run tests/bootstrap/incremental.test.ts` | yes | green |
| 03-04-03 | 04 | 2 | BOOT-11 | integration | `npx vitest run tests/bootstrap/orchestrator.test.ts` | yes | green |
| 03-04-04 | 04 | 2 | BOOT-12 | unit | `npx vitest run tests/bootstrap/orchestrator.test.ts -t "squad cap"` | yes | green |
| 03-04-05 | 04 | 2 | BOOT-13 | unit | `npx vitest run tests/bootstrap/synthesis.test.ts` | yes | green |
| 03-04-06 | 04 | 2 | BOOT-15 | unit | `npx vitest run tests/bootstrap/orchestrator.test.ts -t "conventions-enforced"` | yes | green |
| 03-04-07 | 04 | 2 | BOOT-16 | unit | `npx vitest run tests/bootstrap/orchestrator.test.ts -t "timing"` | yes | green |
| 03-04-08 | 04 | 2 | GRPH-06 | unit | `npx vitest run tests/bootstrap/synthesis.test.ts -t "cross-service"` | yes | green |
| 03-05-01 | 05 | 3 | MCP-06 | unit | `npx vitest run tests/tools/orient.test.ts` | yes | green |
| 03-05-02 | 05 | 3 | MCP-07 | unit | `npx vitest run tests/tools/verify.test.ts` | yes | green |
| 03-05-03 | 05 | 3 | MCP-01 | integration | `npx vitest run tests/tools/mcp-tool-registration.test.ts` | yes | green |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [x] `tests/graph/cache.test.ts` -- graph cache TTL, invalidation, lazy loading (GRPH-05) -- 5 tests, all green
- [x] `tests/tools/helpers.test.ts` -- response builders, staleness calc (MCP-10) -- 12 tests, all green
- [x] `tests/tools/recall.test.ts` -- topic matching, artifact reading (MCP-02) -- 6 tests, all green
- [x] `tests/tools/graph-query.test.ts` -- neighbors, paths, communities queries (MCP-03) -- 6 tests, all green
- [x] `tests/tools/blast-radius.test.ts` -- BFS, hop classification, node-not-found (MCP-04) -- 6 tests, all green
- [x] `tests/tools/conventions.test.ts` -- file/module filtering (MCP-05) -- 6 tests, all green
- [x] `tests/tools/orient.test.ts` -- keyword extraction, graph walk, brief generation (MCP-06) -- 7 tests, all green
- [x] `tests/tools/verify.test.ts` -- convention compliance (MCP-07) -- 10 tests, all green
- [x] `tests/tools/search.test.ts` -- graph-based symbol/file/relationship search (MCP-08) -- 8 tests, all green
- [x] `tests/tools/readiness-tool.test.ts` -- structured score response (MCP-09) -- 6 tests, all green
- [x] `tests/tools/detect-changes.test.ts` -- git diff parsing, risk classification (MCP-11) -- 7 tests, all green
- [x] `tests/tools/service-map.test.ts` -- service list, dependencies, single-project (MCP-12) -- 6 tests, all green
- [x] `tests/bootstrap/orchestrator.test.ts` -- pipeline sequencing, monorepo, squad cap, timing, D-30 confirmation (BOOT-11/12/15/16) -- 14 tests, all green
- [x] `tests/bootstrap/synthesis.test.ts` -- cross-service deps, merged conventions (BOOT-13, GRPH-06) -- 6 tests, all green
- [x] `tests/bootstrap/readiness.test.ts` -- 4-dimension scoring, grading, delta tracking (BOOT-14) -- 12 tests, all green
- [x] `tests/bootstrap/incremental.test.ts` -- git diff detection, threshold, --force (BOOT-14) -- 6 tests, all green
- [x] `tests/tools/status.test.ts` -- D-17 response format wrapper verified (MCP-10) -- 15 tests, all green
- [x] `tests/tools/mcp-tool-registration.test.ts` -- all 11 tools registered on McpServer (MCP-01) -- 2 tests, all green

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bootstrap completes in <5min for 100K LOC | BOOT-16 | Requires real large codebase | Run `/codescope:bootstrap` on a 100K+ LOC project, verify timing output |
| MCP tool discovery via Claude Code | MCP-01 | Requires live MCP client | Start server via `.mcp.json`, verify tools appear in Claude Code |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s (actual: ~4s)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-03-27 -- All 143 Phase 3 tests green across 19 test files. MCP-01 gap filled with explicit tool registration count test.
