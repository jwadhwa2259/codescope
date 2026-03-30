import type { Database as DatabaseType } from "better-sqlite3";
import type { ReadinessScore } from "../bootstrap/readiness.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * A point-in-time readiness snapshot stored in the readiness_history table.
 * One row is inserted after every bootstrap/incremental update.
 */
export interface ReadinessSnapshot {
  id: number;
  timestamp: string; // ISO 8601
  overall_grade: string;
  overall_percent: number;
  convention_coverage: number;
  type_safety: number;
  test_coverage_proxy: number;
  import_graph_health: number;
  scoring_version: number; // 1 = v2.0 estimation, 2 = v2.1 actual data
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

/**
 * Stores a readiness snapshot in the readiness_history table.
 *
 * Called after every bootstrap completion to track readiness trends
 * over time (DEBT-01). Each call inserts a new row -- no upsert.
 */
export function storeReadinessSnapshot(
  db: DatabaseType,
  score: ReadinessScore,
  scoringVersion: number = 2,
): void {
  const stmt = db.prepare(
    `INSERT INTO readiness_history
      (timestamp, overall_grade, overall_percent, convention_coverage, type_safety, test_coverage_proxy, import_graph_health, scoring_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  stmt.run(
    new Date().toISOString(),
    score.overall.grade,
    score.overall.percent,
    score.dimensions.conventionCoverage.percent,
    score.dimensions.typeSafety.percent,
    score.dimensions.testCoverageProxy.percent,
    score.dimensions.importGraphHealth.percent,
    scoringVersion,
  );
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

/**
 * Returns the most recent readiness snapshot, or null if none exist.
 */
export function getLatestSnapshot(db: DatabaseType): ReadinessSnapshot | null {
  const row = db
    .prepare("SELECT * FROM readiness_history ORDER BY timestamp DESC LIMIT 1")
    .get() as ReadinessSnapshot | undefined;

  return row ?? null;
}

/**
 * Returns the snapshot closest to (but not after) the given timestamp.
 *
 * Uses `WHERE timestamp <= ?` with `ORDER BY timestamp DESC LIMIT 1`
 * to find the nearest snapshot at or before the target time.
 *
 * Returns null if no snapshot exists before the target timestamp.
 */
export function getSnapshotNear(
  db: DatabaseType,
  targetTimestamp: string,
): ReadinessSnapshot | null {
  const row = db
    .prepare(
      "SELECT * FROM readiness_history WHERE timestamp <= ? ORDER BY timestamp DESC LIMIT 1",
    )
    .get(targetTimestamp) as ReadinessSnapshot | undefined;

  return row ?? null;
}
