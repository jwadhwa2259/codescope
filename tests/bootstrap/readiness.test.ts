import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import {
  computeReadiness,
  percentToGrade,
  writeReadinessArtifact,
  type ReadinessInput,
  type ReadinessScore,
} from "../../src/bootstrap/readiness.js";

describe("readiness", () => {
  // ----------------------------------------------------------------
  // percentToGrade
  // ----------------------------------------------------------------
  describe("percentToGrade", () => {
    it("maps grade thresholds correctly", () => {
      expect(percentToGrade(100)).toBe("A+");
      expect(percentToGrade(97)).toBe("A+");
      expect(percentToGrade(96)).toBe("A");
      expect(percentToGrade(93)).toBe("A");
      expect(percentToGrade(92)).toBe("A-");
      expect(percentToGrade(90)).toBe("A-");
      expect(percentToGrade(89)).toBe("B+");
      expect(percentToGrade(87)).toBe("B+");
      expect(percentToGrade(86)).toBe("B");
      expect(percentToGrade(83)).toBe("B");
      expect(percentToGrade(82)).toBe("B-");
      expect(percentToGrade(80)).toBe("B-");
      expect(percentToGrade(79)).toBe("C+");
      expect(percentToGrade(77)).toBe("C+");
      expect(percentToGrade(76)).toBe("C");
      expect(percentToGrade(73)).toBe("C");
      expect(percentToGrade(72)).toBe("C-");
      expect(percentToGrade(70)).toBe("C-");
      expect(percentToGrade(69)).toBe("D+");
      expect(percentToGrade(67)).toBe("D+");
      expect(percentToGrade(66)).toBe("D");
      expect(percentToGrade(63)).toBe("D");
      expect(percentToGrade(62)).toBe("D-");
      expect(percentToGrade(60)).toBe("D-");
      expect(percentToGrade(59)).toBe("F");
      expect(percentToGrade(0)).toBe("F");
    });
  });

  // ----------------------------------------------------------------
  // computeReadiness
  // ----------------------------------------------------------------
  describe("computeReadiness", () => {
    it("returns overall grade and percent with 4 dimensions at 25% weight each", () => {
      const input: ReadinessInput = {
        totalSourceFiles: 100,
        typedFiles: 80,
        testFiles: 30,
        highConfidenceConventions: 50,
        totalConventions: 60,
        resolvedImports: 900,
        totalImports: 1000,
        previousScores: undefined,
      };

      const result = computeReadiness(input);

      // 4 dimensions exist
      expect(result.dimensions).toHaveProperty("conventionCoverage");
      expect(result.dimensions).toHaveProperty("typeSafety");
      expect(result.dimensions).toHaveProperty("testCoverageProxy");
      expect(result.dimensions).toHaveProperty("importGraphHealth");

      // Overall is average of the 4 dimensions
      const avg =
        (result.dimensions.conventionCoverage.percent +
          result.dimensions.typeSafety.percent +
          result.dimensions.testCoverageProxy.percent +
          result.dimensions.importGraphHealth.percent) /
        4;
      expect(result.overall.percent).toBeCloseTo(avg, 0);
      expect(result.overall.grade).toBe(percentToGrade(Math.round(avg)));
    });

    it("calculates convention coverage dimension correctly", () => {
      const input: ReadinessInput = {
        totalSourceFiles: 100,
        typedFiles: 0,
        testFiles: 0,
        highConfidenceConventions: 50,
        totalConventions: 60,
        resolvedImports: 0,
        totalImports: 0,
      };

      const result = computeReadiness(input);
      // Convention coverage = highConfidenceConventions / totalSourceFiles * 100
      expect(result.dimensions.conventionCoverage.percent).toBe(50);
    });

    it("calculates type safety dimension correctly", () => {
      const input: ReadinessInput = {
        totalSourceFiles: 200,
        typedFiles: 150,
        testFiles: 0,
        highConfidenceConventions: 0,
        totalConventions: 0,
        resolvedImports: 0,
        totalImports: 0,
      };

      const result = computeReadiness(input);
      // Type safety = typedFiles / totalSourceFiles * 100
      expect(result.dimensions.typeSafety.percent).toBe(75);
    });

    it("calculates test coverage proxy dimension correctly", () => {
      const input: ReadinessInput = {
        totalSourceFiles: 100,
        typedFiles: 0,
        testFiles: 40,
        highConfidenceConventions: 0,
        totalConventions: 0,
        resolvedImports: 0,
        totalImports: 0,
      };

      const result = computeReadiness(input);
      // Test coverage proxy = testFiles / totalSourceFiles * 100
      expect(result.dimensions.testCoverageProxy.percent).toBe(40);
    });

    it("calculates import graph health dimension correctly", () => {
      const input: ReadinessInput = {
        totalSourceFiles: 100,
        typedFiles: 0,
        testFiles: 0,
        highConfidenceConventions: 0,
        totalConventions: 0,
        resolvedImports: 850,
        totalImports: 1000,
      };

      const result = computeReadiness(input);
      // Import graph health = resolvedImports / totalImports * 100
      expect(result.dimensions.importGraphHealth.percent).toBe(85);
    });

    it("handles zero denominators without NaN", () => {
      const input: ReadinessInput = {
        totalSourceFiles: 0,
        typedFiles: 0,
        testFiles: 0,
        highConfidenceConventions: 0,
        totalConventions: 0,
        resolvedImports: 0,
        totalImports: 0,
      };

      const result = computeReadiness(input);
      // All dimensions should be 0, not NaN
      expect(Number.isNaN(result.overall.percent)).toBe(false);
      expect(result.dimensions.conventionCoverage.percent).toBe(0);
      expect(result.dimensions.typeSafety.percent).toBe(0);
      expect(result.dimensions.testCoverageProxy.percent).toBe(0);
      expect(result.dimensions.importGraphHealth.percent).toBe(0);
      expect(result.overall.percent).toBe(0);
    });

    it("tracks deltas when previousScores provided", () => {
      const previousScores: ReadinessScore["dimensions"] = {
        conventionCoverage: {
          percent: 40,
          grade: "F",
          delta: null,
          explainer: "",
        },
        typeSafety: {
          percent: 60,
          grade: "D-",
          delta: null,
          explainer: "",
        },
        testCoverageProxy: {
          percent: 30,
          grade: "F",
          delta: null,
          explainer: "",
        },
        importGraphHealth: {
          percent: 80,
          grade: "B-",
          delta: null,
          explainer: "",
        },
      };

      const input: ReadinessInput = {
        totalSourceFiles: 100,
        typedFiles: 80,
        testFiles: 40,
        highConfidenceConventions: 50,
        totalConventions: 60,
        resolvedImports: 900,
        totalImports: 1000,
        previousScores,
      };

      const result = computeReadiness(input);
      // Convention coverage went from 40% to 50%: delta = +10%
      expect(result.dimensions.conventionCoverage.delta).toBe("+10%");
      // Type safety went from 60% to 80%: delta = +20%
      expect(result.dimensions.typeSafety.delta).toBe("+20%");
      // Test coverage went from 30% to 40%: delta = +10%
      expect(result.dimensions.testCoverageProxy.delta).toBe("+10%");
      // Import graph health went from 80% to 90%: delta = +10%
      expect(result.dimensions.importGraphHealth.delta).toBe("+10%");
    });

    it("generates top 3 improvement suggestions referencing specific dimensions", () => {
      const input: ReadinessInput = {
        totalSourceFiles: 100,
        typedFiles: 80,
        testFiles: 10,
        highConfidenceConventions: 5,
        totalConventions: 10,
        resolvedImports: 200,
        totalImports: 1000,
      };

      const result = computeReadiness(input);
      expect(result.improvements.length).toBeLessThanOrEqual(3);
      expect(result.improvements.length).toBeGreaterThan(0);
      // Each improvement should have action and reference
      for (const imp of result.improvements) {
        expect(imp.action).toBeTruthy();
        expect(imp.reference).toBeTruthy();
      }
    });

    it("each dimension has a one-sentence AI explainer per D-04", () => {
      const input: ReadinessInput = {
        totalSourceFiles: 100,
        typedFiles: 50,
        testFiles: 20,
        highConfidenceConventions: 30,
        totalConventions: 40,
        resolvedImports: 700,
        totalImports: 1000,
      };

      const result = computeReadiness(input);
      expect(result.dimensions.conventionCoverage.explainer).toContain(
        "convention",
      );
      expect(result.dimensions.typeSafety.explainer).toContain("type");
      expect(result.dimensions.testCoverageProxy.explainer).toContain("test");
      expect(result.dimensions.importGraphHealth.explainer).toContain(
        "import",
      );
    });

    it("caps convention coverage at 100%", () => {
      const input: ReadinessInput = {
        totalSourceFiles: 10,
        typedFiles: 10,
        testFiles: 10,
        highConfidenceConventions: 50, // more conventions than files
        totalConventions: 60,
        resolvedImports: 100,
        totalImports: 100,
      };

      const result = computeReadiness(input);
      expect(result.dimensions.conventionCoverage.percent).toBeLessThanOrEqual(
        100,
      );
    });
  });

  // ----------------------------------------------------------------
  // writeReadinessArtifact
  // ----------------------------------------------------------------
  describe("writeReadinessArtifact", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "readiness-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("produces readiness.md matching UI-SPEC format", () => {
      const score: ReadinessScore = {
        overall: { grade: "B", percent: 83 },
        dimensions: {
          conventionCoverage: {
            percent: 80,
            grade: "B-",
            delta: "+5%",
            explainer:
              "High convention coverage means AI can follow established patterns with confidence.",
          },
          typeSafety: {
            percent: 90,
            grade: "A-",
            delta: "+10%",
            explainer:
              "High type safety means AI can infer intent from signatures without guessing.",
          },
          testCoverageProxy: {
            percent: 70,
            grade: "C-",
            delta: null,
            explainer:
              "More tests give AI a safety net to verify its changes actually work.",
          },
          importGraphHealth: {
            percent: 92,
            grade: "A-",
            delta: "+2%",
            explainer:
              "Clean import resolution means AI can trace dependencies and assess change impact accurately.",
          },
        },
        improvements: [
          {
            action: "Add more tests",
            reference: "Test Coverage Proxy (70%)",
          },
          {
            action: "Improve convention coverage",
            reference: "Convention Coverage (80%)",
          },
        ],
      };

      const filePath = writeReadinessArtifact(tmpDir, score);
      expect(fs.existsSync(filePath)).toBe(true);
      const content = fs.readFileSync(filePath, "utf-8");

      // Check for UI-SPEC format markers
      expect(content).toContain("# AI Readiness Score: B (83%)");
      expect(content).toContain("## Overall Assessment");
      expect(content).toContain("## Dimension Scores");
      expect(content).toContain("Convention Coverage");
      expect(content).toContain("Type Safety");
      expect(content).toContain("Test Coverage Proxy");
      expect(content).toContain("Import Graph Health");
      expect(content).toContain("## Top 3 Improvements");
      expect(content).toContain("## Grading Scale");
    });
  });
});
