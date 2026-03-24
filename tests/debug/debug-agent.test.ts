// ---------------------------------------------------------------------------
// Tests for debug agent loop
// ---------------------------------------------------------------------------

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvalFinding } from "../../src/eval/types.js";
import type { DebugOptions, DebugCallbacks } from "../../src/debug/types.js";
import { runDebug } from "../../src/debug/debug-agent.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<EvalFinding> = {}): EvalFinding {
  return {
    id: "eval-correctness-src-foo-ts-10",
    criterion: "correctness",
    category: "incorrect_implementation",
    file: "src/foo.ts",
    line: 10,
    description: "Missing null check",
    severity: "ERROR",
    evidence: "Line 10: const val = obj.prop;",
    ...overrides,
  };
}

function makeOptions(overrides: Partial<DebugOptions> = {}): DebugOptions {
  return {
    projectRoot: "/project",
    taskSlug: "my-task",
    findings: [],
    scopeContractPath: "/project/scope.md",
    planPath: "/project/plan.json",
    coordinationPath: "/project/coordination.md",
    reportPath: "/project/report.md",
    maxCycles: 3,
    executionDir: "/project/execution",
    ...overrides,
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
    onDesignDecision: vi.fn().mockResolvedValue("option-a"),
    onProgress: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// runDebug
// ---------------------------------------------------------------------------

describe("runDebug", () => {
  it("returns DebugResult with cyclesUsed=0 and empty resolved when no findings provided", async () => {
    const options = makeOptions({ findings: [] });
    const callbacks = makeCallbacks();

    const result = await runDebug(options, callbacks);

    expect(result.cyclesUsed).toBe(0);
    expect(result.resolved).toEqual([]);
    expect(result.remaining).toEqual([]);
    expect(result.commits).toEqual([]);
    expect(result.escalated).toEqual([]);
    expect(result.timing_ms).toBeGreaterThanOrEqual(0);
  });

  it("separates design decisions from auto-fixable findings", async () => {
    const findings: EvalFinding[] = [
      makeFinding({
        id: "f1",
        category: "design_decision",
        severity: "ERROR",
      }),
      makeFinding({
        id: "f2",
        category: "incorrect_implementation",
        severity: "ERROR",
      }),
    ];

    // dispatchEvalAgent returns empty after re-eval (f2 resolved)
    const callbacks = makeCallbacks({
      dispatchEvalAgent: vi.fn().mockResolvedValue("[]"),
      onDesignDecision: vi.fn().mockResolvedValue("skip"),
    });

    const options = makeOptions({ findings });
    const result = await runDebug(options, callbacks);

    // Design decision was escalated
    expect(result.escalated.length).toBe(1);
    expect(result.escalated[0].id).toBe("f1");
  });

  it("calls onDesignDecision callback for design_decision findings", async () => {
    const findings: EvalFinding[] = [
      makeFinding({
        id: "f1",
        category: "design_decision",
        severity: "WARN",
      }),
    ];

    const onDesignDecision = vi.fn().mockResolvedValue("skip");
    const callbacks = makeCallbacks({ onDesignDecision });

    const options = makeOptions({ findings });
    await runDebug(options, callbacks);

    expect(onDesignDecision).toHaveBeenCalledTimes(1);
    expect(onDesignDecision.mock.calls[0][0]).toHaveProperty("finding");
    expect(onDesignDecision.mock.calls[0][0]).toHaveProperty("options");
  });

  it("dispatches fix agent via dispatchFixAgent callback", async () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", severity: "ERROR" }),
    ];

    const dispatchFixAgent = vi.fn().mockResolvedValue({
      success: true,
      output: "Fixed. Commit: abc123",
    });
    // Re-eval finds no remaining findings (resolved)
    const dispatchEvalAgent = vi.fn().mockResolvedValue("[]");

    const callbacks = makeCallbacks({ dispatchFixAgent, dispatchEvalAgent });
    const options = makeOptions({ findings });

    await runDebug(options, callbacks);

    expect(dispatchFixAgent).toHaveBeenCalled();
  });

  it("calls dispatchVerifyAgent with changed files after fix", async () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", file: "src/foo.ts", severity: "ERROR" }),
    ];

    const dispatchVerifyAgent = vi.fn().mockResolvedValue({ newIssues: 0 });
    const dispatchEvalAgent = vi.fn().mockResolvedValue("[]");

    const callbacks = makeCallbacks({ dispatchVerifyAgent, dispatchEvalAgent });
    const options = makeOptions({ findings });

    await runDebug(options, callbacks);

    expect(dispatchVerifyAgent).toHaveBeenCalled();
    const changedFiles = dispatchVerifyAgent.mock.calls[0][0];
    expect(changedFiles).toContain("src/foo.ts");
  });

  it("calls dispatchEvalAgent for scoped re-eval of targeted findings", async () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", severity: "ERROR" }),
    ];

    const dispatchEvalAgent = vi.fn().mockResolvedValue("[]");
    const callbacks = makeCallbacks({ dispatchEvalAgent });
    const options = makeOptions({ findings });

    await runDebug(options, callbacks);

    expect(dispatchEvalAgent).toHaveBeenCalled();
  });

  it("removes resolved findings from remaining after each cycle", async () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", severity: "ERROR", file: "src/a.ts" }),
      makeFinding({ id: "f2", severity: "ERROR", file: "src/b.ts" }),
    ];

    // Re-eval returns only f2 (f1 resolved)
    const dispatchEvalAgent = vi.fn().mockResolvedValue(
      JSON.stringify([
        {
          criterion: "correctness",
          category: "incorrect_implementation",
          file: "src/b.ts",
          line: 10,
          description: "Still broken",
          severity: "ERROR",
          evidence: "still there",
        },
      ]),
    );

    const callbacks = makeCallbacks({ dispatchEvalAgent });
    const options = makeOptions({ findings, maxCycles: 1 });

    const result = await runDebug(options, callbacks);

    // f1 should be resolved, f2 remaining
    expect(result.resolved.length).toBe(1);
    expect(result.resolved[0].id).toBe("f1");
    expect(result.remaining.length).toBe(1);
  });

  it("counts new findings from fix toward next cycle", async () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", severity: "ERROR", file: "src/a.ts" }),
    ];

    let callCount = 0;
    // First cycle: f1 gone but new finding f3 appears
    // Second cycle: everything resolved
    const dispatchEvalAgent = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          JSON.stringify([
            {
              criterion: "correctness",
              category: "incorrect_implementation",
              file: "src/a.ts",
              line: 30,
              description: "New issue from fix",
              severity: "WARN",
              evidence: "new issue",
            },
          ]),
        );
      }
      return Promise.resolve("[]");
    });

    const callbacks = makeCallbacks({ dispatchEvalAgent });
    const options = makeOptions({ findings, maxCycles: 3 });

    const result = await runDebug(options, callbacks);

    // Should have used 2 cycles (new finding in first, resolved in second)
    expect(result.cyclesUsed).toBe(2);
    expect(result.resolved.length).toBe(2); // f1 + new finding both resolved
  });

  it("stops when no ERROR/WARN findings remain (per D-20)", async () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", severity: "INFO" }),
    ];

    const callbacks = makeCallbacks();
    const options = makeOptions({ findings, maxCycles: 3 });

    const result = await runDebug(options, callbacks);

    // INFO-only findings should not trigger debug cycles
    expect(result.cyclesUsed).toBe(0);
  });

  it("stops at maxCycles with status report (per D-14)", async () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", severity: "ERROR" }),
    ];

    // Re-eval always returns the same finding (never resolves)
    const dispatchEvalAgent = vi.fn().mockResolvedValue(
      JSON.stringify([
        {
          criterion: "correctness",
          category: "incorrect_implementation",
          file: "src/foo.ts",
          line: 10,
          description: "Still broken",
          severity: "ERROR",
          evidence: "still there",
        },
      ]),
    );

    const onProgress = vi.fn();
    const callbacks = makeCallbacks({ dispatchEvalAgent, onProgress });
    const options = makeOptions({ findings, maxCycles: 2 });

    const result = await runDebug(options, callbacks);

    expect(result.cyclesUsed).toBe(2);
    expect(result.remaining.length).toBeGreaterThan(0);

    // Check max cycles message was emitted
    const progressMessages = onProgress.mock.calls.map((c) => c[0]);
    const maxCycleMsg = progressMessages.find((m: string) =>
      m.includes("Max debug cycles"),
    );
    expect(maxCycleMsg).toBeDefined();
  });

  it("tracks resolution rate (resolved / total)", async () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", severity: "ERROR", file: "src/a.ts" }),
      makeFinding({ id: "f2", severity: "ERROR", file: "src/b.ts" }),
    ];

    // Re-eval returns only f2 (f1 resolved on cycle 1)
    // Then f2 resolves on cycle 2
    let callCount = 0;
    const dispatchEvalAgent = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(
          JSON.stringify([
            {
              criterion: "correctness",
              category: "incorrect_implementation",
              file: "src/b.ts",
              line: 10,
              description: "Still broken",
              severity: "ERROR",
              evidence: "still there",
            },
          ]),
        );
      }
      return Promise.resolve("[]");
    });

    const onProgress = vi.fn();
    const callbacks = makeCallbacks({ dispatchEvalAgent, onProgress });
    const options = makeOptions({ findings, maxCycles: 3 });

    const result = await runDebug(options, callbacks);

    // Both findings should be resolved after 2 cycles
    expect(result.resolved.length).toBe(2);
    expect(result.remaining.length).toBe(0);
    expect(result.cyclesUsed).toBe(2);
  });

  it("preserves committed fixes even on crash (per D-27)", async () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", severity: "ERROR", file: "src/a.ts" }),
      makeFinding({ id: "f2", severity: "ERROR", file: "src/b.ts" }),
    ];

    let fixCallCount = 0;
    const dispatchFixAgent = vi.fn().mockImplementation(() => {
      fixCallCount++;
      if (fixCallCount === 2) {
        return Promise.reject(new Error("Agent crashed"));
      }
      return Promise.resolve({
        success: true,
        output: "Fixed. Commit: abc123",
      });
    });

    const callbacks = makeCallbacks({ dispatchFixAgent });
    const options = makeOptions({ findings, maxCycles: 1 });

    // Should not throw -- crashes handled gracefully
    const result = await runDebug(options, callbacks);

    // Should still return a result (partial)
    expect(result).toBeDefined();
    expect(result.timing_ms).toBeGreaterThanOrEqual(0);
  });
});
