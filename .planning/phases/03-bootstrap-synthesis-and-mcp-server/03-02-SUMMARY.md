---
phase: 03-bootstrap-synthesis-and-mcp-server
plan: 02
subsystem: mcp
tags: [mcp-tools, recall, conventions, readiness, service-map, markdown-parsing]

# Dependency graph
requires:
  - phase: 03-01
    provides: helpers.ts response builders, buildMetadata, isBootstrapped, graph cache
provides:
  - codescope_recall MCP tool (combined topic-filtered context from overview/conventions/learnings)
  - codescope_conventions MCP tool (filtered conventions with adoption percentages)
  - codescope_readiness MCP tool (structured AI readiness score with dimensions)
  - codescope_service_map MCP tool (service list with cross-service dependencies)
affects: [03-03, 03-04, 03-05]

# Tech tracking
tech-stack:
  added: []
  patterns: [handleX pattern for testable MCP tool handlers, markdown table parsing, section-based topic filtering]

key-files:
  created:
    - src/tools/recall.ts
    - src/tools/conventions.ts
    - src/tools/readiness-tool.ts
    - src/tools/service-map.ts
    - tests/tools/recall.test.ts
    - tests/tools/conventions.test.ts
    - tests/tools/readiness-tool.test.ts
    - tests/tools/service-map.test.ts
  modified: []

key-decisions:
  - "handleX() pattern extracts core logic from registerXTool() for testability without MCP transport"
  - "Markdown section parsing splits by H2 headings for topic-based filtering in recall tool"
  - "Convention parsing extracts structured blocks with name/adoption/confidence/category/files/evidence"
  - "Service map returns partial response (not error) when cross-service-map.md missing for multi-service projects"

patterns-established:
  - "handleX pattern: export async function handleX(projectRoot, input) for all file-reading MCP tools"
  - "Markdown table parsing: split by | delimiter, skip separator rows, extract typed cell values"
  - "Dual-export per tool: handleX for testing, registerXTool for MCP server registration"

requirements-completed: [MCP-02, MCP-05, MCP-09, MCP-12]

# Metrics
duration: 5min
completed: 2026-03-23
---

# Phase 03 Plan 02: File-Reading MCP Tools Summary

**4 MCP tools parsing markdown artifacts for codebase intelligence: topic-filtered recall, convention lookup with adoption data, AI readiness scores with dimension breakdown, and cross-service dependency mapping**

## Performance

- **Duration:** 5 min
- **Started:** 2026-03-23T21:18:35Z
- **Completed:** 2026-03-23T21:24:00Z
- **Tasks:** 2
- **Files modified:** 8

## Accomplishments
- codescope_recall combines overview.md + conventions.md + learnings.md filtered by topic with case-insensitive section matching
- codescope_conventions parses structured convention blocks with adoption %, confidence, category, evidence; filters by file_path or module
- codescope_readiness extracts overall grade/percent, 4 dimension scores with deltas, and top 3 improvements from readiness.md
- codescope_service_map reads service-manifest.md and cross-service-map.md; handles single-service (empty deps per D-34) and multi-service (partial response if cross-map missing)
- All 4 tools follow D-17 response format with staleness metadata via buildMetadata helper
- All 4 tools guard on isBootstrapped with NOT_BOOTSTRAPPED error
- 24 tests across 4 test files, all passing

## Task Commits

Each task was committed atomically:

1. **Task 1: codescope_recall and codescope_conventions tools**
   - `009b9bf` (test: add failing tests for recall and conventions tools)
   - `87c03ce` (feat: implement codescope_recall and codescope_conventions tools)
2. **Task 2: codescope_readiness and codescope_service_map tools**
   - `1471154` (test: add failing tests for readiness and service-map tools)
   - `c656e88` (feat: implement codescope_readiness and codescope_service_map tools)

_Note: TDD tasks have separate test and implementation commits._

## Files Created/Modified
- `src/tools/recall.ts` - codescope_recall: reads 3 markdown artifacts, filters sections by topic keyword
- `src/tools/conventions.ts` - codescope_conventions: parses convention blocks, filters by file_path or module
- `src/tools/readiness-tool.ts` - codescope_readiness: parses readiness.md for grade, dimensions, improvements
- `src/tools/service-map.ts` - codescope_service_map: parses service-manifest.md and cross-service-map.md
- `tests/tools/recall.test.ts` - 6 test cases for recall tool
- `tests/tools/conventions.test.ts` - 6 test cases for conventions tool
- `tests/tools/readiness-tool.test.ts` - 6 test cases for readiness tool
- `tests/tools/service-map.test.ts` - 6 test cases for service-map tool

## Decisions Made
- **handleX() pattern:** Extracted core tool logic into `handleRecall`, `handleConventions`, `handleReadiness`, `handleServiceMap` functions separate from MCP registration, following the same testability pattern established in Plan 01 for `formatStatusResponse`/`getStatus`
- **Section-based topic filtering:** Recall tool splits markdown by H2 headings and matches topic against both heading and body text (case-insensitive). Falls back to first-20-lines summary when no sections match.
- **Convention block parsing:** Parses `**Convention:**`, `**Adoption:**`, `**Confidence:**`, `**Category:**`, `**Files:**`, `**Evidence:**` fields from each H2 section in conventions.md
- **Partial response for missing cross-service map:** Multi-service projects without cross-service-map.md get `status: "partial"` with a warning, not an error. Single-service projects get `status: "ok"` with empty dependencies per D-34.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Known Stubs

None - all 4 tools are fully functional for their specified scope. They read markdown artifacts produced by bootstrap agents and return structured data.

## Next Phase Readiness
- 4 file-reading MCP tools ready for use
- Remaining tools (graph_query, blast_radius, orient, verify, search, detect_changes) depend on graph cache from Plan 01 and will be implemented in Plans 03-05
- Tool registration in src/tools/index.ts not yet updated to use real tools instead of stubs (will be handled when all tools are complete)

## Self-Check: PASSED

- All 8 files verified present on disk
- All 4 commit hashes verified in git log
- 24/24 tests passing

---
*Phase: 03-bootstrap-synthesis-and-mcp-server*
*Completed: 2026-03-23*
