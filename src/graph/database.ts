import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { migrateDatabase } from "./migration.js";

export type { DatabaseType };

/**
 * Opens a SQLite database with WAL mode and performance pragmas.
 *
 * Performance settings (from RESEARCH.md Pattern 3):
 * - WAL mode: concurrent reads during writes
 * - synchronous = NORMAL: safe with WAL, faster than FULL
 * - cache_size = -64000: 64MB cache in memory
 * - foreign_keys = ON: enforce referential integrity
 * - busy_timeout = 5000: concurrent access between MCP server and dashboard (D-09)
 *
 * After pragmas, calls migrateDatabase() to auto-detect schema version
 * and apply pending migrations (D-07). If migration fails, falls back to
 * deleting the database file and retrying with a fresh v2 database (D-08).
 *
 * @param dbPath - Path to the SQLite database file
 * @param _isRetry - Internal flag to prevent infinite recursion on migration fallback
 */
export function openDatabase(
  dbPath: string,
  _isRetry: boolean = false
): DatabaseType {
  const db = new Database(dbPath);

  // Performance pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -64000"); // 64MB cache
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000"); // Concurrent access (D-09)

  // Auto-migrate schema to latest version
  try {
    migrateDatabase(db, dbPath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "MIGRATION_FAILED" && !_isRetry) {
      // Migration deleted the db file -- reopen with fresh v2 schema
      return openDatabase(dbPath, true);
    }
    throw err;
  }

  return db;
}

/**
 * Closes a SQLite database connection, releasing all resources.
 */
export function closeDatabase(db: DatabaseType): void {
  db.close();
}
