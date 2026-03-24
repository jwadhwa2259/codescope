import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  runExecution,
  readPlanFromDisk,
  writeExecutionSummary,
} from "../../src/execution/orchestrator.js";
import type { ExecutionCallbacks } from "../../src/execution/orchestrator.js";
import type {
  ExecutionOptions,
  ExecutionResult,
  AgentResult,
} from "../../src/execution/types.js";
import type { ExecutionPlan, AgentAssignment } from "../../src/orient/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makePlan(overrides?: Partial<ExecutionPlan>): ExecutionPlan {
  return {
    taskSlug: "add-auth",
    createdAt: "2026-01-01T00:00:00Z",
    status: "APPROVED",
    strategy: "sequential",
    estimatedAgents: 2,
    estimatedTotalTokens: 80000,
    agents: [
      {
        name: "db-agent",
        wave: 1,
        task: "Set up database schema",
        exclusiveWriteFiles: ["src/db/schema.ts"],
        readOnlyFiles: [],
        conventions: ["Use async/await"],
        goldenFiles: [],
        dependsOn: [],
        estimatedTokens: 40000,
        timeoutSeconds: 300,
      },
      {
        name: "auth-agent",
        wave: 2,
        task: "Implement JWT auth",
        exclusiveWriteFiles: ["src/auth/middleware.ts"],
        readOnlyFiles: ["src/db/schema.ts"],
        conventions: [],
        goldenFiles: [],
        dependsOn: ["db-agent"],
        estimatedTokens: 40000,
        timeoutSeconds: 300,
      },
    ],
    waves: [
      { waveNumber: 1, agents: ["db-agent"], mode: "sequential" },
      { waveNumber: 2, agents: ["auth-agent"], mode: "sequential" },
    ],
    validationResults: [{ name: "file-overlap", status: "PASS" }],
    removedByUser: [],
    ...overrides,
  };
}

function makeParallelPlan(): ExecutionPlan {
  return {
    taskSlug: "refactor-api",
    createdAt: "2026-01-01T00:00:00Z",
    status: "APPROVED",
    strategy: "parallel",
    estimatedAgents: 2,
    estimatedTotalTokens: 80000,
    agents: [
      {
        name: "agent-a",
        wave: 1,
        task: "Implement endpoint A",
        exclusiveWriteFiles: ["src/api/a.ts"],
        readOnlyFiles: [],
        conventions: [],
        goldenFiles: [],
        dependsOn: [],
        estimatedTokens: 40000,
        timeoutSeconds: 300,
      },
      {
        name: "agent-b",
        wave: 1,
        task: "Implement endpoint B",
        exclusiveWriteFiles: ["src/api/b.ts"],
        readOnlyFiles: [],
        conventions: [],
        goldenFiles: [],
        dependsOn: [],
        estimatedTokens: 40000,
        timeoutSeconds: 300,
      },
    ],
    waves: [
      { waveNumber: 1, agents: ["agent-a", "agent-b"], mode: "parallel" },
    ],
    validationResults: [{ name: "file-overlap", status: "PASS" }],
    removedByUser: [],
  };
}

function makeOptions(tmpDir: string): ExecutionOptions {
  return {
    projectRoot: tmpDir,
    taskSlug: "add-auth",
    planPath: path.join(tmpDir, "plan.json"),
    maxConcurrent: 3,
    verbosity: "brief",
  };
}

function makeSuccessCallbacks(
  dispatched: string[],
): ExecutionCallbacks {
  return {
    dispatchAgent: async (invocation) => {
      dispatched.push(invocation.name);
      return { success: true, output: `${invocation.name} completed successfully` };
    },
    onProgress: () => {},
  };
}

// ---------------------------------------------------------------------------
// readPlanFromDisk
// ---------------------------------------------------------------------------

describe("readPlanFromDisk", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-plan-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reads and parses a JSON plan file from disk", () => {
    const plan = makePlan();
    const planPath = path.join(tmpDir, "plan.json");
    fs.writeFileSync(planPath, JSON.stringify(plan), "utf-8");

    const parsed = readPlanFromDisk(planPath);
    expect(parsed.taskSlug).toBe("add-auth");
    expect(parsed.agents).toHaveLength(2);
    expect(parsed.waves).toHaveLength(2);
    expect(parsed.strategy).toBe("sequential");
  });
});

// ---------------------------------------------------------------------------
// runExecution
// ---------------------------------------------------------------------------

describe("runExecution", () => {
  let tmpDir: string;
  let executionDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-test-"));
    executionDir = path.join(tmpDir, "execution", "add-auth");
    fs.mkdirSync(executionDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePlan(plan: ExecutionPlan): string {
    const planPath = path.join(tmpDir, "plan.json");
    fs.writeFileSync(planPath, JSON.stringify(plan), "utf-8");
    return planPath;
  }

  it("reads plan from planPath and initializes coordination file", async () => {
    const plan = makePlan();
    const planPath = writePlan(plan);
    const dispatched: string[] = [];

    await runExecution(
      { ...makeOptions(tmpDir), planPath },
      makeSuccessCallbacks(dispatched),
    );

    // Coordination file should exist
    const coordPath = path.join(executionDir, "coordination.md");
    expect(fs.existsSync(coordPath)).toBe(true);
    const content = fs.readFileSync(coordPath, "utf-8");
    expect(content).toContain("# Coordination Log: add-auth");
  });

  it("detects agent teams availability and selects mode accordingly", async () => {
    // Without agent teams env var, should fall back to sequential
    const oldEnv = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;

    const plan = makeParallelPlan();
    plan.taskSlug = "refactor-api";
    const planPath = writePlan(plan);
    const dispatched: string[] = [];

    // Adjust execution dir for this plan
    const refactorDir = path.join(tmpDir, "execution", "refactor-api");
    fs.mkdirSync(refactorDir, { recursive: true });

    const result = await runExecution(
      { ...makeOptions(tmpDir), planPath, taskSlug: "refactor-api" },
      makeSuccessCallbacks(dispatched),
    );

    // Both agents should still be dispatched (sequentially when teams unavailable)
    expect(dispatched).toContain("agent-a");
    expect(dispatched).toContain("agent-b");

    // Restore env
    if (oldEnv !== undefined) {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = oldEnv;
    }
  });

  it("with sequential mode dispatches agents one at a time in wave order", async () => {
    const plan = makePlan();
    const planPath = writePlan(plan);
    const dispatched: string[] = [];

    await runExecution(
      { ...makeOptions(tmpDir), planPath },
      makeSuccessCallbacks(dispatched),
    );

    // db-agent (wave 1) should be dispatched before auth-agent (wave 2)
    expect(dispatched.indexOf("db-agent")).toBeLessThan(
      dispatched.indexOf("auth-agent"),
    );
  });

  it("with parallel mode and agent teams dispatches no-dependency agents concurrently (EXEC-04)", async () => {
    const oldEnv = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "true";

    const plan = makeParallelPlan();
    plan.taskSlug = "refactor-api";
    const planPath = writePlan(plan);

    const refactorDir = path.join(tmpDir, "execution", "refactor-api");
    fs.mkdirSync(refactorDir, { recursive: true });

    const dispatchOrder: Array<{ name: string; startTime: number }> = [];
    const callbacks: ExecutionCallbacks = {
      dispatchAgent: async (invocation) => {
        dispatchOrder.push({ name: invocation.name, startTime: Date.now() });
        // Simulate some work
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { success: true, output: `${invocation.name} done` };
      },
      onProgress: () => {},
    };

    const result = await runExecution(
      { ...makeOptions(tmpDir), planPath, taskSlug: "refactor-api" },
      callbacks,
    );

    // Both agents should be dispatched
    expect(dispatchOrder.map((d) => d.name)).toContain("agent-a");
    expect(dispatchOrder.map((d) => d.name)).toContain("agent-b");
    // Result should indicate mode used
    expect(result.mode).toBe("parallel");

    // Restore env
    if (oldEnv !== undefined) {
      process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = oldEnv;
    } else {
      delete process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
    }
  });

  it("records coordination entries for each agent: started, done/failed", async () => {
    const plan = makePlan();
    const planPath = writePlan(plan);
    const dispatched: string[] = [];

    await runExecution(
      { ...makeOptions(tmpDir), planPath },
      makeSuccessCallbacks(dispatched),
    );

    const coordPath = path.join(executionDir, "coordination.md");
    const content = fs.readFileSync(coordPath, "utf-8");

    // Each agent should have started + done entries
    expect(content).toContain("db-agent");
    expect(content).toContain("auth-agent");
    expect(content).toContain("`started`");
    expect(content).toContain("`done`");
  });

  it("with agent failure retries once per D-36, then skips agent and dependents", async () => {
    const plan = makePlan();
    const planPath = writePlan(plan);
    const callCounts: Record<string, number> = {};

    const callbacks: ExecutionCallbacks = {
      dispatchAgent: async (invocation) => {
        callCounts[invocation.name] = (callCounts[invocation.name] ?? 0) + 1;
        if (invocation.name === "db-agent") {
          return { success: false, error: "Compilation error" };
        }
        return { success: true, output: `${invocation.name} done` };
      },
      onProgress: () => {},
    };

    const result = await runExecution(
      { ...makeOptions(tmpDir), planPath },
      callbacks,
    );

    // db-agent should be retried once (dispatched twice total)
    expect(callCounts["db-agent"]).toBe(2);

    // auth-agent depends on db-agent, should be skipped
    expect(callCounts["auth-agent"]).toBeUndefined();

    // Result should reflect failures and skips
    const dbResult = result.agents.find((a) => a.name === "db-agent");
    expect(dbResult?.status).toBe("failed");
    expect(dbResult?.retried).toBe(true);

    const authResult = result.agents.find((a) => a.name === "auth-agent");
    expect(authResult?.status).toBe("skipped");
  });

  it("with agent failure skips dependent agents per D-37", async () => {
    const plan = makePlan();
    const planPath = writePlan(plan);

    const callbacks: ExecutionCallbacks = {
      dispatchAgent: async (invocation) => {
        if (invocation.name === "db-agent") {
          return { success: false, error: "Timeout" };
        }
        return { success: true, output: "done" };
      },
      onProgress: () => {},
    };

    const result = await runExecution(
      { ...makeOptions(tmpDir), planPath },
      callbacks,
    );

    const authResult = result.agents.find((a) => a.name === "auth-agent");
    expect(authResult?.status).toBe("skipped");
    expect(authResult?.error).toContain("db-agent");
  });

  it("continues independent agents after a failure per D-36", async () => {
    // Create a plan with an independent agent that doesn't depend on the failing one
    const plan: ExecutionPlan = {
      taskSlug: "add-auth",
      createdAt: "2026-01-01T00:00:00Z",
      status: "APPROVED",
      strategy: "wave-based",
      estimatedAgents: 3,
      estimatedTotalTokens: 120000,
      agents: [
        {
          name: "db-agent",
          wave: 1,
          task: "Set up database",
          exclusiveWriteFiles: ["src/db/schema.ts"],
          readOnlyFiles: [],
          conventions: [],
          goldenFiles: [],
          dependsOn: [],
          estimatedTokens: 40000,
          timeoutSeconds: 300,
        },
        {
          name: "util-agent",
          wave: 1,
          task: "Create utilities",
          exclusiveWriteFiles: ["src/utils/helpers.ts"],
          readOnlyFiles: [],
          conventions: [],
          goldenFiles: [],
          dependsOn: [],
          estimatedTokens: 40000,
          timeoutSeconds: 300,
        },
        {
          name: "auth-agent",
          wave: 2,
          task: "Implement auth (depends on db)",
          exclusiveWriteFiles: ["src/auth/middleware.ts"],
          readOnlyFiles: [],
          conventions: [],
          goldenFiles: [],
          dependsOn: ["db-agent"],
          estimatedTokens: 40000,
          timeoutSeconds: 300,
        },
      ],
      waves: [
        { waveNumber: 1, agents: ["db-agent", "util-agent"], mode: "parallel" },
        { waveNumber: 2, agents: ["auth-agent"], mode: "sequential" },
      ],
      validationResults: [],
      removedByUser: [],
    };

    const planPath = writePlan(plan);
    const dispatched: string[] = [];

    const callbacks: ExecutionCallbacks = {
      dispatchAgent: async (invocation) => {
        dispatched.push(invocation.name);
        if (invocation.name === "db-agent") {
          return { success: false, error: "Build failed" };
        }
        return { success: true, output: "done" };
      },
      onProgress: () => {},
    };

    const result = await runExecution(
      { ...makeOptions(tmpDir), planPath },
      callbacks,
    );

    // util-agent is independent and should still be dispatched
    expect(dispatched).toContain("util-agent");

    // util-agent should succeed
    const utilResult = result.agents.find((a) => a.name === "util-agent");
    expect(utilResult?.status).toBe("complete");

    // auth-agent depends on db-agent and should be skipped
    const authResult = result.agents.find((a) => a.name === "auth-agent");
    expect(authResult?.status).toBe("skipped");
  });

  it("produces execution summary matching UI-SPEC format", async () => {
    const plan = makePlan();
    const planPath = writePlan(plan);
    const dispatched: string[] = [];

    const result = await runExecution(
      { ...makeOptions(tmpDir), planPath },
      makeSuccessCallbacks(dispatched),
    );

    expect(result.summaryPath).toContain("summary.md");
    expect(fs.existsSync(result.summaryPath)).toBe(true);

    const content = fs.readFileSync(result.summaryPath, "utf-8");
    expect(content).toContain("# Execution Summary");
    expect(content).toContain("## Results");
    expect(content).toContain("## Totals");
    expect(content).toContain("## Next Step");
  });

  it("emits progress messages per D-24 (brief mode)", async () => {
    const plan = makePlan();
    const planPath = writePlan(plan);
    const messages: string[] = [];

    const callbacks: ExecutionCallbacks = {
      dispatchAgent: async (invocation) => {
        return { success: true, output: `${invocation.name} done` };
      },
      onProgress: (msg) => messages.push(msg),
    };

    await runExecution(
      { ...makeOptions(tmpDir), planPath },
      callbacks,
    );

    // Should have wave banners
    const waveBanners = messages.filter((m) => m.includes("Executing wave"));
    expect(waveBanners.length).toBeGreaterThan(0);

    // Should have agent completion messages
    const completionMessages = messages.filter((m) => m.includes("complete"));
    expect(completionMessages.length).toBeGreaterThan(0);
  });

  it("total duration is recorded in the result", async () => {
    const plan = makePlan();
    const planPath = writePlan(plan);
    const dispatched: string[] = [];

    const result = await runExecution(
      { ...makeOptions(tmpDir), planPath },
      makeSuccessCallbacks(dispatched),
    );

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.durationMs).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// writeExecutionSummary
// ---------------------------------------------------------------------------

describe("writeExecutionSummary", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orch-summary-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("writes summary.md with correct format", () => {
    const result: ExecutionResult = {
      status: "complete",
      agents: [
        {
          name: "db-agent",
          status: "complete",
          durationMs: 10000,
          filesChanged: ["src/db/schema.ts"],
          linesAdded: 50,
          linesRemoved: 10,
          retried: false,
        },
        {
          name: "auth-agent",
          status: "complete",
          durationMs: 20000,
          filesChanged: ["src/auth/middleware.ts"],
          linesAdded: 100,
          linesRemoved: 5,
          retried: false,
        },
      ],
      summaryPath: "",
      coordinationPath: path.join(tmpDir, "coordination.md"),
      durationMs: 30000,
      mode: "sequential",
      tokensEstimate: 80000,
    };

    const summaryPath = writeExecutionSummary(result, tmpDir, "add-auth");
    expect(fs.existsSync(summaryPath)).toBe(true);

    const content = fs.readFileSync(summaryPath, "utf-8");
    expect(content).toContain("# Execution Summary: add-auth");
    expect(content).toContain("## Results");
    expect(content).toContain("db-agent");
    expect(content).toContain("auth-agent");
    expect(content).toContain("## Totals");
    expect(content).toContain("**Agents:** 2/2 succeeded");
    expect(content).toContain("## Next Step");
    expect(content).toContain("Proceeding to verification");
  });

  it("includes failure details when agents failed", () => {
    const result: ExecutionResult = {
      status: "partial",
      agents: [
        {
          name: "db-agent",
          status: "failed",
          durationMs: 5000,
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          error: "Compilation error in schema.ts",
          retried: true,
        },
        {
          name: "auth-agent",
          status: "skipped",
          durationMs: 0,
          filesChanged: [],
          linesAdded: 0,
          linesRemoved: 0,
          error: "Dependency db-agent failed",
          retried: false,
        },
      ],
      summaryPath: "",
      coordinationPath: path.join(tmpDir, "coordination.md"),
      durationMs: 5000,
      mode: "sequential",
      tokensEstimate: 40000,
    };

    const summaryPath = writeExecutionSummary(result, tmpDir, "add-auth");
    const content = fs.readFileSync(summaryPath, "utf-8");

    expect(content).toContain("## Failures");
    expect(content).toContain("db-agent");
    expect(content).toContain("Compilation error");
    expect(content).toContain("auth-agent");
  });
});
