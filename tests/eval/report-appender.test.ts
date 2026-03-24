// ---------------------------------------------------------------------------
// Tests for report-appender.ts
// ---------------------------------------------------------------------------
// Per 06-01-PLAN.md Task 2 behavior specifications.
// ---------------------------------------------------------------------------

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type {
  EvalResult,
  EvalCriterionResult,
  EvalFinding,
  DebugCycleResult,
} from "../../src/eval/types.js";
import {
  appendEvalSection,
  appendDebugCycleSection,
} from "../../src/eval/report-appender.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eval-report-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createReportFile(content: string): string {
  const reportPath = path.join(tmpDir, "test-report.md");
  fs.writeFileSync(reportPath, content, "utf-8");
  return reportPath;
}

function makeFinding(overrides?: Partial<EvalFinding>): EvalFinding {
  return {
    id: "eval-scope_compliance-src-handler-ts-40",
    criterion: "scope_compliance",
    category: "missing_implementation",
    file: "src/handler.ts",
    line: 42,
    description: "Missing error handling in handler",
    severity: "ERROR",
    evidence: "No try-catch block around async operation",
    ...overrides,
  };
}

function makeEvalResult(overrides?: Partial<EvalResult>): EvalResult {
  return {
    criteria: [
      {
        criterion: "scope_compliance",
        status: "FAIL",
        findings: [makeFinding()],
      },
      {
        criterion: "convention_adherence",
        status: "PASS",
        findings: [
          makeFinding({
            id: "eval-convention-1",
            criterion: "convention_adherence",
            severity: "WARN",
            description: "Uses callbacks",
            evidence: "callback(null)",
            goldenFileRef: "src/golden.ts",
          }),
        ],
      },
      {
        criterion: "completeness",
        status: "PASS",
        findings: [],
      },
      {
        criterion: "correctness",
        status: "SKIPPED",
        findings: [],
        detail: "Disabled in config",
      },
    ],
    findings: [
      makeFinding(),
      makeFinding({
        id: "eval-convention-1",
        criterion: "convention_adherence",
        severity: "WARN",
        description: "Uses callbacks",
        evidence: "callback(null)",
        goldenFileRef: "src/golden.ts",
      }),
    ],
    overallStatus: "FAIL",
    timing_ms: 5432,
    ...overrides,
  };
}

function makeDebugCycleResult(
  overrides?: Partial<DebugCycleResult>,
): DebugCycleResult {
  return {
    maxCycles: 3,
    findingsTargeted: 2,
    fixPlans: [
      {
        description: "Fix error handling in handler",
        files: ["src/handler.ts"],
        findingsAddressed: ["eval-scope_compliance-src-handler-ts-40"],
        result: "fixed",
        commitHash: "abc1234",
        commitMessage: "fix: add error handling",
      },
    ],
    reVerify: { filesVerified: 1, newIssues: 0 },
    reEval: { findingsEvaluated: 2, resolved: 1, remaining: 1, newFromFix: 0 },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// appendEvalSection
// ---------------------------------------------------------------------------

describe("appendEvalSection", () => {
  it('appends "## Eval Results" H2 heading to existing report', () => {
    const reportPath = createReportFile("# Verify Report\n\nExisting content.");
    const evalResult = makeEvalResult();

    appendEvalSection(reportPath, evalResult, "claude-sonnet");

    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("## Eval Results");
  });

  it("includes evaluator model name, criteria count, duration", () => {
    const reportPath = createReportFile("# Verify Report");
    const evalResult = makeEvalResult();

    appendEvalSection(reportPath, evalResult, "claude-sonnet");

    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("**Evaluator:** claude-sonnet");
    expect(content).toContain("**Criteria evaluated:**");
    expect(content).toContain("**Duration:**");
  });

  it("includes per-criterion H3 sections with verdict and findings", () => {
    const reportPath = createReportFile("# Verify Report");
    const evalResult = makeEvalResult();

    appendEvalSection(reportPath, evalResult, "claude-sonnet");

    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("### Scope Compliance");
    expect(content).toContain("### Convention Adherence");
    expect(content).toContain("### Completeness");
    expect(content).toContain("### Correctness");
    expect(content).toContain("**Verdict:**");
  });

  it("includes summary table with criterion/verdict/errors/warnings/info columns", () => {
    const reportPath = createReportFile("# Verify Report");
    const evalResult = makeEvalResult();

    appendEvalSection(reportPath, evalResult, "claude-sonnet");

    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("### Eval Summary");
    expect(content).toContain("| Criterion | Verdict | Errors | Warnings | Info |");
    expect(content).toContain("**Total findings:**");
  });

  it('handles SKIPPED criterion with "Disabled in config" message', () => {
    const reportPath = createReportFile("# Verify Report");
    const evalResult = makeEvalResult();

    appendEvalSection(reportPath, evalResult, "claude-sonnet");

    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("[SKIPPED] Disabled in config");
    expect(content).toContain("eval.criteria.correctness");
  });

  it("preserves existing report content (appends, does not overwrite)", () => {
    const existingContent = "# Verify Report\n\nOriginal content here.";
    const reportPath = createReportFile(existingContent);
    const evalResult = makeEvalResult();

    appendEvalSection(reportPath, evalResult, "claude-sonnet");

    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("Original content here.");
    expect(content).toContain("## Eval Results");
  });
});

// ---------------------------------------------------------------------------
// appendDebugCycleSection
// ---------------------------------------------------------------------------

describe("appendDebugCycleSection", () => {
  it('appends "## Debug Cycle N" H2 heading', () => {
    const reportPath = createReportFile("# Verify Report\n\n## Eval Results\n");
    const cycleResult = makeDebugCycleResult();

    appendDebugCycleSection(reportPath, 1, cycleResult);

    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("## Debug Cycle 1");
  });

  it("includes fix plans, results, re-verify, re-eval subsections", () => {
    const reportPath = createReportFile("# Report");
    const cycleResult = makeDebugCycleResult();

    appendDebugCycleSection(reportPath, 1, cycleResult);

    const content = fs.readFileSync(reportPath, "utf-8");
    expect(content).toContain("**Cycle:** 1/3");
    expect(content).toContain("**Findings targeted:** 2");
    expect(content).toContain("**Fix plans:** 1");
    expect(content).toContain("Fix error handling in handler");
    expect(content).toContain("**Result:** fixed");
    expect(content).toContain("**Commit:** `abc1234`");
    expect(content).toContain("### Re-Verify Results");
    expect(content).toContain("**Files re-verified:** 1");
    expect(content).toContain("### Re-Eval Results");
    expect(content).toContain("**Resolved:** 1");
    expect(content).toContain("**Remaining:** 1");
  });
});
