// ---------------------------------------------------------------------------
// Tests for src/eval/classifier.ts
// ---------------------------------------------------------------------------
// Per 13-01-PLAN.md Task 1 behavior specifications.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import type { EvalFinding, EvalCriterion } from "../../src/eval/types.js";
import {
  classifyFinding,
  classifyFindings,
  CLASSIFICATION_PRIORITY,
  type FailureClassification,
} from "../../src/eval/classifier.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFinding(overrides: Partial<EvalFinding> = {}): EvalFinding {
  return {
    id: "test-finding-1",
    criterion: "correctness",
    category: "incorrect_implementation",
    file: "src/example.ts",
    line: 10,
    description: "Test finding",
    severity: "ERROR",
    evidence: "some evidence",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// classifyFinding
// ---------------------------------------------------------------------------

describe("classifyFinding", () => {
  it("classifies scope_compliance as SCOPE_DRIFT", () => {
    const finding = makeFinding({ criterion: "scope_compliance" });
    expect(classifyFinding(finding)).toBe("SCOPE_DRIFT");
  });

  it("classifies completeness as PLAN_GAP", () => {
    const finding = makeFinding({ criterion: "completeness" });
    expect(classifyFinding(finding)).toBe("PLAN_GAP");
  });

  it("classifies correctness as CODE_BUG", () => {
    const finding = makeFinding({ criterion: "correctness" });
    expect(classifyFinding(finding)).toBe("CODE_BUG");
  });

  it("classifies convention_adherence as CONVENTION_MISS", () => {
    const finding = makeFinding({ criterion: "convention_adherence" });
    expect(classifyFinding(finding)).toBe("CONVENTION_MISS");
  });
});

// ---------------------------------------------------------------------------
// classifyFindings (bulk)
// ---------------------------------------------------------------------------

describe("classifyFindings", () => {
  it("classifies an array of findings with different criteria", () => {
    const findings: EvalFinding[] = [
      makeFinding({ id: "f1", criterion: "scope_compliance" }),
      makeFinding({ id: "f2", criterion: "completeness" }),
      makeFinding({ id: "f3", criterion: "correctness" }),
      makeFinding({ id: "f4", criterion: "convention_adherence" }),
    ];

    const classified = classifyFindings(findings);

    expect(classified).toHaveLength(4);
    expect(classified[0].classification).toBe("SCOPE_DRIFT");
    expect(classified[1].classification).toBe("PLAN_GAP");
    expect(classified[2].classification).toBe("CODE_BUG");
    expect(classified[3].classification).toBe("CONVENTION_MISS");
  });

  it("retains all original fields on classified findings", () => {
    const finding = makeFinding({
      id: "retain-test",
      criterion: "correctness",
      file: "src/retain.ts",
      line: 42,
      description: "retained description",
      severity: "WARN",
      evidence: "retained evidence",
      goldenFileRef: "golden.ts",
    });

    const [classified] = classifyFindings([finding]);

    expect(classified.id).toBe("retain-test");
    expect(classified.criterion).toBe("correctness");
    expect(classified.file).toBe("src/retain.ts");
    expect(classified.line).toBe(42);
    expect(classified.description).toBe("retained description");
    expect(classified.severity).toBe("WARN");
    expect(classified.evidence).toBe("retained evidence");
    expect(classified.goldenFileRef).toBe("golden.ts");
    expect(classified.classification).toBe("CODE_BUG");
  });

  it("returns empty array for empty input", () => {
    expect(classifyFindings([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// CLASSIFICATION_PRIORITY
// ---------------------------------------------------------------------------

describe("CLASSIFICATION_PRIORITY", () => {
  it("has CODE_BUG as highest priority (0)", () => {
    expect(CLASSIFICATION_PRIORITY.CODE_BUG).toBe(0);
  });

  it("has CONVENTION_MISS as second priority (1)", () => {
    expect(CLASSIFICATION_PRIORITY.CONVENTION_MISS).toBe(1);
  });

  it("has PLAN_GAP as third priority (2)", () => {
    expect(CLASSIFICATION_PRIORITY.PLAN_GAP).toBe(2);
  });

  it("has SCOPE_DRIFT as lowest priority (3)", () => {
    expect(CLASSIFICATION_PRIORITY.SCOPE_DRIFT).toBe(3);
  });

  it("maintains ordering CODE_BUG < CONVENTION_MISS < PLAN_GAP < SCOPE_DRIFT", () => {
    expect(CLASSIFICATION_PRIORITY.CODE_BUG).toBeLessThan(
      CLASSIFICATION_PRIORITY.CONVENTION_MISS,
    );
    expect(CLASSIFICATION_PRIORITY.CONVENTION_MISS).toBeLessThan(
      CLASSIFICATION_PRIORITY.PLAN_GAP,
    );
    expect(CLASSIFICATION_PRIORITY.PLAN_GAP).toBeLessThan(
      CLASSIFICATION_PRIORITY.SCOPE_DRIFT,
    );
  });
});
