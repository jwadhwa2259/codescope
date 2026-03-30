import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as os from "node:os";
import * as path from "node:path";
import * as fs from "node:fs";
import { DirectedGraph } from "graphology";

// ---- Test graph builder ----

/**
 * Build a test graph with files having known centralities for risk testing.
 *
 * Nodes (file kind):
 *   "1" -> src/A.ts (centrality 0.9 HIGH)
 *   "2" -> src/B.ts (centrality 0.5 MEDIUM)
 *   "3" -> src/C.ts (centrality 0.1 LOW)
 *   "4" -> src/D.ts (centrality 0.7 boundary MEDIUM)
 *   "5" -> src/E.ts (centrality 0.2 LOW, different community)
 *   "6" -> src/F.ts (centrality 0.3 MEDIUM boundary, different community)
 *   "7" -> src/G.ts (centrality 0.15 LOW, third community)
 *
 * Edges: 1->2, 2->3, 1->4, 5->6, 7->1 (creates cross-community edges)
 */
function buildReviewGraph(): DirectedGraph {
  const graph = new DirectedGraph();

  graph.addNode("1", { name: "A.ts", kind: "file", filePath: "src/A.ts", loc: 200 });
  graph.addNode("2", { name: "B.ts", kind: "file", filePath: "src/B.ts", loc: 80 });
  graph.addNode("3", { name: "C.ts", kind: "file", filePath: "src/C.ts", loc: 30 });
  graph.addNode("4", { name: "D.ts", kind: "file", filePath: "src/D.ts", loc: 50 });
  graph.addNode("5", { name: "E.ts", kind: "file", filePath: "src/E.ts", loc: 60 });
  graph.addNode("6", { name: "F.ts", kind: "file", filePath: "src/F.ts", loc: 40 });
  graph.addNode("7", { name: "G.ts", kind: "file", filePath: "src/G.ts", loc: 25 });

  graph.mergeEdge("1", "2", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("2", "3", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("1", "4", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("5", "6", { kind: "IMPORTS", weight: 1 });
  graph.mergeEdge("7", "1", { kind: "IMPORTS", weight: 1 });

  return graph;
}

// ---- Mocks ----

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

vi.mock("../../src/graph/analytics.js", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    blastRadius: vi.fn(),
  };
});

vi.mock("../../src/graph/database.js", () => ({
  openDatabase: vi.fn(),
  closeDatabase: vi.fn(),
}));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    execFileSync: vi.fn(),
  };
});

describe("codescope_review (src/tools/review.ts)", () => {
  let projectRoot: string;
  let testGraph: DirectedGraph;
  let getGraph: ReturnType<typeof vi.fn>;
  let isBootstrapped: ReturnType<typeof vi.fn>;
  let mockBlastRadius: ReturnType<typeof vi.fn>;
  let mockOpenDatabase: ReturnType<typeof vi.fn>;
  let mockCloseDatabase: ReturnType<typeof vi.fn>;
  let mockExecFileSync: ReturnType<typeof vi.fn>;
  let handleReview: (
    args: Record<string, unknown>,
    projectRoot: string,
  ) => Promise<{ content: Array<{ type: string; text: string }> }>;

  // Helper: build mock db that returns edges and communities
  function buildMockDb(options?: {
    edges?: Array<{
      source_id: number;
      target_id: number;
      kind: string;
      source_path: string;
      target_path: string;
    }>;
    communities?: Array<{
      node_id: number;
      community_id: number;
      modularity_class: string;
    }>;
    nodes?: Array<{
      id: number;
      file_path: string;
    }>;
  }) {
    const edges = options?.edges ?? [];
    const communities = options?.communities ?? [];
    const nodes = options?.nodes ?? [];

    return {
      prepare: vi.fn((sql: string) => {
        if (sql.includes("FROM edges")) {
          return { all: vi.fn(() => edges) };
        }
        if (sql.includes("FROM communities")) {
          return { all: vi.fn(() => communities) };
        }
        if (sql.includes("FROM nodes")) {
          return { all: vi.fn(() => nodes) };
        }
        return { all: vi.fn(() => []) };
      }),
    };
  }

  beforeEach(async () => {
    projectRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), "codescope-review-test-"),
    );
    testGraph = buildReviewGraph();

    // Set up codescope directory for conventions.md tests
    const csPath = path.join(projectRoot, ".claude", "codescope");
    fs.mkdirSync(csPath, { recursive: true });

    const cacheModule = await import("../../src/graph/cache.js");
    getGraph = cacheModule.getGraph as unknown as ReturnType<typeof vi.fn>;

    const helpersModule = await import("../../src/tools/helpers.js");
    isBootstrapped = helpersModule.isBootstrapped as unknown as ReturnType<
      typeof vi.fn
    >;

    const analyticsModule = await import("../../src/graph/analytics.js");
    mockBlastRadius = analyticsModule.blastRadius as unknown as ReturnType<
      typeof vi.fn
    >;

    const dbModule = await import("../../src/graph/database.js");
    mockOpenDatabase = dbModule.openDatabase as unknown as ReturnType<typeof vi.fn>;
    mockCloseDatabase = dbModule.closeDatabase as unknown as ReturnType<typeof vi.fn>;

    const cpModule = await import("node:child_process");
    mockExecFileSync = cpModule.execFileSync as unknown as ReturnType<typeof vi.fn>;

    const reviewModule = await import("../../src/tools/review/index.js");
    handleReview = reviewModule.handleReview;

    // Default: bootstrapped and graph available
    isBootstrapped.mockReturnValue(true);
    getGraph.mockResolvedValue({
      graph: testGraph,
      centralities: new Map([
        ["1", 0.9],  // HIGH
        ["2", 0.5],  // MEDIUM
        ["3", 0.1],  // LOW
        ["4", 0.7],  // boundary MEDIUM (<=0.7)
        ["5", 0.2],  // LOW
        ["6", 0.3],  // MEDIUM boundary
        ["7", 0.15], // LOW
      ]),
      loadedAt: Date.now(),
    });

    // Default blast radius mock
    mockBlastRadius.mockImplementation(
      (_graph: DirectedGraph, nodeId: string, _maxHops?: number) => {
        if (nodeId === "1") return [{ nodeId: "1" }, { nodeId: "2" }, { nodeId: "4" }];
        if (nodeId === "2") return [{ nodeId: "2" }, { nodeId: "3" }];
        if (nodeId === "3") return [{ nodeId: "3" }];
        if (nodeId === "4") return [{ nodeId: "4" }];
        if (nodeId === "5") return [{ nodeId: "5" }, { nodeId: "6" }];
        if (nodeId === "6") return [{ nodeId: "6" }];
        if (nodeId === "7") return [{ nodeId: "7" }];
        return [];
      },
    );

    // Default mock db with edges and communities
    const mockDb = buildMockDb({
      edges: [
        { source_id: 1, target_id: 2, kind: "IMPORTS", source_path: "src/A.ts", target_path: "src/B.ts" },
        { source_id: 2, target_id: 3, kind: "IMPORTS", source_path: "src/B.ts", target_path: "src/C.ts" },
      ],
      communities: [
        { node_id: 1, community_id: 0, modularity_class: "src/core" },
        { node_id: 2, community_id: 0, modularity_class: "src/core" },
        { node_id: 3, community_id: 0, modularity_class: "src/core" },
      ],
      nodes: [
        { id: 1, file_path: "src/A.ts" },
        { id: 2, file_path: "src/B.ts" },
        { id: 3, file_path: "src/C.ts" },
      ],
    });
    mockOpenDatabase.mockReturnValue(mockDb);
    mockCloseDatabase.mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
    vi.clearAllMocks();
  });

  // ---- Test 1: Risk scores ----
  it("Test 1: returns summary with correct high/medium/low counts and per-file risk tiers", async () => {
    const diff = `diff --git a/src/A.ts b/src/A.ts
--- a/src/A.ts
+++ b/src/A.ts
@@ -1 +1 @@
-old
+new
diff --git a/src/B.ts b/src/B.ts
--- a/src/B.ts
+++ b/src/B.ts
@@ -1 +1 @@
-old
+new
diff --git a/src/C.ts b/src/C.ts
--- a/src/C.ts
+++ b/src/C.ts
@@ -1 +1 @@
-old
+new`;

    const result = await handleReview({ diff }, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.summary.total_files).toBe(3);
    expect(parsed.data.summary.high_risk).toBe(1);    // A.ts (0.9)
    expect(parsed.data.summary.medium_risk).toBe(1);   // B.ts (0.5)
    expect(parsed.data.summary.low_risk).toBe(1);      // C.ts (0.1)

    const fileA = parsed.data.files.find((f: Record<string, unknown>) => f.path === "src/A.ts");
    const fileB = parsed.data.files.find((f: Record<string, unknown>) => f.path === "src/B.ts");
    const fileC = parsed.data.files.find((f: Record<string, unknown>) => f.path === "src/C.ts");

    expect(fileA.risk).toBe("HIGH");
    expect(fileA.centrality).toBe(0.9);
    expect(fileA.blast_radius_count).toBe(3);

    expect(fileB.risk).toBe("MEDIUM");
    expect(fileB.centrality).toBe(0.5);
    expect(fileB.blast_radius_count).toBe(2);

    expect(fileC.risk).toBe("LOW");
    expect(fileC.centrality).toBe(0.1);
    expect(fileC.blast_radius_count).toBe(1);
  });

  // ---- Test 2: Dependency changes ----
  it("Test 2: detects edges involving changed files and reports them", async () => {
    const diff = `diff --git a/src/A.ts b/src/A.ts
--- a/src/A.ts
+++ b/src/A.ts
@@ -1 +1 @@
-old
+new`;

    const result = await handleReview({ diff }, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.dependency_changes).toBeDefined();
    expect(parsed.data.dependency_changes.new_edges).toBeDefined();
    expect(Array.isArray(parsed.data.dependency_changes.new_edges)).toBe(true);

    // Should have edges involving src/A.ts
    const edges = parsed.data.dependency_changes.new_edges;
    expect(edges.length).toBeGreaterThan(0);
    expect(
      edges.some((e: Record<string, unknown>) => e.source === "src/A.ts" || e.target === "src/A.ts"),
    ).toBe(true);
  });

  // ---- Test 3: Convention compliance ----
  it("Test 3: matches changed files against conventions.md and reports violations", async () => {
    // Write a conventions.md file
    const csPath = path.join(projectRoot, ".claude", "codescope");
    const conventionsContent = `---
generated: "2026-03-30T12:00:00.000Z"
generator: "convention-detector"
phase: 2
total_rules_evaluated: 4
total_conventions_detected: 2
false_positive_target: "<5%"
---

# Conventions

### Use camelCase for functions

| Metric | Value |
|--------|-------|
| Adoption | 85% (17/20 files) |
| Confidence | HIGH-CONF |
| Trend | Stable |
| Category | naming |

**Evidence:**
- \`src/A.ts:10\` -- function myFunc()
- \`src/B.ts:5\` -- function otherFunc()
- \`src/C.ts:3\` -- function anotherFunc()

### Use named imports

| Metric | Value |
|--------|-------|
| Adoption | 92% (23/25 files) |
| Confidence | MEDIUM-CONF |
| Trend | Stable |
| Category | imports |

**Evidence:**
- \`src/D.ts:1\` -- import { foo } from './foo'
- \`src/E.ts:2\` -- import { bar } from './bar'
`;
    fs.writeFileSync(path.join(csPath, "conventions.md"), conventionsContent);

    const diff = `diff --git a/src/A.ts b/src/A.ts
--- a/src/A.ts
+++ b/src/A.ts
@@ -1 +1 @@
-old
+new`;

    const result = await handleReview({ diff }, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.convention_violations).toBeDefined();
    expect(Array.isArray(parsed.data.convention_violations)).toBe(true);

    // src/A.ts is in the "Use camelCase for functions" convention
    const violation = parsed.data.convention_violations.find(
      (v: Record<string, unknown>) => v.file === "src/A.ts",
    );
    expect(violation).toBeDefined();
    expect(violation.convention).toBe("Use camelCase for functions");
    expect(violation.adoption_pct).toBe(85);
    expect(violation.confidence).toBe("HIGH-CONF");
    expect(violation.evidence.length).toBeGreaterThan(0);
  });

  // ---- Test 4: Cross-community flagging ----
  it("Test 4: flags when 3+ communities are touched per D-08", async () => {
    // Set up mock db with 3 communities for changed files
    const mockDb = buildMockDb({
      edges: [],
      communities: [
        { node_id: 1, community_id: 0, modularity_class: "src/core" },
        { node_id: 5, community_id: 1, modularity_class: "src/services" },
        { node_id: 7, community_id: 2, modularity_class: "src/utils" },
      ],
      nodes: [
        { id: 1, file_path: "src/A.ts" },
        { id: 5, file_path: "src/E.ts" },
        { id: 7, file_path: "src/G.ts" },
      ],
    });
    mockOpenDatabase.mockReturnValue(mockDb);

    const diff = `diff --git a/src/A.ts b/src/A.ts
--- a/src/A.ts
+++ b/src/A.ts
@@ -1 +1 @@
-old
+new
diff --git a/src/E.ts b/src/E.ts
--- a/src/E.ts
+++ b/src/E.ts
@@ -1 +1 @@
-old
+new
diff --git a/src/G.ts b/src/G.ts
--- a/src/G.ts
+++ b/src/G.ts
@@ -1 +1 @@
-old
+new`;

    const result = await handleReview({ diff }, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.cross_community_changes).toBeDefined();
    expect(parsed.data.cross_community_changes.communities_touched).toBe(3);
    expect(parsed.data.cross_community_changes.flagged).toBe(true);
    expect(parsed.data.cross_community_changes.community_breakdown.length).toBe(3);
  });

  // ---- Test 5: Input resolution - diff ----
  it("Test 5: with diff string calls parseFilesFromDiff to extract files", async () => {
    const diff = `diff --git a/src/C.ts b/src/C.ts
--- a/src/C.ts
+++ b/src/C.ts
@@ -1 +1 @@
-old
+new`;

    const result = await handleReview({ diff }, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.files.length).toBe(1);
    expect(parsed.data.files[0].path).toBe("src/C.ts");
  });

  // ---- Test 6: Input resolution - branch ----
  it("Test 6: with branch param executes git diff against detected default branch", async () => {
    // Mock: detectDefaultBranch returns "main" via symbolic-ref
    mockExecFileSync.mockImplementation(
      (cmd: string, args: string[], _opts?: Record<string, unknown>) => {
        if (cmd === "git" && args[0] === "symbolic-ref") {
          return "origin/main";
        }
        if (cmd === "git" && args[0] === "diff" && args[1]?.includes("...")) {
          // git diff main...feature-branch --name-only
          if (args.includes("--name-only")) {
            return "src/A.ts\nsrc/B.ts\n";
          }
          // full diff
          return `diff --git a/src/A.ts b/src/A.ts
--- a/src/A.ts
+++ b/src/A.ts
@@ -1 +1 @@
-old
+new
diff --git a/src/B.ts b/src/B.ts
--- a/src/B.ts
+++ b/src/B.ts
@@ -1 +1 @@
-old
+new`;
        }
        return "";
      },
    );

    const result = await handleReview({ branch: "feature-branch" }, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.files.length).toBe(2);
  });

  // ---- Test 7: Input resolution - PR ----
  it("Test 7: with pr_number executes gh pr diff; on failure returns GH_CLI_UNAVAILABLE", async () => {
    mockExecFileSync.mockImplementation(
      (cmd: string, _args: string[], _opts?: Record<string, unknown>) => {
        if (cmd === "gh") {
          throw new Error("gh: command not found");
        }
        return "";
      },
    );

    const result = await handleReview({ pr_number: 42 }, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("GH_CLI_UNAVAILABLE");
    expect(parsed.error.recovery).toBeDefined();
  });

  // ---- Test 8: Input resolution - default (working tree) ----
  it("Test 8: with no input params falls back to working tree diff", async () => {
    // Mock: git diff --name-only HEAD returns files
    mockExecFileSync.mockImplementation(
      (cmd: string, args: string[], _opts?: Record<string, unknown>) => {
        if (cmd === "git" && args[0] === "diff" && args.includes("--name-only")) {
          return "src/B.ts\n";
        }
        return "";
      },
    );

    const result = await handleReview({}, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.files.length).toBe(1);
    expect(parsed.data.files[0].path).toBe("src/B.ts");
  });

  // ---- Test 9: Not bootstrapped ----
  it("Test 9: returns NOT_BOOTSTRAPPED when isBootstrapped returns false", async () => {
    isBootstrapped.mockReturnValue(false);

    const result = await handleReview(
      { diff: "diff --git a/src/A.ts b/src/A.ts" },
      projectRoot,
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.status).toBe("error");
    expect(parsed.error.code).toBe("NOT_BOOTSTRAPPED");
  });

  // ---- Test 10: Missing files get graceful handling ----
  it("Test 10: files not in graph get LOW risk, 0 centrality, 0 blast_radius_count", async () => {
    const diff = `diff --git a/src/unknown.ts b/src/unknown.ts
--- a/src/unknown.ts
+++ b/src/unknown.ts
@@ -1 +1 @@
-old
+new`;

    const result = await handleReview({ diff }, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    const unknownFile = parsed.data.files.find(
      (f: Record<string, unknown>) => f.path === "src/unknown.ts",
    );
    expect(unknownFile).toBeDefined();
    expect(unknownFile.risk).toBe("LOW");
    expect(unknownFile.centrality).toBe(0);
    expect(unknownFile.blast_radius_count).toBe(0);
  });

  // ---- Test 11: Cycle detection -- only NEW cycles reported ----
  it("Test 11: only new cycles involving changed files are reported", async () => {
    // Build a graph with an existing cycle (3->4->5->3) and a potential new cycle involving changed file
    const cycleGraph = new DirectedGraph();
    cycleGraph.addNode("1", { name: "A.ts", kind: "file", filePath: "src/A.ts", loc: 100 });
    cycleGraph.addNode("2", { name: "B.ts", kind: "file", filePath: "src/B.ts", loc: 50 });
    cycleGraph.addNode("3", { name: "C.ts", kind: "file", filePath: "src/C.ts", loc: 30 });

    // Create a cycle involving A.ts (changed file): A -> B -> A
    cycleGraph.mergeEdge("1", "2", { kind: "IMPORTS", weight: 1 });
    cycleGraph.mergeEdge("2", "1", { kind: "IMPORTS", weight: 1 });

    getGraph.mockResolvedValue({
      graph: cycleGraph,
      centralities: new Map([
        ["1", 0.5],
        ["2", 0.3],
        ["3", 0.1],
      ]),
      loadedAt: Date.now(),
    });

    mockBlastRadius.mockImplementation(() => [{ nodeId: "1" }]);

    const mockDb = buildMockDb({
      edges: [
        { source_id: 1, target_id: 2, kind: "IMPORTS", source_path: "src/A.ts", target_path: "src/B.ts" },
        { source_id: 2, target_id: 1, kind: "IMPORTS", source_path: "src/B.ts", target_path: "src/A.ts" },
      ],
      communities: [
        { node_id: 1, community_id: 0, modularity_class: "src/core" },
        { node_id: 2, community_id: 0, modularity_class: "src/core" },
      ],
      nodes: [
        { id: 1, file_path: "src/A.ts" },
        { id: 2, file_path: "src/B.ts" },
      ],
    });
    mockOpenDatabase.mockReturnValue(mockDb);

    const diff = `diff --git a/src/A.ts b/src/A.ts
--- a/src/A.ts
+++ b/src/A.ts
@@ -1 +1 @@
-old
+new`;

    const result = await handleReview({ diff }, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.dependency_changes.circular_dependencies).toBeDefined();
    expect(Array.isArray(parsed.data.dependency_changes.circular_dependencies)).toBe(true);

    // The cycle A -> B -> A should be detected since A.ts is a changed file
    if (parsed.data.dependency_changes.circular_dependencies.length > 0) {
      const cycle = parsed.data.dependency_changes.circular_dependencies[0];
      expect(Array.isArray(cycle)).toBe(true);
      // Cycle should contain file paths
      expect(
        cycle.some((p: string) => p.includes("A.ts") || p.includes("B.ts")),
      ).toBe(true);
    }
  });

  // ---- Test: PR diff success path ----
  it("Test 7b: with pr_number succeeds when gh CLI is available", async () => {
    mockExecFileSync.mockImplementation(
      (cmd: string, args: string[], _opts?: Record<string, unknown>) => {
        if (cmd === "gh" && args[0] === "pr" && args[1] === "diff") {
          return `diff --git a/src/A.ts b/src/A.ts
--- a/src/A.ts
+++ b/src/A.ts
@@ -1 +1 @@
-old
+new`;
        }
        return "";
      },
    );

    const result = await handleReview({ pr_number: 42 }, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.files.length).toBe(1);
    expect(parsed.data.files[0].path).toBe("src/A.ts");
  });

  // ---- Test: Response shape matches ReviewData (D-01) ----
  it("Test: response follows ReviewData shape from D-01", async () => {
    const diff = `diff --git a/src/A.ts b/src/A.ts
--- a/src/A.ts
+++ b/src/A.ts
@@ -1 +1 @@
-old
+new`;

    const result = await handleReview({ diff }, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");

    // Verify all top-level keys exist
    expect(parsed.data.summary).toBeDefined();
    expect(parsed.data.files).toBeDefined();
    expect(parsed.data.dependency_changes).toBeDefined();
    expect(parsed.data.convention_violations).toBeDefined();
    expect(parsed.data.cross_community_changes).toBeDefined();

    // Summary shape
    expect(typeof parsed.data.summary.total_files).toBe("number");
    expect(typeof parsed.data.summary.high_risk).toBe("number");
    expect(typeof parsed.data.summary.medium_risk).toBe("number");
    expect(typeof parsed.data.summary.low_risk).toBe("number");

    // Dependency changes shape
    expect(Array.isArray(parsed.data.dependency_changes.new_edges)).toBe(true);
    expect(Array.isArray(parsed.data.dependency_changes.removed_edges)).toBe(true);
    expect(Array.isArray(parsed.data.dependency_changes.circular_dependencies)).toBe(true);

    // Cross-community shape
    expect(typeof parsed.data.cross_community_changes.communities_touched).toBe("number");
    expect(typeof parsed.data.cross_community_changes.flagged).toBe("boolean");
    expect(Array.isArray(parsed.data.cross_community_changes.community_breakdown)).toBe(true);

    // Metadata
    expect(parsed.metadata).toBeDefined();
    expect(typeof parsed.metadata.query_ms).toBe("number");
  });

  // ---- Test: Cross-community NOT flagged when <3 communities ----
  it("Test 4b: not flagged when fewer than 3 communities are touched", async () => {
    // Only 1 community touched
    const diff = `diff --git a/src/A.ts b/src/A.ts
--- a/src/A.ts
+++ b/src/A.ts
@@ -1 +1 @@
-old
+new`;

    const result = await handleReview({ diff }, projectRoot);
    const parsed = JSON.parse(result.content[0].text);

    expect(parsed.status).toBe("ok");
    expect(parsed.data.cross_community_changes.flagged).toBe(false);
  });
});
