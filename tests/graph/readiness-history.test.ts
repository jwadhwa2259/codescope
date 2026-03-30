import { describe, it, expect, afterEach } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import * as crypto from "node:crypto";
import { openDatabase, closeDatabase } from "../../src/graph/database.js";
import { createSchema } from "../../src/graph/schema.js";
import {
  storeReadinessSnapshot,
  getLatestSnapshot,
  getSnapshotNear,
  type ReadinessSnapshot,
} from "../../src/graph/readiness-history.js";
import type { ReadinessScore } from "../../src/bootstrap/readiness.js";

function tmpDbPath(): string {
  return path.join(os.tmpdir(), `codescope-history-test-${crypto.randomUUID()}.db`);
}

/** Helper: build a mock ReadinessScore with known values */
function mockScore(overrides?: Partial<{
  grade: string;
  percent: number;
  conventionCoverage: number;
  typeSafety: number;
  testCoverageProxy: number;
  importGraphHealth: number;
}>): ReadinessScore {
  return {
    overall: {
      grade: overrides?.grade ?? "B+",
      percent: overrides?.percent ?? 87,
    },
    dimensions: {
      conventionCoverage: {
        percent: overrides?.conventionCoverage ?? 92,
        grade: "A-",
        delta: null,
        explainer: "test",
      },
      typeSafety: {
        percent: overrides?.typeSafety ?? 85,
        grade: "B",
        delta: null,
        explainer: "test",
      },
      testCoverageProxy: {
        percent: overrides?.testCoverageProxy ?? 78,
        grade: "C+",
        delta: null,
        explainer: "test",
      },
      importGraphHealth: {
        percent: overrides?.importGraphHealth ?? 93,
        grade: "A",
        delta: null,
        explainer: "test",
      },
    },
    improvements: [],
  };
}

describe("readiness-history", () => {
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

  it("storeReadinessSnapshot inserts a row with correct column values", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);

    const score = mockScore({
      grade: "A-",
      percent: 91,
      conventionCoverage: 95,
      typeSafety: 88,
      testCoverageProxy: 82,
      importGraphHealth: 99,
    });

    storeReadinessSnapshot(db, score);

    const row = db.prepare("SELECT * FROM readiness_history").get() as ReadinessSnapshot;
    expect(row).toBeDefined();
    expect(row.overall_grade).toBe("A-");
    expect(row.overall_percent).toBe(91);
    expect(row.convention_coverage).toBe(95);
    expect(row.type_safety).toBe(88);
    expect(row.test_coverage_proxy).toBe(82);
    expect(row.import_graph_health).toBe(99);
    expect(row.timestamp).toBeDefined();
    // Verify timestamp is a valid ISO 8601 string
    expect(new Date(row.timestamp).toISOString()).toBeTruthy();
  });

  it("storeReadinessSnapshot called twice inserts two separate rows", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);

    storeReadinessSnapshot(db, mockScore({ percent: 80 }));
    storeReadinessSnapshot(db, mockScore({ percent: 90 }));

    const rows = db.prepare("SELECT * FROM readiness_history ORDER BY id").all() as ReadinessSnapshot[];
    expect(rows).toHaveLength(2);
    expect(rows[0].overall_percent).toBe(80);
    expect(rows[1].overall_percent).toBe(90);
  });

  it("getLatestSnapshot returns the most recent row by timestamp", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);

    // Insert rows with explicit timestamps (older first)
    db.prepare(
      `INSERT INTO readiness_history
        (timestamp, overall_grade, overall_percent, convention_coverage, type_safety, test_coverage_proxy, import_graph_health)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("2026-03-01T00:00:00.000Z", "C", 73, 70, 65, 80, 77);

    db.prepare(
      `INSERT INTO readiness_history
        (timestamp, overall_grade, overall_percent, convention_coverage, type_safety, test_coverage_proxy, import_graph_health)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("2026-03-25T00:00:00.000Z", "B+", 87, 92, 85, 78, 93);

    const latest = getLatestSnapshot(db);
    expect(latest).not.toBeNull();
    expect(latest!.overall_grade).toBe("B+");
    expect(latest!.overall_percent).toBe(87);
    expect(latest!.timestamp).toBe("2026-03-25T00:00:00.000Z");
  });

  it("getLatestSnapshot returns null when table is empty", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);

    const result = getLatestSnapshot(db);
    expect(result).toBeNull();
  });

  it("getSnapshotNear returns the snapshot closest to (but not after) the given timestamp", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);

    // Insert three snapshots at known dates
    const insert = db.prepare(
      `INSERT INTO readiness_history
        (timestamp, overall_grade, overall_percent, convention_coverage, type_safety, test_coverage_proxy, import_graph_health)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run("2026-03-01T00:00:00.000Z", "C", 73, 70, 65, 80, 77);
    insert.run("2026-03-15T00:00:00.000Z", "B", 83, 80, 75, 85, 92);
    insert.run("2026-03-25T00:00:00.000Z", "B+", 87, 92, 85, 78, 93);

    // Query for March 20 -- should return March 15 snapshot (closest before target)
    const result = getSnapshotNear(db, "2026-03-20T00:00:00.000Z");
    expect(result).not.toBeNull();
    expect(result!.overall_grade).toBe("B");
    expect(result!.overall_percent).toBe(83);
    expect(result!.timestamp).toBe("2026-03-15T00:00:00.000Z");
  });

  it("getSnapshotNear returns null when no snapshot exists before the given timestamp", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);

    // Insert a snapshot at March 15
    db.prepare(
      `INSERT INTO readiness_history
        (timestamp, overall_grade, overall_percent, convention_coverage, type_safety, test_coverage_proxy, import_graph_health)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run("2026-03-15T00:00:00.000Z", "B", 83, 80, 75, 85, 92);

    // Query for March 1 -- no snapshot before this
    const result = getSnapshotNear(db, "2026-03-01T00:00:00.000Z");
    expect(result).toBeNull();
  });

  it("storeReadinessSnapshot with default scoring_version stores version 2", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);

    storeReadinessSnapshot(db, mockScore());

    const row = db.prepare("SELECT * FROM readiness_history").get() as ReadinessSnapshot;
    expect(row).toBeDefined();
    expect(row.scoring_version).toBe(2);
  });

  it("scoring_version column exists and old rows default to 1", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);

    // Insert a row without scoring_version (simulating old data)
    db.prepare(
      `INSERT INTO readiness_history
        (timestamp, overall_grade, overall_percent, convention_coverage, type_safety, test_coverage_proxy, import_graph_health)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run("2026-03-01T00:00:00.000Z", "C", 73, 70, 65, 80, 77);

    const row = db
      .prepare("SELECT * FROM readiness_history")
      .get() as ReadinessSnapshot;
    expect(row.scoring_version).toBe(1); // DEFAULT 1
  });

  it("getLatestSnapshot returns scoring_version field", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);

    storeReadinessSnapshot(db, mockScore({ percent: 87 }));

    const latest = getLatestSnapshot(db);
    expect(latest).not.toBeNull();
    expect(latest!.scoring_version).toBe(2);
  });

  it("getSnapshotNear with multiple snapshots returns the one closest to target time", () => {
    dbPath = tmpDbPath();
    db = openDatabase(dbPath);

    const insert = db.prepare(
      `INSERT INTO readiness_history
        (timestamp, overall_grade, overall_percent, convention_coverage, type_safety, test_coverage_proxy, import_graph_health)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    insert.run("2026-03-01T00:00:00.000Z", "C", 73, 70, 65, 80, 77);
    insert.run("2026-03-15T00:00:00.000Z", "B", 83, 80, 75, 85, 92);
    insert.run("2026-03-25T00:00:00.000Z", "B+", 87, 92, 85, 78, 93);

    // Query for March 26 -- should return March 25 (closest before)
    const near26 = getSnapshotNear(db, "2026-03-26T00:00:00.000Z");
    expect(near26).not.toBeNull();
    expect(near26!.timestamp).toBe("2026-03-25T00:00:00.000Z");

    // Query for exact match timestamp -- should return that snapshot
    const nearExact = getSnapshotNear(db, "2026-03-15T00:00:00.000Z");
    expect(nearExact).not.toBeNull();
    expect(nearExact!.timestamp).toBe("2026-03-15T00:00:00.000Z");
    expect(nearExact!.overall_grade).toBe("B");
  });
});
