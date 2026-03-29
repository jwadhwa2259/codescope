// ---------------------------------------------------------------------------
// Tests for src/execution/reconciliation.ts
// ---------------------------------------------------------------------------
// Per 13-01-PLAN.md Task 2 behavior specifications.
// Pure function testing for computeReconciliation, fs.mkdtempSync for report.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type { AgentAssignment } from "../../src/orient/types.js";
import type { AgentResult } from "../../src/execution/types.js";
import {
  computeReconciliation,
  generateReconciliationReport,
  type ReconciliationData,
} from "../../src/execution/reconciliation.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAgent(overrides: Partial<AgentAssignment> = {}): AgentAssignment {
  return {
    name: "agent-1",
    wave: 1,
    task: "test task",
    exclusiveWriteFiles: [],
    readOnlyFiles: [],
    conventions: [],
    goldenFiles: [],
    dependsOn: [],
    estimatedTokens: 5000,
    timeoutSeconds: 120,
    ...overrides,
  };
}

function makeResult(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    name: "agent-1",
    status: "complete",
    durationMs: 1000,
    filesChanged: [],
    linesAdded: 10,
    linesRemoved: 5,
    retried: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// computeReconciliation
// ---------------------------------------------------------------------------

describe("computeReconciliation", () => {
  it("identifies unexpected and missed files via set difference", () => {
    const agents = [
      makeAgent({ name: "a1", exclusiveWriteFiles: ["a.ts", "b.ts"] }),
    ];
    const results = [
      makeResult({ name: "a1", filesChanged: ["a.ts", "c.ts"] }),
    ];

    const data = computeReconciliation(agents, results, ["a.ts", "c.ts"]);

    expect(data.unexpected).toEqual(["c.ts"]);
    expect(data.missed).toEqual(["b.ts"]);
  });

  it("returns empty unexpected and missed when planned equals actual", () => {
    const agents = [
      makeAgent({ name: "a1", exclusiveWriteFiles: ["a.ts"] }),
    ];
    const results = [
      makeResult({ name: "a1", filesChanged: ["a.ts"] }),
    ];

    const data = computeReconciliation(agents, results, ["a.ts"]);

    expect(data.unexpected).toEqual([]);
    expect(data.missed).toEqual([]);
  });

  it("returns unexpected when planned is empty but actual has files", () => {
    const agents = [
      makeAgent({ name: "a1", exclusiveWriteFiles: [] }),
    ];
    const results = [
      makeResult({ name: "a1", filesChanged: ["x.ts"] }),
    ];

    const data = computeReconciliation(agents, results, ["x.ts"]);

    expect(data.unexpected).toEqual(["x.ts"]);
    expect(data.missed).toEqual([]);
  });

  it("computes correct planned and actual counts", () => {
    const agents = [
      makeAgent({ name: "a1", exclusiveWriteFiles: ["a.ts", "b.ts"] }),
      makeAgent({ name: "a2", exclusiveWriteFiles: ["c.ts"] }),
    ];
    const results = [
      makeResult({ name: "a1", filesChanged: ["a.ts"] }),
      makeResult({ name: "a2", filesChanged: ["c.ts", "d.ts"] }),
    ];

    const data = computeReconciliation(agents, results, ["a.ts", "c.ts", "d.ts"]);

    expect(data.plannedCount).toBe(3); // a.ts, b.ts, c.ts
    expect(data.actualCount).toBe(3); // a.ts, c.ts, d.ts
  });

  it("computes per-agent breakdown correctly", () => {
    const agents = [
      makeAgent({ name: "auth-agent", exclusiveWriteFiles: ["auth.ts", "types.ts"] }),
      makeAgent({ name: "db-agent", exclusiveWriteFiles: ["db.ts"] }),
    ];
    const results = [
      makeResult({ name: "auth-agent", filesChanged: ["auth.ts", "extra.ts"] }),
      makeResult({ name: "db-agent", filesChanged: ["db.ts"] }),
    ];

    const data = computeReconciliation(agents, results, ["auth.ts", "extra.ts", "db.ts"]);

    expect(data.perAgent).toHaveLength(2);

    const authAgent = data.perAgent.find((a) => a.name === "auth-agent")!;
    expect(authAgent.planned).toEqual(["auth.ts", "types.ts"]);
    expect(authAgent.actual).toEqual(["auth.ts", "extra.ts"]);
    expect(authAgent.unexpected).toEqual(["extra.ts"]);
    expect(authAgent.missed).toEqual(["types.ts"]);

    const dbAgent = data.perAgent.find((a) => a.name === "db-agent")!;
    expect(dbAgent.planned).toEqual(["db.ts"]);
    expect(dbAgent.actual).toEqual(["db.ts"]);
    expect(dbAgent.unexpected).toEqual([]);
    expect(dbAgent.missed).toEqual([]);
  });

  it("handles agents with no matching results", () => {
    const agents = [
      makeAgent({ name: "missing-agent", exclusiveWriteFiles: ["a.ts"] }),
    ];
    const results: AgentResult[] = []; // no results for this agent

    const data = computeReconciliation(agents, results, []);

    expect(data.perAgent[0].actual).toEqual([]);
    expect(data.perAgent[0].missed).toEqual(["a.ts"]);
  });
});

// ---------------------------------------------------------------------------
// generateReconciliationReport
// ---------------------------------------------------------------------------

describe("generateReconciliationReport", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "reconciliation-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("generates markdown with Summary section", () => {
    const data: ReconciliationData = {
      baselineCommit: "abc1234",
      plannedCount: 3,
      actualCount: 3,
      unexpected: [],
      missed: [],
      perAgent: [],
    };

    const reportPath = generateReconciliationReport(data, tmpDir);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("## Summary");
    expect(content).toContain("abc1234");
    expect(content).toContain("**Planned files:** 3");
    expect(content).toContain("**Actual files changed:** 3");
  });

  it("generates markdown with Unexpected Modifications section", () => {
    const data: ReconciliationData = {
      baselineCommit: "abc1234",
      plannedCount: 2,
      actualCount: 3,
      unexpected: ["extra.ts"],
      missed: [],
      perAgent: [],
    };

    const reportPath = generateReconciliationReport(data, tmpDir);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("## Unexpected Modifications");
    expect(content).toContain("extra.ts");
    expect(content).toContain("unexpected");
  });

  it("generates markdown with Missed Files section", () => {
    const data: ReconciliationData = {
      baselineCommit: "abc1234",
      plannedCount: 3,
      actualCount: 2,
      unexpected: [],
      missed: ["missing.ts"],
      perAgent: [],
    };

    const reportPath = generateReconciliationReport(data, tmpDir);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("## Missed Files");
    expect(content).toContain("missing.ts");
    expect(content).toContain("missed");
  });

  it("generates markdown with Per-Agent Breakdown section", () => {
    const data: ReconciliationData = {
      baselineCommit: "abc1234",
      plannedCount: 2,
      actualCount: 2,
      unexpected: [],
      missed: [],
      perAgent: [
        {
          name: "auth-agent",
          planned: ["auth.ts"],
          actual: ["auth.ts"],
          unexpected: [],
          missed: [],
        },
        {
          name: "db-agent",
          planned: ["db.ts"],
          actual: ["db.ts", "extra.ts"],
          unexpected: ["extra.ts"],
          missed: [],
        },
      ],
    };

    const reportPath = generateReconciliationReport(data, tmpDir);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("## Per-Agent Breakdown");
    expect(content).toContain("### auth-agent");
    expect(content).toContain("### db-agent");
    expect(content).toContain("**Planned:**");
    expect(content).toContain("**Actual:**");
  });

  it("shows 'None' messages when no unexpected or missed files", () => {
    const data: ReconciliationData = {
      baselineCommit: "abc1234",
      plannedCount: 1,
      actualCount: 1,
      unexpected: [],
      missed: [],
      perAgent: [],
    };

    const reportPath = generateReconciliationReport(data, tmpDir);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("None -- all changes were within planned scope.");
    expect(content).toContain("None -- all planned files were modified.");
  });

  it("writes report to reconciliation.md in execution directory", () => {
    const data: ReconciliationData = {
      baselineCommit: "abc1234",
      plannedCount: 0,
      actualCount: 0,
      unexpected: [],
      missed: [],
      perAgent: [],
    };

    const reportPath = generateReconciliationReport(data, tmpDir);

    expect(reportPath).toBe(path.join(tmpDir, "reconciliation.md"));
    expect(fs.existsSync(reportPath)).toBe(true);
  });
});
