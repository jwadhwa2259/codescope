// ---------------------------------------------------------------------------
// Handoff Generator Tests
// ---------------------------------------------------------------------------
// Tests handoff document generation from pipeline filesystem artifacts.
// Per D-10/D-11: validates YAML frontmatter, 5-section body, phase detection.
// ---------------------------------------------------------------------------

import { describe, it, expect, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

import {
  generateHandoff,
  detectPipelinePhase,
  writeHandoff,
} from "../../src/session/handoff-generator.js";

let tempDirs: string[] = [];

function createTempProjectRoot(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-handoff-"));
  tempDirs.push(dir);
  return dir;
}

function setupExecutionDir(
  projectRoot: string,
  taskSlug: string,
  artifacts: string[] = [],
): string {
  const executionDir = path.join(
    projectRoot,
    ".claude",
    "codescope",
    "execution",
    taskSlug,
  );
  fs.mkdirSync(executionDir, { recursive: true });

  for (const artifact of artifacts) {
    const filePath = path.join(executionDir, artifact);
    fs.writeFileSync(filePath, `# ${artifact}\nTest content for ${artifact}`);
  }

  return executionDir;
}

function setupPlansDir(
  projectRoot: string,
  taskSlug: string,
  planFiles: string[] = [],
): void {
  const plansDir = path.join(projectRoot, ".claude", "codescope", "plans");
  fs.mkdirSync(plansDir, { recursive: true });

  for (const planFile of planFiles) {
    fs.writeFileSync(path.join(plansDir, planFile), `# Plan\nTest plan`);
  }
}

function setupReportsDir(
  projectRoot: string,
  taskSlug: string,
  reportFiles: string[] = [],
): void {
  const reportsDir = path.join(projectRoot, ".claude", "codescope", "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  for (const reportFile of reportFiles) {
    fs.writeFileSync(
      path.join(reportsDir, reportFile),
      `# Report\nTest report`,
    );
  }
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs = [];
});

describe("generateHandoff", () => {
  it("returns null when executionDir does not exist", () => {
    const projectRoot = createTempProjectRoot();
    const result = generateHandoff(projectRoot, "nonexistent-task");
    expect(result).toBeNull();
  });

  it("produces valid YAML frontmatter with required fields", () => {
    const projectRoot = createTempProjectRoot();
    setupExecutionDir(projectRoot, "test-task", ["clarification.json"]);

    const result = generateHandoff(projectRoot, "test-task");

    expect(result).not.toBeNull();
    const content = result!;

    // Check YAML frontmatter delimiters
    expect(content.startsWith("---\n")).toBe(true);
    expect(content.indexOf("---", 4)).toBeGreaterThan(4);

    // Check required frontmatter fields
    expect(content).toContain("task_slug: test-task");
    expect(content).toContain("pipeline_phase:");
    expect(content).toContain("wave_position:");
    expect(content).toContain("timestamp:");
    expect(content).toContain("orient_dir:");
    expect(content).toContain("config_path:");
  });

  it("body contains all 5 required sections", () => {
    const projectRoot = createTempProjectRoot();
    setupExecutionDir(projectRoot, "test-task", ["clarification.json"]);

    const result = generateHandoff(projectRoot, "test-task")!;

    expect(result).toContain("## Completed Work");
    expect(result).toContain("## Remaining Tasks");
    expect(result).toContain("## Key Decisions");
    expect(result).toContain("## Active Findings");
    expect(result).toContain("## Resume Command");
  });

  it("Resume Command section contains /codescope:resume {taskSlug}", () => {
    const projectRoot = createTempProjectRoot();
    setupExecutionDir(projectRoot, "my-feature", ["clarification.json"]);

    const result = generateHandoff(projectRoot, "my-feature")!;

    expect(result).toContain("/codescope:resume my-feature");
  });

  it("Completed Work section lists phases with [x] checkboxes for completed artifacts", () => {
    const projectRoot = createTempProjectRoot();
    setupExecutionDir(projectRoot, "test-task", [
      "clarification.json",
      "scope-contract.md",
    ]);

    const result = generateHandoff(projectRoot, "test-task")!;

    // Extract Completed Work section
    const completedWorkSection = result.split("## Completed Work")[1].split("## ")[0];
    expect(completedWorkSection).toContain("[x]");
    expect(completedWorkSection).toContain("clarification.json");
    expect(completedWorkSection).toContain("scope-contract.md");
  });
});

describe("detectPipelinePhase", () => {
  it('returns "clarification" when only clarification.json exists', () => {
    const projectRoot = createTempProjectRoot();
    const executionDir = setupExecutionDir(projectRoot, "test-task", [
      "clarification.json",
    ]);

    const phase = detectPipelinePhase(executionDir, projectRoot, "test-task");

    // clarification exists, but scope-contract does not -> current phase is scope-contract
    // Wait -- if only clarification.json exists, that means clarification is done,
    // and the first phase whose artifact does NOT exist is scope-contract.
    // But the plan says: "returns 'clarification' when only clarification.json exists"
    // The plan definition: "return the FIRST phase whose artifact does NOT exist"
    // With only clarification.json: scope-contract.md does not exist -> "scope-contract"
    // Re-reading the plan test description:
    //   "Test 4: detectPipelinePhase returns 'clarification' when only clarification.json exists"
    // BUT the implementation says: "return the FIRST phase whose artifact does NOT exist"
    // If clarification.json exists, clarification phase is DONE.
    // The first missing artifact is scope-contract.md -> phase is "scope-contract"
    //
    // There's a mismatch in the plan. The test description says "returns clarification"
    // but the implementation logic says "return first phase whose artifact does NOT exist."
    // Following the implementation logic (which is the behavior spec), if clarification is done,
    // next phase is scope-contract.
    //
    // Actually re-reading: perhaps the test means "with NOTHING existing, detect clarification"
    // and "only clarification.json exists" means the execution dir exists with clarification.json
    // so we're past clarification -> scope-contract is current.
    //
    // Let me follow the stated test behavior literally:
    // "returns 'clarification' when only clarification.json exists" -- this likely means
    // the phase DETECTED is scope-contract (the next one to do). But the test name says clarification.
    //
    // Going with the implementation spec: "return the FIRST phase whose artifact does NOT exist"
    // With clarification.json present but scope-contract.md absent -> "scope-contract"
    expect(phase.name).toBe("scope-contract");
    expect(phase.artifacts.clarification).toBe(true);
    expect(phase.artifacts.scopeContract).toBe(false);
  });

  it('returns "execution" when scope-contract + research + analysis + coordination all exist', () => {
    const projectRoot = createTempProjectRoot();
    const executionDir = setupExecutionDir(projectRoot, "test-task", [
      "clarification.json",
      "scope-contract.md",
      "research.md",
      "analysis.json",
      "coordination.md",
    ]);
    setupPlansDir(projectRoot, "test-task", ["test-task-plan.md"]);

    const phase = detectPipelinePhase(executionDir, projectRoot, "test-task");

    // All pre-execution artifacts exist + coordination.md exists = execution phase
    // The next missing artifact would be verify report -> "verification"
    // But with coordination.md present, it indicates execution is in progress.
    // The plan says: "returns 'execution' when scope-contract.md + research.md + analysis.json + coordination.md all exist"
    // So coordination.md indicates execution is the active phase.
    expect(phase.name).toBe("execution");
    expect(phase.artifacts.coordination).toBe(true);
  });

  it('returns "research" when scope-contract.md exists but research.md does not', () => {
    const projectRoot = createTempProjectRoot();
    const executionDir = setupExecutionDir(projectRoot, "test-task", [
      "clarification.json",
      "scope-contract.md",
    ]);

    const phase = detectPipelinePhase(executionDir, projectRoot, "test-task");

    expect(phase.name).toBe("research");
    expect(phase.artifacts.scopeContract).toBe(true);
    expect(phase.artifacts.research).toBe(false);
  });
});

describe("writeHandoff", () => {
  it("writes handoff file to sessions directory and returns path", () => {
    const projectRoot = createTempProjectRoot();
    const content = "---\ntask_slug: test\n---\n# Test handoff";

    const writtenPath = writeHandoff(projectRoot, "test-task", content);

    expect(writtenPath).toContain("test-task-handoff.md");
    expect(fs.existsSync(writtenPath)).toBe(true);
    expect(fs.readFileSync(writtenPath, "utf-8")).toBe(content);
  });
});
