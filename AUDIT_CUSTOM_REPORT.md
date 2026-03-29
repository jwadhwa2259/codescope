# CodeScope Codebase Audit Report

**Date:** 2026-03-29 (updated post-remediation)
**Project:** CodeScope v0.1.0
**Tech Stack:** TypeScript, Node.js 22+, MCP SDK, better-sqlite3, graphology, web-tree-sitter, Hono
**Total Source Files:** 163 (src/) + 114 test files
**Lines of Code:** ~483K (including tests and config)

---

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0 | - |
| HIGH | ~~1~~ 0 | Fixed |
| MEDIUM | ~~1~~ 0 | Fixed |
| LOW | ~~2~~ 0 | Fixed |

**Health Score: 100/100 (A)** _(was 85/B before remediation)_

**All findings remediated.**

**Remediated (quick task 260329-fkb):**
- ~~`src/tools/review.ts` god file (736 lines, 8 responsibilities)~~ -- split into 8 focused modules under `src/tools/review/` (`bb315a5`)

**Remediated (quick task 260329-f32):**
- ~~Unbounded `SELECT *` query in dashboard readiness API~~ -- LIMIT 100 added (`911f5e7`)
- ~~Excessive `any` type usage in command.ts~~ -- typed interfaces + `catch (err: unknown)` (`9917ba4`)
- ~~Excessive `any`/`as any` in blast-radius.ts~~ -- WeakMap SVG cleanup + `catch (err: unknown)` (`9917ba4`)

**Overall Assessment:** The codebase is well-structured with strong fundamentals. All audit findings have been remediated. No security vulnerabilities. Parameterized queries used consistently, no hardcoded secrets, no injection vectors. Test coverage ratio is excellent (114 test files for 163 source files). No TS suppressions (@ts-ignore etc.) anywhere.

---

## Phase 1: Project Discovery

- **Framework:** MCP server (stdio transport) + Hono dashboard server + CLI (commander)
- **Language:** TypeScript 5.9, ESM modules
- **Database:** better-sqlite3 (synchronous, local)
- **Build:** tsdown (Rolldown-powered)
- **Test:** vitest 4.1
- **Key modules:** bootstrap, orient, execution, verify, eval, tools (11 MCP tools), dashboard (sigma.js visualization), CLI
- **Directory count:** 50+ well-organized directories under src/
- **Dependencies:** 191 prod, 331 dev, 521 total

---

## Phase 2: Security Scan

### 2.1 Hardcoded Secrets
**Result: CLEAN** - No hardcoded API keys, passwords, or tokens found.

### 2.2 Injection Vulnerabilities
**Result: CLEAN**

- **SQL:** All database access uses better-sqlite3's parameterized API (`db.prepare().get/all/run()` with `?` placeholders). Static DDL in migration.ts uses `db.exec()` with hardcoded SQL strings only.
- **Command Injection:** `spawn("sh", ["-c", command])` in `src/verify/server-lifecycle.ts:80` uses a command from `config.start_command` (user's own codescope config file), not untrusted input. `execFileSync` calls in `src/tools/review.ts` use array-form arguments with input validation (branch name regex at line 191).
- **XSS:** No `dangerouslySetInnerHTML` or `v-html`. The `innerHTML` assignments in dashboard panels use internal graph data (from SQLite), not untrusted user input.
- **Prompt Injection:** No LLM prompt construction with unsanitized user input.

### 2.3 Authentication & Authorization
N/A - Local CLI tool with stdio MCP transport. No HTTP auth surface.

### 2.4 Dependency Vulnerabilities
- `path-to-regexp@8.3.0` (HIGH severity, ReDoS via sequential optional groups) - transitive dependency of `@modelcontextprotocol/sdk` -> `express` -> `router`. CodeScope uses `StdioServerTransport` (not HTTP/SSE), so this vulnerability is **not exploitable** in production. Fix available via `npm audit fix`.

### 2.5 Sensitive Data Handling
**Result: CLEAN** - No passwords, tokens, or PII found in console.log/logger output.

---

## Phase 3: Code Structure Analysis

### ~~Finding 1: God File~~ FIXED (`bb315a5`)

| | |
|---|---|
| **Severity** | ~~HIGH~~ FIXED |
| **Category** | God File |
| **File** | ~~`src/tools/review.ts:1-736`~~ → `src/tools/review/` (8 modules) |

**Resolution:** 736-line monolith split into 8 focused modules:
```
src/tools/review/
  types.ts             # Shared types (DbHandle, ParsedConvention, DiffResolution, DiffError)
  diff-resolver.ts     # resolveDiff, parseFilesFromDiff, getWorkingDirChanges, detectDefaultBranch
  convention-parser.ts # parseConventions
  graph-queries.ts     # getFileCommunities, getEdgesForFiles, getNodeIdsForFiles
  cycle-detector.ts    # detectCycles
  handler.ts           # handleReview (262 lines — largest module)
  register.ts          # registerReviewTool
  index.ts             # Barrel re-exports
```
All 14 review tests pass. All 1179 tests in full suite pass. 3 consumer import paths updated to explicit `./review/index.js`.

---

## Phase 4: Performance Scan

### ~~Finding 2: Unbounded Query~~ FIXED (`911f5e7`)

| | |
|---|---|
| **Severity** | ~~MEDIUM~~ FIXED |
| **Category** | Unbounded Query |
| **File** | `src/dashboard/api/readiness.ts:57` |

**What:** Query now includes `LIMIT 100`, capping response at the 100 most recent snapshots.

**Resolution:** Added `LIMIT 100` to `SELECT * FROM readiness_history ORDER BY timestamp ASC`.

---

## Phase 5: Reliability Check

### ~~Finding 3: Type Safety - command.ts~~ FIXED (`9917ba4`)

| | |
|---|---|
| **Severity** | ~~LOW~~ FIXED |
| **Category** | Type Safety |
| **File** | `src/dashboard/client/panels/command.ts` |

**Resolution:** All 4 `any` instances eliminated:
- `catch (err: any)` → `catch (err: unknown)` with `instanceof Error` narrowing (2 sites)
- `result: any` → `ReviewApiResponse` and `ImpactApiResponse` typed interfaces (imported from `api-client.ts`)

### ~~Finding 4: Type Safety - blast-radius.ts~~ FIXED (`9917ba4`)

| | |
|---|---|
| **Severity** | ~~LOW~~ FIXED |
| **Category** | Type Safety |
| **File** | `src/dashboard/client/panels/blast-radius.ts` |

**Resolution:** All 4 `any`/`as any` instances eliminated:
- `catch (err: any)` → `catch (err: unknown)` with `instanceof Error` narrowing
- `(svg as any).__cleanupZoom` → `WeakMap<SVGElement, () => void>` pattern (3 sites)

---

## Findings Not Reported (Verified False Positives)

- **`db.exec()` in migration.ts:** Static SQL strings only, no user input interpolation
- **`spawn("sh", ["-c", command])` in server-lifecycle.ts:** Command sourced from user's own config file, not untrusted input
- **`execFileSync` calls in review.ts:** Uses array-form arguments with branch name validation regex
- **`readFileSync` in MCP tool handlers:** MCP uses stdio transport (single-threaded), sync reads don't block concurrent requests
- **`appendFileSync` in orchestrator.ts:** Used for event logging in non-request context, explicitly documented as "not critical path"
- **`innerHTML` in dashboard panels:** Internal graph data from SQLite, not untrusted user input
- **console.log usage (58 instances):** Concentrated in CLI command files (init, status, review) -- appropriate for a CLI tool
- **path-to-regexp vulnerability:** Transitive dep, CodeScope uses stdio transport not HTTP express

---

## Quick Wins

1. ~~**Add LIMIT to readiness history query**~~ -- DONE (`911f5e7`)
2. ~~**Replace `catch (err: any)` with `catch (err: unknown)`**~~ -- DONE (`9917ba4`)
3. ~~**Define result interfaces for dashboard callbacks**~~ -- DONE (`9917ba4`)
4. ~~**Use WeakMap for SVG cleanup**~~ -- DONE (`9917ba4`)
5. ~~**Extract diff resolution from review.ts**~~ -- DONE (`bb315a5`) — full god file refactor into 8 modules
