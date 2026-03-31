import { describe, it, expect, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import { createSchema } from "../../src/graph/schema.js";
import type { Database as DatabaseType } from "better-sqlite3";

// Import the function under test -- will be added to orchestrator
import { mergeServiceGraph } from "../../src/bootstrap/orchestrator.js";

function tmpDbPath(label: string): string {
  return path.join(
    os.tmpdir(),
    `codescope-merge-test-${label}-${crypto.randomUUID()}.db`,
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

/**
 * Populate a service DB with test nodes, edges, and communities.
 */
function populateServiceDb(
  db: DatabaseType,
  nodes: Array<{
    name: string;
    kind: string;
    file_path: string;
    language: string;
    loc: number;
    is_exported: number;
    is_test: number;
  }>,
  edges: Array<{
    source_id: number;
    target_id: number;
    kind: string;
    weight: number;
  }>,
  communities: Array<{
    node_id: number;
    community_id: number;
    modularity_class: string | null;
  }> = [],
): void {
  const insertNode = db.prepare(
    "INSERT INTO nodes (name, kind, file_path, language, loc, is_exported, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)",
  );
  for (const n of nodes) {
    insertNode.run(
      n.name,
      n.kind,
      n.file_path,
      n.language,
      n.loc,
      n.is_exported,
      n.is_test,
    );
  }

  const insertEdge = db.prepare(
    "INSERT INTO edges (source_id, target_id, kind, weight) VALUES (?, ?, ?, ?)",
  );
  for (const e of edges) {
    insertEdge.run(e.source_id, e.target_id, e.kind, e.weight);
  }

  if (communities.length > 0) {
    const insertComm = db.prepare(
      "INSERT INTO communities (node_id, community_id, modularity_class) VALUES (?, ?, ?)",
    );
    for (const c of communities) {
      insertComm.run(c.node_id, c.community_id, c.modularity_class);
    }
  }
}

describe("mergeServiceGraph", () => {
  const dbPaths: string[] = [];

  afterEach(() => {
    for (const p of dbPaths) {
      cleanupDb(p);
    }
    dbPaths.length = 0;
  });

  it("merges nodes from two service DBs into root with correct total count", () => {
    // Set up root DB
    const rootPath = tmpDbPath("root");
    dbPaths.push(rootPath);
    const rootDb = openDatabase(rootPath);
    createSchema(rootDb);

    // Service "foo": 3 nodes + 2 edges
    const fooPath = tmpDbPath("foo");
    dbPaths.push(fooPath);
    const fooDb = openDatabase(fooPath);
    createSchema(fooDb);
    populateServiceDb(
      fooDb,
      [
        { name: "index.ts", kind: "file", file_path: "src/index.ts", language: "typescript", loc: 50, is_exported: 0, is_test: 0 },
        { name: "doStuff", kind: "function", file_path: "src/index.ts", language: "typescript", loc: 10, is_exported: 1, is_test: 0 },
        { name: "MyClass", kind: "class", file_path: "src/index.ts", language: "typescript", loc: 30, is_exported: 1, is_test: 0 },
      ],
      [
        { source_id: 1, target_id: 2, kind: "CONTAINS", weight: 1.0 },
        { source_id: 1, target_id: 3, kind: "CONTAINS", weight: 1.0 },
      ],
    );
    closeDatabase(fooDb);

    // Service "bar": 2 nodes + 1 edge
    const barPath = tmpDbPath("bar");
    dbPaths.push(barPath);
    const barDb = openDatabase(barPath);
    createSchema(barDb);
    populateServiceDb(
      barDb,
      [
        { name: "helper.ts", kind: "file", file_path: "src/helper.ts", language: "typescript", loc: 20, is_exported: 0, is_test: 0 },
        { name: "helperFn", kind: "function", file_path: "src/helper.ts", language: "typescript", loc: 5, is_exported: 1, is_test: 0 },
      ],
      [
        { source_id: 1, target_id: 2, kind: "CONTAINS", weight: 1.0 },
      ],
    );
    closeDatabase(barDb);

    // Merge both into root
    mergeServiceGraph(rootDb, fooPath, "packages/foo");
    mergeServiceGraph(rootDb, barPath, "packages/bar");

    // Assert root has 5 nodes total
    const nodeCount = rootDb
      .prepare("SELECT COUNT(*) as count FROM nodes")
      .get() as { count: number };
    expect(nodeCount.count).toBe(5);

    // Assert root has 3 edges total
    const edgeCount = rootDb
      .prepare("SELECT COUNT(*) as count FROM edges")
      .get() as { count: number };
    expect(edgeCount.count).toBe(3);

    closeDatabase(rootDb);
  });

  it("prepends service path to file_path for namespace isolation", () => {
    const rootPath = tmpDbPath("root");
    dbPaths.push(rootPath);
    const rootDb = openDatabase(rootPath);
    createSchema(rootDb);

    const fooPath = tmpDbPath("foo");
    dbPaths.push(fooPath);
    const fooDb = openDatabase(fooPath);
    createSchema(fooDb);
    populateServiceDb(
      fooDb,
      [
        { name: "index.ts", kind: "file", file_path: "src/index.ts", language: "typescript", loc: 50, is_exported: 0, is_test: 0 },
      ],
      [],
    );
    closeDatabase(fooDb);

    mergeServiceGraph(rootDb, fooPath, "packages/foo");

    const nodes = rootDb
      .prepare("SELECT file_path FROM nodes")
      .all() as Array<{ file_path: string }>;

    expect(nodes).toHaveLength(1);
    expect(nodes[0].file_path).toBe(path.join("packages/foo", "src/index.ts"));

    closeDatabase(rootDb);
  });

  it("remaps edge source_id and target_id to new root node IDs", () => {
    const rootPath = tmpDbPath("root");
    dbPaths.push(rootPath);
    const rootDb = openDatabase(rootPath);
    createSchema(rootDb);

    // Pre-populate root with one node so IDs don't start at 1
    rootDb
      .prepare(
        "INSERT INTO nodes (name, kind, file_path, language, loc, is_exported, is_test) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run("existing.ts", "file", "src/existing.ts", "typescript", 10, 0, 0);

    const fooPath = tmpDbPath("foo");
    dbPaths.push(fooPath);
    const fooDb = openDatabase(fooPath);
    createSchema(fooDb);
    populateServiceDb(
      fooDb,
      [
        { name: "a.ts", kind: "file", file_path: "src/a.ts", language: "typescript", loc: 10, is_exported: 0, is_test: 0 },
        { name: "b.ts", kind: "file", file_path: "src/b.ts", language: "typescript", loc: 10, is_exported: 0, is_test: 0 },
      ],
      [
        { source_id: 1, target_id: 2, kind: "IMPORTS", weight: 1.0 },
      ],
    );
    closeDatabase(fooDb);

    mergeServiceGraph(rootDb, fooPath, "packages/foo");

    // The new node IDs should be 2 and 3 (since root already has id=1)
    const edges = rootDb
      .prepare("SELECT source_id, target_id FROM edges")
      .all() as Array<{ source_id: number; target_id: number }>;

    expect(edges).toHaveLength(1);
    // The edge should reference IDs that exist in root, NOT the original service IDs (1, 2)
    const nodeIds = (
      rootDb.prepare("SELECT id FROM nodes").all() as Array<{ id: number }>
    ).map((n) => n.id);

    expect(nodeIds).toContain(edges[0].source_id);
    expect(nodeIds).toContain(edges[0].target_id);
    // Source and target should be different nodes
    expect(edges[0].source_id).not.toBe(edges[0].target_id);

    closeDatabase(rootDb);
  });

  it("merges communities with remapped node IDs", () => {
    const rootPath = tmpDbPath("root");
    dbPaths.push(rootPath);
    const rootDb = openDatabase(rootPath);
    createSchema(rootDb);

    const fooPath = tmpDbPath("foo");
    dbPaths.push(fooPath);
    const fooDb = openDatabase(fooPath);
    createSchema(fooDb);
    populateServiceDb(
      fooDb,
      [
        { name: "a.ts", kind: "file", file_path: "src/a.ts", language: "typescript", loc: 10, is_exported: 0, is_test: 0 },
        { name: "b.ts", kind: "file", file_path: "src/b.ts", language: "typescript", loc: 10, is_exported: 0, is_test: 0 },
      ],
      [],
      [
        { node_id: 1, community_id: 0, modularity_class: "core" },
        { node_id: 2, community_id: 1, modularity_class: "utils" },
      ],
    );
    closeDatabase(fooDb);

    mergeServiceGraph(rootDb, fooPath, "packages/foo");

    const communities = rootDb
      .prepare("SELECT node_id, community_id, modularity_class FROM communities")
      .all() as Array<{
      node_id: number;
      community_id: number;
      modularity_class: string;
    }>;

    expect(communities).toHaveLength(2);

    // Community node_ids should reference the NEW root node IDs, not the service IDs
    const rootNodeIds = (
      rootDb.prepare("SELECT id FROM nodes").all() as Array<{ id: number }>
    ).map((n) => n.id);

    for (const comm of communities) {
      expect(rootNodeIds).toContain(comm.node_id);
    }

    closeDatabase(rootDb);
  });

  it("skips merge when service DB path equals root DB path", () => {
    const rootPath = tmpDbPath("root");
    dbPaths.push(rootPath);
    const rootDb = openDatabase(rootPath);
    createSchema(rootDb);

    // Attempt to merge root with itself -- should be a no-op
    mergeServiceGraph(rootDb, rootPath, ".");

    const nodeCount = rootDb
      .prepare("SELECT COUNT(*) as count FROM nodes")
      .get() as { count: number };
    expect(nodeCount.count).toBe(0);

    closeDatabase(rootDb);
  });

  it("skips merge gracefully when service DB does not exist", () => {
    const rootPath = tmpDbPath("root");
    dbPaths.push(rootPath);
    const rootDb = openDatabase(rootPath);
    createSchema(rootDb);

    const nonExistentPath = path.join(
      os.tmpdir(),
      `codescope-nonexistent-${crypto.randomUUID()}.db`,
    );

    // Should not throw
    expect(() =>
      mergeServiceGraph(rootDb, nonExistentPath, "packages/missing"),
    ).not.toThrow();

    const nodeCount = rootDb
      .prepare("SELECT COUNT(*) as count FROM nodes")
      .get() as { count: number };
    expect(nodeCount.count).toBe(0);

    closeDatabase(rootDb);
  });
});
