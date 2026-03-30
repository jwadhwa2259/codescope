// ---------------------------------------------------------------------------
// Tests for PIPE-04: Token Budget Warning in Orchestrator
// ---------------------------------------------------------------------------
// Verifies that runExecution emits a WARNING via onProgress before execution
// starts when cumulative estimated tokens exceed the configured threshold
// (default 150K per D-13).
//
// Distinct from orchestrator.test.ts (comprehensive) — focuses exclusively on
// the token budget warning contract.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// Mock dependencies — control token estimation context
vi.mock("../../src/execution/qualification.js", () => ({
  runQualification: vi.fn().mockResolvedValue({
    qualified: true,
    issues: [],
    actualFiles: ["src/a.ts"],
    linesAdded: 5,
    linesRemoved: 1,
  }),
}));

vi.mock("../../src/execution/reconciliation.js", () => ({
  getGitHead: vi.fn().mockReturnValue("abc1234"),
  getChangedFilesSince: vi.fn().mockReturnValue(["src/a.ts"]),
  computeReconciliation: vi.fn().mockReturnValue({
    baselineCommit: "",
    plannedCount: 1,
    actualCount: 1,
    unexpected: [],
    missed: [],
    perAgent: [],
  }),
  generateReconciliationReport: vi.fn().mockReturnValue("/tmp/reconciliation.md"),
}));

vi.mock("../../src/config/loader.js", () => ({
  loadConfig: vi.fn().mockReturnValue(null),
}));

import { runExecution } from "../../src/execution/orchestrator.js";
import type { ExecutionCallbacks } from "../../src/execution/orchestrator.js";
import type { ExecutionOptions } from "../../src/execution/types.js";
import type { ExecutionPlan } from "../../src/orient/types.js";
import { loadConfig } from "../../src/config/loader.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePlanWithTokens(totalTokens: number): ExecutionPlan {
  const perAgent = Math.ceil(totalTokens / 2);
  return {
    taskSlug: "budget-test",
    createdAt: "2026-03-29T00:00:00Z",
    status: "APPROVED",
    strategy: "sequential",
    estimatedAgents: 2,
    estimatedTotalTokens: totalTokens,
    agents: [
      {
        name: "agent-1",
        wave: 1,
        task: "Task 1",
        exclusiveWriteFiles: ["src/a.ts"],
        readOnlyFiles: [],
        conventions: [],
        goldenFiles: [],
        dependsOn: [],
        estimatedTokens: perAgent,
        timeoutSeconds: 300,
      },
      {
        name: "agent-2",
        wave: 2,
        task: "Task 2",
        exclusiveWriteFiles: ["src/b.ts"],
        readOnlyFiles: [],
        conventions: [],
        goldenFiles: [],
        dependsOn: ["agent-1"],
        estimatedTokens: perAgent,
        timeoutSeconds: 300,
      },
    ],
    waves: [
      { waveNumber: 1, agents: ["agent-1"], mode: "sequential" },
      { waveNumber: 2, agents: ["agent-2"], mode: "sequential" },
    ],
    validationResults: [],
    removedByUser: [],
  };
}

// ---------------------------------------------------------------------------
// Token budget warning tests (PIPE-04)
// ---------------------------------------------------------------------------

describe("runExecution — token budget warning (PIPE-04)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "budget-warning-test-"));
    const execDir = path.join(tmpDir, "execution", "budget-test");
    fs.mkdirSync(execDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePlan(plan: ExecutionPlan): string {
    const planPath = path.join(tmpDir, "plan.json");
    fs.writeFileSync(planPath, JSON.stringify(plan), "utf-8");
    return planPath;
  }

  function makeOptions(planPath: string): ExecutionOptions {
    return {
      projectRoot: tmpDir,
      taskSlug: "budget-test",
      planPath,
      maxConcurrent: 3,
      verbosity: "brief",
    };
  }

  it("emits WARNING via onProgress when cumulative tokens exceed default 150K threshold", async () => {
    const plan = makePlanWithTokens(200_000); // 200K total > 150K default
    const planPath = writePlan(plan);

    (loadConfig as Mock).mockReturnValue(null); // null => default 150K

    const messages: string[] = [];
    const callbacks: ExecutionCallbacks = {
      dispatchAgent: vi.fn().mockResolvedValue({ success: true, output: "done" }),
      onProgress: (msg) => messages.push(msg),
    };

    await runExecution(makeOptions(planPath), callbacks);

    const warningMsg = messages.find((m) => m.includes("WARNING") && m.includes("exceed"));
    expect(warningMsg).toBeDefined();
  });

  it("warning message includes estimated token count rounded to K", async () => {
    const plan = makePlanWithTokens(200_000);
    const planPath = writePlan(plan);

    (loadConfig as Mock).mockReturnValue(null);

    const messages: string[] = [];
    const callbacks: ExecutionCallbacks = {
      dispatchAgent: vi.fn().mockResolvedValue({ success: true, output: "done" }),
      onProgress: (msg) => messages.push(msg),
    };

    await runExecution(makeOptions(planPath), callbacks);

    const warningMsg = messages.find((m) => m.includes("WARNING"));
    expect(warningMsg).toBeDefined();
    expect(warningMsg).toContain("200K");
    expect(warningMsg).toContain("150K");
  });

  it("does NOT emit WARNING when tokens are within the default 150K threshold", async () => {
    const plan = makePlanWithTokens(80_000); // 80K total < 150K default
    const planPath = writePlan(plan);

    (loadConfig as Mock).mockReturnValue(null);

    const messages: string[] = [];
    const callbacks: ExecutionCallbacks = {
      dispatchAgent: vi.fn().mockResolvedValue({ success: true, output: "done" }),
      onProgress: (msg) => messages.push(msg),
    };

    await runExecution(makeOptions(planPath), callbacks);

    const warningMsg = messages.find((m) => m.includes("WARNING") && m.includes("exceed"));
    expect(warningMsg).toBeUndefined();
  });

  it("uses custom token_budget_threshold from config when present", async () => {
    const plan = makePlanWithTokens(60_000); // 60K total
    const planPath = writePlan(plan);

    // Config sets threshold to 50K, so 60K should trigger warning
    (loadConfig as Mock).mockReturnValue({
      execute: { token_budget_threshold: 50_000 },
    });

    const messages: string[] = [];
    const callbacks: ExecutionCallbacks = {
      dispatchAgent: vi.fn().mockResolvedValue({ success: true, output: "done" }),
      onProgress: (msg) => messages.push(msg),
    };

    await runExecution(makeOptions(planPath), callbacks);

    const warningMsg = messages.find((m) => m.includes("WARNING") && m.includes("exceed"));
    expect(warningMsg).toBeDefined();
  });

  it("pipeline continues to execute agents after budget warning (flag-and-continue)", async () => {
    const plan = makePlanWithTokens(200_000); // Will trigger warning
    const planPath = writePlan(plan);

    (loadConfig as Mock).mockReturnValue(null);

    const dispatched: string[] = [];
    const callbacks: ExecutionCallbacks = {
      dispatchAgent: async (invocation) => {
        dispatched.push(invocation.name);
        return { success: true, output: "done" };
      },
      onProgress: () => {},
    };

    const result = await runExecution(makeOptions(planPath), callbacks);

    // Both agents should still run despite warning
    expect(dispatched).toContain("agent-1");
    expect(dispatched).toContain("agent-2");
    expect(result.status).toBe("complete");
  });
});
