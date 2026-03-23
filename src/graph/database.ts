import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";

export type { DatabaseType };

/**
 * Opens a SQLite database with WAL mode and performance pragmas.
 *
 * Performance settings (from RESEARCH.md Pattern 3):
 * - WAL mode: concurrent reads during writes
 * - synchronous = NORMAL: safe with WAL, faster than FULL
 * - cache_size = -64000: 64MB cache in memory
 * - foreign_keys = ON: enforce referential integrity
 */
export function openDatabase(dbPath: string): DatabaseType {
  const db = new Database(dbPath);

  // Performance pragmas
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("cache_size = -64000"); // 64MB cache
  db.pragma("foreign_keys = ON");

  return db;
}

/**
 * Closes a SQLite database connection, releasing all resources.
 */
export function closeDatabase(db: DatabaseType): void {
  db.close();
}
