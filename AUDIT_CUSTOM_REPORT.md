# CodeScope Codebase Audit Report

**Date:** 2026-03-31 (updated post-remediation)
**Previous Audit:** 2026-03-29 (all findings remediated)
**Project:** CodeScope v0.1.0
**Tech Stack:** TypeScript 5.9, Node.js >=22, MCP SDK 1.27.1, better-sqlite3, web-tree-sitter 0.25.10, graphology, Hono
**Source Files:** 178 (`src/`) + 129 test files
**Lines of Code:** ~800K total

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | ~~1~~ 0 | Fixed |
| MEDIUM | ~~5~~ 0 | Fixed |
| LOW | 0 | - |
| **Total** | **0** | **All remediated** |

**Health Score: 100 / 100 (Grade A)** _(was 75/C before remediation)_

**All findings remediated.**

**Remediated (quick task 260331-8m5):**
- ~~`path-to-regexp` ReDoS vulnerability~~ -- patched via `npm audit fix` (`de71760`)
- ~~`src/dashboard/client/panels/graph.ts` god file (542-line function)~~ -- decomposed into 5 helpers (`d26ca90`)
- ~~`src/dashboard/client/panels/heatmap.ts` god file (481-line function)~~ -- decomposed into 4 helpers (`d26ca90`)
- ~~`src/dashboard/client/panels/blast-radius.ts` god file (480-line function)~~ -- decomposed into 3 helpers (`c4def75`)
- ~~`src/dashboard/client/panels/trends.ts` god file (461-line function)~~ -- decomposed into 4 helpers (`c4def75`)
- ~~`src/dashboard/client/panels/command.ts` god file (452-line function)~~ -- decomposed into 4 helpers (`c4def75`)

**Overall Assessment:** The codebase is well-structured with strong fundamentals. All audit findings from both 2026-03-29 and 2026-03-31 scans have been remediated. Zero security vulnerabilities. Parameterized queries used consistently, no hardcoded secrets, no injection vectors. Test coverage ratio is excellent (129 test files for 178 source files). No TS suppressions (@ts-ignore etc.) anywhere. `npm audit` reports 0 vulnerabilities.

---

## Phase 1: Project Discovery

- **Framework:** MCP server (stdio transport) + Hono dashboard server + CLI (commander)
- **Language:** TypeScript 5.9, ESM modules
- **Database:** better-sqlite3 (synchronous, local)
- **Build:** tsdown (Rolldown-powered)
- **Test:** vitest 4.1.0
- **Key modules:** bootstrap, orient, execution, verify, eval, tools (11 MCP tools), dashboard (sigma.js visualization), CLI, agents, parser, learning, enforcement, conventions
- **25 well-organized modules** under `src/`
- **No `.env` files** committed to git

---

## Phase 2: Security Scan

### 2.1 Hardcoded Secrets
**CLEAN** -- No hardcoded API keys, passwords, or tokens found.

### 2.2 Injection Vulnerabilities
**CLEAN**
- All database access uses parameterized queries (`db.prepare().get/all/run()` with `?` placeholders)
- Static DDL in `migration.ts` uses `db.exec()` with hardcoded SQL strings only
- `spawn("sh", ["-c", command])` in `src/verify/server-lifecycle.ts:80` receives command from internal project config, not untrusted input
- No XSS vectors (`dangerouslySetInnerHTML`, `.innerHTML = userInput`)
- No `eval()` with dynamic input

### 2.3 Authentication & Authorization
N/A -- Local CLI tool with stdio MCP transport. No HTTP auth surface.

### 2.4 ~~Dependency Vulnerabilities~~ FIXED (`de71760`)

| # | Severity | Package | Issue | Status |
|---|----------|---------|-------|--------|
| 1 | ~~**HIGH**~~ | `path-to-regexp` (transitive via Hono) | Two ReDoS vulnerabilities: [GHSA-j3q9-mxjg-w52f](https://github.com/advisories/GHSA-j3q9-mxjg-w52f), [GHSA-27v5-c462-wpq7](https://github.com/advisories/GHSA-27v5-c462-wpq7) | **FIXED** -- `npm audit fix` applied, 0 vulnerabilities remaining |

### 2.5 Sensitive Data Handling
**CLEAN** -- No passwords, tokens, or PII in log output.

---

## Phase 3: Code Structure Analysis

### ~~God Files~~ FIXED (`d26ca90`, `c4def75`)

All five dashboard panel god files have been decomposed into focused helper functions. Each file retains exactly 1 export (`render*Panel`), with all helpers as module-private functions.

| # | Severity | File | Helpers Extracted | Status |
|---|----------|------|-------------------|--------|
| 2 | ~~**MEDIUM**~~ | `src/dashboard/client/panels/graph.ts` | 5 helpers: buildGraphDom, initSigmaRenderer, setupForceAtlasLayout, bindGraphInteractions, subscribeGraphUpdates | **FIXED** |
| 3 | ~~**MEDIUM**~~ | `src/dashboard/client/panels/heatmap.ts` | 4 helpers: buildHeatmapDom, renderHeatmapCells, bindSortControls, showCellTooltip | **FIXED** |
| 4 | ~~**MEDIUM**~~ | `src/dashboard/client/panels/blast-radius.ts` | 3 helpers: buildBlastRadiusDom, fetchAndRenderDiff, renderImpactGraph | **FIXED** |
| 5 | ~~**MEDIUM**~~ | `src/dashboard/client/panels/trends.ts` | 4 helpers: buildTrendsDom, transformTrendData, renderTrendChart, subscribeTrendUpdates | **FIXED** |
| 6 | ~~**MEDIUM**~~ | `src/dashboard/client/panels/command.ts` | 4 helpers: buildTerminalDom, parseCommandInput, executeTerminalCommand, formatCommandResult | **FIXED** |

All 1158 baseline tests pass after refactoring (verified via `npx vitest run`).

### Dead Code
**No issues found.** 505 exported symbols across 178 files -- proportional and well-consumed.

### Duplication
13 files named `types.ts` across different modules -- expected pattern (module-local type definitions).

### Deep Nesting
**No issues found.** Only 2 instances of moderate nesting in `src/onboard/detect.ts`, below the 5-level threshold.

---

## Phase 4: Performance Scan

### Database Performance
**No issues found.**
- Parameterized queries used consistently
- No N+1 query patterns detected
- Internal `.all()` calls in `src/artifacts/` and `src/graph/` are bounded by knowledge graph size
- Dashboard API queries include `LIMIT` clauses (e.g., `readiness.ts:59` uses `LIMIT 100`)

### Frontend Performance
N/A -- Dashboard is a developer tool. Static imports of sigma.js and graphology are appropriate.

### API Response Performance
No unbounded API responses found.

---

## Phase 5: Reliability Check

### Error Handling
**No issues found.**
- No empty catch blocks in `src/`
- MCP tool handlers use consistent `errorResponse()` / `okResponse()` helpers
- `tree.delete()` properly called in `finally` blocks (`src/parser/extract.ts:767`)

### Type Safety
**Excellent.** Only **12 `any` usages** across all 178 source files. No file has 3+ instances. Zero `@ts-ignore`, `@ts-expect-error`, or `@ts-nocheck` directives.

### Test Coverage
- **129 test files** for 178 source files (72% ratio)
- Broad coverage: tools, bootstrap, orient, verify, eval, graph, parser, hooks, conventions, CLI, agents, dashboard, resolver, learning, enforcement, session, execution, classifier, skills, debug
- vitest 4.1.0 configured

### Logging & Observability
- 58 `console.log/debug/info` calls in `src/` -- appropriate for a CLI tool
- No structured logging framework -- acceptable for a local-only plugin

---

## Verified False Positives (Not Reported)

- **`db.exec()` in migration.ts:** Static SQL strings, no user input interpolation
- **`spawn("sh", ["-c", command])` in server-lifecycle.ts:** Command from internal config, not untrusted input
- **`readFileSync` in MCP tool handlers:** Stdio transport is single-threaded; sync reads don't block concurrent requests
- **`innerHTML` in dashboard panels:** Internal graph data from SQLite, not untrusted user input
- **console.log (58 instances):** CLI tool -- console output is the expected interface
- **13 duplicate `types.ts` filenames:** Module-local types, not copy-paste duplication

---

## Quick Wins

All quick wins have been completed:

1. ~~Run `npm audit fix` to patch `path-to-regexp`~~ -- DONE (`de71760`)
2. ~~Extract `renderGraphPanel` into 5 sub-functions~~ -- DONE (`d26ca90`)
3. ~~Extract `renderHeatmapPanel` into 4 sub-functions~~ -- DONE (`d26ca90`)
4. ~~Extract `renderBlastRadiusPanel` into 3 sub-functions~~ -- DONE (`c4def75`)
5. ~~Extract `renderTrendsPanel` + `renderCommandPanel`~~ -- DONE (`c4def75`)

---

## What's Working Well

This codebase is notably clean for its size and complexity:

- **Zero security vulnerabilities** -- both first-party code and dependency tree are clean
- **Exceptional type safety** -- 12 `any` across 178 source files, zero TS suppressions
- **Strong test coverage** -- 129 test files with broad module coverage (72% ratio)
- **Proper memory management** -- tree-sitter cleanup in `finally` blocks
- **Clean architecture** -- 25 focused modules with clear separation of concerns
- **All audit findings fully remediated** -- across two audit cycles (2026-03-29 and 2026-03-31)
- **No dead code, no empty catch blocks, no deep nesting**
- **Dependency management** -- appropriate version pinning (web-tree-sitter 0.25.10, not 0.26.x)
- **Dashboard panels now well-structured** -- each panel uses focused helper functions instead of monolithic render functions

---

## Outdated Dependencies (Informational)

| Package | Current | Latest | Notes |
|---------|---------|--------|-------|
| `@modelcontextprotocol/sdk` | 1.27.1 | 1.29.0 | Minor update, safe |
| `tsdown` | 0.21.4 | 0.21.7 | Patch update |
| `typescript` | 5.9.3 | 6.0.2 | Major -- evaluate before upgrading |
| `vitest` | 4.1.0 | 4.1.2 | Patch update |
| `web-tree-sitter` | 0.25.10 | 0.26.7 | **DO NOT upgrade** -- 0.26.x breaks WASM ABI |
| `zod` | 3.25.76 | 4.3.6 | Major -- wait for MCP SDK v2 |

---

## Remediation History

| Date | Audit | Findings | Remediated | Commits |
|------|-------|----------|------------|---------|
| 2026-03-29 | Initial | 4 (1 HIGH, 1 MEDIUM, 2 LOW) | 4/4 | `bb315a5`, `911f5e7`, `9917ba4` |
| 2026-03-31 | Follow-up | 6 (1 HIGH, 5 MEDIUM) | 6/6 | `de71760`, `d26ca90`, `c4def75` |
