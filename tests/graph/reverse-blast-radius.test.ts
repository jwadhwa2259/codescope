import { describe, it, expect } from "vitest";
import { DirectedGraph } from "graphology";
import { reverseBlastRadius } from "../../src/graph/analytics.js";

/**
 * Build a test graph with known structure for reverse blast radius:
 *
 * A.ts --IMPORTS--> B.ts --IMPORTS--> C.ts --IMPORTS--> D.ts --IMPORTS--> E.ts
 *                                     C.ts --IMPORTS--> F.ts
 *
 * Edge direction: A imports B means A depends on B.
 * Forward BFS from A: A -> B -> C -> D/F -> E
 * Reverse BFS from C: C <- B <- A (who depends on C? B and A)
 *
 * Starting reverse from C.ts (node "3"):
 *  Hop 0: C.ts (Red)
 *  Hop 1: B.ts (Orange) -- B imports C
 *  Hop 2: A.ts (Yellow) -- A imports B
 */
function buildTestGraph(): DirectedGraph {
  const graph = new DirectedGraph();

  graph.addNode("1", {
    name: "A.ts",
    kind: "file",
    filePath: "src/A.ts",
    loc: 100,
  });
  graph.addNode("2", {
    name: "B.ts",
    kind: "file",
    filePath: "src/B.ts",
    loc: 50,
  });
  graph.addNode("3", {
    name: "C.ts",
    kind: "file",
    filePath: "src/C.ts",
    loc: 30,
  });
  graph.addNode("4", {
    name: "D.ts",
    kind: "file",
    filePath: "src/D.ts",
    loc: 20,
  });
  graph.addNode("5", {
    name: "E.ts",
    kind: "file",
    filePath: "src/E.ts",
    loc: 15,
  });
  graph.addNode("6", {
    name: "F.ts",
    kind: "file",
    filePath: "src/F.ts",
    loc: 10,
  });

  // A -> B -> C -> D -> E, C -> F
  graph.mergeEdge("1", "2", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("2", "3", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("3", "4", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("4", "5", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("3", "6", { kind: "IMPORTS", weight: 1 });

  return graph;
}

describe("reverseBlastRadius (src/graph/analytics.ts)", () => {
  it("Test 1: walks backward via inbound edges from C.ts to find A.ts and B.ts", () => {
    const graph = buildTestGraph();
    const results = reverseBlastRadius(graph, "3");

    // Should find C (self), B (imports C), A (imports B)
    // Should NOT find D, E, F (those are downstream/outbound)
    const nodeIds = results.map((n) => n.nodeId);
    expect(nodeIds).toContain("3"); // C.ts (self)
    expect(nodeIds).toContain("2"); // B.ts (imports C)
    expect(nodeIds).toContain("1"); // A.ts (imports B which imports C)

    // D, E, F are downstream -- should NOT be included
    expect(nodeIds).not.toContain("4");
    expect(nodeIds).not.toContain("5");
    expect(nodeIds).not.toContain("6");

    // Verify hop distances
    const hopMap = new Map(results.map((n) => [n.nodeId, n.hop]));
    expect(hopMap.get("3")).toBe(0); // C is self
    expect(hopMap.get("2")).toBe(1); // B is 1 hop back
    expect(hopMap.get("1")).toBe(2); // A is 2 hops back
  });

  it("Test 2: maxHops=1 returns only self and direct importers", () => {
    const graph = buildTestGraph();
    const results = reverseBlastRadius(graph, "3", 1);

    // Only hop 0 (self) and hop 1 (direct importers)
    expect(results.length).toBe(2);
    const nodeIds = results.map((n) => n.nodeId);
    expect(nodeIds).toContain("3"); // C.ts at hop 0
    expect(nodeIds).toContain("2"); // B.ts at hop 1

    // A.ts is hop 2 -- should be excluded
    expect(nodeIds).not.toContain("1");
  });

  it("Test 3: non-existent node returns empty array", () => {
    const graph = buildTestGraph();
    const results = reverseBlastRadius(graph, "999");
    expect(results).toEqual([]);
  });

  it("Test 4: leaf node with no inbound edges returns only self", () => {
    const graph = buildTestGraph();
    // Node "1" (A.ts) has no inbound edges -- nothing imports A
    const results = reverseBlastRadius(graph, "1");

    expect(results.length).toBe(1);
    expect(results[0].nodeId).toBe("1");
    expect(results[0].hop).toBe(0);
    expect(results[0].risk).toBe("Red");
  });

  it("Test 5: risk levels follow hop-distance classification", () => {
    const graph = buildTestGraph();
    // Reverse from E.ts (node 5): E <- D <- C <- B <- A
    const results = reverseBlastRadius(graph, "5");

    const riskByHop = new Map(results.map((n) => [n.hop, n.risk]));
    expect(riskByHop.get(0)).toBe("Red");    // hop 0
    expect(riskByHop.get(1)).toBe("Orange");  // hop 1
    expect(riskByHop.get(2)).toBe("Yellow");  // hop 2
    expect(riskByHop.get(3)).toBe("Green");   // hop 3+
  });

  it("Test 6: results are sorted by hop ascending", () => {
    const graph = buildTestGraph();
    const results = reverseBlastRadius(graph, "5");

    // Verify ascending hop order
    for (let i = 1; i < results.length; i++) {
      expect(results[i].hop).toBeGreaterThanOrEqual(results[i - 1].hop);
    }
  });
});
