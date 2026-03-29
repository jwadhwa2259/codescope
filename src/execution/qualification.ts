// ---------------------------------------------------------------------------
// Qualification Gate: per-task verification of file changes and conventions
// ---------------------------------------------------------------------------
// Per Phase 13 D-01, D-02, D-03.
// Verifies that agent actually modified expected files and checks for
// convention violations on changed files via ast-grep (sg).
// ---------------------------------------------------------------------------

import { execFileSync } from "node:child_process";

/**
 * Result of a qualification check on an agent's changes.
 */
export interface QualificationResult {
  qualified: boolean;
  issues: string[];
  actualFiles: string[];
  linesAdded: number;
  linesRemoved: number;
}

/**
 * Run qualification checks on an agent's changes.
 * Per D-03: two checks -- (1) verify at least one expected file was modified,
 * (2) run convention scan on changed files via sg.
 *
 * Graceful degradation: if git fails, returns qualified=false with error.
 * If sg is unavailable, convention check is skipped.
 *
 * @param expectedFiles - Files the agent was expected to modify
 * @param projectRoot - Root directory of the project (for git/sg commands)
 * @returns Qualification result with issues, actual files, and line stats
 */
export async function runQualification(
  expectedFiles: string[],
  projectRoot: string,
): Promise<QualificationResult> {
  const issues: string[] = [];
  let actualFiles: string[] = [];
  let linesAdded = 0;
  let linesRemoved = 0;

  // Step 1: git diff --name-only to get actually changed files
  // Per D-03 check (1): verify at least one expected file was modified
  try {
    const diffOutput = execFileSync(
      "git",
      ["diff", "--name-only", "--relative", "HEAD"],
      { cwd: projectRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    actualFiles = diffOutput
      .trim()
      .split("\n")
      .filter((f) => f.length > 0);
  } catch {
    issues.push("git diff failed -- unable to verify file changes");
    return {
      qualified: false,
      issues,
      actualFiles: [],
      linesAdded: 0,
      linesRemoved: 0,
    };
  }

  // Check if any expected file appears in actual changes
  const actualSet = new Set(actualFiles);
  const expectedModified = expectedFiles.some((f) => actualSet.has(f));
  if (!expectedModified && expectedFiles.length > 0) {
    issues.push(
      `No expected files were modified. Expected: [${expectedFiles.join(", ")}], Actual: [${actualFiles.join(", ")}]`,
    );
  }

  // Parse line stats from git diff --stat
  try {
    const statOutput = execFileSync(
      "git",
      ["diff", "--stat", "--relative", "HEAD"],
      { cwd: projectRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
    );
    // Parse insertions and deletions from the summary line
    const insertMatch = statOutput.match(/(\d+)\s+insertion/);
    const deleteMatch = statOutput.match(/(\d+)\s+deletion/);
    if (insertMatch) linesAdded = parseInt(insertMatch[1], 10);
    if (deleteMatch) linesRemoved = parseInt(deleteMatch[1], 10);
  } catch {
    // Non-fatal: line counts are informational
  }

  // Step 2: Convention scan via sg (ast-grep) per D-03 check (2)
  // Check sg availability once, skip if not available
  let sgAvailable = false;
  try {
    execFileSync("sg", ["--version"], { stdio: "pipe" });
    sgAvailable = true;
  } catch {
    // sg not available -- skip convention check (graceful degradation)
  }

  if (sgAvailable && actualFiles.length > 0) {
    try {
      // Run sg scan on changed files -- use JSON output for parsing
      const sgOutput = execFileSync(
        "sg",
        ["scan", "--json", ...actualFiles],
        { cwd: projectRoot, encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] },
      );
      // Parse JSON output for violations
      if (sgOutput.trim().length > 0) {
        const violations = JSON.parse(sgOutput);
        if (Array.isArray(violations) && violations.length > 0) {
          for (const v of violations) {
            const file = v.file ?? "unknown";
            const rule = v.ruleId ?? v.rule ?? "unknown-rule";
            const msg = v.message ?? "convention violation";
            issues.push(`Convention violation in ${file}: [${rule}] ${msg}`);
          }
        }
      }
    } catch {
      // sg scan failure is non-fatal -- qualification proceeds with file-only check
    }
  }

  return {
    qualified: issues.length === 0,
    issues,
    actualFiles,
    linesAdded,
    linesRemoved,
  };
}
