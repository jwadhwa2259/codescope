import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { DirectedGraph } from "graphology";

/**
 * Build a test graph with various node types for search testing.
 *
 * Files: A.ts, B.ts, utils/helper.ts
 * Functions: processData (in A.ts), validateInput (in B.ts)
 * Edges: A --IMPORTS--> B, A --CALLS--> processData, B --EXTENDS--> helper
 */
function buildSearchGraph(): DirectedGraph {
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
    name: "helper.ts",
    kind: "file",
    filePath: "src/utils/helper.ts",
    loc: 30,
  });
  graph.addNode("4", {
    name: "processData",
    kind: "function",
    filePath: "src/A.ts",
    loc: 15,
  });
  graph.addNode("5", {
    name: "validateInput",
    kind: "function",
    filePath: "src/B.ts",
    loc: 10,
  });

  graph.mergeEdge("1", "2", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("1", "4", { kind: "CALLS", weight: 1 });
  graph.mergeEdge("2", "3", { kind: "EXTENDS", weight: 1 });

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

describe("codescope_search (src/tools/search.ts)", () => {
  let projectRoot: string;
  let testGraph: DirectedGraph;
  let getGraph: ReturnType<typeof vi.fn>;
  let isBootstrapped: ReturnType<typeof vi.fn>;
  let handleSearch: (
    args: Record<string, unknown>,
    projectRoot: string,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;

  beforeEach(async () => {
    projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "codescope-search-test-"),
    );
    testGraph = buildSearchGraph();

    const cacheModule = await import("../../src/graph/cache.js");
    getGraph = cacheModule.getGraph as unknown as ReturnType<typeof vi.fn>;

    const helpersModule = await import("../../src/tools/helpers.js");
    isBootstrapped = helpersModule.isBootstrapped as unknown as ReturnType<
      typeof vi.fn
    >;

    const searchModule = await import("../../src/tools/search.js");
    handleSearch = searchModule.handleSearch;

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
      ]),
      loadedAt: Date.now(),
    });
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  it("Test 1: Finds symbols by name (exact match)", async () => {
    const result = await handleSearch(
      { query: "processData" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.data.results.length).toBeGreaterThan(0);
    const names = parsed.data.results.map(
      (r: Record<string, unknown>) => r.name,
    );
    expect(names).toContain("processData");
  });

  it("Test 2: Finds symbols by partial name (substring match)", async () => {
    const result = await handleSearch(
      { query: "validate" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.data.results.length).toBeGreaterThan(0);
    const names = parsed.data.results.map(
      (r: Record<string, unknown>) => r.name,
    );
    expect(names).toContain("validateInput");
  });

  it("Test 3: Finds nodes by file_path pattern", async () => {
    const result = await handleSearch(
      { query: "utils/helper" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.data.results.length).toBeGreaterThan(0);
    const paths = parsed.data.results.map(
      (r: Record<string, unknown>) => r.filePath,
    );
    expect(paths).toContain("src/utils/helper.ts");
  });

  it("Test 4: Finds nodes by relationship type (e.g., all nodes with IMPORTS edges)", async () => {
    const result = await handleSearch(
      { query: "IMPORTS" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    // Nodes connected by IMPORTS edges: A.ts (source), B.ts (target)
    expect(parsed.data.results.length).toBeGreaterThan(0);
  });

  it("Test 5: Returns empty results with message when no matches per UI-SPEC", async () => {
    const result = await handleSearch(
      { query: "nonExistentSymbol12345" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.data.results).toEqual([]);
    expect(parsed.data.message).toContain("No symbols matching");
  });

  it("Test 6: Returns NOT_BOOTSTRAPPED error when not bootstrapped", async () => {
    isBootstrapped.mockReturnValue(false);

    const result = await handleSearch(
      { query: "anything" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
  });

  it('Test 7: Response includes capabilities:["graph"] and upcoming:["text","hybrid"] per D-38', async () => {
    const result = await handleSearch(
      { query: "processData" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.metadata.capabilities).toEqual(["graph"]);
    expect(parsed.metadata.upcoming).toEqual(["text", "hybrid"]);
  });

  it("Test 8: Limits results to 50 entries", async () => {
    // Build a large graph with 60 nodes matching the query
    const largeGraph = new DirectedGraph();
    for (let i = 0; i < 60; i++) {
      largeGraph.addNode(String(i), {
        name: `item_${i}`,
        kind: "function",
        filePath: `src/item_${i}.ts`,
        loc: 10,
      });
    }

    const largeCentralities = new Map<string, number>();
    for (let i = 0; i < 60; i++) {
      largeCentralities.set(String(i), i / 60);
    }

    getGraph.mockResolvedValue({
      graph: largeGraph,
      centralities: largeCentralities,
      loadedAt: Date.now(),
    });

    const result = await handleSearch(
      { query: "item" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.data.results.length).toBe(50);
    expect(parsed.data.total_matches).toBe(60);
  });
});
