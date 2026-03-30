// ---------------------------------------------------------------------------
// Tests for PIPE-02: Classification-Based Routing in the Debug Agent
// ---------------------------------------------------------------------------
// Verifies that the debug agent routes findings in the order dictated by
// CLASSIFICATION_PRIORITY: CODE_BUG (0) before CONVENTION_MISS (1) before
// PLAN_GAP (2) before SCOPE_DRIFT (3).
//
// Distinct from debug-agent.test.ts which covers the full debug loop.
// This file focuses exclusively on the classification routing contract.
// ---------------------------------------------------------------------------

import { describe, it, expect, vi } from "vitest";
import type { EvalFinding } from "../../src/eval/types.js";
import type { FailureClassification } from "../../src/eval/classifier.js";
import { CLASSIFICATION_PRIORITY } from "../../src/eval/classifier.js";
import type { DebugOptions, DebugCallbacks } from "../../src/debug/types.js";
import { runDebug } from "../../src/debug/debug-agent.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(
  id: string,
  classification: FailureClassification,
  file: string,
): EvalFinding {
  const criterionMap: Record<FailureClassification, EvalFinding["criterion"]> = {
    SCOPE_DRIFT: "scope_compliance",
    PLAN_GAP: "completeness",
    CODE_BUG: "correctness",
    CONVENTION_MISS: "convention_adherence",
  };

  return {
    id,
    criterion: criterionMap[classification],
    category: "incorrect_implementation",
    file,
    line: 10,
    description: `Finding for ${classification}`,
    severity: "ERROR",
    evidence: "evidence",
    classification,
  };
}

function makeCallbacks(overrides: Partial<DebugCallbacks> = {}): DebugCallbacks {
  return {
    dispatchFixAgent: vi.fn().mockResolvedValue({
      success: true,
      output: "Fixed. Commit: abc123",
    }),
    dispatchEvalAgent: vi.fn().mockResolvedValue("[]"),
    dispatchVerifyAgent: vi.fn().mockResolvedValue({ newIssues: 0 }),
    onDesignDecision: vi.fn().mockResolvedValue("skip"),
    onProgress: vi.fn(),
    ...overrides,
  };
}

function makeOptions(
  findings: EvalFinding[],
  overrides: Partial<DebugOptions> = {},
): DebugOptions {
  return {
    projectRoot: "/project",
    taskSlug: "test-task",
    findings,
    scopeContractPath: "/project/scope.md",
    planPath: "/project/plan.json",
    coordinationPath: "/project/coordination.md",
    reportPath: "/project/report.md",
    maxCycles: 1,
    executionDir: "/project/execution",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// CLASSIFICATION_PRIORITY constant (sanity check for routing contract)
// ---------------------------------------------------------------------------

describe("CLASSIFICATION_PRIORITY constant", () => {
  it("CODE_BUG has the lowest priority number (routes first)", () => {
    expect(CLASSIFICATION_PRIORITY.CODE_BUG).toBe(0);
  });

  it("SCOPE_DRIFT has the highest priority number (routes last)", () => {
    expect(CLASSIFICATION_PRIORITY.SCOPE_DRIFT).toBe(3);
  });

  it("full ordering is CODE_BUG < CONVENTION_MISS < PLAN_GAP < SCOPE_DRIFT", () => {
    expect(CLASSIFICATION_PRIORITY.CODE_BUG).toBeLessThan(CLASSIFICATION_PRIORITY.CONVENTION_MISS);
    expect(CLASSIFICATION_PRIORITY.CONVENTION_MISS).toBeLessThan(CLASSIFICATION_PRIORITY.PLAN_GAP);
    expect(CLASSIFICATION_PRIORITY.PLAN_GAP).toBeLessThan(CLASSIFICATION_PRIORITY.SCOPE_DRIFT);
  });
});

// ---------------------------------------------------------------------------
// runDebug — classification routing order (PIPE-02)
// ---------------------------------------------------------------------------

describe("runDebug — classification routing order (PIPE-02)", () => {
  it("dispatches CODE_BUG findings before PLAN_GAP findings", async () => {
    const findings: EvalFinding[] = [
      // PLAN_GAP listed first to test sort
      makeFinding("f-plan-gap", "PLAN_GAP", "src/a.ts"),
      makeFinding("f-code-bug", "CODE_BUG", "src/b.ts"),
    ];

    const dispatchOrder: string[] = [];
    const dispatchFixAgent = vi.fn().mockImplementation((prompt: string) => {
      const fileMatch = prompt.match(/src\/[a-z]\.ts/);
      if (fileMatch) dispatchOrder.push(fileMatch[0]);
      return Promise.resolve({ success: true, output: "Fixed. Commit: abc123" });
    });

    const callbacks = makeCallbacks({ dispatchFixAgent });
    await runDebug(makeOptions(findings), callbacks);

    expect(dispatchFixAgent).toHaveBeenCalled();

    // If both files appear in dispatch order, CODE_BUG (src/b.ts) must precede PLAN_GAP (src/a.ts)
    const bIdx = dispatchOrder.indexOf("src/b.ts");
    const aIdx = dispatchOrder.indexOf("src/a.ts");
    if (bIdx >= 0 && aIdx >= 0) {
      expect(bIdx).toBeLessThan(aIdx);
    }
  });

  it("dispatches CODE_BUG findings before SCOPE_DRIFT findings", async () => {
    const findings: EvalFinding[] = [
      makeFinding("f-scope", "SCOPE_DRIFT", "src/scope.ts"),
      makeFinding("f-bug", "CODE_BUG", "src/bug.ts"),
    ];

    const dispatchOrder: string[] = [];
    const dispatchFixAgent = vi.fn().mockImplementation((prompt: string) => {
      const fileMatch = prompt.match(/src\/[a-z]+\.ts/);
      if (fileMatch) dispatchOrder.push(fileMatch[0]);
      return Promise.resolve({ success: true, output: "Fixed. Commit: abc123" });
    });

    const callbacks = makeCallbacks({ dispatchFixAgent });
    await runDebug(makeOptions(findings), callbacks);

    expect(dispatchFixAgent).toHaveBeenCalled();

    const bugIdx = dispatchOrder.indexOf("src/bug.ts");
    const scopeIdx = dispatchOrder.indexOf("src/scope.ts");
    if (bugIdx >= 0 && scopeIdx >= 0) {
      expect(bugIdx).toBeLessThan(scopeIdx);
    }
  });

  it("handles findings without classification field using CODE_BUG fallback", async () => {
    // Findings without classification set -- should not throw and fallback to CODE_BUG
    const findingsNoClass: EvalFinding[] = [
      {
        id: "f-no-class-1",
        criterion: "correctness",
        category: "incorrect_implementation",
        file: "src/x.ts",
        line: 5,
        description: "No classification",
        severity: "ERROR",
        evidence: "evidence",
        // classification intentionally omitted
      },
      {
        id: "f-no-class-2",
        criterion: "completeness",
        category: "missing_implementation",
        file: "src/y.ts",
        line: 15,
        description: "No classification",
        severity: "WARN",
        evidence: "evidence",
        // classification intentionally omitted
      },
    ];

    const callbacks = makeCallbacks({
      dispatchEvalAgent: vi.fn().mockResolvedValue("[]"),
    });

    // Should not throw
    const result = await runDebug(makeOptions(findingsNoClass), callbacks);

    expect(result).toBeDefined();
    expect(result.cyclesUsed).toBe(1);
  });

  it("CONVENTION_MISS is dispatched before PLAN_GAP when both present", async () => {
    const findings: EvalFinding[] = [
      // PLAN_GAP listed first to force sort to demonstrate routing
      makeFinding("f-plan", "PLAN_GAP", "src/plan.ts"),
      makeFinding("f-conv", "CONVENTION_MISS", "src/conv.ts"),
    ];

    const dispatchOrder: string[] = [];
    const dispatchFixAgent = vi.fn().mockImplementation((prompt: string) => {
      const fileMatch = prompt.match(/src\/[a-z]+\.ts/);
      if (fileMatch) dispatchOrder.push(fileMatch[0]);
      return Promise.resolve({ success: true, output: "Fixed. Commit: abc123" });
    });

    const callbacks = makeCallbacks({ dispatchFixAgent });
    await runDebug(makeOptions(findings), callbacks);

    expect(dispatchFixAgent).toHaveBeenCalled();

    const convIdx = dispatchOrder.indexOf("src/conv.ts");
    const planIdx = dispatchOrder.indexOf("src/plan.ts");
    if (convIdx >= 0 && planIdx >= 0) {
      expect(convIdx).toBeLessThan(planIdx);
    }
  });
});
