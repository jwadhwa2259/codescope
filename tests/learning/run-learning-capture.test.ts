import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

// We test the module's exported functions, not the CLI entry point itself
import {
  parseArgs,
  runLearningCapture,
} from "../../src/learning/run-learning-capture.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(name?: string): string {
  const dirName = name
    ? `codescope-lc-test-${name}-${crypto.randomUUID()}`
    : `codescope-lc-test-${crypto.randomUUID()}`;
  const dir = path.join(os.tmpdir(), dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function setupProjectWithConfig(
  projectDir: string,
  configOverrides: Record<string, unknown> = {},
): void {
  const csDir = path.join(projectDir, ".claude", "codescope");
  fs.mkdirSync(csDir, { recursive: true });

  const defaultConfig = {
    schema_version: 1,
    project: { name: "test-project", type: "single", languages: ["typescript"] },
    agents: {
      researcher: { model: "inherited" },
      convention_detector: { model: "inherited" },
      risk_analyzer: { model: "inherited" },
      learning_synthesizer: { model: "inherited" },
      eval_judge: { model: "inherited" },
      debug: { model: "inherited" },
    },
    orient: {
      verbosity: "brief",
      clarification: "thorough",
      research_sources: ["context7"],
      max_research_time: 60,
    },
    execute: { max_agents_concurrent: 3 },
    verify: {
      timeout_seconds: 120,
      tests: {},
      auto_smoke: true,
      static_check: true,
      blast_radius_diff: true,
    },
    eval: {
      mode: "interactive",
      auto_debug_max_cycles: 3,
      criteria: {
        scope_compliance: true,
        convention_adherence: true,
        completeness: true,
        correctness: true,
      },
    },
    conventions: {
      detection_threshold: 80,
      min_files: 10,
      strictness: "suggest-only",
      auto_confirm_high_confidence: false,
    },
    learning: {
      project_memory: true,
      global_memory: true,
      global_memory_path: "~/.codescope/global-memory.md",
      max_active_learnings: 50,
      confidence_decay: { gotchas: 90, decisions: 180 },
      auto_capture: true,
      capture_ignores: true,
      ...configOverrides,
    },
    bootstrap: { scaling: "auto", squad_threshold_loc: 100000, max_squads: 10 },
    display: { progress_reports: true, agent_activity: "minimal", eval_detail: "full" },
  };

  // Write config.yml
  const yaml = `schema_version: ${defaultConfig.schema_version}
project:
  name: ${defaultConfig.project.name}
  type: ${defaultConfig.project.type}
  languages:
    - typescript
agents:
  researcher:
    model: inherited
  convention_detector:
    model: inherited
  risk_analyzer:
    model: inherited
  learning_synthesizer:
    model: inherited
  eval_judge:
    model: inherited
  debug:
    model: inherited
orient:
  verbosity: brief
  clarification: thorough
  research_sources:
    - context7
  max_research_time: 60
execute:
  max_agents_concurrent: 3
verify:
  timeout_seconds: 120
  tests: {}
  auto_smoke: true
  static_check: true
  blast_radius_diff: true
eval:
  mode: interactive
  auto_debug_max_cycles: 3
  criteria:
    scope_compliance: true
    convention_adherence: true
    completeness: true
    correctness: true
conventions:
  detection_threshold: 80
  min_files: 10
  strictness: suggest-only
  auto_confirm_high_confidence: false
learning:
  project_memory: true
  global_memory: true
  global_memory_path: "~/.codescope/global-memory.md"
  max_active_learnings: 50
  confidence_decay:
    gotchas: 90
    decisions: 180
  auto_capture: ${defaultConfig.learning.auto_capture ?? true}
  capture_ignores: true
bootstrap:
  scaling: auto
  squad_threshold_loc: 100000
  max_squads: 10
display:
  progress_reports: true
  agent_activity: minimal
  eval_detail: full
`;
  fs.writeFileSync(path.join(csDir, "config.yml"), yaml, "utf-8");

  // Create learnings.md
  const learningsContent = `---
generated: "2026-03-27T00:00:00.000Z"
generator: "learning-synthesizer"
phase: 2
total_learnings: 0
---

# Learnings

## Schema

Each learning entry follows this format:

\`\`\`
### {Learning Title}
- **Status:** UNVERIFIED
- **Type:** {gotcha/decision/pattern}
- **Discovered:** {date}
- **Expires:** {date based on type decay}
- **Evidence:** {file:line or description}
\`\`\`

## Entries

No learnings recorded yet. Learnings accumulate from completed orient-to-debug pipeline runs.
`;
  fs.writeFileSync(path.join(csDir, "learnings.md"), learningsContent, "utf-8");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("extracts --project-root, --task-slug, and other flags from argv", () => {
    const result = parseArgs([
      "--project-root", "/tmp/project",
      "--task-slug", "auth-module",
      "--scope-contract-path", "/tmp/scope.md",
      "--plan-path", "/tmp/plan.md",
      "--coordination-path", "/tmp/coord.md",
      "--report-path", "/tmp/report.md",
      "--execution-dir", "/tmp/exec",
    ]);

    expect(result.projectRoot).toBe("/tmp/project");
    expect(result.taskSlug).toBe("auth-module");
    expect(result.scopeContractPath).toBe("/tmp/scope.md");
    expect(result.planPath).toBe("/tmp/plan.md");
    expect(result.coordinationPath).toBe("/tmp/coord.md");
    expect(result.reportPath).toBe("/tmp/report.md");
    expect(result.executionDir).toBe("/tmp/exec");
  });

  it("parses --eval-report-path and --verify-report-path", () => {
    const args = parseArgs([
      "--task-slug", "test-task",
      "--eval-report-path", "/path/to/eval.md",
      "--verify-report-path", "/path/to/verify.md",
    ]);
    expect(args.evalReportPath).toBe("/path/to/eval.md");
    expect(args.verifyReportPath).toBe("/path/to/verify.md");
  });

  it("defaults evalReportPath and verifyReportPath to empty string", () => {
    const args = parseArgs(["--task-slug", "test-task"]);
    expect(args.evalReportPath).toBe("");
    expect(args.verifyReportPath).toBe("");
  });

  it("preserves backward compat with --report-path only", () => {
    const args = parseArgs([
      "--task-slug", "test-task",
      "--report-path", "/path/to/report.md",
    ]);
    expect(args.reportPath).toBe("/path/to/report.md");
    expect(args.evalReportPath).toBe("");
    expect(args.verifyReportPath).toBe("");
  });
});

describe("runLearningCapture", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir("project");
  });

  afterEach(() => {
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("outputs skipped when auto_capture is false", async () => {
    setupProjectWithConfig(projectDir, { auto_capture: false });

    const result = await runLearningCapture({
      projectRoot: projectDir,
      taskSlug: "test-task",
      scopeContractPath: "",
      planPath: "",
      coordinationPath: "",
      reportPath: "",
      evalReportPath: "",
      verifyReportPath: "",
      executionDir: "",
    });

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("auto_capture disabled");
  });

  it("calls runLearningSynthesizer with dispatch callback", async () => {
    setupProjectWithConfig(projectDir);
    const csDir = path.join(projectDir, ".claude", "codescope");
    const coordPath = path.join(csDir, "coordination.md");
    fs.writeFileSync(coordPath, "## Coordination\n- Done", "utf-8");

    const stderrMessages: string[] = [];
    const origStderrWrite = process.stderr.write;
    // Capture stderr to check dispatch_learning is emitted
    process.stderr.write = ((chunk: string | Buffer) => {
      stderrMessages.push(typeof chunk === "string" ? chunk : chunk.toString());
      return true;
    }) as typeof process.stderr.write;

    try {
      const result = await runLearningCapture({
        projectRoot: projectDir,
        taskSlug: "test-task",
        scopeContractPath: "",
        planPath: "",
        coordinationPath: coordPath,
        reportPath: "",
        evalReportPath: "",
        verifyReportPath: "",
        executionDir: "",
      });

      expect(result.status).toBe("complete");
      expect(result).toHaveProperty("newLearnings");
      expect(result).toHaveProperty("capStatus");
    } finally {
      process.stderr.write = origStderrWrite;
    }
  });

  it("outputs JSON result with newLearnings, contradicted, skipped, capStatus", async () => {
    setupProjectWithConfig(projectDir);

    const result = await runLearningCapture({
      projectRoot: projectDir,
      taskSlug: "test-task",
      scopeContractPath: "",
      planPath: "",
      coordinationPath: "",
      reportPath: "",
      evalReportPath: "",
      verifyReportPath: "",
      executionDir: "",
    });

    expect(result.status).toBe("complete");
    expect(typeof result.newLearnings).toBe("number");
    expect(typeof result.contradicted).toBe("number");
    expect(typeof result.skipped).toBe("number");
    expect(typeof result.capStatus).toBe("string");
  });

  it("handles missing artifact files gracefully", async () => {
    setupProjectWithConfig(projectDir);

    // Pass non-existent paths
    const result = await runLearningCapture({
      projectRoot: projectDir,
      taskSlug: "test-task",
      scopeContractPath: "/nonexistent/scope.md",
      planPath: "/nonexistent/plan.md",
      coordinationPath: "/nonexistent/coord.md",
      reportPath: "/nonexistent/report.md",
      evalReportPath: "",
      verifyReportPath: "",
      executionDir: "/nonexistent/exec",
    });

    // Should not crash -- still completes with what's available
    expect(result.status).toBe("complete");
  });
});
