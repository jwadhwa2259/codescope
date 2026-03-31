import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ---------------------------------------------------------------------------
// Mocks -- follow the same pattern as orchestrator.test.ts
// vi.mock factories must not reference top-level variables (hoisting issue)
// ---------------------------------------------------------------------------

vi.mock("../../src/graph/builder.js", () => ({
  buildGraph: vi.fn(),
}));

vi.mock("../../src/agents/scout.js", () => ({
  runScout: vi.fn(),
}));

vi.mock("../../src/agents/researcher.js", () => ({
  runResearcher: vi.fn(async (opts: { projectRoot: string; outputDir: string }) => {
    fs.mkdirSync(opts.outputDir, { recursive: true });
    const overviewPath = path.join(opts.outputDir, "overview.md");
    fs.writeFileSync(overviewPath, "# Overview\n");
    return { overviewPath, lineCount: 10, durationMs: 200 };
  }),
}));

vi.mock("../../src/agents/convention-detector.js", () => ({
  runConventionDetector: vi.fn(async (opts: { projectRoot: string; outputDir: string }) => {
    fs.mkdirSync(opts.outputDir, { recursive: true });
    const convPath = path.join(opts.outputDir, "conventions.md");
    const goldenPath = path.join(opts.outputDir, "golden-files.md");
    fs.writeFileSync(convPath, "# Conventions\n");
    fs.writeFileSync(goldenPath, "# Golden Files\n");
    return {
      conventionsPath: convPath,
      goldenFilesPath: goldenPath,
      conventionsDetected: 5,
      conflictsDetected: 0,
      goldenFileCount: 2,
      durationMs: 100,
    };
  }),
}));

vi.mock("../../src/agents/risk-analyzer.js", () => ({
  runRiskAnalyzer: vi.fn(async (opts: { outputDir: string }) => {
    fs.mkdirSync(opts.outputDir, { recursive: true });
    const dzPath = path.join(opts.outputDir, "danger-zones.md");
    fs.writeFileSync(dzPath, "# Danger Zones\n");
    return {
      dangerZonesPath: dzPath,
      nodesCreated: 200,
      edgesCreated: 80,
      totalImports: 120,
      communitiesDetected: 3,
      dangerZoneCount: 2,
      durationMs: 300,
    };
  }),
}));

vi.mock("../../src/agents/learning-synthesizer.js", () => ({
  runLearningSynthesizer: vi.fn(async (opts: { projectRoot: string; outputDir: string }) => {
    fs.mkdirSync(opts.outputDir, { recursive: true });
    const learningsPath = path.join(opts.outputDir, "learnings.md");
    fs.writeFileSync(learningsPath, "# Learnings\n");
    return { learningsPath, durationMs: 50 };
  }),
}));

vi.mock("../../src/bootstrap/synthesis.js", () => ({
  runSynthesis: vi.fn(async (opts: { outputDir: string }) => {
    const mapPath = path.join(opts.outputDir, "cross-service-map.md");
    fs.writeFileSync(mapPath, "# Cross-Service Map\n");
    return {
      crossServiceMapPath: mapPath,
      dependencies: [],
      mergedConventions: [],
      durationMs: 100,
    };
  }),
}));

vi.mock("../../src/bootstrap/readiness.js", () => ({
  computeReadiness: vi.fn(() => ({
    overall: { grade: "B", percent: 83 },
    dimensions: {
      conventionCoverage: { percent: 80, grade: "B-", delta: null, explainer: "" },
      typeSafety: { percent: 90, grade: "A-", delta: null, explainer: "" },
      testCoverageProxy: { percent: 70, grade: "C-", delta: null, explainer: "" },
      importGraphHealth: { percent: 92, grade: "A-", delta: null, explainer: "" },
    },
    improvements: [],
  })),
  writeReadinessArtifact: vi.fn((outputDir: string) => {
    const p = path.join(outputDir, "readiness.md");
    fs.writeFileSync(p, "# Readiness\n");
    return p;
  }),
}));

vi.mock("../../src/bootstrap/incremental.js", () => ({
  analyzeChanges: vi.fn(() => ({
    mode: "full",
    reason: "First bootstrap",
    changedFiles: [],
    changedPercentage: 100,
    affectedServices: [],
  })),
}));

vi.mock("../../src/bootstrap/meta.js", () => ({
  readBootstrapMeta: vi.fn(() => null),
  writeBootstrapMeta: vi.fn(),
}));

vi.mock("../../src/graph/cache.js", () => ({
  invalidateCache: vi.fn(),
}));

vi.mock("../../src/config/loader.js", () => ({
  loadConfig: vi.fn(() => null),
}));

vi.mock("../../src/utils/paths.js", () => ({
  getCodescopePath: vi.fn(
    (root: string) => path.join(root, ".claude", "codescope"),
  ),
  getGraphDbPath: vi.fn(
    (root: string) => path.join(root, ".claude", "codescope", "graph.db"),
  ),
}));

// Import the subject under test + mocked modules for assertions
import { runBootstrap } from "../../src/bootstrap/orchestrator.js";
import { runScout } from "../../src/agents/scout.js";
import { runRiskAnalyzer } from "../../src/agents/risk-analyzer.js";
import { buildGraph } from "../../src/graph/builder.js";
import { getGraphDbPath } from "../../src/utils/paths.js";

describe("orchestrator monorepo graph building", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-mono-graph-test-"));
    const codescopeDir = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(codescopeDir, { recursive: true });

    // Default: buildGraph returns plausible results
    vi.mocked(buildGraph).mockResolvedValue({
      filesProcessed: 150,
      nodesCreated: 200,
      edgesCreated: 80,
      errors: [],
      durationMs: 500,
      totalImports: 120,
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("monorepo: builds graph once from root, passes prebuiltDbPath to risk-analyzer", async () => {
    // Setup: scout returns monorepo with 2 services
    vi.mocked(runScout).mockResolvedValueOnce({
      projectType: "monorepo",
      services: [
        {
          name: "core",
          path: "packages/core",
          loc: 3000,
          languages: ["TypeScript"],
          frameworks: [],
          entryPoints: ["src/index.ts"],
        },
        {
          name: "ui",
          path: "packages/ui",
          loc: 2000,
          languages: ["TypeScript"],
          frameworks: ["React"],
          entryPoints: ["src/index.tsx"],
        },
      ],
      cicd: [],
      durationMs: 100,
      manifestPath: path.join(tmpDir, ".claude", "codescope", "service-manifest.md"),
    });

    const result = await runBootstrap({ projectRoot: tmpDir });

    // buildGraph called exactly once (from orchestrator for root-level graph)
    expect(vi.mocked(buildGraph)).toHaveBeenCalledTimes(1);

    // buildGraph called with repo root as projectRoot (not a service subdir)
    const bgCall = vi.mocked(buildGraph).mock.calls[0][0];
    expect(bgCall.projectRoot).toBe(tmpDir);

    // risk-analyzer called with prebuiltDbPath for BOTH services
    expect(vi.mocked(runRiskAnalyzer)).toHaveBeenCalledTimes(2);
    for (const call of vi.mocked(runRiskAnalyzer).mock.calls) {
      const opts = call[0] as Record<string, unknown>;
      expect(opts.prebuiltDbPath).toBe(getGraphDbPath(tmpDir));
      expect(opts.prebuiltResult).toBeDefined();
      expect((opts.prebuiltResult as Record<string, unknown>).nodesCreated).toBe(200);
      expect((opts.prebuiltResult as Record<string, unknown>).edgesCreated).toBe(80);
    }

    // Result totalNodes/totalEdges reflect root graph result
    expect(result.totalNodes).toBe(200);
    expect(result.totalEdges).toBe(80);
  });

  it("single project: risk-analyzer builds its own graph (no prebuiltDbPath)", async () => {
    // Setup: scout returns single project
    vi.mocked(runScout).mockResolvedValueOnce({
      projectType: "single",
      services: [
        {
          name: "root",
          path: ".",
          loc: 5000,
          languages: ["TypeScript"],
          frameworks: ["Express"],
          entryPoints: ["src/index.ts"],
        },
      ],
      cicd: [],
      durationMs: 100,
      manifestPath: path.join(tmpDir, ".claude", "codescope", "service-manifest.md"),
    });

    await runBootstrap({ projectRoot: tmpDir });

    // buildGraph should NOT be called from orchestrator for single projects
    expect(vi.mocked(buildGraph)).not.toHaveBeenCalled();

    // risk-analyzer called WITHOUT prebuiltDbPath
    expect(vi.mocked(runRiskAnalyzer)).toHaveBeenCalledTimes(1);
    const opts = vi.mocked(runRiskAnalyzer).mock.calls[0][0] as Record<string, unknown>;
    expect(opts.prebuiltDbPath).toBeUndefined();
    expect(opts.prebuiltResult).toBeUndefined();
  });

  it("monorepo: timing breakdown includes graph:root entry", async () => {
    vi.mocked(runScout).mockResolvedValueOnce({
      projectType: "monorepo",
      services: [
        {
          name: "core",
          path: "packages/core",
          loc: 3000,
          languages: ["TypeScript"],
          frameworks: [],
          entryPoints: ["src/index.ts"],
        },
      ],
      cicd: [],
      durationMs: 100,
      manifestPath: path.join(tmpDir, ".claude", "codescope", "service-manifest.md"),
    });

    const result = await runBootstrap({ projectRoot: tmpDir });

    expect(result.timingBreakdown["graph:root"]).toBeDefined();
    expect(typeof result.timingBreakdown["graph:root"]).toBe("number");
  });
});

// Cross-package integration test lives in monorepo-cross-package.test.ts (un-mocked)
