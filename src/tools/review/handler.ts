import * as fs from "node:fs";
import * as path from "node:path";
import { getGraph } from "../../graph/cache.js";
import { blastRadius } from "../../graph/analytics.js";
import { openDatabase, closeDatabase } from "../../graph/database.js";
import { getGraphDbPath, getCodescopePath } from "../../utils/paths.js";
import {
  okResponse,
  errorResponse,
  partialResponse,
  isBootstrapped,
  buildMetadata,
} from "../helpers.js";
import type { RiskTier } from "./types.js";
import type { DiffResolution } from "./types.js";
import { resolveDiff } from "./diff-resolver.js";
import { parseConventions } from "./convention-parser.js";
import {
  getFileCommunities,
  getEdgesForFiles,
  getNodeIdsForFiles,
} from "./graph-queries.js";
import { detectCycles } from "./cycle-detector.js";

// ---- Constants ----

/** Centrality threshold for HIGH risk classification */
const HIGH_RISK_THRESHOLD = 0.7;

/** Centrality threshold for MEDIUM risk classification */
const MEDIUM_RISK_THRESHOLD = 0.3;

// ---- Internal Helpers (duplicated from detect-changes.ts for isolation) ----

/**
 * Classify risk based on centrality score.
 * Per D-07: HIGH (>0.7), MEDIUM (0.3-0.7), LOW (<0.3)
 */
function classifyRisk(centrality: number): RiskTier {
  if (centrality > HIGH_RISK_THRESHOLD) return "HIGH";
  if (centrality >= MEDIUM_RISK_THRESHOLD) return "MEDIUM";
  return "LOW";
}

// ---- Main Handler ----

/**
 * Core handler for codescope_review.
 * Extracted from MCP registration for unit testing without transport.
 *
 * Performs structural impact analysis on diffs:
 * - Per-file risk scoring (REVIEW-01 / D-07)
 * - Dependency edge reporting (REVIEW-02 / D-09)
 * - Circular dependency detection (REVIEW-02 / D-10)
 * - Convention compliance checking (REVIEW-03)
 * - Cross-community analysis (D-08)
 */
export async function handleReview(
  args: Record<string, unknown>,
  projectRoot: string,
): Promise<{ content: Array<{ type: "text"; text: string }> }> {
  const startMs = Date.now();

  // Guard: NOT_BOOTSTRAPPED
  if (!isBootstrapped(projectRoot)) {
    return errorResponse(
      "NOT_BOOTSTRAPPED",
      "No bootstrap data found. The knowledge graph has not been built yet.",
      "Run /codescope:bootstrap to analyze your codebase.",
    );
  }

  // Resolve diff input per D-03
  const resolved = resolveDiff(args, projectRoot);
  if ("error" in resolved && resolved.error === true) {
    return errorResponse(resolved.code, resolved.message, resolved.recovery);
  }

  const diffResult = resolved as DiffResolution;
  const changedFiles = diffResult.files;

  try {
    // Get graph with staleness check for changed files
    const cached = await getGraph(projectRoot, changedFiles);
    const graph = cached.graph;
    const centralities = cached.centralities;

    // Check for incomplete graph (GRAPH-06 per D-02)
    if (graph.size === 0) {
      return partialResponse(
        {
          summary: { total_files: changedFiles.length, high_risk: 0, medium_risk: 0, low_risk: 0 },
          files: changedFiles.map((p) => ({ path: p, risk: "UNKNOWN", centrality: 0, blast_radius_count: 0 })),
          graph_incomplete: true,
        },
        [
          "GRAPH_INCOMPLETE: Import graph has 0 edges. " +
          "Review risk assessment is unreliable because no import relationships were found. " +
          "Run /codescope:bootstrap to rebuild the knowledge graph.",
        ],
        buildMetadata(projectRoot, startMs),
      );
    }

    // ---- Step 1: Per-file risk scoring (REVIEW-01) ----
    const fileResults: Array<{
      path: string;
      risk: RiskTier;
      centrality: number;
      blast_radius_count: number;
    }> = [];

    for (const filePath of changedFiles) {
      const matchingNodes = graph.filterNodes(
        (_n: string, attr: Record<string, unknown>) =>
          attr.filePath === filePath && attr.kind === "file",
      );

      if (matchingNodes.length > 0) {
        const nodeId = matchingNodes[0];
        const centrality = centralities.get(nodeId) ?? 0;
        const risk = classifyRisk(centrality);
        const blastNodes = blastRadius(graph, nodeId, 4);
        const blastCount = blastNodes.length;

        fileResults.push({
          path: filePath,
          risk,
          centrality,
          blast_radius_count: blastCount,
        });
      } else {
        // File not in graph: LOW risk, 0 centrality, 0 blast radius
        fileResults.push({
          path: filePath,
          risk: "LOW",
          centrality: 0,
          blast_radius_count: 0,
        });
      }
    }

    // Build summary
    const summary = {
      total_files: fileResults.length,
      high_risk: fileResults.filter((r) => r.risk === "HIGH").length,
      medium_risk: fileResults.filter((r) => r.risk === "MEDIUM").length,
      low_risk: fileResults.filter((r) => r.risk === "LOW").length,
    };

    // ---- Step 2: Dependency change detection (REVIEW-02 / D-09) ----
    const dbPath = getGraphDbPath(projectRoot);
    const db = openDatabase(dbPath);

    let newEdges: Array<{ source: string; target: string; kind: string }> = [];
    let circularDependencies: string[][] = [];

    try {
      // Query edges involving changed files
      newEdges = getEdgesForFiles(db, changedFiles);

      // ---- Step 3: Circular dependency detection (D-10) ----
      // Get node IDs for changed files
      const nodeIdMap = getNodeIdsForFiles(db, changedFiles);

      // Build reverse map for cycle output
      const nodeIdToFilePath = new Map<string, string>();
      for (const [filePath, nodeId] of nodeIdMap.entries()) {
        nodeIdToFilePath.set(nodeId, filePath);
      }
      // Also add all graph nodes for cycle path conversion
      graph.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
        if (attrs.filePath) {
          nodeIdToFilePath.set(nodeId, attrs.filePath as string);
        }
      });

      const changedNodeIds = Array.from(nodeIdMap.values());
      circularDependencies = detectCycles(
        graph,
        changedNodeIds,
        nodeIdToFilePath,
      );

      // ---- Step 4: Convention compliance (REVIEW-03) ----
      const csPath = getCodescopePath(projectRoot);
      const conventionsPath = path.join(csPath, "conventions.md");

      let conventionViolations: Array<{
        file: string;
        convention: string;
        adoption_pct: number;
        confidence: string;
        evidence: string[];
      }> = [];

      if (fs.existsSync(conventionsPath)) {
        const content = fs.readFileSync(conventionsPath, "utf-8");
        const allConventions = parseConventions(content);

        for (const conv of allConventions) {
          for (const changedFile of changedFiles) {
            if (conv.files.some((f) => f.includes(changedFile) || changedFile.includes(f))) {
              conventionViolations.push({
                file: changedFile,
                convention: conv.name,
                adoption_pct: conv.adoption_pct,
                confidence: conv.confidence,
                evidence: conv.evidence,
              });
            }
          }
        }
      }

      // ---- Step 5: Cross-community analysis (D-08) ----
      const allNodeIds = changedNodeIds;
      const communityMap = getFileCommunities(db, allNodeIds);

      // Group files by community
      const communityGroups = new Map<
        number,
        { label: string; files: string[] }
      >();

      for (const [nodeId, info] of communityMap.entries()) {
        const filePath = nodeIdToFilePath.get(nodeId);
        if (!filePath) continue;

        if (!communityGroups.has(info.communityId)) {
          communityGroups.set(info.communityId, {
            label: info.label,
            files: [],
          });
        }
        communityGroups.get(info.communityId)!.files.push(filePath);
      }

      const communitiesTouched = communityGroups.size;
      const communityBreakdown = Array.from(communityGroups.entries()).map(
        ([communityId, group]) => ({
          community_id: communityId,
          label: group.label,
          files: group.files,
        }),
      );

      // ---- Build response (D-01) ----
      const reviewData = {
        summary,
        files: fileResults,
        dependency_changes: {
          new_edges: newEdges,
          removed_edges: [] as Array<{
            source: string;
            target: string;
            kind: string;
          }>,
          circular_dependencies: circularDependencies,
        },
        convention_violations: conventionViolations,
        cross_community_changes: {
          communities_touched: communitiesTouched,
          flagged: communitiesTouched >= 3,
          community_breakdown: communityBreakdown,
        },
      };

      return okResponse(reviewData, buildMetadata(projectRoot, startMs));
    } finally {
      closeDatabase(db);
    }
  } catch (err) {
    return errorResponse(
      "REVIEW_FAILED",
      `Failed to perform review: ${err instanceof Error ? err.message : String(err)}`,
      "Run /codescope:bootstrap to rebuild the knowledge graph.",
    );
  }
}
