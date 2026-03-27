import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";

// Resolve from project root -- tests/ is one level down from project root
const PROJECT_ROOT = path.resolve(import.meta.dirname ?? __dirname, "..", "..");
const SKILL_PATH = path.join(PROJECT_ROOT, "skills", "orient", "SKILL.md");

describe("orient SKILL.md Step 7 Learning Capture", () => {
  const content = fs.readFileSync(SKILL_PATH, "utf-8");

  it("contains ## Step 7: Learning Capture", () => {
    expect(content).toContain("## Step 7: Learning Capture");
  });

  it("contains ## Step 8: Summary", () => {
    expect(content).toContain("## Step 8: Summary");
  });

  it("does NOT contain ## Step 7: Summary (old numbering gone)", () => {
    expect(content).not.toContain("## Step 7: Summary");
  });

  it("contains run-learning-capture.ts reference", () => {
    expect(content).toContain("run-learning-capture.ts");
  });

  it("contains dispatch_learning dispatch type", () => {
    expect(content).toContain("dispatch_learning");
  });

  it("contains learning.auto_capture config check", () => {
    expect(content).toContain("learning.auto_capture");
  });

  it("contains agents.learning_synthesizer.model model reference", () => {
    expect(content).toContain("agents.learning_synthesizer.model");
  });

  it("contains Learning Nudge section", () => {
    expect(content).toContain("Learning Nudge");
  });

  it("Step 6 references point to Step 7 (Learning Capture) not Step 7 (Summary)", () => {
    // Should have references to "Step 7 (Learning Capture)" in the Step 6 section
    expect(content).toContain("proceed to Step 7 (Learning Capture)");
    // Should NOT have any "Step 7 (Summary)" references anywhere
    expect(content).not.toMatch(/Step 7 \(Summary\)/);
  });

  it('Step 7 text references "Step 8 (Summary)" as next step', () => {
    // The Learning Capture step should reference Step 8
    expect(content).toContain("Step 8 (Summary)");
  });
});
