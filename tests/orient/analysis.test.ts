import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock getGraph so we don't need a real SQLite database
vi.mock("../../src/graph/cache.js", () => {
  const { DirectedGraph } = require("graphology") as typeof import("graphology");

  function buildMockGraph(): {
    graph: InstanceType<typeof DirectedGraph>;
    centralities: Map<string, number>;
  } {
    const graph = new DirectedGraph();

    // Community 0: auth layer
    graph.addNode("1", {
      name: "auth.ts",
      kind: "file",
      filePath: "src/auth.ts",
      loc: 200,
      community: 0,
    });
    graph.addNode("2", {
      name: "user.ts",
      kind: "file",
      filePath: "src/user.ts",
      loc: 150,
      community: 0,
    });
    graph.addNode("3", {
      name: "login",
      kind: "function",
      filePath: "src/auth.ts",
      loc: 0,
      community: 0,
    });

    // Community 1: database layer
    graph.addNode("4", {
      name: "database.ts",
      kind: "file",
      filePath: "src/database.ts",
      loc: 300,
      community: 1,
    });
    graph.addNode("5", {
      name: "migrations.ts",
      kind: "file",
      filePath: "src/migrations.ts",
      loc: 100,
      community: 1,
    });

    // Community 2: API layer
    graph.addNode("6", {
      name: "router.ts",
      kind: "file",
      filePath: "src/router.ts",
      loc: 100,
      community: 2,
    });
    graph.addNode("7", {
      name: "middleware.ts",
      kind: "file",
      filePath: "src/middleware.ts",
      loc: 80,
      community: 2,
    });

    // Community 3: utils
    graph.addNode("8", {
      name: "logger.ts",
      kind: "file",
      filePath: "src/utils/logger.ts",
      loc: 60,
      community: 3,
    });

    // Test files
    graph.addNode("9", {
      name: "auth.test.ts",
      kind: "file",
      filePath: "tests/auth.test.ts",
      loc: 100,
      community: 0,
    });
    graph.addNode("10", {
      name: "user.spec.ts",
      kind: "file",
      filePath: "tests/user.spec.ts",
      loc: 80,
      community: 0,
    });

    // Edges
    graph.mergeEdge("1", "2", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("1", "4", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("3", "1", { kind: "CONTAINS", weight: 1 });
    graph.mergeEdge("6", "1", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("6", "7", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("7", "8", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("2", "4", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("9", "1", { kind: "IMPORTS", weight: 1 }); // test imports auth
    graph.mergeEdge("10", "2", { kind: "IMPORTS", weight: 1 }); // test imports user

    const centralities = new Map<string, number>();
    centralities.set("1", 0.8); // auth.ts - HIGH risk
    centralities.set("2", 0.5); // user.ts - MEDIUM risk
    centralities.set("3", 0.1); // login function
    centralities.set("4", 0.9); // database.ts - HIGH risk
    centralities.set("5", 0.1); // migrations.ts
    centralities.set("6", 0.3); // router.ts - MEDIUM risk
    centralities.set("7", 0.2); // middleware.ts
    centralities.set("8", 0.05); // logger.ts
    centralities.set("9", 0.05); // auth.test.ts
    centralities.set("10", 0.05); // user.spec.ts

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

// Mock blastRadius from analytics
vi.mock("../../src/graph/analytics.js", async (importOriginal) => {
  const original = (await importOriginal()) as Record<string, unknown>;
  return {
    ...original,
    blastRadius: vi.fn(
      (
        _graph: unknown,
        nodeId: string,
        _maxHops: number,
      ) => {
        // Return mock blast radius results based on nodeId
        if (nodeId === "1") {
          // auth.ts
          return [
            { nodeId: "1", name: "auth.ts", filePath: "src/auth.ts", hop: 0, risk: "Red" },
            { nodeId: "2", name: "user.ts", filePath: "src/user.ts", hop: 1, risk: "Orange" },
            { nodeId: "4", name: "database.ts", filePath: "src/database.ts", hop: 1, risk: "Orange" },
            { nodeId: "3", name: "login", filePath: "src/auth.ts", hop: 1, risk: "Orange" },
          ];
        }
        if (nodeId === "2") {
          // user.ts
          return [
            { nodeId: "2", name: "user.ts", filePath: "src/user.ts", hop: 0, risk: "Red" },
            { nodeId: "4", name: "database.ts", filePath: "src/database.ts", hop: 1, risk: "Orange" },
          ];
        }
        return [];
      },
    ),
    computeDangerZones: vi.fn(() => []),
  };
});

// Mock config loader
vi.mock("../../src/config/loader.js", () => ({
  loadConfig: vi.fn(() => null),
}));

// Mock paths
vi.mock("../../src/utils/paths.js", () => ({
  getCodescopePath: vi.fn((projectRoot: string) =>
    `${projectRoot}/.claude/codescope`,
  ),
}));

describe("runAnalysis", () => {
  let runAnalysis: typeof import("../../src/orient/analysis.js").runAnalysis;
  let tmpDir: string;

  beforeEach(async () => {
    const mod = await import("../../src/orient/analysis.js");
    runAnalysis = mod.runAnalysis;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-analysis-test-"));
    const codescopePath = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(codescopePath, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns affectedFiles with filePath, risk level, centrality, and community", async () => {
    const result = await runAnalysis({
      projectRoot: tmpDir,
      taskSlug: "update-auth",
      keywords: ["auth"],
      outputDir: tmpDir,
    });

    expect(result.affectedFiles.length).toBeGreaterThan(0);
    const authFile = result.affectedFiles.find((f) => f.filePath === "src/auth.ts");
    expect(authFile).toBeDefined();
    expect(authFile!.risk).toBe("HIGH"); // centrality 0.8 > 0.7
    expect(authFile!.centrality).toBe(0.8);
    expect(authFile!.community).toBe("0");
  });

  it("classifies risk as HIGH/MEDIUM/LOW based on centrality", async () => {
    const result = await runAnalysis({
      projectRoot: tmpDir,
      taskSlug: "update-all",
      keywords: ["ts"], // matches many nodes
      outputDir: tmpDir,
    });

    // auth.ts (0.8) -> HIGH, user.ts (0.5) -> MEDIUM, migrations.ts (0.1) -> LOW
    const auth = result.affectedFiles.find((f) => f.filePath === "src/auth.ts");
    const user = result.affectedFiles.find((f) => f.filePath === "src/user.ts");
    const migrations = result.affectedFiles.find((f) => f.filePath === "src/migrations.ts");

    expect(auth?.risk).toBe("HIGH");
    expect(user?.risk).toBe("MEDIUM");
    expect(migrations?.risk).toBe("LOW");
  });

  it("computes blastRadiusFiles from top-5 highest-centrality affected nodes", async () => {
    const result = await runAnalysis({
      projectRoot: tmpDir,
      taskSlug: "update-auth",
      keywords: ["auth"],
      outputDir: tmpDir,
    });

    // blastRadiusFiles should contain unique files from blast radius expansion
    expect(result.blastRadiusFiles.length).toBeGreaterThan(0);

    // Should have filePath, hopDistance, riskLevel
    for (const br of result.blastRadiusFiles) {
      expect(br.filePath).toBeDefined();
      expect(typeof br.hopDistance).toBe("number");
      expect(br.riskLevel).toBeDefined();
    }
  });

  it("returns conventionMatches from conventions.md", async () => {
    // Write a conventions.md file
    const codescopePath = path.join(tmpDir, ".claude", "codescope");
    fs.writeFileSync(
      path.join(codescopePath, "conventions.md"),
      [
        "## Exports",
        "",
        "**Convention:** Prefer Named Exports",
        "**Adoption:** 85%",
        "**Confidence:** HIGH-CONF",
        "**Category:** exports",
        "**Files:** src/auth.ts, src/user.ts",
        "**Evidence:**",
        "- src/auth.ts:1 -- Named export",
        "",
        "## Formatting",
        "",
        "**Convention:** Use Semicolons",
        "**Adoption:** 90%",
        "**Confidence:** HIGH-CONF",
        "**Category:** formatting",
        "**Files:** src/config.ts, src/router.ts",
        "**Evidence:**",
        "- src/config.ts:1 -- Semicolon usage",
      ].join("\n"),
    );

    const result = await runAnalysis({
      projectRoot: tmpDir,
      taskSlug: "update-auth",
      keywords: ["auth"],
      outputDir: tmpDir,
    });

    // "Prefer Named Exports" applies to src/auth.ts which is in affected files
    expect(result.conventionMatches).toContain("Prefer Named Exports");
    // "Use Semicolons" applies to src/config.ts, not in affected files for "auth"
    expect(result.conventionMatches).not.toContain("Use Semicolons");
  });

  it("returns testFiles by finding test/spec nodes connected to affected nodes", async () => {
    const result = await runAnalysis({
      projectRoot: tmpDir,
      taskSlug: "update-auth",
      keywords: ["auth"],
      outputDir: tmpDir,
    });

    // auth.test.ts is connected to auth.ts via edge
    expect(result.testFiles).toContain("tests/auth.test.ts");
  });

  it("returns crossCommunityImpact with community counts", async () => {
    const result = await runAnalysis({
      projectRoot: tmpDir,
      taskSlug: "update-auth",
      keywords: ["auth"],
      outputDir: tmpDir,
    });

    expect(result.crossCommunityImpact.length).toBeGreaterThan(0);
    for (const impact of result.crossCommunityImpact) {
      expect(typeof impact.communityId).toBe("number");
      expect(typeof impact.nodeCount).toBe("number");
      expect(typeof impact.affectedCount).toBe("number");
      expect(impact.nodeCount).toBeGreaterThanOrEqual(impact.affectedCount);
    }
  });

  it("records durationMs", async () => {
    const result = await runAnalysis({
      projectRoot: tmpDir,
      taskSlug: "update-auth",
      keywords: ["auth"],
      outputDir: tmpDir,
    });

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("caps affected files at 50", async () => {
    const result = await runAnalysis({
      projectRoot: tmpDir,
      taskSlug: "update-all",
      keywords: ["ts"], // matches many nodes
      outputDir: tmpDir,
    });

    expect(result.affectedFiles.length).toBeLessThanOrEqual(50);
  });

  it("sorts affected files by centrality descending", async () => {
    const result = await runAnalysis({
      projectRoot: tmpDir,
      taskSlug: "update-all",
      keywords: ["ts"],
      outputDir: tmpDir,
    });

    for (let i = 0; i < result.affectedFiles.length - 1; i++) {
      expect(result.affectedFiles[i].centrality).toBeGreaterThanOrEqual(
        result.affectedFiles[i + 1].centrality,
      );
    }
  });
});

describe("writeAnalysisArtifact", () => {
  let writeAnalysisArtifact: typeof import("../../src/orient/analysis.js").writeAnalysisArtifact;
  let tmpDir: string;

  beforeEach(async () => {
    const mod = await import("../../src/orient/analysis.js");
    writeAnalysisArtifact = mod.writeAnalysisArtifact;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-analysis-artifact-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("produces a file containing # Analysis, ## Affected Files, ## Blast Radius", () => {
    const result = {
      affectedFiles: [
        { filePath: "src/auth.ts", risk: "HIGH" as const, centrality: 0.8, community: "auth" },
      ],
      blastRadiusFiles: [
        { filePath: "src/auth.ts", hopDistance: 0, riskLevel: "Red" },
        { filePath: "src/user.ts", hopDistance: 1, riskLevel: "Orange" },
      ],
      conventionMatches: ["Prefer Named Exports"],
      testFiles: ["tests/auth.test.ts"],
      crossCommunityImpact: [{ communityId: 0, nodeCount: 10, affectedCount: 3 }],
      durationMs: 200,
    };

    const filePath = writeAnalysisArtifact(result, tmpDir);
    expect(fs.existsSync(filePath)).toBe(true);

    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("# Analysis");
    expect(content).toContain("## Affected Files");
    expect(content).toContain("## Blast Radius");
    expect(content).toContain("## Conventions in Scope");
    expect(content).toContain("## Test Files");
    expect(content).toContain("## Cross-Community Impact");
    expect(content).toContain("src/auth.ts");
    expect(content).toContain("Prefer Named Exports");
    expect(content).toContain("tests/auth.test.ts");
  });

  it("writes to the correct output directory", () => {
    const result = {
      affectedFiles: [],
      blastRadiusFiles: [],
      conventionMatches: [],
      testFiles: [],
      crossCommunityImpact: [],
      durationMs: 100,
    };

    const filePath = writeAnalysisArtifact(result, tmpDir);
    expect(filePath).toBe(path.join(tmpDir, "analysis.md"));
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
