// ---------------------------------------------------------------------------
// Tests for PIPE-02: Failure Classification — eval-agent applies classifyFinding
// ---------------------------------------------------------------------------
// Verifies that parseEvalFindings (in eval-agent.ts) populates the
// classification field on each EvalFinding using classifyFinding from
// src/eval/classifier.ts.  This is the eval-side coverage for PIPE-02.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import { parseEvalFindings } from "../../src/eval/eval-agent.js";
import type { EvalFinding } from "../../src/eval/types.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRawFindingJson(overrides: {
  criterion: string;
  file?: string;
  line?: number;
  description?: string;
  severity?: string;
  category?: string;
  evidence?: string;
}): object {
  return {
    criterion: overrides.criterion,
    file: overrides.file ?? "src/example.ts",
    line: overrides.line ?? 10,
    description: overrides.description ?? "Test finding",
    severity: overrides.severity ?? "ERROR",
    category: overrides.category ?? "incorrect_implementation",
    evidence: overrides.evidence ?? "some evidence",
  };
}

function rawJson(findings: object[]): string {
  return JSON.stringify(findings);
}

// ---------------------------------------------------------------------------
// parseEvalFindings — classification field (PIPE-02)
// ---------------------------------------------------------------------------

describe("parseEvalFindings — classification field (PIPE-02)", () => {
  it("attaches SCOPE_DRIFT classification to scope_compliance findings", () => {
    const raw = rawJson([makeRawFindingJson({ criterion: "scope_compliance" })]);
    const findings = parseEvalFindings(raw);

    expect(findings).toHaveLength(1);
    expect(findings[0].classification).toBe("SCOPE_DRIFT");
  });

  it("attaches PLAN_GAP classification to completeness findings", () => {
    const raw = rawJson([makeRawFindingJson({ criterion: "completeness" })]);
    const findings = parseEvalFindings(raw);

    expect(findings).toHaveLength(1);
    expect(findings[0].classification).toBe("PLAN_GAP");
  });

  it("attaches CODE_BUG classification to correctness findings", () => {
    const raw = rawJson([makeRawFindingJson({ criterion: "correctness" })]);
    const findings = parseEvalFindings(raw);

    expect(findings).toHaveLength(1);
    expect(findings[0].classification).toBe("CODE_BUG");
  });

  it("attaches CONVENTION_MISS classification to convention_adherence findings", () => {
    const raw = rawJson([makeRawFindingJson({ criterion: "convention_adherence" })]);
    const findings = parseEvalFindings(raw);

    expect(findings).toHaveLength(1);
    expect(findings[0].classification).toBe("CONVENTION_MISS");
  });

  it("populates classification on all findings in a mixed batch", () => {
    const raw = rawJson([
      makeRawFindingJson({ criterion: "scope_compliance", file: "src/a.ts" }),
      makeRawFindingJson({ criterion: "completeness", file: "src/b.ts" }),
      makeRawFindingJson({ criterion: "correctness", file: "src/c.ts" }),
      makeRawFindingJson({ criterion: "convention_adherence", file: "src/d.ts" }),
    ]);
    const findings = parseEvalFindings(raw);

    expect(findings).toHaveLength(4);
    const classifiedBy = (criterion: string) =>
      findings.find((f) => f.criterion === criterion)?.classification;

    expect(classifiedBy("scope_compliance")).toBe("SCOPE_DRIFT");
    expect(classifiedBy("completeness")).toBe("PLAN_GAP");
    expect(classifiedBy("correctness")).toBe("CODE_BUG");
    expect(classifiedBy("convention_adherence")).toBe("CONVENTION_MISS");
  });

  it("retains all original EvalFinding fields alongside the classification", () => {
    const raw = rawJson([
      makeRawFindingJson({
        criterion: "correctness",
        file: "src/auth.ts",
        line: 42,
        description: "Null pointer risk",
        severity: "ERROR",
        evidence: "obj.field accessed without guard",
      }),
    ]);
    const findings = parseEvalFindings(raw);

    const f = findings[0];
    expect(f.criterion).toBe("correctness");
    expect(f.file).toBe("src/auth.ts");
    expect(f.line).toBe(42);
    expect(f.description).toBe("Null pointer risk");
    expect(f.severity).toBe("ERROR");
    expect(f.evidence).toBe("obj.field accessed without guard");
    expect(f.classification).toBe("CODE_BUG");
  });

  it("returns empty array for empty JSON input", () => {
    expect(parseEvalFindings("[]")).toHaveLength(0);
  });

  it("each finding has classification defined (never undefined)", () => {
    const raw = rawJson([
      makeRawFindingJson({ criterion: "correctness" }),
      makeRawFindingJson({ criterion: "completeness" }),
    ]);
    const findings = parseEvalFindings(raw);

    for (const finding of findings) {
      expect(finding.classification).toBeDefined();
    }
  });
});
