// ---------------------------------------------------------------------------
// Tests for eval types (EVAL-03)
// ---------------------------------------------------------------------------
// Validates that all required types are exported and have the correct shape.
// Per 06-01-PLAN.md: EvalFinding, EvalCriterionResult, EvalOptions,
// EvalResult, EvalCallbacks, EvalCriterion, FindingCategory, IgnorePattern,
// DebugCycleResult.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import type {
  EvalFinding,
  EvalCriterionResult,
  EvalOptions,
  EvalResult,
  EvalCallbacks,
  EvalCriterion,
  FindingCategory,
  IgnorePattern,
  DebugCycleResult,
} from "../../src/eval/types.js";

// ---------------------------------------------------------------------------
// Helpers -- construct instances of each type to verify shape at runtime
// ---------------------------------------------------------------------------

function makeFinding(): EvalFinding {
  return {
    id: "eval-scope_compliance-src-handler-ts-40",
    criterion: "scope_compliance",
    category: "missing_implementation",
    file: "src/handler.ts",
    line: 42,
    description: "Missing error handling",
    severity: "ERROR",
    evidence: "No try-catch",
  };
}

// ---------------------------------------------------------------------------
// Type export validation (EVAL-03)
// ---------------------------------------------------------------------------

describe("Eval types module exports (EVAL-03)", () => {
  it("EvalFinding has required fields: id, criterion, category, file, line, description, severity, evidence", () => {
    const finding: EvalFinding = makeFinding();

    expect(finding).toHaveProperty("id");
    expect(typeof finding.id).toBe("string");
    expect(finding).toHaveProperty("criterion");
    expect(typeof finding.criterion).toBe("string");
    expect(finding).toHaveProperty("category");
    expect(typeof finding.category).toBe("string");
    expect(finding).toHaveProperty("file");
    expect(typeof finding.file).toBe("string");
    expect(finding).toHaveProperty("line");
    expect(typeof finding.line).toBe("number");
    expect(finding).toHaveProperty("description");
    expect(typeof finding.description).toBe("string");
    expect(finding).toHaveProperty("severity");
    expect(typeof finding.severity).toBe("string");
    expect(finding).toHaveProperty("evidence");
    expect(typeof finding.evidence).toBe("string");
  });

  it("EvalFinding supports optional goldenFileRef field", () => {
    const finding: EvalFinding = { ...makeFinding(), goldenFileRef: "src/golden.ts" };

    expect(finding.goldenFileRef).toBe("src/golden.ts");

    const findingWithout: EvalFinding = makeFinding();
    expect(findingWithout.goldenFileRef).toBeUndefined();
  });

  it("EvalCriterionResult has criterion, status, findings, and optional detail", () => {
    const result: EvalCriterionResult = {
      criterion: "scope_compliance",
      status: "PASS",
      findings: [makeFinding()],
      detail: "All checks passed",
    };

    expect(result.criterion).toBe("scope_compliance");
    expect(result.status).toBe("PASS");
    expect(result.findings).toHaveLength(1);
    expect(result.detail).toBe("All checks passed");
  });

  it("EvalCriterionResult status accepts PASS, FAIL, and SKIPPED", () => {
    const passResult: EvalCriterionResult = {
      criterion: "correctness",
      status: "PASS",
      findings: [],
    };
    const failResult: EvalCriterionResult = {
      criterion: "correctness",
      status: "FAIL",
      findings: [makeFinding()],
    };
    const skippedResult: EvalCriterionResult = {
      criterion: "correctness",
      status: "SKIPPED",
      findings: [],
      detail: "Disabled in config",
    };

    expect(passResult.status).toBe("PASS");
    expect(failResult.status).toBe("FAIL");
    expect(skippedResult.status).toBe("SKIPPED");
  });

  it("EvalOptions has all required fields including enabledCriteria and ignorePatterns", () => {
    const options: EvalOptions = {
      projectRoot: "/project",
      taskSlug: "task-01",
      verifyResult: {
        static: {
          conventionViolations: [],
          blastRadiusDiff: { surprises: [], skips: [], scopeDrift: [], timing_ms: 0 },
          codeReview: [],
          timing: { convention_ms: 0, blastRadius_ms: 0, codeReview_ms: 0 },
        } as any,
        runtime: {
          build: { status: "pass", duration_ms: 0 },
          unitTests: { status: "skipped", passed: 0, failed: 0, total: 0, duration_ms: 0, failures: [] },
          integrationTests: { status: "skipped", passed: 0, failed: 0, total: 0, duration_ms: 0, failures: [] },
          e2e: { status: "skipped", passed: 0, failed: 0, total: 0, duration_ms: 0, failures: [] },
          autoSmoke: [],
          timing: {},
        } as any,
      },
      scopeContractPath: "/scope.md",
      planPath: "/plan.md",
      coordinationPath: "/coord.md",
      researchPath: null,
      enabledCriteria: {
        scope_compliance: true,
        convention_adherence: true,
        completeness: true,
        correctness: true,
      },
      ignorePatterns: [],
    };

    expect(options).toHaveProperty("projectRoot");
    expect(options).toHaveProperty("taskSlug");
    expect(options).toHaveProperty("verifyResult");
    expect(options).toHaveProperty("scopeContractPath");
    expect(options).toHaveProperty("planPath");
    expect(options).toHaveProperty("coordinationPath");
    expect(options).toHaveProperty("researchPath");
    expect(options).toHaveProperty("enabledCriteria");
    expect(options).toHaveProperty("ignorePatterns");
  });

  it("EvalResult has criteria array, findings array, overallStatus, and timing_ms", () => {
    const result: EvalResult = {
      criteria: [],
      findings: [],
      overallStatus: "PASS",
      timing_ms: 1234,
    };

    expect(Array.isArray(result.criteria)).toBe(true);
    expect(Array.isArray(result.findings)).toBe(true);
    expect(result.overallStatus).toBe("PASS");
    expect(typeof result.timing_ms).toBe("number");
  });

  it("EvalCallbacks has dispatchEvalAgent and onProgress", () => {
    const callbacks: EvalCallbacks = {
      dispatchEvalAgent: async () => "[]",
      onProgress: () => {},
    };

    expect(typeof callbacks.dispatchEvalAgent).toBe("function");
    expect(typeof callbacks.onProgress).toBe("function");
  });

  it("IgnorePattern has pattern, scope, criterion, created, and reason fields", () => {
    const pattern: IgnorePattern = {
      pattern: "callback pattern",
      scope: "*",
      criterion: "convention_adherence",
      created: "2026-03-24",
      reason: "Legacy code",
    };

    expect(pattern).toHaveProperty("pattern");
    expect(pattern).toHaveProperty("scope");
    expect(pattern).toHaveProperty("criterion");
    expect(pattern).toHaveProperty("created");
    expect(pattern).toHaveProperty("reason");
  });

  it("DebugCycleResult has maxCycles, findingsTargeted, fixPlans, reVerify, and reEval", () => {
    const cycleResult: DebugCycleResult = {
      maxCycles: 3,
      findingsTargeted: 2,
      fixPlans: [
        {
          description: "Fix handler",
          files: ["src/handler.ts"],
          findingsAddressed: ["eval-1"],
          result: "fixed",
          commitHash: "abc123",
          commitMessage: "fix: handler",
        },
      ],
      reVerify: { filesVerified: 1, newIssues: 0 },
      reEval: { findingsEvaluated: 2, resolved: 1, remaining: 1, newFromFix: 0 },
    };

    expect(cycleResult).toHaveProperty("maxCycles");
    expect(cycleResult).toHaveProperty("findingsTargeted");
    expect(cycleResult).toHaveProperty("fixPlans");
    expect(cycleResult).toHaveProperty("reVerify");
    expect(cycleResult).toHaveProperty("reEval");
    expect(cycleResult.fixPlans[0]).toHaveProperty("result");
    expect(["fixed", "partially fixed", "failed"]).toContain(cycleResult.fixPlans[0].result);
  });

  it("EvalCriterion type accepts all 4 criterion values", () => {
    const criteria: EvalCriterion[] = [
      "scope_compliance",
      "convention_adherence",
      "completeness",
      "correctness",
    ];

    expect(criteria).toHaveLength(4);
    expect(criteria).toContain("scope_compliance");
    expect(criteria).toContain("convention_adherence");
    expect(criteria).toContain("completeness");
    expect(criteria).toContain("correctness");
  });

  it("FindingCategory type accepts all 3 category values", () => {
    const categories: FindingCategory[] = [
      "missing_implementation",
      "incorrect_implementation",
      "design_decision",
    ];

    expect(categories).toHaveLength(3);
    expect(categories).toContain("missing_implementation");
    expect(categories).toContain("incorrect_implementation");
    expect(categories).toContain("design_decision");
  });
});
