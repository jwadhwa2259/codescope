import { describe, it, expect } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import {
  runAstGrepScan,
  calculateAdoption,
  detectConflicts,
  buildEvidence,
  runConventionScan,
  countApplicableFiles,
  COMPETING_PAIRS,
} from "../../src/conventions/runner.js";
import type {
  RuleMatch,
  ConventionResult,
} from "../../src/conventions/types.js";

const FIXTURE_DIR = path.resolve(
  import.meta.dirname,
  "../fixtures/sample-project/src",
);
const RULES_DIR = path.resolve(
  import.meta.dirname,
  "../../src/conventions/rules",
);
const TS_RULES_DIR = path.join(RULES_DIR, "typescript");

describe("runAstGrepScan", () => {
  it("returns matches with ruleId, file, and line for fixture project", () => {
    const matches = runAstGrepScan(TS_RULES_DIR, FIXTURE_DIR);
    expect(matches.length).toBeGreaterThan(0);

    const first = matches[0]!;
    expect(first).toHaveProperty("ruleId");
    expect(first).toHaveProperty("file");
    expect(first).toHaveProperty("line");
    expect(typeof first.ruleId).toBe("string");
    expect(typeof first.file).toBe("string");
    expect(typeof first.line).toBe("number");
    // Line numbers should be 1-based
    expect(first.line).toBeGreaterThanOrEqual(1);
  });

  it("returns empty array for non-existent directory", () => {
    const matches = runAstGrepScan(TS_RULES_DIR, "/tmp/nonexistent-dir-xyz");
    expect(matches).toEqual([]);
  });
});

describe("calculateAdoption", () => {
  it("computes correct percentage: 3 files out of 5 = 60%", () => {
    const matches: RuleMatch[] = [
      {
        ruleId: "test-rule",
        file: "a.ts",
        line: 1,
        column: 0,
        text: "x",
        message: "m",
        severity: "info",
      },
      {
        ruleId: "test-rule",
        file: "b.ts",
        line: 1,
        column: 0,
        text: "x",
        message: "m",
        severity: "info",
      },
      {
        ruleId: "test-rule",
        file: "c.ts",
        line: 1,
        column: 0,
        text: "x",
        message: "m",
        severity: "info",
      },
      {
        ruleId: "test-rule",
        file: "a.ts",
        line: 5,
        column: 0,
        text: "x",
        message: "m",
        severity: "info",
      }, // duplicate file
    ];

    const result = calculateAdoption(matches, 5);
    expect(result.adoptionPercent).toBe(60);
    expect(result.matchingFiles).toHaveLength(3);
    expect(result.confidence).toBe("MEDIUM-CONF");
  });

  it("assigns HIGH-CONF for >=80% adoption and >=10 applicable files", () => {
    const matches: RuleMatch[] = Array.from({ length: 9 }, (_, i) => ({
      ruleId: "test-rule",
      file: `file${i}.ts`,
      line: 1,
      column: 0,
      text: "x",
      message: "m",
      severity: "info",
    }));

    const result = calculateAdoption(matches, 10);
    expect(result.adoptionPercent).toBe(90);
    expect(result.confidence).toBe("HIGH-CONF");
  });

  it("assigns LOW-CONF for <50% adoption", () => {
    const matches: RuleMatch[] = [
      {
        ruleId: "test-rule",
        file: "a.ts",
        line: 1,
        column: 0,
        text: "x",
        message: "m",
        severity: "info",
      },
    ];

    const result = calculateAdoption(matches, 5);
    expect(result.adoptionPercent).toBe(20);
    expect(result.confidence).toBe("LOW-CONF");
  });

  it("assigns MEDIUM-CONF for 50-79% adoption (even with >=10 files)", () => {
    const matches: RuleMatch[] = Array.from({ length: 6 }, (_, i) => ({
      ruleId: "test-rule",
      file: `file${i}.ts`,
      line: 1,
      column: 0,
      text: "x",
      message: "m",
      severity: "info",
    }));

    const result = calculateAdoption(matches, 10);
    expect(result.adoptionPercent).toBe(60);
    expect(result.confidence).toBe("MEDIUM-CONF");
  });
});

describe("detectConflicts", () => {
  it("identifies competing pairs where both sides exceed 20% adoption", () => {
    const conventions: ConventionResult[] = [
      {
        ruleId: "prefer-named-exports",
        name: "Prefer Named Exports",
        category: "exports",
        matchingFiles: ["a.ts", "b.ts", "c.ts"],
        totalApplicableFiles: 5,
        adoptionPercent: 60,
        confidence: "MEDIUM-CONF",
        trend: "Stable",
        evidence: [],
      },
      {
        ruleId: "detect-default-export",
        name: "Default Export",
        category: "exports",
        matchingFiles: ["d.ts", "e.ts"],
        totalApplicableFiles: 5,
        adoptionPercent: 40,
        confidence: "LOW-CONF",
        trend: "Stable",
        evidence: [],
      },
    ];

    const conflicts = detectConflicts(conventions);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]!.label).toBe("Named vs Default Exports");
    expect(conflicts[0]!.patternA.adoption).toBe(60);
    expect(conflicts[0]!.patternB.adoption).toBe(40);
  });

  it("returns empty array when no competing pair both exceed 20%", () => {
    const conventions: ConventionResult[] = [
      {
        ruleId: "prefer-named-exports",
        name: "Prefer Named Exports",
        category: "exports",
        matchingFiles: ["a.ts", "b.ts", "c.ts", "d.ts"],
        totalApplicableFiles: 5,
        adoptionPercent: 80,
        confidence: "MEDIUM-CONF",
        trend: "Stable",
        evidence: [],
      },
      {
        ruleId: "detect-default-export",
        name: "Default Export",
        category: "exports",
        matchingFiles: ["e.ts"],
        totalApplicableFiles: 5,
        adoptionPercent: 20,
        confidence: "LOW-CONF",
        trend: "Stable",
        evidence: [],
      },
    ];

    const conflicts = detectConflicts(conventions);
    expect(conflicts).toHaveLength(0);
  });
});

describe("buildEvidence", () => {
  it("returns max 3 entries with 1-based line numbers", () => {
    const matches: RuleMatch[] = Array.from({ length: 5 }, (_, i) => ({
      ruleId: "test-rule",
      file: `file${i}.ts`,
      line: i + 1, // 1-based
      column: 0,
      text: "some text",
      message: "Test message",
      severity: "info",
    }));

    const evidence = buildEvidence(matches, 3);
    expect(evidence).toHaveLength(3);
    evidence.forEach((e) => {
      expect(e.line).toBeGreaterThanOrEqual(1);
      expect(typeof e.file).toBe("string");
      expect(typeof e.description).toBe("string");
      expect(e.description.length).toBeLessThanOrEqual(80);
    });
  });

  it("returns fewer entries when matches are less than maxEvidence", () => {
    const matches: RuleMatch[] = [
      {
        ruleId: "test-rule",
        file: "a.ts",
        line: 1,
        column: 0,
        text: "x",
        message: "m",
        severity: "info",
      },
    ];

    const evidence = buildEvidence(matches, 3);
    expect(evidence).toHaveLength(1);
  });
});

describe("runConventionScan", () => {
  it("returns conventions with adoption > 0 for fixture project", () => {
    const result = runConventionScan(FIXTURE_DIR, RULES_DIR);
    expect(result.conventions.length).toBeGreaterThan(0);
    expect(result.totalRulesEvaluated).toBeGreaterThan(0);
    expect(result.totalConventionsDetected).toBeGreaterThan(0);

    // Check all conventions have valid fields
    for (const conv of result.conventions) {
      expect(conv.ruleId).toBeTruthy();
      expect(conv.name).toBeTruthy();
      expect(conv.adoptionPercent).toBeGreaterThan(0);
      expect(conv.trend).toBe("Stable");
      expect(conv.evidence.length).toBeGreaterThan(0);
      expect(conv.evidence.length).toBeLessThanOrEqual(3);
    }
  });

  it("detects named exports in good-patterns files (false positive check)", () => {
    const result = runConventionScan(FIXTURE_DIR, RULES_DIR);
    const namedExports = result.conventions.find(
      (c) => c.ruleId === "prefer-named-exports",
    );
    expect(namedExports).toBeDefined();
    expect(namedExports!.adoptionPercent).toBeGreaterThan(0);

    // All good-patterns files should match named exports
    const goodPatternFiles = namedExports!.matchingFiles.filter(
      (f) => f.includes("good-patterns"),
    );
    expect(goodPatternFiles.length).toBeGreaterThanOrEqual(3);
  });

  it("detects default exports in bad-patterns files (false positive check)", () => {
    const result = runConventionScan(FIXTURE_DIR, RULES_DIR);
    const defaultExports = result.conventions.find(
      (c) => c.ruleId === "detect-default-export",
    );
    expect(defaultExports).toBeDefined();

    // Should match bad-patterns/legacy.ts and mixed/hybrid.ts
    const badPatternFiles = defaultExports!.matchingFiles.filter(
      (f) => f.includes("bad-patterns") || f.includes("mixed"),
    );
    expect(badPatternFiles.length).toBeGreaterThanOrEqual(2);
  });
});

describe("COMPETING_PAIRS", () => {
  it("contains at least 4 competing pairs", () => {
    expect(COMPETING_PAIRS.length).toBeGreaterThanOrEqual(4);
  });

  it("includes Named vs Default Exports pair", () => {
    const pair = COMPETING_PAIRS.find(
      (p) => p.label === "Named vs Default Exports",
    );
    expect(pair).toBeDefined();
    expect(pair!.a).toBe("prefer-named-exports");
    expect(pair!.b).toBe("detect-default-export");
  });

  it("includes Async/Await vs .then() Chains pair", () => {
    const pair = COMPETING_PAIRS.find(
      (p) => p.label === "Async/Await vs .then() Chains",
    );
    expect(pair).toBeDefined();
    expect(pair!.a).toBe("detect-async-await");
    expect(pair!.b).toBe("detect-promise-then");
  });
});

describe("countApplicableFiles extended exclusion", () => {
  let tmpDir: string;

  function setupTempProject(files: string[]): void {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "codescope-runner-test-"));
    for (const f of files) {
      const fullPath = path.join(tmpDir, f);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, "// placeholder");
    }
  }

  it("excludes config files (vitest.config.ts, tsconfig.app.ts)", () => {
    setupTempProject([
      "src/app.ts",
      "src/utils.ts",
      "vitest.config.ts",
      "tsconfig.app.ts",
    ]);

    const count = countApplicableFiles(tmpDir, "TypeScript");
    // Should count src/app.ts and src/utils.ts only (2), not config files
    expect(count).toBe(2);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("excludes generated files (schema.generated.ts, api.gen.ts)", () => {
    setupTempProject([
      "src/app.ts",
      "src/schema.generated.ts",
      "src/api.gen.ts",
    ]);

    const count = countApplicableFiles(tmpDir, "TypeScript");
    // Should count only src/app.ts (1)
    expect(count).toBe(1);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("excludes deprecated files (old-api.deprecated.ts, legacy-handler.ts)", () => {
    setupTempProject([
      "src/app.ts",
      "src/old-api.deprecated.ts",
      "src/legacy-handler.ts",
    ]);

    const count = countApplicableFiles(tmpDir, "TypeScript");
    // Should count only src/app.ts (1)
    expect(count).toBe(1);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
