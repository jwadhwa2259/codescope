import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  runSynthesis,
  type SynthesisOptions,
  type SynthesisResult,
} from "../../src/bootstrap/synthesis.js";

// Mock the graph modules to avoid needing actual SQLite databases
vi.mock("../../src/graph/database.js", () => ({
  openDatabase: vi.fn(() => ({ close: vi.fn() })),
  closeDatabase: vi.fn(),
}));

vi.mock("../../src/graph/analytics.js", async () => {
  const { DirectedGraph } = await import("graphology");
  return {
    loadGraphFromSQLite: vi.fn(() => {
      // Return a graph with cross-service edges
      const graph = new DirectedGraph();
      // Service "api" nodes
      graph.addNode("1", {
        name: "UserService",
        kind: "class",
        filePath: "services/api/src/user.ts",
        loc: 100,
      });
      graph.addNode("2", {
        name: "AuthHandler",
        kind: "function",
        filePath: "services/api/src/auth.ts",
        loc: 50,
      });
      // Service "web" nodes
      graph.addNode("3", {
        name: "UserPage",
        kind: "class",
        filePath: "services/web/src/user-page.ts",
        loc: 80,
      });
      // Shared node
      graph.addNode("4", {
        name: "UserType",
        kind: "type",
        filePath: "services/shared/types.ts",
        loc: 10,
      });
      // Cross-service edges: web -> api (imports UserService)
      graph.addEdge("3", "1", { kind: "import", weight: 1 });
      // Cross-service edges: api -> shared (imports UserType)
      graph.addEdge("1", "4", { kind: "import", weight: 1 });
      // Cross-service edges: web -> shared (imports UserType)
      graph.addEdge("3", "4", { kind: "import", weight: 1 });
      // Internal edge within api
      graph.addEdge("2", "1", { kind: "import", weight: 1 });
      return graph;
    }),
    computeCentrality: vi.fn(),
  };
});

vi.mock("../../src/utils/paths.js", () => ({
  getGraphDbPath: vi.fn(
    (root: string) => path.join(root, ".claude/codescope/graph.db"),
  ),
  getCodescopePath: vi.fn(
    (root: string) => path.join(root, ".claude/codescope"),
  ),
}));

describe("synthesis", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "synthesis-test-"));
    // Create a mock graph.db file so isBootstrapped checks pass
    const codescopeDir = path.join(tmpDir, ".claude", "codescope");
    fs.mkdirSync(codescopeDir, { recursive: true });
    fs.writeFileSync(path.join(codescopeDir, "graph.db"), "mock");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("produces cross-service-map.md with services table from scout results", async () => {
    const outputDir = path.join(tmpDir, "output");
    fs.mkdirSync(outputDir, { recursive: true });

    const options: SynthesisOptions = {
      projectRoot: tmpDir,
      outputDir,
      services: [
        {
          name: "api",
          path: "services/api",
          loc: 1000,
          framework: "Express",
          analysisStatus: "full",
        },
        {
          name: "web",
          path: "services/web",
          loc: 800,
          framework: "React",
          analysisStatus: "full",
        },
        {
          name: "shared",
          path: "services/shared",
          loc: 200,
          framework: "",
          analysisStatus: "lightweight",
        },
      ],
    };

    const result = await runSynthesis(options);
    expect(fs.existsSync(result.crossServiceMapPath)).toBe(true);

    const content = fs.readFileSync(result.crossServiceMapPath, "utf-8");
    expect(content).toContain("# Cross-Service Dependency Map");
    expect(content).toContain("## Services");
    expect(content).toContain("api");
    expect(content).toContain("web");
    expect(content).toContain("shared");
  });

  it("detects cross-service import edges", async () => {
    const outputDir = path.join(tmpDir, "output");
    fs.mkdirSync(outputDir, { recursive: true });

    const options: SynthesisOptions = {
      projectRoot: tmpDir,
      outputDir,
      services: [
        {
          name: "api",
          path: "services/api",
          loc: 1000,
          framework: "Express",
          analysisStatus: "full",
        },
        {
          name: "web",
          path: "services/web",
          loc: 800,
          framework: "React",
          analysisStatus: "full",
        },
        {
          name: "shared",
          path: "services/shared",
          loc: 200,
          framework: "",
          analysisStatus: "lightweight",
        },
      ],
    };

    const result = await runSynthesis(options);
    // Should detect cross-service dependencies
    expect(result.dependencies.length).toBeGreaterThan(0);

    // web -> api should be detected (node 3 -> node 1)
    const webToApi = result.dependencies.find(
      (d) => d.from === "web" && d.to === "api",
    );
    expect(webToApi).toBeDefined();

    // api -> shared should be detected (node 1 -> node 4)
    const apiToShared = result.dependencies.find(
      (d) => d.from === "api" && d.to === "shared",
    );
    expect(apiToShared).toBeDefined();
  });

  it("counts shared types per service pair", async () => {
    const outputDir = path.join(tmpDir, "output");
    fs.mkdirSync(outputDir, { recursive: true });

    const options: SynthesisOptions = {
      projectRoot: tmpDir,
      outputDir,
      services: [
        {
          name: "api",
          path: "services/api",
          loc: 1000,
          framework: "Express",
          analysisStatus: "full",
        },
        {
          name: "web",
          path: "services/web",
          loc: 800,
          framework: "React",
          analysisStatus: "full",
        },
        {
          name: "shared",
          path: "services/shared",
          loc: 200,
          framework: "",
          analysisStatus: "lightweight",
        },
      ],
    };

    const result = await runSynthesis(options);
    // web -> api edge should have shared types (UserService)
    const webToApi = result.dependencies.find(
      (d) => d.from === "web" && d.to === "api",
    );
    expect(webToApi?.sharedTypes).toContain("UserService");
    expect(webToApi?.importCount).toBeGreaterThanOrEqual(1);
  });

  it("produces merged conventions with per-service adoption tags", async () => {
    const outputDir = path.join(tmpDir, "output");
    fs.mkdirSync(outputDir, { recursive: true });

    // Create per-service conventions.md files
    const apiConvDir = path.join(outputDir, "services", "api");
    const webConvDir = path.join(outputDir, "services", "web");
    fs.mkdirSync(apiConvDir, { recursive: true });
    fs.mkdirSync(webConvDir, { recursive: true });
    fs.writeFileSync(
      path.join(apiConvDir, "conventions.md"),
      "# Conventions\n\n### async/await\n\n| Metric | Value |\n|--------|-------|\n| Adoption | 95% (19/20 files) |\n| Confidence | HIGH-CONF |\n| Category | async |\n\n### error-handling\n\n| Metric | Value |\n|--------|-------|\n| Adoption | 80% (16/20 files) |\n| Confidence | MEDIUM-CONF |\n| Category | errors |\n",
    );
    fs.writeFileSync(
      path.join(webConvDir, "conventions.md"),
      "# Conventions\n\n### async/await\n\n| Metric | Value |\n|--------|-------|\n| Adoption | 88% (22/25 files) |\n| Confidence | HIGH-CONF |\n| Category | async |\n\n### jsx-patterns\n\n| Metric | Value |\n|--------|-------|\n| Adoption | 92% (23/25 files) |\n| Confidence | HIGH-CONF |\n| Category | ui |\n",
    );

    const options: SynthesisOptions = {
      projectRoot: tmpDir,
      outputDir,
      services: [
        {
          name: "api",
          path: "services/api",
          loc: 1000,
          framework: "Express",
          analysisStatus: "full",
        },
        {
          name: "web",
          path: "services/web",
          loc: 800,
          framework: "React",
          analysisStatus: "full",
        },
      ],
    };

    const result = await runSynthesis(options);
    // Merged conventions should exist
    expect(result.mergedConventions.length).toBeGreaterThan(0);
  });

  it("single-service project produces map with one service and empty dependencies", async () => {
    const outputDir = path.join(tmpDir, "output");
    fs.mkdirSync(outputDir, { recursive: true });

    const options: SynthesisOptions = {
      projectRoot: tmpDir,
      outputDir,
      services: [
        {
          name: "root",
          path: ".",
          loc: 5000,
          framework: "Express",
          analysisStatus: "full",
        },
      ],
    };

    const result = await runSynthesis(options);
    expect(result.dependencies).toHaveLength(0);

    const content = fs.readFileSync(result.crossServiceMapPath, "utf-8");
    expect(content).toContain("root");
  });

  it("returns SynthesisResult with all expected fields", async () => {
    const outputDir = path.join(tmpDir, "output");
    fs.mkdirSync(outputDir, { recursive: true });

    const options: SynthesisOptions = {
      projectRoot: tmpDir,
      outputDir,
      services: [
        {
          name: "api",
          path: "services/api",
          loc: 1000,
          framework: "Express",
          analysisStatus: "full",
        },
      ],
    };

    const result = await runSynthesis(options);
    expect(result).toHaveProperty("crossServiceMapPath");
    expect(result).toHaveProperty("dependencies");
    expect(result).toHaveProperty("mergedConventions");
    expect(result).toHaveProperty("durationMs");
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
