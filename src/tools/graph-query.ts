import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { DirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import { bfsFromNode } from "graphology-traversal";
import { getGraph } from "../graph/cache.js";
import {
  okResponse,
  errorResponse,
  isBootstrapped,
  buildMetadata,
} from "./helpers.js";

// ---- Types ----

interface NodeInfo {
  id: string;
  name: string;
  kind: string;
  filePath: string;
}

interface CommunityGroup {
  community_id: number;
  nodes: NodeInfo[];
}

// ---- Handler (extracted for testability) ----

/**
 * Core handler for codescope_graph_query.
 * Extracted from MCP registration for unit testing without transport.
 */
export async function handleGraphQuery(
  args: Record<string, unknown>,
  projectRoot: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startMs = Date.now();
  const queryType = args.query_type as string;
  const filePath = args.file_path as string | undefined;
  const nodeId = args.node_id as string | undefined;
  const targetFilePath = args.target_file_path as string | undefined;

  // Guard: NOT_BOOTSTRAPPED
  if (!isBootstrapped(projectRoot)) {
    return errorResponse(
      "NOT_BOOTSTRAPPED",
      "No bootstrap data found. The knowledge graph has not been built yet.",
      "Run /codescope:bootstrap to analyze your codebase.",
    );
  }

  try {
    const cached = await getGraph(projectRoot);
    const graph = cached.graph;

    // Resolve source node
    let resolvedNodeId: string | null = null;
    if (filePath) {
      const matches = graph.filterNodes(
        (_n: string, attr: Record<string, unknown>) =>
          attr.filePath === filePath && attr.kind === "file",
      );
      if (matches.length > 0) {
        resolvedNodeId = matches[0];
      }
    } else if (nodeId) {
      if (graph.hasNode(nodeId)) {
        resolvedNodeId = nodeId;
      }
    }

    // Handle each query type
    if (queryType === "neighbors") {
      if (!resolvedNodeId) {
        return errorResponse(
          "NODE_NOT_FOUND",
          `No file node found for path "${filePath ?? nodeId ?? "unknown"}".`,
          "Check the file path or node ID and try again. Use codescope_search to find valid nodes.",
        );
      }

      const neighborIds = graph.neighbors(resolvedNodeId);
      const neighbors: NodeInfo[] = neighborIds.map((nId: string) => {
        const attr = graph.getNodeAttributes(nId);
        return {
          id: nId,
          name: (attr.name as string) ?? nId,
          kind: (attr.kind as string) ?? "unknown",
          filePath: (attr.filePath as string) ?? "",
        };
      });

      return okResponse(
        {
          query_type: "neighbors",
          source: resolvedNodeId,
          neighbors,
          count: neighbors.length,
        },
        buildMetadata(projectRoot, startMs),
      );
    }

    if (queryType === "communities") {
      // Run Louvain community detection on the in-memory graph
      // (no database needed -- this is a read-only operation)
      const details = louvain.detailed(graph, { resolution: 1.0 });
      const communities = details.communities as Record<string, number>;

      // Group nodes by community
      const groups = new Map<number, NodeInfo[]>();
      for (const [nId, communityId] of Object.entries(communities)) {
        if (!graph.hasNode(nId)) continue;
        const attr = graph.getNodeAttributes(nId);
        const info: NodeInfo = {
          id: nId,
          name: (attr.name as string) ?? nId,
          kind: (attr.kind as string) ?? "unknown",
          filePath: (attr.filePath as string) ?? "",
        };
        if (!groups.has(communityId)) {
          groups.set(communityId, []);
        }
        groups.get(communityId)!.push(info);
      }

      const communityList: CommunityGroup[] = [];
      for (const [cId, nodes] of groups) {
        communityList.push({ community_id: cId, nodes });
      }

      return okResponse(
        {
          query_type: "communities",
          community_count: details.count,
          modularity: details.modularity,
          communities: communityList,
        },
        buildMetadata(projectRoot, startMs),
      );
    }

    if (queryType === "paths") {
      if (!resolvedNodeId) {
        return errorResponse(
          "NODE_NOT_FOUND",
          `No file node found for source path "${filePath ?? nodeId ?? "unknown"}".`,
          "Check the file path or node ID and try again. Use codescope_search to find valid nodes.",
        );
      }

      // Resolve target node
      let targetNodeId: string | null = null;
      if (targetFilePath) {
        const targetMatches = graph.filterNodes(
          (_n: string, attr: Record<string, unknown>) =>
            attr.filePath === targetFilePath && attr.kind === "file",
        );
        if (targetMatches.length > 0) {
          targetNodeId = targetMatches[0];
        }
      }

      if (!targetNodeId) {
        return errorResponse(
          "NODE_NOT_FOUND",
          `No file node found for target path "${targetFilePath ?? "unknown"}".`,
          "Provide a valid target_file_path. Use codescope_search to find valid nodes.",
        );
      }

      // BFS from source to target to find shortest path
      const parentMap = new Map<string, string | null>();
      parentMap.set(resolvedNodeId, null);
      let found = false;

      bfsFromNode(
        graph,
        resolvedNodeId,
        (node: string, _attr: Record<string, unknown>, depth: number) => {
          if (depth > 20) return true; // Safety limit

          // Record parent for path reconstruction
          if (node !== resolvedNodeId && !parentMap.has(node)) {
            // Find which neighbor led to this node
            const nodeNeighbors = graph.neighbors(node);
            for (const neighbor of nodeNeighbors) {
              if (parentMap.has(neighbor)) {
                parentMap.set(node, neighbor);
                break;
              }
            }
            // If no parent found yet, set from BFS traversal order
            if (!parentMap.has(node)) {
              parentMap.set(node, resolvedNodeId);
            }
          }

          if (node === targetNodeId) {
            found = true;
            return true; // Stop
          }

          return false;
        },
      );

      // Reconstruct path
      const pathNodes: NodeInfo[] = [];
      if (found) {
        let current: string | null = targetNodeId;
        while (current !== null) {
          const attr = graph.getNodeAttributes(current);
          pathNodes.unshift({
            id: current,
            name: (attr.name as string) ?? current,
            kind: (attr.kind as string) ?? "unknown",
            filePath: (attr.filePath as string) ?? "",
          });
          current = parentMap.get(current) ?? null;
        }
      }

      return okResponse(
        {
          query_type: "paths",
          source: resolvedNodeId,
          target: targetNodeId,
          path: pathNodes,
          length: pathNodes.length,
          connected: found,
        },
        buildMetadata(projectRoot, startMs),
      );
    }

    return errorResponse(
      "INVALID_QUERY_TYPE",
      `Unknown query type: "${queryType}". Valid types: neighbors, paths, communities.`,
      "Use one of: neighbors, paths, communities.",
    );
  } catch (err) {
    return errorResponse(
      "GRAPH_LOAD_FAILED",
      `Failed to load or query the knowledge graph: ${err instanceof Error ? err.message : String(err)}`,
      "Run /codescope:bootstrap to rebuild the knowledge graph.",
    );
  }
}

// ---- MCP Registration ----

/**
 * Register the codescope_graph_query MCP tool on the server.
 *
 * Per D-35: Rich description with use-case examples and related tools.
 */
export function registerGraphQueryTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_graph_query",
    "Query the knowledge graph for neighbors, paths, or community assignments. Use 'neighbors' to find directly connected symbols, 'communities' to see module groupings, 'paths' to trace dependency chains between two symbols. Related tools: codescope_blast_radius, codescope_search.",
    {
      query_type: z
        .enum(["neighbors", "paths", "communities"])
        .describe("Type of graph query to perform"),
      node_id: z
        .string()
        .optional()
        .describe("Node ID (graphology string key) to query from"),
      file_path: z
        .string()
        .optional()
        .describe("File path to find node by"),
      target_file_path: z
        .string()
        .optional()
        .describe("Target file path for 'paths' query type"),
    },
    async (args) => {
      return handleGraphQuery(args as Record<string, unknown>, projectRoot);
    },
  );
}
