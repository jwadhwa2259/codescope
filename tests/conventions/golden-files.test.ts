import { describe, it, expect } from "vitest";
import { rankGoldenFiles } from "../../src/conventions/golden-files.js";
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
