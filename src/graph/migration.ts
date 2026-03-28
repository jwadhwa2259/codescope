import type { Database as DatabaseType } from "better-sqlite3";
import * as fs from "node:fs";
import { createSchema } from "./schema.js";

/**
 * Current schema version. Bumped when migration adds new tables or modifies constraints.
 * - Version 0: Original v1 schema (no explicit version set)
 * - Version 2: ON DELETE CASCADE on edges/communities, file_hashes table, readiness_history table
 */
export const CURRENT_SCHEMA_VERSION = 2;

/**
 * Migrates the database to the current schema version.
 * Uses PRAGMA user_version for version detection.
 *
 * Migration strategy:
 * - If already at current version, no-op
 * - If fresh database (version 0, no tables), create v2 schema directly
 * - If v1 database (version 0, has tables), apply v1->v2 migration via 12-step table recreation
 * - If migration fails, close db, delete the file, throw MIGRATION_FAILED
 *   so the caller can retry with a fresh database
 *
 * @param db - Open database connection
 * @param dbPath - Path to the database file (for fallback deletion)
 */
export function migrateDatabase(db: DatabaseType, dbPath: string): void {
  const currentVersion = db.pragma("user_version", { simple: true }) as number;

  if (currentVersion >= CURRENT_SCHEMA_VERSION) {
    return; // Already up to date
  }

  if (currentVersion < 2) {
    // Check if this is a fresh database (no tables) vs a v1 database (has tables)
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('nodes', 'edges', 'communities')"
      )
      .all() as { name: string }[];

    if (tables.length === 0) {
      // Fresh database -- create v2 schema directly
      createSchema(db);
      return;
    }

    // Existing v1 database -- apply migration
    try {
      migrateToV2(db);
      db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
    } catch {
      // Migration failed -- close db, delete file, signal caller to retry
      try {
        db.close();
      } catch {
        // Already closed or failed to close
      }
      try {
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        // Also clean up WAL/SHM files
        const walPath = dbPath + "-wal";
        const shmPath = dbPath + "-shm";
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      } catch {
        // Best-effort cleanup
      }
      throw new Error("MIGRATION_FAILED");
    }
  }
}

/**
 * Migrates from v1 schema to v2 using SQLite's 12-step table recreation process.
 *
 * Changes:
 * - edges table: add ON DELETE CASCADE on source_id and target_id
 * - communities table: add ON DELETE CASCADE on node_id
 * - New file_hashes table: file_path TEXT PK, content_hash TEXT, updated_at INTEGER
 * - New readiness_history table: 8 columns with timestamp index
 *
 * Per SQLite docs (https://sqlite.org/lang_altertable.html):
 * 1. Disable foreign keys
 * 2. Start transaction
 * 3. Create new table with desired schema
 * 4. Copy data
 * 5. Drop old table
 * 6. Rename new table
 * 7. Recreate indexes
 * 8. Re-enable foreign keys
 * 9. Validate with foreign_key_check
 */
function migrateToV2(db: DatabaseType): void {
  // Disable foreign keys before migration (connection-scoped, not transactional)
  db.pragma("foreign_keys = OFF");

  try {
    const migrate = db.transaction(() => {
      // --- Recreate edges table with ON DELETE CASCADE ---
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
      db.exec(`INSERT INTO new_edges SELECT * FROM edges;`);
      db.exec(`DROP TABLE edges;`);
      db.exec(`ALTER TABLE new_edges RENAME TO edges;`);

      // Recreate indexes on edges
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
        CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
        CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
      `);

      // --- Recreate communities table with ON DELETE CASCADE ---
      db.exec(`
        CREATE TABLE new_communities (
          node_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
          community_id INTEGER,
          modularity_class TEXT
        );
      `);
      db.exec(`INSERT INTO new_communities SELECT * FROM communities;`);
      db.exec(`DROP TABLE communities;`);
      db.exec(`ALTER TABLE new_communities RENAME TO communities;`);

      // --- Add new tables ---
      db.exec(`
        CREATE TABLE IF NOT EXISTS file_hashes (
          file_path TEXT PRIMARY KEY,
          content_hash TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

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
    });

    migrate();

    // Validate: no FK violations after migration
    const fkCheck = db.pragma("foreign_key_check") as unknown[];
    if (fkCheck.length > 0) {
      throw new Error(
        `Foreign key violations found after migration: ${JSON.stringify(fkCheck)}`
      );
    }
  } finally {
    // Always re-enable foreign keys (Pitfall 1 from RESEARCH.md)
    db.pragma("foreign_keys = ON");
  }
}
