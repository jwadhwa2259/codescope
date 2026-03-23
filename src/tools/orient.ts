import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";
import * as fs from "node:fs";
import * as path from "node:path";
import { getGraph } from "../graph/cache.js";
import { computeDangerZones } from "../graph/analytics.js";
import { getCodescopePath } from "../utils/paths.js";
import {
  isBootstrapped,
  errorResponse,
  okResponse,
  buildMetadata,
} from "./helpers.js";

// ---- Constants ----

/** Maximum number of results returned */
const MAX_RESULTS = 20;

/** Stop words to filter from task description during keyword extraction */
const STOP_WORDS = new Set([
  "the", "a", "an", "to", "for", "in", "of", "and", "or", "is", "are",
  "be", "with", "from", "by", "on", "at", "it", "this", "that", "has",
  "have", "do", "does", "not", "but", "so", "if", "my", "we", "our",
  "can", "will", "should", "would", "could", "about", "into", "up",
  "out", "all", "some", "any", "each", "every", "no", "new", "add",
  "fix", "update", "change", "modify", "improve", "make", "use",
]);

// ---- Types ----

interface OrientInput {
  task: string;
}

interface RelevantFile {
  filePath: string;
  name: string;
  kind: string;
  centrality: number;
  community: number | null;
  risk_level: "HIGH" | "MEDIUM" | "LOW";
}

interface OrientData {
  task: string;
  relevant_files: RelevantFile[];
  conventions: string[];
  danger_zones: Array<{
    filePath: string;
    riskScore: number;
    reasons: string[];
  }>;
  communities: Array<{
    id: number;
    nodeCount: number;
  }>;
}

// ---- Keyword Extraction ----

/**
 * Extracts meaningful keywords from a task description.
 * Splits by spaces, filters stop words, lowercases.
 */
function extractKeywords(task: string): string[] {
  return task
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Classify risk based on centrality tiers (per D-23).
 */
function classifyRisk(centrality: number): "HIGH" | "MEDIUM" | "LOW" {
  if (centrality > 0.7) return "HIGH";
  if (centrality >= 0.3) return "MEDIUM";
  return "LOW";
}

// ---- Convention Reading ----

/**
 * Read conventions from conventions.md and filter to those relevant
 * to the given file paths.
 */
function readRelevantConventions(
  codescopePath: string,
  filePaths: string[],
): string[] {
  const conventionsPath = path.join(codescopePath, "conventions.md");
  if (!fs.existsSync(conventionsPath)) return [];

  const content = fs.readFileSync(conventionsPath, "utf-8");
  const conventions: string[] = [];

  // Parse convention blocks (same format as conventions.ts)
  const sections = content.split(/^## /m).filter((s) => s.trim().length > 0);

  for (const section of sections) {
    const lines = section.split("\n");
    let name = "";
    let files: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("**Convention:**")) {
        name = trimmed.replace("**Convention:**", "").trim();
      } else if (trimmed.startsWith("**Files:**")) {
        const fileStr = trimmed.replace("**Files:**", "").trim();
        files = fileStr.split(",").map((f) => f.trim()).filter((f) => f.length > 0);
      }
    }

    if (name) {
      // Check if any convention files overlap with the relevant file paths
      const isRelevant = files.some((convFile) =>
        filePaths.some((fp) => fp.includes(convFile) || convFile.includes(fp)),
      );
      if (isRelevant || filePaths.length === 0) {
        conventions.push(name);
      }
    }
  }

  return conventions;
}

// ---- Handler ----

/**
 * Core orient logic, extracted for testability without MCP transport.
 *
 * Per D-27: Returns a lightweight orient brief (NOT the full orient pipeline).
 * Per D-28: Uses keyword extraction + graph walk (1-2 hops, rank by centrality).
 */
export async function handleOrient(
  projectRoot: string,
  input: OrientInput,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startMs = Date.now();

  // Guard: must be bootstrapped
  if (!isBootstrapped(projectRoot)) {
    return errorResponse(
      "NOT_BOOTSTRAPPED",
      "No bootstrap data found. Run /codescope:bootstrap first.",
      "Run /codescope:bootstrap to analyze your codebase.",
    );
  }

  const { task } = input;
  const keywords = extractKeywords(task);

  // Load cached graph
  let cached;
  try {
    cached = getGraph(projectRoot);
  } catch (err) {
    return errorResponse(
      "GRAPH_LOAD_FAILED",
      `Failed to load knowledge graph: ${err instanceof Error ? err.message : String(err)}`,
      "Run /codescope:bootstrap to rebuild the knowledge graph.",
    );
  }

  const { graph, centralities } = cached;

  // Step 1: Find nodes matching keywords
  const matchedNodes = new Set<string>();

  if (keywords.length > 0) {
    graph.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
      const name = ((attrs.name as string) ?? "").toLowerCase();
      const filePath = ((attrs.filePath as string) ?? "").toLowerCase();
      const matches = keywords.some(
        (kw) => name.includes(kw) || filePath.includes(kw),
      );
      if (matches) {
        matchedNodes.add(nodeId);
      }
    });
  }

  // Step 2: Expand 1-2 hops from matched nodes
  const expandedNodes = new Set<string>(matchedNodes);

  for (const nodeId of matchedNodes) {
    // 1-hop neighbors
    const neighbors = graph.neighbors(nodeId);
    for (const neighbor of neighbors) {
      expandedNodes.add(neighbor);
      // 2-hop neighbors
      const hop2Neighbors = graph.neighbors(neighbor);
      for (const hop2 of hop2Neighbors) {
        expandedNodes.add(hop2);
      }
    }
  }

  // Step 3: If no keyword matches, fall back to top-centrality nodes
  let candidateNodes: string[];
  if (expandedNodes.size === 0) {
    // Return top nodes by centrality as fallback for vague descriptions
    candidateNodes = Array.from(centralities.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_RESULTS)
      .map(([nodeId]) => nodeId)
      .filter((nodeId) => graph.hasNode(nodeId));
  } else {
    candidateNodes = Array.from(expandedNodes);
  }

  // Step 4: Rank by centrality and limit to top 20
  const rankedNodes = candidateNodes
    .map((nodeId) => ({
      nodeId,
      centrality: centralities.get(nodeId) ?? 0,
    }))
    .sort((a, b) => b.centrality - a.centrality)
    .slice(0, MAX_RESULTS);

  // Step 5: Build relevant files response
  // Track communities for community context
  const communityMap = new Map<number, number>();
  const relevantFilePaths: string[] = [];

  const relevantFiles: RelevantFile[] = rankedNodes
    .filter((n) => graph.hasNode(n.nodeId))
    .map((n) => {
      const attrs = graph.getNodeAttributes(n.nodeId);
      const filePath = (attrs.filePath as string) ?? "";
      const name = (attrs.name as string) ?? n.nodeId;
      const kind = (attrs.kind as string) ?? "unknown";
      const community = (attrs.community as number) ?? null;

      if (community !== null) {
        communityMap.set(community, (communityMap.get(community) ?? 0) + 1);
      }

      relevantFilePaths.push(filePath);

      return {
        filePath,
        name,
        kind,
        centrality: n.centrality,
        community,
        risk_level: classifyRisk(n.centrality),
      };
    });

  // Step 6: Read relevant conventions
  const csPath = getCodescopePath(projectRoot);
  const conventions = readRelevantConventions(csPath, relevantFilePaths);

  // Step 7: Compute danger zones from matched neighborhoods
  // Use a simple subset: take top danger zones that overlap with our files
  let dangerZones: Array<{ filePath: string; riskScore: number; reasons: string[] }> = [];
  try {
    const allDangerZones = computeDangerZones(graph, centralities, {});
    dangerZones = allDangerZones
      .filter((dz) =>
        relevantFilePaths.some((fp) => fp === dz.filePath || dz.filePath.includes(fp)),
      )
      .slice(0, 10)
      .map((dz) => ({
        filePath: dz.filePath,
        riskScore: dz.riskScore,
        reasons: dz.reasons,
      }));

    // If no overlap, include top danger zones anyway for awareness
    if (dangerZones.length === 0) {
      dangerZones = allDangerZones.slice(0, 5).map((dz) => ({
        filePath: dz.filePath,
        riskScore: dz.riskScore,
        reasons: dz.reasons,
      }));
    }
  } catch {
    // Danger zone computation is best-effort
  }

  // Step 8: Build community context
  const communities = Array.from(communityMap.entries()).map(([id, nodeCount]) => ({
    id,
    nodeCount,
  }));

  const data: OrientData = {
    task,
    relevant_files: relevantFiles,
    conventions,
    danger_zones: dangerZones,
    communities,
  };

  const metadata = buildMetadata(projectRoot, startMs);

  return okResponse(data, metadata);
}

// ---- MCP Registration ----

/**
 * Register the codescope_orient tool on the MCP server.
 *
 * Per D-35: Rich description with use-case examples and related tools.
 */
export function registerOrientTool(
  server: McpServer,
  projectRoot: string,
): void {
  server.tool(
    "codescope_orient",
    "Get orientation context for a task. Returns a lightweight brief with relevant files (ranked by centrality), applicable conventions, danger zones in the change area, community context, and golden files. This is NOT the full orient pipeline (that is the /codescope:orient skill). Related tools: codescope_blast_radius, codescope_conventions, codescope_recall.",
    {
      task: z
        .string()
        .describe(
          "Task description to orient on (e.g., 'add user authentication', 'refactor error handling')",
        ),
    },
    async ({ task }) => {
      return handleOrient(projectRoot, { task });
    },
  );
}
