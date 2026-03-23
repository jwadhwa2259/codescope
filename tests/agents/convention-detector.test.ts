import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as crypto from "node:crypto";

import {
  runConventionDetector,
  type ConventionDetectorOptions,
  type ConventionDetectorResult,
} from "../../src/agents/convention-detector.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpDir(name?: string): string {
  const dirName = name
    ? `codescope-conv-det-test-${name}-${crypto.randomUUID()}`
    : `codescope-conv-det-test-${crypto.randomUUID()}`;
  const dir = path.join(os.tmpdir(), dirName);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Use the existing fixture project from tests/fixtures/sample-project
const fixtureProjectDir = path.resolve("tests/fixtures/sample-project");
const rulesDir = path.resolve("src/conventions/rules");

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("Convention Detector Agent", () => {
  let outputDir: string;

  beforeEach(() => {
    outputDir = makeTmpDir("output");
  });

  afterEach(() => {
    try {
      fs.rmSync(outputDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should produce conventions.md with '# Conventions' title", async () => {
    const result = await runConventionDetector({
      projectRoot: fixtureProjectDir,
      outputDir,
      rulesDir,
    });
    const content = fs.readFileSync(result.conventionsPath, "utf-8");
    expect(content).toContain("# Conventions");
  });

  it("should contain YAML frontmatter with required keys", async () => {
    const result = await runConventionDetector({
      projectRoot: fixtureProjectDir,
      outputDir,
      rulesDir,
    });
    const content = fs.readFileSync(result.conventionsPath, "utf-8");

    // Extract frontmatter
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fmMatch).not.toBeNull();
    const frontmatter = fmMatch![1];

    expect(frontmatter).toContain("generated:");
    expect(frontmatter).toContain('generator: "convention-detector"');
    expect(frontmatter).toContain("total_rules_evaluated:");
    expect(frontmatter).toContain("total_conventions_detected:");
    expect(frontmatter).toContain("false_positive_target:");
  });

  it("should include adoption table and evidence for each convention entry", async () => {
    const result = await runConventionDetector({
      projectRoot: fixtureProjectDir,
      outputDir,
      rulesDir,
    });
    const content = fs.readFileSync(result.conventionsPath, "utf-8");

    // Each convention entry should have an adoption table
    expect(content).toContain("| Adoption |");
    // Each convention entry should have evidence section
    expect(content).toContain("**Evidence:**");
  });

  it("should format conflict entries with [CONFLICT] prefix", async () => {
    const result = await runConventionDetector({
      projectRoot: fixtureProjectDir,
      outputDir,
      rulesDir,
    });
    const content = fs.readFileSync(result.conventionsPath, "utf-8");

    // If there are conflicts, they should have [CONFLICT] prefix
    if (result.conflictsDetected > 0) {
      expect(content).toContain("[CONFLICT]");
      expect(content).toContain(
        "Both patterns exceed 20% adoption. Resolution recommended before enforcement.",
      );
    }
  });

  it("should produce golden-files.md with '# Golden Files' title", async () => {
    const result = await runConventionDetector({
      projectRoot: fixtureProjectDir,
      outputDir,
      rulesDir,
    });
    const content = fs.readFileSync(result.goldenFilesPath, "utf-8");
    expect(content).toContain("# Golden Files");
  });

  it("should include convention density percentages in golden-files.md", async () => {
    const result = await runConventionDetector({
      projectRoot: fixtureProjectDir,
      outputDir,
      rulesDir,
    });
    const content = fs.readFileSync(result.goldenFilesPath, "utf-8");

    // Golden files entries should have density percentage format
    if (result.goldenFileCount > 0) {
      // Should contain "conventions followed" format
      expect(content).toMatch(/\d+\/\d+ conventions followed/);
      // Should contain percentage format
      expect(content).toMatch(/\d+%\)/);
    }
  });

  it("should handle ast-grep not available gracefully", async () => {
    // Create a temp project dir with a single file
    const tmpProjectDir = makeTmpDir("no-sg");
    fs.writeFileSync(
      path.join(tmpProjectDir, "package.json"),
      JSON.stringify({ name: "test", version: "1.0.0" }),
    );
    fs.mkdirSync(path.join(tmpProjectDir, "src"), { recursive: true });
    fs.writeFileSync(
      path.join(tmpProjectDir, "src", "index.ts"),
      'export const x = 1;\n',
    );

    // Use a non-existent rules directory to simulate no rules available
    const fakeRulesDir = path.join(makeTmpDir("fake-rules"), "nonexistent");

    const result = await runConventionDetector({
      projectRoot: tmpProjectDir,
      outputDir,
      rulesDir: fakeRulesDir,
    });

    // Should still produce conventions.md (with empty/error state)
    expect(fs.existsSync(result.conventionsPath)).toBe(true);
    const content = fs.readFileSync(result.conventionsPath, "utf-8");
    expect(content).toContain("# Conventions");

    // Cleanup
    try {
      fs.rmSync(tmpProjectDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should return correct result stats", async () => {
    const result = await runConventionDetector({
      projectRoot: fixtureProjectDir,
      outputDir,
      rulesDir,
    });

    expect(result.conventionsDetected).toBeGreaterThanOrEqual(0);
    expect(result.conflictsDetected).toBeGreaterThanOrEqual(0);
    expect(result.goldenFileCount).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.conventionsPath).toContain("conventions.md");
    expect(result.goldenFilesPath).toContain("golden-files.md");
  });
});
