// ---------------------------------------------------------------------------
// Blast Radius Diff: plan-vs-actual file comparison with graph distance
// ---------------------------------------------------------------------------
// Computes the difference between predicted files (from execution plan) and
// actual changed files (from git diff), classifying surprises by graph
// distance and detecting scope drift against the scope contract.
//
// Per D-07, D-08, D-09, D-10 from 05-CONTEXT.md.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import { readPlanFromDisk } from "../execution/orchestrator.js";
import { getGraph } from "../graph/cache.js";
import type { BlastRadiusDiffResult, SurpriseFile, SkipFile } from "./types.js";
import type { ScopeContract } from "../orient/types.js";

/**
 * Compute blast radius diff between planned files and actual changed files.
 *
 * @param projectRoot - Project root directory
 * @param planPath - Path to the execution plan JSON file
 * @param scopeContractPath - Path to the scope contract JSON file
 * @param changedFiles - List of files actually changed (from git diff)
 * @returns BlastRadiusDiffResult with surprises, skips, scope drift, and timing
 */
export async function computeBlastRadiusDiff(
  projectRoot: string,
  planPath: string,
  scopeContractPath: string,
  changedFiles: string[],
): Promise<BlastRadiusDiffResult> {
  const startMs = Date.now();

  // Step 1: Read plan and extract predicted files from all agents' exclusiveWriteFiles
  const plan = readPlanFromDisk(planPath);
  const predictedFiles = new Set<string>();
  for (const agent of plan.agents) {
    for (const file of agent.exclusiveWriteFiles) {
      predictedFiles.add(file);
    }
  }

  const changedSet = new Set(changedFiles);

  // Step 2: Compute surprises (files in changedFiles but NOT in predictedFiles)
  const surpriseFilePaths = changedFiles.filter((f) => !predictedFiles.has(f));
  const surprises: SurpriseFile[] = [];

  if (surpriseFilePaths.length > 0) {
    const { graph } = await getGraph(projectRoot);

    // Build a lookup: filePath -> nodeId for the graph
    const filePathToNodeId = new Map<string, string>();
    graph.forEachNode((nodeId: string, attrs: Record<string, unknown>) => {
      const filePath = attrs.filePath as string | undefined;
      if (filePath) {
        filePathToNodeId.set(filePath, nodeId);
      }
    });

    for (const surpriseFilePath of surpriseFilePaths) {
      const minHop = findMinHopDistance(
        graph,
        filePathToNodeId,
        surpriseFilePath,
        predictedFiles,
      );

      const severity = classifySurpriseSeverity(minHop);
      surprises.push({
        filePath: surpriseFilePath,
        minHopDistance: minHop,
        severity,
      });
    }
  }

  // Step 3: Compute skips (files in predictedFiles but NOT in changedFiles set)
  const skips: SkipFile[] = [];
  for (const predicted of predictedFiles) {
    if (!changedSet.has(predicted)) {
      skips.push({
        filePath: predicted,
        severity: "INFO",
        reason:
          "Predicted but not modified -- may have been handled by a different approach or deemed unnecessary by execution agent",
      });
    }
  }

  // Step 4: Scope drift (per D-10)
  const scopeDrift: string[] = [];
  try {
    const scopeContent = fs.readFileSync(scopeContractPath, "utf-8");
    const scopeContract = JSON.parse(scopeContent) as ScopeContract;
    const affectedSet = new Set(
      scopeContract.affectedFiles.map((af) => af.filePath),
    );

    for (const changed of changedFiles) {
      if (!affectedSet.has(changed)) {
        scopeDrift.push(changed);
      }
    }
  } catch {
    // If scope contract is unreadable, skip scope drift detection
  }

  return {
    surprises,
    skips,
    scopeDrift,
    timing_ms: Date.now() - startMs,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Find the minimum hop distance from any predicted file node to the surprise
 * file node in the graph, using BFS from each predicted file.
 *
 * Returns -1 if the file is not in the graph or unreachable from any
 * predicted file.
 */
function findMinHopDistance(
  graph: import("graphology").DirectedGraph,
  filePathToNodeId: Map<string, string>,
  surpriseFilePath: string,
  predictedFiles: Set<string>,
): number {
  const surpriseNodeId = filePathToNodeId.get(surpriseFilePath);
  if (!surpriseNodeId) return -1; // Not in graph = unconnected

  let minHop = -1;

  for (const predictedFile of predictedFiles) {
    const startNodeId = filePathToNodeId.get(predictedFile);
    if (!startNodeId) continue;

    // BFS from predicted file to surprise file
    const hopDistance = bfsDistance(graph, startNodeId, surpriseNodeId);
    if (hopDistance >= 0) {
      if (minHop === -1 || hopDistance < minHop) {
        minHop = hopDistance;
      }
    }
  }

  return minHop;
}

/**
 * BFS from source to target, returning hop distance or -1 if unreachable.
 * Uses undirected traversal (both outbound and inbound edges) to find
 * the shortest path between any two nodes.
 */
function bfsDistance(
  graph: import("graphology").DirectedGraph,
  sourceId: string,
  targetId: string,
): number {
  if (sourceId === targetId) return 0;
  if (!graph.hasNode(sourceId) || !graph.hasNode(targetId)) return -1;

  const visited = new Set<string>([sourceId]);
  const queue: Array<{ nodeId: string; depth: number }> = [
    { nodeId: sourceId, depth: 0 },
  ];

  while (queue.length > 0) {
    const { nodeId, depth } = queue.shift()!;

    // Check all neighbors (both directions for undirected reachability)
    const neighbors: string[] = [];
    try {
      graph.forEachOutNeighbor(nodeId, (neighbor: string) => {
        neighbors.push(neighbor);
      });
    } catch {
      // Node may not exist
    }
    try {
      graph.forEachInNeighbor(nodeId, (neighbor: string) => {
        neighbors.push(neighbor);
      });
    } catch {
      // Node may not exist
    }

    for (const neighbor of neighbors) {
      if (neighbor === targetId) return depth + 1;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push({ nodeId: neighbor, depth: depth + 1 });
      }
    }
  }

  return -1; // Unreachable
}

/**
 * Classify surprise file severity based on hop distance.
 * Per D-08: hops 1-2 = WARN, hops 3+ or unconnected (-1) = ERROR.
 */
function classifySurpriseSeverity(
  minHopDistance: number,
): "WARN" | "ERROR" {
  if (minHopDistance >= 1 && minHopDistance <= 2) {
    return "WARN";
  }
  return "ERROR"; // hop 3+, or -1 (unconnected)
}
