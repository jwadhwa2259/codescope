import { describe, it, expect, beforeEach, vi } from "vitest";
import { DirectedGraph } from "graphology";
import type { BlastRadiusDiffResult } from "../../src/verify/types.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock readPlanFromDisk from execution/orchestrator
vi.mock("../../src/execution/orchestrator.js", () => ({
  readPlanFromDisk: vi.fn(),
}));

// Mock getGraph from graph/cache
vi.mock("../../src/graph/cache.js", () => ({
  getGraph: vi.fn(),
}));

// Mock fs for scope contract reading
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    readFileSync: vi.fn((...args: unknown[]) => {
      const filePath = args[0] as string;
      // Intercept scope contract reads, let others pass through
      if (filePath.includes("scope-contract")) {
        return (vi.mocked(actual.readFileSync) as unknown as { _scopeData: string })._scopeData ?? "{}";
      }
      return actual.readFileSync(filePath as string, args[1] as string);
    }),
  };
});

import { readPlanFromDisk } from "../../src/execution/orchestrator.js";
import { getGraph } from "../../src/graph/cache.js";
import * as fs from "node:fs";

// Import the function under test — will fail until implemented
import { computeBlastRadiusDiff } from "../../src/verify/blast-radius-diff.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildMockGraph(nodes: Array<{ id: string; filePath: string }>, edges: Array<[string, string]>): DirectedGraph {
  const graph = new DirectedGraph();
  for (const node of nodes) {
    graph.addNode(node.id, { filePath: node.filePath, name: node.id, kind: "file" });
  }
  for (const [src, tgt] of edges) {
    if (graph.hasNode(src) && graph.hasNode(tgt)) {
      graph.mergeEdge(src, tgt, { kind: "IMPORTS", weight: 1.0 });
    }
  }
  return graph;
}

function mockPlan(exclusiveWriteFiles: string[][]) {
  return {
    taskSlug: "test-task",
    createdAt: "2026-01-01T00:00:00Z",
    status: "APPROVED" as const,
    strategy: "sequential" as const,
    estimatedAgents: exclusiveWriteFiles.length,
    estimatedTotalTokens: 40000,
    agents: exclusiveWriteFiles.map((files, i) => ({
      name: `agent-${i}`,
      wave: 1,
      task: `Task ${i}`,
      exclusiveWriteFiles: files,
      readOnlyFiles: [],
      conventions: [],
      goldenFiles: [],
      dependsOn: [],
      estimatedTokens: 20000,
      timeoutSeconds: 300,
    })),
    waves: [{ waveNumber: 1, agents: exclusiveWriteFiles.map((_, i) => `agent-${i}`), mode: "sequential" as const }],
    validationResults: [],
    removedByUser: [],
  };
}

function mockScopeContract(affectedFilePaths: string[]) {
  return JSON.stringify({
    task: "test task",
    taskSlug: "test-task",
    createdAt: "2026-01-01T00:00:00Z",
    status: "APPROVED",
    inScope: [],
    outOfScope: [],
    affectedFiles: affectedFilePaths.map((fp) => ({
      filePath: fp,
      risk: "LOW",
      centrality: 0.1,
      community: null,
    })),
    assumptions: [],
    conventionsInScope: [],
    riskFlags: [],
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("computeBlastRadiusDiff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Test 1: returns empty surprises/skips/scopeDrift when predicted equals actual", async () => {
    const predictedFiles = ["src/a.ts", "src/b.ts"];
    vi.mocked(readPlanFromDisk).mockReturnValue(mockPlan([predictedFiles]));
    vi.mocked(getGraph).mockResolvedValue({
      graph: buildMockGraph(
        predictedFiles.map((f) => ({ id: f, filePath: f })),
        [],
      ),
      centralities: new Map(),
      loadedAt: Date.now(),
    });
    vi.mocked(fs.readFileSync).mockImplementation(((filePath: string, encoding?: string) => {
      if (typeof filePath === "string" && filePath.includes("scope-contract")) {
        return mockScopeContract(predictedFiles);
      }
      const actual = vi.importActual<typeof import("node:fs")>("node:fs");
      // Fallback -- this shouldn't be reached in this test
      return "";
    }) as typeof fs.readFileSync);

    const result = await computeBlastRadiusDiff(
      "/project",
      "/project/plan.json",
      "/project/scope-contract.json",
      predictedFiles,
    );

    expect(result.surprises).toHaveLength(0);
    expect(result.skips).toHaveLength(0);
    expect(result.scopeDrift).toHaveLength(0);
    expect(result.timing_ms).toBeGreaterThanOrEqual(0);
  });

  it("Test 2: identifies surprise files (in actual but not in predicted) with correct severity based on hop distance", async () => {
    const predictedFiles = ["src/a.ts"];
    const changedFiles = ["src/a.ts", "src/b.ts"]; // b.ts is surprise

    vi.mocked(readPlanFromDisk).mockReturnValue(mockPlan([predictedFiles]));

    // Graph: a -> b (1 hop)
    const graph = buildMockGraph(
      [
        { id: "src/a.ts", filePath: "src/a.ts" },
        { id: "src/b.ts", filePath: "src/b.ts" },
      ],
      [["src/a.ts", "src/b.ts"]],
    );
    vi.mocked(getGraph).mockResolvedValue({
      graph,
      centralities: new Map(),
      loadedAt: Date.now(),
    });

    vi.mocked(fs.readFileSync).mockImplementation(((filePath: string) => {
      if (typeof filePath === "string" && filePath.includes("scope-contract")) {
        return mockScopeContract([...predictedFiles, "src/b.ts"]);
      }
      return "";
    }) as typeof fs.readFileSync);

    const result = await computeBlastRadiusDiff(
      "/project",
      "/project/plan.json",
      "/project/scope-contract.json",
      changedFiles,
    );

    expect(result.surprises).toHaveLength(1);
    expect(result.surprises[0].filePath).toBe("src/b.ts");
    expect(result.surprises[0].minHopDistance).toBe(1);
  });

  it("Test 3: surprise files with hop distance 1-2 get severity WARN, hop 3+ or unconnected get severity ERROR (per D-08)", async () => {
    const predictedFiles = ["src/a.ts"];
    // b is 1 hop, c is 2 hops, d is 3 hops, e is unconnected
    const changedFiles = ["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"];

    vi.mocked(readPlanFromDisk).mockReturnValue(mockPlan([predictedFiles]));

    // Graph: a -> b -> c -> d, e is disconnected
    const graph = buildMockGraph(
      [
        { id: "src/a.ts", filePath: "src/a.ts" },
        { id: "src/b.ts", filePath: "src/b.ts" },
        { id: "src/c.ts", filePath: "src/c.ts" },
        { id: "src/d.ts", filePath: "src/d.ts" },
        { id: "src/e.ts", filePath: "src/e.ts" },
      ],
      [
        ["src/a.ts", "src/b.ts"],
        ["src/b.ts", "src/c.ts"],
        ["src/c.ts", "src/d.ts"],
      ],
    );
    vi.mocked(getGraph).mockResolvedValue({
      graph,
      centralities: new Map(),
      loadedAt: Date.now(),
    });

    vi.mocked(fs.readFileSync).mockImplementation(((filePath: string) => {
      if (typeof filePath === "string" && filePath.includes("scope-contract")) {
        return mockScopeContract(changedFiles);
      }
      return "";
    }) as typeof fs.readFileSync);

    const result = await computeBlastRadiusDiff(
      "/project",
      "/project/plan.json",
      "/project/scope-contract.json",
      changedFiles,
    );

    const bSurprise = result.surprises.find((s) => s.filePath === "src/b.ts");
    const cSurprise = result.surprises.find((s) => s.filePath === "src/c.ts");
    const dSurprise = result.surprises.find((s) => s.filePath === "src/d.ts");
    const eSurprise = result.surprises.find((s) => s.filePath === "src/e.ts");

    expect(bSurprise?.severity).toBe("WARN"); // hop 1
    expect(cSurprise?.severity).toBe("WARN"); // hop 2
    expect(dSurprise?.severity).toBe("ERROR"); // hop 3
    expect(eSurprise?.severity).toBe("ERROR"); // unconnected
    expect(eSurprise?.minHopDistance).toBe(-1);
  });

  it("Test 4: identifies skip files (in predicted but not in actual) as INFO severity (per D-09)", async () => {
    const predictedFiles = ["src/a.ts", "src/b.ts", "src/c.ts"];
    const changedFiles = ["src/a.ts"]; // b.ts and c.ts are skips

    vi.mocked(readPlanFromDisk).mockReturnValue(mockPlan([predictedFiles]));
    vi.mocked(getGraph).mockResolvedValue({
      graph: buildMockGraph(
        predictedFiles.map((f) => ({ id: f, filePath: f })),
        [],
      ),
      centralities: new Map(),
      loadedAt: Date.now(),
    });

    vi.mocked(fs.readFileSync).mockImplementation(((filePath: string) => {
      if (typeof filePath === "string" && filePath.includes("scope-contract")) {
        return mockScopeContract(predictedFiles);
      }
      return "";
    }) as typeof fs.readFileSync);

    const result = await computeBlastRadiusDiff(
      "/project",
      "/project/plan.json",
      "/project/scope-contract.json",
      changedFiles,
    );

    expect(result.skips).toHaveLength(2);
    for (const skip of result.skips) {
      expect(skip.severity).toBe("INFO");
      expect(skip.reason).toContain("Predicted but not modified");
    }
    const skipPaths = result.skips.map((s) => s.filePath);
    expect(skipPaths).toContain("src/b.ts");
    expect(skipPaths).toContain("src/c.ts");
  });

  it("Test 5: detects scope drift when files are modified that are not in the scope contract affectedFiles (per D-10)", async () => {
    const predictedFiles = ["src/a.ts"];
    const changedFiles = ["src/a.ts", "src/x.ts"]; // x.ts not in scope contract

    vi.mocked(readPlanFromDisk).mockReturnValue(mockPlan([predictedFiles]));
    vi.mocked(getGraph).mockResolvedValue({
      graph: buildMockGraph(
        [
          { id: "src/a.ts", filePath: "src/a.ts" },
          { id: "src/x.ts", filePath: "src/x.ts" },
        ],
        [["src/a.ts", "src/x.ts"]],
      ),
      centralities: new Map(),
      loadedAt: Date.now(),
    });

    // scope contract only knows about src/a.ts
    vi.mocked(fs.readFileSync).mockImplementation(((filePath: string) => {
      if (typeof filePath === "string" && filePath.includes("scope-contract")) {
        return mockScopeContract(["src/a.ts"]);
      }
      return "";
    }) as typeof fs.readFileSync);

    const result = await computeBlastRadiusDiff(
      "/project",
      "/project/plan.json",
      "/project/scope-contract.json",
      changedFiles,
    );

    expect(result.scopeDrift).toContain("src/x.ts");
  });

  it("Test 6: handles case where graph has no node for a file (unconnected = ERROR severity)", async () => {
    const predictedFiles = ["src/a.ts"];
    const changedFiles = ["src/a.ts", "src/unknown.ts"]; // unknown.ts not in graph

    vi.mocked(readPlanFromDisk).mockReturnValue(mockPlan([predictedFiles]));

    // Graph only contains a.ts -- unknown.ts not in graph
    vi.mocked(getGraph).mockResolvedValue({
      graph: buildMockGraph([{ id: "src/a.ts", filePath: "src/a.ts" }], []),
      centralities: new Map(),
      loadedAt: Date.now(),
    });

    vi.mocked(fs.readFileSync).mockImplementation(((filePath: string) => {
      if (typeof filePath === "string" && filePath.includes("scope-contract")) {
        return mockScopeContract(changedFiles);
      }
      return "";
    }) as typeof fs.readFileSync);

    const result = await computeBlastRadiusDiff(
      "/project",
      "/project/plan.json",
      "/project/scope-contract.json",
      changedFiles,
    );

    const unknownSurprise = result.surprises.find((s) => s.filePath === "src/unknown.ts");
    expect(unknownSurprise).toBeDefined();
    expect(unknownSurprise!.minHopDistance).toBe(-1);
    expect(unknownSurprise!.severity).toBe("ERROR");
  });

  it("Test 7: handles empty git diff (no changed files) gracefully", async () => {
    vi.mocked(readPlanFromDisk).mockReturnValue(mockPlan([["src/a.ts"]]));
    vi.mocked(getGraph).mockResolvedValue({
      graph: buildMockGraph([{ id: "src/a.ts", filePath: "src/a.ts" }], []),
      centralities: new Map(),
      loadedAt: Date.now(),
    });

    vi.mocked(fs.readFileSync).mockImplementation(((filePath: string) => {
      if (typeof filePath === "string" && filePath.includes("scope-contract")) {
        return mockScopeContract(["src/a.ts"]);
      }
      return "";
    }) as typeof fs.readFileSync);

    const result = await computeBlastRadiusDiff(
      "/project",
      "/project/plan.json",
      "/project/scope-contract.json",
      [], // empty changed files
    );

    expect(result.surprises).toHaveLength(0);
    // All predicted files should be skips
    expect(result.skips).toHaveLength(1);
    expect(result.skips[0].filePath).toBe("src/a.ts");
    expect(result.timing_ms).toBeGreaterThanOrEqual(0);
  });

  it("Test 8: handles empty plan (no predicted files) gracefully", async () => {
    vi.mocked(readPlanFromDisk).mockReturnValue(mockPlan([[]])); // no exclusive write files
    vi.mocked(getGraph).mockResolvedValue({
      graph: buildMockGraph(
        [
          { id: "src/a.ts", filePath: "src/a.ts" },
          { id: "src/b.ts", filePath: "src/b.ts" },
        ],
        [],
      ),
      centralities: new Map(),
      loadedAt: Date.now(),
    });

    vi.mocked(fs.readFileSync).mockImplementation(((filePath: string) => {
      if (typeof filePath === "string" && filePath.includes("scope-contract")) {
        return mockScopeContract(["src/a.ts", "src/b.ts"]);
      }
      return "";
    }) as typeof fs.readFileSync);

    const result = await computeBlastRadiusDiff(
      "/project",
      "/project/plan.json",
      "/project/scope-contract.json",
      ["src/a.ts", "src/b.ts"],
    );

    // All changed files are surprises since nothing was predicted
    expect(result.surprises).toHaveLength(2);
    expect(result.skips).toHaveLength(0);
    expect(result.timing_ms).toBeGreaterThanOrEqual(0);
  });
});
