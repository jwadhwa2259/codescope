import type { Database as DatabaseType } from "better-sqlite3";

/**
 * Full schema SQL for the CodeScope knowledge graph.
 *
 * Tables:
 * - nodes: Code entities (files, classes, functions, variables, modules)
 * - edges: Relationships between nodes (IMPORTS, CALLS, EXTENDS, etc.)
 * - communities: Louvain community assignments (populated by Phase 2 Risk Analyzer)
 *
 * Enhanced with D-39 metadata columns (language, loc, last_modified) to enable
 * fast queries without filesystem access.
 */
export const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS nodes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    file_path TEXT NOT NULL,
    start_line INTEGER,
    end_line INTEGER,
    signature TEXT,
    complexity INTEGER,
    is_exported BOOLEAN DEFAULT 0,
    is_test BOOLEAN DEFAULT 0,
    language TEXT,
    loc INTEGER,
    last_modified INTEGER,
    metadata JSON
  );

  CREATE TABLE IF NOT EXISTS edges (
    id INTEGER PRIMARY KEY,
    source_id INTEGER REFERENCES nodes(id),
    target_id INTEGER REFERENCES nodes(id),
    kind TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    metadata JSON
  );

  CREATE TABLE IF NOT EXISTS communities (
    node_id INTEGER REFERENCES nodes(id),
    community_id INTEGER,
    modularity_class TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(file_path);
  CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
  CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
  CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
  CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
`;

/**
 * Creates the knowledge graph schema in the given database.
 * Idempotent: safe to call multiple times (uses IF NOT EXISTS).
 */
export function createSchema(db: DatabaseType): void {
  db.exec(SCHEMA_SQL);
}
