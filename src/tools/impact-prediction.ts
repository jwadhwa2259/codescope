import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { getGraph } from "../graph/cache.js";
import { reverseBlastRadius, type BlastRadiusNode } from "../graph/analytics.js";
import {
  okResponse,
  errorResponse,
  isBootstrapped,
  buildMetadata,
} from "./helpers.js";

// ---- Constants (per D-07, reuse thresholds from detect-changes) ----

/** Centrality threshold for HIGH risk classification */
const HIGH_RISK_THRESHOLD = 0.7;

/** Centrality threshold for MEDIUM risk classification */
const MEDIUM_RISK_THRESHOLD = 0.3;

// ---- Types ----

type RiskTier = "HIGH" | "MEDIUM" | "LOW";

interface ImpactResult {
  path: string;
  risk: RiskTier;
  centrality: number;
  total_impacted_by: number;
  reverse_blast_radius: BlastRadiusNode[];
}

// ---- Helpers ----

/**
 * Classify risk based on centrality score.
 * Per D-07: HIGH (>0.7), MEDIUM (0.3-0.7), LOW (<0.3)
 */
function classifyRisk(centrality: number): RiskTier {
  if (centrality > HIGH_RISK_THRESHOLD) return "HIGH";
  if (centrality >= MEDIUM_RISK_THRESHOLD) return "MEDIUM";
  return "LOW";
}

// ---- Handler (extracted for testability) ----

/**
 * Core handler for codescope_predict_impact.
 * Extracted from MCP registration for unit testing without transport.
 *
 * Computes reverse blast radius for each file path and classifies risk
 * based on centrality scores.
 */
export async function handlePredictImpact(
  args: Record<string, unknown>,
  projectRoot: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startMs = Date.now();
  const filePaths = args.file_paths as string[];
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
    const cached = await getGraph(projectRoot, filePaths);
    const graph = cached.graph;
    const centralities = cached.centralities;

    const results: ImpactResult[] = [];

    for (const filePath of filePaths) {
      // Find the file node in graph
      const matchingNodes = graph.filterNodes(
        (_n: string, attr: Record<string, unknown>) =>
          attr.filePath === filePath && attr.kind === "file",
      );

      if (matchingNodes.length > 0) {
        const nodeId = matchingNodes[0];
        const centrality = centralities.get(nodeId) ?? 0;
        const risk = classifyRisk(centrality);
        const rbr = reverseBlastRadius(graph, nodeId, maxHops);

        results.push({
          path: filePath,
          risk,
          centrality,
          total_impacted_by: rbr.length,
          reverse_blast_radius: rbr,
        });
      } else {
        // File not in graph: LOW risk, 0 centrality, empty blast radius
        results.push({
          path: filePath,
          risk: "LOW",
          centrality: 0,
          total_impacted_by: 0,
          reverse_blast_radius: [],
        });
      }
    }

    return okResponse(
      {
        file_paths: filePaths,
        max_hops: maxHops,
        results,
      },
      buildMetadata(projectRoot, startMs),
    );
  } catch (err) {
    return errorResponse(
      "GRAPH_LOAD_FAILED",
      `Failed to predict impact: ${err instanceof Error ? err.message : String(err)}`,
      "Run /codescope:bootstrap to rebuild the knowledge graph.",
    );
  }
}

// ---- MCP Registration ----

/**
 * Register the codescope_predict_impact MCP tool on the server.
 *
 * Per D-35: Rich description with use-case examples and related tools.
 */
export function registerPredictImpactTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_predict_impact",
    "Predict the impact of changing files by computing reverse blast radius -- finds all callers and importers up to N hops. Returns risk assessment per file. Related tools: codescope_blast_radius, codescope_detect_changes, codescope_review.",
    {
      file_paths: z
        .array(z.string())
        .min(1)
        .describe("File paths to predict impact for"),
      max_hops: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Maximum reverse BFS hops (default: 4)"),
    },
    async (args) => {
      return handlePredictImpact(args as Record<string, unknown>, projectRoot);
    },
  );
}
