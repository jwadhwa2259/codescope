/**
 * Builds the blast radius index from the knowledge graph.
 *
 * Computes BFS blast radius for each file node with centrality > 0.1
 * (skipping low-centrality files for performance). Returns a BlastRadiusIndex
 * keyed by relative file path for O(1) hook lookups.
 */

import type { Database as DatabaseType } from "better-sqlite3";
import {
  loadGraphFromSQLite,
  computeCentrality,
  blastRadius,
} from "../graph/analytics.js";
import type { BlastRadiusIndex, BlastRadiusFileEntry } from "./types.js";

/** Minimum centrality threshold for computing blast radius. */
const CENTRALITY_THRESHOLD = 0.1;

/** Maximum BFS hops for blast radius computation. */
const MAX_HOPS = 3;

/** Maximum number of top affected files to include per entry. */
const TOP_AFFECTED_LIMIT = 5;

/**
 * Build blast radius index from the graph database.
 *
 * Only computes blast radius for file nodes with centrality > 0.1
 * to avoid expensive BFS on low-centrality peripheral files.
 *
 * @param db - Open database connection with v2 schema
 * @returns BlastRadiusIndex with per-file blast radius data keyed by relative path
 */
export function buildBlastRadiusIndex(db: DatabaseType): BlastRadiusIndex {
  const graph = loadGraphFromSQLite(db);
  const { centralities } = computeCentrality(graph);

  const files: Record<string, BlastRadiusFileEntry> = {};

  graph.forEachNode((nodeId, attrs) => {
    if (attrs.kind !== "file") return;

    const centrality = centralities.get(nodeId) ?? 0;
    if (centrality <= CENTRALITY_THRESHOLD) return;

    const filePath = (attrs.filePath as string) ?? "";
    const brNodes = blastRadius(graph, nodeId, MAX_HOPS);

    // Classify results by risk level
    const byRisk = { red: 0, orange: 0, yellow: 0, green: 0 };
    const affectedFiles: Array<{ path: string; hop: number }> = [];

    for (const node of brNodes) {
      switch (node.risk) {
        case "Red":
          byRisk.red++;
          break;
        case "Orange":
          byRisk.orange++;
          break;
        case "Yellow":
          byRisk.yellow++;
          break;
        case "Green":
          byRisk.green++;
          break;
      }

      // Collect unique file paths (excluding the file itself) for topAffected
      if (node.filePath && node.filePath !== filePath && node.hop > 0) {
        // Only add if not already seen
        if (!affectedFiles.some((f) => f.path === node.filePath)) {
          affectedFiles.push({ path: node.filePath, hop: node.hop });
        }
      }
    }

    // Sort by hop ascending, take top 5
    affectedFiles.sort((a, b) => a.hop - b.hop);
    const topAffected = affectedFiles
      .slice(0, TOP_AFFECTED_LIMIT)
      .map((f) => f.path);

    files[filePath] = {
      totalAffected: brNodes.length,
      byRisk,
      topAffected,
    };
  });

  return {
    generated: new Date().toISOString(),
    files,
  };
}
