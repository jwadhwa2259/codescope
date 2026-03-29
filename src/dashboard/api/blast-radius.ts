import { Hono } from "hono";
import * as fs from "node:fs";
import { openDatabase, closeDatabase } from "../../graph/database.js";
import {
  loadGraphFromSQLite,
  blastRadius,
  reverseBlastRadius,
  type BlastRadiusNode,
} from "../../graph/analytics.js";
import { getGraphDbPath } from "../../utils/paths.js";
import type { AppEnv } from "../server.js";

export const blastRadiusRouter = new Hono<AppEnv>();

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
  const projectRoot = c.get("projectRoot");
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

    // Find graph node ID for the given file path
    let nodeId: string | undefined;
    graph.forEachNode((id: string, attrs: Record<string, unknown>) => {
      if (attrs.filePath === filePath) {
        nodeId = id;
      }
    });

    if (!nodeId) {
      return c.json(
        {
          status: "error",
          code: "FILE_NOT_FOUND",
          message: `File ${filePath} not found in graph`,
        },
        404,
      );
    }

    const radiusNodes =
      direction === "reverse"
        ? reverseBlastRadius(graph, nodeId, 4)
        : blastRadius(graph, nodeId, 4);

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
