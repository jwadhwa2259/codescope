// ---------------------------------------------------------------------------
// Ignore Filter: load, filter, and append ignore/TODO patterns
// ---------------------------------------------------------------------------
// Per D-10: ignore patterns recorded in learnings.md as IGNORE entries.
// Eval reads learnings.md on future runs to pre-filter matching patterns.
//
// Per D-08: "Defer to TODO" appends to learnings.md with status TODO and
// file:line context.
// ---------------------------------------------------------------------------

import * as fs from "node:fs";
import * as path from "node:path";
import { getCodescopePath } from "../utils/paths.js";
import type { EvalFinding, EvalCriterion, IgnorePattern } from "./types.js";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load ignore patterns from learnings.md.
 * Reads the `## Ignore Patterns` section and parses the JSON code block.
 *
 * @param projectRoot - Project root directory
 * @returns Array of IgnorePattern entries, empty if none found
 */
export function loadIgnorePatterns(projectRoot: string): IgnorePattern[] {
  const csPath = getCodescopePath(projectRoot);
  const learningsPath = path.join(csPath, "learnings.md");

  if (!fs.existsSync(learningsPath)) {
    return [];
  }

  const content = fs.readFileSync(learningsPath, "utf-8");

  // Find ## Ignore Patterns section
  const sectionMatch = content.match(
    /## Ignore Patterns\s*\n([\s\S]*?)(?=\n## |\n# |$)/,
  );
  if (!sectionMatch) {
    return [];
  }

  // Parse JSON code block within the section
  const jsonMatch = sectionMatch[1].match(/```json\s*\n([\s\S]*?)\n```/);
  if (!jsonMatch) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[1]);
    if (Array.isArray(parsed)) {
      return parsed as IgnorePattern[];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Filter findings against ignore patterns.
 * All 3 conditions must match to filter out a finding:
 * - criterion exact match
 * - pattern substring in description (case-insensitive)
 * - scope glob match on file
 *
 * @param findings - Findings to filter
 * @param patterns - Ignore patterns to match against
 * @returns Findings that don't match any pattern
 */
export function filterFindings(
  findings: EvalFinding[],
  patterns: IgnorePattern[],
): EvalFinding[] {
  if (patterns.length === 0) return findings;

  return findings.filter((finding) => {
    for (const pattern of patterns) {
      const criterionMatch = pattern.criterion === finding.criterion;
      const patternMatch = finding.description
        .toLowerCase()
        .includes(pattern.pattern.toLowerCase());
      const scopeMatch = simpleGlobMatch(pattern.scope, finding.file);

      if (criterionMatch && patternMatch && scopeMatch) {
        return false; // Filter out
      }
    }
    return true; // Keep
  });
}

/**
 * Append a structured IGNORE entry to learnings.md.
 * Also updates the JSON code block under ## Ignore Patterns section.
 * Matches 06-UI-SPEC.md IGNORE format.
 *
 * @param projectRoot - Project root directory
 * @param finding - The finding to record as ignored
 * @param taskSlug - The task slug for context
 */
export function appendIgnoreEntry(
  projectRoot: string,
  finding: EvalFinding,
  taskSlug: string,
): void {
  const csPath = getCodescopePath(projectRoot);
  const learningsPath = path.join(csPath, "learnings.md");

  // Build the structured IGNORE markdown entry
  const timestamp = new Date().toISOString();
  const entry = [
    "",
    `### IGNORE: ${finding.description}`,
    "",
    "- **Status:** IGNORE",
    `- **Pattern:** \`${finding.description}\``,
    "- **Scope:** `*` (default to all files)",
    `- **Criterion:** \`${finding.criterion}\``,
    `- **Recorded:** ${timestamp}`,
    `- **Context:** Ignored at eval gate for task \`${taskSlug}\``,
    "",
  ].join("\n");

  fs.appendFileSync(learningsPath, entry, "utf-8");

  // Update the JSON code block under ## Ignore Patterns section
  updateIgnorePatternsJson(learningsPath, {
    pattern: finding.description,
    scope: "*",
    criterion: finding.criterion,
    created: timestamp,
    reason: `Ignored at eval gate for task ${taskSlug}`,
  });
}

/**
 * Append a structured TODO entry to learnings.md.
 * Matches 06-UI-SPEC.md TODO deferral format.
 *
 * @param projectRoot - Project root directory
 * @param finding - The finding to record as TODO
 * @param taskSlug - The task slug for context
 */
export function appendTodoEntry(
  projectRoot: string,
  finding: EvalFinding,
  taskSlug: string,
): void {
  const csPath = getCodescopePath(projectRoot);
  const learningsPath = path.join(csPath, "learnings.md");

  const timestamp = new Date().toISOString();
  const entry = [
    "",
    `### TODO: ${finding.description}`,
    "",
    "- **Status:** TODO",
    `- **File:** \`${finding.file}:${finding.line}\``,
    `- **Severity:** ${finding.severity}`,
    `- **Criterion:** \`${finding.criterion}\``,
    `- **Evidence:** ${finding.evidence}`,
    `- **Recorded:** ${timestamp}`,
    `- **Context:** Deferred at eval gate for task \`${taskSlug}\``,
    "",
  ].join("\n");

  fs.appendFileSync(learningsPath, entry, "utf-8");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Update or create the ## Ignore Patterns JSON code block.
 */
function updateIgnorePatternsJson(
  learningsPath: string,
  newPattern: IgnorePattern,
): void {
  let content = fs.readFileSync(learningsPath, "utf-8");

  // Find existing ## Ignore Patterns section with JSON block
  const sectionMatch = content.match(
    /(## Ignore Patterns\s*\n[\s\S]*?```json\s*\n)([\s\S]*?)(\n```)/,
  );

  if (sectionMatch) {
    // Parse existing patterns and add new one
    try {
      const existingPatterns = JSON.parse(sectionMatch[2]) as IgnorePattern[];
      existingPatterns.push(newPattern);
      const updatedJson = JSON.stringify(existingPatterns, null, 2);
      content = content.replace(
        sectionMatch[0],
        `${sectionMatch[1]}${updatedJson}${sectionMatch[3]}`,
      );
      fs.writeFileSync(learningsPath, content, "utf-8");
    } catch {
      // If JSON is malformed, create fresh
      appendIgnorePatternsSection(learningsPath, [newPattern]);
    }
  } else {
    // No section exists, create it
    appendIgnorePatternsSection(learningsPath, [newPattern]);
  }
}

/**
 * Append a new ## Ignore Patterns section with JSON code block.
 */
function appendIgnorePatternsSection(
  learningsPath: string,
  patterns: IgnorePattern[],
): void {
  const section = [
    "",
    "## Ignore Patterns",
    "",
    "```json",
    JSON.stringify(patterns, null, 2),
    "```",
    "",
  ].join("\n");

  fs.appendFileSync(learningsPath, section, "utf-8");
}

/**
 * Simple glob matching for scope patterns.
 * Supports: * (any segment), ** (any path), exact match.
 */
function simpleGlobMatch(pattern: string, filePath: string): boolean {
  if (pattern === "*") return true;
  if (pattern === "**") return true;

  // Convert glob to regex
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "<<GLOBSTAR>>")
    .replace(/\*/g, "[^/]*")
    .replace(/<<GLOBSTAR>>/g, ".*");

  const regex = new RegExp(`^${escaped}$`);
  return regex.test(filePath);
}
