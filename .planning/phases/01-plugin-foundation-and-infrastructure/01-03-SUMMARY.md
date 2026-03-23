---
phase: 01-plugin-foundation-and-infrastructure
plan: 03
subsystem: infra
tags: [web-tree-sitter, wasm, ast-parsing, enhanced-resolve, import-resolution, parser-pool, memory-management]

# Dependency graph
requires:
  - phase: 01-plugin-foundation-and-infrastructure
    provides: "Project scaffold with package.json, tsconfig.json, vitest config, paths.ts utilities"
provides:
  - "ParserPool with per-language Parser instances and automatic recreation after 100 parses"
  - "extractFromSource high-level API returning ParseResult for TS/JS/Python"
  - "parseFile convenience function with large file detection and shallow parsing"
  - "TypeScript/JavaScript import resolver using enhanced-resolve with tsconfig path aliases"
  - "Python import resolver with stdlib detection, relative imports, and project-local module probing"
  - "SupportedLanguage type and detectLanguage file extension mapper"
affects: [bootstrap-agents, knowledge-graph, convention-detection, blast-radius]

# Tech tracking
tech-stack:
  added: [web-tree-sitter@0.25.10, enhanced-resolve@5.20.1, tree-sitter-wasms@0.1.13]
  patterns: [parser-pool-lifecycle, tree-delete-finally, sync-resolver, filesystem-python-resolution]

key-files:
  created:
    - src/parser/lifecycle.ts
    - src/parser/extract.ts
    - src/parser/languages.ts
    - src/parser/index.ts
    - src/resolver/typescript.ts
    - src/resolver/python.ts
    - tests/parser/lifecycle.test.ts
    - tests/parser/extract.test.ts
    - tests/resolver/typescript.test.ts
    - tests/resolver/python.test.ts
    - grammars/.gitkeep
    - grammars/README.md
  modified:
    - package.json
    - .gitignore

key-decisions:
  - "Used tree-sitter-wasms prebuilt package instead of building WASM grammars with tree-sitter-cli (Docker not available)"
  - "Named imports from web-tree-sitter 0.25.10 (not default import) -- package uses named exports"
  - "Required useSyncFileSystemCalls: true for enhanced-resolve resolveSync to work with CachedInputFileSystem"
  - "Node type in web-tree-sitter is 'Node' not 'SyntaxNode' -- imported as alias for code clarity"

patterns-established:
  - "Parser pool lifecycle: one Parser per language, recreated after 100 parses, tree.delete() in finally block"
  - "AST extraction: walk rootNode.children for top-level nodes, switch on node.type per language"
  - "Import resolution: sync resolvers that return null on failure (never throw)"
  - "WASM grammar loading: cached Language instances, env var override for grammar directory"

requirements-completed: [PARS-01, PARS-02, PARS-03, PARS-04]

# Metrics
duration: 9min
completed: 2026-03-22
---

# Phase 1 Plan 3: AST Parser and Import Resolution Summary

**web-tree-sitter ParserPool with memory lifecycle management, structured AST extraction for TS/JS/Python, and import resolvers using enhanced-resolve (TS/JS) and filesystem probing (Python)**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-23T01:06:00Z
- **Completed:** 2026-03-23T01:15:17Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- ParserPool manages one web-tree-sitter Parser per language with automatic recreation after 100 parses to prevent memory leaks
- extractFromSource returns structured ParseResult (imports, exports, classes, functions, variables, errors) for TypeScript, JavaScript, and Python
- Large files (>500KB or >10K lines) automatically get shallow parsing (top-level declarations only)
- TS/JS import resolver uses enhanced-resolve with tsconfig path alias support, resolving relative paths, node_modules, and directory imports
- Python import resolver uses pure TypeScript filesystem-based resolution with 50-module stdlib set, dot-counting for relative imports, and .py/__init__.py probing
- All 35 tests pass across 4 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Parser pool and AST extraction** - `c6e4404` (test: failing tests RED) -> `2d6a0d6` (feat: implementation GREEN)
2. **Task 2: Import resolvers** - `366bd86` (test: failing tests RED) -> `d0b8c13` (feat: implementation GREEN)

_TDD workflow: each task has separate test (RED) and implementation (GREEN) commits._

## Files Created/Modified
- `src/parser/lifecycle.ts` - ParserPool class with per-language Parser management, auto-recreation after 100 parses
- `src/parser/extract.ts` - extractFromSource function producing ParseResult for TS/JS/Python AST extraction
- `src/parser/languages.ts` - SupportedLanguage type, WASM grammar loading with caching, file extension detection
- `src/parser/index.ts` - Public API: parseFile with large file detection, re-exports all types
- `src/resolver/typescript.ts` - TS/JS import resolution via enhanced-resolve with tsconfig path aliases
- `src/resolver/python.ts` - Python import resolution via filesystem probing with stdlib detection
- `tests/parser/lifecycle.test.ts` - 10 tests for ParserPool lifecycle management
- `tests/parser/extract.test.ts` - 12 tests for AST extraction across TS/JS/Python
- `tests/resolver/typescript.test.ts` - 6 tests for TS/JS import resolution
- `tests/resolver/python.test.ts` - 7 tests for Python import resolution
- `grammars/.gitkeep` - Placeholder for WASM grammar build artifacts
- `grammars/README.md` - Build instructions for WASM grammars
- `package.json` - Added build:grammars and copy:grammars scripts, tree-sitter dev dependencies
- `.gitignore` - Added grammars/*.wasm exclusion

## Decisions Made
- **tree-sitter-wasms prebuilt grammars:** Docker was not available to build WASM grammars with tree-sitter-cli. Used tree-sitter-wasms@0.1.13 npm package which provides prebuilt .wasm files compatible with web-tree-sitter 0.25.10. Added both build:grammars (for Docker environments) and copy:grammars (for prebuilt) npm scripts.
- **Named imports from web-tree-sitter:** The 0.25.10 package uses named exports (`import { Parser, Language } from "web-tree-sitter"`), not default exports. This differs from older documentation examples.
- **useSyncFileSystemCalls for enhanced-resolve:** `resolveSync` requires `useSyncFileSystemCalls: true` in the resolver options when using `CachedInputFileSystem`. Without it, the resolver throws "Cannot resolveSync because the fileSystem is not sync."
- **Node type alias:** web-tree-sitter exports `Node` not `SyntaxNode`. Imported as `import type { Node as SyntaxNode }` for clarity.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed web-tree-sitter import pattern**
- **Found during:** Task 1
- **Issue:** Plan specified `import Parser from "web-tree-sitter"` (default import) but web-tree-sitter 0.25.10 uses named exports
- **Fix:** Changed to `import { Parser, Language } from "web-tree-sitter"` throughout
- **Files modified:** src/parser/lifecycle.ts, src/parser/languages.ts, src/parser/extract.ts
- **Verification:** All parser tests pass, tsc --noEmit clean
- **Committed in:** 2d6a0d6 (Task 1 GREEN commit)

**2. [Rule 3 - Blocking] Fixed SyntaxNode type import**
- **Found during:** Task 1
- **Issue:** web-tree-sitter exports `Node` not `SyntaxNode`
- **Fix:** Used `import type { Node as SyntaxNode } from "web-tree-sitter"`
- **Files modified:** src/parser/extract.ts
- **Verification:** tsc --noEmit clean
- **Committed in:** 2d6a0d6 (Task 1 GREEN commit)

**3. [Rule 3 - Blocking] Fixed enhanced-resolve sync mode**
- **Found during:** Task 2
- **Issue:** `resolveSync` threw "Cannot resolveSync because the fileSystem is not sync" with default CachedInputFileSystem
- **Fix:** Added `useSyncFileSystemCalls: true` to resolver options
- **Files modified:** src/resolver/typescript.ts
- **Verification:** All 6 TS resolver tests pass
- **Committed in:** d0b8c13 (Task 2 GREEN commit)

---

**Total deviations:** 3 auto-fixed (all Rule 3 - blocking issues)
**Impact on plan:** All auto-fixes required for correct library integration. No scope creep.

## Issues Encountered
- WASM grammar build requires Docker (for Emscripten compilation). Docker was not running, so fell back to tree-sitter-wasms prebuilt package. Both build paths documented in grammars/README.md and package.json scripts.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Parser infrastructure ready for Phase 2's bootstrap agents to parse entire codebases
- Import resolvers ready for knowledge graph edge construction
- Memory lifecycle management ensures 500+ file parsing without leaks
- All 35 tests passing, TypeScript clean

## Self-Check: PASSED

All 12 created files verified present. All 4 commit hashes verified in git log.

---
*Phase: 01-plugin-foundation-and-infrastructure*
*Completed: 2026-03-22*
