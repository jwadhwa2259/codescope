import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

import {
  runLearningSynthesizer,
  buildSynthesizerPrompt,
  generateEmptyLearningsMarkdown,
  type LearningSynthesizerOptions,
  type LearningSynthesizerResult,
} from "../../src/agents/learning-synthesizer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(name?: string): string {
  const dirName = name
    ? `codescope-learning-test-${name}-${crypto.randomUUID()}`
    : `codescope-learning-test-${crypto.randomUUID()}`;
  const dir = path.join(os.tmpdir(), dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function setupProjectWithLearnings(projectDir: string): void {
  const csDir = path.join(projectDir, ".claude", "codescope");
  fs.mkdirSync(csDir, { recursive: true });
  // Create a minimal learnings.md so loadLearnings works
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
// Test suite: Empty-init backward compat
// ---------------------------------------------------------------------------

describe("Learning Synthesizer Agent - Empty Init (backward compat)", () => {
  let outputDir: string;
  let projectDir: string;

  beforeEach(() => {
    outputDir = makeTmpDir("output");
    projectDir = makeTmpDir("project");
  });

  afterEach(() => {
    for (const dir of [outputDir, projectDir]) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  });

  it("should produce learnings.md with '# Learnings' title when no dispatchSynthesizer", async () => {
    const result = await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir,
    });
    const content = fs.readFileSync(result.learningsPath, "utf-8");
    expect(content).toContain("# Learnings");
  });

  it("should contain '## Schema' section with example format when no dispatchSynthesizer", async () => {
    const result = await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir,
    });
    const content = fs.readFileSync(result.learningsPath, "utf-8");
    expect(content).toContain("## Schema");
    expect(content).toContain("Each learning entry follows this format:");
    expect(content).toContain("**Status:** UNVERIFIED");
  });

  it("should contain '## Entries' section with empty state message when no dispatchSynthesizer", async () => {
    const result = await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir,
    });
    const content = fs.readFileSync(result.learningsPath, "utf-8");
    expect(content).toContain("## Entries");
    expect(content).toContain("No learnings recorded yet.");
  });

  it("should return correct result with path and duration when no dispatchSynthesizer", async () => {
    const result = await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir,
    });
    expect(result.learningsPath).toContain("learnings.md");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(fs.existsSync(result.learningsPath)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Test suite: LLM-driven synthesizer
// ---------------------------------------------------------------------------

describe("Learning Synthesizer Agent - LLM Extraction", () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = makeTmpDir("project");
    setupProjectWithLearnings(projectDir);
  });

  afterEach(() => {
    try {
      fs.rmSync(projectDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("runLearningSynthesizer with dispatchSynthesizer produces LearningEntry[] from LLM response", async () => {
    // Create artifact files
    const csDir = path.join(projectDir, ".claude", "codescope");
    const coordPath = path.join(csDir, "coordination.md");
    const evalPath = path.join(csDir, "eval-report.md");
    const verifyPath = path.join(csDir, "verify-report.md");
    const scopePath = path.join(csDir, "scope-contract.md");
    fs.writeFileSync(coordPath, "## Coordination Log\n- Task completed", "utf-8");
    fs.writeFileSync(evalPath, "## Eval Report\n- All good", "utf-8");
    fs.writeFileSync(verifyPath, "## Verify Report\n- Tests pass", "utf-8");
    fs.writeFileSync(scopePath, "## Scope Contract\n- In scope: auth", "utf-8");

    const mockLLMResponse = JSON.stringify([
      { title: "Use path.join for cross-platform", type: "pattern", evidence: "src/utils/paths.ts:5" },
      { title: "web-tree-sitter 0.26 breaks ABI", type: "gotcha", evidence: "Discovered during bootstrap" },
    ]);

    const dispatchSynthesizer = vi.fn().mockResolvedValue(mockLLMResponse);

    const result = await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir: csDir,
      coordinationLogPath: coordPath,
      evalReportPath: evalPath,
      verifyReportPath: verifyPath,
      scopeContractPath: scopePath,
      decayConfig: { gotchas: 90, decisions: 180 },
      maxActive: 50,
      dispatchSynthesizer,
    });

    expect(result.newLearnings).toBe(2);
    expect(dispatchSynthesizer).toHaveBeenCalledOnce();
  });

  it("runLearningSynthesizer caps at 5 new learnings per run (D-03)", async () => {
    const csDir = path.join(projectDir, ".claude", "codescope");
    const coordPath = path.join(csDir, "coordination.md");
    fs.writeFileSync(coordPath, "log", "utf-8");

    const mockLLMResponse = JSON.stringify([
      { title: "Learning 1", type: "pattern", evidence: "ev1" },
      { title: "Learning 2", type: "pattern", evidence: "ev2" },
      { title: "Learning 3", type: "gotcha", evidence: "ev3" },
      { title: "Learning 4", type: "decision", evidence: "ev4" },
      { title: "Learning 5", type: "pattern", evidence: "ev5" },
      { title: "Learning 6", type: "gotcha", evidence: "ev6" },
      { title: "Learning 7", type: "pattern", evidence: "ev7" },
    ]);

    const dispatchSynthesizer = vi.fn().mockResolvedValue(mockLLMResponse);

    const result = await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir: csDir,
      coordinationLogPath: coordPath,
      evalReportPath: "",
      verifyReportPath: "",
      scopeContractPath: "",
      decayConfig: { gotchas: 90, decisions: 180 },
      maxActive: 50,
      dispatchSynthesizer,
    });

    // Max 5 per D-03
    expect(result.newLearnings).toBeLessThanOrEqual(5);
  });

  it("runLearningSynthesizer sets status to UNVERIFIED on all new entries (D-04)", async () => {
    const csDir = path.join(projectDir, ".claude", "codescope");
    const coordPath = path.join(csDir, "coordination.md");
    fs.writeFileSync(coordPath, "log", "utf-8");

    const mockLLMResponse = JSON.stringify([
      { title: "Test pattern", type: "pattern", evidence: "test" },
    ]);

    const dispatchSynthesizer = vi.fn().mockResolvedValue(mockLLMResponse);

    await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir: csDir,
      coordinationLogPath: coordPath,
      evalReportPath: "",
      verifyReportPath: "",
      scopeContractPath: "",
      decayConfig: { gotchas: 90, decisions: 180 },
      maxActive: 50,
      dispatchSynthesizer,
    });

    // Read the saved learnings and verify status
    const learningsContent = fs.readFileSync(path.join(csDir, "learnings.md"), "utf-8");
    expect(learningsContent).toContain("**Status:** UNVERIFIED");
    expect(learningsContent).not.toContain("**Status:** VERIFIED");
  });

  it("runLearningSynthesizer computes expires date using computeExpiry based on type (D-09)", async () => {
    const csDir = path.join(projectDir, ".claude", "codescope");
    const coordPath = path.join(csDir, "coordination.md");
    fs.writeFileSync(coordPath, "log", "utf-8");

    const mockLLMResponse = JSON.stringify([
      { title: "A gotcha entry", type: "gotcha", evidence: "ev" },
      { title: "A decision entry", type: "decision", evidence: "ev" },
    ]);

    const dispatchSynthesizer = vi.fn().mockResolvedValue(mockLLMResponse);

    await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir: csDir,
      coordinationLogPath: coordPath,
      evalReportPath: "",
      verifyReportPath: "",
      scopeContractPath: "",
      decayConfig: { gotchas: 90, decisions: 180 },
      maxActive: 50,
      dispatchSynthesizer,
    });

    const learningsContent = fs.readFileSync(path.join(csDir, "learnings.md"), "utf-8");
    // Both entries should have Expires field set (non-empty)
    const expiresMatches = learningsContent.match(/\*\*Expires:\*\* \d{4}-\d{2}-\d{2}/g);
    expect(expiresMatches).not.toBeNull();
    expect(expiresMatches!.length).toBeGreaterThanOrEqual(2);
  });

  it("runLearningSynthesizer returns result with newLearnings, contradicted, skipped, capStatus", async () => {
    const csDir = path.join(projectDir, ".claude", "codescope");
    const coordPath = path.join(csDir, "coordination.md");
    fs.writeFileSync(coordPath, "log", "utf-8");

    const mockLLMResponse = JSON.stringify([
      { title: "Some insight", type: "pattern", evidence: "test" },
    ]);

    const dispatchSynthesizer = vi.fn().mockResolvedValue(mockLLMResponse);

    const result = await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir: csDir,
      coordinationLogPath: coordPath,
      evalReportPath: "",
      verifyReportPath: "",
      scopeContractPath: "",
      decayConfig: { gotchas: 90, decisions: 180 },
      maxActive: 50,
      dispatchSynthesizer,
    });

    expect(result).toHaveProperty("newLearnings");
    expect(result).toHaveProperty("contradicted");
    expect(result).toHaveProperty("skipped");
    expect(result).toHaveProperty("capStatus");
    expect(typeof result.capStatus).toBe("string");
    expect(result.capStatus).toContain("/50");
  });

  it("buildSynthesizerPrompt includes artifact file contents", () => {
    const csDir = path.join(projectDir, ".claude", "codescope");
    const coordPath = path.join(csDir, "coordination.md");
    const evalPath = path.join(csDir, "eval-report.md");
    const verifyPath = path.join(csDir, "verify-report.md");
    const scopePath = path.join(csDir, "scope-contract.md");
    fs.writeFileSync(coordPath, "## Coordination\n- Step 1 done", "utf-8");
    fs.writeFileSync(evalPath, "## Eval\nScore: A", "utf-8");
    fs.writeFileSync(verifyPath, "## Verify\nAll tests pass", "utf-8");
    fs.writeFileSync(scopePath, "## Scope\nIn scope: auth module", "utf-8");

    const prompt = buildSynthesizerPrompt({
      coordinationLogPath: coordPath,
      evalReportPath: evalPath,
      verifyReportPath: verifyPath,
      scopeContractPath: scopePath,
    });

    expect(prompt).toContain("Coordination");
    expect(prompt).toContain("Step 1 done");
    expect(prompt).toContain("Score: A");
    expect(prompt).toContain("All tests pass");
    expect(prompt).toContain("auth module");
    // Prompt should ask for JSON array
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("Max 5");
  });

  it("buildSynthesizerPrompt handles missing files gracefully", () => {
    const prompt = buildSynthesizerPrompt({
      coordinationLogPath: "/nonexistent/coord.md",
      evalReportPath: "/nonexistent/eval.md",
      verifyReportPath: "/nonexistent/verify.md",
      scopeContractPath: "/nonexistent/scope.md",
    });

    // Should not throw and should contain "(not available)" placeholders
    expect(prompt).toContain("(not available)");
  });
});

// ---------------------------------------------------------------------------
// Test suite: generateEmptyLearningsMarkdown backward compat
// ---------------------------------------------------------------------------

describe("generateEmptyLearningsMarkdown", () => {
  it("should return markdown with Schema and Entries sections", () => {
    const md = generateEmptyLearningsMarkdown();
    expect(md).toContain("# Learnings");
    expect(md).toContain("## Schema");
    expect(md).toContain("## Entries");
    expect(md).toContain("No learnings recorded yet.");
  });
});
