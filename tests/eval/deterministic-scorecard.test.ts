import { describe, it, expect, vi } from "vitest";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  computeCompositeScore,
  computeConventionAdherence,
  computeBlastRadiusScore,
  computeViolationImpact,
  computeImportCorrectness,
  computeRiskFilesModified,
  renderScorecard,
  computeScorecard,
} from "../../src/eval/deterministic-scorecard.js";
import type { DeterministicScorecard, ScorecardInput } from "../../src/eval/types.js";
import type { ViolationIndex } from "../../src/artifacts/types.js";

// ---------------------------------------------------------------------------
// computeCompositeScore
// ---------------------------------------------------------------------------

describe("computeCompositeScore", () => {
  it("returns A grade for perfect scores (100, 100, 100, 100)", () => {
    const result = computeCompositeScore(100, 100, 100, 100);
    expect(result).toEqual({ percent: 100, grade: "A" });
  });

  it("returns A grade for (90, 90, 90, 90)", () => {
    const result = computeCompositeScore(90, 90, 90, 90);
    expect(result).toEqual({ percent: 90, grade: "A" });
  });

  it("returns B+ grade for (85, 85, 85, 85)", () => {
    const result = computeCompositeScore(85, 85, 85, 85);
    expect(result).toEqual({ percent: 85, grade: "B+" });
  });

  it("returns B grade for (80, 80, 80, 80)", () => {
    const result = computeCompositeScore(80, 80, 80, 80);
    expect(result).toEqual({ percent: 80, grade: "B" });
  });

  it("returns C+ grade for (75, 75, 75, 75) -- gap coverage", () => {
    const result = computeCompositeScore(75, 75, 75, 75);
    expect(result).toEqual({ percent: 75, grade: "C+" });
  });

  it("returns C+ grade for (70, 70, 70, 70)", () => {
    const result = computeCompositeScore(70, 70, 70, 70);
    expect(result).toEqual({ percent: 70, grade: "C+" });
  });

  it("returns C grade for (60, 60, 60, 60)", () => {
    const result = computeCompositeScore(60, 60, 60, 60);
    expect(result).toEqual({ percent: 60, grade: "C" });
  });

  it("returns F grade for (50, 50, 50, 50)", () => {
    const result = computeCompositeScore(50, 50, 50, 50);
    expect(result).toEqual({ percent: 50, grade: "F" });
  });

  it("returns F grade for (0, 0, 0, 0)", () => {
    const result = computeCompositeScore(0, 0, 0, 0);
    expect(result).toEqual({ percent: 0, grade: "F" });
  });

  it("clamps to 0 for negative inputs", () => {
    const result = computeCompositeScore(-10, -10, -10, -10);
    expect(result.percent).toBe(0);
    expect(result.grade).toBe("F");
  });

  it("clamps to 100 for oversized inputs", () => {
    const result = computeCompositeScore(200, 200, 200, 200);
    expect(result.percent).toBe(100);
    expect(result.grade).toBe("A");
  });

  it("correctly weights at 25% each", () => {
    // 100*0.25 + 0*0.25 + 0*0.25 + 0*0.25 = 25
    const result = computeCompositeScore(100, 0, 0, 0);
    expect(result.percent).toBe(25);
    expect(result.grade).toBe("F");
  });
});

// ---------------------------------------------------------------------------
// computeConventionAdherence
// ---------------------------------------------------------------------------

describe("computeConventionAdherence", () => {
  it("returns percent: 100 for empty changedFiles", () => {
    const result = computeConventionAdherence({
      changedFiles: [],
      conventionsPath: "/nonexistent/path",
    });
    expect(result).toEqual({ percent: 100, violatingFiles: 0, totalFiles: 0 });
  });

  it("returns percent: 100 when conventions.md does not exist", () => {
    const result = computeConventionAdherence({
      changedFiles: ["src/foo.ts"],
      conventionsPath: "/nonexistent/conventions.md",
    });
    expect(result).toEqual({ percent: 100, violatingFiles: 0, totalFiles: 0 });
  });
});

// ---------------------------------------------------------------------------
// computeBlastRadiusScore
// ---------------------------------------------------------------------------

describe("computeBlastRadiusScore", () => {
  it("returns normalized: 100 for empty changedFiles", () => {
    const result = computeBlastRadiusScore({
      changedFiles: [],
      db: null,
    });
    expect(result).toEqual({ totalAffected: 0, normalized: 100, riskBreakdown: {} });
  });

  it("returns normalized: 100 when db is null", () => {
    const result = computeBlastRadiusScore({
      changedFiles: ["src/foo.ts"],
      db: null,
    });
    expect(result).toEqual({ totalAffected: 0, normalized: 100, riskBreakdown: {} });
  });
});

// ---------------------------------------------------------------------------
// computeViolationImpact
// ---------------------------------------------------------------------------

describe("computeViolationImpact", () => {
  it("returns normalized: 100 when violations file does not exist", () => {
    const result = computeViolationImpact({
      changedFiles: ["src/foo.ts"],
      violationsPath: "/nonexistent/violations.json",
    });
    expect(result).toEqual({ total: 0, byRule: {}, normalized: 100 });
  });

  it("returns normalized: 100 for empty changedFiles", () => {
    const result = computeViolationImpact({
      changedFiles: [],
      violationsPath: "/nonexistent/violations.json",
    });
    expect(result).toEqual({ total: 0, byRule: {}, normalized: 100 });
  });

  it("parses ViolationIndex-shaped JSON (object with files map) and counts violations for changed files", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scorecard-vi-test-"));
    const violationsPath = path.join(tmpDir, "convention-violations.json");
    const violationIndex: ViolationIndex = {
      generated: new Date().toISOString(),
      files: {
        "src/utils/helpers.ts": [
          { ruleId: "Typed catch blocks", detected: "Convention not followed", expected: "Typed catch blocks", line: 0 },
          { ruleId: "Named exports", detected: "Convention not followed", expected: "Named exports", line: 0 },
        ],
        "src/routes/users.ts": [
          { ruleId: "Named exports", detected: "Convention not followed", expected: "Named exports", line: 0 },
        ],
        "src/unrelated/other.ts": [
          { ruleId: "Named exports", detected: "Convention not followed", expected: "Named exports", line: 0 },
        ],
      },
    };
    fs.writeFileSync(violationsPath, JSON.stringify(violationIndex), "utf-8");

    const result = computeViolationImpact({
      changedFiles: ["src/utils/helpers.ts", "src/routes/users.ts"],
      violationsPath,
    });

    expect(result.total).toBe(3); // 2 for helpers + 1 for users
    expect(result.byRule["Typed catch blocks"]).toBe(1);
    expect(result.byRule["Named exports"]).toBe(2);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns normalized 85 for 1-2 violations matching changed files (ViolationIndex shape)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scorecard-vi-test-"));
    const violationsPath = path.join(tmpDir, "convention-violations.json");
    const violationIndex: ViolationIndex = {
      generated: new Date().toISOString(),
      files: {
        "src/foo.ts": [
          { ruleId: "rule-a", detected: "x", expected: "y", line: 0 },
        ],
      },
    };
    fs.writeFileSync(violationsPath, JSON.stringify(violationIndex), "utf-8");

    const result = computeViolationImpact({
      changedFiles: ["src/foo.ts"],
      violationsPath,
    });

    expect(result.total).toBe(1);
    expect(result.normalized).toBe(85);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns normalized 100 when changed files have no violations in the ViolationIndex", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scorecard-vi-test-"));
    const violationsPath = path.join(tmpDir, "convention-violations.json");
    const violationIndex: ViolationIndex = {
      generated: new Date().toISOString(),
      files: {
        "src/other.ts": [
          { ruleId: "rule-a", detected: "x", expected: "y", line: 0 },
        ],
      },
    };
    fs.writeFileSync(violationsPath, JSON.stringify(violationIndex), "utf-8");

    const result = computeViolationImpact({
      changedFiles: ["src/foo.ts"],
      violationsPath,
    });

    expect(result.total).toBe(0);
    expect(result.normalized).toBe(100);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("still handles legacy flat array format (backward compat)", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scorecard-vi-test-"));
    const violationsPath = path.join(tmpDir, "convention-violations.json");
    const flatArray = [
      { file: "src/foo.ts", rule: "no-any", ruleId: "no-any" },
      { file: "src/bar.ts", rule: "no-any", ruleId: "no-any" },
    ];
    fs.writeFileSync(violationsPath, JSON.stringify(flatArray), "utf-8");

    const result = computeViolationImpact({
      changedFiles: ["src/foo.ts"],
      violationsPath,
    });

    expect(result.total).toBe(1);
    expect(result.byRule["no-any"]).toBe(1);
    expect(result.normalized).toBe(85);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

// ---------------------------------------------------------------------------
// computeImportCorrectness
// ---------------------------------------------------------------------------

describe("computeImportCorrectness", () => {
  it("returns percent: 100 for empty changedFiles", () => {
    const result = computeImportCorrectness({
      changedFiles: [],
      db: null,
    });
    expect(result).toEqual({ percent: 100, broken: 0, total: 0 });
  });

  it("returns percent: 100 when db is null", () => {
    const result = computeImportCorrectness({
      changedFiles: ["src/foo.ts"],
      db: null,
    });
    expect(result).toEqual({ percent: 100, broken: 0, total: 0 });
  });
});

// ---------------------------------------------------------------------------
// computeRiskFilesModified
// ---------------------------------------------------------------------------

describe("computeRiskFilesModified", () => {
  it("returns empty when danger zones file does not exist", () => {
    const result = computeRiskFilesModified(
      ["src/foo.ts"],
      "/nonexistent/danger-zones.json",
    );
    expect(result).toEqual({ count: 0, files: [] });
  });

  it("returns empty for empty changedFiles", () => {
    const result = computeRiskFilesModified([], "/nonexistent/danger-zones.json");
    expect(result).toEqual({ count: 0, files: [] });
  });
});

// ---------------------------------------------------------------------------
// renderScorecard
// ---------------------------------------------------------------------------

describe("renderScorecard", () => {
  const scorecard: DeterministicScorecard = {
    conventionAdherence: { percent: 85, violatingFiles: 1, totalFiles: 5 },
    blastRadius: { totalAffected: 12, normalized: 70, riskBreakdown: { Orange: 3, Yellow: 9 } },
    violationImpact: { total: 2, byRule: { "no-any": 2 }, normalized: 85 },
    importCorrectness: { percent: 95, broken: 1, total: 20 },
    riskFilesModified: { count: 1, files: ["src/core.ts"] },
    composite: { percent: 84, grade: "B" },
  };

  it("contains ## CodeScope Scorecard header with grade", () => {
    const md = renderScorecard(scorecard);
    expect(md).toContain("## CodeScope Scorecard: B (84%)");
  });

  it("contains Convention Adherence row", () => {
    const md = renderScorecard(scorecard);
    expect(md).toContain("Convention Adherence");
  });

  it("contains Blast Radius row", () => {
    const md = renderScorecard(scorecard);
    expect(md).toContain("Blast Radius");
  });

  it("contains Violations row", () => {
    const md = renderScorecard(scorecard);
    expect(md).toContain("Violations");
  });

  it("contains Import Correctness row", () => {
    const md = renderScorecard(scorecard);
    expect(md).toContain("Import Correctness");
  });

  it("contains Risk Files Modified row", () => {
    const md = renderScorecard(scorecard);
    expect(md).toContain("Risk Files Modified");
  });

  it("contains bold Composite row", () => {
    const md = renderScorecard(scorecard);
    expect(md).toContain("**Composite**");
    expect(md).toContain("**Grade: B**");
  });

  it("contains table header", () => {
    const md = renderScorecard(scorecard);
    expect(md).toContain("| Metric | Score | Detail |");
  });
});

// ---------------------------------------------------------------------------
// computeScorecard (integration)
// ---------------------------------------------------------------------------

describe("computeScorecard", () => {
  it("returns a full scorecard for empty changedFiles (all 100%)", () => {
    const input: ScorecardInput = {
      changedFiles: [],
      projectRoot: "/tmp/fake-project",
      codescopeDir: "/tmp/fake-codescope",
      db: null,
    };

    const result = computeScorecard(input);

    expect(result.conventionAdherence.percent).toBe(100);
    expect(result.blastRadius.normalized).toBe(100);
    expect(result.violationImpact.normalized).toBe(100);
    expect(result.importCorrectness.percent).toBe(100);
    expect(result.riskFilesModified.count).toBe(0);
    expect(result.composite.percent).toBe(100);
    expect(result.composite.grade).toBe("A");
  });

  it("resolves violationsPath to injection/convention-violations.json", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scorecard-path-test-"));
    const codescopeDir = tmpDir;
    const injectionDir = path.join(codescopeDir, "injection");
    fs.mkdirSync(injectionDir, { recursive: true });

    // Write violations in the injection/ subpath
    const violationIndex: ViolationIndex = {
      generated: new Date().toISOString(),
      files: {
        "src/foo.ts": [
          { ruleId: "test-rule", detected: "x", expected: "y", line: 0 },
          { ruleId: "test-rule", detected: "x", expected: "y", line: 10 },
          { ruleId: "test-rule", detected: "x", expected: "y", line: 20 },
        ],
      },
    };
    fs.writeFileSync(
      path.join(injectionDir, "convention-violations.json"),
      JSON.stringify(violationIndex),
      "utf-8",
    );

    const input: ScorecardInput = {
      changedFiles: ["src/foo.ts"],
      projectRoot: "/tmp/fake-project",
      codescopeDir,
      db: null,
    };

    const result = computeScorecard(input);

    // 3 violations = 70% normalized
    expect(result.violationImpact.total).toBe(3);
    expect(result.violationImpact.normalized).toBe(70);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
