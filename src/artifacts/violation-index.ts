/**
 * Builds the violation index from conventions and the knowledge graph.
 *
 * Identifies per-file HIGH-CONF convention deviations. For each HIGH-CONF
 * convention, files in the graph that do NOT appear in the convention's
 * evidence list get a violation entry -- but only if the file's language
 * matches the convention's language and the file's role is applicable
 * (test, config, and deprecated files are excluded).
 *
 * Returns a sparse ViolationIndex: files with no violations are omitted.
 * Per D-08, D-09, D-11.
 *
 * Note: VALID-02 (wrong type names) and VALID-03 (broken imports) are deferred.
 * The graph builder drops unresolved imports silently (shared-builder.ts),
 * so no failed-resolution data exists in the DB to check against.
 * Type references are not stored in the graph schema.
 * These checks require parser-level changes to capture failed resolutions
 * and type reference data, which is out of scope for the violation index builder.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";
import { parseDetectorConventions } from "../conventions/parser.js";
import { classifyFileRole } from "../classifier/file-role.js";
import { RULE_NAME_TO_ID } from "../conventions/rule-metadata.js";
import type { ViolationIndex, ViolationEntry } from "./types.js";

// ---------------------------------------------------------------------------
// Language inference helpers
// ---------------------------------------------------------------------------

/**
 * Infer the language a convention targets based on its evidence file extensions.
 */
function inferConventionLanguage(evidenceFiles: string[]): "typescript" | "python" | "unknown" {
  const pyCount = evidenceFiles.filter(f => f.endsWith(".py")).length;
  const tsCount = evidenceFiles.filter(f => /\.(ts|tsx|js|jsx)$/.test(f)).length;
  if (pyCount > 0 && tsCount === 0) return "python";
  if (tsCount > 0 && pyCount === 0) return "typescript";
  return "unknown";
}

/**
 * Check if a file's extension matches the convention's inferred language.
 */
function isFileLanguageMatch(filePath: string, convLang: "typescript" | "python" | "unknown"): boolean {
  if (convLang === "unknown") return true;
  if (convLang === "python") return filePath.endsWith(".py");
  return /\.(ts|tsx|js|jsx)$/.test(filePath);
}

/**
 * Check if a file is a noise file that should never be flagged for conventions.
 * Declaration files, JSON, YAML, etc. are not applicable.
 */
function isNoiseFile(filePath: string): boolean {
  return /\.(d\.ts|json|yml|yaml|md|txt|css|scss|html|svg|png|jpg|lock)$/.test(filePath);
}

// ---------------------------------------------------------------------------
// Rule ID resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a convention display name to its ast-grep rule ID.
 * Falls back to slugified name if no RULE_METADATA mapping exists
 * (e.g., for conventions detected by the LLM detector, not ast-grep rules).
 */
function resolveRuleId(displayName: string): string {
  const mapped = RULE_NAME_TO_ID.get(displayName);
  if (mapped) return mapped;
  // Fallback: slugify the display name (lowercase, spaces to dashes, strip non-alphanum)
  return displayName.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

/**
 * Build violation index from conventions and the knowledge graph.
 *
 * @param db - Open database connection with v2 schema
 * @param codescopeDir - Path to .claude/codescope/ directory
 * @returns ViolationIndex with per-file violation lists, sparse
 */
export function buildViolationIndex(
  db: DatabaseType,
  codescopeDir: string,
): ViolationIndex {
  const files: Record<string, ViolationEntry[]> = {};

  // Read and parse conventions
  const conventionsPath = path.join(codescopeDir, "conventions.md");
  if (!fs.existsSync(conventionsPath)) {
    return { generated: new Date().toISOString(), files };
  }

  const content = fs.readFileSync(conventionsPath, "utf-8");
  const allConventions = parseDetectorConventions(content);

  // Filter to HIGH-CONF only (per D-11)
  const highConfConventions = allConventions.filter(
    (c) => c.confidence === "HIGH-CONF",
  );

  if (highConfConventions.length === 0) {
    return { generated: new Date().toISOString(), files };
  }

  // Get all source file paths from the graph (file nodes only)
  const graphFiles = (
    db
      .prepare("SELECT DISTINCT file_path FROM nodes WHERE kind = 'file'")
      .all() as Array<{ file_path: string }>
  ).map((r) => r.file_path);

  // For each HIGH-CONF convention, find files that don't follow it
  for (const conv of highConfConventions) {
    const followingFiles = new Set(conv.files);
    const convLanguage = inferConventionLanguage(conv.files);

    // Files in the graph that are NOT in the convention's evidence
    for (const filePath of graphFiles) {
      if (followingFiles.has(filePath)) continue;

      // Noise filter: skip non-code files
      if (isNoiseFile(filePath)) continue;

      // Language filter: skip files that don't match convention's language
      if (!isFileLanguageMatch(filePath, convLanguage)) continue;

      // Role filter: skip test, config, and deprecated files
      const { role } = classifyFileRole(filePath);
      if (role === "test" || role === "config" || role === "deprecated") continue;

      // This file doesn't follow this HIGH-CONF convention
      const entry: ViolationEntry = {
        ruleId: resolveRuleId(conv.name),
        detected: "Convention not followed",
        expected: `${conv.name} (${conv.category}, ${conv.adoption_pct}% adoption)`,
        line: 0, // file-level violation
      };

      if (!files[filePath]) {
        files[filePath] = [];
      }
      files[filePath].push(entry);
    }
  }

  return {
    generated: new Date().toISOString(),
    files,
  };
}
