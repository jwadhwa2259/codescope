import { describe, it, expect, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import { createSchema } from "../../src/graph/schema.js";
import { loadGraphFromSQLite } from "../../src/graph/analytics.js";
import type { Database as DatabaseType } from "better-sqlite3";

function tmpDbPath(): string {
  return path.join(
    os.tmpdir(),
    `codescope-community-load-test-${crypto.randomUUID()}.db`,
  );
}

function cleanupDb(dbPath: string): void {
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const walPath = dbPath + "-wal";
    const shmPath = dbPath + "-shm";
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
  } catch {
    // cleanup best-effort
  }
}

describe("loadGraphFromSQLite community loading", () => {
  let dbPath: string;
  let db: DatabaseType;

  afterEach(() => {
    try {
      if (db) closeDatabase(db);
    } catch {
      /* already closed */
    }
    if (dbPath) cleanupDb(dbPath);
  });

  it("loads community attribute from communities table onto graph nodes", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);

    // Insert 3 nodes
    const insertNode = db.prepare(
      "INSERT INTO nodes (name, kind, file_path, language, loc, is_exported, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insertNode.run("a.ts", "file", "src/a.ts", "typescript", 10, 0, 0); // id=1
    insertNode.run("b.ts", "file", "src/b.ts", "typescript", 20, 0, 0); // id=2
    insertNode.run("c.ts", "file", "src/c.ts", "typescript", 30, 0, 0); // id=3

    // Insert 2 edges
    const insertEdge = db.prepare(
      "INSERT INTO edges (source_id, target_id, kind, weight) VALUES (?, ?, ?, ?)",
    );
    insertEdge.run(1, 2, "IMPORTS", 1.0);
    insertEdge.run(2, 3, "IMPORTS", 1.0);

    // Insert communities for nodes 1 and 2 (not 3)
    const insertComm = db.prepare(
      "INSERT INTO communities (node_id, community_id, modularity_class) VALUES (?, ?, ?)",
    );
    insertComm.run(1, 0, "core");
    insertComm.run(2, 1, "utils");

    const graph = loadGraphFromSQLite(db);

    // Node "1" should have community = 0
    expect(graph.getNodeAttribute("1", "community")).toBe(0);
    // Node "2" should have community = 1
    expect(graph.getNodeAttribute("2", "community")).toBe(1);
  });

  it("nodes not in communities table have no community attribute", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);

    const insertNode = db.prepare(
      "INSERT INTO nodes (name, kind, file_path, language, loc, is_exported, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insertNode.run("a.ts", "file", "src/a.ts", "typescript", 10, 0, 0);
    insertNode.run("b.ts", "file", "src/b.ts", "typescript", 20, 0, 0);
    insertNode.run("c.ts", "file", "src/c.ts", "typescript", 30, 0, 0);

    // Only assign community to node 1
    const insertComm = db.prepare(
      "INSERT INTO communities (node_id, community_id, modularity_class) VALUES (?, ?, ?)",
    );
    insertComm.run(1, 0, "core");

    const graph = loadGraphFromSQLite(db);

    // Node "1" has community
    expect(graph.getNodeAttribute("1", "community")).toBe(0);
    // Nodes "2" and "3" should NOT have community attribute
    expect(graph.getNodeAttribute("2", "community")).toBeUndefined();
    expect(graph.getNodeAttribute("3", "community")).toBeUndefined();
  });

  it("works correctly when communities table is empty", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);

    const insertNode = db.prepare(
      "INSERT INTO nodes (name, kind, file_path, language, loc, is_exported, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insertNode.run("a.ts", "file", "src/a.ts", "typescript", 10, 0, 0);
    insertNode.run("b.ts", "file", "src/b.ts", "typescript", 20, 0, 0);

    const insertEdge = db.prepare(
      "INSERT INTO edges (source_id, target_id, kind, weight) VALUES (?, ?, ?, ?)",
    );
    insertEdge.run(1, 2, "IMPORTS", 1.0);

    // No communities inserted

    const graph = loadGraphFromSQLite(db);

    // Graph should load nodes and edges correctly
    expect(graph.order).toBe(2);
    expect(graph.size).toBe(1);
    // No community attributes
    expect(graph.getNodeAttribute("1", "community")).toBeUndefined();
    expect(graph.getNodeAttribute("2", "community")).toBeUndefined();
  });

  it("still loads nodes and edges correctly (no regression)", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);
    createSchema(db);

    const insertNode = db.prepare(
      "INSERT INTO nodes (name, kind, file_path, language, loc, is_exported, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );
    insertNode.run("a.ts", "file", "src/a.ts", "typescript", 50, 1, 0);
    insertNode.run("b.ts", "file", "src/b.ts", "typescript", 30, 0, 1);
    insertNode.run("fn", "function", "src/a.ts", "typescript", 10, 1, 0);

    const insertEdge = db.prepare(
      "INSERT INTO edges (source_id, target_id, kind, weight) VALUES (?, ?, ?, ?)",
    );
    insertEdge.run(1, 2, "IMPORTS", 1.0);
    insertEdge.run(1, 3, "CONTAINS", 1.0);

    // Add communities
    const insertComm = db.prepare(
      "INSERT INTO communities (node_id, community_id, modularity_class) VALUES (?, ?, ?)",
    );
    insertComm.run(1, 0, "core");
    insertComm.run(2, 0, "core");
    insertComm.run(3, 1, "utils");

    const graph = loadGraphFromSQLite(db);

    // Node and edge counts
    expect(graph.order).toBe(3);
    expect(graph.size).toBe(2);

    // Node attributes still correct
    expect(graph.getNodeAttribute("1", "name")).toBe("a.ts");
    expect(graph.getNodeAttribute("1", "kind")).toBe("file");
    expect(graph.getNodeAttribute("1", "filePath")).toBe("src/a.ts");
    expect(graph.getNodeAttribute("1", "loc")).toBe(50);

    // Community attributes loaded
    expect(graph.getNodeAttribute("1", "community")).toBe(0);
    expect(graph.getNodeAttribute("2", "community")).toBe(0);
    expect(graph.getNodeAttribute("3", "community")).toBe(1);

    // Edges correct
    expect(graph.hasEdge("1", "2")).toBe(true);
    expect(graph.hasEdge("1", "3")).toBe(true);
  });
});
