import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getGraph } from "../graph/cache.js";
import {
  okResponse,
  errorResponse,
  partialResponse,
  isBootstrapped,
  buildMetadata,
} from "./helpers.js";

// ---- Constants ----

/** Maximum number of search results returned */
const MAX_RESULTS = 50;

/** Known edge types in the knowledge graph */
const EDGE_TYPES = [
  "IMPORTS",
  "CALLS",
  "EXTENDS",
  "IMPLEMENTS",
  "EXPORTS",
  "CONTAINS",
  "DECORATES",
  "TYPE_OF",
] as const;

// ---- Types ----

interface SearchResult {
  id: string;
  name: string;
  kind: string;
  filePath: string;
  centrality: number;
}

// ---- Handler (extracted for testability) ----

/**
 * Core handler for codescope_search.
 * Extracted from MCP registration for unit testing without transport.
 *
 * Per D-22: graph-based search only in Phase 3.
 * Per D-37/D-38: includes capabilities and upcoming metadata.
 */
export async function handleSearch(
  args: Record<string, unknown>,
  projectRoot: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startMs = Date.now();
  const query = args.query as string;
  const searchType = (args.search_type as string | undefined) ?? "graph";

  // Guard: NOT_BOOTSTRAPPED
  if (!isBootstrapped(projectRoot)) {
    return errorResponse(
      "NOT_BOOTSTRAPPED",
      "No bootstrap data found. The knowledge graph has not been built yet.",
      "Run /codescope:bootstrap to analyze your codebase.",
    );
  }

  const metadataExtras = {
    capabilities: ["graph"] as string[],
    upcoming: ["text", "hybrid"] as string[],
  };

  // If text or hybrid search requested, return partial with warning per D-37
  if (searchType === "text" || searchType === "hybrid") {
    return partialResponse(
      { query, results: [], total_matches: 0 },
      [
        "Text-based search not yet available. Showing graph results only.",
        `"${searchType}" search will be available in Phase 4.`,
      ],
      buildMetadata(projectRoot, startMs, metadataExtras),
    );
  }

  try {
    const cached = await getGraph(projectRoot);
    const graph = cached.graph;
    const centralities = cached.centralities;

    const queryLower = query.toLowerCase();
    const matches: SearchResult[] = [];

    // Check if query is an edge type
    const isEdgeTypeQuery = EDGE_TYPES.some(
      (et) => et.toLowerCase() === queryLower,
    );

    if (isEdgeTypeQuery) {
      // Find all nodes connected by edges of this type
      const matchedNodeIds = new Set<string>();

      graph.forEachEdge(
        (
          _edge: string,
          attr: Record<string, unknown>,
          source: string,
          target: string,
        ) => {
          if (
            (attr.kind as string)?.toLowerCase() === queryLower
          ) {
            matchedNodeIds.add(source);
            matchedNodeIds.add(target);
          }
        },
      );

      for (const nodeId of matchedNodeIds) {
        const attr = graph.getNodeAttributes(nodeId);
        matches.push({
          id: nodeId,
          name: (attr.name as string) ?? nodeId,
          kind: (attr.kind as string) ?? "unknown",
          filePath: (attr.filePath as string) ?? "",
          centrality: centralities.get(nodeId) ?? 0,
        });
      }
    } else {
      // Search by node name or file path (case-insensitive substring)
      graph.forEachNode(
        (nodeId: string, attr: Record<string, unknown>) => {
          const name = ((attr.name as string) ?? "").toLowerCase();
          const filePath = ((attr.filePath as string) ?? "").toLowerCase();

          if (name.includes(queryLower) || filePath.includes(queryLower)) {
            matches.push({
              id: nodeId,
              name: (attr.name as string) ?? nodeId,
              kind: (attr.kind as string) ?? "unknown",
              filePath: (attr.filePath as string) ?? "",
              centrality: centralities.get(nodeId) ?? 0,
            });
          }
        },
      );
    }

    // Sort by centrality descending
    matches.sort((a, b) => b.centrality - a.centrality);

    const totalMatches = matches.length;
    const limitedResults = matches.slice(0, MAX_RESULTS);

    // Empty results message per UI-SPEC
    if (totalMatches === 0) {
      return okResponse(
        {
          query,
          results: [],
          total_matches: 0,
          message: `No symbols matching "${query}" found in the knowledge graph.`,
        },
        buildMetadata(projectRoot, startMs, metadataExtras),
      );
    }

    return okResponse(
      {
        query,
        results: limitedResults,
        total_matches: totalMatches,
      },
      buildMetadata(projectRoot, startMs, metadataExtras),
    );
  } catch (err) {
    return errorResponse(
      "GRAPH_LOAD_FAILED",
      `Failed to search the knowledge graph: ${err instanceof Error ? err.message : String(err)}`,
      "Run /codescope:bootstrap to rebuild the knowledge graph.",
    );
  }
}

// ---- MCP Registration ----

/**
 * Register the codescope_search MCP tool on the server.
 *
 * Per D-35: Rich description with use-case examples and related tools.
 * Per D-22: Graph-based search only in Phase 3.
 * Per D-37/D-38: Partial functionality with capabilities/upcoming metadata.
 */
export function registerSearchTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_search",
    "Search the knowledge graph for symbols, files, or relationships. Phase 3 supports graph-based search only (by symbol name, file path, or relationship type). Text-based and hybrid search coming in Phase 4. Related tools: codescope_graph_query, codescope_recall.",
    {
      query: z
        .string()
        .describe(
          "Search query: symbol name, file path pattern, or relationship type (IMPORTS, CALLS, EXTENDS, etc.)",
        ),
      search_type: z
        .enum(["graph", "text", "hybrid"])
        .optional()
        .describe(
          "Search type (only 'graph' available in Phase 3, others return capability notice)",
        ),
    },
    async (args) => {
      return handleSearch(args as Record<string, unknown>, projectRoot);
    },
  );
}
