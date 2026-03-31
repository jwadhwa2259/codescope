import { describe, it, expect } from "vitest";
import { rankGoldenFiles, isNoiseFile } from "../../src/conventions/golden-files.js";
import type { ConventionResult } from "../../src/conventions/types.js";

function makeConvention(
  ruleId: string,
  matchingFiles: string[],
  total: number,
): ConventionResult {
  const adoptionPercent = Math.round(
    (matchingFiles.length / total) * 100,
  );
  return {
    ruleId,
    name: ruleId,
    category: "test",
    matchingFiles,
    totalApplicableFiles: total,
    adoptionPercent,
    confidence: adoptionPercent >= 80 && total >= 10 ? "HIGH-CONF" : "MEDIUM-CONF",
    trend: "Stable",
    evidence: [],
  };
}

describe("rankGoldenFiles", () => {
  it("ranks file appearing in more conventions higher", () => {
    const conventions: ConventionResult[] = [
      makeConvention("rule-a", ["a.ts", "b.ts", "c.ts"], 5),
      makeConvention("rule-b", ["a.ts", "b.ts"], 5),
      makeConvention("rule-c", ["a.ts", "b.ts", "c.ts"], 5),
      makeConvention("rule-d", ["a.ts"], 5),
      makeConvention("rule-e", ["a.ts", "c.ts"], 5),
      makeConvention("rule-f", ["a.ts", "b.ts", "c.ts"], 5),
    ];

    const golden = rankGoldenFiles(conventions);

    // a.ts appears in all 6 conventions, should be first
    expect(golden[0]!.filePath).toBe("a.ts");
    expect(golden[0]!.conventionsFollowed).toBe(6);

    // Density is conventionsFollowed / conventionsApplicable (all conventions are applicable)
    expect(golden[0]!.density).toBe(1);

    // b.ts appears in 4 conventions, c.ts in 4 conventions
    // Both have density 4/6 = 0.667
    const topThree = golden.slice(0, 3).map((g) => g.filePath);
    expect(topThree).toContain("a.ts");
    expect(topThree).toContain("b.ts");
    expect(topThree).toContain("c.ts");
  });

  it("returns max 5 entries", () => {
    const files = Array.from({ length: 10 }, (_, i) => `file${i}.ts`);
    const conventions: ConventionResult[] = [
      makeConvention("rule-a", files, 10),
    ];

    const golden = rankGoldenFiles(conventions);
    expect(golden.length).toBeLessThanOrEqual(5);
  });

  it("returns empty array for empty conventions", () => {
    const golden = rankGoldenFiles([]);
    expect(golden).toEqual([]);
  });

  it("calculates density correctly", () => {
    const conventions: ConventionResult[] = [
      makeConvention("rule-a", ["a.ts", "b.ts"], 3),
      makeConvention("rule-b", ["a.ts"], 3),
      makeConvention("rule-c", ["a.ts", "b.ts"], 3),
    ];

    const golden = rankGoldenFiles(conventions);
    // a.ts follows 3/3 conventions = density 1.0
    const aEntry = golden.find((g) => g.filePath === "a.ts");
    expect(aEntry).toBeDefined();
    expect(aEntry!.density).toBe(1);
    expect(aEntry!.conventionsFollowed).toBe(3);
    expect(aEntry!.conventionsApplicable).toBe(3);

    // b.ts follows 2/3 conventions = density 0.667
    const bEntry = golden.find((g) => g.filePath === "b.ts");
    expect(bEntry).toBeDefined();
    expect(bEntry!.density).toBeCloseTo(0.667, 2);
  });
});

describe("isNoiseFile", () => {
  it("detects test files (.test.ts, .spec.ts)", () => {
    expect(isNoiseFile("src/foo.test.ts")).toBe(true);
    expect(isNoiseFile("src/bar.spec.ts")).toBe(true);
  });

  it("detects config files (vitest.config.ts, tsconfig.json, .eslintrc.js)", () => {
    expect(isNoiseFile("vitest.config.ts")).toBe(true);
    expect(isNoiseFile("tsconfig.json")).toBe(true);
    expect(isNoiseFile(".eslintrc.js")).toBe(true);
  });

  it("detects generated files (schema.generated.ts, api.gen.ts)", () => {
    expect(isNoiseFile("src/schema.generated.ts")).toBe(true);
    expect(isNoiseFile("src/api.gen.ts")).toBe(true);
  });

  it("detects deprecated/legacy files", () => {
    expect(isNoiseFile("src/deprecated/old-api.ts")).toBe(true);
    expect(isNoiseFile("src/legacy-handler.ts")).toBe(true);
  });

  it("detects files in __tests__/ path", () => {
    expect(isNoiseFile("src/__tests__/helper.ts")).toBe(true);
  });

  it("does NOT flag normal source files", () => {
    expect(isNoiseFile("src/app.ts")).toBe(false);
    expect(isNoiseFile("src/utils/helpers.ts")).toBe(false);
    expect(isNoiseFile("src/controllers/user.ts")).toBe(false);
  });
});

describe("rankGoldenFiles noise filtering", () => {
  it("excludes test files from golden file ranking", () => {
    const conventions = [
      makeConvention("rule-a", ["src/app.ts", "src/foo.test.ts", "src/bar.spec.ts"], 5),
      makeConvention("rule-b", ["src/app.ts", "src/foo.test.ts"], 5),
    ];

    const golden = rankGoldenFiles(conventions);
    const filePaths = golden.map(g => g.filePath);
    expect(filePaths).not.toContain("src/foo.test.ts");
    expect(filePaths).not.toContain("src/bar.spec.ts");
    expect(filePaths).toContain("src/app.ts");
  });

  it("excludes config files from golden file ranking", () => {
    const conventions = [
      makeConvention("rule-a", ["src/app.ts", "vitest.config.ts", "tsconfig.json"], 5),
    ];

    const golden = rankGoldenFiles(conventions);
    const filePaths = golden.map(g => g.filePath);
    expect(filePaths).not.toContain("vitest.config.ts");
    expect(filePaths).not.toContain("tsconfig.json");
  });

  it("excludes generated files from golden file ranking", () => {
    const conventions = [
      makeConvention("rule-a", ["src/app.ts", "src/schema.generated.ts", "src/api.gen.ts"], 5),
    ];

    const golden = rankGoldenFiles(conventions);
    const filePaths = golden.map(g => g.filePath);
    expect(filePaths).not.toContain("src/schema.generated.ts");
    expect(filePaths).not.toContain("src/api.gen.ts");
  });

  it("excludes deprecated/legacy files from golden file ranking", () => {
    const conventions = [
      makeConvention("rule-a", ["src/app.ts", "src/deprecated/old-api.ts", "src/legacy-handler.ts"], 5),
    ];

    const golden = rankGoldenFiles(conventions);
    const filePaths = golden.map(g => g.filePath);
    expect(filePaths).not.toContain("src/deprecated/old-api.ts");
    expect(filePaths).not.toContain("src/legacy-handler.ts");
  });

  it("excludes files in __tests__/ path from golden file ranking", () => {
    const conventions = [
      makeConvention("rule-a", ["src/app.ts", "src/__tests__/helper.ts"], 5),
    ];

    const golden = rankGoldenFiles(conventions);
    const filePaths = golden.map(g => g.filePath);
    expect(filePaths).not.toContain("src/__tests__/helper.ts");
  });

  it("safety fallback: returns unfiltered results when ALL files are noise", () => {
    const conventions = [
      makeConvention("rule-a", ["src/foo.test.ts", "src/bar.spec.ts"], 5),
      makeConvention("rule-b", ["src/foo.test.ts"], 5),
    ];

    const golden = rankGoldenFiles(conventions);
    // Should NOT return empty -- falls back to unfiltered
    expect(golden.length).toBeGreaterThan(0);
    // Should contain the noise files since there are no clean files
    const filePaths = golden.map(g => g.filePath);
    expect(filePaths).toContain("src/foo.test.ts");
  });
});

describe("rankGoldenFiles per-language density", () => {
  it("TS file density uses only TS convention count, not all conventions", () => {
    // 2 TS conventions + 1 Python convention = 3 total
    // TS file follows both TS conventions -> density = 2/2 = 1.0 (not 2/3)
    const conventions = [
      makeConvention("prefer-named-exports", ["src/app.ts"], 5),
      makeConvention("detect-async-await", ["src/app.ts"], 5),
      makeConvention("python-type-hints", ["src/utils.py"], 5),
    ];

    const golden = rankGoldenFiles(conventions);
    const tsEntry = golden.find(g => g.filePath === "src/app.ts");
    expect(tsEntry).toBeDefined();
    // Should use per-language: 2 TS conventions applicable, 2 followed
    expect(tsEntry!.conventionsApplicable).toBe(2);
    expect(tsEntry!.density).toBe(1.0);
  });

  it("Python file density uses only Python convention count", () => {
    const conventions = [
      makeConvention("prefer-named-exports", ["src/app.ts"], 5),
      makeConvention("detect-async-await", ["src/app.ts"], 5),
      makeConvention("python-type-hints", ["src/utils.py"], 5),
    ];

    const golden = rankGoldenFiles(conventions);
    const pyEntry = golden.find(g => g.filePath === "src/utils.py");
    expect(pyEntry).toBeDefined();
    // Should use per-language: 1 Python convention applicable, 1 followed
    expect(pyEntry!.conventionsApplicable).toBe(1);
    expect(pyEntry!.density).toBe(1.0);
  });

  it("mixed TS+Python conventions -- TS file density ignores Python conventions", () => {
    // 3 TS conventions + 2 Python conventions = 5 total
    // TS file follows 2 out of 3 TS conventions -> density = 2/3 (not 2/5)
    const conventions = [
      makeConvention("prefer-named-exports", ["src/app.ts", "src/utils.ts"], 5),
      makeConvention("detect-async-await", ["src/app.ts"], 5),
      makeConvention("arrow-function-export", ["src/utils.ts"], 5),
      makeConvention("python-type-hints", ["lib/main.py"], 5),
      makeConvention("python-docstrings", ["lib/main.py"], 5),
    ];

    const golden = rankGoldenFiles(conventions);
    const appEntry = golden.find(g => g.filePath === "src/app.ts");
    expect(appEntry).toBeDefined();
    // src/app.ts follows 2 out of 3 TS conventions
    expect(appEntry!.conventionsApplicable).toBe(3);
    expect(appEntry!.conventionsFollowed).toBe(2);
    expect(appEntry!.density).toBeCloseTo(2 / 3, 2);
  });
});
