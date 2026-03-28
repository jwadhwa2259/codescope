import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { DirectedGraph } from "graphology";

/**
 * Build a test graph with known structure for impact prediction:
 *
 * A.ts --IMPORTS--> B.ts --IMPORTS--> C.ts --IMPORTS--> D.ts --IMPORTS--> E.ts
 *                                     C.ts --IMPORTS--> F.ts
 *
 * Reverse from C.ts: C <- B <- A (who imports C?)
 * Reverse from E.ts: E <- D <- C <- B <- A
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

describe("codescope_predict_impact (src/tools/impact-prediction.ts)", () => {
  let projectRoot: string;
  let testGraph: DirectedGraph;
  let getGraph: ReturnType<typeof vi.fn>;
  let isBootstrapped: ReturnType<typeof vi.fn>;
  let handlePredictImpact: (
    args: Record<string, unknown>,
    projectRoot: string,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;

  beforeEach(async () => {
    projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "codescope-impact-test-"),
    );
    testGraph = buildTestGraph();

    const cacheModule = await import("../../src/graph/cache.js");
    getGraph = cacheModule.getGraph as unknown as ReturnType<typeof vi.fn>;

    const helpersModule = await import("../../src/tools/helpers.js");
    isBootstrapped = helpersModule.isBootstrapped as unknown as ReturnType<
      typeof vi.fn
    >;

    const impactModule = await import("../../src/tools/impact-prediction.js");
    handlePredictImpact = impactModule.handlePredictImpact;

    // Default: bootstrapped and graph available
    isBootstrapped.mockReturnValue(true);
    getGraph.mockResolvedValue({
      graph: testGraph,
      centralities: new Map([
        ["1", 0.0],   // A.ts - LOW (no one imports it)
        ["2", 0.5],   // B.ts - MEDIUM
        ["3", 0.8],   // C.ts - HIGH
        ["4", 0.3],   // D.ts - MEDIUM (at boundary)
        ["5", 0.1],   // E.ts - LOW
        ["6", 0.1],   // F.ts - LOW
      ]),
      loadedAt: Date.now(),
    });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("Test 1: returns okResponse with file_paths, max_hops, and per_file results", async () => {
    const result = await handlePredictImpact(
      { file_paths: ["src/C.ts"] },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.data.file_paths).toEqual(["src/C.ts"]);
    expect(parsed.data.max_hops).toBe(4);
    expect(Array.isArray(parsed.data.results)).toBe(true);
    expect(parsed.data.results.length).toBe(1);
  });

  it("Test 2: each file result contains reverse_blast_radius and risk classification", async () => {
    const result = await handlePredictImpact(
      { file_paths: ["src/C.ts"] },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    const fileResult = parsed.data.results[0];

    expect(fileResult.path).toBe("src/C.ts");
    expect(fileResult.risk).toBe("HIGH"); // centrality 0.8 > 0.7
    expect(typeof fileResult.centrality).toBe("number");
    expect(fileResult.centrality).toBe(0.8);
    expect(Array.isArray(fileResult.reverse_blast_radius)).toBe(true);
    expect(typeof fileResult.total_impacted_by).toBe("number");

    // Reverse blast radius from C should include B and A (inbound importers)
    const rbrNodeIds = fileResult.reverse_blast_radius.map(
      (n: Record<string, unknown>) => n.nodeId,
    );
    expect(rbrNodeIds).toContain("3"); // Self
    expect(rbrNodeIds).toContain("2"); // B imports C
    expect(rbrNodeIds).toContain("1"); // A imports B
  });

  it("Test 3: default max_hops is 4 when not provided", async () => {
    const result = await handlePredictImpact(
      { file_paths: ["src/C.ts"] },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.max_hops).toBe(4);
  });

  it("Test 4: custom max_hops parameter is respected", async () => {
    const result = await handlePredictImpact(
      { file_paths: ["src/E.ts"], max_hops: 1 },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.data.max_hops).toBe(1);

    // With maxHops=1 from E, should only get E (hop 0) and D (hop 1)
    const fileResult = parsed.data.results[0];
    const maxHop = Math.max(
      ...fileResult.reverse_blast_radius.map(
        (n: Record<string, unknown>) => n.hop as number,
      ),
    );
    expect(maxHop).toBeLessThanOrEqual(1);
  });

  it("Test 5: files not found in graph get LOW risk and empty reverse_blast_radius", async () => {
    const result = await handlePredictImpact(
      { file_paths: ["src/nonexistent.ts"] },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");

    const fileResult = parsed.data.results[0];
    expect(fileResult.path).toBe("src/nonexistent.ts");
    expect(fileResult.risk).toBe("LOW");
    expect(fileResult.centrality).toBe(0);
    expect(fileResult.reverse_blast_radius).toEqual([]);
    expect(fileResult.total_impacted_by).toBe(0);
  });

  it("Test 6: returns NOT_BOOTSTRAPPED error when not bootstrapped", async () => {
    isBootstrapped.mockReturnValue(false);

    const result = await handlePredictImpact(
      { file_paths: ["src/C.ts"] },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
  });

  it("Test 7: multiple file_paths are each individually analyzed", async () => {
    const result = await handlePredictImpact(
      { file_paths: ["src/A.ts", "src/C.ts", "src/E.ts"] },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.data.results.length).toBe(3);

    const paths = parsed.data.results.map(
      (r: Record<string, unknown>) => r.path,
    );
    expect(paths).toEqual(["src/A.ts", "src/C.ts", "src/E.ts"]);

    // A.ts centrality 0.0 -> LOW
    expect(parsed.data.results[0].risk).toBe("LOW");
    // C.ts centrality 0.8 -> HIGH
    expect(parsed.data.results[1].risk).toBe("HIGH");
    // E.ts centrality 0.1 -> LOW
    expect(parsed.data.results[2].risk).toBe("LOW");
  });
});
