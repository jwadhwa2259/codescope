# CodeScope Codebase Audit Report

**Date:** 2026-03-27 (updated post-remediation)
**Project:** CodeScope v0.1.0
**Tech Stack:** TypeScript, Node.js 22+, MCP SDK, better-sqlite3, web-tree-sitter, graphology, ast-grep
**Total LOC:** ~21,700 (source) + ~20,000 (tests)
**Files:** 92 source, 78 test files

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 0 |
| HIGH     | 0 |
| MEDIUM   | 0 |
| LOW      | 0 |
| **Total** | **0** |

**Health Score: 100/100 — Grade A**

All 6 findings from the initial audit have been remediated:
- 3 command injection vectors eliminated (`execSync` -> `execFileSync` with array args)
- 10 `any` types replaced with proper `SyntaxNode` typing
- 2 dependency advisories resolved via package.json overrides
- 848 tests pass, TypeScript compiles cleanly, `npm audit` reports 0 vulnerabilities

---

## Phase 1: Project Discovery

| Metric | Value |
|--------|-------|
| Primary Language | TypeScript |
| Source Files | 92 (.ts) |
| Test Files | 78 (.test.ts) |
| Source LOC | 21,694 |
| Test LOC | 20,048 |
| Test:Source Ratio | 0.92:1 |
| Dependencies (runtime) | 12 |
| Dependencies (dev) | 11 |
| Framework | MCP Server (StdioServerTransport) |

**Architecture:** Modular TypeScript project organized by domain — `bootstrap/`, `orient/`, `verify/`, `eval/`, `debug/`, `execution/`, `learning/`, `agents/`, `parser/`, `graph/`, `conventions/`, `tools/`, `config/`, `onboard/`, `resolver/`, `utils/`. Each domain has matching test directories. MCP tools are registered in `src/tools/`. Sub-agent scripts live in `src/*/run-*.ts` (CLI entry points that output JSON to stdout/stderr).

---

## Phase 2: Security Scan

### No Issues Found

- **Command injection:** All `sg scan` invocations use `execFileSync` with argument arrays — shell interpolation bypassed
- **Hardcoded secrets:** None detected
- **SQL injection:** All SQLite queries use `db.prepare()` with static SQL strings or parameterized queries — safe
- **XSS:** No browser-rendered code
- **CORS:** Not applicable (CLI/MCP tool, no HTTP server)
- **Sensitive data logging:** Console output is structured JSON for sub-agent communication — by design

### Dependencies

`npm audit` reports **0 vulnerabilities**. Package.json overrides pin `picomatch>=4.0.4` and `brace-expansion>=1.1.13` to resolve transitive advisories from dev dependencies.

---

## Phase 3: Code Structure Analysis

### Largest Source Files

| File | Lines | Assessment |
|------|-------|------------|
| `src/agents/researcher.ts` | 648 | Single responsibility: project overview generation. Clean. |
| `src/eval/eval-agent.ts` | 635 | Single responsibility: eval prompt assembly, chunking, scoring. Clean. |
| `src/parser/extract.ts` | 604 | Single responsibility: AST extraction (imports, exports, classes, functions). Clean. |
| `src/tools/verify.ts` | 594 | Runs multiple check types but all are "verification" — cohesive. Clean. |
| `src/orient/research.ts` | 568 | Single responsibility: research topic extraction and prompt building. Clean. |
| `src/agents/scout.ts` | 563 | Single responsibility: service manifest discovery. Clean. |
| `src/orient/planner.ts` | 528 | Single responsibility: execution plan generation. Clean. |

No god files detected. All large files maintain single-responsibility focus despite their size.

### Duplication

No significant file name duplication detected in source.

---

## Phase 4: Performance Scan

### Database Queries

All SQLite access uses `better-sqlite3`'s synchronous `prepare().get()`/`prepare().all()` pattern with static SQL strings. No string-built queries. The `loadGraphFromSQLite` function (`src/graph/analytics.ts:48-95`) loads all nodes and edges into an in-memory graphology graph — this full-table scan is by design for graph analysis and bounded by the project size being analyzed.

### No N+1 Patterns

No database-query-inside-loop patterns detected. Graph queries load data once, then iterate in-memory.

### No Frontend Code

Project is a CLI/MCP tool with no browser-rendered UI. Frontend performance checks not applicable.

---

## Phase 5: Reliability Check

### Type Safety

| Location | Count | Notes |
|----------|-------|-------|
| `src/tools/status.ts` | 2 | SQLite result casting — acceptable |
| `src/verify/runtime-verify.ts` | 1 | Error handling — acceptable |
| `src/tools/verify.ts` | 1 | Error handling — acceptable |
| `src/eval/eval-agent.ts` | 1 | Error handling — acceptable |
| **Total (src/)** | **5** | All acceptable uses (error casts, SQLite row typing) |

No `@ts-ignore`, `@ts-expect-error`, or `@ts-nocheck` directives found anywhere in the codebase.

### Error Handling

- No empty catch blocks found
- All catch blocks either return default values, rethrow, or log structured errors
- Sub-agent entry points (`run-*.ts`) properly catch and output JSON errors to stderr

### Test Coverage

Excellent test infrastructure:
- 78 test files covering 92 source files (85% file coverage)
- Near 1:1 source-to-test LOC ratio (21.7K source : 20K test)
- Test framework: vitest 4.1.0
- Tests organized to mirror source directory structure
- All 848 tests passing

### Logging

No formal logging framework (winston, pino, etc.). Console output is structured JSON for MCP communication and sub-agent stdio protocol. This is appropriate for a CLI plugin — the MCP transport handles logging concerns. Not flagged.

---

## Remediation Log

All 6 findings from the initial audit (2026-03-27) have been fixed:

| # | Original Finding | Severity | Fix | Commit |
|---|-----------------|----------|-----|--------|
| 1 | Command Injection in `src/tools/verify.ts:144` | MEDIUM | Replaced `execSync` template literal with `execFileSync` array args | d2af217 |
| 2 | Command Injection in `src/verify/static-verify.ts:98` | MEDIUM | Replaced `execSync` template literal with `execFileSync` array args | d2af217 |
| 3 | Command Injection in `src/conventions/runner.ts:128` | MEDIUM | Replaced `execSync` template literal with `execFileSync` array args | d2af217 |
| 4 | Type Safety in `src/verify/smoke-generator.ts` (10 `any`) | MEDIUM | Replaced all with `SyntaxNode` from web-tree-sitter | b7eeb74 |
| 5 | picomatch@4.0.3 HIGH advisory (dev-only) | LOW | Added `overrides` in package.json: `picomatch>=4.0.4` | b7eeb74 |
| 6 | brace-expansion@1.1.12 MODERATE advisory (dev-only) | LOW | Added `overrides` in package.json: `brace-expansion>=1.1.13` | b7eeb74 |

---

## Health Score Breakdown

| Starting Score | 100 |
|----------------|-----|
| CRITICAL (x25) | -0 |
| HIGH (x10) | -0 |
| MEDIUM (x3) | -0 |
| LOW (x1) | -0 |
| **Final Score** | **100 — Grade A** |

---

## Overall Assessment

CodeScope is a well-structured, well-tested TypeScript project with clean architecture and zero audit findings. The codebase demonstrates strong engineering practices:

- **Modular design** with clear domain boundaries
- **Excellent test coverage** (85% file coverage, near 1:1 LOC ratio, 848 tests passing)
- **Minimal type safety escapes** (5 `any` in 21.7K lines — all acceptable error/SQL casts)
- **No hardcoded secrets**, no SQL injection, no command injection, no empty catch blocks
- **Proper error handling** throughout with structured JSON output
- **Zero dependency vulnerabilities** (`npm audit` clean)
- **Shell-safe command execution** — all `sg` CLI invocations use `execFileSync` with array arguments
