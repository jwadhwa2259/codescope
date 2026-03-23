import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import { handleOrient } from "../../src/tools/orient.js";

// Mock getGraph so we don't need a real SQLite database
vi.mock("../../src/graph/cache.js", () => {
  const { DirectedGraph } = require("graphology") as typeof import("graphology");

  function buildMockGraph(): {
    graph: InstanceType<typeof DirectedGraph>;
    centralities: Map<string, number>;
  } {
    const graph = new DirectedGraph();

    // Add file nodes with various attributes
    graph.addNode("1", { name: "auth.ts", kind: "file", filePath: "src/auth.ts", loc: 200 });
    graph.addNode("2", { name: "user.ts", kind: "file", filePath: "src/user.ts", loc: 150 });
    graph.addNode("3", { name: "login", kind: "function", filePath: "src/auth.ts", loc: 0 });
    graph.addNode("4", { name: "register", kind: "function", filePath: "src/auth.ts", loc: 0 });
    graph.addNode("5", { name: "database.ts", kind: "file", filePath: "src/database.ts", loc: 300 });
    graph.addNode("6", { name: "config.ts", kind: "file", filePath: "src/config.ts", loc: 50 });
    graph.addNode("7", { name: "router.ts", kind: "file", filePath: "src/router.ts", loc: 100 });
    graph.addNode("8", { name: "middleware.ts", kind: "file", filePath: "src/middleware.ts", loc: 80 });
    graph.addNode("9", { name: "logger.ts", kind: "file", filePath: "src/utils/logger.ts", loc: 60 });
    graph.addNode("10", { name: "validation.ts", kind: "file", filePath: "src/validation.ts", loc: 70 });

    // Add edges
    graph.mergeEdge("1", "2", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("1", "5", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("3", "1", { kind: "CONTAINS", weight: 1 });
    graph.mergeEdge("4", "1", { kind: "CONTAINS", weight: 1 });
    graph.mergeEdge("2", "5", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("7", "1", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("7", "8", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("8", "9", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("10", "2", { kind: "IMPORTS", weight: 1 });

    // Build centralities map
    const centralities = new Map<string, number>();
    centralities.set("1", 0.8);  // auth.ts is highly central
    centralities.set("2", 0.5);  // user.ts is moderately central
    centralities.set("3", 0.1);
    centralities.set("4", 0.05);
    centralities.set("5", 0.9);  // database.ts is the most central
    centralities.set("6", 0.02);
    centralities.set("7", 0.3);
    centralities.set("8", 0.2);
    centralities.set("9", 0.05);
    centralities.set("10", 0.1);

    return { graph, centralities };
  }

  return {
    getGraph: vi.fn(() => {
      const mock = buildMockGraph();
      return {
        graph: mock.graph,
        centralities: mock.centralities,
        loadedAt: Date.now(),
      };
    }),
    invalidateCache: vi.fn(),
  };
});

// Mock computeDangerZones
vi.mock("../../src/graph/analytics.js", async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    computeDangerZones: vi.fn(() => [
      {
        filePath: "src/database.ts",
        inDegree: 0.9,
        communitiesTouched: 3,
        riskScore: 0.85,
        reasons: ["High in-degree centrality (0.900)", "Touches 3 communities"],
      },
      {
        filePath: "src/auth.ts",
        inDegree: 0.8,
        communitiesTouched: 2,
        riskScore: 0.7,
        reasons: ["High in-degree centrality (0.800)", "Touches 2 communities"],
      },
    ]),
  };
});

describe("codescope_orient", () => {
  let tmpDir: string;
  let codescopePath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-orient-test-"));
    codescopePath = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(codescopePath, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function setupBootstrapped(): void {
    fs.writeFileSync(path.join(codescopePath, "graph.db"), "");
    fs.writeFileSync(
      path.join(codescopePath, "bootstrap-meta.json"),
      JSON.stringify({
        last_bootstrap: new Date().toISOString(),
        duration_ms: 5000,
        mode: "full",
        version: "0.1.0",
      }),
    );
    // Write conventions.md
    fs.writeFileSync(
      path.join(codescopePath, "conventions.md"),
      "## Exports\n\n**Convention:** Prefer Named Exports\n**Adoption:** 85%\n**Confidence:** HIGH-CONF\n**Category:** exports\n**Files:** src/auth.ts, src/user.ts, src/database.ts\n**Evidence:**\n- src/auth.ts:1 -- Named export\n",
    );
  }

  it("Test 1: Returns lightweight brief with relevant files, conventions, and danger zones for a task", async () => {
    setupBootstrapped();

    const result = await handleOrient(tmpDir, { task: "add user authentication" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.task).toBe("add user authentication");
    expect(parsed.data.relevant_files).toBeDefined();
    expect(Array.isArray(parsed.data.relevant_files)).toBe(true);
    expect(parsed.data.relevant_files.length).toBeGreaterThan(0);
    expect(parsed.data.conventions).toBeDefined();
    expect(parsed.data.danger_zones).toBeDefined();
    expect(parsed.metadata).toBeDefined();
    expect(parsed.metadata.query_ms).toBeGreaterThanOrEqual(0);
  });

  it("Test 2: Keyword extraction from task description matches node names (case-insensitive)", async () => {
    setupBootstrapped();

    const result = await handleOrient(tmpDir, { task: "fix AUTH login bug" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    // Should match "auth" and "login" keywords against node names
    const filePaths = parsed.data.relevant_files.map((f: { filePath: string }) => f.filePath);
    expect(filePaths).toContain("src/auth.ts");
  });

  it("Test 3: Graph walk expands 1-2 hops from keyword-matched nodes", async () => {
    setupBootstrapped();

    const result = await handleOrient(tmpDir, { task: "update auth module" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    // auth.ts is directly matched; user.ts and database.ts are 1-hop neighbors
    const filePaths = parsed.data.relevant_files.map((f: { filePath: string }) => f.filePath);
    expect(filePaths).toContain("src/auth.ts");
    // Neighbors of auth.ts should also be included (1-2 hop expansion)
    expect(parsed.data.relevant_files.length).toBeGreaterThan(1);
  });

  it("Test 4: Results ranked by centrality, limited to top 20", async () => {
    setupBootstrapped();

    const result = await handleOrient(tmpDir, { task: "refactor database and auth" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.relevant_files.length).toBeLessThanOrEqual(20);

    // Check that results are sorted by centrality descending
    const centralityValues = parsed.data.relevant_files.map(
      (f: { centrality: number }) => f.centrality,
    );
    for (let i = 0; i < centralityValues.length - 1; i++) {
      expect(centralityValues[i]).toBeGreaterThanOrEqual(centralityValues[i + 1]);
    }
  });

  it("Test 5: Returns NOT_BOOTSTRAPPED error when not bootstrapped", async () => {
    // Do NOT set up bootstrapped state
    const result = await handleOrient(tmpDir, { task: "add feature" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
    expect(parsed.error.recovery).toContain("bootstrap");
  });

  it("Test 6: Returns meaningful result even for vague task descriptions (returns top-centrality nodes)", async () => {
    setupBootstrapped();

    // "xyz" won't match any node names, so should fall back to top-centrality nodes
    const result = await handleOrient(tmpDir, { task: "improve the code" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    // Should still return relevant_files (top centrality nodes as fallback)
    expect(parsed.data.relevant_files.length).toBeGreaterThan(0);
  });

  it("Test 7: Includes community context for matched nodes", async () => {
    setupBootstrapped();

    const result = await handleOrient(tmpDir, { task: "modify auth system" });
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.communities).toBeDefined();
    expect(Array.isArray(parsed.data.communities)).toBe(true);
  });
});
