---
phase: 01-plugin-foundation-and-infrastructure
plan: 05
subsystem: onboarding
tags: [project-detection, global-memory, skill-prompt, config, filesystem]

# Dependency graph
requires:
  - phase: 01-plugin-foundation-and-infrastructure/01-01
    provides: "Filesystem utilities (paths.ts, filesystem.ts) for directory creation and path constants"
  - phase: 01-plugin-foundation-and-infrastructure/01-02
    provides: "Config schema, defaults, loader, writer for config.yml read/write"
provides:
  - "detectProject function for auto-detecting project type, languages, commands from filesystem"
  - "readGlobalMemory/writeGlobalMemory for returning user preferences"
  - "Complete /codescope:onboard skill with 3-phase interactive flow"
affects: [bootstrap, orient, settings]

# Tech tracking
tech-stack:
  added: [js-yaml (dynamic import for docker-compose parsing)]
  patterns: [detect-and-confirm pattern, global memory markdown format, skill prompt as detailed Claude instructions]

key-files:
  created:
    - src/onboard/detect.ts
    - src/onboard/global-memory.ts
    - tests/onboard/detect.test.ts
    - tests/onboard/global-memory.test.ts
    - tests/skills/onboard.test.ts
  modified:
    - skills/onboard/SKILL.md

key-decisions:
  - "Docker-compose parsing uses dynamic import of js-yaml (already a project dependency) rather than regex"
  - "Global memory uses structured markdown with simple key-value parsing for v1"
  - "Skill body is a detailed Claude prompt, not executable code, following Claude Code skill conventions"

patterns-established:
  - "Detect-and-confirm pattern: auto-detect from filesystem then present for user confirmation (D-02)"
  - "Global memory format: markdown with ## Preferences section and - key: value lines"
  - "Skill structure: YAML frontmatter + step-by-step instructions for Claude to execute"

requirements-completed: [ONBD-01, ONBD-05]

# Metrics
duration: 4min
completed: 2026-03-23
---

# Phase 1 Plan 5: Onboard Skill Summary

**Project detection from filesystem (package.json, tsconfig, pyproject.toml, docker-compose, playwright), global memory for returning users, and complete 5-step onboarding skill prompt producing valid config.yml**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-23T01:19:03Z
- **Completed:** 2026-03-23T01:23:04Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments
- detectProject auto-detects project type (single/monorepo), languages (TS/JS/Python), build/test/E2E commands, and docker-compose services
- readGlobalMemory/writeGlobalMemory enable returning user preference persistence via structured markdown
- Complete /codescope:onboard skill with all 5 steps: prerequisites check, project detection, returning user check, agent model selection, workflow preferences, and config writing
- All copy text matches UI-SPEC contract exactly

## Task Commits

Each task was committed atomically:

1. **Task 1: Project detection logic and global memory reading** - `2fdec5c` (test: failing tests), `e25afbe` (feat: implementation)
2. **Task 2: Complete onboard skill body with full 3-phase interactive flow** - `67c3aff` (feat: skill + tests)

_Note: Task 1 used TDD with separate RED and GREEN commits_

## Files Created/Modified
- `src/onboard/detect.ts` - Project detection logic reading package.json, tsconfig, pyproject.toml, docker-compose, playwright config
- `src/onboard/global-memory.ts` - Global memory reading/writing for returning user preferences
- `skills/onboard/SKILL.md` - Complete onboarding skill with 5-step interactive flow
- `tests/onboard/detect.test.ts` - 13 tests for project detection across all project types
- `tests/onboard/global-memory.test.ts` - 7 tests for global memory read/write/round-trip
- `tests/skills/onboard.test.ts` - 19 structural validation tests for skill content

## Decisions Made
- Docker-compose parsing uses dynamic import of js-yaml (already a project dependency) rather than custom regex parsing -- more robust and handles edge cases
- Global memory uses simple structured markdown with key-value lines for v1 -- easy to parse, human-readable, no additional dependencies
- detectProject is async to support dynamic import of js-yaml for docker-compose parsing
- Skill body is a detailed natural language prompt (not executable code) following Claude Code skill conventions

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Project detection, global memory, and onboard skill are complete
- Config system (Plan 02) provides the write/read infrastructure this skill references
- Filesystem utilities (Plan 01) provide directory creation this skill instructs Claude to use
- Ready for Phase 2 bootstrap agents to consume config.yml produced by onboarding

## Self-Check: PASSED

All 6 files verified on disk. All 3 commits verified in git log. No stubs found.

---
*Phase: 01-plugin-foundation-and-infrastructure*
*Completed: 2026-03-23*
