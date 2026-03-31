---
phase: 18-semantic-conventions
plan: 02
subsystem: conventions
tags: [ast-grep, fastify, express, h3, framework-detection, yaml-rules]

# Dependency graph
requires:
  - phase: 18-01
    provides: "RULE_METADATA module, detectFrameworks utility, rule-metadata.ts pure data pattern"
provides:
  - "9 framework-specific ast-grep YAML rules (4 Fastify, 3 Express, 2 h3)"
  - "Framework-aware runConventionScan with detectedFrameworks parameter"
  - "27-entry RULE_METADATA (18 base + 9 framework)"
affects: [18-04, convention-enforcement, bootstrap-pipeline]

# Tech tracking
tech-stack:
  added: []
  patterns: ["framework-conditional scanning: only scan framework rules when framework detected in package.json"]

key-files:
  created:
    - src/conventions/rules/frameworks/fastify/fastify-plugin-signature.yml
    - src/conventions/rules/frameworks/fastify/fastify-route-handler.yml
    - src/conventions/rules/frameworks/fastify/fastify-hook.yml
    - src/conventions/rules/frameworks/fastify/fastify-decorator.yml
    - src/conventions/rules/frameworks/express/express-middleware.yml
    - src/conventions/rules/frameworks/express/express-route-handler.yml
    - src/conventions/rules/frameworks/express/express-error-handler.yml
    - src/conventions/rules/frameworks/h3/h3-event-handler.yml
    - src/conventions/rules/frameworks/h3/h3-utility-functions.yml
    - tests/conventions/framework-rules.test.ts
  modified:
    - src/conventions/rule-metadata.ts
    - src/conventions/runner.ts
    - tests/conventions/rule-metadata.test.ts
    - tests/enforcement/rule-filter.test.ts

key-decisions:
  - "Framework rules use same YAML format and severity:info as base rules for consistent scanning"
  - "detectedFrameworks defaults to empty array for backward compatibility"

patterns-established:
  - "Framework rule directory convention: rules/frameworks/{framework-name}/{rule-id}.yml"
  - "Framework scanning is additive: base TS/Python rules always run, framework rules only when detected"

requirements-completed: [CONV-06]

# Metrics
duration: 6min
completed: 2026-03-30
---

# Phase 18 Plan 02: Framework Rules Summary

**9 framework-specific ast-grep YAML rules (Fastify, Express, h3) with framework-conditional scanning in runConventionScan**

## Performance

- **Duration:** 6 min
- **Started:** 2026-03-31T00:14:31Z
- **Completed:** 2026-03-31T00:20:20Z
- **Tasks:** 2
- **Files modified:** 14

## Accomplishments
- Created 4 Fastify rules: plugin-signature, route-handler, hook, decorator detection
- Created 3 Express rules: middleware, route-handler, error-handler (4-param signature) detection
- Created 2 h3 rules: defineEventHandler and utility function (readBody, getQuery, etc.) detection
- Extended runConventionScan with detectedFrameworks parameter for conditional framework scanning
- Updated RULE_METADATA from 18 to 27 entries with framework-specific categories

## Task Commits

Each task was committed atomically:

1. **Task 1: Create framework-specific ast-grep YAML rules and update RULE_METADATA** - `782d504` (feat, shared with 18-03 parallel agent)
2. **Task 2: Update runner.ts with framework scanning (TDD RED)** - `256357a` (test)
3. **Task 2: Update runner.ts with framework scanning (TDD GREEN)** - `7ef06df` (feat)

## Files Created/Modified
- `src/conventions/rules/frameworks/fastify/*.yml` - 4 Fastify convention detection rules
- `src/conventions/rules/frameworks/express/*.yml` - 3 Express convention detection rules
- `src/conventions/rules/frameworks/h3/*.yml` - 2 h3 convention detection rules
- `src/conventions/rule-metadata.ts` - Extended from 18 to 27 entries with framework categories
- `src/conventions/runner.ts` - Added detectedFrameworks param and framework rule scanning
- `tests/conventions/framework-rules.test.ts` - 6 integration tests for framework scanning
- `tests/conventions/rule-metadata.test.ts` - Updated for 27-entry validation
- `tests/enforcement/rule-filter.test.ts` - Updated from 18 to 27 entry count

## Decisions Made
- Framework rules use the same YAML format and severity:info as base rules for consistent scanning
- detectedFrameworks parameter defaults to empty array for backward compatibility (existing callers unaffected)
- Framework rule YAML files named with framework prefix matching ruleId (e.g., fastify-hook.yml has id: fastify-hook)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Updated enforcement/rule-filter.test.ts for 27-entry count**
- **Found during:** Task 2 (full regression suite)
- **Issue:** rule-filter tests hardcoded `expect(RULE_NAME_TO_ID.size).toBe(18)` which failed after RULE_METADATA grew to 27
- **Fix:** Updated both assertions from 18 to 27
- **Files modified:** tests/enforcement/rule-filter.test.ts
- **Verification:** `npx vitest run tests/enforcement/rule-filter.test.ts` passes
- **Committed in:** 7ef06df (Task 2 GREEN commit)

**2. [Rule 3 - Blocking] Parallel execution collision with 18-03 agent**
- **Found during:** Task 1 (commit attempt)
- **Issue:** Agent 18-03 (running in parallel) had already committed the framework YAML files and rule-metadata updates as part of its TDD RED fixtures
- **Fix:** Verified content is identical, tracked 782d504 as shared commit, continued to Task 2
- **Files modified:** none (no additional changes needed)
- **Verification:** git diff shows zero delta between my writes and committed content

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** Both fixes necessary for correctness. No scope creep.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Framework rules available for bootstrap pipeline to use via `runConventionScan(dir, rulesDir, detectedFrameworks)`
- Plan 18-04 can build framework detection integration into the full bootstrap flow
- All convention tests pass (50/50), full suite at 1290 passing

## Self-Check: PASSED

All 11 created files verified present on disk. All 3 commit hashes (782d504, 256357a, 7ef06df) verified in git log.

---
*Phase: 18-semantic-conventions*
*Completed: 2026-03-30*
