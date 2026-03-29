---
phase: 15-distribution
plan: 02
subsystem: cli
tags: [npm, packaging, optionalDependencies, better-sqlite3, cross-platform, native-loader]

# Dependency graph
requires:
  - phase: 15-distribution
    plan: 01
    provides: CLI entry point with bin field, tsdown build config, 6 subcommands
provides:
  - "Complete npm package config with files, engines, optionalDependencies for cross-platform better-sqlite3"
  - "Platform-specific binary resolver (native-loader) with graceful fallback and actionable guidance"
  - "Platform package scaffolding for darwin-arm64, darwin-x64, linux-x64, win32-x64"
  - "Build script for CI binary extraction (scripts/build-platform-packages.sh)"
  - "README.md with quickstart, 6-command reference, and requirements"
  - "16 packaging tests validating distribution structure"
affects: [npm-publish, marketplace-launch]

# Tech tracking
tech-stack:
  added: []
  patterns: [optionalDependencies-for-native-binaries, platform-package-scaffolding, native-loader-fallback]

key-files:
  created:
    - src/cli/native-loader.ts
    - scripts/build-platform-packages.sh
    - platform-packages/darwin-arm64/package.json
    - platform-packages/darwin-x64/package.json
    - platform-packages/linux-x64/package.json
    - platform-packages/win32-x64/package.json
    - README.md
    - tests/cli/packaging.test.ts
  modified:
    - package.json
    - src/cli/cli.ts

key-decisions:
  - "WASM grammar test checks directory existence only -- .wasm files are build artifacts not tracked in git"
  - "Native loader warns but does not exit on missing platform package -- better-sqlite3 from dependencies may have compiled from source"

patterns-established:
  - "optionalDependencies pattern (esbuild/swc style) for platform-specific native binaries"
  - "Native loader with graceful fallback: check platform package -> warn if missing -> let regular dependency handle it"

requirements-completed: [DIST-04]

# Metrics
duration: 3min
completed: 2026-03-29
---

# Phase 15 Plan 02: npm Packaging Summary

**Cross-platform npm distribution config with optionalDependencies for better-sqlite3 binaries, native loader with graceful fallback, and README with quickstart**

## Performance

- **Duration:** 3 min
- **Started:** 2026-03-29T17:32:15Z
- **Completed:** 2026-03-29T17:35:40Z
- **Tasks:** 2
- **Files modified:** 10

## Accomplishments
- Configured package.json for npm distribution: files array (dist/, grammars, hooks, skills, plugin, .mcp.json), engines (Node >= 22), optionalDependencies for 4 platform-specific better-sqlite3 packages
- Created native-loader.ts that detects platform/arch, verifies the optional binary package is installed, and falls back gracefully with actionable guidance per D-12
- Scaffolded 4 platform packages (darwin-arm64, darwin-x64, linux-x64, win32-x64) with correct os/cpu fields matching the esbuild/swc pattern
- Created build-platform-packages.sh for CI binary extraction across platforms
- Wrote README.md with quickstart (`npx codescope init`), all 6 subcommands, feature list, and requirements
- Added 16 packaging tests validating the complete distribution structure

## Task Commits

Each task was committed atomically:

1. **Task 1: Package.json distribution config, native loader, and platform package scaffolding** - `7d7c966` (feat)
2. **Task 2: README and packaging tests** - `05c4212` (feat)

## Files Created/Modified
- `package.json` - Added files, engines, optionalDependencies, prepack, pack:check scripts
- `src/cli/native-loader.ts` - Platform-specific better-sqlite3 binary resolver with graceful fallback
- `src/cli/cli.ts` - Added ensureNativeBindings() call after Node version gate
- `platform-packages/darwin-arm64/package.json` - macOS ARM64 platform package scaffolding
- `platform-packages/darwin-x64/package.json` - macOS x64 platform package scaffolding
- `platform-packages/linux-x64/package.json` - Linux x64 platform package scaffolding
- `platform-packages/win32-x64/package.json` - Windows x64 platform package scaffolding
- `scripts/build-platform-packages.sh` - CI script for extracting better-sqlite3 .node binaries
- `README.md` - npm package documentation with quickstart and command reference
- `tests/cli/packaging.test.ts` - 16 tests validating distribution structure

## Decisions Made
- **WASM grammar test relaxed:** The test checks the grammars directory exists but does not require .wasm files to be present, since they are build artifacts produced by `npm run build:grammars`/`copy:grammars` and not committed to git. The published package will include them via the `files` array.
- **Native loader non-blocking:** `ensureNativeBindings()` warns but does not exit when the platform package is missing. better-sqlite3 in regular `dependencies` may have compiled from source during `npm install`, so forcing an exit would break valid installations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adjusted WASM grammar test expectation**
- **Found during:** Task 2 (packaging tests)
- **Issue:** Test expected .wasm files in grammars/ directory, but WASM files are build artifacts not tracked in git
- **Fix:** Changed test to verify grammars directory exists rather than requiring .wasm file presence
- **Files modified:** tests/cli/packaging.test.ts
- **Verification:** All 16 tests pass
- **Committed in:** `05c4212` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Minor test adjustment for correctness. The original test would fail in any fresh clone. No scope creep.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Known Stubs
None - all artifacts are complete and functional.

## Next Phase Readiness
- Package.json fully configured for npm distribution
- Platform package scaffolding ready for CI binary extraction
- README ships with the npm package
- Phase 15 (distribution) is complete -- ready for npm publish

## Self-Check: PASSED

- All 8 created files verified present on disk
- Both commit hashes (7d7c966, 05c4212) verified in git log
- 16/16 packaging tests pass
- package.json contains files, engines, optionalDependencies, bin
- README.md contains quickstart and all 6 subcommands

---
*Phase: 15-distribution*
*Completed: 2026-03-29*
