// ---------------------------------------------------------------------------
// Static Verify Agent: convention compliance, blast radius diff, code review
// ---------------------------------------------------------------------------
// Runs as the first agent in the verification pipeline (per D-17).
// Produces convention violations with golden file references, integrates
// blast radius diff from Plan 01, and builds a code review prompt for
// LLM sub-agent dispatch.
//
// Follows the Options + Result + async function agent pattern (D-20).
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync, execSync } from "node:child_process";
import type {
  StaticVerifyOptions,
  StaticVerifyResult,
  ConventionViolation,
  ReviewFinding,
  VerifyCallbacks,
} from "./types.js";
import { computeBlastRadiusDiff } from "./blast-radius-diff.js";
import { getCodescopePath } from "../utils/paths.js";

// ---------------------------------------------------------------------------
// Convention parsing (reimplemented from src/tools/verify.ts patterns,
// not imported to avoid coupling per Phase 4 decision)
// ---------------------------------------------------------------------------

interface EnforcedConvention {
  name: string;
  rule: string;
}

/**
 * Parses enforced conventions from conventions-enforced.md.
 * Same format as src/tools/verify.ts: scans for **Convention:** and **Rule:** lines.
 */
export function parseEnforcedConventions(content: string): EnforcedConvention[] {
  const conventions: EnforcedConvention[] = [];
  const lines = content.split("\n");

  let currentName = "";
  let currentRule = "";

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("**Convention:**")) {
      // Save previous convention if we have one
      if (currentName && currentRule) {
        conventions.push({ name: currentName, rule: currentRule });
      }
      currentName = trimmed.replace("**Convention:**", "").trim();
      currentRule = "";
    } else if (trimmed.startsWith("**Rule:**")) {
      currentRule = trimmed.replace("**Rule:**", "").trim();
    }
  }

  // Save last convention
  if (currentName && currentRule) {
    conventions.push({ name: currentName, rule: currentRule });
  }

  return conventions;
}

// ---------------------------------------------------------------------------
// ast-grep scanning (reimplemented from src/tools/verify.ts lines 112-147)
// ---------------------------------------------------------------------------

interface AstGrepMatch {
  text: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  file: string;
  ruleId?: string;
}

/**
 * Scan specific files against an ast-grep rule.
 * Handles non-zero exit code (ast-grep returns 1 on no matches)
 * by catching error and parsing stdout from error object.
 */
export function scanFilesAgainstRule(
  ruleFile: string,
  files: string[],
): Array<{ file: string; line: number; text: string }> {
  const allMatches: Array<{ file: string; line: number; text: string }> = [];

  for (const filePath of files) {
    if (!fs.existsSync(filePath)) continue;

    try {
      const output = execFileSync(
        "sg", ["scan", "--rule", ruleFile, "--json", filePath],
        {
          encoding: "utf-8",
          maxBuffer: 50 * 1024 * 1024,
          stdio: ["pipe", "pipe", "pipe"],
        },
      );

      if (output && output.trim().length > 0) {
        const parsed = JSON.parse(output) as AstGrepMatch[];
        if (Array.isArray(parsed)) {
          for (const m of parsed) {
            allMatches.push({
              file: m.file,
              line: m.range.start.line + 1, // 0-based to 1-based
              text: m.text,
            });
          }
        }
      }
    } catch (err: unknown) {
      // ast-grep returns non-zero exit code when no matches found
      // Parse stdout from error object
      if (err && typeof err === "object" && "stdout" in err) {
        const stdout = (err as { stdout: string }).stdout;
        if (stdout && stdout.trim().length > 0) {
          try {
            const parsed = JSON.parse(stdout) as AstGrepMatch[];
            if (Array.isArray(parsed)) {
              for (const m of parsed) {
                allMatches.push({
                  file: m.file,
                  line: m.range.start.line + 1, // 0-based to 1-based
                  text: m.text,
                });
              }
            }
          } catch {
            // Not valid JSON — ignore
          }
        }
      }
    }
  }

  return allMatches;
}

// ---------------------------------------------------------------------------
// Adoption & golden file parsing
// ---------------------------------------------------------------------------

/**
 * Parse adoption percentage from conventions.md for a given convention name.
 * Scans for the convention name heading, then finds the Adoption row value.
 */
export function parseAdoptionFromConventions(
  conventionName: string,
  conventionsContent: string,
): number {
  const lines = conventionsContent.split("\n");
  let inConvention = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Match convention heading (### Convention Name)
    if (trimmed.startsWith("###") && trimmed.includes(conventionName)) {
      inConvention = true;
      continue;
    }

    // If we hit another heading, stop
    if (inConvention && trimmed.startsWith("###")) {
      break;
    }

    // Look for Adoption row in the table
    if (inConvention && trimmed.includes("Adoption")) {
      const match = trimmed.match(/(\d+)%/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }
  }

  return 0;
}

/**
 * Parse golden file reference from golden-files.md.
 * Returns the top golden file path (first entry), or null if none.
 *
 * Golden files format:
 *   1. `src/utils/helpers.ts` -- 5/7 conventions followed (71%)
 */
export function parseGoldenFileRef(
  _conventionName: string,
  goldenFilesContent: string,
): string | null {
  const lines = goldenFilesContent.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    // Match numbered golden file entries: 1. `path/to/file.ts` -- ...
    const match = trimmed.match(/^\d+\.\s+`([^`]+)`/);
    if (match) {
      return match[1];
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run static verification: convention compliance, blast radius diff, code review.
 *
 * @param options - Static verify configuration
 * @param callbacks - LLM sub-agent dispatch callbacks
 * @returns StaticVerifyResult with all three sections and timing
 */
export async function runStaticVerify(
  options: StaticVerifyOptions,
  callbacks: VerifyCallbacks,
): Promise<StaticVerifyResult> {
  const { projectRoot, changedFiles, planPath, scopeContractPath } = options;
  const csPath = getCodescopePath(projectRoot);

  // ---- Step 1: Convention compliance (timed) ----
  const conventionStart = Date.now();
  const conventionViolations: ConventionViolation[] = [];

  const enforcedPath = path.join(csPath, "conventions-enforced.md");
  let enforcedContent = "";

  if (fs.existsSync(enforcedPath)) {
    enforcedContent = fs.readFileSync(enforcedPath, "utf-8").trim();
  }

  if (enforcedContent) {
    const enforcedConventions = parseEnforcedConventions(enforcedContent);

    // Read conventions.md for adoption percentages
    let conventionsContent = "";
    const conventionsPath = path.join(csPath, "conventions.md");
    try {
      conventionsContent = fs.readFileSync(conventionsPath, "utf-8");
    } catch {
      // conventions.md may not exist
    }

    // Read golden-files.md for golden file references
    let goldenFilesContent = "";
    const goldenFilesPath = path.join(csPath, "golden-files.md");
    try {
      goldenFilesContent = fs.readFileSync(goldenFilesPath, "utf-8");
    } catch {
      // golden-files.md may not exist
    }

    const rulesDir = path.join(csPath, "rules");

    for (const convention of enforcedConventions) {
      // Try to find the rule file in typescript or python directories
      const tsRulePath = path.join(rulesDir, "typescript", `${convention.rule}.yml`);
      const pyRulePath = path.join(rulesDir, "python", `${convention.rule}.yml`);

      let rulePath: string | null = null;
      if (fs.existsSync(tsRulePath)) {
        rulePath = tsRulePath;
      } else if (fs.existsSync(pyRulePath)) {
        rulePath = pyRulePath;
      }

      if (!rulePath) continue;

      // Scan changed files against this rule
      const matches = scanFilesAgainstRule(rulePath, changedFiles);

      // Parse adoption and golden file for this convention
      const adoption = parseAdoptionFromConventions(convention.name, conventionsContent);
      const goldenFile = parseGoldenFileRef(convention.name, goldenFilesContent);

      for (const match of matches) {
        conventionViolations.push({
          file: match.file,
          line: match.line,
          convention: convention.name,
          adoption,
          goldenFile,
          message: `Violates enforced convention: ${convention.name}`,
          severity: "WARN", // Always WARN per D-02
        });
      }
    }
  }

  callbacks.onProgress("Convention compliance check complete");
  const convention_ms = Date.now() - conventionStart;

  // ---- Step 2: Blast radius diff (timed) ----
  const blastRadiusStart = Date.now();
  const blastRadiusDiff = computeBlastRadiusDiff(
    projectRoot,
    planPath,
    scopeContractPath,
    changedFiles,
  );
  callbacks.onProgress("Blast radius diff complete");
  const blastRadius_ms = Date.now() - blastRadiusStart;

  // ---- Step 3: Code review (timed) ----
  const codeReviewStart = Date.now();
  let codeReview: ReviewFinding[] = [];

  // Build code review prompt
  const prompt = buildCodeReviewPrompt(
    projectRoot,
    changedFiles,
    scopeContractPath,
    enforcedContent,
    csPath,
  );

  // Dispatch to review agent
  try {
    const reviewResponse = await callbacks.dispatchReviewAgent(prompt);
    codeReview = parseReviewFindings(reviewResponse);
  } catch {
    // On dispatch failure, return empty findings
    codeReview = [];
  }

  callbacks.onProgress("Code review complete");
  const codeReview_ms = Date.now() - codeReviewStart;

  return {
    conventionViolations,
    blastRadiusDiff,
    codeReview,
    timing: {
      convention_ms,
      blastRadius_ms,
      codeReview_ms,
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build code review prompt with git diff, scope contract, conventions, and
 * golden file excerpts per D-23/D-24.
 */
function buildCodeReviewPrompt(
  projectRoot: string,
  changedFiles: string[],
  scopeContractPath: string,
  enforcedConventionsContent: string,
  csPath: string,
): string {
  const sections: string[] = [];

  // 1. Git diff of changed files
  let gitDiff = "";
  try {
    gitDiff = execSync(
      `git diff HEAD -- ${changedFiles.join(" ")}`,
      { cwd: projectRoot, encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 },
    );
  } catch {
    gitDiff = "(git diff unavailable)";
  }
  sections.push("## Git Diff\n\n```\n" + gitDiff + "\n```");

  // 2. Scope contract content
  let scopeContent = "";
  try {
    scopeContent = fs.readFileSync(scopeContractPath, "utf-8");
  } catch {
    scopeContent = "(scope contract unavailable)";
  }
  sections.push("## Scope Contract\n\n" + scopeContent);

  // 3. Enforced conventions
  sections.push("## Enforced Conventions\n\n" + (enforcedConventionsContent || "(none)"));

  // 4. Golden file excerpts (first 50 lines of each golden file)
  let goldenFilesContent = "";
  try {
    goldenFilesContent = fs.readFileSync(path.join(csPath, "golden-files.md"), "utf-8");
  } catch {
    // No golden files available
  }

  if (goldenFilesContent) {
    const goldenExcerpts: string[] = [];
    const lines = goldenFilesContent.split("\n");
    for (const line of lines) {
      const match = line.trim().match(/^\d+\.\s+`([^`]+)`/);
      if (match) {
        const goldenPath = path.join(projectRoot, match[1]);
        try {
          const content = fs.readFileSync(goldenPath, "utf-8");
          const first50 = content.split("\n").slice(0, 50).join("\n");
          goldenExcerpts.push(`### ${match[1]}\n\n\`\`\`\n${first50}\n\`\`\``);
        } catch {
          // Golden file not readable — skip
        }
      }
    }
    if (goldenExcerpts.length > 0) {
      sections.push("## Golden File Excerpts\n\n" + goldenExcerpts.join("\n\n"));
    }
  }

  // 5. Instructions
  sections.push(
    "## Instructions\n\n" +
    "Review the diff against intent (scope contract) and quality (conventions). " +
    "Produce findings in JSON format: [{file, line, description, severity}]. " +
    "Soft cap: 10 findings. If more exist, note the count. " +
    "Severity: WARN for quality issues, INFO for suggestions.",
  );

  return sections.join("\n\n");
}

/**
 * Parse review agent response into ReviewFinding[].
 * Gracefully handles invalid JSON by returning empty array.
 */
function parseReviewFindings(response: string): ReviewFinding[] {
  try {
    // Try to extract JSON array from the response
    // The response may contain markdown or other text around the JSON
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as ReviewFinding[];
    if (!Array.isArray(parsed)) return [];

    // Validate each finding has required fields
    return parsed.filter(
      (f) =>
        typeof f.file === "string" &&
        typeof f.line === "number" &&
        typeof f.description === "string" &&
        typeof f.severity === "string",
    );
  } catch {
    return [];
  }
}
