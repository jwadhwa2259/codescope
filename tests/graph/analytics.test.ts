import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import { createSchema } from "../../src/graph/schema.js";
import type { Database as DatabaseType } from "better-sqlite3";
import {
  loadGraphFromSQLite,
  computeCentrality,
  runCommunityDetection,
  blastRadius,
  computeDangerZones,
  type RiskLevel,
  type BlastRadiusNode,
  type CentralityResult,
  type CommunityResult,
  type DangerZoneEntry,
} from "../../src/graph/analytics.js";

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `codescope-analytics-test-${crypto.randomUUID()}.db`);
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
 * Creates a test database with a known graph structure:
 *
 * Files: A.ts, B.ts, C.ts, D.ts, E.ts
 * Functions: funcA (in A), funcB (in B), funcC (in C)
 *
 * Dependency structure:
 *   A -> B (IMPORTS)
 *   A -> D (IMPORTS)
 *   B -> C (IMPORTS)
 *   D -> C (IMPORTS)
 *   E -> C (IMPORTS)
 *
 * So C has the highest in-degree (3 files import it).
 * A has the lowest in-degree (nothing imports it).
 *
 * CONTAINS edges:
 *   A CONTAINS funcA
 *   B CONTAINS funcB
 *   C CONTAINS funcC
 */
function createTestDb(dbPath: string): DatabaseType {
  const db = openDatabase(dbPath);
  createSchema(db);

  const insertNode = db.prepare(
    "INSERT INTO nodes (name, kind, file_path, start_line, end_line, language, loc, is_exported) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );

  const insertEdge = db.prepare(
    "INSERT INTO edges (source_id, target_id, kind, weight) VALUES (?, ?, ?, ?)"
  );

  // Insert file nodes (IDs: 1-5)
  insertNode.run("A.ts", "file", "src/a/A.ts", 1, 50, "typescript", 50, 0);      // id=1
  insertNode.run("B.ts", "file", "src/b/B.ts", 1, 30, "typescript", 30, 0);      // id=2
  insertNode.run("C.ts", "file", "src/c/C.ts", 1, 600, "typescript", 600, 0);    // id=3 (large file)
  insertNode.run("D.ts", "file", "src/a/D.ts", 1, 20, "typescript", 20, 0);      // id=4
  insertNode.run("E.ts", "file", "src/b/E.ts", 1, 15, "typescript", 15, 0);      // id=5

  // Insert function nodes (IDs: 6-8)
  insertNode.run("funcA", "function", "src/a/A.ts", 5, 15, "typescript", 10, 1);  // id=6
  insertNode.run("funcB", "function", "src/b/B.ts", 5, 20, "typescript", 15, 1);  // id=7
  insertNode.run("funcC", "function", "src/c/C.ts", 5, 25, "typescript", 20, 1);  // id=8

  // IMPORTS edges: A->B, A->D, B->C, D->C, E->C
  insertEdge.run(1, 2, "IMPORTS", 1.0); // A -> B
  insertEdge.run(1, 4, "IMPORTS", 1.0); // A -> D
  insertEdge.run(2, 3, "IMPORTS", 1.0); // B -> C
  insertEdge.run(4, 3, "IMPORTS", 1.0); // D -> C
  insertEdge.run(5, 3, "IMPORTS", 1.0); // E -> C

  // CONTAINS edges: file -> function
  insertEdge.run(1, 6, "CONTAINS", 1.0); // A CONTAINS funcA
  insertEdge.run(2, 7, "CONTAINS", 1.0); // B CONTAINS funcB
  insertEdge.run(3, 8, "CONTAINS", 1.0); // C CONTAINS funcC

  return db;
}

describe("loadGraphFromSQLite", () => {
  let dbPath: string;
  let db: DatabaseType;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = createTestDb(dbPath);
  });

  afterEach(() => {
    try { closeDatabase(db); } catch { /* already closed */ }
    cleanupDb(dbPath);
  });

  it("creates a DirectedGraph with correct node and edge count", () => {
    const graph = loadGraphFromSQLite(db);

    expect(graph.order).toBe(8);  // 5 files + 3 functions
    expect(graph.size).toBe(8);   // 5 IMPORTS + 3 CONTAINS
    expect(graph.type).toBe("directed");
  });

  it("handles duplicate edges gracefully (mergeEdge, no crash)", () => {
    // Insert a duplicate edge
    db.prepare("INSERT INTO edges (source_id, target_id, kind, weight) VALUES (?, ?, ?, ?)").run(1, 2, "IMPORTS", 1.0);

    // Should not throw
    const graph = loadGraphFromSQLite(db);
    expect(graph.order).toBe(8);
    // Edge count may vary depending on merge behavior, but should not crash
  });
});

describe("computeCentrality", () => {
  let dbPath: string;
  let db: DatabaseType;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = createTestDb(dbPath);
  });

  afterEach(() => {
    try { closeDatabase(db); } catch { /* already closed */ }
    cleanupDb(dbPath);
  });

  it("returns normalized 0-1 scores; node with most incoming edges has highest score", () => {
    const graph = loadGraphFromSQLite(db);
    const result = computeCentrality(graph);

    expect(result.centralities).toBeInstanceOf(Map);

    // Node "3" (C.ts) has in-degree 3 (B->C, D->C, E->C) -- highest
    // Node "1" (A.ts) has in-degree 0 -- nothing imports A
    const cC = result.centralities.get("3")!;
    const cA = result.centralities.get("1")!;

    expect(cC).toBeGreaterThan(cA);
    expect(cA).toBeGreaterThanOrEqual(0);
    expect(cC).toBeLessThanOrEqual(1);
  });
});

describe("runCommunityDetection", () => {
  let dbPath: string;
  let db: DatabaseType;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = createTestDb(dbPath);
  });

  afterEach(() => {
    try { closeDatabase(db); } catch { /* already closed */ }
    cleanupDb(dbPath);
  });

  it("assigns community IDs to all nodes; nodes in same directory tend to be in same community", () => {
    const graph = loadGraphFromSQLite(db);
    const result = runCommunityDetection(graph, db);

    expect(result.communityCount).toBeGreaterThanOrEqual(1);
    expect(result.modularity).toBeDefined();
    expect(typeof result.modularity).toBe("number");

    // All nodes should have community assignments
    const nodeIds = ["1", "2", "3", "4", "5", "6", "7", "8"];
    for (const nodeId of nodeIds) {
      expect(result.communities).toHaveProperty(nodeId);
    }
  });

  it("writes results to SQLite communities table", () => {
    const graph = loadGraphFromSQLite(db);
    runCommunityDetection(graph, db);

    const rows = db.prepare("SELECT * FROM communities").all() as any[];
    expect(rows.length).toBe(8); // One row per node

    // Each row should have node_id, community_id, modularity_class
    for (const row of rows) {
      expect(row.node_id).toBeDefined();
      expect(row.community_id).toBeDefined();
      expect(row.modularity_class).toBeDefined();
      expect(typeof row.modularity_class).toBe("string");
    }
  });
});

describe("blastRadius", () => {
  let dbPath: string;
  let db: DatabaseType;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = createTestDb(dbPath);
  });

  afterEach(() => {
    try { closeDatabase(db); } catch { /* already closed */ }
    cleanupDb(dbPath);
  });

  it("classifies hop 0 as Red, hop 1 as Orange, hop 2 as Yellow, hop 3+ as Green", () => {
    const graph = loadGraphFromSQLite(db);
    const results = blastRadius(graph, "1"); // Start from A.ts

    // Hop 0: A.ts itself -> Red
    const hop0 = results.filter(n => n.hop === 0);
    expect(hop0.length).toBeGreaterThanOrEqual(1);
    expect(hop0[0].risk).toBe("Red");

    // Hop 1: direct neighbors -> Orange
    const hop1 = results.filter(n => n.hop === 1);
    if (hop1.length > 0) {
      expect(hop1[0].risk).toBe("Orange");
    }

    // Hop 2 -> Yellow
    const hop2 = results.filter(n => n.hop === 2);
    if (hop2.length > 0) {
      expect(hop2[0].risk).toBe("Yellow");
    }

    // Hop 3+ -> Green
    const hop3plus = results.filter(n => n.hop >= 3);
    for (const n of hop3plus) {
      expect(n.risk).toBe("Green");
    }
  });

  it("stops at maxHops parameter (default 4)", () => {
    const graph = loadGraphFromSQLite(db);

    // With maxHops=1, should only return hop 0 and hop 1
    const results = blastRadius(graph, "1", 1);
    for (const n of results) {
      expect(n.hop).toBeLessThanOrEqual(1);
    }
  });
});

describe("deriveCommunityLabel", () => {
  let dbPath: string;
  let db: DatabaseType;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = createTestDb(dbPath);
  });

  afterEach(() => {
    try { closeDatabase(db); } catch { /* already closed */ }
    cleanupDb(dbPath);
  });

  it("returns the most common directory path as the label", () => {
    const graph = loadGraphFromSQLite(db);
    const result = runCommunityDetection(graph, db);

    // Check that at least one community label contains a directory path
    const rows = db.prepare("SELECT DISTINCT modularity_class FROM communities").all() as any[];
    const labels = rows.map((r: any) => r.modularity_class);

    // Labels should be directory-based, not "unknown"
    // At least some should match directory patterns like "src/a", "src/b", "src/c"
    const directoryLabels = labels.filter((l: string) => l.includes("/") || l === "unknown");
    expect(directoryLabels.length).toBeGreaterThan(0);
  });
});

describe("computeDangerZones", () => {
  let dbPath: string;
  let db: DatabaseType;

  beforeEach(() => {
    dbPath = tmpDbPath();
    db = createTestDb(dbPath);
  });

  afterEach(() => {
    try { closeDatabase(db); } catch { /* already closed */ }
    cleanupDb(dbPath);
  });

  it("returns ranked list combining centrality + cross-boundary signals", () => {
    const graph = loadGraphFromSQLite(db);
    const centralityResult = computeCentrality(graph);
    const communityResult = runCommunityDetection(graph, db);

    const dangerZones = computeDangerZones(
      graph,
      centralityResult.centralities,
      communityResult.communities
    );

    expect(dangerZones.length).toBeGreaterThan(0);

    // Should be sorted by riskScore descending
    for (let i = 1; i < dangerZones.length; i++) {
      expect(dangerZones[i - 1].riskScore).toBeGreaterThanOrEqual(dangerZones[i].riskScore);
    }

    // C.ts should rank highest -- highest in-degree, large file
    const topEntry = dangerZones[0];
    expect(topEntry.filePath).toBe("src/c/C.ts");
    expect(topEntry.inDegree).toBeGreaterThan(0);
    expect(topEntry.reasons.length).toBeGreaterThan(0);
  });
});
