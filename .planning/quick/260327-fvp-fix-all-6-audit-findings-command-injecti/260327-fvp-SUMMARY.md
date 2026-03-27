---
phase: quick
plan: 260327-fvp
subsystem: security
tags: [command-injection, execFileSync, type-safety, npm-audit, web-tree-sitter]

# Dependency graph
requires: []
provides:
  - Shell-safe ast-grep invocations via execFileSync in 3 files
  - Type-safe SyntaxNode annotations in smoke-generator.ts
  - Clean npm audit (0 vulnerabilities via picomatch/brace-expansion overrides)
affects: [verify, conventions, smoke-generator]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "execFileSync array args for external CLI invocation (no shell interpolation)"
    - "SyntaxNode | null type guard pattern for web-tree-sitter children arrays"

key-files:
  created: []
  modified:
    - src/tools/verify.ts
    - src/verify/static-verify.ts
    - src/conventions/runner.ts
    - src/verify/smoke-generator.ts
    - tests/verify/static-verify.test.ts
    - package.json

key-decisions:
  - "Keep execSync for non-interpolated commands (sg --version, git diff) -- only sg scan with template literals needed fixing"
  - "Use type guard predicates (c: SyntaxNode | null): c is SyntaxNode for web-tree-sitter children find callbacks"

patterns-established:
  - "execFileSync array args: always use execFileSync('cmd', [...args]) instead of execSync(`cmd ${interpolated}`) for external CLI calls"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-03-27
---

# Quick Task 260327-fvp: Fix All 6 Audit Findings Summary

**Eliminated 3 command injection vectors via execFileSync, restored type safety with SyntaxNode in smoke-generator.ts, and resolved npm audit advisories with dependency overrides**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-27T18:28:50Z
- **Completed:** 2026-03-27T18:33:44Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- Replaced all 3 `execSync` template-literal shell commands for `sg scan` with `execFileSync` array args, eliminating command injection via shell metacharacters in file paths
- Replaced all 10 `: any` type annotations in smoke-generator.ts with `SyntaxNode` from web-tree-sitter, adding proper null guards for `(Node | null)[]` children arrays
- Added npm overrides for picomatch>=4.0.4 and brace-expansion>=1.1.13, resulting in 0 npm audit vulnerabilities
- All 848 tests across 78 test files pass; TypeScript compiles cleanly

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace execSync with execFileSync in 3 files and update test mock** - `d2af217` (fix)
2. **Task 2: Replace any types with SyntaxNode in smoke-generator.ts and add dependency overrides** - `b7eeb74` (fix)

## Files Created/Modified
- `src/tools/verify.ts` - Replaced execSync with execFileSync for sg scan invocation
- `src/verify/static-verify.ts` - Replaced execSync with execFileSync for sg scan invocation
- `src/conventions/runner.ts` - Replaced execSync with execFileSync for sg scan invocation
- `src/verify/smoke-generator.ts` - Replaced 10 `any` types with `SyntaxNode`, removed unused `Language` import, added null guards
- `tests/verify/static-verify.test.ts` - Updated mock to handle both execFileSync (array args) and execSync (string cmd)
- `package.json` - Added overrides for picomatch>=4.0.4 and brace-expansion>=1.1.13

## Decisions Made
- Kept `execSync` imported alongside `execFileSync` in verify.ts and static-verify.ts because those files still use `execSync` for non-interpolated commands (runCommand helper and git diff)
- Used type guard predicates `(c: SyntaxNode | null): c is SyntaxNode =>` for `.find()` callbacks on web-tree-sitter `children` arrays (typed as `(Node | null)[]`)
- Added `if (!node) continue;` null guards in `for...of` loops over `descendantsOfType()` results (also `(Node | null)[]`)
- Added `if (!tree) { parser.delete(); continue; }` null guard for `parser.parse()` return value

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript compilation errors from SyntaxNode type migration**
- **Found during:** Task 2 (SyntaxNode type replacement)
- **Issue:** web-tree-sitter types `children` as `(Node | null)[]` and `descendantsOfType` as `(Node | null)[]`, causing 17 TypeScript errors when replacing `any` with `SyntaxNode`
- **Fix:** Added type guard predicates for `.find()` callbacks, null guards for loop variables, and null check for `parser.parse()` return value
- **Files modified:** src/verify/smoke-generator.ts
- **Verification:** `npx tsc --noEmit` passes with zero errors; all smoke-generator tests pass
- **Committed in:** b7eeb74 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary type correctness fix -- the plan's `SyntaxNode` replacement was correct but web-tree-sitter's nullable children arrays required additional null guards.

## Issues Encountered
None beyond the deviation documented above.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None.

## Self-Check: PASSED

- All 7 files exist (6 modified + 1 SUMMARY created)
- Both task commits verified (d2af217, b7eeb74)
- execFileSync present in all 3 source files
- SyntaxNode present in smoke-generator.ts
- overrides present in package.json
- 848 tests pass across 78 test files
- TypeScript compiles with zero errors
- npm audit shows 0 vulnerabilities

---
*Quick task: 260327-fvp*
*Completed: 2026-03-27*
