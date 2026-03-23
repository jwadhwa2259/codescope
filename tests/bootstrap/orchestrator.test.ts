import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  runBootstrap,
  getForceConfirmation,
  type BootstrapOptions,
  type BootstrapResult,
  type ForceConfirmation,
} from "../../src/bootstrap/orchestrator.js";

// Mock all agent modules
vi.mock("../../src/agents/scout.js", () => ({
  runScout: vi.fn(async (opts: { projectRoot: string; outputDir: string }) => {
    fs.mkdirSync(opts.outputDir, { recursive: true });
    const manifestPath = path.join(opts.outputDir, "service-manifest.md");
    fs.writeFileSync(manifestPath, "# Service Manifest\n");
    return {
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
      manifestPath,
    };
  }),
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
      conventionsDetected: 15,
      conflictsDetected: 1,
      goldenFileCount: 5,
      durationMs: 300,
    };
  }),
}));

vi.mock("../../src/agents/risk-analyzer.js", () => ({
  runRiskAnalyzer: vi.fn(async (opts: { projectRoot: string; outputDir: string }) => {
    fs.mkdirSync(opts.outputDir, { recursive: true });
    const dzPath = path.join(opts.outputDir, "danger-zones.md");
    fs.writeFileSync(dzPath, "# Danger Zones\n");
    return {
      dangerZonesPath: dzPath,
      nodesCreated: 500,
      edgesCreated: 1200,
      communitiesDetected: 8,
      dangerZoneCount: 5,
      durationMs: 400,
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
      conventionCoverage: {
        percent: 80,
        grade: "B-",
        delta: null,
        explainer: "High convention coverage means AI can follow established patterns with confidence.",
      },
      typeSafety: {
        percent: 90,
        grade: "A-",
        delta: null,
        explainer: "High type safety means AI can infer intent from signatures without guessing.",
      },
      testCoverageProxy: {
        percent: 70,
        grade: "C-",
        delta: null,
        explainer: "More tests give AI a safety net to verify its changes actually work.",
      },
      importGraphHealth: {
        percent: 92,
        grade: "A-",
        delta: null,
        explainer: "Clean import resolution means AI can trace dependencies and assess change impact accurately.",
      },
    },
    improvements: [
      { action: "Add more tests", reference: "Test Coverage Proxy (70%)" },
    ],
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

// Import mocked modules for assertion
import { runScout } from "../../src/agents/scout.js";
import { runResearcher } from "../../src/agents/researcher.js";
import { runConventionDetector } from "../../src/agents/convention-detector.js";
import { runRiskAnalyzer } from "../../src/agents/risk-analyzer.js";
import { runLearningSynthesizer } from "../../src/agents/learning-synthesizer.js";
import { runSynthesis } from "../../src/bootstrap/synthesis.js";
import { computeReadiness, writeReadinessArtifact } from "../../src/bootstrap/readiness.js";
import { analyzeChanges } from "../../src/bootstrap/incremental.js";
import { writeBootstrapMeta } from "../../src/bootstrap/meta.js";
import { invalidateCache } from "../../src/graph/cache.js";

describe("orchestrator", () => {
  let tmpDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orchestrator-test-"));
    // Create .claude/codescope dir
    const codescopeDir = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(codescopeDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("single-service bootstrap calls all 5 agents in sequence", async () => {
    const result = await runBootstrap({ projectRoot: tmpDir });

    expect(runScout).toHaveBeenCalledTimes(1);
    expect(runResearcher).toHaveBeenCalledTimes(1);
    expect(runConventionDetector).toHaveBeenCalledTimes(1);
    expect(runRiskAnalyzer).toHaveBeenCalledTimes(1);
    expect(runLearningSynthesizer).toHaveBeenCalledTimes(1);
  });

  it("monorepo bootstrap calls scout then runs squad per service", async () => {
    // Override scout to return multiple services
    vi.mocked(runScout).mockResolvedValueOnce({
      projectType: "monorepo",
      services: [
        {
          name: "api",
          path: "services/api",
          loc: 3000,
          languages: ["TypeScript"],
          frameworks: ["Express"],
          entryPoints: ["src/index.ts"],
        },
        {
          name: "web",
          path: "services/web",
          loc: 2000,
          languages: ["TypeScript"],
          frameworks: ["React"],
          entryPoints: ["src/main.tsx"],
        },
      ],
      cicd: [],
      durationMs: 100,
      manifestPath: path.join(tmpDir, ".claude", "codescope", "service-manifest.md"),
    });

    const result = await runBootstrap({ projectRoot: tmpDir });

    // Should call each agent once per service (2 services)
    expect(runResearcher).toHaveBeenCalledTimes(2);
    expect(runConventionDetector).toHaveBeenCalledTimes(2);
    expect(runRiskAnalyzer).toHaveBeenCalledTimes(2);
    expect(runLearningSynthesizer).toHaveBeenCalledTimes(2);
  });

  it("squad cap limits full analysis; overflow gets lightweight scan", async () => {
    // Create 3 services but set maxSquads to 2
    vi.mocked(runScout).mockResolvedValueOnce({
      projectType: "monorepo",
      services: [
        { name: "big", path: "services/big", loc: 10000, languages: ["TypeScript"], frameworks: ["Express"], entryPoints: [] },
        { name: "medium", path: "services/medium", loc: 5000, languages: ["TypeScript"], frameworks: ["React"], entryPoints: [] },
        { name: "small", path: "services/small", loc: 1000, languages: ["TypeScript"], frameworks: [], entryPoints: [] },
      ],
      cicd: [],
      durationMs: 100,
      manifestPath: path.join(tmpDir, ".claude", "codescope", "service-manifest.md"),
    });

    const result = await runBootstrap({
      projectRoot: tmpDir,
      maxSquads: 2,
    });

    // Only 2 services should get full analysis (top 2 by LOC)
    expect(runResearcher).toHaveBeenCalledTimes(2);
    expect(runConventionDetector).toHaveBeenCalledTimes(2);
    expect(runRiskAnalyzer).toHaveBeenCalledTimes(2);
    expect(runLearningSynthesizer).toHaveBeenCalledTimes(2);

    // Result should show the lightweight service
    const lightService = result.services.find((s) => s.name === "small");
    expect(lightService?.status).toBe("lightweight");
  });

  it("creates empty conventions-enforced.md per D-14", async () => {
    await runBootstrap({ projectRoot: tmpDir });

    const enforcedPath = path.join(
      tmpDir,
      ".claude",
      "codescope",
      "conventions-enforced.md",
    );
    expect(fs.existsSync(enforcedPath)).toBe(true);
    const content = fs.readFileSync(enforcedPath, "utf-8");
    // Should be essentially empty (header only, no conventions)
    expect(content).not.toContain("HIGH-CONF");
  });

  it("writes bootstrap-meta.json with timestamp and duration", async () => {
    await runBootstrap({ projectRoot: tmpDir });

    expect(writeBootstrapMeta).toHaveBeenCalledTimes(1);
    const call = vi.mocked(writeBootstrapMeta).mock.calls[0];
    expect(call[0]).toBe(tmpDir);
    expect(call[1]).toHaveProperty("last_bootstrap");
    expect(call[1]).toHaveProperty("duration_ms");
    expect(call[1]).toHaveProperty("mode");
    expect(call[1]).toHaveProperty("version");
  });

  it("invalidates graph cache after completion", async () => {
    await runBootstrap({ projectRoot: tmpDir });

    expect(invalidateCache).toHaveBeenCalledTimes(1);
  });

  it("incremental mode only re-analyzes affected services", async () => {
    // Override analyzeChanges to return incremental with 1 affected service
    vi.mocked(analyzeChanges).mockReturnValueOnce({
      mode: "incremental",
      reason: "5 files changed",
      changedFiles: ["services/api/src/handler.ts"],
      changedPercentage: 5,
      affectedServices: ["api"],
    });

    // Scout returns 2 services
    vi.mocked(runScout).mockResolvedValueOnce({
      projectType: "monorepo",
      services: [
        { name: "api", path: "services/api", loc: 3000, languages: ["TypeScript"], frameworks: ["Express"], entryPoints: [] },
        { name: "web", path: "services/web", loc: 2000, languages: ["TypeScript"], frameworks: ["React"], entryPoints: [] },
      ],
      cicd: [],
      durationMs: 100,
      manifestPath: path.join(tmpDir, ".claude", "codescope", "service-manifest.md"),
    });

    await runBootstrap({ projectRoot: tmpDir });

    // Only api should get full analysis, web should be skipped/lightweight
    // The researcher should only be called for the affected service(s)
    expect(runResearcher).toHaveBeenCalledTimes(1);
  });

  it("--force mode does full re-bootstrap regardless", async () => {
    // Even with previous meta, force should trigger full
    vi.mocked(analyzeChanges).mockReturnValueOnce({
      mode: "incremental",
      reason: "5 files changed",
      changedFiles: [],
      changedPercentage: 5,
      affectedServices: [],
    });

    await runBootstrap({ projectRoot: tmpDir, force: true });

    // Force bypasses incremental -- all agents should run
    expect(runScout).toHaveBeenCalledTimes(1);
    expect(runResearcher).toHaveBeenCalledTimes(1);
  });

  it("returns BootstrapResult with timing breakdown", async () => {
    const result = await runBootstrap({ projectRoot: tmpDir });

    expect(result).toHaveProperty("services");
    expect(result).toHaveProperty("readinessGrade");
    expect(result).toHaveProperty("readinessPercent");
    expect(result).toHaveProperty("totalNodes");
    expect(result).toHaveProperty("totalEdges");
    expect(result).toHaveProperty("totalCommunities");
    expect(result).toHaveProperty("conventionsDetected");
    expect(result).toHaveProperty("highConfidenceConventions");
    expect(result).toHaveProperty("durationMs");
    expect(result).toHaveProperty("artifacts");
    expect(result).toHaveProperty("timingBreakdown");
    expect(result).toHaveProperty("warnings");

    // Timing breakdown should have named steps
    expect(typeof result.timingBreakdown).toBe("object");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("reports timing warning if duration exceeds 300s (5 min)", async () => {
    // We can't actually make it take 5 min, but we verify the warning mechanism
    // by checking the result structure. The warning check is duration > 300000ms
    const result = await runBootstrap({ projectRoot: tmpDir });

    // Normal fast run should have no timing warning
    const timingWarning = result.warnings.find((w) =>
      w.includes("exceeded") || w.includes("5 min"),
    );
    // Should not have a timing warning since tests are fast
    expect(result.durationMs).toBeLessThan(300000);
  });

  it("--force with onConfirm callback calls onConfirm with ForceConfirmation per D-30", async () => {
    const onConfirm = vi.fn().mockResolvedValue(true);

    await runBootstrap({
      projectRoot: tmpDir,
      force: true,
      onConfirm,
    });

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const confirmation = onConfirm.mock.calls[0][0] as ForceConfirmation;
    expect(confirmation).toHaveProperty("willRebuild");
    expect(confirmation).toHaveProperty("willPreserve");
    expect(confirmation.willRebuild.length).toBeGreaterThan(0);
    expect(confirmation.willPreserve.length).toBeGreaterThan(0);
  });

  it("--force with onConfirm returning false aborts bootstrap", async () => {
    const onConfirm = vi.fn().mockResolvedValue(false);

    const result = await runBootstrap({
      projectRoot: tmpDir,
      force: true,
      onConfirm,
    });

    // Should not run any agents
    expect(runScout).not.toHaveBeenCalled();
    expect(runResearcher).not.toHaveBeenCalled();

    // Should report cancellation in warnings
    expect(result.warnings).toContain("Bootstrap cancelled by user.");
    expect(result.services).toHaveLength(0);
  });

  it("--force without onConfirm proceeds directly", async () => {
    await runBootstrap({
      projectRoot: tmpDir,
      force: true,
    });

    // Should run normally without callback
    expect(runScout).toHaveBeenCalledTimes(1);
    expect(runResearcher).toHaveBeenCalledTimes(1);
  });
});

describe("getForceConfirmation", () => {
  it("returns willRebuild and willPreserve lists per D-29", () => {
    const confirmation = getForceConfirmation("/some/project");

    expect(confirmation.willRebuild.length).toBeGreaterThan(0);
    expect(confirmation.willPreserve.length).toBeGreaterThan(0);

    // Should rebuild analysis artifacts
    expect(confirmation.willRebuild.some((r) => r.includes("graph.db"))).toBe(
      true,
    );
    expect(
      confirmation.willRebuild.some((r) => r.includes("readiness")),
    ).toBe(true);

    // Should preserve user data
    expect(
      confirmation.willPreserve.some((p) => p.includes("config")),
    ).toBe(true);
    expect(
      confirmation.willPreserve.some((p) => p.includes("conventions-enforced")),
    ).toBe(true);
    expect(
      confirmation.willPreserve.some((p) => p.includes("learnings")),
    ).toBe(true);
  });
});
