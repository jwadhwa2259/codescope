# CodeScope Codebase Audit Report

**Date:** 2026-03-29
**Project:** CodeScope v0.1.0
**Tech Stack:** TypeScript, Node.js 22+, MCP SDK, better-sqlite3, graphology, web-tree-sitter, Hono
**Total Source Files:** 163 (src/) + 114 test files
**Lines of Code:** ~483K (including tests and config)

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH | 1 |
| MEDIUM | 1 |
| LOW | 2 |

**Health Score: 85/100 (B)**

**Top 3 Issues:**
1. `src/tools/review.ts` is a 736-line god file with 8 distinct responsibilities
2. Unbounded `SELECT *` query in dashboard readiness API with no LIMIT
3. Excessive `any` type usage in dashboard client panels (2 files)

**Overall Assessment:** The codebase is well-structured with strong fundamentals. No security vulnerabilities were found. Parameterized queries are used consistently, no hardcoded secrets, no injection vectors. Test coverage ratio is excellent (114 test files for 163 source files). No TS suppressions (@ts-ignore etc.) anywhere. The issues found are limited to code organization and minor type safety gaps in the dashboard client.

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

### Finding 1: God File

| | |
|---|---|
| **Severity** | HIGH |
| **Category** | God File |
| **File** | `src/tools/review.ts:1-736` |

**What:** This 736-line file contains 8 distinct responsibilities:
1. Git diff resolution (lines 70-235): `parseFilesFromDiff`, `getWorkingDirChanges`, `detectDefaultBranch`, `resolveDiff`
2. Convention parsing (lines 241-301): `parseConventions`
3. SQLite community queries (lines 306-334): `getFileCommunities`
4. SQLite edge queries (lines 339-374): `getEdgesForFiles`
5. SQLite node ID queries (lines 379-399): `getNodeIdsForFiles`
6. Graph cycle detection (lines 410-479): `detectCycles`
7. Main review handler (lines 494-699): `handleReview`
8. MCP tool registration (lines 711-736): `registerReviewTool`

**Why it matters:** Files this large with this many responsibilities are hard to test in isolation, prone to merge conflicts, and difficult to navigate. The diff resolution logic (parsing git output, branch validation) is reused from `detect-changes.ts` (the file itself notes "duplicated from detect-changes.ts for isolation" at line 54).

**Fix:** Extract into focused modules:
```
src/tools/review/
  diff-resolver.ts    # resolveDiff, parseFilesFromDiff, getWorkingDirChanges, detectDefaultBranch
  convention-parser.ts # parseConventions (or reuse from conventions.ts)
  graph-queries.ts    # getFileCommunities, getEdgesForFiles, getNodeIdsForFiles
  cycle-detector.ts   # detectCycles
  handler.ts          # handleReview
  register.ts         # registerReviewTool
```

---

## Phase 4: Performance Scan

### Finding 2: Unbounded Query

| | |
|---|---|
| **Severity** | MEDIUM |
| **Category** | Unbounded Query |
| **File** | `src/dashboard/api/readiness.ts:57` |

**What:** `SELECT * FROM readiness_history ORDER BY timestamp ASC` retrieves the entire readiness history table with no LIMIT clause. This is loaded into memory as an array and sent in a JSON API response.

**Why it matters:** As readiness snapshots accumulate over time (one per bootstrap run), this query will return an ever-growing dataset. For long-lived projects, this means increasing memory usage and larger API responses.

**Fix:** Add a LIMIT or time-window filter:
```typescript
// Option A: Limit to last N snapshots
.prepare("SELECT * FROM readiness_history ORDER BY timestamp ASC LIMIT 100")

// Option B: Time window (last 30 days)
.prepare("SELECT * FROM readiness_history WHERE timestamp > datetime('now', '-30 days') ORDER BY timestamp ASC")
```

---

## Phase 5: Reliability Check

### Finding 3: Type Safety - command.ts

| | |
|---|---|
| **Severity** | LOW |
| **Category** | Type Safety |
| **File** | `src/dashboard/client/panels/command.ts` |

**What:** 4 instances of `any` type usage:
- Lines 97, 120: `catch (err: any)` -- use `unknown` and narrow with `instanceof Error`
- Line 321: `result: any` parameter -- define a `ReviewResult` interface
- Line 435: `result: any` parameter -- define an `ImpactResult` interface

**Fix:**
```typescript
// Replace catch (err: any) with:
catch (err: unknown) {
  const message = err instanceof Error ? err.message : 'Review failed';
  showReviewDrawer(filePath, { error: message });
}

// Define result types:
interface ReviewResult { summary?: object; error?: string; }
interface ImpactResult { affected_count?: number; error?: string; }
```

### Finding 4: Type Safety - blast-radius.ts

| | |
|---|---|
| **Severity** | LOW |
| **Category** | Type Safety |
| **File** | `src/dashboard/client/panels/blast-radius.ts` |

**What:** 4 instances of `any`/`as any`:
- Line 185: `catch (err: any)`
- Lines 457, 504, 505: `(svg as any).__cleanupZoom` -- attaching a cleanup function to an SVG element via dynamic property

**Fix:**
```typescript
// For the SVG cleanup pattern, use a WeakMap:
const svgCleanup = new WeakMap<SVGElement, () => void>();
svgCleanup.set(svg, () => { ... });
// Later:
svgCleanup.get(svg)?.();
```

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

1. **Add LIMIT to readiness history query** (`src/dashboard/api/readiness.ts:57`) -- 1 line change, prevents unbounded memory growth
2. **Replace `catch (err: any)` with `catch (err: unknown)`** (command.ts:97,120 + blast-radius.ts:185) -- 3 lines, improves type safety
3. **Define result interfaces for dashboard callbacks** (command.ts:321,435) -- replace `any` with typed interfaces already known from API responses
4. **Use WeakMap for SVG cleanup** (blast-radius.ts:457) -- eliminates `as any` cast for dynamic property attachment
5. **Extract diff resolution from review.ts** -- the file itself documents it as "duplicated from detect-changes.ts", making it the lowest-hanging fruit for the god file refactor
