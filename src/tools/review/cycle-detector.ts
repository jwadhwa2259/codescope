import type { DirectedGraph } from "graphology";

/** Maximum neighbors to expand for cycle detection per Pitfall 6 */
export const MAX_NEIGHBOR_EXPANSION = 50;

/**
 * DFS cycle detection on a subgraph starting from changed file nodes.
 * Per D-10: only returns cycles that include at least one changed file node.
 *
 * @param graph - The graphology DirectedGraph
 * @param startNodeIds - Node IDs of changed files
 * @param nodeIdToFilePath - Map from node ID to file path for output
 * @returns Array of cycle paths (as file path arrays)
 */
export function detectCycles(
  graph: DirectedGraph,
  startNodeIds: string[],
  nodeIdToFilePath: Map<string, string>,
): string[][] {
  const cycles: string[][] = [];
  const globalVisited = new Set<string>();
  const changedSet = new Set(startNodeIds);

  // Collect start nodes + immediate neighbors (capped at MAX_NEIGHBOR_EXPANSION per node)
  const subgraphNodes = new Set<string>(startNodeIds);
  for (const nodeId of startNodeIds) {
    if (!graph.hasNode(nodeId)) continue;
    let neighborCount = 0;
    graph.forEachOutNeighbor(nodeId, (neighbor) => {
      if (neighborCount < MAX_NEIGHBOR_EXPANSION) {
        subgraphNodes.add(neighbor);
        neighborCount++;
      }
    });
  }

  function dfs(
    node: string,
    pathArr: string[],
    inStack: Set<string>,
  ): void {
    if (inStack.has(node)) {
      // Found cycle: extract cycle from path
      const cycleStart = pathArr.indexOf(node);
      if (cycleStart >= 0) {
        const cyclePath = pathArr.slice(cycleStart);
        // Only include cycles that have at least one changed file node
        const hasChangedNode = cyclePath.some((n) => changedSet.has(n));
        if (hasChangedNode) {
          // Convert node IDs to file paths
          const filePathCycle = cyclePath.map(
            (n) => nodeIdToFilePath.get(n) ?? n,
          );
          cycles.push(filePathCycle);
        }
      }
      return;
    }
    if (globalVisited.has(node)) return;
    if (!subgraphNodes.has(node)) return;

    globalVisited.add(node);
    inStack.add(node);
    pathArr.push(node);

    if (graph.hasNode(node)) {
      graph.forEachOutNeighbor(node, (neighbor) => {
        if (subgraphNodes.has(neighbor)) {
          dfs(neighbor, [...pathArr], new Set(inStack));
        }
      });
    }

    inStack.delete(node);
  }

  for (const node of startNodeIds) {
    if (!globalVisited.has(node)) {
      dfs(node, [], new Set());
    }
  }

  return cycles;
}
