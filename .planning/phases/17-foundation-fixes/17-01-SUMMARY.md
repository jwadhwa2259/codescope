---
phase: 17-foundation-fixes
plan: 01
subsystem: parser
tags: [tree-sitter, commonjs, require, module-exports, ast]

# Dependency graph
requires: []
provides:
  - "CJS require() extraction as ImportInfo objects"
  - "CJS module.exports/exports.* extraction as ExportInfo objects"
  - "extractCJSRequire, extractCJSExport, extractBareRequire functions in extract.ts"
affects: [graph-builder, incremental, import-resolution]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CJS extraction follows same variable_declarator -> call_expression -> identifier('require') pattern from tree-sitter grammar"
    - "Re-export detection: module.exports = require('x') generates both ImportInfo and ExportInfo"

key-files:
  created: []
  modified:
    - src/parser/extract.ts
    - tests/parser/extract.test.ts

key-decisions:
  - "Only extract static require() calls with string literal arguments; dynamic require(variable) is skipped per REQUIREMENTS.md"
  - "Bare require('side-effect') produces ImportInfo with empty specifiers (still creates dependency edge)"
  - "module.exports = require('other') produces both an import and a default export"

patterns-established:
  - "CJS extraction functions named extractCJSRequire/extractCJSExport/extractBareRequire parallel existing extractTSImport/extractTSExportStatement naming"

requirements-completed: [GRAPH-02, GRAPH-03]

# Metrics
duration: 2min
completed: 2026-03-30
---

# Phase 17 Plan 01: CJS Parser Extraction Summary

**CJS require() and module.exports extraction via tree-sitter AST with 10 new test cases covering default, destructured, bare, re-export, and dynamic patterns**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-30T21:07:37Z
- **Completed:** 2026-03-30T21:09:29Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments
- Parser now extracts `const foo = require('bar')` as ImportInfo with isDefault=true
- Parser now extracts `const { a, b } = require('bar')` as ImportInfo with named specifiers
- Parser now extracts bare `require('side-effect')` as ImportInfo with empty specifiers
- Parser now extracts `module.exports = X` as ExportInfo with name="default", kind="default"
- Parser now extracts `exports.foo = X` as ExportInfo with name="foo", kind="variable"
- Parser detects `module.exports = require('other')` re-export pattern producing both import and export
- Dynamic `require(variable)` correctly skipped (not statically analyzable)
- Mixed ESM+CJS files correctly extract both import types

## Task Commits

Each task was committed atomically (TDD flow):

1. **Task 1 RED: Failing CJS extraction tests** - `9041b4e` (test)
2. **Task 1 GREEN: CJS extraction implementation** - `7023cf7` (feat)

## Files Created/Modified
- `src/parser/extract.ts` - Added extractCJSRequire(), extractCJSExport(), extractBareRequire() functions; integrated into TS/JS switch statement via lexical_declaration and expression_statement cases
- `tests/parser/extract.test.ts` - Added "CommonJS extraction" describe block with 10 test cases

## Decisions Made
- Only static require() with string literal arguments extracted; dynamic require(variable) skipped per REQUIREMENTS.md scope
- Bare require('side-effect') produces import with empty specifiers -- these still represent dependency edges
- module.exports = require('other') produces both ImportInfo and ExportInfo for graph completeness

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all extraction functions are fully implemented and wired.

## Issues Encountered

- Vitest 4.x does not support the `-x` flag (used `--bail=1` instead) -- minor CLI difference
- 7 pre-existing failures in dashboard/api.test.ts (3) and plugin/manifest.test.ts (4) are unrelated to this plan's changes

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CJS extraction is ready for the graph builder (Plan 02) to consume via ParseResult.imports/exports
- The resolver null-check fix (Plan 02 GRAPH-04) is the next step to produce actual graph edges from these extracted imports

## Self-Check: PASSED

- All key files exist on disk
- Both commits (9041b4e, 7023cf7) verified in git log
- All acceptance criteria verified: extractCJSRequire, extractCJSExport, expression_statement case, CommonJS test describe block
