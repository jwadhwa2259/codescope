import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { DirectedGraph } from "graphology";

/**
 * Build a test graph with known structure for blast radius:
 *
 * A.ts --IMPORTS--> B.ts --IMPORTS--> C.ts --IMPORTS--> D.ts --IMPORTS--> E.ts
 *                                     C.ts --IMPORTS--> F.ts
 *
 * Starting from A.ts:
 *  Hop 0: A.ts (Red)
 *  Hop 1: B.ts (Orange)
 *  Hop 2: C.ts (Yellow)
 *  Hop 3: D.ts, F.ts (Green)
 *  Hop 4: E.ts (Green)
 */
function buildBlastRadiusGraph(): DirectedGraph {
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

  graph.mergeEdge("1", "2", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("2", "3", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("3", "4", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("4", "5", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("3", "6", { kind: "IMPORTS", weight: 1 });

  return graph;
}

// Mock modules
vi.mock("../../src/graph/cache.js", () => ({
  getGraph: vi.fn(),
  invalidateCache: vi.fn(),
}));

vi.mock("../../src/tools/helpers.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    isBootstrapped: vi.fn(),
  };
});

describe("codescope_blast_radius (src/tools/blast-radius.ts)", () => {
  let projectRoot: string;
  let testGraph: DirectedGraph;
  let getGraph: ReturnType<typeof vi.fn>;
  let isBootstrapped: ReturnType<typeof vi.fn>;
  let handleBlastRadius: (
    args: Record<string, unknown>,
    projectRoot: string,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;

  beforeEach(async () => {
    projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "codescope-br-test-"),
    );
    testGraph = buildBlastRadiusGraph();

    const cacheModule = await import("../../src/graph/cache.js");
    getGraph = cacheModule.getGraph as unknown as ReturnType<typeof vi.fn>;

    const helpersModule = await import("../../src/tools/helpers.js");
    isBootstrapped = helpersModule.isBootstrapped as unknown as ReturnType<
      typeof vi.fn
    >;

    const blastModule = await import("../../src/tools/blast-radius.js");
    handleBlastRadius = blastModule.handleBlastRadius;

    // Default: bootstrapped and graph available
    isBootstrapped.mockReturnValue(true);
    getGraph.mockResolvedValue({
      graph: testGraph,
      centralities: new Map([
        ["1", 0.0],
        ["2", 0.5],
        ["3", 0.8],
        ["4", 0.3],
        ["5", 0.1],
        ["6", 0.1],
      ]),
      loadedAt: Date.now(),
    });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("Test 7: Returns hop-classified nodes (Red hop 0, Orange hop 1, Yellow hop 2, Green hop 3+)", async () => {
    const result = await handleBlastRadius(
      { file_path: "src/A.ts" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");

    const nodes = parsed.data.nodes;
    expect(nodes).toBeDefined();

    // Find nodes by their risk classification
    const redNodes = nodes.filter(
      (n: Record<string, unknown>) => n.risk === "Red",
    );
    const orangeNodes = nodes.filter(
      (n: Record<string, unknown>) => n.risk === "Orange",
    );
    const yellowNodes = nodes.filter(
      (n: Record<string, unknown>) => n.risk === "Yellow",
    );
    const greenNodes = nodes.filter(
      (n: Record<string, unknown>) => n.risk === "Green",
    );

    expect(redNodes.length).toBe(1); // A.ts at hop 0
    expect(orangeNodes.length).toBe(1); // B.ts at hop 1
    expect(yellowNodes.length).toBe(1); // C.ts at hop 2
    expect(greenNodes.length).toBeGreaterThanOrEqual(1); // D.ts, F.ts, E.ts at hop 3+
  });

  it("Test 8: Respects max_hops parameter (default 4)", async () => {
    // With max_hops=2, should only get hops 0, 1, 2
    const result = await handleBlastRadius(
      { file_path: "src/A.ts", max_hops: 2 },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");

    const nodes = parsed.data.nodes;
    // Should not include hop 3+ nodes
    const maxHop = Math.max(
      ...nodes.map((n: Record<string, unknown>) => n.hop as number),
    );
    expect(maxHop).toBeLessThanOrEqual(2);
    expect(parsed.data.max_hops).toBe(2);
  });

  it("Test 9: Returns NODE_NOT_FOUND for non-existent file", async () => {
    const result = await handleBlastRadius(
      { file_path: "src/nonexistent.ts" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NODE_NOT_FOUND");
  });

  it("Test 10: Returns NOT_BOOTSTRAPPED error when not bootstrapped", async () => {
    isBootstrapped.mockReturnValue(false);

    const result = await handleBlastRadius(
      { file_path: "src/A.ts" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
  });

  it("Test 11: Isolated node in a graph with edges returns only itself (hop 0, Red)", async () => {
    // Build a graph that has edges (so GRAPH_INCOMPLETE doesn't trigger)
    // but the queried node is isolated (not connected to any edge)
    const graphWithIsolated = new DirectedGraph();
    graphWithIsolated.addNode("1", {
      name: "lonely.ts",
      kind: "file",
      filePath: "src/lonely.ts",
      loc: 10,
    });
    graphWithIsolated.addNode("2", {
      name: "other.ts",
      kind: "file",
      filePath: "src/other.ts",
      loc: 20,
    });
    graphWithIsolated.addNode("3", {
      name: "another.ts",
      kind: "file",
      filePath: "src/another.ts",
      loc: 30,
    });
    // Add an edge between other nodes so graph.size > 0
    graphWithIsolated.mergeEdge("2", "3", { kind: "IMPORTS", weight: 1 });

    getGraph.mockResolvedValue({
      graph: graphWithIsolated,
      centralities: new Map([
        ["1", 0.0],
        ["2", 0.5],
        ["3", 0.1],
      ]),
      loadedAt: Date.now(),
    });

    const result = await handleBlastRadius(
      { file_path: "src/lonely.ts" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.data.nodes.length).toBe(1);
    expect(parsed.data.nodes[0].risk).toBe("Red");
    expect(parsed.data.total_affected).toBe(1);
  });

  it("returns GRAPH_INCOMPLETE warning when graph has 0 edges", async () => {
    // Build a graph with nodes but NO edges
    const emptyEdgeGraph = new DirectedGraph();
    emptyEdgeGraph.addNode("1", {
      name: "A.ts",
      kind: "file",
      filePath: "src/A.ts",
      loc: 100,
    });
    emptyEdgeGraph.addNode("2", {
      name: "B.ts",
      kind: "file",
      filePath: "src/B.ts",
      loc: 50,
    });

    getGraph.mockResolvedValue({
      graph: emptyEdgeGraph,
      centralities: new Map([
        ["1", 0.0],
        ["2", 0.0],
      ]),
      loadedAt: Date.now(),
    });

    const result = await handleBlastRadius(
      { file_path: "src/A.ts" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("partial");
    expect(parsed.warnings).toBeDefined();
    expect(parsed.warnings.length).toBeGreaterThan(0);
    expect(parsed.warnings[0]).toContain("GRAPH_INCOMPLETE");
    expect(parsed.data.graph_incomplete).toBe(true);
  });

  it("returns normal ok response when graph has edges (no GRAPH_INCOMPLETE regression)", async () => {
    const result = await handleBlastRadius(
      { file_path: "src/A.ts" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.warnings).toBeUndefined();
  });

  it("Test 12: Response includes blast radius count and query_ms", async () => {
    const result = await handleBlastRadius(
      { file_path: "src/A.ts" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(typeof parsed.data.total_affected).toBe("number");
    expect(parsed.data.total_affected).toBeGreaterThan(0);
    expect(typeof parsed.metadata.query_ms).toBe("number");
  });
});
