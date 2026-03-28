import { describe, it, expect, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import { createSchema, SCHEMA_SQL } from "../../src/graph/schema.js";

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `codescope-test-${crypto.randomUUID()}.db`);
}

describe("SQLite database connection", () => {
  let dbPath: string;
  let db: ReturnType<typeof openDatabase>;

  afterEach(() => {
    try {
      if (db) closeDatabase(db);
    } catch {
      // already closed
    }
    try {
      if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      // WAL and SHM files
      if (dbPath) {
        const walPath = dbPath + "-wal";
        const shmPath = dbPath + "-shm";
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      }
    } catch {
      // cleanup best-effort
    }
  });

  it("opens database with WAL mode", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    const journalMode = db.pragma("journal_mode", { simple: true });
    expect(journalMode).toBe("wal");
  });

  it("sets synchronous = NORMAL", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    const synchronous = db.pragma("synchronous", { simple: true });
    // NORMAL = 1
    expect(synchronous).toBe(1);
  });

  it("sets cache_size = -64000 (64MB)", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    const cacheSize = db.pragma("cache_size", { simple: true });
    expect(cacheSize).toBe(-64000);
  });

  it("sets foreign_keys = ON", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    const fk = db.pragma("foreign_keys", { simple: true });
    expect(fk).toBe(1);
  });

  it("sets busy_timeout = 5000", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    const timeout = db.pragma("busy_timeout", { simple: true });
    expect(timeout).toBe(5000);
  });

  it("closeDatabase releases the database handle", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    closeDatabase(db);
    // After close, operations should throw
    expect(() => db.pragma("journal_mode")).toThrow();
    // Prevent afterEach from double-closing
    db = null as any;
  });
});

describe("Schema creation", () => {
  let dbPath: string;
  let db: ReturnType<typeof openDatabase>;

  afterEach(() => {
    try {
      if (db) closeDatabase(db);
    } catch {
      // already closed
    }
    try {
      if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (dbPath) {
        const walPath = dbPath + "-wal";
        const shmPath = dbPath + "-shm";
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      }
    } catch {
      // cleanup best-effort
    }
  });

  it("creates all three tables", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("nodes");
    expect(tableNames).toContain("edges");
    expect(tableNames).toContain("communities");
  });

  it("nodes table has all 14 columns", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);

    const columns = db.pragma("table_info(nodes)") as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toEqual([
      "id",
      "name",
      "kind",
      "file_path",
      "start_line",
      "end_line",
      "signature",
      "complexity",
      "is_exported",
      "is_test",
      "language",
      "loc",
      "last_modified",
      "metadata",
    ]);
    expect(columns).toHaveLength(14);
  });

  it("edges table has all 6 columns", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);

    const columns = db.pragma("table_info(edges)") as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toEqual([
      "id",
      "source_id",
      "target_id",
      "kind",
      "weight",
      "metadata",
    ]);
    expect(columns).toHaveLength(6);
  });

  it("communities table has all 3 columns", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);

    const columns = db.pragma("table_info(communities)") as { name: string }[];
    const colNames = columns.map((c) => c.name);

    expect(colNames).toEqual(["node_id", "community_id", "modularity_class"]);
    expect(columns).toHaveLength(3);
  });

  it("creates all 6 indexes (v2 schema includes idx_readiness_ts)", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY name"
      )
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain("idx_nodes_path");
    expect(indexNames).toContain("idx_nodes_kind");
    expect(indexNames).toContain("idx_edges_source");
    expect(indexNames).toContain("idx_edges_target");
    expect(indexNames).toContain("idx_edges_kind");
    expect(indexNames).toContain("idx_readiness_ts");
    expect(indexes).toHaveLength(6);
  });

  it("schema creation is idempotent", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);

    // Call twice — should not throw
    createSchema(db);
    expect(() => createSchema(db)).not.toThrow();

    // Verify tables still correct
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as { name: string }[];
    const tableNames = tables.map((t) => t.name);

    expect(tableNames).toContain("nodes");
    expect(tableNames).toContain("edges");
    expect(tableNames).toContain("communities");
  });
});

describe("Basic CRUD operations", () => {
  let dbPath: string;
  let db: ReturnType<typeof openDatabase>;

  afterEach(() => {
    try {
      if (db) closeDatabase(db);
    } catch {
      // already closed
    }
    try {
      if (dbPath && fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (dbPath) {
        const walPath = dbPath + "-wal";
        const shmPath = dbPath + "-shm";
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      }
    } catch {
      // cleanup best-effort
    }
  });

  it("can insert and retrieve a node", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);

    db.prepare(
      "INSERT INTO nodes (name, kind, file_path) VALUES (@name, @kind, @file_path)"
    ).run({ name: "app.ts", kind: "file", file_path: "src/app.ts" });

    const row = db
      .prepare("SELECT * FROM nodes WHERE name = @name")
      .get({ name: "app.ts" }) as any;

    expect(row).toBeDefined();
    expect(row.name).toBe("app.ts");
    expect(row.kind).toBe("file");
    expect(row.file_path).toBe("src/app.ts");
  });

  it("can insert an edge referencing existing nodes", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);

    db.prepare(
      "INSERT INTO nodes (name, kind, file_path) VALUES (@name, @kind, @file_path)"
    ).run({ name: "app.ts", kind: "file", file_path: "src/app.ts" });

    db.prepare(
      "INSERT INTO nodes (name, kind, file_path) VALUES (@name, @kind, @file_path)"
    ).run({ name: "utils.ts", kind: "file", file_path: "src/utils.ts" });

    const source = db
      .prepare("SELECT id FROM nodes WHERE name = 'app.ts'")
      .get() as { id: number };
    const target = db
      .prepare("SELECT id FROM nodes WHERE name = 'utils.ts'")
      .get() as { id: number };

    db.prepare(
      "INSERT INTO edges (source_id, target_id, kind) VALUES (@source_id, @target_id, @kind)"
    ).run({
      source_id: source.id,
      target_id: target.id,
      kind: "IMPORTS",
    });

    const edge = db
      .prepare("SELECT * FROM edges WHERE kind = 'IMPORTS'")
      .get() as any;

    expect(edge).toBeDefined();
    expect(edge.source_id).toBe(source.id);
    expect(edge.target_id).toBe(target.id);
    expect(edge.kind).toBe("IMPORTS");
    expect(edge.weight).toBe(1.0);
  });

  it("can query nodes by file_path using the index", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);

    db.prepare(
      "INSERT INTO nodes (name, kind, file_path) VALUES (@name, @kind, @file_path)"
    ).run({ name: "app.ts", kind: "file", file_path: "src/app.ts" });

    db.prepare(
      "INSERT INTO nodes (name, kind, file_path) VALUES (@name, @kind, @file_path)"
    ).run({ name: "utils.ts", kind: "file", file_path: "src/utils.ts" });

    db.prepare(
      "INSERT INTO nodes (name, kind, file_path) VALUES (@name, @kind, @file_path)"
    ).run({ name: "helper.ts", kind: "file", file_path: "src/helper.ts" });

    const results = db
      .prepare("SELECT * FROM nodes WHERE file_path = @file_path")
      .all({ file_path: "src/app.ts" }) as any[];

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("app.ts");
  });
});
