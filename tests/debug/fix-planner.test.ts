// ---------------------------------------------------------------------------
// Tests for debug fix planner
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import type { EvalFinding } from "../../src/eval/types.js";
import {
  createFixPlan,
  isDesignDecision,
  buildFixPrompt,
} from "../../src/debug/fix-planner.js";
import type { FixTask } from "../../src/debug/types.js";

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

// ---------------------------------------------------------------------------
// createFixPlan
// ---------------------------------------------------------------------------

describe("createFixPlan", () => {
  it("groups findings by file and creates one AgentAssignment per file group", () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", file: "src/a.ts", line: 5 }),
      makeFinding({ id: "f2", file: "src/b.ts", line: 10 }),
      makeFinding({ id: "f3", file: "src/a.ts", line: 20 }),
    ];

    const plan = createFixPlan(findings, "my-task", "/scope.md");

    // Two distinct files -> two agents
    expect(plan.agents.length).toBe(2);

    // Agent for src/a.ts should have 2 findings
    const agentA = plan.agents.find((a) =>
      a.exclusiveWriteFiles.includes("src/a.ts"),
    );
    expect(agentA).toBeDefined();
    // task description should mention both findings
    expect(agentA!.task).toContain("2 finding(s)");

    // Agent for src/b.ts should have 1 finding
    const agentB = plan.agents.find((a) =>
      a.exclusiveWriteFiles.includes("src/b.ts"),
    );
    expect(agentB).toBeDefined();
    expect(agentB!.task).toContain("1 finding(s)");
  });

  it("caps agents at 3 per plan (per D-11)", () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", file: "src/a.ts" }),
      makeFinding({ id: "f2", file: "src/b.ts" }),
      makeFinding({ id: "f3", file: "src/c.ts" }),
      makeFinding({ id: "f4", file: "src/d.ts" }),
      makeFinding({ id: "f5", file: "src/e.ts" }),
    ];

    const plan = createFixPlan(findings, "my-task", "/scope.md");

    expect(plan.agents.length).toBeLessThanOrEqual(3);
    expect(plan.estimatedAgents).toBeLessThanOrEqual(3);
  });

  it("sets strategy to sequential for fix plans", () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", file: "src/a.ts" }),
    ];

    const plan = createFixPlan(findings, "my-task", "/scope.md");

    expect(plan.strategy).toBe("sequential");
  });

  it("includes goldenFiles from findings with goldenFileRef", () => {
    const findings: EvalFinding[] = [
      makeFinding({
        id: "f1",
        file: "src/a.ts",
        goldenFileRef: "src/golden.ts",
      }),
      makeFinding({
        id: "f2",
        file: "src/a.ts",
      }),
    ];

    const plan = createFixPlan(findings, "my-task", "/scope.md");
    const agent = plan.agents[0];

    expect(agent.goldenFiles.length).toBe(1);
    expect(agent.goldenFiles[0].path).toBe("src/golden.ts");
    expect(agent.goldenFiles[0].lines).toBe("1-50");
  });

  it("returns ExecutionPlan with correct shape", () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", file: "src/a.ts" }),
    ];

    const plan = createFixPlan(findings, "my-task", "/scope.md");

    expect(plan.taskSlug).toBe("my-task-debug");
    expect(plan.status).toBe("APPROVED");
    expect(plan.strategy).toBe("sequential");
    expect(plan.waves.length).toBe(1);
    expect(plan.waves[0].waveNumber).toBe(1);
    expect(plan.waves[0].mode).toBe("sequential");
    expect(plan.validationResults).toEqual([]);
    expect(plan.removedByUser).toEqual([]);
    expect(plan.createdAt).toBeTruthy();
  });

  it("agent task description includes finding descriptions", () => {
    const findings: EvalFinding[] = [
      makeFinding({
        id: "f1",
        file: "src/a.ts",
        description: "Missing null check on config.prop",
      }),
    ];

    const plan = createFixPlan(findings, "my-task", "/scope.md");
    const agent = plan.agents[0];

    expect(agent.task).toContain("Missing null check on config.prop");
  });

  it("sets exclusiveWriteFiles to the finding's file", () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", file: "src/special/handler.ts" }),
    ];

    const plan = createFixPlan(findings, "my-task", "/scope.md");
    const agent = plan.agents[0];

    expect(agent.exclusiveWriteFiles).toEqual(["src/special/handler.ts"]);
  });
});

// ---------------------------------------------------------------------------
// isDesignDecision
// ---------------------------------------------------------------------------

describe("isDesignDecision", () => {
  it("returns true for findings with category design_decision", () => {
    const finding = makeFinding({ category: "design_decision" });
    expect(isDesignDecision(finding)).toBe(true);
  });

  it("returns false for missing_implementation", () => {
    const finding = makeFinding({ category: "missing_implementation" });
    expect(isDesignDecision(finding)).toBe(false);
  });

  it("returns false for incorrect_implementation", () => {
    const finding = makeFinding({ category: "incorrect_implementation" });
    expect(isDesignDecision(finding)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildFixPrompt
// ---------------------------------------------------------------------------

describe("buildFixPrompt", () => {
  it("includes specific findings with evidence and golden file excerpts", () => {
    const fixTask: FixTask = {
      file: "src/handler.ts",
      findings: [
        makeFinding({
          id: "f1",
          file: "src/handler.ts",
          description: "Missing null check",
          evidence: "Line 10: const val = obj.prop;",
        }),
      ],
      goldenFileExcerpts: new Map([
        ["src/golden.ts", "export function example() { ... }"],
      ]),
    };

    const prompt = buildFixPrompt(fixTask, "/path/to/scope.md");

    expect(prompt).toContain("Fix Agent: Targeted Repair");
    expect(prompt).toContain("src/handler.ts");
    expect(prompt).toContain("Missing null check");
    expect(prompt).toContain("Line 10: const val = obj.prop;");
    expect(prompt).toContain("src/golden.ts");
    expect(prompt).toContain("Follow the pattern in");
  });

  it("includes scope contract path by reference", () => {
    const fixTask: FixTask = {
      file: "src/handler.ts",
      findings: [makeFinding()],
      goldenFileExcerpts: new Map(),
    };

    const prompt = buildFixPrompt(fixTask, "/path/to/scope-contract.md");

    expect(prompt).toContain("/path/to/scope-contract.md");
    expect(prompt).toContain("Read:");
  });
});
