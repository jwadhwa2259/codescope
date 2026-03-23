import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { DirectedGraph } from "graphology";
import { invalidateCache } from "../../src/graph/cache.js";

/**
 * Creates a temp project root with a graph.db containing test data.
 * Returns { projectRoot, cleanup }
 */
function setupTestProject(): {
  projectRoot: string;
  cleanup: () => void;
} {
  const projectRoot = fs.mkdtempSync(
    path.join(os.tmpdir(), "codescope-gq-test-"),
  );

  // We'll mock getGraph and isBootstrapped instead of using real SQLite
  return {
    projectRoot,
    cleanup: () => fs.rmSync(projectRoot, { recursive: true, force: true }),
  };
}

/**
 * Build a test graph with known structure:
 *
 * A.ts --IMPORTS--> B.ts --IMPORTS--> C.ts
 *                   B.ts --IMPORTS--> D.ts
 *
 * Where A.ts is the hub, C.ts and D.ts are leaves.
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
    name: "helperFn",
    kind: "function",
    filePath: "src/B.ts",
    loc: 10,
  });

  graph.mergeEdge("1", "2", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("2", "3", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("2", "4", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("1", "5", { kind: "CALLS", weight: 1 });

  return graph;
}

// We mock the modules that the tool imports
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

describe("codescope_graph_query (src/tools/graph-query.ts)", () => {
  let projectRoot: string;
  let cleanup: () => void;
  let testGraph: DirectedGraph;

  // Dynamic imports to get mocked versions
  let getGraph: ReturnType<typeof vi.fn>;
  let isBootstrapped: ReturnType<typeof vi.fn>;
  let handleGraphQuery: (
    args: Record<string, unknown>,
    projectRoot: string,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;

  beforeEach(async () => {
    const setup = setupTestProject();
    projectRoot = setup.projectRoot;
    cleanup = setup.cleanup;
    testGraph = buildTestGraph();

    const cacheModule = await import("../../src/graph/cache.js");
    getGraph = cacheModule.getGraph as unknown as ReturnType<typeof vi.fn>;

    const helpersModule = await import("../../src/tools/helpers.js");
    isBootstrapped = helpersModule.isBootstrapped as unknown as ReturnType<
      typeof vi.fn
    >;

    const graphQueryModule = await import("../../src/tools/graph-query.js");
    handleGraphQuery = graphQueryModule.handleGraphQuery;

    // Default: bootstrapped and graph available
    isBootstrapped.mockReturnValue(true);
    getGraph.mockReturnValue({
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
    cleanup();
    vi.clearAllMocks();
  });

  it('Test 1: query_type "neighbors" with file_path returns neighbor nodes with attributes', async () => {
    const result = await handleGraphQuery(
      { query_type: "neighbors", file_path: "src/A.ts" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.data.neighbors).toBeDefined();
    expect(parsed.data.neighbors.length).toBeGreaterThan(0);

    // A.ts connects to B.ts and helperFn
    const neighborNames = parsed.data.neighbors.map(
      (n: Record<string, unknown>) => n.name,
    );
    expect(neighborNames).toContain("B.ts");
  });

  it('Test 2: query_type "communities" returns community assignments for all nodes', async () => {
    const result = await handleGraphQuery(
      { query_type: "communities" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.data.communities).toBeDefined();
    expect(parsed.data.community_count).toBeGreaterThanOrEqual(1);
  });

  it('Test 3: query_type "paths" with two nodes returns connecting path (or empty if none)', async () => {
    const result = await handleGraphQuery(
      {
        query_type: "paths",
        file_path: "src/A.ts",
        target_file_path: "src/C.ts",
      },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.data.path).toBeDefined();
    // A -> B -> C should be a 3-node path
    expect(parsed.data.path.length).toBeGreaterThanOrEqual(2);
  });

  it("Test 4: Returns NODE_NOT_FOUND error for non-existent file_path", async () => {
    const result = await handleGraphQuery(
      { query_type: "neighbors", file_path: "src/nonexistent.ts" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NODE_NOT_FOUND");
  });

  it("Test 5: Returns NOT_BOOTSTRAPPED error when not bootstrapped", async () => {
    isBootstrapped.mockReturnValue(false);

    const result = await handleGraphQuery(
      { query_type: "neighbors", file_path: "src/A.ts" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
  });

  it("Test 6: Response includes query_ms in metadata", async () => {
    const result = await handleGraphQuery(
      { query_type: "neighbors", file_path: "src/A.ts" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("ok");
    expect(parsed.metadata).toBeDefined();
    expect(typeof parsed.metadata.query_ms).toBe("number");
  });
});
