import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Resolve from project root — tests/ is one level down from project root
const PROJECT_ROOT = path.resolve(import.meta.dirname ?? __dirname, "..", "..");
const SKILL_PATH = path.join(PROJECT_ROOT, "skills", "onboard", "SKILL.md");

describe("onboard SKILL.md", () => {
  const content = fs.readFileSync(SKILL_PATH, "utf-8");

  it("file exists and is non-empty", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("frontmatter contains name: onboard", () => {
    expect(content).toMatch(/^---\n[\s\S]*?name:\s*onboard[\s\S]*?---/);
  });

  it("frontmatter contains description field", () => {
    expect(content).toMatch(/^---\n[\s\S]*?description:[\s\S]*?---/);
  });

  it("contains Step 0: Prerequisites Check", () => {
    expect(content).toContain("Step 0: Prerequisites Check");
  });

  it("contains Step 1: Project Detection", () => {
    expect(content).toContain("Step 1: Project Detection");
  });

  it("contains Step 1b: Returning User Check", () => {
    expect(content).toContain("Step 1b: Returning User Check");
  });

  it("contains Step 2: Agent Model Selection", () => {
    expect(content).toContain("Step 2: Agent Model Selection");
  });

  it("contains Step 3: Workflow Preferences", () => {
    expect(content).toContain("Step 3: Workflow Preferences");
  });

  it("contains Step 4: Agent Teams Detection", () => {
    expect(content).toContain("Step 4: Agent Teams Detection");
  });

  it("contains Step 5: Write Config", () => {
    expect(content).toContain("Step 5: Write Config");
  });

  it("contains ONBD-01 copy: prerequisites Node.js check", () => {
    expect(content).toContain(
      "CodeScope requires Node.js 22 or later",
    );
  });

  it("contains ONBD-01 copy: existing config check (D-09)", () => {
    expect(content).toContain(
      "CodeScope is already configured",
    );
  });

  it("contains ONBD-01 copy: detection fallback (D-04)", () => {
    expect(content).toContain(
      "Could not detect project configuration automatically",
    );
  });

  it("contains ONBD-01 copy: returning user (D-03)", () => {
    expect(content).toContain(
      "Found your preferences from a previous project",
    );
  });

  it("contains ONBD-01 copy: config completion (D-08)", () => {
    expect(content).toContain(
      "Configuration saved to .claude/codescope/config.yml",
    );
  });

  it("contains ONBD-01 copy: next step CTA (D-08)", () => {
    expect(content).toContain(
      "Run /codescope:bootstrap to analyze your codebase",
    );
  });

  it("does NOT contain context: fork (per Issue #17283)", () => {
    expect(content).not.toContain("context: fork");
  });

  it("references config.yml (not config.md)", () => {
    expect(content).toContain("config.yml");
  });

  it("contains all 6 agent names", () => {
    const agents = [
      "researcher",
      "convention_detector",
      "risk_analyzer",
      "learning_synthesizer",
      "eval_judge",
      "debug",
    ];
    for (const agent of agents) {
      expect(content).toContain(agent);
    }
  });

  it("contains all 4 workflow preferences", () => {
    expect(content).toContain("Orient verbosity");
    expect(content).toContain("Clarification style");
    expect(content).toContain("Eval gate mode");
    expect(content).toContain("Convention strictness");
  });
});
