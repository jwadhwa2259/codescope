// ---------------------------------------------------------------------------
// Report Appender: append eval and debug cycle sections to verify report
// ---------------------------------------------------------------------------
// Per D-19: Eval appends `## Eval Results` section to existing verify report.
// Debug appends `## Debug Cycle N`. Single source of truth at
// `reports/[task]-[date].md`.
//
// Follows the section-builder pattern from verify/report-writer.ts.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import type {
  EvalResult,
  EvalCriterionResult,
  EvalFinding,
  EvalCriterion,
  DebugCycleResult,
} from "./types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CRITERION_DISPLAY_NAMES: Record<EvalCriterion, string> = {
  scope_compliance: "Scope Compliance",
  convention_adherence: "Convention Adherence",
  completeness: "Completeness",
  correctness: "Correctness",
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Append ## Eval Results section to an existing verify report file.
 * Matches 06-UI-SPEC.md "Eval Report Section" format exactly.
 *
 * @param reportPath - Path to the existing verify report file
 * @param evalResult - The eval result to append
 * @param modelName - Name of the evaluator model
 */
export function appendEvalSection(
  reportPath: string,
  evalResult: EvalResult,
  modelName: string,
): void {
  const lines: string[] = [];

  // Header
  lines.push("## Eval Results");
  lines.push("");
  lines.push(`**Evaluator:** ${modelName}`);

  // Count enabled (non-skipped) criteria
  const totalCriteria = evalResult.criteria.length;
  const evaluatedCriteria = evalResult.criteria.filter(
    (c) => c.status !== "SKIPPED",
  ).length;
  lines.push(`**Criteria evaluated:** ${evaluatedCriteria}/${totalCriteria}`);
  lines.push(`**Duration:** ${formatDuration(evalResult.timing_ms)}`);

  // Per-criterion sections
  for (const criterionResult of evalResult.criteria) {
    lines.push("");
    lines.push(`### ${formatCriterionName(criterionResult.criterion)}`);
    lines.push("");

    if (criterionResult.status === "SKIPPED") {
      lines.push(
        `[SKIPPED] Disabled in config. Enable via \`eval.criteria.${criterionResult.criterion}: true\` in config.yml.`,
      );
    } else {
      lines.push(`**Verdict:** [${criterionResult.status}]`);

      if (criterionResult.findings.length > 0) {
        lines.push("");
        for (const finding of criterionResult.findings) {
          lines.push(
            `- [${finding.severity}] \`${finding.file}:${finding.line}\` -- ${finding.description}`,
          );
          lines.push(`  Evidence: ${finding.evidence}`);
          if (finding.goldenFileRef) {
            lines.push(`  See golden file: \`${finding.goldenFileRef}\``);
          }
        }
      }
    }
  }

  // Summary table
  lines.push("");
  lines.push("### Eval Summary");
  lines.push("");
  lines.push("| Criterion | Verdict | Errors | Warnings | Info |");
  lines.push("|-----------|---------|--------|----------|------|");

  let totalErrors = 0;
  let totalWarnings = 0;
  let totalInfo = 0;

  for (const criterionResult of evalResult.criteria) {
    const errors = criterionResult.findings.filter(
      (f) => f.severity === "ERROR",
    ).length;
    const warnings = criterionResult.findings.filter(
      (f) => f.severity === "WARN",
    ).length;
    const info = criterionResult.findings.filter(
      (f) => f.severity === "INFO",
    ).length;

    totalErrors += errors;
    totalWarnings += warnings;
    totalInfo += info;

    const verdictStr = criterionResult.status;
    lines.push(
      `| ${formatCriterionName(criterionResult.criterion)} | ${verdictStr} | ${errors} | ${warnings} | ${info} |`,
    );
  }

  const totalFindings = totalErrors + totalWarnings + totalInfo;
  lines.push("");
  lines.push(
    `**Total findings:** ${totalFindings} | **Errors:** ${totalErrors} | **Warnings:** ${totalWarnings} | **Info:** ${totalInfo}`,
  );

  const section = lines.join("\n");
  fs.appendFileSync(reportPath, "\n\n" + section, "utf-8");
}

/**
 * Append ## Debug Cycle N section to an existing verify report file.
 * Matches 06-UI-SPEC.md "Debug Cycle Section" format.
 *
 * @param reportPath - Path to the existing verify report file
 * @param cycleNumber - The debug cycle number (1-based)
 * @param cycleResult - The debug cycle result data
 */
export function appendDebugCycleSection(
  reportPath: string,
  cycleNumber: number,
  cycleResult: DebugCycleResult,
): void {
  const lines: string[] = [];

  // Header
  lines.push(`## Debug Cycle ${cycleNumber}`);
  lines.push("");
  lines.push(`**Cycle:** ${cycleNumber}/${cycleResult.maxCycles}`);
  lines.push(`**Findings targeted:** ${cycleResult.findingsTargeted}`);
  lines.push(
    `**Fix plans:** ${cycleResult.fixPlans.length}`,
  );

  // Fix plan subsections
  for (const plan of cycleResult.fixPlans) {
    lines.push("");
    lines.push(`### Fix Plan: ${plan.description}`);
    lines.push("");
    lines.push(
      `**Files:** ${plan.files.map((f) => `\`${f}\``).join(", ")}`,
    );
    lines.push("**Findings addressed:**");
    for (const findingId of plan.findingsAddressed) {
      lines.push(`- ${findingId}`);
    }
    lines.push("");
    lines.push(`**Result:** ${plan.result}`);
    if (plan.commitHash) {
      lines.push(
        `**Commit:** \`${plan.commitHash}\`${plan.commitMessage ? ` -- ${plan.commitMessage}` : ""}`,
      );
    }
  }

  // Re-verify results
  lines.push("");
  lines.push("### Re-Verify Results");
  lines.push("");
  lines.push(`**Files re-verified:** ${cycleResult.reVerify.filesVerified}`);
  lines.push(`**New issues:** ${cycleResult.reVerify.newIssues}`);

  // Re-eval results
  lines.push("");
  lines.push("### Re-Eval Results");
  lines.push("");
  lines.push(
    `**Findings re-evaluated:** ${cycleResult.reEval.findingsEvaluated}`,
  );
  lines.push(`**Resolved:** ${cycleResult.reEval.resolved}`);
  lines.push(`**Remaining:** ${cycleResult.reEval.remaining}`);
  lines.push(`**New (from fix):** ${cycleResult.reEval.newFromFix}`);

  const section = lines.join("\n");
  fs.appendFileSync(reportPath, "\n\n" + section, "utf-8");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Map criterion key to display name.
 */
function formatCriterionName(criterion: EvalCriterion): string {
  return CRITERION_DISPLAY_NAMES[criterion] ?? criterion;
}

/**
 * Format duration in milliseconds to seconds string.
 * Same pattern as report-writer.ts.
 */
function formatDuration(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}
