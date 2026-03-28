# Phase 9: Graph Foundation + Debt Tracking - Research

**Researched:** 2026-03-27
**Domain:** SQLite schema migration, incremental graph updates, file content hashing, concurrent database access, readiness trend storage
**Confidence:** HIGH

## Summary

Phase 9 transforms the knowledge graph from a static bootstrap-time artifact into a live, self-maintaining data layer. The core work is: (1) detect file staleness via SHA-256 content hashing on every MCP tool call, (2) perform per-file incremental reparse in under 2 seconds, (3) harden the SQLite schema with ON DELETE CASCADE and busy_timeout for concurrent access, and (4) store readiness snapshots for trend tracking over time.

The existing codebase provides strong foundations. `openDatabase()` is a single point of change for pragmas. `getGraph()` in `src/graph/cache.ts` is the chokepoint where every MCP tool accesses the graph -- staleness detection hooks in here. The `buildGraph()` pipeline in `src/graph/builder.ts` already processes files individually, so its per-file logic can be extracted and reused for incremental rebuilds. The readiness computation in `src/bootstrap/readiness.ts` already produces structured dimension scores that map directly to the `readiness_history` table schema.

**Primary recommendation:** Implement a migration system using SQLite's `PRAGMA user_version` to version the schema, recreate the edges table with ON DELETE CASCADE via the 12-step process, add a `file_hashes` table (separate from nodes -- cleaner for per-file lookup), add a `readiness_history` table, and set `busy_timeout(5000)`. The staleness check intercepts `getGraph()` and scopes hash checks to queried files only.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Staleness checks run on **every MCP tool call** -- no caching or idle-based shortcuts. The graph must never return outdated data.
- **D-02:** File changes detected via **SHA-256 content hash** stored per-file in the database. Hash column added to nodes table (or a new file_hashes table).
- **D-03:** Hash checks scoped to **queried files only** -- only files relevant to the current tool query are checked, not the entire source tree. Keeps latency proportional to query scope.
- **D-04:** Stale files **block the response** until reparsed -- user never sees outdated graph data. No async/background reparse with stale warnings.
- **D-05:** File updates use **delete-and-rebuild per file** -- delete all nodes/edges for the changed file, re-parse, insert fresh data. Simple, correct, reuses existing builder.ts patterns.
- **D-06:** Orphan cleanup via **ON DELETE CASCADE** on edges.source_id and edges.target_id -- deleting nodes for a file automatically removes associated edges. Aligns with GRAPH-03.
- **D-07:** **Auto-migrate in place** on database open. Detect schema version, apply migrations transparently (add CASCADE rules, busy_timeout pragma, file_hash column, readiness_history table). No user prompt needed.
- **D-08:** If migration fails, **fall back to full re-bootstrap** rather than leaving database in inconsistent state.
- **D-09:** Add **busy_timeout(5000)** pragma to openDatabase() for safe concurrent access between MCP server and dashboard (GRAPH-04).
- **D-10:** Store readiness snapshots **per-bootstrap and per-incremental-update** -- event-driven, not time-based (no cron/daily snapshots).
- **D-11:** `readiness_history` table stores: timestamp, overall grade, overall percent, and per-dimension scores (convention_coverage, type_safety, test_coverage_proxy, import_graph_health).
- **D-12:** `codescope_trends` MCP tool returns **three period comparisons**: current vs. previous snapshot, current vs. 7-day-ago, current vs. 30-day-ago. Each comparison includes deltas and trend direction (improving/declining/stable).

### Claude's Discretion
- Exact file_hash storage strategy (new column on nodes vs. separate file_hashes table) -- pick what's cleanest for per-file lookup
- Schema version detection mechanism (metadata table vs. pragma user_version)
- Whether to recompute graphology centralities after incremental reparse or invalidate cache and let next full query recompute

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GRAPH-01 | Graph detects stale data via file hash comparison on every MCP tool call and triggers incremental reparse automatically | SHA-256 content hashing via `node:crypto`, `file_hashes` table, staleness check intercepts `getGraph()` |
| GRAPH-02 | Incremental delta reparse updates only changed files' nodes/edges in <2s without full re-bootstrap | Delete-and-rebuild per file using extracted `buildGraph()` patterns, ON DELETE CASCADE handles edge cleanup |
| GRAPH-03 | Schema migration adds ON DELETE CASCADE to edges table preventing dangling references | SQLite 12-step table recreation process, `PRAGMA user_version` versioning |
| GRAPH-04 | SQLite busy_timeout pragma (5000ms) enables safe concurrent access between MCP server and dashboard | `PRAGMA busy_timeout = 5000` in `openDatabase()`, one-line addition |
| DEBT-01 | `readiness_history` SQLite table stores readiness snapshots with timestamps on every bootstrap/incremental update | New table with 7 columns, snapshot function called from orchestrator and incremental updater |
| DEBT-02 | `codescope_trends` MCP tool returns period comparisons (current vs previous, deltas, trend direction) | SQL queries against `readiness_history` with timestamp windowing, new MCP tool registration |
</phase_requirements>

## Standard Stack

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| better-sqlite3 | ^12.8.0 | Knowledge graph storage, migrations, concurrent access | Already in use. Synchronous API is critical for MCP handlers. |
| node:crypto | Built-in | SHA-256 content hashing | Built-in, no install needed. `createHash('sha256')` is the standard approach. |
| node:fs | Built-in | Synchronous file reading for hash computation | Already used throughout codebase. `readFileSync` for content hashing. |
| graphology | ^0.26.0 | In-memory graph after incremental update | Already in use. Cache invalidation triggers reload from updated SQLite. |
| @modelcontextprotocol/sdk | ^1.27.1 | MCP tool registration for codescope_trends | Already in use. Same registration pattern as other tools. |
| zod | ^3.25 (zod/v4) | Input schema for codescope_trends tool | Already in use. Same pattern as other tool schemas. |

### No New Dependencies
This phase requires **zero new npm packages**. All functionality is built on:
- `node:crypto` (built-in) for SHA-256 hashing
- `better-sqlite3` (already installed) for schema migration and new tables
- Existing graph infrastructure for incremental updates

**Installation:** None required.

## Architecture Patterns

### Recommended Project Structure Changes
```
src/
  graph/
    database.ts        # ADD: busy_timeout pragma (1 line)
    schema.ts          # ADD: v2 schema with CASCADE, file_hashes, readiness_history
    migration.ts       # NEW: Schema versioning and migration logic
    builder.ts         # EXTRACT: per-file build logic into reusable function
    cache.ts           # MODIFY: Add staleness check before returning cached graph
    incremental.ts     # NEW: Per-file incremental reparse engine
    file-hash.ts       # NEW: SHA-256 hashing + file_hashes table operations
  tools/
    trends-tool.ts     # NEW: codescope_trends MCP tool
    index.ts           # ADD: register trends tool
    helpers.ts         # MODIFY: Replace time-based staleness with hash-based
  bootstrap/
    orchestrator.ts    # ADD: Store readiness snapshot after bootstrap
    readiness.ts       # ADD: Export snapshot storage function
```

### Pattern 1: Schema Versioning with PRAGMA user_version

**What:** Use SQLite's built-in `PRAGMA user_version` integer to track schema version. Check on every database open, apply pending migrations atomically.

**When to use:** Every time `openDatabase()` is called (or a new `migrateDatabase()` function called immediately after).

**Why user_version over metadata table:** `user_version` is a fixed-offset integer in the database file header. It survives even if all tables are corrupted or missing. It requires zero table queries to read. It is the idiomatic SQLite approach for schema versioning.

**Example:**
```typescript
// Source: SQLite official docs - https://sqlite.org/pragma.html#pragma_user_version
// Source: https://levlaz.org/sqlite-db-migrations-with-pragma-user_version/

const CURRENT_SCHEMA_VERSION = 2;

export function migrateDatabase(db: DatabaseType): void {
  const currentVersion = db.pragma('user_version', { simple: true }) as number;

  if (currentVersion >= CURRENT_SCHEMA_VERSION) return; // Already up to date

  // Version 0 -> 1: Original schema (v1.0)
  // No migration needed -- createSchema() handles fresh databases

  if (currentVersion < 2) {
    migrateToV2(db);
  }

  db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
}
```

### Pattern 2: SQLite 12-Step Table Recreation for CASCADE

**What:** SQLite cannot ALTER existing foreign key constraints. Must recreate the edges table with ON DELETE CASCADE. Uses the official 12-step process.

**When to use:** Migration from schema v1 to v2 (one-time operation).

**Example:**
```typescript
// Source: SQLite official docs - https://sqlite.org/lang_altertable.html

function migrateToV2(db: DatabaseType): void {
  // Wrap entire migration in a transaction
  const migrate = db.transaction(() => {
    // Temporarily disable foreign keys for migration
    db.pragma('foreign_keys = OFF');

    // Step 1: Create new edges table with CASCADE
    db.exec(`
      CREATE TABLE new_edges (
        id INTEGER PRIMARY KEY,
        source_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
        target_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        weight REAL DEFAULT 1.0,
        metadata JSON
      );
    `);

    // Step 2: Copy data
    db.exec(`INSERT INTO new_edges SELECT * FROM edges;`);

    // Step 3: Drop old table
    db.exec(`DROP TABLE edges;`);

    // Step 4: Rename new table
    db.exec(`ALTER TABLE new_edges RENAME TO edges;`);

    // Step 5: Recreate indexes
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
      CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
      CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
    `);

    // Step 6: Add file_hashes table
    db.exec(`
      CREATE TABLE IF NOT EXISTS file_hashes (
        file_path TEXT PRIMARY KEY,
        content_hash TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);

    // Step 7: Add readiness_history table
    db.exec(`
      CREATE TABLE IF NOT EXISTS readiness_history (
        id INTEGER PRIMARY KEY,
        timestamp TEXT NOT NULL,
        overall_grade TEXT NOT NULL,
        overall_percent INTEGER NOT NULL,
        convention_coverage INTEGER NOT NULL,
        type_safety INTEGER NOT NULL,
        test_coverage_proxy INTEGER NOT NULL,
        import_graph_health INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_readiness_ts ON readiness_history(timestamp);
    `);

    // Step 8: Also add CASCADE to communities table
    db.exec(`
      CREATE TABLE new_communities (
        node_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
        community_id INTEGER,
        modularity_class TEXT
      );
      INSERT INTO new_communities SELECT * FROM communities;
      DROP TABLE communities;
      ALTER TABLE new_communities RENAME TO communities;
    `);

    // Step 9: Validate foreign keys
    const fkCheck = db.pragma('foreign_key_check') as unknown[];
    if (fkCheck.length > 0) {
      throw new Error(`Foreign key violations found after migration: ${JSON.stringify(fkCheck)}`);
    }

    // Re-enable foreign keys
    db.pragma('foreign_keys = ON');
  });

  migrate();
}
```

### Pattern 3: Scoped Staleness Detection in getGraph()

**What:** Before returning graph data, check if queried files have changed by comparing stored SHA-256 hashes against current file content. Only check files relevant to the current query.

**When to use:** Every MCP tool call that reads graph data (intercepted in `getGraph()` or a new wrapper).

**Design choice -- separate `file_hashes` table (recommended):**
- File paths are the natural key (one hash per file, not per node)
- A file has many nodes (file node, function nodes, class nodes, etc.) -- storing hash on each node is denormalized
- `file_hashes` table with `file_path TEXT PRIMARY KEY` gives O(1) lookup per file
- Cleaner semantics: "has this file changed?" is a file-level question

**Example:**
```typescript
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

export function computeFileHash(filePath: string): string | null {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  } catch {
    return null; // File deleted or unreadable
  }
}

export function getStaleFiles(
  db: DatabaseType,
  filePaths: string[],
  projectRoot: string,
): string[] {
  const stale: string[] = [];
  const getHash = db.prepare(
    'SELECT content_hash FROM file_hashes WHERE file_path = ?'
  );

  for (const relPath of filePaths) {
    const absPath = path.join(projectRoot, relPath);
    const currentHash = computeFileHash(absPath);
    const stored = getHash.get(relPath) as { content_hash: string } | undefined;

    if (currentHash === null) {
      // File deleted -- it's stale (needs cleanup)
      if (stored) stale.push(relPath);
    } else if (!stored || stored.content_hash !== currentHash) {
      // New file or changed content
      stale.push(relPath);
    }
  }

  return stale;
}
```

### Pattern 4: Delete-and-Rebuild Per File

**What:** For each stale file, delete all its nodes (CASCADE handles edges), re-parse with tree-sitter, insert fresh nodes and edges.

**When to use:** When staleness detection finds changed files.

**Critical detail:** The delete must happen inside a transaction to avoid a window where data is missing. ON DELETE CASCADE means deleting from `nodes WHERE file_path = ?` automatically removes edges pointing to/from those nodes.

**Example:**
```typescript
export async function rebuildFile(
  db: DatabaseType,
  filePath: string,          // relative path
  absolutePath: string,
  projectRoot: string,
  pool: ParserPool,
): Promise<{ nodesCreated: number; edgesCreated: number }> {
  // Parse the file first (before deleting old data)
  const parseResult = await parseFile(absolutePath, pool);
  if (!parseResult) return { nodesCreated: 0, edgesCreated: 0 };

  // Transaction: delete old, insert new
  const rebuild = db.transaction(() => {
    // CASCADE deletes edges automatically
    db.prepare('DELETE FROM nodes WHERE file_path = ?').run(filePath);
    db.prepare('DELETE FROM communities WHERE node_id NOT IN (SELECT id FROM nodes)').run();

    // Insert new nodes and edges (reuse builder.ts patterns)
    // ... (same logic as buildGraph per-file section)
  });

  return rebuild();
}
```

### Pattern 5: Readiness Snapshot Storage

**What:** After every bootstrap or incremental update, store the current readiness scores in `readiness_history`.

**When to use:** Called from `runBootstrap()` in orchestrator.ts and from the incremental update path.

**Example:**
```typescript
export function storeReadinessSnapshot(
  db: DatabaseType,
  score: ReadinessScore,
): void {
  db.prepare(`
    INSERT INTO readiness_history
      (timestamp, overall_grade, overall_percent,
       convention_coverage, type_safety, test_coverage_proxy, import_graph_health)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    new Date().toISOString(),
    score.overall.grade,
    score.overall.percent,
    score.dimensions.conventionCoverage.percent,
    score.dimensions.typeSafety.percent,
    score.dimensions.testCoverageProxy.percent,
    score.dimensions.importGraphHealth.percent,
  );
}
```

### Pattern 6: Trend Comparisons via SQL

**What:** The `codescope_trends` tool queries `readiness_history` for three comparison windows.

**Example:**
```typescript
// Current (latest) snapshot
const current = db.prepare(
  'SELECT * FROM readiness_history ORDER BY timestamp DESC LIMIT 1'
).get();

// Previous snapshot
const previous = db.prepare(
  'SELECT * FROM readiness_history ORDER BY timestamp DESC LIMIT 1 OFFSET 1'
).get();

// 7-day-ago snapshot (closest to 7 days back)
const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
const weekAgo = db.prepare(
  'SELECT * FROM readiness_history WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT 1'
).get(sevenDaysAgo);

// 30-day-ago snapshot
const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
const monthAgo = db.prepare(
  'SELECT * FROM readiness_history WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT 1'
).get(thirtyDaysAgo);
```

### Anti-Patterns to Avoid

- **Full source tree scan on every tool call:** D-03 mandates scoping hash checks to queried files only. Scanning all files would violate the <2s requirement.
- **Async background reparse:** D-04 mandates blocking until reparse completes. Never return stale data with a "refreshing" warning.
- **ALTER TABLE ADD CONSTRAINT:** SQLite does not support this. Must recreate the table.
- **Storing hash on every node row:** A file has N nodes. Denormalizing hash to each node wastes space and complicates updates. Use a dedicated `file_hashes` table.
- **Time-based staleness (the v1 approach):** The existing `computeStaleness()` uses timestamp-based logic (7/30 day thresholds). This is being replaced by hash-based detection for graph freshness. The time-based staleness in `ToolMetadata` can remain for backward compatibility but should not be the source of truth for graph data freshness.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| File content hashing | Custom hashing algorithm | `node:crypto` createHash('sha256') | Built-in, fast, standard. SHA-256 is the right balance of speed vs. collision resistance for file change detection. |
| Schema migration framework | Full migration runner with up/down/rollback | `PRAGMA user_version` + sequential migration functions | Overkill for 1-2 migrations. SQLite's built-in versioning is sufficient. No npm package needed. |
| Table recreation for CASCADE | Manual SQL with error-prone steps | SQLite's documented 12-step process | Official, proven pattern. Missing a step causes data loss. |
| Graph cache invalidation | Custom pub/sub or file watcher | Simple `invalidateCache()` already exists | The function exists, just needs to be called after incremental updates. |
| Readiness computation | New scoring logic | Existing `computeReadiness()` in readiness.ts | Already computes all 4 dimensions. Just need to call it and store the result. |

## Common Pitfalls

### Pitfall 1: Foreign Keys OFF During Migration Leaks to Connection
**What goes wrong:** `PRAGMA foreign_keys = OFF` is connection-scoped. If the migration crashes between disabling and re-enabling, subsequent operations on that connection skip FK enforcement.
**Why it happens:** SQLite pragmas are not transactional -- they take effect immediately.
**How to avoid:** Always re-enable `PRAGMA foreign_keys = ON` in a finally block, or close and reopen the connection after migration. The safest pattern: disable FK, run migration in transaction, enable FK, run `PRAGMA foreign_key_check` to validate.
**Warning signs:** Dangling edges after node deletion (CASCADE not firing).

### Pitfall 2: ON DELETE CASCADE Requires foreign_keys = ON at Runtime
**What goes wrong:** CASCADE constraints exist in the schema but silently do nothing if `PRAGMA foreign_keys` is not ON for the current connection.
**Why it happens:** SQLite disables foreign key enforcement by default for backward compatibility.
**How to avoid:** The existing `openDatabase()` already sets `PRAGMA foreign_keys = ON`. Verify this is called before any delete operations. This is already handled.
**Warning signs:** Orphaned edges remaining after `DELETE FROM nodes WHERE file_path = ?`.

### Pitfall 3: Hash Check Latency Exceeding 2-Second Budget
**What goes wrong:** If a tool query touches many files, reading and hashing them all could exceed the 2-second budget.
**Why it happens:** `fs.readFileSync` + SHA-256 takes ~1-5ms per file. 400+ files would push past 2 seconds.
**How to avoid:** D-03 already constrains this -- only hash files relevant to the query. Most graph queries touch 1-50 files. For `codescope_readiness` and other tools that touch the full graph, the staleness check should be scoped to "files in the result set" not "all files in the database."
**Warning signs:** `query_ms` in tool metadata consistently above 2000ms.

### Pitfall 4: Incremental Reparse Missing Cross-File Edges
**What goes wrong:** File A imports file B. If file B is reparsed (deleted and rebuilt), the IMPORTS edge from A to B is lost (CASCADE deletes it when B's nodes are deleted). But file A was not changed, so it won't be reparsed.
**Why it happens:** CASCADE is aggressive -- it deletes edges in both directions (edges where the deleted node is source OR target).
**How to avoid:** After rebuilding a stale file, also rebuild incoming edges from files that import the changed file. This means: (1) Before deleting nodes for file B, query edges where target nodes belong to file B -- record the source file paths. (2) After rebuilding file B, re-resolve imports from those source files to file B. Alternatively, only delete edges where the source node belongs to the changed file (outgoing edges), and let the rebuild re-create them. Incoming edges from other files are unaffected.
**Recommended approach:** Use a more targeted delete: `DELETE FROM edges WHERE source_id IN (SELECT id FROM nodes WHERE file_path = ?)` instead of relying solely on CASCADE for edge cleanup. Then delete the nodes (CASCADE cleans up any remaining orphan edges). This preserves incoming edges from unchanged files.

### Pitfall 5: Concurrent Migration Attempts
**What goes wrong:** Two processes open the database simultaneously and both attempt migration.
**Why it happens:** MCP server and future dashboard could start at the same time.
**How to avoid:** The `busy_timeout(5000)` pragma handles this -- one process gets the write lock, the other waits up to 5 seconds. The migration transaction is exclusive, so only one succeeds. The second process reads the updated `user_version` and skips migration.
**Warning signs:** SQLITE_BUSY errors during startup.

### Pitfall 6: Graphology Cache Stale After Incremental Update
**What goes wrong:** SQLite is updated with new nodes/edges, but the in-memory graphology instance still has old data.
**Why it happens:** `getGraph()` caches the graphology instance with a 5-minute TTL. Incremental updates modify SQLite directly, not the graphology instance.
**How to avoid:** Call `invalidateCache()` after every incremental update. The next `getGraph()` call will reload from the updated SQLite. This is the simplest correct approach and already exists.
**Recommendation (Claude's discretion):** Invalidate cache and let the next call rebuild. Do NOT try to surgically update the graphology instance -- it would duplicate the SQLite logic and be error-prone. The reload cost is ~200ms (measured from cache.test.ts), well within the 2-second budget.

### Pitfall 7: readiness_history Table Growing Unbounded
**What goes wrong:** Over months of use, the readiness_history table accumulates thousands of rows.
**Why it happens:** Every bootstrap and incremental update inserts a row.
**How to avoid:** Add a retention policy. Keep all snapshots from the last 90 days, then only one per day for older data. This can be a periodic cleanup (run during bootstrap, not on every query). Not critical for v2.0 -- a few thousand rows is fine for SQLite.
**Warning signs:** Trends query taking >100ms (unlikely until millions of rows).

## Code Examples

### SHA-256 File Content Hashing (Node.js built-in)
```typescript
// Source: Node.js crypto docs - https://nodejs.org/api/crypto.html
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';

function hashFileContent(filePath: string): string {
  const content = fs.readFileSync(filePath, 'utf-8');
  return crypto.createHash('sha256').update(content).digest('hex');
}
// Returns: '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
// Performance: ~1ms for files under 100KB, ~5ms for 500KB files
```

### PRAGMA user_version (SQLite built-in)
```typescript
// Source: SQLite docs - https://sqlite.org/pragma.html#pragma_user_version

// Read current version
const version = db.pragma('user_version', { simple: true }) as number;
// Returns: 0 (fresh database), 1, 2, etc.

// Set version after migration
db.pragma('user_version = 2');
```

### PRAGMA busy_timeout (SQLite built-in)
```typescript
// Source: SQLite docs - https://sqlite.org/c3ref/busy_timeout.html
// Source: https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/

// Set in openDatabase() -- one line addition
db.pragma('busy_timeout = 5000'); // Wait up to 5 seconds for locks
```

### ON DELETE CASCADE in Schema
```typescript
// Source: SQLite docs - https://sqlite.org/foreignkeys.html

// New edges table definition (v2 schema)
const EDGES_V2_SQL = `
  CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY,
    source_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
    target_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    metadata JSON
  );
`;

// With CASCADE, this single delete removes all edges touching these nodes:
db.prepare('DELETE FROM nodes WHERE file_path = ?').run('src/changed-file.ts');
// No manual edge cleanup needed!
```

### Trend Direction Computation
```typescript
function trendDirection(current: number, previous: number): string {
  const delta = current - previous;
  if (Math.abs(delta) <= 1) return 'stable';  // Within 1% is noise
  return delta > 0 ? 'improving' : 'declining';
}
```

## State of the Art

| Old Approach (v1) | Current Approach (v2) | When Changed | Impact |
|--------------------|----------------------|--------------|--------|
| Time-based staleness (7/30 day thresholds) | SHA-256 content hash per file | Phase 9 | Immediate detection of actual changes, not just time elapsed |
| Full re-bootstrap for any update | Per-file incremental reparse | Phase 9 | Sub-2-second updates vs. minutes for full bootstrap |
| No CASCADE on edges | ON DELETE CASCADE | Phase 9 | Automatic orphan cleanup, no dangling edges |
| No concurrent access protection | busy_timeout(5000) | Phase 9 | Safe for MCP server + dashboard simultaneously |
| No readiness history | readiness_history table + trends tool | Phase 9 | Period-over-period tracking, trend visualization |

**Preserved from v1:**
- `computeStaleness()` in helpers.ts -- still used for `ToolMetadata.staleness` in responses (time-based staleness for user-facing "how old is this data" context)
- `getGraph()` caching pattern -- still used, just augmented with hash-based staleness check
- `buildGraph()` pipeline -- still the full bootstrap path, but its per-file logic is extracted for reuse

## Open Questions

1. **Centrality recomputation after incremental update**
   - What we know: `computeCentrality()` runs on the full graphology graph after loading from SQLite. After an incremental update, centralities for affected nodes change.
   - What's unclear: Is the ~200ms reload + centrality recompute acceptable within the 2-second budget?
   - Recommendation: Invalidate cache and let next call recompute. The 200ms load + centrality compute is well within budget. This is the simplest correct approach and avoids the complexity of surgical graphology updates.

2. **Scope of "queried files" for staleness check**
   - What we know: D-03 says "files relevant to the current tool query." For `codescope_blast_radius`, that's the target file + its N-hop neighbors. For `codescope_graph_query`, it depends on query type.
   - What's unclear: Should the staleness check use file paths from the query input, or from the result set?
   - Recommendation: Check the input file(s) first. If stale, rebuild them. Then execute the query. Do NOT check the entire result set -- that would require executing the query twice (once to get file paths, once to check them).

3. **Populating file_hashes for existing databases**
   - What we know: Existing v1 databases have no file_hashes table. After migration creates the table, it's empty.
   - What's unclear: Should migration backfill all hashes, or let them populate lazily?
   - Recommendation: Lazy population. On first access, if a file has no stored hash, treat it as "unknown" (not stale). Compute and store the hash. Next time, the comparison works normally. This avoids a slow migration that hashes every file.

## Project Constraints (from CLAUDE.md)

- **Tech stack:** TypeScript, better-sqlite3 (synchronous API), graphology, web-tree-sitter WASM, vitest
- **Performance:** Graph queries <100ms (after initial load), bootstrap <5 min for 100K LOC
- **Phase 9 specific:** Incremental updates <2s, busy_timeout for concurrent access
- **Testing:** vitest with `tests/**/*.test.ts` pattern, 30s timeout
- **Build:** tsdown for bundling, tsx for dev
- **MCP patterns:** All tools use `okResponse()`/`errorResponse()` with `ToolMetadata`, tools check `isBootstrapped()` guard
- **Graph access:** All tools go through `getGraph()` cache in `src/graph/cache.ts`
- **Memory management:** Call `tree.delete()` after every parse operation

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.0 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/graph/ --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GRAPH-01 | Staleness detection via file hash comparison | unit | `npx vitest run tests/graph/file-hash.test.ts -x` | No -- Wave 0 |
| GRAPH-01 | Stale files trigger reparse before tool response | integration | `npx vitest run tests/graph/staleness-integration.test.ts -x` | No -- Wave 0 |
| GRAPH-02 | Per-file incremental reparse in <2s | unit + perf | `npx vitest run tests/graph/incremental.test.ts -x` | No -- Wave 0 |
| GRAPH-03 | ON DELETE CASCADE prevents dangling edges | unit | `npx vitest run tests/graph/migration.test.ts -x` | No -- Wave 0 |
| GRAPH-03 | Schema migration from v1 to v2 | unit | `npx vitest run tests/graph/migration.test.ts -x` | No -- Wave 0 |
| GRAPH-04 | busy_timeout pragma set correctly | unit | `npx vitest run tests/graph/schema.test.ts -x` | Yes (needs new test case) |
| DEBT-01 | Readiness snapshot stored on bootstrap/incremental | unit | `npx vitest run tests/graph/readiness-history.test.ts -x` | No -- Wave 0 |
| DEBT-02 | Trends tool returns period comparisons | unit | `npx vitest run tests/tools/trends.test.ts -x` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/graph/ tests/tools/trends.test.ts --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/graph/file-hash.test.ts` -- covers GRAPH-01 (hash computation, stale file detection)
- [ ] `tests/graph/incremental.test.ts` -- covers GRAPH-02 (per-file rebuild, <2s perf)
- [ ] `tests/graph/migration.test.ts` -- covers GRAPH-03 (v1->v2 migration, CASCADE behavior, fallback to re-bootstrap)
- [ ] `tests/graph/staleness-integration.test.ts` -- covers GRAPH-01 end-to-end (tool call detects stale file, triggers reparse)
- [ ] `tests/graph/readiness-history.test.ts` -- covers DEBT-01 (snapshot storage and retrieval)
- [ ] `tests/tools/trends.test.ts` -- covers DEBT-02 (period comparisons, trend direction)
- [ ] Update `tests/graph/schema.test.ts` -- add test for busy_timeout pragma (GRAPH-04)

## Sources

### Primary (HIGH confidence)
- SQLite official docs: [Foreign Key Support](https://sqlite.org/foreignkeys.html) -- ON DELETE CASCADE behavior, PRAGMA foreign_keys requirement
- SQLite official docs: [ALTER TABLE](https://sqlite.org/lang_altertable.html) -- 12-step table recreation process
- SQLite official docs: [PRAGMA user_version](https://sqlite.org/pragma.html#pragma_user_version) -- schema version tracking
- SQLite official docs: [busy_timeout](https://sqlite.org/c3ref/busy_timeout.html) -- concurrent access timeout
- SQLite official docs: [WAL mode](https://sqlite.org/wal.html) -- concurrent read/write guarantees
- Node.js docs: [crypto.createHash](https://nodejs.org/api/crypto.html) -- SHA-256 hashing API
- Existing codebase: `src/graph/database.ts`, `src/graph/schema.ts`, `src/graph/cache.ts`, `src/graph/builder.ts`, `src/graph/batch-writer.ts`, `src/graph/analytics.ts`, `src/tools/helpers.ts`, `src/bootstrap/readiness.ts`, `src/bootstrap/orchestrator.ts`

### Secondary (MEDIUM confidence)
- [SQLite DB Migrations with PRAGMA user_version](https://levlaz.org/sqlite-db-migrations-with-pragma-user_version/) -- practical migration pattern
- [SQLite busy_timeout and database locked errors](https://berthub.eu/articles/posts/a-brief-post-on-sqlite3-database-locked-despite-timeout/) -- busy_timeout behavior in practice
- [SQLite concurrent writes analysis](https://tenthousandmeters.com/blog/sqlite-concurrent-writes-and-database-is-locked-errors/) -- 5000ms as safe busy_timeout threshold
- [better-sqlite3-migrations](https://github.com/BlackGlory/better-sqlite3-migrations) -- migration pattern reference (not using the package, just the pattern)

### Tertiary (LOW confidence)
- None -- all findings verified against official documentation

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, all patterns use built-in Node.js APIs and already-installed better-sqlite3
- Architecture: HIGH -- patterns directly map to existing codebase structure, all integration points identified and verified in source code
- Pitfalls: HIGH -- pitfalls 1-2 verified against SQLite official docs, pitfalls 3-7 derived from analyzing existing code behavior
- Migration: HIGH -- SQLite's 12-step process is officially documented and well-established

**Research date:** 2026-03-27
**Valid until:** 2026-04-27 (stable domain -- SQLite and Node.js crypto APIs change rarely)
