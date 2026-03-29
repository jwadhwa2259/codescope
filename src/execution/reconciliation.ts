// ---------------------------------------------------------------------------
// Reconciliation: plan-vs-actual file set comparison and report generation
// ---------------------------------------------------------------------------
// Per Phase 13 D-07, D-08, D-09, D-10.
// Computes set differences between planned and actual file changes.
// Generates standalone markdown report per execution.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import type { AgentAssignment } from "../orient/types.js";
import type { AgentResult } from "./types.js";

/**
 * Reconciliation data comparing planned vs actual file changes.
 */
export interface ReconciliationData {
  baselineCommit: string;
  plannedCount: number;
  actualCount: number;
  unexpected: string[];
  missed: string[];
  perAgent: Array<{
    name: string;
    planned: string[];
    actual: string[];
    unexpected: string[];
    missed: string[];
  }>;
}

/**
 * Get git HEAD commit hash to use as baseline reference.
 *
 * @param projectRoot - Root directory of the project
 * @returns HEAD commit hash or "unknown" on failure
 */
export function getGitHead(projectRoot: string): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch {
    return "unknown";
  }
}

/**
 * Get files changed between a baseline commit and current state.
 *
 * @param baselineCommit - Commit hash to compare against
 * @param projectRoot - Root directory of the project
 * @returns Array of changed file paths relative to project root
 */
export function getChangedFilesSince(
  baselineCommit: string,
  projectRoot: string,
): string[] {
  try {
    const output = execFileSync(
      "git",
      ["diff", "--name-only", "--relative", baselineCommit],
      { cwd: projectRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    return output
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  } catch {
    return [];
  }
}

/**
 * Compute reconciliation data: planned vs actual file set differences.
 * Per D-09: set difference to identify unexpected and missed files.
 *
 * @param agents - Agent assignments from the execution plan
 * @param agentResults - Results from actual agent execution
 * @param actualChanges - Files actually changed (from git diff)
 * @returns Reconciliation data with per-agent breakdown
 */
export function computeReconciliation(
  agents: AgentAssignment[],
  agentResults: AgentResult[],
  actualChanges: string[],
): ReconciliationData {
  const planned = new Set(agents.flatMap((a) => a.exclusiveWriteFiles));
  const actual = new Set(actualChanges);

  const unexpected = [...actual].filter((f) => !planned.has(f));
  const missed = [...planned].filter((f) => !actual.has(f));

  // Per-agent breakdown
  const resultMap = new Map(agentResults.map((r) => [r.name, r]));
  const perAgent = agents.map((a) => {
    const result = resultMap.get(a.name);
    const agentActual = result?.filesChanged ?? [];
    const agentPlanned = new Set(a.exclusiveWriteFiles);
    const agentActualSet = new Set(agentActual);
    return {
      name: a.name,
      planned: a.exclusiveWriteFiles,
      actual: agentActual,
      unexpected: agentActual.filter((f) => !agentPlanned.has(f)),
      missed: a.exclusiveWriteFiles.filter((f) => !agentActualSet.has(f)),
    };
  });

  return {
    baselineCommit: "",
    plannedCount: planned.size,
    actualCount: actual.size,
    unexpected,
    missed,
    perAgent,
  };
}

/**
 * Generate a markdown reconciliation report and write it to disk.
 * Per D-08, D-10: standalone markdown in execution directory with
 * Summary, Unexpected Modifications, Missed Files, Per-Agent Breakdown.
 *
 * @param data - Reconciliation data to render
 * @param executionDir - Directory to write the report to
 * @returns Absolute path to the generated reconciliation.md file
 */
export function generateReconciliationReport(
  data: ReconciliationData,
  executionDir: string,
): string {
  const reportPath = path.join(executionDir, "reconciliation.md");
  const lines: string[] = [];

  lines.push("# Reconciliation Report");
  lines.push("");

  // Summary section
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Baseline commit:** ${data.baselineCommit}`);
  lines.push(`- **Planned files:** ${data.plannedCount}`);
  lines.push(`- **Actual files changed:** ${data.actualCount}`);
  lines.push(`- **Unexpected modifications:** ${data.unexpected.length}`);
  lines.push(`- **Missed files:** ${data.missed.length}`);
  lines.push("");

  // Unexpected modifications table
  lines.push("## Unexpected Modifications");
  lines.push("");
  if (data.unexpected.length === 0) {
    lines.push("None -- all changes were within planned scope.");
  } else {
    lines.push("| File | Status |");
    lines.push("|------|--------|");
    for (const f of data.unexpected) {
      lines.push(`| ${f} | unexpected |`);
    }
  }
  lines.push("");

  // Missed files table
  lines.push("## Missed Files");
  lines.push("");
  if (data.missed.length === 0) {
    lines.push("None -- all planned files were modified.");
  } else {
    lines.push("| File | Status |");
    lines.push("|------|--------|");
    for (const f of data.missed) {
      lines.push(`| ${f} | missed |`);
    }
  }
  lines.push("");

  // Per-agent breakdown
  lines.push("## Per-Agent Breakdown");
  lines.push("");
  for (const agent of data.perAgent) {
    lines.push(`### ${agent.name}`);
    lines.push("");
    lines.push(
      `- **Planned:** ${agent.planned.join(", ") || "none"}`,
    );
    lines.push(
      `- **Actual:** ${agent.actual.join(", ") || "none"}`,
    );
    if (agent.unexpected.length > 0) {
      lines.push(`- **Unexpected:** ${agent.unexpected.join(", ")}`);
    }
    if (agent.missed.length > 0) {
      lines.push(`- **Missed:** ${agent.missed.join(", ")}`);
    }
    lines.push("");
  }

  fs.writeFileSync(reportPath, lines.join("\n"), "utf-8");
  return reportPath;
}
