import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getGraph } from "../graph/cache.js";
import { blastRadius } from "../graph/analytics.js";
import {
  okResponse,
  errorResponse,
  isBootstrapped,
  buildMetadata,
} from "./helpers.js";

// ---- Handler (extracted for testability) ----

/**
 * Core handler for codescope_blast_radius.
 * Extracted from MCP registration for unit testing without transport.
 */
export async function handleBlastRadius(
  args: Record<string, unknown>,
  projectRoot: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startMs = Date.now();
  const filePath = args.file_path as string;
  const maxHops = (args.max_hops as number | undefined) ?? 4;

  // Guard: NOT_BOOTSTRAPPED
  if (!isBootstrapped(projectRoot)) {
    return errorResponse(
      "NOT_BOOTSTRAPPED",
      "No bootstrap data found. The knowledge graph has not been built yet.",
      "Run /codescope:bootstrap to analyze your codebase.",
    );
  }

  try {
    const cached = getGraph(projectRoot);
    const graph = cached.graph;

    // Find the file node
    const matchingNodes = graph.filterNodes(
      (_n: string, attr: Record<string, unknown>) =>
        attr.filePath === filePath && attr.kind === "file",
    );

    if (matchingNodes.length === 0) {
      return errorResponse(
        "NODE_NOT_FOUND",
        `No file node found for path "${filePath}".`,
        "Check the file path and try again. Use codescope_search to find valid files.",
      );
    }

    // Compute blast radius using analytics.ts
    const results = blastRadius(graph, matchingNodes[0], maxHops);

    return okResponse(
      {
        file_path: filePath,
        max_hops: maxHops,
        total_affected: results.length,
        nodes: results,
      },
      buildMetadata(projectRoot, startMs),
    );
  } catch (err) {
    return errorResponse(
      "GRAPH_LOAD_FAILED",
      `Failed to compute blast radius: ${err instanceof Error ? err.message : String(err)}`,
      "Run /codescope:bootstrap to rebuild the knowledge graph.",
    );
  }
}

// ---- MCP Registration ----

/**
 * Register the codescope_blast_radius MCP tool on the server.
 *
 * Per D-35: Rich description with use-case examples and related tools.
 */
export function registerBlastRadiusTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_blast_radius",
    "Compute the blast radius of changes to a file via BFS graph traversal. Returns hop-distance classification: Red (hop 0, direct change), Orange (hop 1, immediate dependents), Yellow (hop 2, indirect), Green (hop 3+, distant). Related tools: codescope_graph_query, codescope_detect_changes.",
    {
      file_path: z
        .string()
        .describe("File to compute blast radius for"),
      max_hops: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum BFS hops (default: 4)"),
    },
    async (args) => {
      return handleBlastRadius(args as Record<string, unknown>, projectRoot);
    },
  );
}
