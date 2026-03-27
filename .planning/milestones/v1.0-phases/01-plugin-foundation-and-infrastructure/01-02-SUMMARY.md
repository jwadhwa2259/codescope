---
phase: 01-plugin-foundation-and-infrastructure
plan: 02
subsystem: infra
tags: [mcp, zod, yaml, config, tools, typescript]

# Dependency graph
requires:
  - phase: 01-plugin-foundation-and-infrastructure/01
    provides: "Plugin skeleton with paths.ts utility (getConfigPath, getGraphDbPath)"
provides:
  - "Zod config schema (ConfigSchema, Config type, AgentModelSchema)"
  - "Config defaults matching D-12 thorough defaults"
  - "Config loader/writer with YAML round-trip and validation"
  - "MCP server entry point with McpServer + StdioServerTransport"
  - "codescope_status tool with health check and dependency info"
  - "10 stub tools with Zod input schemas returning not_bootstrapped errors"
affects: [01-plugin-foundation-and-infrastructure/03, 01-plugin-foundation-and-infrastructure/04, 01-plugin-foundation-and-infrastructure/05]

# Tech tracking
tech-stack:
  added: [zod/v4, js-yaml, "@modelcontextprotocol/sdk"]
  patterns: [mcp-tool-registration, zod-schema-validation, yaml-config-round-trip, testable-tool-extraction]

key-files:
  created:
    - src/config/schema.ts
    - src/config/defaults.ts
    - src/config/loader.ts
    - src/config/writer.ts
    - src/server.ts
    - src/tools/index.ts
    - src/tools/status.ts
    - src/tools/stubs.ts
    - tests/config/schema.test.ts
    - tests/config/loader.test.ts
    - tests/tools/status.test.ts
    - tests/tools/server-smoke.test.ts
  modified: []

key-decisions:
  - "Extracted getStatus() from registerStatusTool for testability without MCP transport"
  - "Exported STUB_TOOLS array and makeStubResponse for test verification of tool completeness"
  - "DEFAULT_CONFIG typed as partial (Omit<Config, 'project'>) since project fields are onboard-populated placeholders"

patterns-established:
  - "MCP tool testability: extract core logic into pure functions, register on server separately"
  - "Stub tool pattern: STUB_TOOLS array with makeStubResponse factory for consistent not_bootstrapped errors"
  - "Config validation: safeParse with descriptive error messages mentioning the file and recovery action"

requirements-completed: [PLUG-02, ONBD-02, ONBD-03, ONBD-04]

# Metrics
duration: 4min
completed: 2026-03-23
---

# Phase 1 Plan 2: Config & MCP Server Summary

**Full Zod config schema with YAML round-trip, MCP server registering codescope_status and 10 stub tools with validated input schemas**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-23T01:05:48Z
- **Completed:** 2026-03-23T01:10:32Z
- **Tasks:** 2
- **Files modified:** 12

## Accomplishments
- Complete Zod schema covering all 10 config sections (project, agents, orient, execute, verify, eval, conventions, learning, bootstrap, display) with strict validation
- Config defaults matching D-12 thorough defaults: brief verbosity, thorough clarification, interactive eval, suggest-only conventions, 80% detection threshold
- Config write-load round-trip preserving all values through YAML serialization
- MCP server entry point with all 11 tools registered (1 functional + 10 stubs)
- codescope_status returns structured health info even without config or bootstrap data
- 34 passing tests across 4 test files

## Task Commits

Each task was committed atomically:

1. **Task 1: Config Zod schema, defaults, loader, and writer** - `55388a9` (feat)
2. **Task 2: MCP server with codescope_status and 10 stub tools** - `d9d5c93` (feat)

_Both tasks used TDD: tests written first (RED), implementation second (GREEN)._

## Files Created/Modified
- `src/config/schema.ts` - Zod schema for config.yml with all 10 sections, Config type export
- `src/config/defaults.ts` - DEFAULT_CONFIG with D-12 thorough defaults
- `src/config/loader.ts` - loadConfig (safeParse + descriptive errors) and configExists
- `src/config/writer.ts` - writeConfig serializing Config to YAML on disk
- `src/server.ts` - MCP server entry point: McpServer + StdioServerTransport + registerTools
- `src/tools/index.ts` - Tool registration index wiring status + stubs to server
- `src/tools/status.ts` - codescope_status tool with getStatus() for testability
- `src/tools/stubs.ts` - 10 stub tool definitions with Zod schemas, makeStubResponse factory
- `tests/config/schema.test.ts` - 14 tests: schema validation, defaults values
- `tests/config/loader.test.ts` - 7 tests: round-trip, missing file, malformed YAML error
- `tests/tools/status.test.ts` - 12 tests: status shape, stubs format, tool count
- `tests/tools/server-smoke.test.ts` - 1 test: MCP server construction + tool registration

## Decisions Made
- Extracted `getStatus()` as a standalone async function from `registerStatusTool()` so status logic can be tested without MCP transport or stdio
- Exported `STUB_TOOLS` array and `makeStubResponse()` from stubs.ts to enable test verification of tool completeness and response format
- `DEFAULT_CONFIG` typed with `Omit<Config, 'project'>` union since project.name and project.languages are empty placeholders that onboard fills in (intentionally won't pass schema validation until populated)
- Added `server-smoke.test.ts` as additional integration verification that McpServer construction + registerTools completes without errors

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added server integration smoke test**
- **Found during:** Task 2
- **Issue:** Plan specified testing via `npx tsx src/server.ts` for server startup verification, but stdio-based MCP servers block forever. Need an in-test verification.
- **Fix:** Created `tests/tools/server-smoke.test.ts` that verifies McpServer construction and tool registration without transport.
- **Files modified:** tests/tools/server-smoke.test.ts
- **Verification:** Test passes, confirms no runtime errors in tool registration
- **Committed in:** d9d5c93 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality)
**Impact on plan:** Smoke test adds verification coverage. No scope creep.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Config system ready for onboarding skill (Plan 03) to write config.yml
- MCP server ready for tool implementations in later phases
- All 11 tool names registered; stubs will be replaced incrementally as features ship
- loadConfig/writeConfig/configExists exported for use by onboarding and all downstream tools

---
*Phase: 01-plugin-foundation-and-infrastructure*
*Completed: 2026-03-23*

## Self-Check: PASSED

All 12 created files verified on disk. Both commit hashes (55388a9, d9d5c93) verified in git log.
