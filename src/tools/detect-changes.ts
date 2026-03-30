import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import { execSync } from "node:child_process";
import { getGraph } from "../graph/cache.js";
import { blastRadius } from "../graph/analytics.js";
import {
  okResponse,
  errorResponse,
  partialResponse,
  isBootstrapped,
  buildMetadata,
} from "./helpers.js";

// ---- Constants (per D-23) ----

/** Centrality threshold for HIGH risk classification */
const HIGH_RISK_THRESHOLD = 0.7;

/** Centrality threshold for MEDIUM risk classification */
const MEDIUM_RISK_THRESHOLD = 0.3;

// ---- Types ----

type RiskTier = "HIGH" | "MEDIUM" | "LOW";

interface ChangedFile {
  path: string;
  risk: RiskTier;
  centrality: number;
  blast_radius_count: number;
}

interface ChangeSummary {
  total: number;
  high: number;
  medium: number;
  low: number;
}

// ---- Helpers ----

/**
 * Classify risk based on centrality score.
 * Per D-23: HIGH (>0.7), MEDIUM (0.3-0.7), LOW (<0.3)
 */
function classifyRisk(centrality: number): RiskTier {
  if (centrality > HIGH_RISK_THRESHOLD) return "HIGH";
  if (centrality >= MEDIUM_RISK_THRESHOLD) return "MEDIUM";
  return "LOW";
}

/**
 * Parse file paths from a git diff string.
 * Extracts paths from "diff --git a/path b/path" lines.
 */
function parseFilesFromDiff(diff: string): string[] {
  const files = new Set<string>();
  const lines = diff.split("\n");

  for (const line of lines) {
    // Match "diff --git a/path b/path"
    const match = line.match(/^diff --git a\/(.+?) b\/(.+?)$/);
    if (match) {
      files.add(match[2]); // Use the "b/" path (new file path)
    }
  }

  return Array.from(files);
}

/**
 * Get changed files from git diff in the working directory.
 */
function getWorkingDirChanges(projectRoot: string): string[] {
  try {
    const output = execSync("git diff --name-only HEAD", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  } catch {
    // If git diff fails (no commits, not a repo, etc.), return empty
    return [];
  }
}

// ---- Handler (extracted for testability) ----

/**
 * Core handler for codescope_detect_changes.
 * Extracted from MCP registration for unit testing without transport.
 *
 * Per D-23: Risk classification using centrality tiers.
 * Per D-24: Includes blast_radius_count per file (not full affected list).
 */
export async function handleDetectChanges(
  args: Record<string, unknown>,
  projectRoot: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startMs = Date.now();
  const diffInput = args.diff as string | undefined;

  // Guard: NOT_BOOTSTRAPPED
  if (!isBootstrapped(projectRoot)) {
    return errorResponse(
      "NOT_BOOTSTRAPPED",
      "No bootstrap data found. The knowledge graph has not been built yet.",
      "Run /codescope:bootstrap to analyze your codebase.",
    );
  }

  try {
    // Get changed files
    const changedFiles = diffInput
      ? parseFilesFromDiff(diffInput)
      : getWorkingDirChanges(projectRoot);

    const cached = await getGraph(projectRoot);
    const graph = cached.graph;
    const centralities = cached.centralities;

    // Check for incomplete graph (GRAPH-06 per D-02)
    if (graph.size === 0) {
      return partialResponse(
        {
          changed_files: changedFiles.map((p) => ({ path: p })),
          summary: { total: changedFiles.length, high: 0, medium: 0, low: 0 },
          risk_level: "UNKNOWN",
          graph_incomplete: true,
        },
        [
          "GRAPH_INCOMPLETE: Import graph has 0 edges. " +
          "Risk assessment is unreliable because no import relationships were found. " +
          "Run /codescope:bootstrap to rebuild the knowledge graph.",
        ],
        buildMetadata(projectRoot, startMs),
      );
    }

    const results: ChangedFile[] = [];

    for (const filePath of changedFiles) {
      // Find file node in graph
      const matchingNodes = graph.filterNodes(
        (_n: string, attr: Record<string, unknown>) =>
          attr.filePath === filePath && attr.kind === "file",
      );

      if (matchingNodes.length > 0) {
        const nodeId = matchingNodes[0];
        const centrality = centralities.get(nodeId) ?? 0;
        const risk = classifyRisk(centrality);

        // Get blast radius count per D-24
        const blastNodes = blastRadius(graph, nodeId, 4);
        const blastCount = blastNodes.length;

        results.push({
          path: filePath,
          risk,
          centrality,
          blast_radius_count: blastCount,
        });
      } else {
        // File not in graph: LOW risk, 0 blast radius
        results.push({
          path: filePath,
          risk: "LOW",
          centrality: 0,
          blast_radius_count: 0,
        });
      }
    }

    // Build summary
    const summary: ChangeSummary = {
      total: results.length,
      high: results.filter((r) => r.risk === "HIGH").length,
      medium: results.filter((r) => r.risk === "MEDIUM").length,
      low: results.filter((r) => r.risk === "LOW").length,
    };

    return okResponse(
      {
        changed_files: results,
        summary,
      },
      buildMetadata(projectRoot, startMs),
    );
  } catch (err) {
    return errorResponse(
      "GRAPH_LOAD_FAILED",
      `Failed to detect changes: ${err instanceof Error ? err.message : String(err)}`,
      "Run /codescope:bootstrap to rebuild the knowledge graph.",
    );
  }
}

// ---- MCP Registration ----

/**
 * Register the codescope_detect_changes MCP tool on the server.
 *
 * Per D-35: Rich description with use-case examples and related tools.
 * Per D-23: Risk classification using centrality tiers.
 * Per D-24: blast_radius_count per file.
 */
export function registerDetectChangesTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_detect_changes",
    "Detect changed files and classify their risk based on knowledge graph centrality. Maps git diff to affected symbols with risk levels (HIGH/MEDIUM/LOW) and blast radius counts. Related tools: codescope_blast_radius, codescope_graph_query.",
    {
      diff: z
        .string()
        .optional()
        .describe(
          "Git diff output to analyze. If not provided, uses current working directory changes.",
        ),
    },
    async (args) => {
      return handleDetectChanges(args as Record<string, unknown>, projectRoot);
    },
  );
}
