import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  buildAgentPrompt,
  buildAgentInvocation,
  parseAgentChanges,
  writeChangeReport,
} from "../../src/execution/agent-spawner.js";
import type {
  AgentPromptContext,
  AgentInvocation,
} from "../../src/execution/agent-spawner.js";
import type { AgentAssignment } from "../../src/orient/types.js";
import type { AgentResult } from "../../src/execution/types.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAssignment(overrides?: Partial<AgentAssignment>): AgentAssignment {
  return {
    name: "auth-agent",
    wave: 1,
    task: "Implement JWT authentication middleware",
    exclusiveWriteFiles: ["src/auth/middleware.ts", "src/auth/jwt.ts"],
    readOnlyFiles: ["src/config/loader.ts", "src/types/user.ts"],
    conventions: [
      "Use async/await for all async operations",
      "Import types with `import type`",
    ],
    goldenFiles: [
      { path: "src/auth/existing-auth.ts", lines: "10-25" },
      { path: "src/middleware/base.ts", lines: "1-15" },
    ],
    dependsOn: [],
    estimatedTokens: 50000,
    timeoutSeconds: 300,
    ...overrides,
  };
}

function makeContext(
  overrides?: Partial<AgentPromptContext>,
): AgentPromptContext {
  return {
    projectRoot: "/project",
    taskSlug: "add-auth",
    scopeContractPath: "/project/.claude/codescope/orient/add-auth/scope-contract.md",
    planPath: "/project/.claude/codescope/orient/add-auth/plan.md",
    researchPath: "/project/.claude/codescope/orient/add-auth/research.md",
    coordinationPath: "/project/.claude/codescope/orient/add-auth/execution/coordination.md",
    executionDir: "/project/.claude/codescope/orient/add-auth/execution",
    executionMode: "sequential",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildAgentPrompt
// ---------------------------------------------------------------------------

describe("buildAgentPrompt", () => {
  it("includes the agent's specific task description", () => {
    const prompt = buildAgentPrompt(makeAssignment(), makeContext());
    expect(prompt).toContain("Implement JWT authentication middleware");
  });

  it("includes only conventions relevant to the agent's file scope", () => {
    const prompt = buildAgentPrompt(makeAssignment(), makeContext());
    expect(prompt).toContain("Use async/await for all async operations");
    expect(prompt).toContain("Import types with `import type`");
  });

  it("includes golden file references with line ranges (not full content)", () => {
    const prompt = buildAgentPrompt(makeAssignment(), makeContext());
    expect(prompt).toContain("src/auth/existing-auth.ts");
    expect(prompt).toContain("lines 10-25");
    expect(prompt).toContain("src/middleware/base.ts");
    expect(prompt).toContain("lines 1-15");
  });

  it("includes coordination entries from completed dependency agents (progressive context per D-34)", () => {
    // Create a real coordination file with entries
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-prompt-test-"));
    const coordPath = path.join(tmpDir, "coordination.md");
    const coordContent = [
      "# Coordination Log: add-auth",
      "",
      "**Started:** 2026-01-01T00:00:00Z",
      "**Mode:** sequential",
      "",
      "## Log",
      "",
      "| Timestamp | Agent | Signal | Files | Detail |",
      "|-----------|-------|--------|-------|--------|",
      "| 2026-01-01T00:01:00Z | db-agent | `done` | `src/db/schema.ts` | +50/-10 lines |",
    ].join("\n");
    fs.writeFileSync(coordPath, coordContent, "utf-8");

    const assignment = makeAssignment({ dependsOn: ["db-agent"] });
    const context = makeContext({ coordinationPath: coordPath });

    const prompt = buildAgentPrompt(assignment, context);
    expect(prompt).toContain("db-agent");
    expect(prompt).toContain("Previous agents completed");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("includes research reference by path (not embedded)", () => {
    const prompt = buildAgentPrompt(
      makeAssignment(),
      makeContext({ researchPath: "/project/.claude/codescope/orient/add-auth/research.md" }),
    );
    expect(prompt).toContain("research");
    expect(prompt).toContain("research.md");
  });

  it("includes file paths for scope contract and plan by reference", () => {
    const prompt = buildAgentPrompt(makeAssignment(), makeContext());
    expect(prompt).toContain("scope-contract.md");
    expect(prompt).toContain("plan.md");
  });

  it("includes MCP tool access instructions per D-33", () => {
    const prompt = buildAgentPrompt(makeAssignment(), makeContext());
    expect(prompt).toContain("CodeScope MCP tools");
    expect(prompt).toContain("codescope_blast_radius");
    expect(prompt).toContain("codescope_conventions");
    expect(prompt).toContain("codescope_recall");
    expect(prompt).toContain("codescope_search");
  });

  it("includes SendMessage protocol when executionMode is 'parallel' (EXEC-08)", () => {
    const prompt = buildAgentPrompt(
      makeAssignment(),
      makeContext({ executionMode: "parallel" }),
    );
    expect(prompt).toContain("SendMessage");
    expect(prompt).toContain("HandoffSignal");
    expect(prompt).toContain("DiscoverySignal");
    expect(prompt).toContain('"ready"');
    expect(prompt).toContain('"done"');
    expect(prompt).toContain('"blocked"');
    expect(prompt).toContain('"discovery"');
  });

  it("includes SendMessage protocol when executionMode is 'wave-based'", () => {
    const prompt = buildAgentPrompt(
      makeAssignment(),
      makeContext({ executionMode: "wave-based" }),
    );
    expect(prompt).toContain("SendMessage");
    expect(prompt).toContain("HandoffSignal");
  });

  it("does NOT include SendMessage protocol when executionMode is 'sequential'", () => {
    const prompt = buildAgentPrompt(
      makeAssignment(),
      makeContext({ executionMode: "sequential" }),
    );
    expect(prompt).not.toContain("SendMessage");
    expect(prompt).not.toContain("HandoffSignal");
    expect(prompt).not.toContain("DiscoverySignal");
  });

  it("includes exclusive write access file boundaries", () => {
    const prompt = buildAgentPrompt(makeAssignment(), makeContext());
    expect(prompt).toContain("exclusive write access to:");
    expect(prompt).toContain("src/auth/middleware.ts");
    expect(prompt).toContain("src/auth/jwt.ts");
  });

  it("omits research section when researchPath is null", () => {
    const prompt = buildAgentPrompt(
      makeAssignment(),
      makeContext({ researchPath: null }),
    );
    expect(prompt).not.toContain("External research is available");
  });
});

// ---------------------------------------------------------------------------
// buildAgentInvocation
// ---------------------------------------------------------------------------

describe("buildAgentInvocation", () => {
  it("returns structured object with agent name, prompt, tools, model, timeout", () => {
    const assignment = makeAssignment({ timeoutSeconds: 300 });
    const prompt = "Test prompt content";
    const invocation = buildAgentInvocation(assignment, prompt);

    expect(invocation.name).toBe("auth-agent");
    expect(invocation.prompt).toBe("Test prompt content");
    expect(invocation.model).toBe("inherit");
    expect(invocation.timeout).toBe(300000); // 300s * 1000
    expect(invocation.permissionMode).toBe("acceptEdits");
  });

  it("includes standard tools and MCP tools in tools list", () => {
    const invocation = buildAgentInvocation(makeAssignment(), "prompt");
    expect(invocation.tools).toContain("Read");
    expect(invocation.tools).toContain("Write");
    expect(invocation.tools).toContain("Edit");
    expect(invocation.tools).toContain("Bash");
    expect(invocation.tools).toContain("Glob");
    expect(invocation.tools).toContain("Grep");
  });

  it("converts timeout from seconds to milliseconds", () => {
    const assignment = makeAssignment({ timeoutSeconds: 120 });
    const invocation = buildAgentInvocation(assignment, "prompt");
    expect(invocation.timeout).toBe(120000);
  });
});

// ---------------------------------------------------------------------------
// parseAgentChanges
// ---------------------------------------------------------------------------

describe("parseAgentChanges", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-changes-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("extracts file changes from agent output", () => {
    // Create a simulated agent change report
    const reportContent = [
      "# Changes: test-agent",
      "",
      "**Completed:** 2026-01-01T00:00:00Z",
      "**Duration:** 45s",
      "**Status:** complete",
      "",
      "## Files Changed",
      "",
      "| File | Action | Lines |",
      "|------|--------|-------|",
      "| `src/auth/middleware.ts` | created | +50/-0 |",
      "| `src/auth/jwt.ts` | modified | +20/-5 |",
      "",
      "## Summary",
      "",
      "Implemented JWT auth middleware.",
      "",
      "## Discoveries",
      "",
      "- None",
      "",
      "## Issues",
      "",
      "- None",
    ].join("\n");
    fs.writeFileSync(
      path.join(tmpDir, "test-agent-changes.md"),
      reportContent,
      "utf-8",
    );

    const result = parseAgentChanges("test-agent", tmpDir);
    expect(result.name).toBe("test-agent");
    expect(result.filesChanged).toContain("src/auth/middleware.ts");
    expect(result.filesChanged).toContain("src/auth/jwt.ts");
    expect(result.linesAdded).toBe(70);
    expect(result.linesRemoved).toBe(5);
  });

  it("returns empty result when no change report exists", () => {
    const result = parseAgentChanges("nonexistent-agent", tmpDir);
    expect(result.name).toBe("nonexistent-agent");
    expect(result.filesChanged).toHaveLength(0);
    expect(result.linesAdded).toBe(0);
    expect(result.linesRemoved).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// writeChangeReport
// ---------------------------------------------------------------------------

describe("writeChangeReport", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "change-report-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("produces markdown matching UI-SPEC agent change report format", () => {
    const result: AgentResult = {
      name: "auth-agent",
      status: "complete",
      durationMs: 45000,
      filesChanged: ["src/auth/middleware.ts", "src/auth/jwt.ts"],
      linesAdded: 70,
      linesRemoved: 5,
      retried: false,
    };

    const reportPath = writeChangeReport(result, tmpDir);
    expect(fs.existsSync(reportPath)).toBe(true);

    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("# Changes: auth-agent");
    expect(content).toContain("**Completed:**");
    expect(content).toContain("**Duration:** 45s");
    expect(content).toContain("**Status:** complete");
    expect(content).toContain("## Files Changed");
    expect(content).toContain("| File | Action | Lines |");
    expect(content).toContain("src/auth/middleware.ts");
    expect(content).toContain("src/auth/jwt.ts");
    expect(content).toContain("## Summary");
    expect(content).toContain("## Discoveries");
    expect(content).toContain("## Issues");
  });

  it("returns the file path of the written report", () => {
    const result: AgentResult = {
      name: "db-agent",
      status: "complete",
      durationMs: 30000,
      filesChanged: ["src/db/schema.ts"],
      linesAdded: 20,
      linesRemoved: 3,
      retried: false,
    };

    const reportPath = writeChangeReport(result, tmpDir);
    expect(reportPath).toBe(path.join(tmpDir, "db-agent-changes.md"));
  });

  it("handles failed agent status in report", () => {
    const result: AgentResult = {
      name: "failed-agent",
      status: "failed",
      durationMs: 10000,
      filesChanged: [],
      linesAdded: 0,
      linesRemoved: 0,
      error: "Timeout exceeded",
      retried: true,
    };

    const reportPath = writeChangeReport(result, tmpDir);
    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("# Changes: failed-agent");
    expect(content).toContain("**Status:** failed");
    expect(content).toContain("Timeout exceeded");
  });
});
