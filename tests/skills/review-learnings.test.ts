import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Resolve from project root -- tests/ is one level down from project root
const PROJECT_ROOT = path.resolve(import.meta.dirname ?? __dirname, "..", "..");
const SKILL_PATH = path.join(
  PROJECT_ROOT,
  "skills",
  "review-learnings",
  "SKILL.md",
);

describe("review-learnings SKILL.md", () => {
  const content = fs.readFileSync(SKILL_PATH, "utf-8");
  const lines = content.split("\n");

  it("file exists and is not a stub (>100 lines)", () => {
    expect(lines.length).toBeGreaterThan(100);
  });

  it("frontmatter contains name: review-learnings", () => {
    expect(content).toMatch(
      /^---\n[\s\S]*?name:\s*review-learnings[\s\S]*?---/,
    );
  });

  it("frontmatter contains allowed-tools with Bash, Read, Write, Edit", () => {
    expect(content).toMatch(/^---\n[\s\S]*?allowed-tools:[\s\S]*?---/);
    expect(content).toContain("- Bash");
    expect(content).toContain("- Read");
    expect(content).toContain("- Write");
    expect(content).toContain("- Edit");
  });

  it("contains Step 1 through Step 4", () => {
    expect(content).toContain("## Step 1");
    expect(content).toContain("## Step 2");
    expect(content).toContain("## Step 3");
    expect(content).toContain("## Step 4");
  });

  it('contains "confirm", "reject", "edit" action keywords', () => {
    expect(content).toContain("confirm");
    expect(content).toContain("reject");
    expect(content).toContain("edit");
  });

  it('contains "Promote to enforced convention" text', () => {
    expect(content).toMatch(/[Pp]romote.*to.*enforced convention/);
  });

  it('contains "cross-project" or "Cross-project" text', () => {
    expect(content).toMatch(/[Cc]ross-project/);
  });

  it("contains CONTRADICTED, TODO, and EXPIRED status references (per D-19)", () => {
    expect(content).toContain("CONTRADICTED");
    expect(content).toContain("TODO");
    expect(content).toContain("EXPIRED");
  });

  it("contains reference to loadLearnings or saveLearnings (per D-31)", () => {
    expect(content).toMatch(/loadLearnings|saveLearnings/);
  });

  it("contains reference to runDecay (decay at review time per D-11)", () => {
    expect(content).toContain("runDecay");
  });
});
