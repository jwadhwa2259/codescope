import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock loadConfig
vi.mock("../../src/config/loader.js", () => ({
  loadConfig: vi.fn(() => ({
    schema_version: 1,
    orient: {
      max_research_time: 30,
      research_sources: ["context7", "web_search"],
      clarification: "auto",
      verbosity: "brief",
    },
    execute: {
      max_agents_concurrent: 3,
    },
  })),
}));

// ---------------------------------------------------------------------------
// Imports under test (after mocks)
// ---------------------------------------------------------------------------
import {
  buildPlannerPrompt,
  parsePlanOutput,
  writePlanArtifact,
  runPlanner,
} from "../../src/orient/planner.js";
import type { PlannerOptions } from "../../src/orient/planner.js";
import type {
  ScopeContract,
  AnalysisResult,
  ResearchOutput,
  ExecutionPlan,
  AgentAssignment,
  AffectedFile,
} from "../../src/orient/types.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeAffectedFiles(): AffectedFile[] {
  return [
    { filePath: "src/auth.ts", risk: "HIGH", centrality: 0.8, community: "0" },
    { filePath: "src/user.ts", risk: "MEDIUM", centrality: 0.5, community: "0" },
    { filePath: "src/router.ts", risk: "MEDIUM", centrality: 0.3, community: "2" },
  ];
}

function makeScopeContract(): ScopeContract {
  return {
    task: "Add JWT authentication to API routes",
    taskSlug: "add-jwt-auth",
    createdAt: "2026-03-24T00:00:00Z",
    status: "APPROVED",
    inScope: ["JWT token validation", "Auth middleware", "Protected routes"],
    outOfScope: ["User registration", "OAuth integration"],
    affectedFiles: makeAffectedFiles(),
    assumptions: ["Using existing express setup"],
    conventionsInScope: ["error-handling-pattern"],
    riskFlags: [{ filePath: "src/auth.ts", reason: "High centrality danger zone" }],
  };
}

function makeAnalysisResult(): AnalysisResult {
  return {
    affectedFiles: makeAffectedFiles(),
    blastRadiusFiles: [
      { filePath: "src/auth.ts", hopDistance: 0, riskLevel: "HIGH" },
      { filePath: "src/user.ts", hopDistance: 1, riskLevel: "MEDIUM" },
    ],
    conventionMatches: ["error-handling-pattern"],
    testFiles: ["tests/auth.test.ts"],
    crossCommunityImpact: [
      { communityId: 0, nodeCount: 10, affectedCount: 2 },
    ],
    durationMs: 50,
  };
}

function makeResearchOutput(): ResearchOutput {
  return {
    completedAt: "2026-03-24T00:00:00Z",
    topicsResearched: 2,
    topicsSkipped: 1,
    topics: [
      { name: "express", impactScore: 0.7, source: "context7" },
      { name: "jsonwebtoken", impactScore: 0.3, source: "context7" },
    ],
    outputPath: "/tmp/research.md",
    durationMs: 100,
  };
}

function makeSamplePlanMarkdown(): string {
  return `# Execution Plan: add-jwt-auth

**Created:** 2026-03-24T00:00:00Z
**Status:** PENDING
**Strategy:** wave-based
**Estimated agents:** 2
**Estimated total tokens:** ~50K

## Agents

### Agent: auth-api-agent

- **Wave:** 1
- **Task:** Implement JWT token validation and auth middleware
- **Files (exclusive write):** \`src/auth.ts\`, \`src/middleware/auth.ts\`
- **Files (read-only):** \`src/config.ts\`
- **Conventions:** error-handling-pattern
- **Golden files:** \`src/auth.ts\` (lines 1-20 for existing auth pattern)
- **Depends on:** none
- **Estimated tokens:** ~25K
- **Timeout:** 180s

### Agent: router-agent

- **Wave:** 2
- **Task:** Add protected route wrappers to API routes
- **Files (exclusive write):** \`src/router.ts\`
- **Files (read-only):** \`src/auth.ts\`, \`src/middleware/auth.ts\`
- **Conventions:** error-handling-pattern
- **Golden files:** \`src/router.ts\` (lines 1-15 for route pattern)
- **Depends on:** auth-api-agent
- **Estimated tokens:** ~25K
- **Timeout:** 120s

## Execution Order

| Wave | Agents | Mode | Files |
|------|--------|------|-------|
| 1 | auth-api-agent | sequential | 2 |
| 2 | router-agent | sequential (depends on wave 1) | 1 |

## Validation

- [x] No overlapping file writes within waves: **PASS**
- [x] Dependency ordering (no cycles, no same-wave deps): **PASS**
- [x] Scope coverage (every In Scope item assigned): **PASS**

## Removed by User

`;
}

function makeExecutionPlan(): ExecutionPlan {
  return {
    taskSlug: "add-jwt-auth",
    createdAt: "2026-03-24T00:00:00Z",
    status: "PENDING",
    strategy: "wave-based",
    estimatedAgents: 2,
    estimatedTotalTokens: 50000,
    agents: [
      {
        name: "auth-api-agent",
        wave: 1,
        task: "Implement JWT token validation",
        exclusiveWriteFiles: ["src/auth.ts", "src/middleware/auth.ts"],
        readOnlyFiles: ["src/config.ts"],
        conventions: ["error-handling-pattern"],
        goldenFiles: [{ path: "src/auth.ts", lines: "1-20" }],
        dependsOn: [],
        estimatedTokens: 25000,
        timeoutSeconds: 180,
      },
      {
        name: "router-agent",
        wave: 2,
        task: "Add protected routes",
        exclusiveWriteFiles: ["src/router.ts"],
        readOnlyFiles: ["src/auth.ts"],
        conventions: ["error-handling-pattern"],
        goldenFiles: [{ path: "src/router.ts", lines: "1-15" }],
        dependsOn: ["auth-api-agent"],
        estimatedTokens: 25000,
        timeoutSeconds: 120,
      },
    ],
    waves: [
      { waveNumber: 1, agents: ["auth-api-agent"], mode: "sequential" },
      { waveNumber: 2, agents: ["router-agent"], mode: "sequential" },
    ],
    validationResults: [],
    removedByUser: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("buildPlannerPrompt", () => {
  it("includes scope contract summary in the prompt", () => {
    const options: PlannerOptions = {
      projectRoot: "/fake/project",
      taskSlug: "add-jwt-auth",
      task: "Add JWT authentication to API routes",
      scopeContract: makeScopeContract(),
      analysisResult: makeAnalysisResult(),
      researchOutput: makeResearchOutput(),
    };
    const prompt = buildPlannerPrompt(options);
    expect(prompt).toContain("JWT token validation");
    expect(prompt).toContain("Auth middleware");
    expect(prompt).toContain("Protected routes");
  });

  it("includes analysis data in the prompt", () => {
    const options: PlannerOptions = {
      projectRoot: "/fake/project",
      taskSlug: "add-jwt-auth",
      task: "Add JWT authentication",
      scopeContract: makeScopeContract(),
      analysisResult: makeAnalysisResult(),
      researchOutput: null,
    };
    const prompt = buildPlannerPrompt(options);
    expect(prompt).toContain("src/auth.ts");
    expect(prompt).toContain("HIGH");
  });

  it("includes research highlights when present", () => {
    const options: PlannerOptions = {
      projectRoot: "/fake/project",
      taskSlug: "add-jwt-auth",
      task: "Add JWT authentication",
      scopeContract: makeScopeContract(),
      analysisResult: makeAnalysisResult(),
      researchOutput: makeResearchOutput(),
    };
    const prompt = buildPlannerPrompt(options);
    expect(prompt).toContain("express");
    expect(prompt).toContain("jsonwebtoken");
  });

  it("works without research output (null)", () => {
    const options: PlannerOptions = {
      projectRoot: "/fake/project",
      taskSlug: "add-jwt-auth",
      task: "Add JWT authentication",
      scopeContract: makeScopeContract(),
      analysisResult: makeAnalysisResult(),
      researchOutput: null,
    };
    const prompt = buildPlannerPrompt(options);
    expect(prompt.length).toBeGreaterThan(0);
  });

  it("includes hybrid strategy instructions", () => {
    const options: PlannerOptions = {
      projectRoot: "/fake/project",
      taskSlug: "add-jwt-auth",
      task: "Add JWT authentication",
      scopeContract: makeScopeContract(),
      analysisResult: makeAnalysisResult(),
      researchOutput: null,
    };
    const prompt = buildPlannerPrompt(options);
    // Per D-31/D-32: independent agents -> parallel, dependent -> sequential
    expect(prompt).toMatch(/parallel|independent/i);
    expect(prompt).toMatch(/sequential|dependent/i);
  });
});

describe("parsePlanOutput", () => {
  it("parses a well-formed plan markdown into ExecutionPlan", () => {
    const plan = parsePlanOutput(makeSamplePlanMarkdown());
    expect(plan.taskSlug).toBe("add-jwt-auth");
    expect(plan.status).toBe("PENDING");
    expect(plan.strategy).toBe("wave-based");
  });

  it("extracts agents from ### Agent sections", () => {
    const plan = parsePlanOutput(makeSamplePlanMarkdown());
    expect(plan.agents).toHaveLength(2);
    expect(plan.agents[0].name).toBe("auth-api-agent");
    expect(plan.agents[1].name).toBe("router-agent");
  });

  it("parses agent fields correctly", () => {
    const plan = parsePlanOutput(makeSamplePlanMarkdown());
    const agent = plan.agents[0];
    expect(agent.wave).toBe(1);
    expect(agent.task).toContain("JWT");
    expect(agent.exclusiveWriteFiles).toContain("src/auth.ts");
    expect(agent.dependsOn).toHaveLength(0);
    expect(agent.estimatedTokens).toBe(25000);
    expect(agent.timeoutSeconds).toBe(180);
  });

  it("parses agent dependencies", () => {
    const plan = parsePlanOutput(makeSamplePlanMarkdown());
    const agent = plan.agents[1];
    expect(agent.dependsOn).toContain("auth-api-agent");
  });

  it("sets createdAt to current ISO timestamp", () => {
    const plan = parsePlanOutput(makeSamplePlanMarkdown());
    expect(plan.createdAt).toBeTruthy();
  });

  it("computes strategy from wave structure", () => {
    const plan = parsePlanOutput(makeSamplePlanMarkdown());
    // Two waves, each with one agent => wave-based or sequential
    expect(["sequential", "parallel", "wave-based"]).toContain(plan.strategy);
  });
});

describe("writePlanArtifact", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "planner-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes a plan markdown file", () => {
    const plan = makeExecutionPlan();
    const filePath = writePlanArtifact(plan, tmpDir);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("output contains '# Execution Plan' heading", () => {
    const plan = makeExecutionPlan();
    const filePath = writePlanArtifact(plan, tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("# Execution Plan");
  });

  it("output contains '## Agents' section", () => {
    const plan = makeExecutionPlan();
    const filePath = writePlanArtifact(plan, tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("## Agents");
  });

  it("output contains '## Execution Order' table", () => {
    const plan = makeExecutionPlan();
    const filePath = writePlanArtifact(plan, tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("## Execution Order");
    expect(content).toContain("| Wave |");
  });

  it("output contains '## Validation' section", () => {
    const plan = makeExecutionPlan();
    plan.validationResults = [
      { name: "file-overlap", status: "PASS" },
    ];
    const filePath = writePlanArtifact(plan, tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("## Validation");
  });

  it("output contains '## Removed by User' section", () => {
    const plan = makeExecutionPlan();
    const filePath = writePlanArtifact(plan, tmpDir);
    const content = fs.readFileSync(filePath, "utf-8");
    expect(content).toContain("## Removed by User");
  });
});

describe("runPlanner", () => {
  it("returns a prompt string for the orchestrator", async () => {
    const options: PlannerOptions = {
      projectRoot: "/fake/project",
      taskSlug: "add-jwt-auth",
      task: "Add JWT authentication",
      scopeContract: makeScopeContract(),
      analysisResult: makeAnalysisResult(),
      researchOutput: makeResearchOutput(),
    };
    const result = await runPlanner(options);
    expect(result.prompt).toBeTruthy();
    expect(result.prompt.length).toBeGreaterThan(0);
  });
});
