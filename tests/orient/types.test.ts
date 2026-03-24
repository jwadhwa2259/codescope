import { describe, it, expect } from "vitest";
import type {
  AmbiguityLevel,
  AmbiguityAssessment,
  QuestionTopic,
  ClarificationQuestion,
  AffectedFile,
  RiskFlag,
  ScopeContract,
  ClarificationResult,
  AnalysisResult,
  ResearchTopic,
  ResearchOutput,
  AgentAssignment,
  ExecutionWave,
  ExecutionPlan,
  ValidationCheck,
  ValidationResult,
  PipelineOptions,
  PipelineResult,
} from "../../src/orient/types.js";

describe("Orient shared types", () => {
  it("ScopeContract has all required fields", () => {
    const contract: ScopeContract = {
      task: "add authentication",
      taskSlug: "add-authentication",
      createdAt: new Date().toISOString(),
      status: "PENDING",
      inScope: ["JWT auth", "login endpoint"],
      outOfScope: ["OAuth integration"],
      affectedFiles: [
        { filePath: "src/auth.ts", risk: "HIGH", centrality: 0.8, community: "src/auth" },
      ],
      assumptions: ["Using existing session store"],
      conventionsInScope: ["Prefer named exports"],
      riskFlags: [{ filePath: "src/auth.ts", reason: "High centrality node" }],
    };

    expect(contract.task).toBe("add authentication");
    expect(contract.taskSlug).toBe("add-authentication");
    expect(contract.status).toBe("PENDING");
    expect(contract.inScope).toHaveLength(2);
    expect(contract.outOfScope).toHaveLength(1);
    expect(contract.affectedFiles).toHaveLength(1);
    expect(contract.affectedFiles[0].filePath).toBe("src/auth.ts");
    expect(contract.affectedFiles[0].risk).toBe("HIGH");
    expect(contract.affectedFiles[0].centrality).toBe(0.8);
    expect(contract.affectedFiles[0].community).toBe("src/auth");
    expect(contract.assumptions).toHaveLength(1);
    expect(contract.conventionsInScope).toHaveLength(1);
    expect(contract.riskFlags).toHaveLength(1);
    expect(contract.riskFlags[0].filePath).toBe("src/auth.ts");
    expect(contract.riskFlags[0].reason).toBe("High centrality node");
  });

  it("AmbiguityAssessment has correct structure", () => {
    const assessment: AmbiguityAssessment = {
      level: "HIGH",
      matchedNodes: 2,
      communitiesSpanned: 4,
      dangerZonesInScope: 1,
      reasons: ["Only 2 graph nodes match keywords"],
    };

    expect(assessment.level).toBe("HIGH");
    expect(assessment.matchedNodes).toBe(2);
    expect(assessment.communitiesSpanned).toBe(4);
    expect(assessment.dangerZonesInScope).toBe(1);
    expect(assessment.reasons).toHaveLength(1);
  });

  it("ClarificationQuestion has topic and question fields", () => {
    const question: ClarificationQuestion = {
      topic: "scope_boundary",
      question: "Which module should be included?",
      context: "Task spans 3 communities",
    };

    expect(question.topic).toBe("scope_boundary");
    expect(question.question).toBeDefined();
    expect(question.context).toBeDefined();
  });

  it("ClarificationResult tracks ambiguity and questions", () => {
    const result: ClarificationResult = {
      needsClarification: true,
      ambiguityLevel: "HIGH",
      questions: [],
      scopeContract: null,
      durationMs: 150,
    };

    expect(result.needsClarification).toBe(true);
    expect(result.ambiguityLevel).toBe("HIGH");
    expect(result.scopeContract).toBeNull();
    expect(result.durationMs).toBe(150);
  });

  it("AnalysisResult captures all analysis dimensions", () => {
    const result: AnalysisResult = {
      affectedFiles: [],
      blastRadiusFiles: [],
      conventionMatches: ["Named exports"],
      testFiles: ["tests/auth.test.ts"],
      crossCommunityImpact: [{ communityId: 0, nodeCount: 10, affectedCount: 3 }],
      durationMs: 200,
    };

    expect(result.conventionMatches).toHaveLength(1);
    expect(result.testFiles).toHaveLength(1);
    expect(result.crossCommunityImpact).toHaveLength(1);
    expect(result.crossCommunityImpact[0].communityId).toBe(0);
  });

  it("ExecutionPlan captures agents and waves", () => {
    const plan: ExecutionPlan = {
      taskSlug: "add-auth",
      createdAt: new Date().toISOString(),
      status: "PENDING",
      strategy: "wave-based",
      estimatedAgents: 2,
      estimatedTotalTokens: 100000,
      agents: [
        {
          name: "agent-1",
          wave: 1,
          task: "implement auth",
          exclusiveWriteFiles: ["src/auth.ts"],
          readOnlyFiles: ["src/types.ts"],
          conventions: ["named exports"],
          goldenFiles: [{ path: "src/auth.ts", lines: "1-50" }],
          dependsOn: [],
          estimatedTokens: 50000,
          timeoutSeconds: 300,
        },
      ],
      waves: [{ waveNumber: 1, agents: ["agent-1"], mode: "sequential" }],
      validationResults: [{ name: "file-overlap", status: "PASS" }],
      removedByUser: [],
    };

    expect(plan.strategy).toBe("wave-based");
    expect(plan.agents).toHaveLength(1);
    expect(plan.waves).toHaveLength(1);
    expect(plan.validationResults[0].status).toBe("PASS");
  });

  it("PipelineOptions and PipelineResult have correct shapes", () => {
    const opts: PipelineOptions = {
      projectRoot: "/tmp/project",
      task: "add feature",
      taskSlug: "add-feature",
      noConfirm: false,
      noClarify: false,
    };

    const result: PipelineResult = {
      status: "approved",
      scopeContractPath: "/tmp/scope.md",
      planPath: "/tmp/plan.md",
      executionDir: "/tmp/execution",
    };

    expect(opts.projectRoot).toBe("/tmp/project");
    expect(result.status).toBe("approved");
    expect(result.scopeContractPath).not.toBeNull();
  });

  it("ValidationResult tracks checks and auto-fix attempts", () => {
    const result: ValidationResult = {
      passed: true,
      checks: [
        { name: "build", status: "PASS" },
        { name: "lint", status: "AUTO-FIXED", detail: "Fixed 2 lint errors" },
        { name: "types", status: "WARNING", detail: "3 any types remain" },
      ],
      autoFixAttempts: 1,
    };

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(3);
    expect(result.autoFixAttempts).toBe(1);
  });

  it("ResearchOutput tracks topics and duration", () => {
    const output: ResearchOutput = {
      completedAt: new Date().toISOString(),
      topicsResearched: 3,
      topicsSkipped: 1,
      topics: [
        { name: "JWT best practices", impactScore: 0.9, source: "context7" },
        { name: "Session management", impactScore: 0.6, source: "web_search" },
        { name: "Cookie security", impactScore: 0.4, source: "skipped", reason: "Low impact" },
      ],
      outputPath: "/tmp/research.md",
      durationMs: 5000,
    };

    expect(output.topicsResearched).toBe(3);
    expect(output.topicsSkipped).toBe(1);
    expect(output.topics).toHaveLength(3);
    expect(output.topics[2].source).toBe("skipped");
    expect(output.topics[2].reason).toBe("Low impact");
  });
});
