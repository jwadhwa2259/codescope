import { DirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import { inDegreeCentrality } from "graphology-metrics/centrality/degree";
import { bfsFromNode } from "graphology-traversal";
import * as path from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";

// ---- Types ----

export type RiskLevel = "Red" | "Orange" | "Yellow" | "Green";

export interface BlastRadiusNode {
  nodeId: string;
  name: string;
  filePath: string;
  hop: number;
  risk: RiskLevel;
}

export interface CentralityResult {
  centralities: Map<string, number>; // nodeId -> normalized centrality 0-1
}

export interface CommunityResult {
  communityCount: number;
  modularity: number;
  communities: Record<string, number>; // nodeId -> communityId
}

export interface DangerZoneEntry {
  filePath: string;
  inDegree: number;
  communitiesTouched: number;
  riskScore: number;
  reasons: string[];
}

// ---- Graph Loading ----

/**
 * Loads the knowledge graph from SQLite into a graphology DirectedGraph.
 *
 * Nodes get attributes: name, kind, filePath, loc.
 * Edges get attributes: kind, weight.
 *
 * Uses mergeEdge to handle duplicate edges gracefully (per Pitfall 1 from RESEARCH.md).
 */
export function loadGraphFromSQLite(db: DatabaseType): DirectedGraph {
  const graph = new DirectedGraph();

  // Load all nodes
  const nodes = db
    .prepare("SELECT id, name, kind, file_path, loc FROM nodes")
    .all() as Array<{
    id: number;
    name: string;
    kind: string;
    file_path: string;
    loc: number | null;
  }>;

  for (const node of nodes) {
    graph.addNode(String(node.id), {
      name: node.name,
      kind: node.kind,
      filePath: node.file_path,
      loc: node.loc ?? 0,
    });
  }

  // Load all edges using mergeEdge to handle duplicates
  const edges = db
    .prepare("SELECT source_id, target_id, kind, weight FROM edges")
    .all() as Array<{
    source_id: number;
    target_id: number;
    kind: string;
    weight: number;
  }>;

  for (const edge of edges) {
    const sourceId = String(edge.source_id);
    const targetId = String(edge.target_id);

    // Only add edge if both nodes exist in the graph
    if (graph.hasNode(sourceId) && graph.hasNode(targetId)) {
      graph.mergeEdge(sourceId, targetId, {
        kind: edge.kind,
        weight: edge.weight,
      });
    }
  }

  return graph;
}

// ---- Centrality ----

/**
 * Computes in-degree centrality for all nodes in the graph.
 * Returns normalized 0-1 scores where the node with the most incoming edges
 * has centrality 1.0.
 *
 * Also assigns centrality values to node attributes as "inDegree".
 */
export function computeCentrality(graph: DirectedGraph): CentralityResult {
  // inDegreeCentrality returns Record<string, number>
  const raw = inDegreeCentrality(graph) as Record<string, number>;

  // Also assign to node attributes for later use
  inDegreeCentrality.assign(graph);

  const centralities = new Map<string, number>();
  for (const [nodeId, score] of Object.entries(raw)) {
    centralities.set(nodeId, score);
  }

  return { centralities };
}

// ---- Community Detection ----

/**
 * Derives a human-readable label for a community based on the most common
 * directory path among its member nodes.
 *
 * Extracts the first 2 path segments (e.g., "src/parser" from "src/parser/extract.ts")
 * and returns the most frequently occurring directory.
 */
function deriveCommunityLabel(
  graph: DirectedGraph,
  communityId: number,
  communities: Record<string, number>
): string {
  const dirCounts = new Map<string, number>();

  for (const [nodeId, cId] of Object.entries(communities)) {
    if (cId !== communityId) continue;

    if (!graph.hasNode(nodeId)) continue;
    const filePath = graph.getNodeAttribute(nodeId, "filePath") as
      | string
      | undefined;
    if (!filePath) continue;

    // Extract first 2 path segments
    const parts = filePath.split(path.sep);
    // Use forward slash for consistency (paths stored with forward slash)
    const fwdParts = filePath.split("/");
    const segments = fwdParts.length >= 2 ? fwdParts.slice(0, 2) : fwdParts;
    const dir = segments.join("/");

    dirCounts.set(dir, (dirCounts.get(dir) ?? 0) + 1);
  }

  if (dirCounts.size === 0) return "unknown";

  // Return the most common directory
  let maxDir = "unknown";
  let maxCount = 0;
  for (const [dir, count] of dirCounts) {
    if (count > maxCount) {
      maxCount = count;
      maxDir = dir;
    }
  }

  return maxDir;
}

/**
 * Runs Louvain community detection on the graph and writes results to SQLite.
 *
 * Per D-20: modularity_class is a human-readable label derived from the most
 * common directory/namespace in each community.
 */
export function runCommunityDetection(
  graph: DirectedGraph,
  db: DatabaseType
): CommunityResult {
  const details = louvain.detailed(graph, { resolution: 1.0 });

  // Clear existing communities
  db.prepare("DELETE FROM communities").run();

  // Write to SQLite communities table in a transaction
  const insert = db.prepare(
    "INSERT INTO communities (node_id, community_id, modularity_class) VALUES (?, ?, ?)"
  );

  const writeAll = db.transaction(() => {
    for (const [nodeId, communityId] of Object.entries(details.communities)) {
      const label = deriveCommunityLabel(
        graph,
        communityId as number,
        details.communities as Record<string, number>
      );
      insert.run(Number(nodeId), communityId, label);
    }
  });
  writeAll();

  return {
    communityCount: details.count,
    modularity: details.modularity,
    communities: details.communities as Record<string, number>,
  };
}

// ---- Blast Radius ----

/**
 * Computes the blast radius from a given node using BFS traversal.
 *
 * Classification (per GRPH-04):
 * - Hop 0: Red (the changed node itself)
 * - Hop 1: Orange (directly affected)
 * - Hop 2: Yellow (indirectly affected)
 * - Hop 3+: Green (peripherally affected)
 *
 * @param maxHops Maximum traversal depth (default 4)
 */
export function blastRadius(
  graph: DirectedGraph,
  nodeId: string,
  maxHops: number = 4
): BlastRadiusNode[] {
  if (!graph.hasNode(nodeId)) return [];

  const results: BlastRadiusNode[] = [];

  bfsFromNode(
    graph,
    nodeId,
    (node: string, attr: Record<string, unknown>, depth: number) => {
      if (depth > maxHops) return true; // Stop traversal

      let risk: RiskLevel;
      if (depth === 0) risk = "Red";
      else if (depth === 1) risk = "Orange";
      else if (depth === 2) risk = "Yellow";
      else risk = "Green";

      results.push({
        nodeId: node,
        name: (attr.name as string) ?? node,
        filePath: (attr.filePath as string) ?? "",
        hop: depth,
        risk,
      });

      return false; // Continue traversal
    }
  );

  // Sort by hop ascending
  results.sort((a, b) => a.hop - b.hop);

  return results;
}

// ---- Reverse Blast Radius ----

/**
 * Computes the reverse blast radius from a given node using BFS traversal
 * with inbound edge direction. This finds all callers/importers of a file
 * (upstream dependents), as opposed to blastRadius() which finds downstream
 * dependents.
 *
 * Classification (same hop-distance rules as blastRadius per D-06):
 * - Hop 0: Red (the target node itself)
 * - Hop 1: Orange (direct importers/callers)
 * - Hop 2: Yellow (indirect importers)
 * - Hop 3+: Green (distant upstream dependents)
 *
 * @param maxHops Maximum traversal depth (default 4)
 */
export function reverseBlastRadius(
  graph: DirectedGraph,
  nodeId: string,
  maxHops: number = 4,
): BlastRadiusNode[] {
  if (!graph.hasNode(nodeId)) return [];

  const results: BlastRadiusNode[] = [];

  bfsFromNode(
    graph,
    nodeId,
    (node: string, attr: Record<string, unknown>, depth: number) => {
      if (depth > maxHops) return true; // Stop traversal

      let risk: RiskLevel;
      if (depth === 0) risk = "Red";
      else if (depth === 1) risk = "Orange";
      else if (depth === 2) risk = "Yellow";
      else risk = "Green";

      results.push({
        nodeId: node,
        name: (attr.name as string) ?? node,
        filePath: (attr.filePath as string) ?? "",
        hop: depth,
        risk,
      });

      return false; // Continue traversal
    },
    { mode: "inbound" },
  );

  // Sort by hop ascending
  results.sort((a, b) => a.hop - b.hop);

  return results;
}

// ---- Danger Zones ----

/**
 * Computes danger zones by combining multiple signals:
 * - In-degree centrality (how many things depend on this file)
 * - Cross-boundary edges (touches multiple communities)
 * - File size (LOC)
 *
 * Per D-16: multi-signal scoring for danger zone detection.
 * Returns entries sorted by riskScore descending.
 */
export function computeDangerZones(
  graph: DirectedGraph,
  centralities: Map<string, number>,
  communities: Record<string, number>
): DangerZoneEntry[] {
  const entries: DangerZoneEntry[] = [];

  // Find max communities for normalization
  const communitySet = new Set(Object.values(communities));
  const maxCommunities = Math.max(communitySet.size, 1);

  // Find max LOC for normalization
  let maxLoc = 1;
  graph.forEachNode((_node, attrs) => {
    if (attrs.kind === "file") {
      const loc = (attrs.loc as number) ?? 0;
      if (loc > maxLoc) maxLoc = loc;
    }
  });

  graph.forEachNode((node, attrs) => {
    if (attrs.kind !== "file") return;

    const filePath = (attrs.filePath as string) ?? "";
    const centrality = centralities.get(node) ?? 0;
    const loc = (attrs.loc as number) ?? 0;

    // Count how many distinct communities this node's neighbors belong to
    const neighborCommunities = new Set<number>();
    graph.forEachNeighbor(node, (neighbor) => {
      const community = communities[neighbor];
      if (community !== undefined) {
        neighborCommunities.add(community);
      }
    });
    const communitiesTouched = neighborCommunities.size;

    // Calculate risk score (multi-signal)
    const normalizedLoc = loc / maxLoc;
    const riskScore =
      centrality * 0.5 +
      (communitiesTouched / maxCommunities) * 0.3 +
      normalizedLoc * 0.2;

    // Build reasons
    const reasons: string[] = [];
    if (centrality > 0.1) {
      reasons.push(`High in-degree centrality (${centrality.toFixed(3)})`);
    }
    if (communitiesTouched > 1) {
      reasons.push(`Touches ${communitiesTouched} communities`);
    }
    if (loc > 500) {
      reasons.push(`Large file (${loc} lines)`);
    }

    entries.push({
      filePath,
      inDegree: centrality,
      communitiesTouched,
      riskScore,
      reasons,
    });
  });

  // Sort by riskScore descending
  entries.sort((a, b) => b.riskScore - a.riskScore);

  return entries;
}
