---
phase: 05-verification
plan: 03
subsystem: verify
tags: [runtime-verify, server-lifecycle, smoke-generator, e2e-detection, web-tree-sitter, ast-endpoint-detection]

# Dependency graph
requires:
  - phase: 05-verification
    plan: 01
    provides: "SharedTypes (RuntimeVerifyOptions, RuntimeVerifyResult, TestResult, SmokeResult, VerifyCallbacks)"
  - phase: 01-plugin-foundation
    provides: "Parser pool, web-tree-sitter lifecycle, language detection"
provides:
  - "runRuntimeVerify function: build, unit/integration tests, E2E with server lifecycle, auto-smoke"
  - "detectE2ETool: auto-detection of Playwright, Xcode, Gradle, pytest from project files"
  - "runCommand: shell command execution with exit code, stdout, stderr capture"
  - "startServer/stopServer: server lifecycle with 3 readiness strategies and process group cleanup"
  - "detectNewEndpoints: web-tree-sitter AST-based endpoint detection for Express, Next.js, Flask, FastAPI"
  - "buildSmokePrompt: LLM prompt builder for auto-smoke test generation"
affects: [05-04-mcp-tool-upgrade, 06-evaluation]

# Tech tracking
tech-stack:
  added: []
  patterns: [server-lifecycle-management, ast-endpoint-detection, build-short-circuit, tail-biased-truncation, temp-file-cleanup]

key-files:
  created:
    - src/verify/runtime-verify.ts
    - src/verify/smoke-generator.ts
    - src/verify/server-lifecycle.ts
    - tests/verify/runtime-verify.test.ts
    - tests/verify/smoke-generator.test.ts
    - tests/verify/server-lifecycle.test.ts
  modified: []

key-decisions:
  - "Reuse existing parser/languages.ts module (detectLanguage, loadLanguage, getGrammarDir) for smoke-generator web-tree-sitter integration"
  - "Server lifecycle stopServer uses real polling (500ms intervals up to 3s) with lsof force-kill fallback"
  - "LLM extraction via dispatchSmokeAgent callback reused for both test result parsing and smoke test generation"
  - "Auto-smoke writes temp files to os.tmpdir() (not project root) with try/finally cleanup"

patterns-established:
  - "Server lifecycle pattern: spawn detached process group, 3 readiness strategies, SIGTERM group kill + lsof force kill"
  - "AST endpoint detection pattern: git diff --diff-filter=A for new files, web-tree-sitter parse, framework-specific node type queries"
  - "Build short-circuit pattern: build failure sets buildFailed flag, all subsequent checks return skipped status"
  - "Tail-biased truncation: keep last N lines, prepend truncation notice"

requirements-completed: [VRFY-04, VRFY-05, VRFY-06, VRFY-07]

# Metrics
duration: 12min
completed: 2026-03-24
---

# Phase 5 Plan 3: Runtime Verify Agent Summary

**Runtime verify agent with build short-circuit, E2E auto-detection with server lifecycle management, web-tree-sitter AST-based endpoint detection for auto-smoke generation, and tail-biased LLM test output extraction**

## Performance

- **Duration:** 12 min
- **Started:** 2026-03-24T14:36:50Z
- **Completed:** 2026-03-24T14:49:43Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Implemented runtime verify agent module (runRuntimeVerify) with 5-step pipeline: build, unit tests, integration tests, E2E, auto-smoke -- build failure short-circuits all subsequent checks per D-18
- Implemented server lifecycle (startServer with 3 readiness strategies per D-15, stopServer with process group kill + lsof force kill per D-16)
- Implemented web-tree-sitter AST-based endpoint detection for Express/Koa, Next.js App Router, Next.js Pages Router, Flask, and FastAPI per D-14
- E2E auto-detection checks playwright.config, Podfile, build.gradle, conftest.py per D-11
- Auto-smoke temp files written to os.tmpdir() with try/finally cleanup per Pitfall 6

## Task Commits

Each task was committed atomically (TDD: test then feat):

1. **Task 1: Server lifecycle management + smoke generator with tests**
   - `fdf5e02` (test) - failing tests for server lifecycle and smoke generator
   - `4e66ace` (feat) - server lifecycle and smoke generator implementation, all 13 tests pass
2. **Task 2: Runtime verify agent with build short-circuit, test execution, and E2E dispatch**
   - `6025b17` (test) - failing tests for runtime verify agent
   - `e632936` (feat) - runtime verify agent implementation, all 20 tests pass

## Files Created/Modified
- `src/verify/server-lifecycle.ts` - Server start (3 readiness strategies), stop (process group kill + port verification + force kill)
- `src/verify/smoke-generator.ts` - AST-based endpoint detection via web-tree-sitter for 5 frameworks, LLM smoke prompt builder
- `src/verify/runtime-verify.ts` - Runtime verify agent: build, unit/integration tests, E2E, auto-smoke pipeline
- `tests/verify/server-lifecycle.test.ts` - 7 tests for server lifecycle
- `tests/verify/smoke-generator.test.ts` - 6 tests for smoke generator AST detection
- `tests/verify/runtime-verify.test.ts` - 20 tests for runtime verify agent

## Decisions Made
- Reused existing `src/parser/languages.ts` module (detectLanguage, loadLanguage, getGrammarDir) for smoke-generator web-tree-sitter integration rather than duplicating grammar loading logic
- Server lifecycle stopServer uses real polling intervals (500ms) with 3s max wait -- acceptable test speed tradeoff for realistic behavior
- LLM extraction via `dispatchSmokeAgent` callback reused for both test result parsing and smoke test code generation -- same callback pattern, different prompt
- Auto-smoke temp files use `os.tmpdir()` with `try/finally` cleanup to avoid polluting project root

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed vi.mock hoisting issue with web-tree-sitter mock variables**
- **Found during:** Task 1 (smoke-generator tests)
- **Issue:** vi.mock factory referenced variables (mockParser, mockParserInit) declared after the mock call, which Vitest hoists
- **Fix:** Used `vi.hoisted()` to declare mock variables in a block that runs before vi.mock factories
- **Files modified:** tests/verify/smoke-generator.test.ts
- **Verification:** All 6 smoke-generator tests pass

**2. [Rule 1 - Bug] Fixed isPortInUse to use encoding: 'utf-8' for consistent string returns**
- **Found during:** Task 1 (server-lifecycle tests)
- **Issue:** isPortInUse called execSync without encoding, returning Buffer instead of string; trim() failed on Buffer
- **Fix:** Added `{ encoding: "utf-8" }` to execSync call in isPortInUse for consistent string handling
- **Files modified:** src/verify/server-lifecycle.ts
- **Verification:** All 7 server-lifecycle tests pass including force-kill flow

---

**Total deviations:** 2 auto-fixed (1 blocking, 1 bug)
**Impact on plan:** Both fixes necessary for test correctness. No scope creep.

## Issues Encountered
- Server lifecycle stopServer tests use real timers (not fake timers) because the internal sleep() calls need to execute -- test duration is ~3.5s but acceptable
- web-tree-sitter mock required vi.hoisted() pattern due to Vitest module hoisting semantics

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness
- Runtime verify agent is ready for pipeline integration in Plan 04 (MCP tool upgrade)
- All runtime verify types, functions, and patterns are exported and testable
- Server lifecycle can be called independently for E2E testing
- Smoke generator can detect endpoints in any new files via web-tree-sitter AST
- No blockers for Plan 04

## Self-Check: PASSED

- All 6 created files exist on disk
- All 4 commit hashes verified in git log
- 56/56 tests passing (7 server-lifecycle + 6 smoke-generator + 20 runtime-verify + 23 existing)

---
*Phase: 05-verification*
*Completed: 2026-03-24*
