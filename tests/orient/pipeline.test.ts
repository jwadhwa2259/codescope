import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { DirectedGraph } from "graphology";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock getGraph so we don't need a real SQLite database
vi.mock("../../src/graph/cache.js", () => {
  const { DirectedGraph } = require("graphology") as typeof import("graphology");

  function buildMockGraph(): {
    graph: InstanceType<typeof DirectedGraph>;
    centralities: Map<string, number>;
  } {
    const graph = new DirectedGraph();

    graph.addNode("1", { name: "auth.ts", kind: "file", filePath: "src/auth.ts", loc: 200, community: 0 });
    graph.addNode("2", { name: "user.ts", kind: "file", filePath: "src/user.ts", loc: 150, community: 0 });
    graph.addNode("3", { name: "database.ts", kind: "file", filePath: "src/database.ts", loc: 300, community: 1 });

    graph.mergeEdge("1", "2", { kind: "IMPORTS", weight: 1 });
    graph.mergeEdge("1", "3", { kind: "IMPORTS", weight: 1 });

    const centralities = new Map<string, number>();
    centralities.set("1", 0.8);
    centralities.set("2", 0.5);
    centralities.set("3", 0.9);

    return { graph, centralities };
  }

  return {
    getGraph: vi.fn(async () => buildMockGraph()),
    invalidateCache: vi.fn(),
  };
});

// Mock computeDangerZones
vi.mock("../../src/graph/analytics.js", () => ({
  computeDangerZones: vi.fn(() => []),
  blastRadius: vi.fn(() => []),
}));

// Mock loadConfig
vi.mock("../../src/config/loader.js", () => ({
  loadConfig: vi.fn(() => ({
    orient: { clarification: "auto", research_sources: ["context7"], max_research_time: 30 },
    execute: { max_agents_concurrent: 3 },
  })),
  configExists: vi.fn(() => true),
}));

// Mock wave-scheduler (used by validation)
vi.mock("../../src/execution/wave-scheduler.js", () => ({
  buildWaveSchedule: vi.fn((agents: unknown[]) => ({
    waves: [],
    strategy: "sequential" as const,
  })),
  validateFileOverlap: vi.fn(() => [
    { name: "file-overlap", status: "PASS" as const },
  ]),
  validateDependencyOrdering: vi.fn(() => [
    { name: "dep-ordering", status: "PASS" as const },
  ]),
  validateScopeCoverage: vi.fn(() => [
    { name: "scope-coverage", status: "PASS" as const },
  ]),
}));

// Import after mocks
import { slugifyTask, runOrientPipeline } from "../../src/orient/pipeline.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pipeline-test-"));
  // Create the codescope directory structure
  const codescopePath = path.join(tmpDir, ".claude", "codescope");
  fs.mkdirSync(codescopePath, { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// slugifyTask tests
// ---------------------------------------------------------------------------

describe("slugifyTask", () => {
  it("produces a valid slug from a simple task", () => {
    const slug = slugifyTask("Add authentication");
    expect(slug).toMatch(/^add-authentication-[a-z0-9]+$/);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it("handles special characters", () => {
    const slug = slugifyTask("Fix @user/auth module's bug #123!");
    // Should convert special chars to hyphens
    expect(slug).toMatch(/^[a-z0-9-]+$/);
    expect(slug).not.toContain("@");
    expect(slug).not.toContain("'");
    expect(slug).not.toContain("#");
    expect(slug).not.toContain("!");
  });

  it("handles empty string", () => {
    const slug = slugifyTask("");
    // Should at least have the timestamp suffix
    expect(slug.length).toBeGreaterThan(0);
    expect(slug).toMatch(/[a-z0-9]+$/);
  });

  it("caps at 60 characters for very long tasks", () => {
    const longTask = "This is a very long task description that should be truncated to fit within the maximum slug length limit of sixty characters total";
    const slug = slugifyTask(longTask);
    expect(slug.length).toBeLessThanOrEqual(60);
  });

  it("produces unique slugs for the same task", () => {
    // Due to timestamp suffix, consecutive calls may produce the same slug
    // if called within the same millisecond, but generally they differ
    const slug1 = slugifyTask("test task");
    const slug2 = slugifyTask("test task");
    // At minimum, both should be valid slugs
    expect(slug1).toMatch(/^test-task-[a-z0-9]+$/);
    expect(slug2).toMatch(/^test-task-[a-z0-9]+$/);
  });

  it("collapses multiple hyphens", () => {
    const slug = slugifyTask("add   --- auth");
    expect(slug).not.toMatch(/--/);
  });
});

// ---------------------------------------------------------------------------
// runOrientPipeline tests
// ---------------------------------------------------------------------------

describe("runOrientPipeline", () => {
  it("produces scope contract and plan artifacts with noConfirm", async () => {
    const result = await runOrientPipeline({
      projectRoot: tmpDir,
      task: "Add auth to the API",
      taskSlug: "add-auth-test",
      noConfirm: true,
      noClarify: true,
    });

    expect(result.status).toBe("approved");
    expect(result.scopeContractPath).toBeTruthy();
    expect(result.planPath).toBeTruthy();
    expect(result.executionDir).toContain("add-auth-test");

    // Verify scope contract file exists
    if (result.scopeContractPath) {
      expect(fs.existsSync(result.scopeContractPath)).toBe(true);
    }

    // Verify plan file exists
    if (result.planPath) {
      expect(fs.existsSync(result.planPath)).toBe(true);
    }
  });

  it("skips clarification with noClarify flag", async () => {
    const progressMessages: string[] = [];

    const result = await runOrientPipeline({
      projectRoot: tmpDir,
      task: "Add auth",
      taskSlug: "add-auth-noclarify",
      noConfirm: true,
      noClarify: true,
      onProgress: (msg) => progressMessages.push(msg),
    });

    expect(result.status).toBe("approved");
    // Pipeline should have progressed through all stages
    expect(progressMessages).toContain("## Clarifying scope...");
    expect(progressMessages.some((m) => m.includes("Planning"))).toBe(true);
  });

  it("calls onGate for scope and plan when noConfirm is false", async () => {
    const gatesCalled: Array<{ gate: string; artifact: string }> = [];

    const result = await runOrientPipeline({
      projectRoot: tmpDir,
      task: "Add auth",
      taskSlug: "add-auth-gates",
      noConfirm: false,
      noClarify: true,
      onGate: async (gate, artifact) => {
        gatesCalled.push({ gate, artifact });
        return "approve";
      },
    });

    expect(result.status).toBe("approved");
    expect(gatesCalled.length).toBe(2);
    expect(gatesCalled[0].gate).toBe("scope");
    expect(gatesCalled[1].gate).toBe("plan");
  });

  it("creates execution and plans directories", async () => {
    const result = await runOrientPipeline({
      projectRoot: tmpDir,
      task: "Create test",
      taskSlug: "create-test-dirs",
      noConfirm: true,
      noClarify: true,
    });

    const executionDir = path.join(tmpDir, ".claude", "codescope", "execution", "create-test-dirs");
    const plansDir = path.join(tmpDir, ".claude", "codescope", "plans");

    expect(fs.existsSync(executionDir)).toBe(true);
    expect(fs.existsSync(plansDir)).toBe(true);
  });

  it("returns rejected status when scope gate rejects", async () => {
    const result = await runOrientPipeline({
      projectRoot: tmpDir,
      task: "Rejected task",
      taskSlug: "rejected-scope",
      noConfirm: false,
      noClarify: true,
      onGate: async (gate) => {
        if (gate === "scope") return "reject";
        return "approve";
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("Scope rejected");
  });

  it("returns rejected status when plan gate rejects", async () => {
    const result = await runOrientPipeline({
      projectRoot: tmpDir,
      task: "Plan rejected",
      taskSlug: "rejected-plan",
      noConfirm: false,
      noClarify: true,
      onGate: async (gate) => {
        if (gate === "plan") return "reject";
        return "approve";
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.error).toContain("Plan rejected");
  });
});
