import { Hono } from "hono";
import * as fs from "node:fs";
import { openDatabase, closeDatabase } from "../../graph/database.js";
import {
  loadGraphFromSQLite,
  computeCentrality,
  computeDangerZones,
} from "../../graph/analytics.js";
import { getGraphDbPath } from "../../utils/paths.js";
import type { AppEnv } from "../server.js";

export const graphRouter = new Hono<AppEnv>();

/**
 * GET /graph
 *
 * Returns the full knowledge graph with node centrality, community assignments,
 * and danger zone flags. Pre-computes circular layout positions grouped by
 * community for immediate rendering (D-20).
 */
graphRouter.get("/", (c) => {
  const projectRoot = c.get("projectRoot");
  const dbPath = getGraphDbPath(projectRoot);

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

    // Read pre-computed communities from SQLite (computed during bootstrap)
    const communityRows = db
      .prepare(
        "SELECT node_id, community_id, modularity_class FROM communities",
      )
      .all() as Array<{
      node_id: string;
      community_id: number;
      modularity_class: string;
    }>;

    const communities: Record<string, number> = {};
    for (const row of communityRows) {
      communities[String(row.node_id)] = row.community_id;
    }

    const communitySet = new Set(Object.values(communities));
    const communityResult = {
      communityCount: communitySet.size,
      modularity: 0, // Not stored separately; 0 is acceptable for display
      communities,
    };

    const dangerZones = computeDangerZones(
      graph,
      centralities,
      communityResult.communities,
    );
    const dangerZoneSet = new Set(dangerZones.map((d) => d.filePath));

    // Group nodes by community for layout
    const communityGroups: Record<number, string[]> = {};
    const nodes: Array<Record<string, unknown>> = [];

    graph.forEachNode((id, attrs) => {
      const community = communityResult.communities[id] ?? 0;
      if (!communityGroups[community]) {
        communityGroups[community] = [];
      }
      communityGroups[community].push(id);

      nodes.push({
        id,
        ...attrs,
        centrality: centralities.get(id) ?? 0,
        community,
        isDangerZone: dangerZoneSet.has(attrs.filePath as string),
      });
    });

    // Pre-compute circular layout positions grouped by community (D-20)
    const communityIds = Object.keys(communityGroups).map(Number);
    const communityCount = communityIds.length;
    const layoutPositions: Record<string, { x: number; y: number }> = {};

    communityIds.forEach((commId, commIdx) => {
      const members = communityGroups[commId];
      // Place community groups around a large circle
      const groupAngle = (2 * Math.PI * commIdx) / Math.max(communityCount, 1);
      const groupRadius = 500;
      const groupCx = Math.cos(groupAngle) * groupRadius;
      const groupCy = Math.sin(groupAngle) * groupRadius;

      // Arrange members in a smaller circle within the group
      const memberRadius = Math.max(50, members.length * 8);
      members.forEach((nodeId, nodeIdx) => {
        const angle = (2 * Math.PI * nodeIdx) / members.length;
        layoutPositions[nodeId] = {
          x: groupCx + Math.cos(angle) * memberRadius,
          y: groupCy + Math.sin(angle) * memberRadius,
        };
      });
    });

    // Attach positions to nodes
    for (const node of nodes) {
      const pos = layoutPositions[node.id as string];
      if (pos) {
        node.x = pos.x;
        node.y = pos.y;
      }
    }

    const edges: Array<Record<string, unknown>> = [];
    graph.forEachEdge((id, attrs, source, target) => {
      edges.push({ id, source, target, ...attrs });
    });

    return c.json({
      status: "ok",
      data: {
        nodes,
        edges,
        communities: communityResult,
        dangerZones: dangerZones,
      },
    });
  } finally {
    closeDatabase(db);
  }
});
