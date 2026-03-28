/**
 * Builds the danger zone index from the knowledge graph.
 *
 * Loads the graph from SQLite, computes centrality and community detection,
 * then calls computeDangerZones() to get multi-signal risk entries.
 * Returns a DangerZoneIndex keyed by relative file path for O(1) hook lookups.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import {
  loadGraphFromSQLite,
  computeCentrality,
  computeDangerZones,
  runCommunityDetection,
} from "../graph/analytics.js";
import type { DangerZoneIndex, DangerZoneFileEntry } from "./types.js";

/**
 * Build danger zone index from the graph database.
 *
 * @param db - Open database connection with v2 schema
 * @returns DangerZoneIndex with per-file risk data keyed by relative path
 */
export function buildDangerZoneIndex(db: DatabaseType): DangerZoneIndex {
  const graph = loadGraphFromSQLite(db);
  const { centralities } = computeCentrality(graph);
  const { communities } = runCommunityDetection(graph, db);

  const dangerEntries = computeDangerZones(graph, centralities, communities);

  const files: Record<string, DangerZoneFileEntry> = {};
  for (const entry of dangerEntries) {
    files[entry.filePath] = {
      centrality: entry.inDegree,
      riskScore: entry.riskScore,
      communitiesTouched: entry.communitiesTouched,
      reasons: entry.reasons,
    };
  }

  return {
    generated: new Date().toISOString(),
    files,
  };
}
