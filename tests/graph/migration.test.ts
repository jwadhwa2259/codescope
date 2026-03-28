import { describe, it, expect, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import Database from "better-sqlite3";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import { SCHEMA_SQL, SCHEMA_V2_SQL } from "../../src/graph/schema.js";
import {
  migrateDatabase,
  CURRENT_SCHEMA_VERSION,
} from "../../src/graph/migration.js";

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `codescope-test-${crypto.randomUUID()}.db`);
}

function cleanupDb(dbPath: string): void {
  try {
    if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const walPath = dbPath + "-wal";
    const shmPath = dbPath + "-shm";
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  } catch {
    // cleanup best-effort
  }
}

describe("Schema migration system", () => {
  let dbPath: string;
  let db: ReturnType<typeof openDatabase> | null = null;

  afterEach(() => {
    try {
      if (db) closeDatabase(db);
    } catch {
      // already closed
    }
    db = null;
    if (dbPath) cleanupDb(dbPath);
  });

  describe("CURRENT_SCHEMA_VERSION", () => {
    it("equals 2", () => {
      expect(CURRENT_SCHEMA_VERSION).toBe(2);
    });
  });

  describe("Fresh database (via openDatabase)", () => {
    it("gets user_version = 2 after openDatabase", () => {
      dbPath = tmpDbPath();
      db = openDatabase(dbPath);
      const version = db.pragma("user_version", { simple: true });
      expect(version).toBe(2);
    });

    it("has file_hashes table with correct columns", () => {
      dbPath = tmpDbPath();
      db = openDatabase(dbPath);

      const columns = db.pragma("table_info(file_hashes)") as {
        name: string;
        type: string;
        pk: number;
      }[];
      const colNames = columns.map((c) => c.name);

      expect(colNames).toContain("file_path");
      expect(colNames).toContain("content_hash");
      expect(colNames).toContain("updated_at");
      expect(columns).toHaveLength(3);

      // file_path is PRIMARY KEY
      const pkCol = columns.find((c) => c.name === "file_path");
      expect(pkCol?.pk).toBe(1);
    });

    it("has readiness_history table with 8 columns", () => {
      dbPath = tmpDbPath();
      db = openDatabase(dbPath);

      const columns = db.pragma("table_info(readiness_history)") as {
        name: string;
      }[];
      const colNames = columns.map((c) => c.name);

      expect(colNames).toEqual([
        "id",
        "timestamp",
        "overall_grade",
        "overall_percent",
        "convention_coverage",
        "type_safety",
        "test_coverage_proxy",
        "import_graph_health",
      ]);
      expect(columns).toHaveLength(8);
    });

    it("has idx_readiness_ts index on readiness_history", () => {
      dbPath = tmpDbPath();
      db = openDatabase(dbPath);

      const indexes = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='index' AND name = 'idx_readiness_ts'"
        )
        .all() as { name: string }[];

      expect(indexes).toHaveLength(1);
      expect(indexes[0].name).toBe("idx_readiness_ts");
    });

    it("edges table has ON DELETE CASCADE on source_id and target_id", () => {
      dbPath = tmpDbPath();
      db = openDatabase(dbPath);

      // Insert two nodes and an edge
      db.prepare(
        "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
      ).run("a.ts", "file", "src/a.ts");
      db.prepare(
        "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
      ).run("b.ts", "file", "src/b.ts");

      const nodeA = db
        .prepare("SELECT id FROM nodes WHERE name = 'a.ts'")
        .get() as { id: number };
      const nodeB = db
        .prepare("SELECT id FROM nodes WHERE name = 'b.ts'")
        .get() as { id: number };

      db.prepare(
        "INSERT INTO edges (source_id, target_id, kind) VALUES (?, ?, ?)"
      ).run(nodeA.id, nodeB.id, "IMPORTS");

      // Delete source node -- cascade should remove edge
      db.prepare("DELETE FROM nodes WHERE id = ?").run(nodeA.id);

      const edges = db.prepare("SELECT * FROM edges").all();
      expect(edges).toHaveLength(0);
    });

    it("communities table has ON DELETE CASCADE on node_id", () => {
      dbPath = tmpDbPath();
      db = openDatabase(dbPath);

      // Insert a node and community assignment
      db.prepare(
        "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
      ).run("a.ts", "file", "src/a.ts");

      const nodeA = db
        .prepare("SELECT id FROM nodes WHERE name = 'a.ts'")
        .get() as { id: number };

      db.prepare(
        "INSERT INTO communities (node_id, community_id, modularity_class) VALUES (?, ?, ?)"
      ).run(nodeA.id, 1, "module-a");

      // Delete node -- cascade should remove community
      db.prepare("DELETE FROM nodes WHERE id = ?").run(nodeA.id);

      const communities = db.prepare("SELECT * FROM communities").all();
      expect(communities).toHaveLength(0);
    });

    it("deleting a node cascades to edges where source_id matches", () => {
      dbPath = tmpDbPath();
      db = openDatabase(dbPath);

      db.prepare(
        "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
      ).run("src.ts", "file", "src/src.ts");
      db.prepare(
        "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
      ).run("tgt.ts", "file", "src/tgt.ts");

      const src = db
        .prepare("SELECT id FROM nodes WHERE name = 'src.ts'")
        .get() as { id: number };
      const tgt = db
        .prepare("SELECT id FROM nodes WHERE name = 'tgt.ts'")
        .get() as { id: number };

      db.prepare(
        "INSERT INTO edges (source_id, target_id, kind) VALUES (?, ?, ?)"
      ).run(src.id, tgt.id, "CALLS");

      // Delete the source node
      db.prepare("DELETE FROM nodes WHERE id = ?").run(src.id);

      const edges = db.prepare("SELECT * FROM edges").all();
      expect(edges).toHaveLength(0);
    });

    it("deleting a node cascades to edges where target_id matches", () => {
      dbPath = tmpDbPath();
      db = openDatabase(dbPath);

      db.prepare(
        "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
      ).run("src.ts", "file", "src/src.ts");
      db.prepare(
        "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
      ).run("tgt.ts", "file", "src/tgt.ts");

      const src = db
        .prepare("SELECT id FROM nodes WHERE name = 'src.ts'")
        .get() as { id: number };
      const tgt = db
        .prepare("SELECT id FROM nodes WHERE name = 'tgt.ts'")
        .get() as { id: number };

      db.prepare(
        "INSERT INTO edges (source_id, target_id, kind) VALUES (?, ?, ?)"
      ).run(src.id, tgt.id, "CALLS");

      // Delete the target node
      db.prepare("DELETE FROM nodes WHERE id = ?").run(tgt.id);

      const edges = db.prepare("SELECT * FROM edges").all();
      expect(edges).toHaveLength(0);
    });
  });

  describe("v1 to v2 migration", () => {
    it("migrates v1 database to v2: CASCADE, file_hashes, readiness_history, user_version", () => {
      dbPath = tmpDbPath();

      // Create a v1 database directly (bypassing openDatabase)
      const v1db = new Database(dbPath);
      v1db.pragma("journal_mode = WAL");
      v1db.pragma("foreign_keys = ON");
      v1db.exec(SCHEMA_SQL);
      // user_version defaults to 0 (v1)
      v1db.close();

      // Open with openDatabase, which should trigger migration
      db = openDatabase(dbPath);

      // Verify user_version is now 2
      const version = db.pragma("user_version", { simple: true });
      expect(version).toBe(2);

      // Verify file_hashes table exists
      const fhCols = db.pragma("table_info(file_hashes)") as {
        name: string;
      }[];
      expect(fhCols.map((c) => c.name)).toContain("file_path");
      expect(fhCols.map((c) => c.name)).toContain("content_hash");
      expect(fhCols.map((c) => c.name)).toContain("updated_at");

      // Verify readiness_history table exists
      const rhCols = db.pragma("table_info(readiness_history)") as {
        name: string;
      }[];
      expect(rhCols).toHaveLength(8);

      // Verify CASCADE is now active on edges
      db.prepare(
        "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
      ).run("x.ts", "file", "src/x.ts");
      db.prepare(
        "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
      ).run("y.ts", "file", "src/y.ts");
      const nx = db
        .prepare("SELECT id FROM nodes WHERE name = 'x.ts'")
        .get() as { id: number };
      const ny = db
        .prepare("SELECT id FROM nodes WHERE name = 'y.ts'")
        .get() as { id: number };
      db.prepare(
        "INSERT INTO edges (source_id, target_id, kind) VALUES (?, ?, ?)"
      ).run(nx.id, ny.id, "IMPORTS");
      db.prepare("DELETE FROM nodes WHERE id = ?").run(nx.id);
      const edgesLeft = db.prepare("SELECT * FROM edges").all();
      expect(edgesLeft).toHaveLength(0);
    });

    it("preserves existing edge data after migration", () => {
      dbPath = tmpDbPath();

      // Create v1 database with test data
      const v1db = new Database(dbPath);
      v1db.pragma("journal_mode = WAL");
      v1db.pragma("foreign_keys = ON");
      v1db.exec(SCHEMA_SQL);

      // Insert nodes and edges
      v1db
        .prepare(
          "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
        )
        .run("app.ts", "file", "src/app.ts");
      v1db
        .prepare(
          "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
        )
        .run("util.ts", "file", "src/util.ts");

      const appNode = v1db
        .prepare("SELECT id FROM nodes WHERE name = 'app.ts'")
        .get() as { id: number };
      const utilNode = v1db
        .prepare("SELECT id FROM nodes WHERE name = 'util.ts'")
        .get() as { id: number };

      v1db
        .prepare(
          "INSERT INTO edges (source_id, target_id, kind, weight) VALUES (?, ?, ?, ?)"
        )
        .run(appNode.id, utilNode.id, "IMPORTS", 2.5);

      v1db.close();

      // Open with openDatabase -- triggers migration
      db = openDatabase(dbPath);

      // Verify edge data is preserved
      const edges = db.prepare("SELECT * FROM edges").all() as {
        source_id: number;
        target_id: number;
        kind: string;
        weight: number;
      }[];
      expect(edges).toHaveLength(1);
      expect(edges[0].kind).toBe("IMPORTS");
      expect(edges[0].weight).toBe(2.5);
    });

    it("migration failure falls back to deleting db and creating fresh v2", () => {
      dbPath = tmpDbPath();

      // Create a corrupted v1 database -- has user_version 0 but missing edges table
      const corruptDb = new Database(dbPath);
      corruptDb.pragma("journal_mode = WAL");
      // Only create nodes table, no edges or communities -- migration will fail
      corruptDb.exec(`
        CREATE TABLE nodes (
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
      `);
      // user_version stays 0
      corruptDb.close();

      // openDatabase should handle the migration failure gracefully
      db = openDatabase(dbPath);

      // Should now be a fresh v2 database
      const version = db.pragma("user_version", { simple: true });
      expect(version).toBe(2);

      // Tables should exist
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        )
        .all() as { name: string }[];
      const names = tables.map((t) => t.name);
      expect(names).toContain("nodes");
      expect(names).toContain("edges");
      expect(names).toContain("communities");
      expect(names).toContain("file_hashes");
      expect(names).toContain("readiness_history");
    });

    it("PRAGMA foreign_key_check returns empty after migration", () => {
      dbPath = tmpDbPath();

      // Create v1 database with valid data
      const v1db = new Database(dbPath);
      v1db.pragma("journal_mode = WAL");
      v1db.pragma("foreign_keys = ON");
      v1db.exec(SCHEMA_SQL);

      v1db
        .prepare(
          "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
        )
        .run("a.ts", "file", "src/a.ts");
      v1db
        .prepare(
          "INSERT INTO nodes (name, kind, file_path) VALUES (?, ?, ?)"
        )
        .run("b.ts", "file", "src/b.ts");

      const a = v1db
        .prepare("SELECT id FROM nodes WHERE name = 'a.ts'")
        .get() as { id: number };
      const b = v1db
        .prepare("SELECT id FROM nodes WHERE name = 'b.ts'")
        .get() as { id: number };

      v1db
        .prepare(
          "INSERT INTO edges (source_id, target_id, kind) VALUES (?, ?, ?)"
        )
        .run(a.id, b.id, "IMPORTS");

      v1db.close();

      // Open triggers migration
      db = openDatabase(dbPath);

      // foreign_key_check should return empty (no violations)
      const fkCheck = db.pragma("foreign_key_check") as unknown[];
      expect(fkCheck).toHaveLength(0);
    });
  });

  describe("busy_timeout", () => {
    it("sets busy_timeout = 5000 after openDatabase", () => {
      dbPath = tmpDbPath();
      db = openDatabase(dbPath);
      const timeout = db.pragma("busy_timeout", { simple: true });
      expect(timeout).toBe(5000);
    });
  });
});
