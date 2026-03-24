import { describe, it, expect } from "vitest";
import {
  buildWaveSchedule,
  validateFileOverlap,
  validateDependencyOrdering,
  validateScopeCoverage,
} from "../../src/execution/wave-scheduler.js";
import type { AgentAssignment } from "../../src/execution/wave-scheduler.js";

// ---------------------------------------------------------------------------
// Helper: create an AgentAssignment with sensible defaults
// ---------------------------------------------------------------------------
function makeAgent(
  overrides: Partial<AgentAssignment> & { name: string },
): AgentAssignment {
  return {
    wave: 0,
    task: overrides.name + " task",
    exclusiveWriteFiles: [],
    readOnlyFiles: [],
    conventions: [],
    goldenFiles: [],
    dependsOn: [],
    estimatedTokens: 50000,
    timeoutSeconds: 300,
    ...overrides,
  };
}

describe("buildWaveSchedule", () => {
  it("puts all independent agents in wave 1 as parallel", () => {
    const agents = [
      makeAgent({ name: "agent-a", exclusiveWriteFiles: ["src/a.ts"] }),
      makeAgent({ name: "agent-b", exclusiveWriteFiles: ["src/b.ts"] }),
      makeAgent({ name: "agent-c", exclusiveWriteFiles: ["src/c.ts"] }),
    ];

    const result = buildWaveSchedule(agents);

    expect(result.waves).toHaveLength(1);
    expect(result.waves[0].waveNumber).toBe(1);
    expect(result.waves[0].agents).toEqual(
      expect.arrayContaining(["agent-a", "agent-b", "agent-c"]),
    );
    expect(result.waves[0].mode).toBe("parallel");
    expect(result.strategy).toBe("parallel");
  });

  it("creates sequential waves for A->B->C chain", () => {
    const agents = [
      makeAgent({ name: "agent-a" }),
      makeAgent({ name: "agent-b", dependsOn: ["agent-a"] }),
      makeAgent({ name: "agent-c", dependsOn: ["agent-b"] }),
    ];

    const result = buildWaveSchedule(agents);

    expect(result.waves).toHaveLength(3);
    expect(result.waves[0].agents).toEqual(["agent-a"]);
    expect(result.waves[1].agents).toEqual(["agent-b"]);
    expect(result.waves[2].agents).toEqual(["agent-c"]);
    expect(result.strategy).toBe("sequential");
  });

  it("handles mixed deps: A,B independent + C depends on A => wave 1 [A,B], wave 2 [C]", () => {
    const agents = [
      makeAgent({
        name: "agent-a",
        exclusiveWriteFiles: ["src/a.ts"],
      }),
      makeAgent({
        name: "agent-b",
        exclusiveWriteFiles: ["src/b.ts"],
      }),
      makeAgent({
        name: "agent-c",
        dependsOn: ["agent-a"],
        exclusiveWriteFiles: ["src/c.ts"],
      }),
    ];

    const result = buildWaveSchedule(agents);

    expect(result.waves).toHaveLength(2);
    expect(result.waves[0].agents).toEqual(
      expect.arrayContaining(["agent-a", "agent-b"]),
    );
    expect(result.waves[0].mode).toBe("parallel");
    expect(result.waves[1].agents).toEqual(["agent-c"]);
    expect(result.strategy).toBe("wave-based");
  });

  it("splits agents with overlapping files in same wave into sub-waves", () => {
    const agents = [
      makeAgent({
        name: "agent-a",
        exclusiveWriteFiles: ["src/shared.ts", "src/a.ts"],
      }),
      makeAgent({
        name: "agent-b",
        exclusiveWriteFiles: ["src/shared.ts", "src/b.ts"],
      }),
    ];

    const result = buildWaveSchedule(agents);

    // Should be split into 2 waves because of overlap
    expect(result.waves.length).toBeGreaterThanOrEqual(2);
    // Each wave should have exactly 1 agent (since they overlap)
    for (const wave of result.waves) {
      if (wave.agents.includes("agent-a") && wave.agents.includes("agent-b")) {
        // They should NOT be in the same wave
        expect(true).toBe(false); // fail if both in same wave
      }
    }
  });

  it("determines strategy 'sequential' when all waves have 1 agent", () => {
    const agents = [
      makeAgent({ name: "agent-a" }),
      makeAgent({ name: "agent-b", dependsOn: ["agent-a"] }),
    ];

    const result = buildWaveSchedule(agents);
    expect(result.strategy).toBe("sequential");
  });

  it("determines strategy 'parallel' when single wave with multiple agents", () => {
    const agents = [
      makeAgent({ name: "agent-a", exclusiveWriteFiles: ["src/a.ts"] }),
      makeAgent({ name: "agent-b", exclusiveWriteFiles: ["src/b.ts"] }),
    ];

    const result = buildWaveSchedule(agents);
    expect(result.strategy).toBe("parallel");
  });

  it("determines strategy 'wave-based' for mixed parallel+sequential waves", () => {
    const agents = [
      makeAgent({
        name: "agent-a",
        exclusiveWriteFiles: ["src/a.ts"],
      }),
      makeAgent({
        name: "agent-b",
        exclusiveWriteFiles: ["src/b.ts"],
      }),
      makeAgent({
        name: "agent-c",
        dependsOn: ["agent-a"],
        exclusiveWriteFiles: ["src/c.ts"],
      }),
    ];

    const result = buildWaveSchedule(agents);
    expect(result.strategy).toBe("wave-based");
  });

  it("throws on circular dependencies", () => {
    const agents = [
      makeAgent({ name: "agent-a", dependsOn: ["agent-b"] }),
      makeAgent({ name: "agent-b", dependsOn: ["agent-a"] }),
    ];

    expect(() => buildWaveSchedule(agents)).toThrow(
      /[Cc]ircular dependency/,
    );
  });

  it("handles diamond dependency: A -> B,C -> D", () => {
    const agents = [
      makeAgent({ name: "agent-a", exclusiveWriteFiles: ["src/a.ts"] }),
      makeAgent({
        name: "agent-b",
        dependsOn: ["agent-a"],
        exclusiveWriteFiles: ["src/b.ts"],
      }),
      makeAgent({
        name: "agent-c",
        dependsOn: ["agent-a"],
        exclusiveWriteFiles: ["src/c.ts"],
      }),
      makeAgent({
        name: "agent-d",
        dependsOn: ["agent-b", "agent-c"],
        exclusiveWriteFiles: ["src/d.ts"],
      }),
    ];

    const result = buildWaveSchedule(agents);

    // Wave 1: A, Wave 2: B+C (parallel), Wave 3: D
    expect(result.waves).toHaveLength(3);
    expect(result.waves[0].agents).toEqual(["agent-a"]);
    expect(result.waves[1].agents).toEqual(
      expect.arrayContaining(["agent-b", "agent-c"]),
    );
    expect(result.waves[1].mode).toBe("parallel");
    expect(result.waves[2].agents).toEqual(["agent-d"]);
    expect(result.strategy).toBe("wave-based");
  });
});

describe("validateFileOverlap", () => {
  it("returns PASS when no overlap exists in any parallel wave", () => {
    const agents = [
      makeAgent({
        name: "agent-a",
        exclusiveWriteFiles: ["src/a.ts"],
      }),
      makeAgent({
        name: "agent-b",
        exclusiveWriteFiles: ["src/b.ts"],
      }),
    ];
    const waves = [
      { waveNumber: 1, agents: ["agent-a", "agent-b"], mode: "parallel" as const },
    ];

    const checks = validateFileOverlap(agents, waves);
    expect(checks).toHaveLength(1);
    expect(checks[0].status).toBe("PASS");
  });

  it("returns FAIL with detail listing overlapping files and agent names", () => {
    const agents = [
      makeAgent({
        name: "agent-a",
        exclusiveWriteFiles: ["src/shared.ts", "src/a.ts"],
      }),
      makeAgent({
        name: "agent-b",
        exclusiveWriteFiles: ["src/shared.ts", "src/b.ts"],
      }),
    ];
    const waves = [
      { waveNumber: 1, agents: ["agent-a", "agent-b"], mode: "parallel" as const },
    ];

    const checks = validateFileOverlap(agents, waves);
    const failCheck = checks.find((c) => c.status === "FAIL");
    expect(failCheck).toBeDefined();
    expect(failCheck!.detail).toContain("agent-a");
    expect(failCheck!.detail).toContain("agent-b");
    expect(failCheck!.detail).toContain("src/shared.ts");
  });

  it("does not check sequential waves for overlap", () => {
    const agents = [
      makeAgent({
        name: "agent-a",
        exclusiveWriteFiles: ["src/shared.ts"],
      }),
      makeAgent({
        name: "agent-b",
        exclusiveWriteFiles: ["src/shared.ts"],
      }),
    ];
    const waves = [
      { waveNumber: 1, agents: ["agent-a"], mode: "sequential" as const },
      { waveNumber: 2, agents: ["agent-b"], mode: "sequential" as const },
    ];

    const checks = validateFileOverlap(agents, waves);
    expect(checks.every((c) => c.status === "PASS")).toBe(true);
  });
});

describe("validateDependencyOrdering", () => {
  it("returns PASS when all dependencies are in earlier waves", () => {
    const agents = [
      makeAgent({ name: "agent-a" }),
      makeAgent({ name: "agent-b", dependsOn: ["agent-a"] }),
    ];
    const waves = [
      { waveNumber: 1, agents: ["agent-a"], mode: "sequential" as const },
      { waveNumber: 2, agents: ["agent-b"], mode: "sequential" as const },
    ];

    const checks = validateDependencyOrdering(agents, waves);
    expect(checks.every((c) => c.status === "PASS")).toBe(true);
  });

  it("returns FAIL when agent depends on agent in same wave", () => {
    const agents = [
      makeAgent({ name: "agent-a" }),
      makeAgent({ name: "agent-b", dependsOn: ["agent-a"] }),
    ];
    const waves = [
      {
        waveNumber: 1,
        agents: ["agent-a", "agent-b"],
        mode: "parallel" as const,
      },
    ];

    const checks = validateDependencyOrdering(agents, waves);
    const failCheck = checks.find((c) => c.status === "FAIL");
    expect(failCheck).toBeDefined();
    expect(failCheck!.detail).toContain("agent-b");
    expect(failCheck!.detail).toContain("agent-a");
  });

  it("returns FAIL for circular dependencies", () => {
    const agents = [
      makeAgent({ name: "agent-a", dependsOn: ["agent-b"] }),
      makeAgent({ name: "agent-b", dependsOn: ["agent-a"] }),
    ];
    const waves = [
      {
        waveNumber: 1,
        agents: ["agent-a", "agent-b"],
        mode: "parallel" as const,
      },
    ];

    const checks = validateDependencyOrdering(agents, waves);
    const failCheck = checks.find((c) => c.status === "FAIL");
    expect(failCheck).toBeDefined();
  });
});

describe("validateScopeCoverage", () => {
  it("returns PASS when all in-scope items are covered", () => {
    const agents = [
      makeAgent({
        name: "agent-a",
        task: "Implement authentication",
        exclusiveWriteFiles: ["src/auth.ts"],
      }),
      makeAgent({
        name: "agent-b",
        task: "Add user API endpoint",
        exclusiveWriteFiles: ["src/api/users.ts"],
      }),
    ];

    const checks = validateScopeCoverage(agents, [
      "authentication",
      "user API",
    ]);
    expect(checks.every((c) => c.status === "PASS")).toBe(true);
  });

  it("returns WARNING for uncovered in-scope items", () => {
    const agents = [
      makeAgent({
        name: "agent-a",
        task: "Implement authentication",
        exclusiveWriteFiles: ["src/auth.ts"],
      }),
    ];

    const checks = validateScopeCoverage(agents, [
      "authentication",
      "database migration",
    ]);
    const warning = checks.find((c) => c.status === "WARNING");
    expect(warning).toBeDefined();
    expect(warning!.detail).toContain("database migration");
  });

  it("returns PASS with empty in-scope list", () => {
    const agents = [makeAgent({ name: "agent-a" })];

    const checks = validateScopeCoverage(agents, []);
    expect(checks.every((c) => c.status === "PASS")).toBe(true);
  });
});
