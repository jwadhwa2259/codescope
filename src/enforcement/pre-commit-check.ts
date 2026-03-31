// ---------------------------------------------------------------------------
// Pre-Commit Convention Check
// ---------------------------------------------------------------------------
// Runs `sg scan` against staged files using only VERIFIED convention rules.
// Formats compact terminal output and maps severity config to exit codes.
//
// This module is designed to run standalone in a pre-commit hook context.
// It uses lightweight inline config reading (no heavy imports) and produces
// formatted terminal output with ANSI colors.
// ---------------------------------------------------------------------------

import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { EnforcementSeverity, EnforcementFinding, EnforcementResult } from "./types.js";
import { getVerifiedRuleIds, RULE_ID_TO_NAME } from "./rule-filter.js";

// ---------------------------------------------------------------------------
// Internal: ast-grep JSON match shape
// ---------------------------------------------------------------------------

interface SgMatch {
  file: string;
  range: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  text: string;
  ruleId?: string;
}

// ---------------------------------------------------------------------------
// Internal: sg scan runner
// ---------------------------------------------------------------------------

/**
 * Check if the sg (ast-grep) CLI is available.
 */
function isSgAvailable(): boolean {
  try {
    execFileSync("sg", ["--version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve the rule file path for a given rule ID.
 * Checks TypeScript rules first, then Python rules.
 *
 * @returns Absolute path to the rule .yml file, or null if not found
 */
function resolveRulePath(ruleId: string, projectRoot: string): string | null {
  // Check TypeScript rules
  const tsPath = join(projectRoot, "src", "conventions", "rules", "typescript", ruleId + ".yml");
  if (existsSync(tsPath)) return tsPath;

  // Check Python rules
  const pyPath = join(projectRoot, "src", "conventions", "rules", "python", ruleId + ".yml");
  if (existsSync(pyPath)) return pyPath;

  // Check framework rules (fastify, express, h3)
  const frameworkDirs = ["fastify", "express", "h3"];
  for (const fw of frameworkDirs) {
    const fwPath = join(projectRoot, "src", "conventions", "rules", "frameworks", fw, ruleId + ".yml");
    if (existsSync(fwPath)) return fwPath;
  }

  return null;
}

/**
 * Run sg scan for a single rule against staged files.
 * Returns parsed findings.
 */
function scanRule(
  rulePath: string,
  ruleId: string,
  stagedFiles: string[],
): EnforcementFinding[] {
  const conventionName = RULE_ID_TO_NAME.get(ruleId) ?? ruleId;

  try {
    const output = execFileSync(
      "sg",
      ["scan", "--rule", rulePath, "--json", ...stagedFiles],
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    );

    // sg returns exit 0 with empty output when no matches
    if (!output || output.trim().length === 0) {
      return [];
    }

    return parseMatches(output, ruleId, conventionName);
  } catch (err: unknown) {
    // ast-grep returns exit code 1 when matches are found -- parse stdout
    if (err && typeof err === "object" && "stdout" in err) {
      const stdout = (err as { stdout: string }).stdout;
      if (stdout && stdout.trim().length > 0) {
        return parseMatches(stdout, ruleId, conventionName);
      }
    }
    return [];
  }
}

/**
 * Parse sg scan JSON output into EnforcementFinding[].
 */
function parseMatches(
  jsonOutput: string,
  ruleId: string,
  conventionName: string,
): EnforcementFinding[] {
  try {
    const matches: SgMatch[] = JSON.parse(jsonOutput);
    if (!Array.isArray(matches)) return [];

    return matches.map((m) => ({
      ruleId,
      conventionName,
      file: m.file,
      line: m.range.start.line + 1, // Convert 0-based to 1-based
      message: m.text,
    }));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Internal: Output formatting
// ---------------------------------------------------------------------------

/**
 * Format findings into compact terminal output per D-08/D-09.
 */
function formatOutput(
  findings: EnforcementFinding[],
  severity: EnforcementSeverity,
  conventionCount: number,
  fileCount: number,
): string {
  const lines: string[] = [];

  // Severity prefix with ANSI colors
  let prefix: string;
  switch (severity) {
    case "suggest-only":
      prefix = "[INFO]";
      break;
    case "warn":
      prefix = "\x1b[33m[WARN]\x1b[0m";
      break;
    case "block":
      prefix = "\x1b[31m[BLOCK]\x1b[0m";
      break;
  }

  if (findings.length > 0) {
    lines.push(`${prefix} Convention enforcement findings:`);
    lines.push("");

    // Each finding: compact format
    for (const finding of findings) {
      lines.push(`  ${finding.file}:${finding.line}  ${finding.conventionName}`);
    }

    lines.push("");
  }

  const summary = `Checked ${conventionCount} convention${conventionCount !== 1 ? "s" : ""} against ${fileCount} staged file${fileCount !== 1 ? "s" : ""}: ${findings.length} finding(s)`;
  lines.push(`${prefix} ${summary}`);

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run convention enforcement against staged files.
 *
 * @param stagedFiles - Array of file paths (relative to project root) to check
 * @param projectRoot - Absolute path to project root
 * @param options - Optional severity override; if not provided, reads from config.yml
 * @returns EnforcementResult with findings, exit code, and formatted output
 */
export function runPreCommitCheck(
  stagedFiles: string[],
  projectRoot: string,
  options?: { severity?: EnforcementSeverity },
): EnforcementResult {
  // Determine severity
  const severity: EnforcementSeverity = options?.severity ?? loadSeverityFromConfig(projectRoot);

  // Load learnings
  const learningsPath = join(projectRoot, ".claude", "codescope", "learnings.md");
  if (!existsSync(learningsPath)) {
    return {
      exitCode: 0,
      findings: [],
      summary: "No learnings found -- skipping enforcement.",
      severity,
      output: "No learnings found -- skipping enforcement.",
    };
  }

  const learningsContent = readFileSync(learningsPath, "utf-8");

  // Get verified rule IDs
  const ruleIds = getVerifiedRuleIds(learningsContent);
  if (ruleIds.length === 0) {
    return {
      exitCode: 0,
      findings: [],
      summary: "No VERIFIED conventions -- skipping enforcement.",
      severity,
      output: "No VERIFIED conventions -- skipping enforcement.",
    };
  }

  // Resolve rule file paths, skipping rules without files on disk
  const rulePaths: Array<{ ruleId: string; path: string }> = [];
  for (const ruleId of ruleIds) {
    const rulePath = resolveRulePath(ruleId, projectRoot);
    if (rulePath) {
      rulePaths.push({ ruleId, path: rulePath });
    }
  }

  if (rulePaths.length === 0) {
    const summary = `Checked 0 conventions against ${stagedFiles.length} staged file${stagedFiles.length !== 1 ? "s" : ""}: 0 finding(s)`;
    return {
      exitCode: 0,
      findings: [],
      summary,
      severity,
      output: summary,
    };
  }

  // Check sg availability
  if (!isSgAvailable()) {
    return {
      exitCode: 0,
      findings: [],
      summary: "ast-grep (sg) not found -- skipping convention enforcement.",
      severity,
      output: "[WARN] ast-grep (sg) not found -- skipping convention enforcement.",
    };
  }

  // Run sg scan for each rule
  const allFindings: EnforcementFinding[] = [];
  for (const rule of rulePaths) {
    const findings = scanRule(rule.path, rule.ruleId, stagedFiles);
    allFindings.push(...findings);
  }

  // Format output
  const output = formatOutput(allFindings, severity, rulePaths.length, stagedFiles.length);

  // Build summary
  const summary = `Checked ${rulePaths.length} convention${rulePaths.length !== 1 ? "s" : ""} against ${stagedFiles.length} staged file${stagedFiles.length !== 1 ? "s" : ""}: ${allFindings.length} finding(s)`;

  // Map severity to exit code per D-07
  let exitCode = 0;
  if (severity === "block" && allFindings.length > 0) {
    exitCode = 2;
  }

  return {
    exitCode,
    findings: allFindings,
    summary,
    severity,
    output,
  };
}

// ---------------------------------------------------------------------------
// Internal: Config reading
// ---------------------------------------------------------------------------

/**
 * Lightweight config severity reading. Does not import from src/config/loader.ts
 * to keep the enforcement module free of heavy transitive dependencies.
 */
function loadSeverityFromConfig(projectRoot: string): EnforcementSeverity {
  try {
    const configPath = join(projectRoot, ".claude", "codescope", "config.yml");
    if (!existsSync(configPath)) return "suggest-only";

    const raw = readFileSync(configPath, "utf-8");
    // Simple regex extraction -- avoids js-yaml dependency
    const match = raw.match(/strictness:\s*["']?(suggest-only|warn|block)["']?/);
    if (match) {
      return match[1] as EnforcementSeverity;
    }
    return "suggest-only";
  } catch {
    return "suggest-only";
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMainModule =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url &&
  (process.argv[1] === new URL(import.meta.url).pathname ||
    process.argv[1].endsWith("pre-commit-check.js") ||
    process.argv[1].endsWith("pre-commit-check.mjs"));

if (isMainModule) {
  const stagedFiles = process.argv.slice(2);
  const projectRoot = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const result = runPreCommitCheck(stagedFiles, projectRoot);
  if (result.output) process.stdout.write(result.output + "\n");
  process.exit(result.exitCode);
}
