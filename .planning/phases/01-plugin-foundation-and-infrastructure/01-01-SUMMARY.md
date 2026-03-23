---
phase: 01-plugin-foundation-and-infrastructure
plan: 01
subsystem: infra
tags: [typescript, plugin-manifest, mcp, vitest, tsdown, tree-sitter, better-sqlite3, graphology]

# Dependency graph
requires: []
provides:
  - "Complete project scaffold (package.json, tsconfig, vitest, tsdown configs)"
  - "Claude Code plugin manifest with 5 skill registrations"
  - "MCP server config pointing to dist/server.js"
  - "Filesystem utilities: createDirectoryTree, writeGitignore, createGlobalMemoryDir"
  - "Path constants: CODESCOPE_ROOT, CODESCOPE_DIRS, getCodescopePath, getGlobalMemoryPath"
affects: [01-02, 01-03, 01-04, 01-05, phase-2, phase-3, phase-4]

# Tech tracking
tech-stack:
  added: ["@modelcontextprotocol/sdk@^1.27.1", "better-sqlite3@^12.8.0", "web-tree-sitter@0.25.10", "zod@^3.25.0", "enhanced-resolve@^5.20.1", "tsconfig-paths@^4.2.0", "js-yaml@^4.1.1", "graphology@^0.26.0", "graphology-types@^0.24.8", "typescript@^5.7.0", "vitest@^4.1.0", "tsdown@^0.21.4", "tsx@^4.21.0"]
  patterns: ["ESM-first (type: module)", "TDD with vitest", "tsdown bundling to dist/server.js", "Selective .gitignore (track config, ignore transient)"]

key-files:
  created: ["package.json", "tsconfig.json", "vitest.config.ts", "tsdown.config.ts", ".claude-plugin/plugin.json", ".mcp.json", "skills/onboard/SKILL.md", "skills/bootstrap/SKILL.md", "skills/orient/SKILL.md", "skills/settings/SKILL.md", "skills/review-learnings/SKILL.md", "src/utils/paths.ts", "src/onboard/filesystem.ts", "tests/plugin/manifest.test.ts", "tests/onboard/filesystem.test.ts", ".gitignore"]
  modified: []

key-decisions:
  - "ESM-first with type:module in package.json and NodeNext module resolution"
  - "web-tree-sitter pinned at exact 0.25.10 (not caret range) to prevent ABI breaks"
  - "createGlobalMemoryDir accepts optional custom base path for testability without mocking os.homedir()"
  - "Selective .gitignore comments mention tracked files (config.yml, conventions-enforced.md) for developer clarity"

patterns-established:
  - "TDD pattern: RED (failing test commit) then GREEN (implementation commit) per task"
  - "Path constants centralized in src/utils/paths.ts for cross-module reuse"
  - "Filesystem utilities accept projectRoot parameter for testability with temp directories"
  - "Plugin skills in skills/{name}/SKILL.md with YAML frontmatter"

requirements-completed: [PLUG-01, PLUG-03, PLUG-04]

# Metrics
duration: 9min
completed: 2026-03-23
---

# Phase 1 Plan 1: Project Scaffold Summary

**Complete plugin scaffold with 9 core + 7 dev dependencies, 5 skill registrations, MCP config, and filesystem utilities for .claude/codescope/ directory tree creation**

## Performance

- **Duration:** 9 min
- **Started:** 2026-03-23T00:53:50Z
- **Completed:** 2026-03-23T01:02:57Z
- **Tasks:** 2
- **Files modified:** 16

## Accomplishments
- Full project scaffold: package.json with all dependencies, tsconfig, vitest, tsdown configs
- Plugin manifest registering 5 skills (onboard active, 4 stubs with Phase N availability messages)
- MCP server config using CLAUDE_PLUGIN_ROOT variable and CODESCOPE_GRAMMAR_DIR env var
- Filesystem utilities creating 7-directory tree with selective .gitignore and idempotent global memory
- 23 passing tests across 2 test files

## Task Commits

Each task was committed atomically (TDD: test then feat):

1. **Task 1: Project scaffolding** - `76027a4` (test: RED) + `50e26ad` (feat: GREEN)
2. **Task 2: Filesystem utilities** - `1ade5ee` (test: RED) + `1cf6597` (feat: GREEN)

## Files Created/Modified
- `package.json` - Project manifest with 9 core + 7 dev dependencies
- `tsconfig.json` - ES2022 target, NodeNext module, strict mode
- `vitest.config.ts` - Test configuration with 30s timeout
- `tsdown.config.ts` - Build config targeting src/server.ts, ESM output, better-sqlite3 external
- `.claude-plugin/plugin.json` - Plugin manifest with 5 skills
- `.mcp.json` - MCP server config for dist/server.js
- `skills/onboard/SKILL.md` - Active onboard skill with prerequisites and flow outline
- `skills/bootstrap/SKILL.md` - Stub: "available after Phase 2"
- `skills/orient/SKILL.md` - Stub: "available after Phase 4"
- `skills/settings/SKILL.md` - Stub: "available after Phase 7"
- `skills/review-learnings/SKILL.md` - Stub: "available after Phase 7"
- `src/utils/paths.ts` - Path constants (CODESCOPE_ROOT, CODESCOPE_DIRS) and helper functions
- `src/onboard/filesystem.ts` - createDirectoryTree, writeGitignore, createGlobalMemoryDir
- `tests/plugin/manifest.test.ts` - 14 tests validating manifest, package.json, skills, MCP config
- `tests/onboard/filesystem.test.ts` - 9 tests validating directory creation, .gitignore rules, global memory
- `.gitignore` - Root .gitignore for node_modules and dist

## Decisions Made
- Used ESM-first approach with type:module and NodeNext resolution throughout
- Pinned web-tree-sitter at exact 0.25.10 (no caret) to prevent ABI version drift
- Made createGlobalMemoryDir accept optional custom base path instead of mocking os.homedir()
- Added .gitignore comments listing tracked files for developer awareness

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed .gitignore test assertion for comment content**
- **Found during:** Task 2 (filesystem utilities)
- **Issue:** Test asserted .gitignore should not contain "conventions-enforced.md" anywhere, but it appeared in a comment explaining tracked files
- **Fix:** Changed assertion to check only non-comment lines (actual gitignore rules) don't include config.yml or conventions-enforced.md
- **Files modified:** tests/onboard/filesystem.test.ts
- **Verification:** All 9 filesystem tests pass
- **Committed in:** 1cf6597 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix in test assertion)
**Impact on plan:** Minor test refinement. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Project scaffold complete with all dependencies installed
- Plugin manifest and MCP config ready for Claude Code plugin system
- Filesystem utilities ready for onboarding flow (Plan 05)
- Path constants available for all subsequent plans in this phase
- src/server.ts (MCP server entry point) will be created in Plan 02

## Self-Check: PASSED

All 16 created files verified present. All 4 task commits verified in git log.

---
*Phase: 01-plugin-foundation-and-infrastructure*
*Completed: 2026-03-23*
