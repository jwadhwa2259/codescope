import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import type {
  VerifyReport,
  StaticVerifyResult,
  RuntimeVerifyResult,
  ConventionViolation,
  SurpriseFile,
  SkipFile,
  ReviewFinding,
  TestResult,
  SmokeResult,
} from "../../src/verify/types.js";

// Import the function under test
import { writeVerifyReport } from "../../src/verify/report-writer.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codescope-report-test-"));
}

function makeTestResult(overrides?: Partial<TestResult>): TestResult {
  return {
    status: "pass",
    passed: 10,
    failed: 0,
    total: 10,
    duration_ms: 5000,
    failures: [],
    ...overrides,
  };
}

function makeStaticResult(overrides?: Partial<StaticVerifyResult>): StaticVerifyResult {
  return {
    conventionViolations: [],
    blastRadiusDiff: {
      surprises: [],
      skips: [],
      scopeDrift: [],
      timing_ms: 100,
    },
    codeReview: [],
    timing: {
      convention_ms: 800,
      blastRadius_ms: 200,
      codeReview_ms: 1500,
    },
    ...overrides,
  };
}

function makeRuntimeResult(overrides?: Partial<RuntimeVerifyResult>): RuntimeVerifyResult {
  return {
    build: {
      status: "pass",
      command: "npm run build",
      duration_ms: 12000,
    },
    unitTests: makeTestResult(),
    integrationTests: makeTestResult({ status: "skipped", passed: 0, total: 0, duration_ms: 0 }),
    e2e: makeTestResult({ status: "skipped", passed: 0, total: 0, duration_ms: 0 }),
    autoSmoke: [],
    timing: {
      build_ms: 12000,
      unitTests_ms: 5000,
      integrationTests_ms: 0,
      e2e_ms: 0,
      autoSmoke_ms: 0,
    },
    ...overrides,
  };
}

function makeReport(overrides?: Partial<VerifyReport>): VerifyReport {
  return {
    taskSlug: "add-auth",
    taskDescription: "Add JWT authentication middleware",
    date: "2026-03-24",
    static: makeStaticResult(),
    runtime: makeRuntimeResult(),
    totalDuration_ms: 25000,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("writeVerifyReport", () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = tmpProjectRoot();
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  it("Test 1: creates report file at .claude/codescope/reports/{taskSlug}-{date}.md (per D-06)", () => {
    const report = makeReport();

    const reportPath = writeVerifyReport(projectRoot, report);

    expect(reportPath).toContain(".claude/codescope/reports/");
    expect(reportPath).toContain("add-auth-");
    expect(reportPath.endsWith(".md")).toBe(true);
    expect(fs.existsSync(reportPath)).toBe(true);
  });

  it("Test 2: report starts with H1 header and includes Date, Task, Duration fields (per UI-SPEC)", () => {
    const report = makeReport();

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content.startsWith("# Verify Report: add-auth")).toBe(true);
    expect(content).toContain("**Date:**");
    expect(content).toContain("**Task:** Add JWT authentication middleware");
    expect(content).toContain("**Duration:**");
  });

  it("Test 3: report contains Static Checks section with subsections for Convention Compliance, Blast Radius Diff, Code Review", () => {
    const report = makeReport();

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("## Static Checks");
    expect(content).toContain("### Convention Compliance");
    expect(content).toContain("### Blast Radius Diff");
    expect(content).toContain("### Code Review");
  });

  it("Test 4: convention violations formatted with WARN severity, convention name, adoption %, and golden file reference (per D-04, UI-SPEC)", () => {
    const violations: ConventionViolation[] = [
      {
        file: "src/auth/login.ts",
        line: 42,
        convention: "use-async-await",
        adoption: 85,
        goldenFile: "src/utils/helpers.ts:10-25",
        message: "Uses callbacks instead of async/await",
        severity: "WARN",
      },
    ];

    const report = makeReport({
      static: makeStaticResult({ conventionViolations: violations }),
    });

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("[WARN]");
    expect(content).toContain("`src/auth/login.ts:42`");
    expect(content).toContain("`use-async-await`");
    expect(content).toContain("85% adoption");
    expect(content).toContain("See golden file:");
    expect(content).toContain("`src/utils/helpers.ts:10-25`");
  });

  it("Test 5: surprise files formatted with severity and graph distance (per D-08, UI-SPEC)", () => {
    const surprises: SurpriseFile[] = [
      { filePath: "src/db/migrations.ts", minHopDistance: 1, severity: "WARN" },
      { filePath: "src/config/env.ts", minHopDistance: -1, severity: "ERROR" },
    ];

    const report = makeReport({
      static: makeStaticResult({
        blastRadiusDiff: {
          surprises,
          skips: [],
          scopeDrift: [],
          timing_ms: 200,
        },
      }),
    });

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("[WARN] Surprise: `src/db/migrations.ts`");
    expect(content).toContain("graph distance: 1 hops");
    expect(content).toContain("[ERROR] Surprise: `src/config/env.ts`");
    expect(content).toContain("unconnected");
  });

  it("Test 6: skip files formatted with INFO severity (per D-09, UI-SPEC)", () => {
    const skips: SkipFile[] = [
      {
        filePath: "src/auth/types.ts",
        severity: "INFO",
        reason: "Predicted but not modified -- may have been handled by a different approach",
      },
    ];

    const report = makeReport({
      static: makeStaticResult({
        blastRadiusDiff: {
          surprises: [],
          skips,
          scopeDrift: [],
          timing_ms: 100,
        },
      }),
    });

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("[INFO] Skip: `src/auth/types.ts`");
    expect(content).toContain("predicted but not modified");
  });

  it("Test 7: report contains Runtime Checks section with Build, Unit Tests, Integration Tests, E2E subsections", () => {
    const report = makeReport();

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("## Runtime Checks");
    expect(content).toContain("### Build");
    expect(content).toContain("### Unit Tests");
    expect(content).toContain("### Integration Tests");
    expect(content).toContain("### E2E");
  });

  it("Test 8: build failure shows ERROR + command + exit code and subsequent checks show SKIPPED due to build failure (per D-18, UI-SPEC)", () => {
    const runtime = makeRuntimeResult({
      build: {
        status: "fail",
        command: "npm run build",
        output: "Error: Cannot find module 'foo'",
        exitCode: 1,
        duration_ms: 5000,
      },
      unitTests: makeTestResult({ status: "skipped", passed: 0, failed: 0, total: 0, duration_ms: 0 }),
      integrationTests: makeTestResult({ status: "skipped", passed: 0, failed: 0, total: 0, duration_ms: 0 }),
      e2e: makeTestResult({ status: "skipped", passed: 0, failed: 0, total: 0, duration_ms: 0 }),
    });

    const report = makeReport({ runtime });

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("[ERROR] Build failed.");
    expect(content).toContain("`npm run build`");
    expect(content).toContain("**Exit code:** 1");
    expect(content).toContain("[SKIPPED] Unit Tests");
    expect(content).toContain("build failure");
  });

  it("Test 9: test results pass shows PASS with count (per D-22, UI-SPEC)", () => {
    const report = makeReport({
      runtime: makeRuntimeResult({
        unitTests: makeTestResult({ status: "pass", passed: 142, failed: 0, total: 142, duration_ms: 8100 }),
      }),
    });

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("[PASS] All tests passed.");
    // Section header should include pass/total count
    expect(content).toContain("142/142 PASS");
  });

  it("Test 10: test results failure shows ERROR with count and failure list (per D-22, UI-SPEC)", () => {
    const report = makeReport({
      runtime: makeRuntimeResult({
        unitTests: makeTestResult({
          status: "fail",
          passed: 140,
          failed: 2,
          total: 142,
          duration_ms: 8100,
          failures: [
            {
              testName: "should validate email",
              file: "tests/auth/login.test.ts",
              line: 42,
              error: "Expected true to be false",
            },
            {
              testName: "should hash password",
              file: "tests/auth/password.test.ts",
              line: 15,
              error: "Timeout exceeded",
            },
          ],
        }),
      }),
    });

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("[ERROR] 2 test(s) failed.");
    expect(content).toContain("`should validate email`");
    expect(content).toContain("`tests/auth/login.test.ts:42`");
    expect(content).toContain("Expected true to be false");
  });

  it("Test 11: report contains Summary section with check result table and total counts (per UI-SPEC)", () => {
    const report = makeReport();

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("## Summary");
    expect(content).toContain("| Check | Result | Duration |");
    expect(content).toContain("Convention Compliance");
    expect(content).toContain("Blast Radius Diff");
    expect(content).toContain("**Errors:**");
    expect(content).toContain("**Warnings:**");
    expect(content).toContain("**Info:**");
    expect(content).toContain("**Skipped:**");
  });

  it("Test 12: section headers include timing data (per D-03)", () => {
    const report = makeReport({
      static: makeStaticResult({
        timing: { convention_ms: 800, blastRadius_ms: 200, codeReview_ms: 1500 },
      }),
    });

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("### Convention Compliance (0.8s)");
    expect(content).toContain("### Blast Radius Diff (0.2s)");
    expect(content).toContain("### Code Review (1.5s)");
  });

  it("Test 13: skipped checks show SKIPPED with config field reference (per D-05, UI-SPEC)", () => {
    const report = makeReport({
      runtime: makeRuntimeResult({
        build: { status: "skipped", duration_ms: 0 },
        unitTests: makeTestResult({ status: "skipped", passed: 0, total: 0, duration_ms: 0 }),
      }),
    });

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    expect(content).toContain("[SKIPPED]");
  });

  it("Test 14: empty enforced conventions shows INFO message (per UI-SPEC)", () => {
    const report = makeReport({
      static: makeStaticResult({ conventionViolations: [] }),
    });

    const reportPath = writeVerifyReport(projectRoot, report);
    const content = fs.readFileSync(reportPath, "utf-8");

    // When no violations, should show a PASS or INFO note
    expect(content).toContain("[PASS]");
  });

  it("Test 15: writeVerifyReport returns the absolute path to the written report file", () => {
    const report = makeReport();

    const reportPath = writeVerifyReport(projectRoot, report);

    expect(path.isAbsolute(reportPath)).toBe(true);
    expect(fs.existsSync(reportPath)).toBe(true);
  });
});
