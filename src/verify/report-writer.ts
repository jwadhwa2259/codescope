// ---------------------------------------------------------------------------
// Verify Report Writer: unified markdown report assembly
// ---------------------------------------------------------------------------
// Produces a markdown verify report matching the UI-SPEC copywriting contract
// exactly: Static Checks, Runtime Checks, Auto-Smoke Results, and Summary.
//
// Per D-01, D-03, D-04, D-05, D-06, D-08, D-09, D-10, D-18, D-22, D-24.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { getCodescopePath } from "../utils/paths.js";
import type {
  VerifyReport,
  ConventionViolation,
  SurpriseFile,
  SkipFile,
  TestResult,
  SmokeResult,
  ReviewFinding,
} from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Write a unified verify report to disk.
 *
 * @param projectRoot - Project root directory
 * @param report - The verify report data
 * @returns Absolute path to the written report file
 */
export function writeVerifyReport(
  projectRoot: string,
  report: VerifyReport,
): string {
  const csPath = getCodescopePath(projectRoot);
  const reportsDir = path.join(csPath, "reports");
  fs.mkdirSync(reportsDir, { recursive: true });

  // Filename per D-06: {taskSlug}-{ISO-date}.md
  const dateStr = new Date().toISOString().split("T")[0];
  const filename = `${report.taskSlug}-${dateStr}.md`;
  const reportPath = path.join(reportsDir, filename);

  // Build report sections
  const sections: string[] = [];

  sections.push(buildHeader(report));
  sections.push(buildStaticChecks(report));
  sections.push(buildRuntimeChecks(report));
  sections.push(buildAutoSmokeResults(report));
  sections.push(buildSummary(report));

  const content = sections.join("\n\n");
  fs.writeFileSync(reportPath, content, "utf-8");

  // Write JSON sidecar for structured eval consumption (VRFY-08, EVAL-01, EVAL-03)
  const jsonSidecarPath = reportPath.replace(/\.md$/, ".json");
  fs.writeFileSync(
    jsonSidecarPath,
    JSON.stringify({ static: report.static, runtime: report.runtime }, null, 2),
    "utf-8",
  );

  return reportPath;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function buildHeader(report: VerifyReport): string {
  return [
    `# Verify Report: ${report.taskSlug}`,
    "",
    `**Date:** ${report.date}`,
    `**Task:** ${report.taskDescription}`,
    `**Duration:** ${formatDuration(report.totalDuration_ms)}`,
  ].join("\n");
}

function buildStaticChecks(report: VerifyReport): string {
  const lines: string[] = ["## Static Checks"];

  // Convention Compliance
  lines.push("");
  lines.push(
    `### Convention Compliance (${formatDuration(report.static.timing.convention_ms)})`,
  );
  lines.push("");

  if (report.static.conventionViolations.length === 0) {
    lines.push("[PASS] No convention violations found.");
  } else {
    for (const v of report.static.conventionViolations) {
      lines.push(formatConventionViolation(v));
    }
  }

  // Blast Radius Diff
  lines.push("");
  lines.push(
    `### Blast Radius Diff (${formatDuration(report.static.timing.blastRadius_ms)})`,
  );
  lines.push("");

  const brd = report.static.blastRadiusDiff;
  const hasBrdContent =
    brd.surprises.length > 0 ||
    brd.skips.length > 0 ||
    brd.scopeDrift.length > 0;

  if (!hasBrdContent) {
    lines.push("[PASS] No blast radius discrepancies found.");
  } else {
    for (const s of brd.surprises) {
      lines.push(formatSurpriseFile(s));
    }
    for (const s of brd.skips) {
      lines.push(formatSkipFile(s));
    }
    for (const drift of brd.scopeDrift) {
      lines.push(
        `- [WARN] Possible scope drift: \`${drift}\` not covered by scope contract`,
      );
    }
  }

  // Code Review
  lines.push("");
  lines.push(
    `### Code Review (${formatDuration(report.static.timing.codeReview_ms)})`,
  );
  lines.push("");

  if (report.static.codeReview.length === 0) {
    lines.push("[PASS] No code review findings.");
  } else {
    const findings = report.static.codeReview;
    const displayed = findings.slice(0, 10);
    const omitted = findings.length - displayed.length;

    for (const f of displayed) {
      lines.push(formatReviewFinding(f));
    }

    if (omitted > 0) {
      lines.push("");
      lines.push(`_${omitted} additional minor findings omitted._`);
    }
  }

  return lines.join("\n");
}

function buildRuntimeChecks(report: VerifyReport): string {
  const lines: string[] = ["## Runtime Checks"];
  const rt = report.runtime;
  const buildFailed = rt.build.status === "fail";

  // Build
  lines.push("");
  lines.push(
    `### Build (${formatDuration(rt.build.duration_ms)})`,
  );
  lines.push("");

  if (rt.build.status === "skipped") {
    lines.push(
      "[SKIPPED] Build: No build_command configured in config.yml. Run /codescope:settings to configure.",
    );
  } else if (rt.build.status === "fail") {
    lines.push("[ERROR] Build failed.");
    lines.push("");
    if (rt.build.command) {
      lines.push(`**Command:** \`${rt.build.command}\``);
    }
    if (rt.build.exitCode !== undefined) {
      lines.push(`**Exit code:** ${rt.build.exitCode}`);
    }
    if (rt.build.output) {
      lines.push("");
      lines.push("**Output (last 500 lines):**");
      lines.push("```");
      lines.push(rt.build.output);
      lines.push("```");
    }
  } else if (rt.build.status === "pass") {
    lines.push("[PASS] Build succeeded.");
    lines.push("");
    if (rt.build.command) {
      lines.push(`**Command:** \`${rt.build.command}\``);
    }
  }

  // Unit Tests
  lines.push("");
  lines.push(buildTestSection("Unit Tests", rt.unitTests, buildFailed));

  // Integration Tests
  lines.push("");
  lines.push(
    buildTestSection("Integration Tests", rt.integrationTests, buildFailed),
  );

  // E2E
  lines.push("");
  lines.push(buildTestSection("E2E", rt.e2e, buildFailed));

  return lines.join("\n");
}

function buildTestSection(
  label: string,
  result: TestResult,
  buildFailed: boolean,
): string {
  const lines: string[] = [];

  if (buildFailed && result.status === "skipped") {
    lines.push(
      `### ${label} (${formatDuration(result.duration_ms)})`,
    );
    lines.push("");
    lines.push(`[SKIPPED] ${label} -- skipped due to build failure`);
    return lines.join("\n");
  }

  if (result.status === "skipped") {
    lines.push(
      `### ${label} (${formatDuration(result.duration_ms)})`,
    );
    lines.push("");
    lines.push(
      `[SKIPPED] ${label}: Not configured in config.yml. Run /codescope:settings to configure.`,
    );
    return lines.join("\n");
  }

  if (result.status === "unavailable") {
    lines.push(`### ${label}`);
    lines.push("");
    lines.push(`[SKIPPED] ${label}: Not available.`);
    return lines.join("\n");
  }

  // Build the header with pass/total count
  const headerSuffix =
    result.status === "fail"
      ? `${result.passed}/${result.total} PASS, ${result.failed} FAIL`
      : `${result.passed}/${result.total} PASS`;

  lines.push(
    `### ${label}: ${headerSuffix} (${formatDuration(result.duration_ms)})`,
  );
  lines.push("");

  if (result.status === "pass") {
    lines.push("[PASS] All tests passed.");
  } else if (result.status === "fail") {
    lines.push(`[ERROR] ${result.failed} test(s) failed.`);
    lines.push("");
    lines.push("**Failed tests:**");
    for (const failure of result.failures) {
      lines.push(
        `- \`${failure.testName}\` at \`${failure.file}:${failure.line}\` -- ${failure.error}`,
      );
    }
  }

  return lines.join("\n");
}

function buildAutoSmokeResults(report: VerifyReport): string {
  const lines: string[] = [];
  const smoke = report.runtime.autoSmoke;
  const smokeTiming = report.runtime.timing.autoSmoke_ms ?? 0;

  lines.push(`## Auto-Smoke Results (${formatDuration(smokeTiming)})`);
  lines.push("");

  if (smoke.length === 0) {
    lines.push("[INFO] No new endpoints detected for smoke testing.");
  } else {
    lines.push(`**New endpoints detected:** ${smoke.length}`);
    lines.push("");
    for (const s of smoke) {
      lines.push(formatSmokeResult(s));
    }
  }

  return lines.join("\n");
}

function buildSummary(report: VerifyReport): string {
  const lines: string[] = ["## Summary"];
  lines.push("");
  lines.push("| Check | Result | Duration |");
  lines.push("|-------|--------|----------|");

  // Convention Compliance
  const conventionResult =
    report.static.conventionViolations.length === 0
      ? "PASS"
      : `${report.static.conventionViolations.length} violations`;
  lines.push(
    `| Convention Compliance | ${conventionResult} | ${formatDuration(report.static.timing.convention_ms)} |`,
  );

  // Blast Radius Diff
  const brd = report.static.blastRadiusDiff;
  const brdParts: string[] = [];
  if (brd.surprises.length === 0 && brd.skips.length === 0) {
    brdParts.push("PASS");
  } else {
    if (brd.surprises.length > 0) {
      brdParts.push(`${brd.surprises.length} surprises`);
    }
    if (brd.skips.length > 0) {
      brdParts.push(`${brd.skips.length} skips`);
    }
  }
  lines.push(
    `| Blast Radius Diff | ${brdParts.join(", ")} | ${formatDuration(report.static.timing.blastRadius_ms)} |`,
  );

  // Code Review
  const reviewResult =
    report.static.codeReview.length === 0
      ? "PASS"
      : `${report.static.codeReview.length} findings`;
  lines.push(
    `| Code Review | ${reviewResult} | ${formatDuration(report.static.timing.codeReview_ms)} |`,
  );

  // Build
  const buildResult = formatCheckStatus(report.runtime.build.status);
  lines.push(
    `| Build | ${buildResult} | ${formatDuration(report.runtime.build.duration_ms)} |`,
  );

  // Unit Tests
  lines.push(
    `| Unit Tests | ${formatTestSummary(report.runtime.unitTests)} | ${formatDuration(report.runtime.unitTests.duration_ms)} |`,
  );

  // Integration Tests
  lines.push(
    `| Integration Tests | ${formatTestSummary(report.runtime.integrationTests)} | ${formatDuration(report.runtime.integrationTests.duration_ms)} |`,
  );

  // E2E
  lines.push(
    `| E2E | ${formatTestSummary(report.runtime.e2e)} | ${formatDuration(report.runtime.e2e.duration_ms)} |`,
  );

  // Auto-Smoke
  const smoke = report.runtime.autoSmoke;
  const smokePassCount = smoke.filter((s) => s.passed).length;
  const smokeResult =
    smoke.length === 0
      ? "SKIPPED"
      : `${smokePassCount}/${smoke.length} endpoints reachable`;
  const smokeTiming = report.runtime.timing.autoSmoke_ms ?? 0;
  lines.push(
    `| Auto-Smoke | ${smokeResult} | ${formatDuration(smokeTiming)} |`,
  );

  lines.push("");
  lines.push(
    `**Total verification time:** ${formatDuration(report.totalDuration_ms)}`,
  );

  const counts = countSeverities(report);
  lines.push(
    `**Errors:** ${counts.errors} | **Warnings:** ${counts.warnings} | **Info:** ${counts.info} | **Skipped:** ${counts.skipped}`,
  );

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatConventionViolation(v: ConventionViolation): string {
  const lines = [
    `- [WARN] \`${v.file}:${v.line}\` -- Violates \`${v.convention}\` (${v.adoption}% adoption)`,
  ];
  if (v.goldenFile) {
    lines.push(`  See golden file: \`${v.goldenFile}\` for correct pattern`);
  }
  return lines.join("\n");
}

function formatSurpriseFile(s: SurpriseFile): string {
  const distanceStr =
    s.minHopDistance === -1
      ? "unconnected"
      : `${s.minHopDistance} hops from nearest predicted file`;
  return `- [${s.severity}] Surprise: \`${s.filePath}\` changed but not in plan (graph distance: ${distanceStr})`;
}

function formatSkipFile(s: SkipFile): string {
  return `- [INFO] Skip: \`${s.filePath}\` predicted but not modified -- may have been handled by a different approach or deemed unnecessary by execution agent`;
}

function formatReviewFinding(f: ReviewFinding): string {
  return `- [${f.severity}] \`${f.file}:${f.line}\` -- ${f.description}`;
}

function formatSmokeResult(s: SmokeResult): string {
  const statusStr =
    s.actualStatus !== null
      ? `${s.actualStatus}`
      : "no response";
  const passStr = s.passed ? "smoke pass" : "smoke fail";
  return `- [${s.severity}] \`${s.method} ${s.endpoint}\` -- ${statusStr} (${passStr})`;
}

function formatCheckStatus(status: string): string {
  switch (status) {
    case "pass":
      return "PASS";
    case "fail":
      return "FAIL";
    case "skipped":
      return "SKIPPED";
    default:
      return status.toUpperCase();
  }
}

function formatTestSummary(result: TestResult): string {
  if (result.status === "skipped") return "SKIPPED";
  if (result.status === "unavailable") return "SKIPPED";
  return `${result.passed}/${result.total} PASS`;
}

// ---------------------------------------------------------------------------
// Severity counting
// ---------------------------------------------------------------------------

function countSeverities(report: VerifyReport): {
  errors: number;
  warnings: number;
  info: number;
  skipped: number;
} {
  let errors = 0;
  let warnings = 0;
  let info = 0;
  let skipped = 0;

  // Convention violations are always WARN
  warnings += report.static.conventionViolations.length;

  // Blast radius diff
  for (const s of report.static.blastRadiusDiff.surprises) {
    if (s.severity === "ERROR") errors++;
    else if (s.severity === "WARN") warnings++;
    else info++;
  }
  info += report.static.blastRadiusDiff.skips.length;
  warnings += report.static.blastRadiusDiff.scopeDrift.length;

  // Code review
  for (const f of report.static.codeReview) {
    if (f.severity === "ERROR") errors++;
    else if (f.severity === "WARN") warnings++;
    else info++;
  }

  // Build
  if (report.runtime.build.status === "fail") errors++;
  if (report.runtime.build.status === "skipped") skipped++;

  // Tests
  const testResults = [
    report.runtime.unitTests,
    report.runtime.integrationTests,
    report.runtime.e2e,
  ];
  for (const t of testResults) {
    if (t.status === "fail") errors++;
    else if (t.status === "skipped") skipped++;
  }

  // Smoke
  for (const s of report.runtime.autoSmoke) {
    if (s.passed) info++;
    else warnings++;
  }

  return { errors, warnings, info, skipped };
}
