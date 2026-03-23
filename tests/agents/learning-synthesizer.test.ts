import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

import {
  runLearningSynthesizer,
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

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Learning Synthesizer Agent", () => {
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

  it("should produce learnings.md with '# Learnings' title", async () => {
    const result = await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir,
    });
    const content = fs.readFileSync(result.learningsPath, "utf-8");
    expect(content).toContain("# Learnings");
  });

  it("should contain '## Schema' section with example format", async () => {
    const result = await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir,
    });
    const content = fs.readFileSync(result.learningsPath, "utf-8");

    expect(content).toContain("## Schema");
    expect(content).toContain("Each learning entry follows this format:");
    expect(content).toContain("**Status:** UNVERIFIED");
    expect(content).toContain("**Type:** {gotcha/decision/pattern}");
    expect(content).toContain("**Discovered:**");
    expect(content).toContain("**Expires:**");
    expect(content).toContain("**Evidence:**");
  });

  it("should contain '## Entries' section with empty state message", async () => {
    const result = await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir,
    });
    const content = fs.readFileSync(result.learningsPath, "utf-8");

    expect(content).toContain("## Entries");
    expect(content).toContain("No learnings recorded yet.");
    expect(content).toContain(
      "Learnings accumulate from completed orient-to-debug pipeline runs.",
    );
  });

  it("should contain YAML frontmatter with total_learnings: 0", async () => {
    const result = await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir,
    });
    const content = fs.readFileSync(result.learningsPath, "utf-8");

    // Extract frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fmMatch).not.toBeNull();
    const frontmatter = fmMatch![1];

    expect(frontmatter).toContain("generated:");
    expect(frontmatter).toContain('generator: "learning-synthesizer"');
    expect(frontmatter).toContain("total_learnings: 0");
  });

  it("should return correct result with path and duration", async () => {
    const result = await runLearningSynthesizer({
      projectRoot: projectDir,
      outputDir,
    });

    expect(result.learningsPath).toContain("learnings.md");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(fs.existsSync(result.learningsPath)).toBe(true);
  });
});
