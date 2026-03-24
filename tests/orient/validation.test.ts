import { describe, it, expect } from "vitest";
import type {
  ExecutionPlan,
  AgentAssignment,
  ExecutionWave,
  ScopeContract,
  ValidationCheck,
} from "../../src/orient/types.js";
import {
  validatePlan,
  autoFixPlan,
  writeValidationSection,
} from "../../src/orient/validation.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeScopeContract(): ScopeContract {
  return {
    task: "Add JWT authentication",
    taskSlug: "add-jwt-auth",
    createdAt: "2026-03-24T00:00:00Z",
    status: "APPROVED",
    inScope: ["JWT token validation", "Auth middleware", "Protected routes"],
    outOfScope: ["User registration"],
    affectedFiles: [],
    assumptions: [],
    conventionsInScope: [],
    riskFlags: [],
  };
}

function makeGoodPlan(): ExecutionPlan {
  return {
    taskSlug: "add-jwt-auth",
    createdAt: "2026-03-24T00:00:00Z",
    status: "PENDING",
    strategy: "wave-based",
    estimatedAgents: 2,
    estimatedTotalTokens: 50000,
    agents: [
      {
        name: "auth-agent",
        wave: 1,
        task: "Implement JWT token validation and auth middleware",
        exclusiveWriteFiles: ["src/auth.ts"],
        readOnlyFiles: [],
        conventions: [],
        goldenFiles: [],
        dependsOn: [],
        estimatedTokens: 25000,
        timeoutSeconds: 180,
      },
      {
        name: "router-agent",
        wave: 2,
        task: "Add protected routes to API router",
        exclusiveWriteFiles: ["src/router.ts"],
        readOnlyFiles: ["src/auth.ts"],
        conventions: [],
        goldenFiles: [],
        dependsOn: ["auth-agent"],
        estimatedTokens: 25000,
        timeoutSeconds: 120,
      },
    ],
    waves: [
      { waveNumber: 1, agents: ["auth-agent"], mode: "sequential" },
      { waveNumber: 2, agents: ["router-agent"], mode: "sequential" },
    ],
    validationResults: [],
    removedByUser: [],
  };
}

function makePlanWithFileOverlap(): ExecutionPlan {
  return {
    taskSlug: "add-jwt-auth",
    createdAt: "2026-03-24T00:00:00Z",
    status: "PENDING",
    strategy: "parallel",
    estimatedAgents: 2,
    estimatedTotalTokens: 50000,
    agents: [
      {
        name: "agent-a",
        wave: 1,
        task: "Task A",
        exclusiveWriteFiles: ["src/shared.ts", "src/a.ts"],
        readOnlyFiles: [],
        conventions: [],
        goldenFiles: [],
        dependsOn: [],
        estimatedTokens: 20000,
        timeoutSeconds: 120,
      },
      {
        name: "agent-b",
        wave: 1,
        task: "Task B",
        exclusiveWriteFiles: ["src/shared.ts", "src/b.ts"],
        readOnlyFiles: [],
        conventions: [],
        goldenFiles: [],
        dependsOn: [],
        estimatedTokens: 20000,
        timeoutSeconds: 120,
      },
    ],
    waves: [
      { waveNumber: 1, agents: ["agent-a", "agent-b"], mode: "parallel" },
    ],
    validationResults: [],
    removedByUser: [],
  };
}

function makePlanWithBadDependencyOrdering(): ExecutionPlan {
  return {
    taskSlug: "test",
    createdAt: "2026-03-24T00:00:00Z",
    status: "PENDING",
    strategy: "wave-based",
    estimatedAgents: 2,
    estimatedTotalTokens: 40000,
    agents: [
      {
        name: "agent-a",
        wave: 1,
        task: "Task A",
        exclusiveWriteFiles: ["src/a.ts"],
        readOnlyFiles: [],
        conventions: [],
        goldenFiles: [],
        dependsOn: ["agent-b"], // depends on agent-b, but agent-b is in wave 1 too!
        estimatedTokens: 20000,
        timeoutSeconds: 120,
      },
      {
        name: "agent-b",
        wave: 1,
        task: "Task B",
        exclusiveWriteFiles: ["src/b.ts"],
        readOnlyFiles: [],
        conventions: [],
        goldenFiles: [],
        dependsOn: [],
        estimatedTokens: 20000,
        timeoutSeconds: 120,
      },
    ],
    waves: [
      { waveNumber: 1, agents: ["agent-a", "agent-b"], mode: "parallel" },
    ],
    validationResults: [],
    removedByUser: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validatePlan", () => {
  it("returns passed=true when all checks pass (no overlaps, valid ordering, full coverage)", () => {
    const result = validatePlan(makeGoodPlan(), makeScopeContract());
    expect(result.passed).toBe(true);
    expect(result.checks.every((c) => c.status === "PASS" || c.status === "AUTO-FIXED")).toBe(true);
  });

  it("returns passed=false when file overlap exists in a parallel wave", () => {
    const result = validatePlan(makePlanWithFileOverlap(), makeScopeContract());
    expect(result.passed).toBe(false);
    const failChecks = result.checks.filter((c) => c.status === "FAIL");
    expect(failChecks.length).toBeGreaterThan(0);
    expect(failChecks.some((c) => c.name.includes("file-overlap"))).toBe(true);
  });

  it("returns passed=false when dependency ordering is invalid", () => {
    const result = validatePlan(makePlanWithBadDependencyOrdering(), makeScopeContract());
    expect(result.passed).toBe(false);
    const failChecks = result.checks.filter((c) => c.status === "FAIL");
    expect(failChecks.length).toBeGreaterThan(0);
  });

  it("returns WARNING for scope coverage gaps", () => {
    const scopeContract = makeScopeContract();
    scopeContract.inScope = ["Completely unrelated feature XYZ123"];
    const result = validatePlan(makeGoodPlan(), scopeContract);
    const warningChecks = result.checks.filter((c) => c.status === "WARNING");
    expect(warningChecks.length).toBeGreaterThan(0);
    expect(warningChecks.some((c) => c.name.includes("scope-coverage"))).toBe(true);
  });
});

describe("autoFixPlan", () => {
  it("resolves file overlap by moving conflicting agent to next wave", () => {
    const plan = makePlanWithFileOverlap();
    const validation = validatePlan(plan, makeScopeContract());
    const { plan: fixedPlan, result: fixedResult } = autoFixPlan(plan, validation);

    // After fix, agents should be in separate waves
    const agentAWave = fixedPlan.agents.find((a) => a.name === "agent-a")?.wave;
    const agentBWave = fixedPlan.agents.find((a) => a.name === "agent-b")?.wave;
    expect(agentAWave).not.toBe(agentBWave);
  });

  it("resolves dependency ordering issues by recomputing wave assignments", () => {
    const plan = makePlanWithBadDependencyOrdering();
    const validation = validatePlan(plan, makeScopeContract());
    const { result: fixedResult } = autoFixPlan(plan, validation);

    // After fix, should pass or have auto-fixed status
    const failChecks = fixedResult.checks.filter((c) => c.status === "FAIL");
    // Dependency ordering should be resolved (fail count from dep-ordering should be 0)
    const depFails = failChecks.filter((c) => c.name.includes("dep-ordering"));
    expect(depFails).toHaveLength(0);
  });

  it("gives up after 2 attempts and returns unfixed result with WARNING status", () => {
    // Create an unfixable scenario: circular dependency
    const plan: ExecutionPlan = {
      taskSlug: "test",
      createdAt: "2026-03-24T00:00:00Z",
      status: "PENDING",
      strategy: "parallel",
      estimatedAgents: 2,
      estimatedTotalTokens: 40000,
      agents: [
        {
          name: "agent-a",
          wave: 1,
          task: "Task A",
          exclusiveWriteFiles: ["src/a.ts"],
          readOnlyFiles: [],
          conventions: [],
          goldenFiles: [],
          dependsOn: ["agent-b"],
          estimatedTokens: 20000,
          timeoutSeconds: 120,
        },
        {
          name: "agent-b",
          wave: 1,
          task: "Task B",
          exclusiveWriteFiles: ["src/b.ts"],
          readOnlyFiles: [],
          conventions: [],
          goldenFiles: [],
          dependsOn: ["agent-a"],
          estimatedTokens: 20000,
          timeoutSeconds: 120,
        },
      ],
      waves: [
        { waveNumber: 1, agents: ["agent-a", "agent-b"], mode: "parallel" },
      ],
      validationResults: [],
      removedByUser: [],
    };

    const validation = validatePlan(plan, makeScopeContract());
    const { result } = autoFixPlan(plan, validation, 2);

    // Should have attempted fixes but given up
    expect(result.autoFixAttempts).toBeLessThanOrEqual(2);
    // Should have WARNING or FAIL checks remaining
    const nonPass = result.checks.filter(
      (c) => c.status === "FAIL" || c.status === "WARNING",
    );
    expect(nonPass.length).toBeGreaterThan(0);
  });

  it("does not modify a plan that already passes", () => {
    const plan = makeGoodPlan();
    const validation = validatePlan(plan, makeScopeContract());
    expect(validation.passed).toBe(true);
    const { plan: fixedPlan, result: fixedResult } = autoFixPlan(plan, validation);
    expect(fixedResult.passed).toBe(true);
    expect(fixedPlan.agents).toEqual(plan.agents);
  });
});

describe("writeValidationSection", () => {
  it("formats PASS check with checkbox", () => {
    const checks: ValidationCheck[] = [
      { name: "file-overlap", status: "PASS" },
    ];
    const section = writeValidationSection(checks);
    expect(section).toContain("- [x] file-overlap: **PASS**");
  });

  it("formats AUTO-FIXED check with detail", () => {
    const checks: ValidationCheck[] = [
      { name: "file-overlap", status: "AUTO-FIXED", detail: "Moved agent-b to wave 2" },
    ];
    const section = writeValidationSection(checks);
    expect(section).toContain("- [x] file-overlap: **AUTO-FIXED**");
    expect(section).toContain("Moved agent-b to wave 2");
  });

  it("formats WARNING check with unchecked box", () => {
    const checks: ValidationCheck[] = [
      { name: "scope-coverage", status: "WARNING", detail: "Uncovered items" },
    ];
    const section = writeValidationSection(checks);
    expect(section).toContain("- [ ] scope-coverage: **WARNING**");
    expect(section).toContain("Uncovered items");
  });

  it("formats FAIL check with unchecked box", () => {
    const checks: ValidationCheck[] = [
      { name: "dep-ordering", status: "FAIL", detail: "Circular dependency" },
    ];
    const section = writeValidationSection(checks);
    expect(section).toContain("- [ ] dep-ordering: **FAIL**");
    expect(section).toContain("Circular dependency");
  });
});
