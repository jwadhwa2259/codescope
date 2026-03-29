---
phase: 09-graph-foundation-debt-tracking
plan: 01
subsystem: database
tags: [sqlite, migration, cascade, schema-versioning, better-sqlite3, pragma]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: SQLite database module (openDatabase, closeDatabase, createSchema)
provides:
  - V2 schema with ON DELETE CASCADE on edges and communities tables
  - Auto-migration system (PRAGMA user_version based)
  - file_hashes table for staleness detection
  - readiness_history table for trend tracking
  - busy_timeout(5000) for concurrent access
  - SCHEMA_V2_SQL constant for fresh database creation
affects: [09-02-incremental-reparse, 09-03-trends-tool, 10-auto-injection, 14-visualization]

# Tech tracking
tech-stack:
  added: []
  patterns: [PRAGMA user_version schema versioning, SQLite 12-step table recreation for constraint changes, migration-with-fallback-to-fresh pattern]

key-files:
  created: [src/graph/migration.ts, tests/graph/migration.test.ts]
  modified: [src/graph/schema.ts, src/graph/database.ts, tests/graph/schema.test.ts]

key-decisions:
  - "Fresh databases get v2 schema directly (no migration path) -- detected via empty sqlite_master check"
  - "Migration failure deletes database file and falls back to fresh v2 creation (D-08)"
  - "foreign_keys pragma re-enabled in finally block to prevent Pitfall 1 (leaked disabled FK state)"
  - "Separate file_hashes table (not column on nodes) for cleaner per-file lookup"

patterns-established:
  - "Schema versioning: PRAGMA user_version for version detection, sequential migration functions per version bump"
  - "Migration fallback: on failure, delete db + WAL/SHM files, let caller retry with fresh database"
  - "12-step table recreation: disable FK -> transaction -> create new table -> copy data -> drop old -> rename -> recreate indexes -> enable FK -> validate"

requirements-completed: [GRAPH-03, GRAPH-04]

# Metrics
duration: 4min
completed: 2026-03-28
---

# Phase 9 Plan 1: Schema Migration & V2 Schema Summary

**SQLite v2 schema with ON DELETE CASCADE via 12-step table recreation, auto-migration using PRAGMA user_version, file_hashes and readiness_history tables, busy_timeout(5000) for concurrent access**

## Performance

- **Duration:** 4 min
- **Started:** 2026-03-28T02:21:51Z
- **Completed:** 2026-03-28T02:26:00Z
- **Tasks:** 1 (TDD: RED -> GREEN)
- **Files modified:** 5

## Accomplishments
- V2 schema migration system that auto-detects v1 databases and migrates transparently using SQLite's 12-step table recreation process
- ON DELETE CASCADE on edges (source_id, target_id) and communities (node_id) tables -- deleting a node now automatically removes all associated edges and community assignments
- New file_hashes table (file_path TEXT PK, content_hash TEXT, updated_at INTEGER) for hash-based staleness detection in Plan 02
- New readiness_history table (8 columns + timestamp index) for trend tracking in Plan 03
- busy_timeout(5000) pragma on every database connection for safe concurrent MCP server + dashboard access
- 14 new migration tests + 1 new busy_timeout test, all 880 tests passing (zero regressions)

## Task Commits

Each task was committed atomically:

1. **Task 1 (RED): Failing tests for v2 migration** - `0362881` (test)
2. **Task 1 (GREEN): Implement v2 schema migration system** - `0d5e9b0` (feat)

## Files Created/Modified
- `src/graph/migration.ts` - Schema versioning and v1-to-v2 migration logic (migrateDatabase, CURRENT_SCHEMA_VERSION)
- `src/graph/schema.ts` - Added SCHEMA_V2_SQL with CASCADE constraints, file_hashes, readiness_history; createSchema now uses v2 schema
- `src/graph/database.ts` - Added busy_timeout(5000) pragma, migration call with fallback-to-fresh on failure, _isRetry guard
- `tests/graph/migration.test.ts` - 14 test cases: fresh db, v1->v2 migration, CASCADE behavior, data preservation, fallback, FK validation
- `tests/graph/schema.test.ts` - Added busy_timeout test, updated index count test from 5 to 6 (added idx_readiness_ts)

## Decisions Made
- **Fresh database detection:** Check sqlite_master for existing tables (nodes/edges/communities) -- if empty, create v2 schema directly instead of attempting migration on non-existent tables
- **Import strategy for circular avoidance:** migration.ts imports createSchema from schema.ts (no circular dependency since database.ts -> migration.ts -> schema.ts is a clean chain)
- **FK re-enable in finally block:** Addresses Pitfall 1 from RESEARCH.md -- if migration crashes between disabling and re-enabling foreign keys, the finally block ensures FK enforcement is restored

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fresh database detection for migration path**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Plan assumed migrateDatabase would only encounter v1 databases with existing tables. Fresh databases (user_version=0, no tables) hit the migration path which tried to SELECT * FROM edges on a non-existent table
- **Fix:** Added sqlite_master check before migration -- if no core tables exist, call createSchema directly instead of migrateToV2
- **Files modified:** src/graph/migration.ts
- **Verification:** All 14 migration tests pass including fresh database tests
- **Committed in:** 0d5e9b0 (Task 1 GREEN commit)

**2. [Rule 1 - Bug] ESM require() resolution failure**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Initial implementation used `require('./schema.js')` for lazy import to avoid potential circular dependency, but vitest ESM resolution couldn't resolve it
- **Fix:** Changed to proper ESM `import { createSchema } from './schema.js'` at module level -- no circular dependency exists (database -> migration -> schema is a clean chain)
- **Files modified:** src/graph/migration.ts
- **Verification:** All tests pass
- **Committed in:** 0d5e9b0 (Task 1 GREEN commit)

**3. [Rule 1 - Bug] Schema test expected 5 indexes but v2 has 6**
- **Found during:** Task 1 (GREEN phase)
- **Issue:** Existing "creates all 5 indexes" test hardcoded count. V2 schema adds idx_readiness_ts, making it 6
- **Fix:** Updated test to expect 6 indexes and verify idx_readiness_ts is present
- **Files modified:** tests/graph/schema.test.ts
- **Verification:** All schema tests pass
- **Committed in:** 0d5e9b0 (Task 1 GREEN commit)

---

**Total deviations:** 3 auto-fixed (2 bugs, 1 blocking)
**Impact on plan:** All auto-fixes necessary for correctness. No scope creep. The fresh database detection was a genuine gap in the plan's migration logic.

## Issues Encountered
None beyond the auto-fixed deviations above.

## Known Stubs
None -- all tables, columns, indexes, and migration paths are fully implemented and tested.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- V2 schema is fully operational -- Plan 02 (incremental reparse) can use file_hashes table and ON DELETE CASCADE for per-file rebuilds
- Plan 03 (trends tool) can use readiness_history table for snapshot storage and querying
- busy_timeout ensures safe concurrent access for future dashboard work (Phase 14)
- All 880 tests passing, zero regressions

## Self-Check: PASSED

All created files verified on disk. All commit hashes found in git log. SUMMARY.md exists.

---
*Phase: 09-graph-foundation-debt-tracking*
*Completed: 2026-03-28*
