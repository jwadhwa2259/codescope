import { Hono } from "hono";
import * as fs from "node:fs";
import { openDatabase, closeDatabase } from "../../graph/database.js";
import {
  loadGraphFromSQLite,
  computeCentrality,
  blastRadius,
  reverseBlastRadius,
  type BlastRadiusNode,
} from "../../graph/analytics.js";
import { getGraphDbPath } from "../../utils/paths.js";

export const blastRadiusRouter = new Hono();

/**
 * Group blast radius nodes by hop distance for concentric ring visualization.
 */
function groupByRing(
  nodes: BlastRadiusNode[],
): Record<number, BlastRadiusNode[]> {
  const rings: Record<number, BlastRadiusNode[]> = {};
  for (const node of nodes) {
    if (!rings[node.hop]) {
      rings[node.hop] = [];
    }
    rings[node.hop].push(node);
  }
  return rings;
}

/**
 * GET /blast-radius/:file
 *
 * Returns blast radius data for a specific file, grouped by hop distance
 * for concentric ring visualization. Supports forward and reverse direction.
 *
 * Query params:
 * - direction: "forward" (default) | "reverse"
 */
blastRadiusRouter.get("/:file", (c) => {
  const projectRoot = c.get("projectRoot") as string;
  const dbPath = getGraphDbPath(projectRoot);
  const filePath = decodeURIComponent(c.req.param("file"));
  const direction = c.req.query("direction") ?? "forward";

  if (!fs.existsSync(dbPath)) {
    return c.json(
      {
        status: "error",
        code: "NOT_BOOTSTRAPPED",
        message: "No codebase data yet",
      },
      404,
    );
  }

  const db = openDatabase(dbPath);
  try {
    const graph = loadGraphFromSQLite(db);
    const { centralities } = computeCentrality(graph);

    const radiusNodes =
      direction === "reverse"
        ? reverseBlastRadius(graph, centralities, filePath, 4)
        : blastRadius(graph, centralities, filePath, 4);

    const rings = groupByRing(radiusNodes);

    return c.json({
      status: "ok",
      data: {
        file: filePath,
        direction,
        rings,
        totalAffected: radiusNodes.length,
      },
    });
  } finally {
    closeDatabase(db);
  }
});
