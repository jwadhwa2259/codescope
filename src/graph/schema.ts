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
 * V2 schema SQL for fresh databases.
 *
 * Changes from v1:
 * - edges: ON DELETE CASCADE on source_id and target_id
 * - communities: ON DELETE CASCADE on node_id
 * - New file_hashes table for staleness detection
 * - New readiness_history table for trend tracking
 * - idx_readiness_ts index on readiness_history(timestamp)
 */
export const SCHEMA_V2_SQL = `
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
    source_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
    target_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
    kind TEXT NOT NULL,
    weight REAL DEFAULT 1.0,
    metadata JSON
  );

  CREATE TABLE IF NOT EXISTS communities (
    node_id INTEGER REFERENCES nodes(id) ON DELETE CASCADE,
    community_id INTEGER,
    modularity_class TEXT
  );

  CREATE TABLE IF NOT EXISTS file_hashes (
    file_path TEXT PRIMARY KEY,
    content_hash TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

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

  CREATE INDEX IF NOT EXISTS idx_nodes_path ON nodes(file_path);
  CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
  CREATE INDEX IF NOT EXISTS idx_edges_source ON edges(source_id);
  CREATE INDEX IF NOT EXISTS idx_edges_target ON edges(target_id);
  CREATE INDEX IF NOT EXISTS idx_edges_kind ON edges(kind);
  CREATE INDEX IF NOT EXISTS idx_readiness_ts ON readiness_history(timestamp);
`;

/**
 * Creates the knowledge graph schema in the given database.
 * Uses V2 schema with CASCADE constraints and additional tables.
 * Sets user_version = 2 to mark the database as v2.
 * Idempotent: safe to call multiple times (uses IF NOT EXISTS).
 */
export function createSchema(db: DatabaseType): void {
  db.exec(SCHEMA_V2_SQL);
  db.pragma("user_version = 2");
}
